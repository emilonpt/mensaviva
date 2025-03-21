/**
 * Processes filters efficiently with worker support and batch operations
 */
export class FilterProcessor {
    constructor(options = {}) {
        this.options = {
            batchSize: options.batchSize || 1000,
            useWorker: options.useWorker || false,
            maxWorkers: options.maxWorkers || navigator.hardwareConcurrency || 4,
            ...options
        };

        // Processing state
        this.processingQueue = [];
        this.workers = new Map();
        this.workerId = 0;

        // Performance tracking
        this.metrics = {
            totalProcessed: 0,
            totalTime: 0,
            batchStats: []
        };

        if (this.options.useWorker) {
            this.initializeWorkers();
        }
    }

    /**
     * Initialize web workers for parallel processing
     */
    initializeWorkers() {
        for (let i = 0; i < this.options.maxWorkers; i++) {
            const worker = new Worker(new URL('./FilterWorker.js', import.meta.url));
            this.workers.set(++this.workerId, {
                worker,
                busy: false,
                processed: 0
            });
        }
    }

    /**
     * Process filters on a dataset
     * @param {Array} data - Data to filter
     * @param {Function} filterFn - Filter function
     * @param {Map} activeFilters - Active filter configurations
     * @returns {Promise<Array>} Filtered results
     */
    async processFilters(data, filterFn, activeFilters) {
        const startTime = performance.now();
        const results = [];

        if (this.options.useWorker && this.workers.size > 0) {
            results.push(...await this.processWithWorkers(data, activeFilters));
        } else {
            results.push(...await this.processInBatches(data, filterFn));
        }

        // Update metrics
        this.updateMetrics(data.length, performance.now() - startTime);

        return results;
    }

    /**
     * Process data in batches
     * @param {Array} data - Data to process
     * @param {Function} filterFn - Filter function
     * @returns {Promise<Array>} Filtered results
     */
    async processInBatches(data, filterFn) {
        const results = [];
        const batches = Math.ceil(data.length / this.options.batchSize);

        for (let i = 0; i < batches; i++) {
            const batchStart = i * this.options.batchSize;
            const batchEnd = Math.min(batchStart + this.options.batchSize, data.length);
            const batch = data.slice(batchStart, batchEnd);

            // Process batch in next animation frame to avoid blocking UI
            const batchResults = await new Promise(resolve => {
                requestAnimationFrame(() => {
                    const batchStartTime = performance.now();
                    const filtered = batch.filter(filterFn);
                    
                    this.recordBatchStats(batch.length, filtered.length, performance.now() - batchStartTime);
                    resolve(filtered);
                });
            });

            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Process data using web workers
     * @param {Array} data - Data to process
     * @param {Map} activeFilters - Active filter configurations
     * @returns {Promise<Array>} Filtered results
     */
    async processWithWorkers(data, activeFilters) {
        const batches = this.createBatches(data);
        const results = [];

        // Process batches with available workers
        await Promise.all(
            batches.map(batch => this.processWithWorker(batch, activeFilters))
        ).then(batchResults => {
            batchResults.forEach(filtered => results.push(...filtered));
        });

        return results;
    }

    /**
     * Process a batch with a worker
     * @param {Array} batch - Data batch
     * @param {Map} activeFilters - Active filter configurations
     * @returns {Promise<Array>} Filtered results
     */
    async processWithWorker(batch, activeFilters) {
        const worker = await this.getAvailableWorker();
        
        return new Promise((resolve, reject) => {
            const startTime = performance.now();
            
            worker.worker.onmessage = (e) => {
                const { results, processedCount } = e.data;
                worker.processed += processedCount;
                worker.busy = false;
                
                this.recordBatchStats(
                    batch.length, 
                    results.length,
                    performance.now() - startTime
                );
                
                resolve(results);
            };

            worker.worker.onerror = (error) => {
                worker.busy = false;
                reject(error);
            };

            worker.busy = true;
            worker.worker.postMessage({
                batch,
                filters: Array.from(activeFilters.entries())
            });
        });
    }

    /**
     * Get an available worker
     * @returns {Promise<Object>} Available worker
     */
    async getAvailableWorker() {
        const checkWorkers = () => {
            for (const [id, worker] of this.workers) {
                if (!worker.busy) return worker;
            }
            return null;
        };

        let worker = checkWorkers();
        if (worker) return worker;

        // Wait for a worker to become available
        return new Promise(resolve => {
            const interval = setInterval(() => {
                worker = checkWorkers();
                if (worker) {
                    clearInterval(interval);
                    resolve(worker);
                }
            }, 10);
        });
    }

    /**
     * Create batches from data
     * @param {Array} data - Data to batch
     * @returns {Array} Array of batches
     */
    createBatches(data) {
        const batches = [];
        const batchSize = Math.ceil(data.length / this.options.maxWorkers);

        for (let i = 0; i < data.length; i += batchSize) {
            batches.push(data.slice(i, i + batchSize));
        }

        return batches;
    }

    /**
     * Record batch processing statistics
     * @param {number} inputSize - Input batch size
     * @param {number} outputSize - Output batch size
     * @param {number} time - Processing time
     */
    recordBatchStats(inputSize, outputSize, time) {
        this.metrics.batchStats.push({
            inputSize,
            outputSize,
            time,
            timestamp: Date.now()
        });

        // Keep only recent stats
        if (this.metrics.batchStats.length > 100) {
            this.metrics.batchStats.shift();
        }
    }

    /**
     * Update overall processing metrics
     * @param {number} processed - Number of items processed
     * @param {number} time - Processing time
     */
    updateMetrics(processed, time) {
        this.metrics.totalProcessed += processed;
        this.metrics.totalTime += time;
    }

    /**
     * Get processing metrics
     * @returns {Object} Processing metrics
     */
    getMetrics() {
        const recentBatches = this.metrics.batchStats.slice(-10);
        const averageBatchTime = recentBatches.reduce((sum, stat) => sum + stat.time, 0) / recentBatches.length;

        return {
            totalProcessed: this.metrics.totalProcessed,
            totalTime: this.metrics.totalTime,
            averageBatchTime,
            workerUtilization: this.options.useWorker ? 
                Array.from(this.workers.values()).map(w => ({
                    processed: w.processed,
                    busy: w.busy
                })) : null
        };
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.workers.forEach((worker) => worker.worker.terminate());
        this.workers.clear();
        this.processingQueue = [];
        this.metrics = {
            totalProcessed: 0,
            totalTime: 0,
            batchStats: []
        };
    }
}

/**
 * Create a serializable filter function
 * @param {Object} filter - Filter configuration
 * @returns {string} Serialized filter function
 */
export function createSerializableFilter(filter) {
    const filterCode = `
        return function(restaurant) {
            ${generateFilterCode(filter)}
        };
    `;
    return new Function(filterCode)();
}

/**
 * Generate filter code for serialization
 * @param {Object} filter - Filter configuration
 * @returns {string} Generated filter code
 */
function generateFilterCode(filter) {
    if (filter.operation) {
        const subFilters = filter.filters.map(generateFilterCode);
        switch (filter.operation) {
            case 'AND':
                return `return (${subFilters.join(') && (')});`;
            case 'OR':
                return `return (${subFilters.join(') || (')});`;
            case 'NOT':
                return `return !(${generateFilterCode(filter.filters[0])});`;
            default:
                throw new Error(`Unknown operation: ${filter.operation}`);
        }
    }

    switch (filter.type) {
        case 'rating':
            return `
                const rating = restaurant.ratings?.${filter.subtype};
                return rating !== null && rating >= ${filter.value};
            `;
        case 'tags':
            return `
                const tags = new Set((restaurant.tags || []).map(t => t.toLowerCase()));
                return ${JSON.stringify(filter.value)}.every(tag =>
                    Array.from(tags).some(t => t.includes(tag.toLowerCase()))
                );
            `;
        case 'amenity':
            return `return restaurant.amenity === ${JSON.stringify(filter.value)};`;
        case 'hasReviews':
            return `
                return restaurant.reviews?.length > 0 || restaurant.tags?.length > 0;
            `;
        default:
            return 'return true;';
    }
}
