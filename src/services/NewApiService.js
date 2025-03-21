import RequestQueue from '../utils/RequestQueue.js';
import errorBoundaryService from './ErrorBoundaryService.js';

/**
 * Enhanced API service with rate limiting, request deduplication, bulk operations,
 * and comprehensive error handling
 */
class ApiService {
    constructor(options = {}) {
        this.options = {
            baseUrl: options.baseUrl || '',
            baseDelay: options.baseDelay || 300, // Base delay for rate limiting
            maxRetries: options.maxRetries || 3,
            maxConcurrent: options.maxConcurrent || 4,
            requestTimeout: options.requestTimeout || 30000,
            ...options
        };

        // Initialize request queue
        this.requestQueue = new RequestQueue({
            maxConcurrent: this.options.maxConcurrent,
            defaultPriority: 1
        });

        // Request tracking
        this.pendingRequests = new Map();
        this.requestCache = new Map();
    }

    /**
     * Generate a unique key for a request
     * @param {string} endpoint - API endpoint
     * @param {Object} params - Request parameters
     * @returns {string} Request fingerprint
     */
    generateRequestKey(endpoint, params) {
        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${key}:${JSON.stringify(params[key])}`)
            .join('|');
        return `${endpoint}|${sortedParams}`;
    }

    /**
     * Make an API request with retries and rate limiting
     * @param {Object} config - Request configuration
     * @returns {Promise} API response
     */
    async makeRequest(config) {
        const {
            endpoint,
            params = {},
            method = 'GET',
            body = null,
            priority = 1,
            fingerprint = this.generateRequestKey(endpoint, params)
        } = config;

        // Create context for error handling
        const context = {
            endpoint,
            params,
            cache: this.requestCache,
            timeout: this.options.requestTimeout
        };

        return errorBoundaryService.executeWithRetry(
            async () => {
                // Check for existing identical request
                if (this.pendingRequests.has(fingerprint)) {
                    return this.pendingRequests.get(fingerprint);
                }

                // Build URL with parameters
                const url = new URL(endpoint, this.options.baseUrl);
                Object.entries(params).forEach(([key, value]) => {
                    url.searchParams.append(key, value);
                });

                // Create request configuration
                const requestConfig = {
                    url,
                    method,
                    body: body ? JSON.stringify(body) : null,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    fingerprint,
                    timeout: context.timeout,
                    retries: this.options.maxRetries
                };

                // Create request promise
                const requestPromise = this.requestQueue.enqueue(requestConfig, priority);
                this.pendingRequests.set(fingerprint, requestPromise);

                try {
                    const response = await requestPromise;
                    this.requestCache.set(fingerprint, response);
                    return response;
                } finally {
                    this.pendingRequests.delete(fingerprint);
                }
            },
            {
                retryable: true,
                operationType: `${method}:${endpoint}`,
                context
            }
        );
    }

    /**
     * Cancel all pending requests for a viewport
     * @param {Object} bounds - Viewport bounds
     */
    cancelPendingViewportRequests(bounds) {
        const fingerprint = this.generateRequestKey('/restaurants', {
            south: bounds.south,
            west: bounds.west,
            north: bounds.north,
            east: bounds.east
        });
        this.requestQueue.cancelRequests(fingerprint);
    }

    /**
     * Fetch restaurants in viewport with error handling and fallback
     * @param {Object} bounds - Viewport bounds
     * @param {boolean} forceUpdate - Force cache update
     * @param {number} zoom - Current zoom level
     * @returns {Promise<Array>} Array of restaurants
     */
    async fetchRestaurants(bounds, forceUpdate = false, zoom = 15) {
        // Cancel any pending requests for different viewport bounds
        this.cancelPendingViewportRequests(bounds);

        const context = {
            bounds,
            zoom,
            cache: this.requestCache
        };

        return errorBoundaryService.executeWithRetry(
            () => this.makeRequest({
                endpoint: '/restaurants',
                params: {
                    south: bounds.south,
                    west: bounds.west,
                    north: bounds.north,
                    east: bounds.east,
                    zoom,
                    forceUpdate
                },
                priority: 2 // Higher priority for viewport updates
            }),
            {
                retryable: true,
                operationType: 'fetchRestaurants',
                context
            }
        );
    }

    /**
     * Bulk fetch restaurant details
     * @param {Array} restaurantIds - Array of restaurant IDs
     * @returns {Promise<Object>} Restaurant details
     */
    async bulkFetchDetails(restaurantIds) {
        return this.makeRequest({
            endpoint: '/restaurants/bulk',
            method: 'POST',
            body: { ids: restaurantIds }
        });
    }

    /**
     * Submit a review
     * @param {Object} review - Review data
     * @returns {Promise<Object>} Review submission result
     */
    async submitReview(review) {
        return this.makeRequest({
            endpoint: '/reviews',
            method: 'POST',
            body: review,
            priority: 3 // Highest priority for user actions
        });
    }

    /**
     * Search for a location
     * @param {string} query - Search query
     * @returns {Promise<Object>} Search results
     */
    async searchLocation(query) {
        return this.makeRequest({
            endpoint: '/search',
            params: { q: query },
            priority: 3
        });
    }

    /**
     * Get current request queue statistics
     * @returns {Object} Queue statistics
     */
    getQueueStats() {
        return this.requestQueue.getStats();
    }

    /**
     * Clear all pending requests and caches
     */
    clear() {
        this.requestQueue.clear();
        this.pendingRequests.clear();
        this.requestCache.clear();
    }
}

export default new ApiService();
