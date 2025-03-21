import QuadTree from '../utils/QuadTree.js';

/**
 * Manages data-level clustering with dynamic sizing and transitions
 */
class ClusterManager {
    constructor(options = {}) {
        this.options = {
            minZoom: options.minZoom || 10,
            maxZoom: options.maxZoom || 19,
            clusterRadius: options.clusterRadius || 80,
            transitionDuration: options.transitionDuration || 300,
            zoomThreshold: options.zoomThreshold || 16,
            minClusterSize: options.minClusterSize || 2,
            maxClusters: options.maxClusters || 100,
            ...options
        };

        // QuadTree for spatial indexing
        this.quadtree = new QuadTree({
            x: 0,
            y: 0,
            width: 1,
            height: 1
        });

        // Cluster state
        this.clusters = new Map();
        this.previousClusters = new Map();
        this.transitions = new Map();
        this.lastUpdate = 0;

        // Clustering metrics
        this.metrics = {
            points: 0,
            clusters: 0,
            maxClusterSize: 0,
            processingTime: 0
        };
    }

    /**
     * Calculate clusters for given points
     * @param {Array} points - Array of points to cluster
     * @param {number} zoom - Current zoom level
     * @param {Object} bounds - Viewport bounds
     * @returns {Object} Clustering result
     */
    calculateClusters(points, zoom, bounds) {
        const startTime = performance.now();
        
        // Store previous state for transitions
        this.previousClusters = new Map(this.clusters);
        this.clusters.clear();
        this.quadtree.clear();

        // Don't cluster at high zoom levels
        if (zoom >= this.options.zoomThreshold) {
            const result = this.processPointsWithoutClustering(points);
            this.updateMetrics(points.length, 0, startTime);
            return result;
        }

        // Add points to quadtree
        points.forEach(point => {
            const coords = QuadTree.latLngToXY(point.lat, point.lng);
            this.quadtree.insert({
                x: coords.x,
                y: coords.y,
                data: point
            });
        });

        // Calculate cluster radius based on zoom
        const radius = this.calculateClusterRadius(zoom);
        
        // Find clusters
        const clusters = this.findClusters(points, radius, bounds);
        
        // Calculate transitions
        this.updateTransitions(clusters);
        
        // Update metrics
        this.updateMetrics(points.length, clusters.size, startTime);
        
        return {
            clusters: Array.from(clusters.values()),
            transitions: Array.from(this.transitions.values()),
            metrics: this.metrics
        };
    }

    /**
     * Process points without clustering
     * @param {Array} points - Points to process
     * @returns {Object} Processing result
     */
    processPointsWithoutClustering(points) {
        const result = new Map();
        
        points.forEach(point => {
            result.set(point.id, {
                id: point.id,
                position: [point.lat, point.lng],
                points: [point],
                isCluster: false
            });
        });

        return {
            clusters: Array.from(result.values()),
            transitions: [],
            metrics: this.metrics
        };
    }

    /**
     * Find clusters in points
     * @param {Array} points - Points to cluster
     * @param {number} radius - Cluster radius
     * @param {Object} bounds - Viewport bounds
     * @returns {Map} Clusters
     */
    findClusters(points, radius, bounds) {
        const clusters = new Map();
        const processed = new Set();
        let clusterId = 0;

        // Process points in order of density
        const sortedPoints = this.sortByDensity(points, radius);
        
        for (const point of sortedPoints) {
            if (processed.has(point.id)) continue;

            const neighborPoints = this.findNeighbors(point, radius);
            if (neighborPoints.length >= this.options.minClusterSize) {
                // Create new cluster
                const cluster = this.createCluster(
                    `cluster_${clusterId++}`,
                    neighborPoints
                );
                clusters.set(cluster.id, cluster);
                
                // Mark points as processed
                neighborPoints.forEach(p => processed.add(p.id));
            } else {
                // Single point, not clustered
                clusters.set(point.id, {
                    id: point.id,
                    position: [point.lat, point.lng],
                    points: [point],
                    isCluster: false
                });
                processed.add(point.id);
            }
        }

        return clusters;
    }

    /**
     * Sort points by density
     * @param {Array} points - Points to sort
     * @param {number} radius - Search radius
     * @returns {Array} Sorted points
     */
    sortByDensity(points, radius) {
        const densities = new Map();
        
        points.forEach(point => {
            const neighbors = this.findNeighbors(point, radius);
            densities.set(point, neighbors.length);
        });

        return [...points].sort((a, b) => densities.get(b) - densities.get(a));
    }

    /**
     * Find neighbors within radius
     * @param {Object} point - Center point
     * @param {number} radius - Search radius
     * @returns {Array} Neighbor points
     */
    findNeighbors(point, radius) {
        const center = QuadTree.latLngToXY(point.lat, point.lng);
        
        // Convert radius from pixels to coordinate space
        const r = radius / 256 / Math.pow(2, this.options.maxZoom);
        
        const searchBounds = {
            x: center.x - r,
            y: center.y - r,
            width: r * 2,
            height: r * 2
        };

        return this.quadtree.query(searchBounds)
            .map(p => p.data)
            .filter(p => p.id !== point.id);
    }

    /**
     * Create a cluster
     * @param {string} id - Cluster ID
     * @param {Array} points - Points in cluster
     * @returns {Object} Cluster object
     */
    createCluster(id, points) {
        // Calculate weighted center
        const center = points.reduce((acc, p) => {
            const weight = p.weight || 1;
            acc.lat += p.lat * weight;
            acc.lng += p.lng * weight;
            acc.weight += weight;
            return acc;
        }, { lat: 0, lng: 0, weight: 0 });

        return {
            id,
            position: [
                center.lat / center.weight,
                center.lng / center.weight
            ],
            points,
            isCluster: true,
            count: points.length,
            bounds: this.calculateClusterBounds(points)
        };
    }

    /**
     * Calculate cluster bounds
     * @param {Array} points - Points in cluster
     * @returns {Object} Bounds object
     */
    calculateClusterBounds(points) {
        return points.reduce((bounds, p) => ({
            south: Math.min(bounds.south, p.lat),
            north: Math.max(bounds.north, p.lat),
            west: Math.min(bounds.west, p.lng),
            east: Math.max(bounds.east, p.lng)
        }), {
            south: Infinity,
            north: -Infinity,
            west: Infinity,
            east: -Infinity
        });
    }

    /**
     * Update cluster transitions
     * @param {Map} newClusters - New cluster state
     */
    updateTransitions(newClusters) {
        const now = performance.now();
        this.transitions.clear();

        // Process cluster changes
        for (const [id, cluster] of newClusters) {
            const previous = this.previousClusters.get(id);
            
            if (!previous || !this.needsTransition(previous, cluster)) {
                continue;
            }

            this.transitions.set(id, {
                id,
                start: previous.position,
                end: cluster.position,
                startTime: now,
                duration: this.options.transitionDuration,
                cluster
            });
        }
    }

    /**
     * Check if transition is needed
     * @param {Object} previous - Previous cluster state
     * @param {Object} current - Current cluster state
     * @returns {boolean} True if transition needed
     */
    needsTransition(previous, current) {
        return previous.position[0] !== current.position[0] ||
               previous.position[1] !== current.position[1] ||
               previous.count !== current.count;
    }

    /**
     * Calculate transition state
     * @param {number} timestamp - Current timestamp
     * @returns {Array} Active transitions
     */
    calculateTransitions(timestamp) {
        const active = [];

        for (const [id, transition] of this.transitions) {
            const progress = Math.min(
                1,
                (timestamp - transition.startTime) / transition.duration
            );

            if (progress < 1) {
                // Calculate intermediate position
                const pos = [
                    this.lerp(transition.start[0], transition.end[0], progress),
                    this.lerp(transition.start[1], transition.end[1], progress)
                ];

                active.push({
                    id,
                    position: pos,
                    progress,
                    cluster: transition.cluster
                });
            }
        }

        // Clean up completed transitions
        if (active.length === 0) {
            this.transitions.clear();
        }

        return active;
    }

    /**
     * Linear interpolation
     * @param {number} start - Start value
     * @param {number} end - End value
     * @param {number} t - Progress (0-1)
     * @returns {number} Interpolated value
     */
    lerp(start, end, t) {
        return start + (end - start) * t;
    }

    /**
     * Calculate cluster radius for zoom level
     * @param {number} zoom - Current zoom level
     * @returns {number} Cluster radius in pixels
     */
    calculateClusterRadius(zoom) {
        // Base radius reduced at higher zoom levels
        return this.options.clusterRadius * Math.pow(0.8, zoom - this.options.minZoom);
    }

    /**
     * Update clustering metrics
     * @param {number} points - Number of points
     * @param {number} clusters - Number of clusters
     * @param {number} startTime - Processing start time
     */
    updateMetrics(points, clusters, startTime) {
        this.metrics = {
            points,
            clusters,
            maxClusterSize: Math.max(...Array.from(this.clusters.values())
                .map(c => c.points?.length || 0)),
            processingTime: performance.now() - startTime
        };
    }

    /**
     * Get current metrics
     * @returns {Object} Clustering metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Clear clustering state
     */
    clear() {
        this.quadtree.clear();
        this.clusters.clear();
        this.previousClusters.clear();
        this.transitions.clear();
        this.lastUpdate = 0;
    }
}

export default new ClusterManager();
