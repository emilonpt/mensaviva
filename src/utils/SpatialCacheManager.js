import QuadTree from './QuadTree.js';

/**
 * LRU Cache implementation
 */
class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
        this.accessOrder = [];
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        
        // Update access order
        this.updateAccessOrder(key);
        return this.cache.get(key);
    }

    set(key, value) {
        if (this.cache.size >= this.capacity && !this.cache.has(key)) {
            // Remove least recently used item
            const lruKey = this.accessOrder.shift();
            this.cache.delete(lruKey);
        }
        
        this.cache.set(key, value);
        this.updateAccessOrder(key);
    }

    updateAccessOrder(key) {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
    }

    clear() {
        this.cache.clear();
        this.accessOrder = [];
    }
}

/**
 * Manages spatial indexing and caching of restaurant data
 */
class SpatialCacheManager {
    constructor(options = {}) {
        // Initialize configuration
        this.config = {
            cacheSize: options.cacheSize || 1000,
            maxAge: options.maxAge || 7 * 24 * 60 * 60 * 1000, // 1 week
            minZoom: options.minZoom || 10,
            maxZoom: options.maxZoom || 19
        };

        // Initialize caches
        this.dataCache = new LRUCache(this.config.cacheSize);
        this.regionCache = new LRUCache(this.config.cacheSize);
        
        // Initialize spatial index
        this.quadtree = new QuadTree({
            x: 0,
            y: 0,
            width: 1,
            height: 1
        });

        // Track viewport access frequency
        this.viewportFrequency = new Map();
    }

    /**
     * Generate a unique key for a region
     * @param {Object} bounds - The bounds of the region
     * @param {number} zoom - Zoom level
     * @returns {string} - Unique region key
     */
    generateRegionKey(bounds, zoom) {
        const precision = Math.pow(10, Math.min(zoom - this.config.minZoom, 5));
        const south = Math.round(bounds.south * precision) / precision;
        const west = Math.round(bounds.west * precision) / precision;
        const north = Math.round(bounds.north * precision) / precision;
        const east = Math.round(bounds.east * precision) / precision;
        return `${south},${west},${north},${east}:${zoom}`;
    }

    /**
     * Check if a region needs to be updated
     * @param {Object} region - Region metadata
     * @returns {boolean} - True if region needs update
     */
    needsUpdate(region) {
        if (!region) return true;

        const age = Date.now() - region.timestamp;
        const frequency = this.viewportFrequency.get(region.key) || 0;
        
        // More frequent regions get updated more often
        const maxAge = this.config.maxAge / Math.sqrt(frequency + 1);
        
        return age > maxAge;
    }

    /**
     * Update viewport access frequency
     * @param {string} regionKey - Region key
     */
    updateViewportFrequency(regionKey) {
        const frequency = (this.viewportFrequency.get(regionKey) || 0) + 1;
        this.viewportFrequency.set(regionKey, frequency);
    }

    /**
     * Get restaurants in viewport
     * @param {Object} bounds - Viewport bounds
     * @param {number} zoom - Current zoom level
     * @returns {Object} - Query results and cache status
     */
    getRestaurantsInViewport(bounds, zoom) {
        const regionKey = this.generateRegionKey(bounds, zoom);
        const region = this.regionCache.get(regionKey);
        
        this.updateViewportFrequency(regionKey);

        // Convert bounds to quadtree coordinates
        const sw = QuadTree.latLngToXY(bounds.south, bounds.west);
        const ne = QuadTree.latLngToXY(bounds.north, bounds.east);
        
        const queryRange = {
            x: sw.x,
            y: ne.y,
            width: ne.x - sw.x,
            height: sw.y - ne.y
        };

        // Query spatial index
        const points = this.quadtree.query(queryRange);
        
        // Get full data for each point
        const restaurants = points.map(point => this.dataCache.get(point.data.id))
            .filter(data => data !== null);

        return {
            restaurants,
            region,
            needsUpdate: this.needsUpdate(region)
        };
    }

    /**
     * Add restaurants to cache
     * @param {Array} restaurants - Array of restaurant data
     * @param {Object} bounds - Viewport bounds
     * @param {number} zoom - Current zoom level
     */
    addRestaurants(restaurants, bounds, zoom) {
        const regionKey = this.generateRegionKey(bounds, zoom);
        
        // Update region cache
        this.regionCache.set(regionKey, {
            key: regionKey,
            timestamp: Date.now(),
            count: restaurants.length
        });

        // Update data cache and spatial index
        restaurants.forEach(restaurant => {
            const { lat, lng } = restaurant;
            const point = QuadTree.latLngToXY(lat, lng);
            
            this.dataCache.set(restaurant.id, restaurant);
            this.quadtree.insert({
                x: point.x,
                y: point.y,
                data: {
                    id: restaurant.id,
                    timestamp: Date.now()
                }
            });
        });
    }

    /**
     * Clear all caches
     */
    clear() {
        this.dataCache.clear();
        this.regionCache.clear();
        this.quadtree.clear();
        this.viewportFrequency.clear();
    }
}

export default SpatialCacheManager;
