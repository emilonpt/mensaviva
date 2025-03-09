import debounce from '../utils/debounce.js';

/**
 * Service for handling API requests to the backend
 */
class ApiService {
    constructor() {
        this.lastFetchedBounds = null;
        this.restaurantDataCache = new Map();
        this.RATE_LIMIT = 300; // 300ms debounce time for fetching restaurants
    }

    /**
     * Check if current bounds are significantly different from last fetched bounds
     * 
     * @param {L.LatLngBounds} currentBounds - Current map bounds
     * @param {L.LatLngBounds} lastBounds - Last fetched bounds
     * @param {number} threshold - Threshold for determining significant change (0-1)
     * @returns {boolean} - Whether bounds have changed significantly
     */
    boundsChanged(currentBounds, lastBounds, threshold = 0.2) {
        if (!lastBounds) return true;
        
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
     * Fetch restaurants in the current viewport
     * 
     * @param {L.LatLngBounds} bounds - Current map bounds
     * @param {boolean} forceUpdate - Whether to force an update regardless of cache
     * @returns {Promise<Array>} - Promise resolving to array of restaurant objects
     */
    async fetchRestaurants(bounds, forceUpdate = false) {
        // Skip fetch if bounds haven't changed significantly and not forced
        if (!forceUpdate && !this.boundsChanged(bounds, this.lastFetchedBounds)) {
            console.log('Skipping fetch - map movement too small');
            return [];
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
            
            // Update lastFetchedBounds
            this.lastFetchedBounds = L.latLngBounds(
                [bounds.getSouth(), bounds.getWest()],
                [bounds.getNorth(), bounds.getEast()]
            );
            
            return restaurants;
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
