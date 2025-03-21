/**
 * Service for handling errors and providing fallback mechanisms
 */
class ErrorBoundaryService {
    constructor(options = {}) {
        this.options = {
            maxRetries: options.maxRetries || 3,
            initialRetryDelay: options.initialRetryDelay || 1000,
            maxRetryDelay: options.maxRetryDelay || 30000,
            offlineThreshold: options.offlineThreshold || 3, // Number of failures before assuming offline
            ...options
        };

        // Error tracking
        this.errorCounts = new Map();
        this.lastErrors = new Map();
        this.offlineMode = false;
        this.errorHandlers = new Map();
        this.fallbackStrategies = new Map();

        // Initialize error tracking cleanup
        setInterval(() => this.cleanupErrorTracking(), 60000); // Cleanup every minute
    }

    /**
     * Register an error handler for a specific error type
     * @param {string} errorType - Type of error to handle
     * @param {Function} handler - Error handler function
     */
    registerErrorHandler(errorType, handler) {
        this.errorHandlers.set(errorType, handler);
    }

    /**
     * Register a fallback strategy for a specific operation
     * @param {string} operation - Operation type
     * @param {Function} strategy - Fallback strategy function
     */
    registerFallbackStrategy(operation, strategy) {
        this.fallbackStrategies.set(operation, strategy);
    }

    /**
     * Execute an operation with error handling and retries
     * @param {Function} operation - Operation to execute
     * @param {Object} options - Operation options
     * @returns {Promise} Operation result
     */
    async executeWithRetry(operation, options = {}) {
        const {
            retryable = true,
            operationType = 'default',
            context = {},
            maxRetries = this.options.maxRetries
        } = options;

        let attempt = 0;
        let lastError = null;

        while (attempt <= maxRetries) {
            try {
                // Check if we're in offline mode
                if (this.offlineMode && this.fallbackStrategies.has(operationType)) {
                    return await this.executeFallbackStrategy(operationType, context);
                }

                const result = await operation();
                this.recordSuccess(operationType);
                return result;
            } catch (error) {
                lastError = error;
                this.recordError(operationType, error);

                if (!retryable || attempt >= maxRetries) {
                    break;
                }

                // Handle specific error types
                if (this.errorHandlers.has(error.name)) {
                    await this.errorHandlers.get(error.name)(error, context);
                }

                // Wait before retrying
                const delay = this.calculateRetryDelay(attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
            }
        }

        // If all retries failed, try fallback strategy
        if (this.fallbackStrategies.has(operationType)) {
            return await this.executeFallbackStrategy(operationType, context);
        }

        throw lastError;
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} attempt - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attempt) {
        const delay = Math.min(
            this.options.initialRetryDelay * Math.pow(2, attempt),
            this.options.maxRetryDelay
        );
        return delay + Math.random() * 100; // Add jitter
    }

    /**
     * Execute a fallback strategy
     * @param {string} operationType - Type of operation
     * @param {Object} context - Operation context
     * @returns {Promise} Fallback result
     */
    async executeFallbackStrategy(operationType, context) {
        const strategy = this.fallbackStrategies.get(operationType);
        if (!strategy) {
            throw new Error(`No fallback strategy for operation: ${operationType}`);
        }

        try {
            return await strategy(context);
        } catch (error) {
            console.error(`Fallback strategy failed for ${operationType}:`, error);
            throw error;
        }
    }

    /**
     * Record a successful operation
     * @param {string} operationType - Type of operation
     */
    recordSuccess(operationType) {
        this.errorCounts.delete(operationType);
        this.lastErrors.delete(operationType);
        
        // If we were in offline mode and got a success, we're back online
        if (this.offlineMode) {
            this.offlineMode = false;
            this.emitOnlineStatus(true);
        }
    }

    /**
     * Record an error for tracking
     * @param {string} operationType - Type of operation
     * @param {Error} error - Error that occurred
     */
    recordError(operationType, error) {
        const count = (this.errorCounts.get(operationType) || 0) + 1;
        this.errorCounts.set(operationType, count);
        this.lastErrors.set(operationType, {
            error,
            timestamp: Date.now()
        });

        // Check if we should enter offline mode
        if (count >= this.options.offlineThreshold && !this.offlineMode) {
            this.offlineMode = true;
            this.emitOnlineStatus(false);
        }
    }

    /**
     * Clean up old error tracking data
     */
    cleanupErrorTracking() {
        const now = Date.now();
        const maxAge = 3600000; // 1 hour

        for (const [operationType, errorInfo] of this.lastErrors.entries()) {
            if (now - errorInfo.timestamp > maxAge) {
                this.lastErrors.delete(operationType);
                this.errorCounts.delete(operationType);
            }
        }
    }

    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getErrorStats() {
        const stats = {};
        for (const [operationType, count] of this.errorCounts.entries()) {
            const lastError = this.lastErrors.get(operationType);
            stats[operationType] = {
                errorCount: count,
                lastError: lastError ? {
                    message: lastError.error.message,
                    timestamp: lastError.timestamp
                } : null
            };
        }
        return {
            offlineMode: this.offlineMode,
            operationStats: stats
        };
    }

    /**
     * Emit online status change
     * @param {boolean} online - Whether we're online
     */
    emitOnlineStatus(online) {
        // Dispatch custom event for online/offline status
        window.dispatchEvent(new CustomEvent('connectivityChange', {
            detail: { online }
        }));
    }

    /**
     * Clear error tracking data
     */
    clear() {
        this.errorCounts.clear();
        this.lastErrors.clear();
        this.offlineMode = false;
    }
}

// Create and export singleton instance
const errorBoundaryService = new ErrorBoundaryService();

// Register default error handlers
errorBoundaryService.registerErrorHandler('NetworkError', async (error, context) => {
    // Check network connectivity
    if (!navigator.onLine) {
        errorBoundaryService.offlineMode = true;
        errorBoundaryService.emitOnlineStatus(false);
    }
});

errorBoundaryService.registerErrorHandler('TimeoutError', async (error, context) => {
    // Increase timeout for subsequent retries
    context.timeout = (context.timeout || 30000) * 1.5;
});

// Default fallback strategy for restaurant data
errorBoundaryService.registerFallbackStrategy('fetchRestaurants', async (context) => {
    // Try to get data from cache only
    const cache = context.cache;
    if (cache) {
        return await cache.getRestaurants(context.bounds, context.zoom);
    }
    return { restaurants: [], needsUpdate: true };
});

export default errorBoundaryService;
