import { FilterProcessor } from './FilterProcessor.js';
import RestaurantDataStore from './RestaurantDataStore.js';
import MarkerManager from './MarkerManager.js';

/**
 * Manages restaurant filtering with caching and composite operations
 */
class FilterEngine {
    constructor() {
        this.processor = new FilterProcessor();
        this.activeFilters = new Map();
        this.filterCache = new Map();
        this.lastResults = null;

        // Filter definitions with validation and processing rules
        this.filterTypes = {
            rating: {
                validate: (value) => {
                    const num = parseFloat(value);
                    return !isNaN(num) && num >= 0 && num <= 5;
                },
                process: (restaurant, value, type) => {
                    const rating = restaurant.ratings?.[type];
                    return rating !== null && rating >= value;
                }
            },
            tags: {
                validate: (value) => Array.isArray(value) && value.every(t => typeof t === 'string'),
                process: (restaurant, tags) => {
                    const restaurantTags = new Set(restaurant.tags?.map(t => t.toLowerCase()));
                    return tags.every(tag => 
                        Array.from(restaurantTags).some(t => t.includes(tag.toLowerCase()))
                    );
                }
            },
            amenity: {
                validate: (value) => typeof value === 'string' && value.length > 0,
                process: (restaurant, value) => restaurant.amenity === value
            },
            hasReviews: {
                validate: (value) => typeof value === 'boolean',
                process: (restaurant) => {
                    return restaurant.reviews?.length > 0 || restaurant.tags?.length > 0;
                }
            }
        };

        // Composite filter operations
        this.operations = {
            AND: (filters) => (restaurant) => 
                filters.every(filter => this.evaluateFilter(filter, restaurant)),
            OR: (filters) => (restaurant) => 
                filters.some(filter => this.evaluateFilter(filter, restaurant)),
            NOT: (filter) => (restaurant) => 
                !this.evaluateFilter(filter, restaurant)
        };
    }

    /**
     * Add or update a filter
     * @param {string} id - Filter identifier
     * @param {Object} filter - Filter configuration
     */
    setFilter(id, filter) {
        if (!this.validateFilter(filter)) {
            throw new Error(`Invalid filter configuration: ${id}`);
        }

        this.activeFilters.set(id, filter);
        this.invalidateCache();
    }

    /**
     * Remove a filter
     * @param {string} id - Filter identifier
     */
    removeFilter(id) {
        if (this.activeFilters.delete(id)) {
            this.invalidateCache();
        }
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        this.activeFilters.clear();
        this.invalidateCache();
    }

    /**
     * Apply all active filters
     * @param {Array} restaurants - Restaurants to filter
     * @returns {Object} Filter results and metadata
     */
    applyFilters(restaurants = null) {
        const startTime = performance.now();

        // Use cached results if available
        const cacheKey = this.generateCacheKey();
        if (this.filterCache.has(cacheKey) && !restaurants) {
            return this.filterCache.get(cacheKey);
        }

        // Get restaurants from store if not provided
        restaurants = restaurants || RestaurantDataStore.getAllRestaurants();

        // Create composite filter function
        const filterFn = this.createCompositeFilter();

        // Apply filters and measure performance
        const results = this.processor.processFilters(
            restaurants,
            filterFn,
            this.activeFilters
        );

        // Cache results
        const metadata = {
            totalProcessed: restaurants.length,
            matchingResults: results.length,
            processingTime: performance.now() - startTime
        };

        const filterResults = {
            results,
            metadata,
            timestamp: Date.now()
        };

        this.filterCache.set(cacheKey, filterResults);
        this.lastResults = filterResults;

        // Update markers
        this.updateMarkers(results);

        return filterResults;
    }

    /**
     * Create composite filter function from active filters
     * @returns {Function} Composite filter function
     */
    createCompositeFilter() {
        const filters = Array.from(this.activeFilters.entries())
            .map(([id, filter]) => {
                if (filter.operation) {
                    return this.operations[filter.operation](filter.filters);
                }
                return (restaurant) => this.evaluateFilter(filter, restaurant);
            });

        return this.operations.AND(filters);
    }

    /**
     * Evaluate a single filter against a restaurant
     * @param {Object} filter - Filter configuration
     * @param {Object} restaurant - Restaurant to evaluate
     * @returns {boolean} Filter result
     */
    evaluateFilter(filter, restaurant) {
        const type = this.filterTypes[filter.type];
        if (!type) return true;

        return type.process(restaurant, filter.value, filter.subtype);
    }

    /**
     * Validate filter configuration
     * @param {Object} filter - Filter configuration
     * @returns {boolean} Validation result
     */
    validateFilter(filter) {
        // Handle composite filters
        if (filter.operation) {
            if (!this.operations[filter.operation]) return false;
            return filter.filters.every(f => this.validateFilter(f));
        }

        // Handle basic filters
        const type = this.filterTypes[filter.type];
        if (!type) return false;

        return type.validate(filter.value);
    }

    /**
     * Generate cache key for current filter state
     * @returns {string} Cache key
     */
    generateCacheKey() {
        const filterState = Array.from(this.activeFilters.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([id, filter]) => `${id}:${JSON.stringify(filter)}`)
            .join('|');

        return crypto.createHash('md5').update(filterState).digest('hex');
    }

    /**
     * Invalidate filter cache
     */
    invalidateCache() {
        this.filterCache.clear();
        this.lastResults = null;
    }

    /**
     * Update markers based on filter results
     * @param {Array} results - Filtered restaurants
     */
    updateMarkers(results) {
        const visibleIds = new Set(results.map(r => r.id));
        
        MarkerManager.updateVisibility(marker => 
            visibleIds.has(marker.restaurantData?.id)
        );
    }

    /**
     * Get active filters
     * @returns {Map} Active filters
     */
    getActiveFilters() {
        return new Map(this.activeFilters);
    }

    /**
     * Get last filter results
     * @returns {Object} Last filter results
     */
    getLastResults() {
        return this.lastResults;
    }

    /**
     * Get filter metrics
     * @returns {Object} Filter metrics
     */
    getMetrics() {
        return {
            activeFilters: this.activeFilters.size,
            cacheSize: this.filterCache.size,
            lastProcessingTime: this.lastResults?.metadata.processingTime,
            matchRate: this.lastResults ? 
                this.lastResults.metadata.matchingResults / this.lastResults.metadata.totalProcessed : 
                null
        };
    }
}

export default new FilterEngine();
