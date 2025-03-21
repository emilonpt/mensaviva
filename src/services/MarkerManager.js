import VirtualMarkerPool from './VirtualMarkerPool.js';
import errorBoundaryService from './ErrorBoundaryService.js';

/**
 * Manages marker lifecycle and updates on the map
 */
class MarkerManager {
    constructor(options = {}) {
        this.options = {
            updateDebounce: options.updateDebounce || 100,
            visibilityThreshold: options.visibilityThreshold || 1000, // Max visible markers
            clusterThreshold: options.clusterThreshold || 100, // When to start clustering
            ...options
        };

        // Initialize marker pool
        this.markerPool = new VirtualMarkerPool({
            poolSize: Math.ceil(this.options.visibilityThreshold * 1.2), // 20% buffer
            ...options
        });

        // State tracking
        this.map = null;
        this.updateTimer = null;
        this.pendingData = null;
        this.currentZoom = null;
        this.currentBounds = null;
        this.markerLayerGroups = new Map();
        
        // Performance metrics
        this.lastUpdateTime = 0;
        this.updateCount = 0;
        this.frameMetrics = [];
    }

    /**
     * Initialize the marker manager
     * @param {Object} map - Map instance
     * @returns {Promise} Resolves when initialized
     */
    async initialize(map) {
        this.map = map;
        
        // Create layer groups for different marker types
        this.markerLayerGroups.set('default', L.layerGroup().addTo(map));
        this.markerLayerGroups.set('reviewed', L.layerGroup().addTo(map));
        this.markerLayerGroups.set('cluster', L.markerClusterGroup({
            maxClusterRadius: 50,
            disableClusteringAtZoom: 16
        }).addTo(map));

        // Initialize marker pool
        await this.markerPool.initialize();

        // Set up map event listeners
        this.setupMapListeners();
    }

    /**
     * Set up map event listeners
     */
    setupMapListeners() {
        this.map.on('zoomend', () => this.handleZoomChange());
        this.map.on('moveend', () => this.handleViewportChange());
        
        // Handle visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.pendingData) {
                this.scheduleUpdate();
            }
        });
    }

    /**
     * Update markers with new restaurant data
     * @param {Array} restaurants - Restaurant data
     */
    updateMarkers(restaurants) {
        this.pendingData = restaurants;
        this.scheduleUpdate();
    }

    /**
     * Schedule a marker update
     */
    scheduleUpdate() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        this.updateTimer = setTimeout(() => {
            this.processUpdate();
        }, this.options.updateDebounce);
    }

    /**
     * Process pending marker updates
     */
    async processUpdate() {
        const startTime = performance.now();
        
        try {
            await errorBoundaryService.executeWithRetry(
                async () => {
                    // Update virtual markers first
                    const updateMetrics = this.markerPool.updateVirtualMarkers(this.pendingData);
                    
                    // Apply updates if the frame budget allows
                    await this.applyUpdatesWithBudget();
                    
                    // Update metrics
                    this.updateMetrics(startTime);
                },
                {
                    retryable: false,
                    operationType: 'markerUpdate',
                    context: {
                        markersCount: this.pendingData.length,
                        zoom: this.currentZoom
                    }
                }
            );
        } catch (error) {
            console.error('Error updating markers:', error);
        } finally {
            this.pendingData = null;
        }
    }

    /**
     * Apply updates within frame budget
     * @returns {Promise} Resolves when updates are complete
     */
    async applyUpdatesWithBudget() {
        const FRAME_BUDGET = 16; // ms
        const updates = Array.from(this.markerPool.pendingUpdates);
        const batches = [];
        let currentBatch = [];
        let currentBatchTime = 0;

        // Split updates into batches based on estimated time
        for (const update of updates) {
            const estimatedTime = this.estimateUpdateTime(update);
            if (currentBatchTime + estimatedTime > FRAME_BUDGET) {
                if (currentBatch.length > 0) {
                    batches.push(currentBatch);
                }
                currentBatch = [update];
                currentBatchTime = estimatedTime;
            } else {
                currentBatch.push(update);
                currentBatchTime += estimatedTime;
            }
        }

        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        // Process batches across frames
        for (const batch of batches) {
            await new Promise(resolve => {
                requestAnimationFrame(async () => {
                    const batchStartTime = performance.now();
                    
                    for (const [id, virtualMarker] of batch) {
                        await this.updateMapMarker(id, virtualMarker);
                    }

                    this.frameMetrics.push(performance.now() - batchStartTime);
                    if (this.frameMetrics.length > 60) {
                        this.frameMetrics.shift();
                    }

                    resolve();
                });
            });
        }
    }

    /**
     * Update a specific marker on the map
     * @param {string} id - Marker ID
     * @param {Object} virtualMarker - Virtual marker data
     */
    async updateMapMarker(id, virtualMarker) {
        const marker = this.markerPool.activeMarkers.get(id);
        if (!marker) return;

        if (!marker.element) {
            marker.element = this.createMapMarker(virtualMarker);
        } else {
            this.updateMapMarkerElement(marker.element, virtualMarker);
        }

        // Move to appropriate layer group
        const layerGroup = this.getLayerGroupForMarker(virtualMarker);
        if (marker.element._layerGroup !== layerGroup) {
            if (marker.element._layerGroup) {
                marker.element._layerGroup.removeLayer(marker.element);
            }
            layerGroup.addLayer(marker.element);
            marker.element._layerGroup = layerGroup;
        }
    }

    /**
     * Create a new map marker
     * @param {Object} virtualMarker - Virtual marker data
     * @returns {Object} Leaflet marker
     */
    createMapMarker(virtualMarker) {
        const { position, props } = virtualMarker;
        const marker = L.marker(position, {
            icon: this.createMarkerIcon(props),
            title: props.title
        });

        // Store original data for updates
        marker.originalData = props;
        
        return marker;
    }

    /**
     * Update existing map marker
     * @param {Object} marker - Leaflet marker
     * @param {Object} virtualMarker - Virtual marker data
     */
    updateMapMarkerElement(marker, virtualMarker) {
        const { position, props } = virtualMarker;
        
        // Only update if changed
        if (!marker.getLatLng().equals(position)) {
            marker.setLatLng(position);
        }

        if (JSON.stringify(marker.originalData) !== JSON.stringify(props)) {
            marker.setIcon(this.createMarkerIcon(props));
            marker.setTitle(props.title);
            marker.originalData = props;
        }
    }

    /**
     * Create marker icon
     * @param {Object} props - Marker properties
     * @returns {Object} Leaflet icon
     */
    createMarkerIcon(props) {
        // Implementation will depend on your icon system
        return L.divIcon({
            className: `marker-icon ${props.hasReviews ? 'has-reviews' : ''} ${props.type}`,
            html: this.getMarkerHtml(props),
            iconSize: [30, 30]
        });
    }

    /**
     * Get marker HTML content
     * @param {Object} props - Marker properties
     * @returns {string} HTML content
     */
    getMarkerHtml(props) {
        const ratingHtml = props.ratings?.average 
            ? `<div class="rating">${Math.round(props.ratings.average)}</div>`
            : '';
            
        return `
            <div class="marker-content">
                <div class="icon ${props.type}"></div>
                ${ratingHtml}
            </div>
        `;
    }

    /**
     * Get appropriate layer group for marker
     * @param {Object} virtualMarker - Virtual marker data
     * @returns {Object} Layer group
     */
    getLayerGroupForMarker(virtualMarker) {
        if (this.shouldCluster()) {
            return this.markerLayerGroups.get('cluster');
        }
        return virtualMarker.props.hasReviews 
            ? this.markerLayerGroups.get('reviewed')
            : this.markerLayerGroups.get('default');
    }

    /**
     * Check if clustering should be enabled
     * @returns {boolean} True if should cluster
     */
    shouldCluster() {
        return this.pendingData && 
               this.pendingData.length > this.options.clusterThreshold &&
               this.currentZoom < 15;
    }

    /**
     * Handle zoom level changes
     */
    handleZoomChange() {
        const newZoom = this.map.getZoom();
        if (newZoom !== this.currentZoom) {
            this.currentZoom = newZoom;
            if (this.pendingData) {
                this.scheduleUpdate();
            }
        }
    }

    /**
     * Handle viewport changes
     */
    handleViewportChange() {
        this.currentBounds = this.map.getBounds();
        // Updates will be triggered by data layer
    }

    /**
     * Update performance metrics
     * @param {number} startTime - Update start time
     */
    updateMetrics(startTime) {
        const duration = performance.now() - startTime;
        this.lastUpdateTime = duration;
        this.updateCount++;

        // Log performance data if it exceeds budget
        if (duration > 50) { // 3 frames
            console.warn('Marker update took longer than expected:', {
                duration,
                markerCount: this.markerPool.getStats(),
                averageFrameTime: this.getAverageFrameTime()
            });
        }
    }

    /**
     * Get average frame processing time
     * @returns {number} Average time in ms
     */
    getAverageFrameTime() {
        if (this.frameMetrics.length === 0) return 0;
        const sum = this.frameMetrics.reduce((a, b) => a + b, 0);
        return sum / this.frameMetrics.length;
    }

    /**
     * Get manager statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            markers: this.markerPool.getStats(),
            performance: {
                lastUpdateTime: this.lastUpdateTime,
                updateCount: this.updateCount,
                averageFrameTime: this.getAverageFrameTime()
            }
        };
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        this.markerLayerGroups.forEach(group => {
            if (this.map) {
                this.map.removeLayer(group);
            }
        });

        this.markerPool.clear();
        this.markerLayerGroups.clear();
        this.frameMetrics = [];
    }
}

export default new MarkerManager();
