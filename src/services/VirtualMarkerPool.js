/**
 * Manages a pool of reusable markers with virtual DOM-like diffing
 */
class VirtualMarkerPool {
    constructor(options = {}) {
        this.options = {
            poolSize: options.poolSize || 1000, // Initial pool size
            growthFactor: options.growthFactor || 1.5, // How much to grow pool when needed
            recycleThreshold: options.recycleThreshold || 0.3, // When to start recycling (30% free)
            batchSize: options.batchSize || 50, // Number of markers to process in one batch
            ...options
        };

        // Marker pools
        this.activeMarkers = new Map(); // Currently visible markers
        this.recycledMarkers = new Set(); // Available for reuse
        this.markerPool = new Map(); // All markers (both active and recycled)

        // Virtual markers for diffing
        this.virtualMarkers = new Map();
        this.pendingUpdates = new Map();
        
        // Metrics
        this.metrics = {
            created: 0,
            recycled: 0,
            updated: 0,
            removed: 0
        };
    }

    /**
     * Initialize the marker pool
     * @returns {Promise} Resolves when pool is ready
     */
    async initialize() {
        await this.growPool(this.options.poolSize);
    }

    /**
     * Grow the marker pool
     * @param {number} count - Number of markers to add
     * @returns {Promise} Resolves when markers are created
     */
    async growPool(count) {
        const batchSize = this.options.batchSize;
        const batches = Math.ceil(count / batchSize);

        for (let i = 0; i < batches; i++) {
            const batchCount = Math.min(batchSize, count - (i * batchSize));
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    for (let j = 0; j < batchCount; j++) {
                        this.createMarker();
                    }
                    resolve();
                });
            });
        }
    }

    /**
     * Create a new marker
     * @returns {Object} New marker instance
     */
    createMarker() {
        const marker = {
            id: `marker_${this.metrics.created++}`,
            element: null, // Will be created when needed
            state: {
                position: null,
                visible: false,
                props: {}
            }
        };
        
        this.markerPool.set(marker.id, marker);
        this.recycledMarkers.add(marker);
        
        return marker;
    }

    /**
     * Get or create a marker
     * @returns {Object} Marker instance
     */
    acquireMarker() {
        let marker;
        if (this.recycledMarkers.size > 0) {
            marker = this.recycledMarkers.values().next().value;
            this.recycledMarkers.delete(marker);
            this.metrics.recycled++;
        } else {
            // Grow pool if needed
            if (this.activeMarkers.size >= this.markerPool.size * (1 - this.options.recycleThreshold)) {
                const growth = Math.floor(this.markerPool.size * (this.options.growthFactor - 1));
                this.growPool(growth);
            }
            marker = this.createMarker();
        }
        
        return marker;
    }

    /**
     * Update virtual markers with new data
     * @param {Array} restaurants - Restaurant data
     * @returns {Object} Update metrics
     */
    updateVirtualMarkers(restaurants) {
        const previousVirtual = this.virtualMarkers;
        const newVirtual = new Map();
        const updates = new Map();

        // Create new virtual markers
        for (const restaurant of restaurants) {
            const id = restaurant.id;
            const existing = previousVirtual.get(id);
            const virtualMarker = {
                position: [restaurant.lat, restaurant.lng],
                props: {
                    title: restaurant.name,
                    amenity: restaurant.amenity,
                    hasReviews: restaurant.reviews?.length > 0,
                    ratings: restaurant.ratings || {},
                    icon: this.getMarkerIcon(restaurant)
                }
            };

            // Determine if update is needed
            if (!existing || this.needsUpdate(existing, virtualMarker)) {
                updates.set(id, virtualMarker);
            }

            newVirtual.set(id, virtualMarker);
        }

        // Track removals
        for (const [id] of previousVirtual) {
            if (!newVirtual.has(id)) {
                this.removeMarker(id);
            }
        }

        this.virtualMarkers = newVirtual;
        this.pendingUpdates = updates;

        return {
            total: newVirtual.size,
            updates: updates.size,
            removals: this.metrics.removed
        };
    }

    /**
     * Check if marker needs updating
     * @param {Object} existing - Existing virtual marker
     * @param {Object} next - New virtual marker
     * @returns {boolean} True if update needed
     */
    needsUpdate(existing, next) {
        // Position change
        if (existing.position[0] !== next.position[0] || 
            existing.position[1] !== next.position[1]) {
            return true;
        }

        // Props change
        const existingProps = existing.props;
        const nextProps = next.props;

        return Object.keys(nextProps).some(key => 
            JSON.stringify(existingProps[key]) !== JSON.stringify(nextProps[key])
        );
    }

    /**
     * Apply pending updates to actual markers
     * @returns {Promise} Resolves when updates are complete
     */
    async applyUpdates() {
        const updates = Array.from(this.pendingUpdates);
        const batchSize = this.options.batchSize;
        const batches = Math.ceil(updates.length / batchSize);

        for (let i = 0; i < batches; i++) {
            const batchUpdates = updates.slice(i * batchSize, (i + 1) * batchSize);
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    for (const [id, virtualMarker] of batchUpdates) {
                        this.updateMarker(id, virtualMarker);
                    }
                    resolve();
                });
            });
        }

        this.pendingUpdates.clear();
    }

    /**
     * Update a single marker
     * @param {string} id - Marker ID
     * @param {Object} virtualMarker - Virtual marker data
     */
    updateMarker(id, virtualMarker) {
        let marker = this.activeMarkers.get(id);
        
        if (!marker) {
            marker = this.acquireMarker();
            this.activeMarkers.set(id, marker);
        }

        // Update marker state
        marker.state = {
            position: virtualMarker.position,
            visible: true,
            props: { ...virtualMarker.props }
        };

        this.metrics.updated++;
    }

    /**
     * Remove a marker
     * @param {string} id - Marker ID
     */
    removeMarker(id) {
        const marker = this.activeMarkers.get(id);
        if (marker) {
            marker.state.visible = false;
            this.activeMarkers.delete(id);
            this.recycledMarkers.add(marker);
            this.metrics.removed++;
        }
    }

    /**
     * Get icon configuration for a restaurant
     * @param {Object} restaurant - Restaurant data
     * @returns {Object} Icon configuration
     */
    getMarkerIcon(restaurant) {
        return {
            type: restaurant.amenity || 'restaurant',
            hasReviews: restaurant.reviews?.length > 0,
            ratings: restaurant.ratings
        };
    }

    /**
     * Get pool statistics
     * @returns {Object} Pool statistics
     */
    getStats() {
        return {
            poolSize: this.markerPool.size,
            active: this.activeMarkers.size,
            recycled: this.recycledMarkers.size,
            metrics: { ...this.metrics }
        };
    }

    /**
     * Clear the marker pool
     */
    clear() {
        this.activeMarkers.clear();
        this.markerPool.clear();
        this.recycledMarkers.clear();
        this.virtualMarkers.clear();
        this.pendingUpdates.clear();
        
        this.metrics = {
            created: 0,
            recycled: 0,
            updated: 0,
            removed: 0
        };
    }
}

export default VirtualMarkerPool;
