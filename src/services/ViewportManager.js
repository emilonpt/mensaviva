/**
 * Manages viewport state and predictive data loading
 */
class ViewportManager {
    constructor(options = {}) {
        this.options = {
            // Viewport padding for preloading (fraction of viewport size)
            preloadPadding: options.preloadPadding || 0.5,
            // Minimum movement (in pixels) to trigger a viewport update
            minPixelDelta: options.minPixelDelta || 50,
            // Debounce time for viewport updates (ms)
            debounceTime: options.debounceTime || 250,
            // Maximum prediction time (ms)
            maxPredictionTime: options.maxPredictionTime || 2000,
            ...options
        };

        // Current viewport state
        this.viewport = {
            bounds: null,
            zoom: null,
            center: null,
            width: 0,
            height: 0,
            pixelsPerLng: 0,
            pixelsPerLat: 0
        };

        // Movement tracking
        this.movement = {
            lastUpdate: 0,
            velocity: { x: 0, y: 0 },
            positions: [],
            timestamps: []
        };

        // Callback for viewport updates
        this.onViewportUpdate = null;
        
        // Debounce timer
        this.updateTimer = null;
    }

    /**
     * Initialize the viewport manager
     * @param {Function} callback - Called when viewport needs updating
     */
    initialize(callback) {
        this.onViewportUpdate = callback;
    }

    /**
     * Calculate the expanded bounds for preloading
     * @param {Object} bounds - Current viewport bounds
     * @returns {Object} - Expanded bounds
     */
    calculatePreloadBounds(bounds) {
        const latPadding = (bounds.north - bounds.south) * this.options.preloadPadding;
        const lngPadding = (bounds.east - bounds.west) * this.options.preloadPadding;

        return {
            south: bounds.south - latPadding,
            north: bounds.north + latPadding,
            west: bounds.west - lngPadding,
            east: bounds.east + lngPadding
        };
    }

    /**
     * Update movement tracking
     * @param {Object} center - New center position {lat, lng}
     * @param {number} timestamp - Event timestamp
     */
    updateMovement(center, timestamp) {
        const MAX_POSITIONS = 5;
        
        this.movement.positions.push(center);
        this.movement.timestamps.push(timestamp);

        // Keep only recent positions
        if (this.movement.positions.length > MAX_POSITIONS) {
            this.movement.positions.shift();
            this.movement.timestamps.shift();
        }

        // Calculate velocity if we have enough points
        if (this.movement.positions.length >= 2) {
            const newest = this.movement.positions[this.movement.positions.length - 1];
            const oldest = this.movement.positions[0];
            const timeDelta = (this.movement.timestamps[this.movement.timestamps.length - 1] - 
                             this.movement.timestamps[0]) / 1000; // Convert to seconds

            if (timeDelta > 0) {
                this.movement.velocity = {
                    x: (newest.lng - oldest.lng) / timeDelta,
                    y: (newest.lat - oldest.lat) / timeDelta
                };
            }
        }
    }

    /**
     * Predict future viewport position based on current movement
     * @param {number} predictionTime - Time to predict ahead (ms)
     * @returns {Object} - Predicted bounds
     */
    predictFutureViewport(predictionTime) {
        if (!this.viewport.bounds || !this.movement.velocity) return null;

        const seconds = Math.min(predictionTime, this.options.maxPredictionTime) / 1000;
        const predictedCenter = {
            lat: this.viewport.center.lat + (this.movement.velocity.y * seconds),
            lng: this.viewport.center.lng + (this.movement.velocity.x * seconds)
        };

        // Calculate predicted bounds
        const latDelta = (this.viewport.bounds.north - this.viewport.bounds.south) / 2;
        const lngDelta = (this.viewport.bounds.east - this.viewport.bounds.west) / 2;

        return {
            south: predictedCenter.lat - latDelta,
            north: predictedCenter.lat + latDelta,
            west: predictedCenter.lng - lngDelta,
            east: predictedCenter.lng + lngDelta
        };
    }

    /**
     * Check if viewport movement is significant enough to trigger an update
     * @param {Object} newBounds - New viewport bounds
     * @param {Object} newCenter - New center position
     * @returns {boolean} - True if update should be triggered
     */
    shouldUpdateViewport(newBounds, newCenter) {
        if (!this.viewport.bounds || !this.viewport.center) return true;

        const pixelDeltaX = Math.abs(newCenter.lng - this.viewport.center.lng) * this.viewport.pixelsPerLng;
        const pixelDeltaY = Math.abs(newCenter.lat - this.viewport.center.lat) * this.viewport.pixelsPerLat;

        return Math.sqrt(pixelDeltaX * pixelDeltaX + pixelDeltaY * pixelDeltaY) >= this.options.minPixelDelta;
    }

    /**
     * Update viewport state and trigger data loading if needed
     * @param {Object} bounds - New viewport bounds
     * @param {number} zoom - New zoom level
     * @param {Object} center - New center position
     * @param {Object} size - Viewport size in pixels
     */
    updateViewport(bounds, zoom, center, size) {
        // Clear any pending update
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        const shouldUpdate = this.shouldUpdateViewport(bounds, center);
        const timestamp = Date.now();

        // Update movement tracking
        this.updateMovement(center, timestamp);

        // Update viewport state
        this.viewport = {
            bounds,
            zoom,
            center,
            width: size.width,
            height: size.height,
            pixelsPerLng: size.width / (bounds.east - bounds.west),
            pixelsPerLat: size.height / (bounds.north - bounds.south)
        };

        // Only trigger update if movement is significant
        if (shouldUpdate && this.onViewportUpdate) {
            this.updateTimer = setTimeout(() => {
                // Calculate expanded bounds for preloading
                const preloadBounds = this.calculatePreloadBounds(bounds);
                
                // Predict future viewport if moving
                const prediction = this.predictFutureViewport(1000);
                
                // Combine current, preload, and predicted bounds
                const expandedBounds = prediction ? this.mergeBounds([
                    bounds,
                    preloadBounds,
                    prediction
                ]) : preloadBounds;

                this.onViewportUpdate(expandedBounds, zoom);
            }, this.options.debounceTime);
        }
    }

    /**
     * Merge multiple bounds into one encompassing bounds
     * @param {Array} boundsList - Array of bounds objects
     * @returns {Object} - Merged bounds
     */
    mergeBounds(boundsList) {
        return boundsList.reduce((merged, current) => ({
            south: Math.min(merged.south, current.south),
            north: Math.max(merged.north, current.north),
            west: Math.min(merged.west, current.west),
            east: Math.max(merged.east, current.east)
        }));
    }

    /**
     * Get current viewport state
     * @returns {Object} - Current viewport state
     */
    getViewport() {
        return { ...this.viewport };
    }

    /**
     * Clear viewport state
     */
    clear() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        
        this.viewport = {
            bounds: null,
            zoom: null,
            center: null,
            width: 0,
            height: 0,
            pixelsPerLng: 0,
            pixelsPerLat: 0
        };

        this.movement = {
            lastUpdate: 0,
            velocity: { x: 0, y: 0 },
            positions: [],
            timestamps: []
        };
    }
}

export default ViewportManager;
