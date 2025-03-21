import QuadTree from '../utils/QuadTree.js';
import MarkerManager from './MarkerManager.js';

/**
 * Optimizes marker rendering and management based on viewport
 */
class ViewportOptimizer {
    constructor(options = {}) {
        this.options = {
            preloadMargin: options.preloadMargin || 0.5, // Viewport margin for preloading (50%)
            cleanupMargin: options.cleanupMargin || 2, // Margin to keep markers before cleanup
            maxMarkersPerLevel: options.maxMarkersPerLevel || {
                // Maximum markers to show at each zoom level
                10: 100,  // City level
                13: 200,  // District level
                15: 500,  // Street level
                17: 1000  // Building level
            },
            updateThrottle: options.updateThrottle || 100,
            samplingRate: options.samplingRate || 0.1, // Rate for density sampling
            ...options
        };

        // State tracking
        this.currentViewport = null;
        this.preloadViewport = null;
        this.visibleMarkers = new Set();
        this.preloadedMarkers = new Set();
        
        // Update throttling
        this.updateTimer = null;
        this.lastUpdate = 0;

        // Performance monitoring
        this.metrics = {
            visibleCount: 0,
            preloadedCount: 0,
            culledCount: 0,
            densityScore: 0,
            lastUpdateTime: 0
        };
    }

    /**
     * Update viewport state and optimize markers
     * @param {Object} viewport - Current viewport bounds and state
     * @param {Array} markers - Available markers
     */
    updateViewport(viewport, markers) {
        this.currentViewport = viewport;
        this.preloadViewport = this.calculatePreloadViewport(viewport);

        // Throttle updates
        const now = Date.now();
        if (now - this.lastUpdate < this.options.updateThrottle) {
            if (this.updateTimer) {
                clearTimeout(this.updateTimer);
            }
            this.updateTimer = setTimeout(() => {
                this.processViewportUpdate(markers);
            }, this.options.updateThrottle);
            return;
        }

        this.processViewportUpdate(markers);
    }

    /**
     * Process viewport update
     * @param {Array} markers - Available markers
     */
    processViewportUpdate(markers) {
        const startTime = performance.now();

        // Clear previous state
        this.visibleMarkers.clear();
        this.preloadedMarkers.clear();

        // Calculate visible and preload areas
        const visible = this.filterVisibleMarkers(markers);
        const preload = this.filterPreloadMarkers(markers);

        // Optimize density
        const optimized = this.optimizeMarkerDensity(visible);

        // Update marker visibility
        this.updateMarkerVisibility(optimized, preload);

        // Update metrics
        this.updateMetrics(optimized, preload, startTime);

        this.lastUpdate = Date.now();
    }

    /**
     * Calculate expanded viewport for preloading
     * @param {Object} viewport - Current viewport
     * @returns {Object} Expanded viewport bounds
     */
    calculatePreloadViewport(viewport) {
        const latSpan = viewport.north - viewport.south;
        const lngSpan = viewport.east - viewport.west;
        const margin = this.options.preloadMargin;

        return {
            south: viewport.south - latSpan * margin,
            north: viewport.north + latSpan * margin,
            west: viewport.west - lngSpan * margin,
            east: viewport.east + lngSpan * margin,
            zoom: viewport.zoom
        };
    }

    /**
     * Filter markers visible in current viewport
     * @param {Array} markers - Available markers
     * @returns {Array} Visible markers
     */
    filterVisibleMarkers(markers) {
        return markers.filter(marker => 
            this.isInBounds(marker, this.currentViewport)
        );
    }

    /**
     * Filter markers in preload area
     * @param {Array} markers - Available markers
     * @returns {Array} Markers to preload
     */
    filterPreloadMarkers(markers) {
        return markers.filter(marker =>
            !this.visibleMarkers.has(marker.id) &&
            this.isInBounds(marker, this.preloadViewport)
        );
    }

    /**
     * Check if marker is within bounds
     * @param {Object} marker - Marker to check
     * @param {Object} bounds - Bounds to check against
     * @returns {boolean} True if marker is in bounds
     */
    isInBounds(marker, bounds) {
        return marker.lat >= bounds.south &&
               marker.lat <= bounds.north &&
               marker.lng >= bounds.west &&
               marker.lng <= bounds.east;
    }

    /**
     * Optimize marker density based on zoom level
     * @param {Array} markers - Markers to optimize
     * @returns {Array} Optimized markers
     */
    optimizeMarkerDensity(markers) {
        const zoom = this.currentViewport.zoom;
        const maxMarkers = this.getMaxMarkersForZoom(zoom);

        if (markers.length <= maxMarkers) {
            return markers;
        }

        // Create spatial index for density calculation
        const quadtree = new QuadTree({
            x: this.currentViewport.west,
            y: this.currentViewport.south,
            width: this.currentViewport.east - this.currentViewport.west,
            height: this.currentViewport.north - this.currentViewport.south
        });

        // Add markers to quadtree with importance weights
        markers.forEach(marker => {
            quadtree.insert({
                x: marker.lng,
                y: marker.lat,
                data: {
                    marker,
                    weight: this.calculateMarkerWeight(marker)
                }
            });
        });

        // Sample density across viewport
        const samples = this.sampleViewportDensity(quadtree);

        // Select markers based on density and importance
        return this.selectOptimalMarkers(markers, samples, maxMarkers);
    }

    /**
     * Calculate marker importance weight
     * @param {Object} marker - Marker to evaluate
     * @returns {number} Importance weight
     */
    calculateMarkerWeight(marker) {
        let weight = 1;

        // Increase weight for markers with reviews
        if (marker.reviews?.length > 0) {
            weight += Math.min(marker.reviews.length * 0.2, 2);
        }

        // Increase weight for high ratings
        if (marker.ratings?.average > 4) {
            weight += 0.5;
        }

        // Increase weight for popular types
        if (marker.amenity === 'restaurant' || marker.amenity === 'cafe') {
            weight += 0.3;
        }

        return weight;
    }

    /**
     * Sample viewport density
     * @param {QuadTree} quadtree - Spatial index
     * @returns {Array} Density samples
     */
    sampleViewportDensity(quadtree) {
        const samples = [];
        const gridSize = Math.sqrt(1 / this.options.samplingRate);
        const latStep = (this.currentViewport.north - this.currentViewport.south) / gridSize;
        const lngStep = (this.currentViewport.east - this.currentViewport.west) / gridSize;

        for (let lat = this.currentViewport.south; lat <= this.currentViewport.north; lat += latStep) {
            for (let lng = this.currentViewport.west; lng <= this.currentViewport.east; lng += lngStep) {
                const nearby = quadtree.query({
                    x: lng - lngStep/2,
                    y: lat - latStep/2,
                    width: lngStep,
                    height: latStep
                });

                samples.push({
                    lat,
                    lng,
                    density: nearby.length,
                    points: nearby
                });
            }
        }

        return samples;
    }

    /**
     * Select optimal markers based on density
     * @param {Array} markers - Available markers
     * @param {Array} samples - Density samples
     * @param {number} maxMarkers - Maximum markers to select
     * @returns {Array} Selected markers
     */
    selectOptimalMarkers(markers, samples, maxMarkers) {
        // Sort markers by weight and density
        const weighted = markers.map(marker => {
            const sample = this.findNearestSample(marker, samples);
            const densityFactor = 1 / (sample.density + 1);
            const weight = this.calculateMarkerWeight(marker) * densityFactor;

            return { marker, weight };
        });

        weighted.sort((a, b) => b.weight - a.weight);

        // Select top markers
        return weighted
            .slice(0, maxMarkers)
            .map(item => item.marker);
    }

    /**
     * Find nearest density sample
     * @param {Object} marker - Marker to check
     * @param {Array} samples - Density samples
     * @returns {Object} Nearest sample
     */
    findNearestSample(marker, samples) {
        return samples.reduce((nearest, sample) => {
            const distance = this.calculateDistance(
                marker.lat, marker.lng,
                sample.lat, sample.lng
            );

            if (distance < nearest.distance) {
                return { ...sample, distance };
            }
            return nearest;
        }, { ...samples[0], distance: Infinity });
    }

    /**
     * Calculate distance between points
     * @param {number} lat1 - First latitude
     * @param {number} lng1 - First longitude
     * @param {number} lat2 - Second latitude
     * @param {number} lng2 - Second longitude
     * @returns {number} Distance
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const dx = lng2 - lng1;
        const dy = lat2 - lat1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Get maximum markers for zoom level
     * @param {number} zoom - Current zoom level
     * @returns {number} Maximum markers
     */
    getMaxMarkersForZoom(zoom) {
        // Find the closest defined zoom level
        const levels = Object.keys(this.options.maxMarkersPerLevel)
            .map(Number)
            .sort((a, b) => a - b);

        for (let i = levels.length - 1; i >= 0; i--) {
            if (zoom >= levels[i]) {
                return this.options.maxMarkersPerLevel[levels[i]];
            }
        }

        return this.options.maxMarkersPerLevel[levels[0]];
    }

    /**
     * Update marker visibility states
     * @param {Array} visible - Visible markers
     * @param {Array} preload - Preload markers
     */
    updateMarkerVisibility(visible, preload) {
        visible.forEach(marker => {
            this.visibleMarkers.add(marker.id);
            MarkerManager.updateMarker(marker, true);
        });

        preload.forEach(marker => {
            this.preloadedMarkers.add(marker.id);
            MarkerManager.updateMarker(marker, false);
        });

        this.cleanupMarkers();
    }

    /**
     * Clean up out-of-view markers
     */
    cleanupMarkers() {
        const cleanupBounds = {
            south: this.preloadViewport.south - this.options.cleanupMargin,
            north: this.preloadViewport.north + this.options.cleanupMargin,
            west: this.preloadViewport.west - this.options.cleanupMargin,
            east: this.preloadViewport.east + this.options.cleanupMargin
        };

        MarkerManager.getAllMarkers().forEach(marker => {
            if (!this.isInBounds(marker, cleanupBounds)) {
                MarkerManager.removeMarker(marker.id);
                this.metrics.culledCount++;
            }
        });
    }

    /**
     * Update optimization metrics
     * @param {Array} visible - Visible markers
     * @param {Array} preload - Preload markers
     * @param {number} startTime - Processing start time
     */
    updateMetrics(visible, preload, startTime) {
        this.metrics = {
            visibleCount: visible.length,
            preloadedCount: preload.length,
            culledCount: this.metrics.culledCount,
            densityScore: this.calculateDensityScore(),
            lastUpdateTime: performance.now() - startTime
        };
    }

    /**
     * Calculate viewport density score
     * @returns {number} Density score
     */
    calculateDensityScore() {
        const area = (this.currentViewport.north - this.currentViewport.south) *
                    (this.currentViewport.east - this.currentViewport.west);
        return this.visibleMarkers.size / area;
    }

    /**
     * Get current optimization metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Clear optimization state
     */
    clear() {
        this.visibleMarkers.clear();
        this.preloadedMarkers.clear();
        this.metrics.culledCount = 0;
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
    }
}

export default new ViewportOptimizer();
