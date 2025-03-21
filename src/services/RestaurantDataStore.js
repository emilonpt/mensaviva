import SpatialCacheManager from '../utils/SpatialCacheManager.js';

/**
 * Manages the storage and retrieval of restaurant data
 * Serves as a single source of truth for restaurant information
 */
class RestaurantDataStore {
    constructor(options = {}) {
        // Initialize spatial cache manager
        this.spatialCache = new SpatialCacheManager(options);
        
        // TypedArray for coordinate storage
        // Each restaurant takes 2 slots (lat, lng)
        this.coordinates = new Float64Array(options.initialCapacity || 10000 * 2);
        this.coordinateMap = new Map(); // Maps restaurant ID to coordinate index
        this.nextCoordinateIndex = 0;

        // Store normalized restaurant data
        this.restaurants = new Map();
        this.amenities = new Map();
        this.ratings = new Map();
        this.tags = new Map();
        this.comments = new Map();

        // Frequency counters for analytics
        this.viewCount = new Map();
        this.updateCount = new Map();
    }

    /**
     * Store coordinates for a restaurant
     * @param {string} id - Restaurant ID
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     */
    storeCoordinates(id, lat, lng) {
        let index = this.coordinateMap.get(id);
        
        if (index === undefined) {
            // Allocate new space if needed
            if (this.nextCoordinateIndex >= this.coordinates.length) {
                const newArray = new Float64Array(this.coordinates.length * 2);
                newArray.set(this.coordinates);
                this.coordinates = newArray;
            }
            
            index = this.nextCoordinateIndex;
            this.nextCoordinateIndex += 2;
            this.coordinateMap.set(id, index);
        }
        
        this.coordinates[index] = lat;
        this.coordinates[index + 1] = lng;
    }

    /**
     * Get coordinates for a restaurant
     * @param {string} id - Restaurant ID
     * @returns {Object|null} - {lat, lng} or null if not found
     */
    getCoordinates(id) {
        const index = this.coordinateMap.get(id);
        if (index === undefined) return null;
        
        return {
            lat: this.coordinates[index],
            lng: this.coordinates[index + 1]
        };
    }

    /**
     * Update or add a restaurant
     * @param {Object} data - Restaurant data
     */
    upsertRestaurant(data) {
        const {
            id,
            osm_id,
            name,
            lat,
            lng,
            address,
            opening_hours,
            amenity,
            tags = [],
            comments = [],
            ratings = {}
        } = data;

        // Store coordinates
        this.storeCoordinates(id, lat, lng);

        // Store basic info
        this.restaurants.set(id, {
            id,
            osm_id,
            name,
            address,
            opening_hours,
            amenity: amenity || 'restaurant'
        });

        // Store tags
        this.tags.set(id, new Set(tags));

        // Store comments
        this.comments.set(id, comments);

        // Store ratings
        this.ratings.set(id, {
            food: ratings.food || null,
            price: ratings.price || null,
            ambience: ratings.ambience || null,
            count: ratings.count || 0
        });

        // Track update
        this.updateCount.set(id, (this.updateCount.get(id) || 0) + 1);

        // Update spatial cache
        const restaurant = this.getRestaurant(id);
        if (restaurant) {
            this.spatialCache.addRestaurants([restaurant], {
                south: lat - 0.001,
                north: lat + 0.001,
                west: lng - 0.001,
                east: lng + 0.001
            }, 15); // Default zoom level for single restaurant
        }
    }

    /**
     * Get a restaurant by ID with all its data
     * @param {string} id - Restaurant ID
     * @returns {Object|null} - Complete restaurant data or null if not found
     */
    getRestaurant(id) {
        const basic = this.restaurants.get(id);
        if (!basic) return null;

        const coordinates = this.getCoordinates(id);
        if (!coordinates) return null;

        return {
            ...basic,
            ...coordinates,
            tags: Array.from(this.tags.get(id) || []),
            comments: this.comments.get(id) || [],
            ratings: this.ratings.get(id) || {},
            stats: {
                views: this.viewCount.get(id) || 0,
                updates: this.updateCount.get(id) || 0
            }
        };
    }

    /**
     * Get restaurants in viewport
     * @param {Object} bounds - Viewport bounds
     * @param {number} zoom - Current zoom level
     * @returns {Object} - Query results and metadata
     */
    getRestaurantsInViewport(bounds, zoom) {
        // Track viewport access
        const results = this.spatialCache.getRestaurantsInViewport(bounds, zoom);
        
        // Update view counts
        results.restaurants.forEach(r => {
            this.viewCount.set(r.id, (this.viewCount.get(r.id) || 0) + 1);
        });

        return results;
    }

    /**
     * Batch update restaurants
     * @param {Array} restaurants - Array of restaurant data
     * @param {Object} bounds - Viewport bounds
     * @param {number} zoom - Current zoom level
     */
    batchUpdate(restaurants, bounds, zoom) {
        restaurants.forEach(r => this.upsertRestaurant(r));
        this.spatialCache.addRestaurants(
            restaurants.map(r => this.getRestaurant(r.id)).filter(r => r),
            bounds,
            zoom
        );
    }

    /**
     * Clear all data
     */
    clear() {
        this.coordinates = new Float64Array(this.coordinates.length);
        this.coordinateMap.clear();
        this.nextCoordinateIndex = 0;
        
        this.restaurants.clear();
        this.amenities.clear();
        this.ratings.clear();
        this.tags.clear();
        this.comments.clear();
        
        this.viewCount.clear();
        this.updateCount.clear();
        
        this.spatialCache.clear();
    }
}

export default RestaurantDataStore;
