import debounce from '../utils/debounce.js';

/**
 * Service for handling API requests to the backend
 */
class ApiService {
    constructor() {
        this.lastFetchedBounds = null;
        this.lastZoom = null;
        this.restaurantDataCache = new Map();
        this.cachedRestaurants = new Map(); // Store by OSM ID to avoid duplicates
        this.RATE_LIMIT = 300; // 300ms debounce time for fetching restaurants
    }

    /**
     * Check if current bounds are significantly different from last fetched bounds
     * 
     * @param {L.LatLngBounds} currentBounds - Current map bounds
     * @param {L.LatLngBounds} lastBounds - Last fetched bounds
     * @param {number} currentZoom - Current map zoom level
     * @param {number} threshold - Threshold for determining significant change (0-1)
     * @returns {boolean} - Whether bounds have changed significantly
     */

    boundsChanged(currentBounds, lastBounds, currentZoom, threshold = 0.05) {
        if (!lastBounds) return true;
        
        // Always fetch if zoom level changed
        if (currentZoom !== this.lastZoom) return true;
        
        const currentCenter = currentBounds.getCenter();
        const lastCenter = lastBounds.getCenter();
        
        // Calculate distance between centers as a percentage of the viewport size
        const viewportWidth = currentBounds.getEast() - currentBounds.getWest();
        const viewportHeight = currentBounds.getNorth() - currentBounds.getSouth();
        
        const latDiff = Math.abs(currentCenter.lat - lastCenter.lat) / viewportHeight;
        const lngDiff = Math.abs(currentCenter.lng - lastCenter.lng) / viewportWidth;
        
        // Only fetch if the map has moved by more than the threshold percentage
        return latDiff > threshold || lngDiff > threshold;
    }

    /**
     * Get restaurants within bounds from the cache
     * 
     * @param {L.LatLngBounds} bounds - Map bounds to check
     * @returns {Array} - Array of restaurants within the bounds
     */
    getRestaurantsInBounds(bounds) {
        if (!this.lastFetchedBounds) return [];

        // Convert Map to array and filter by bounds
        return Array.from(this.cachedRestaurants.values()).filter(restaurant => {
            // Check if restaurant coordinates are within current bounds
            return restaurant.lat >= bounds.getSouth() &&
                   restaurant.lat <= bounds.getNorth() &&
                   restaurant.lng >= bounds.getWest() &&
                   restaurant.lng <= bounds.getEast();
        });
    }

    /**
     * Fetch restaurants in the current viewport
     * 
     * @param {L.LatLngBounds} bounds - Current map bounds
     * @param {boolean} forceUpdate - Whether to force an update regardless of cache
     * @returns {Promise<Array>} - Promise resolving to array of restaurant objects
     */
    async fetchRestaurants(bounds, forceUpdate = false, currentZoom = null) {
        // Return cached restaurants if bounds haven't changed significantly and not forced
        if (!forceUpdate && !this.boundsChanged(bounds, this.lastFetchedBounds, currentZoom || this.lastZoom)) {
            console.log('Using cached restaurants - map movement too small');
            return this.getRestaurantsInBounds(bounds);
        }
        
        const params = {
            south: bounds.getSouth(),
            west: bounds.getWest(),
            north: bounds.getNorth(),
            east: bounds.getEast()
        };
        
        console.log('Fetching restaurants with bounds:', params);
        console.log('API Service - fetchRestaurants called');
        
        try {
            const response = await fetch(`/restaurants?south=${params.south}&west=${params.west}&north=${params.north}&east=${params.east}&checkForUpdates=${forceUpdate}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch restaurants: ${response.status} ${response.statusText}`);
            }
            
            const restaurants = await response.json();
            console.log(`Fetched ${restaurants.length} restaurants from server`);
            
            // Update lastFetchedBounds, lastZoom, and cache
            this.lastFetchedBounds = L.latLngBounds(
                [bounds.getSouth(), bounds.getWest()],
                [bounds.getNorth(), bounds.getEast()]
            );
            this.lastZoom = currentZoom;
            
            // Update cache with new restaurants, using OSM ID as key to avoid duplicates
            restaurants.forEach(restaurant => {
                this.cachedRestaurants.set(restaurant.osm_id, restaurant);
            });
            
            return this.getRestaurantsInBounds(bounds);
        } catch (error) {
            console.error('Error fetching restaurants:', error);
            return [];
        }
    }

    /**
     * Get comments for a restaurant
     * 
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<Array>} - Promise resolving to array of comment objects
     */
    async getComments(restaurantId) {
        try {
            const response = await fetch(`/comments/${restaurantId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch comments: ${response.status} ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching comments for restaurant ${restaurantId}:`, error);
            return [];
        }
    }

    /**
     * Get tags for a restaurant
     * 
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<Array>} - Promise resolving to array of tag strings
     */
    async getTags(restaurantId) {
        try {
            const response = await fetch(`/tags/${restaurantId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch tags: ${response.status} ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching tags for restaurant ${restaurantId}:`, error);
            return [];
        }
    }

    /**
     * Submit a review for a restaurant
     * 
     * @param {string} restaurantId - Restaurant ID
     * @param {string} text - Review text
     * @param {Object} ratings - Object containing food, price, and ambience ratings
     * @param {Array} tags - Array of tag strings
     * @returns {Promise<boolean>} - Promise resolving to success status
     */
    async submitReview(restaurantId, text, ratings, tags) {
        try {
            console.log('Submitting review for restaurant:', restaurantId);
            
            // Save comment
            const commentResponse = await fetch('/comments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    restaurantId: restaurantId,
                    text: text || null,
                    foodRating: ratings.food || null,
                    priceRating: ratings.price || null,
                    ambienceRating: ratings.ambience || null
                })
            });

            if (!commentResponse.ok) {
                throw new Error('Failed to save comment: ' + commentResponse.statusText);
            }

            const commentResult = await commentResponse.json();

            // Save tags if any
            if (tags && tags.length > 0) {
                console.log('Saving tags:', tags);
                const tagsResponse = await fetch('/tags', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        restaurantId: restaurantId,
                        tags: tags,
                        commentId: commentResult
                    })
                });

                if (!tagsResponse.ok) {
                    throw new Error('Failed to save tags');
                }
            }

            console.log('Review submitted successfully');
            return true;
        } catch (error) {
            console.error('Error saving review:', error);
            return false;
        }
    }

    /**
     * Search for a city by name
     * 
     * @param {string} query - City name to search for
     * @returns {Promise<Object|null>} - Promise resolving to city location or null if not found
     */
    async searchCity(query) {
        try {
            console.log('Searching for city:', query);
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await response.json();
            console.log('City search results:', data);
            
            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                console.log('Found city location:', { lat, lon });
                return { lat, lon };
            } else {
                console.warn('City not found:', query);
                return null;
            }
        } catch (error) {
            console.error('Error searching city:', error);
            return null;
        }
    }

    /**
     * Create a debounced version of the fetchRestaurants method
     * 
     * @returns {Function} - Debounced fetchRestaurants function
     */
    getDebouncedFetchRestaurants() {
        return debounce(this.fetchRestaurants.bind(this), this.RATE_LIMIT);
    }
}

export default new ApiService();
