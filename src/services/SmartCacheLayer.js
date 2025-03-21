import SpatialCacheManager from '../utils/SpatialCacheManager.js';

/**
 * Manages intelligent caching with zoom-level awareness and popularity-based retention
 */
class SmartCacheLayer {
    constructor(options = {}) {
        // Zoom level specific caches
        this.zoomLevelCaches = new Map();
        
        this.options = {
            minZoom: options.minZoom || 10,
            maxZoom: options.maxZoom || 19,
            // How many zoom levels to group together
            zoomLevelGrouping: options.zoomLevelGrouping || 2,
            // Maximum number of regions to keep in memory per zoom level
            maxRegionsPerZoom: options.maxRegionsPerZoom || 50,
            // Time window for popularity calculation (ms)
            popularityWindow: options.popularityWindow || 24 * 60 * 60 * 1000, // 24 hours
            // Minimum access count to consider a region "popular"
            popularityThreshold: options.popularityThreshold || 5,
            ...options
        };

        // Track region access patterns
        this.regionAccess = new Map();
        
        // Initialize cache for each zoom level group
        this.initializeZoomLevelCaches();
    }

    /**
     * Initialize caches for each zoom level group
     */
    initializeZoomLevelCaches() {
        const numGroups = Math.ceil(
            (this.options.maxZoom - this.options.minZoom + 1) / 
            this.options.zoomLevelGrouping
        );

        for (let i = 0; i < numGroups; i++) {
            const minZoom = this.options.minZoom + (i * this.options.zoomLevelGrouping);
            const maxZoom = Math.min(
                minZoom + this.options.zoomLevelGrouping - 1,
                this.options.maxZoom
            );

            this.zoomLevelCaches.set(minZoom, new SpatialCacheManager({
                cacheSize: this.options.maxRegionsPerZoom,
                minZoom,
                maxZoom
            }));
        }
    }

    /**
     * Get the appropriate cache for a zoom level
     * @param {number} zoom - Zoom level
     * @returns {SpatialCacheManager} Cache instance
     */
    getCacheForZoom(zoom) {
        const groupBase = Math.floor(
            (zoom - this.options.minZoom) / this.options.zoomLevelGrouping
        ) * this.options.zoomLevelGrouping + this.options.minZoom;

        return this.zoomLevelCaches.get(groupBase);
    }

    /**
     * Track region access
     * @param {string} regionKey - Region identifier
     * @param {number} zoom - Zoom level
     */
    trackRegionAccess(regionKey, zoom) {
        const now = Date.now();
        if (!this.regionAccess.has(regionKey)) {
            this.regionAccess.set(regionKey, []);
        }

        const accesses = this.regionAccess.get(regionKey);
        accesses.push({ timestamp: now, zoom });

        // Clean up old access records
        const cutoff = now - this.options.popularityWindow;
        while (accesses.length > 0 && accesses[0].timestamp < cutoff) {
            accesses.shift();
        }
    }

    /**
     * Calculate region popularity
     * @param {string} regionKey - Region identifier
     * @returns {number} Popularity score
     */
    calculatePopularity(regionKey) {
        const accesses = this.regionAccess.get(regionKey) || [];
        const now = Date.now();
        const cutoff = now - this.options.popularityWindow;

        return accesses.filter(access => access.timestamp >= cutoff).length;
    }

    /**
     * Get restaurants for a viewport
     * @param {Object} bounds - Viewport bounds
     * @param {number} zoom - Current zoom level
     * @returns {Object} Query results and metadata
     */
    async getRestaurants(bounds, zoom) {
        const cache = this.getCacheForZoom(zoom);
        if (!cache) return { restaurants: [], needsUpdate: true };

        // Track access pattern
        const regionKey = cache.generateRegionKey(bounds, zoom);
        this.trackRegionAccess(regionKey, zoom);

        // Get data from cache
        const result = cache.getRestaurantsInViewport(bounds, zoom);

        // Calculate detail level based on zoom
        const detailLevel = this.calculateDetailLevel(zoom);

        // Filter and transform data based on detail level
        return {
            ...result,
            restaurants: this.applyDetailLevel(result.restaurants, detailLevel)
        };
    }

    /**
     * Calculate appropriate detail level for zoom
     * @param {number} zoom - Current zoom level
     * @returns {Object} Detail level configuration
     */
    calculateDetailLevel(zoom) {
        // Base detail levels on zoom ranges
        if (zoom <= 12) {
            return {
                includeReviews: false,
                includeTags: false,
                includeHours: false,
                basicInfoOnly: true
            };
        } else if (zoom <= 15) {
            return {
                includeReviews: false,
                includeTags: true,
                includeHours: true,
                basicInfoOnly: false
            };
        } else {
            return {
                includeReviews: true,
                includeTags: true,
                includeHours: true,
                basicInfoOnly: false
            };
        }
    }

    /**
     * Apply detail level filtering to restaurants
     * @param {Array} restaurants - Restaurant data
     * @param {Object} detailLevel - Detail level configuration
     * @returns {Array} Filtered restaurant data
     */
    applyDetailLevel(restaurants, detailLevel) {
        return restaurants.map(restaurant => {
            if (detailLevel.basicInfoOnly) {
                return {
                    id: restaurant.id,
                    name: restaurant.name,
                    lat: restaurant.lat,
                    lng: restaurant.lng,
                    amenity: restaurant.amenity
                };
            }

            const filtered = { ...restaurant };

            if (!detailLevel.includeReviews) {
                delete filtered.reviews;
                filtered.ratings = {
                    average: restaurant.ratings?.average
                };
            }

            if (!detailLevel.includeTags) {
                delete filtered.tags;
            }

            if (!detailLevel.includeHours) {
                delete filtered.opening_hours;
            }

            return filtered;
        });
    }

    /**
     * Update cache with new restaurant data
     * @param {Array} restaurants - Restaurant data
     * @param {Object} bounds - Viewport bounds
     * @param {number} zoom - Zoom level
     */
    async updateCache(restaurants, bounds, zoom) {
        const cache = this.getCacheForZoom(zoom);
        if (!cache) return;

        await cache.addRestaurants(restaurants, bounds, zoom);

        // Update popularity tracking
        const regionKey = cache.generateRegionKey(bounds, zoom);
        this.trackRegionAccess(regionKey, zoom);
    }

    /**
     * Prune old or infrequently accessed data
     */
    pruneCache() {
        const now = Date.now();

        // Clean up old access records
        for (const [regionKey, accesses] of this.regionAccess.entries()) {
            const cutoff = now - this.options.popularityWindow;
            const newAccesses = accesses.filter(access => access.timestamp >= cutoff);

            if (newAccesses.length === 0) {
                this.regionAccess.delete(regionKey);
            } else if (newAccesses.length < accesses.length) {
                this.regionAccess.set(regionKey, newAccesses);
            }
        }

        // Prune unpopular regions from caches
        for (const cache of this.zoomLevelCaches.values()) {
            const regions = cache.getRegions();
            for (const region of regions) {
                const popularity = this.calculatePopularity(region.key);
                if (popularity < this.options.popularityThreshold) {
                    cache.removeRegion(region.key);
                }
            }
        }
    }

    /**
     * Clear all caches
     */
    clear() {
        for (const cache of this.zoomLevelCaches.values()) {
            cache.clear();
        }
        this.regionAccess.clear();
    }
}

export default SmartCacheLayer;
