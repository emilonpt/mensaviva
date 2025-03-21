/**
 * Web Worker for parallel filter processing
 */

// Cache for compiled filter functions
const filterFunctionCache = new Map();

/**
 * Handle messages from main thread
 */
self.onmessage = function(e) {
    const { batch, filters } = e.data;
    
    try {
        // Create filter function if not cached
        const filterFn = getFilterFunction(filters);
        
        // Process batch
        const results = batch.filter(item => filterFn(item));
        
        // Send results back
        self.postMessage({
            results,
            processedCount: batch.length,
            error: null
        });
    } catch (error) {
        self.postMessage({
            results: [],
            processedCount: 0,
            error: error.message
        });
    }
};

/**
 * Get or create filter function
 * @param {Array} filters - Array of filter configurations
 * @returns {Function} Compiled filter function
 */
function getFilterFunction(filters) {
    const filterKey = JSON.stringify(filters);
    
    if (filterFunctionCache.has(filterKey)) {
        return filterFunctionCache.get(filterKey);
    }

    const filterFn = createFilterFunction(filters);
    filterFunctionCache.set(filterKey, filterFn);
    
    return filterFn;
}

/**
 * Create composite filter function
 * @param {Array} filters - Array of filter configurations
 * @returns {Function} Composite filter function
 */
function createFilterFunction(filters) {
    const filterCode = `
        return function(restaurant) {
            return ${generateFilterCode(filters)};
        }
    `;

    try {
        return new Function(filterCode)();
    } catch (error) {
        console.error('Error creating filter function:', error);
        throw new Error('Invalid filter configuration');
    }
}

/**
 * Generate filter code
 * @param {Array} filters - Array of filter configurations
 * @returns {string} Generated filter code
 */
function generateFilterCode(filters) {
    return filters.map(([id, filter]) => {
        if (filter.operation) {
            return generateOperationCode(filter);
        }
        return generateBasicFilterCode(filter);
    }).join(' && ');
}

/**
 * Generate code for composite operations
 * @param {Object} filter - Filter configuration
 * @returns {string} Generated operation code
 */
function generateOperationCode(filter) {
    const subFilters = filter.filters.map(f => 
        f.operation ? generateOperationCode(f) : generateBasicFilterCode(f)
    );

    switch (filter.operation) {
        case 'AND':
            return `(${subFilters.join(') && (')})`;
        case 'OR':
            return `(${subFilters.join(') || (')})`;
        case 'NOT':
            return `!(${subFilters[0]})`;
        default:
            throw new Error(`Unknown operation: ${filter.operation}`);
    }
}

/**
 * Generate code for basic filters
 * @param {Object} filter - Filter configuration
 * @returns {string} Generated filter code
 */
function generateBasicFilterCode(filter) {
    switch (filter.type) {
        case 'rating':
            return `
                (function() {
                    const rating = restaurant.ratings?.${filter.subtype};
                    return rating !== null && rating >= ${filter.value};
                })()
            `;

        case 'tags':
            return `
                (function() {
                    const tags = new Set((restaurant.tags || []).map(t => t.toLowerCase()));
                    return ${JSON.stringify(filter.value)}.every(tag =>
                        Array.from(tags).some(t => t.includes(tag.toLowerCase()))
                    );
                })()
            `;

        case 'amenity':
            return `restaurant.amenity === ${JSON.stringify(filter.value)}`;

        case 'hasReviews':
            return `
                (function() {
                    return restaurant.reviews?.length > 0 || restaurant.tags?.length > 0;
                })()
            `;

        default:
            return 'true';
    }
}

/**
 * Clear function cache
 */
function clearCache() {
    filterFunctionCache.clear();
}

// Handle error events
self.onerror = function(error) {
    self.postMessage({
        results: [],
        processedCount: 0,
        error: error.message
    });
};

// Handle unhandled promise rejections
self.onunhandledrejection = function(event) {
    self.postMessage({
        results: [],
        processedCount: 0,
        error: event.reason
    });
};
