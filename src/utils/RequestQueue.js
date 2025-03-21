/**
 * Priority queue for managing API requests with support for cancellation
 */
class RequestQueue {
    constructor(options = {}) {
        this.options = {
            maxConcurrent: options.maxConcurrent || 4,
            defaultPriority: options.defaultPriority || 1,
            ...options
        };

        // Queue buckets by priority (higher number = higher priority)
        this.queues = new Map();
        
        // Track running requests
        this.running = new Set();
        this.runningCount = 0;
    }

    /**
     * Add a request to the queue
     * @param {Object} request - Request configuration
     * @param {number} priority - Request priority (higher = more important)
     * @returns {Promise} - Promise that resolves with request result
     */
    enqueue(request, priority = this.options.defaultPriority) {
        return new Promise((resolve, reject) => {
            const queueItem = {
                request,
                priority,
                resolve,
                reject,
                cancelled: false,
                controller: new AbortController()
            };

            if (!this.queues.has(priority)) {
                this.queues.set(priority, []);
            }
            
            this.queues.get(priority).push(queueItem);
            this.processQueue();
        });
    }

    /**
     * Process queued requests
     */
    async processQueue() {
        if (this.runningCount >= this.options.maxConcurrent) {
            return;
        }

        const nextItem = this.getNextItem();
        if (!nextItem) {
            return;
        }

        this.runningCount++;
        this.running.add(nextItem);

        try {
            // Add signal to request config
            const requestConfig = {
                ...nextItem.request,
                signal: nextItem.controller.signal
            };

            const result = await this.executeRequest(requestConfig);
            
            if (!nextItem.cancelled) {
                nextItem.resolve(result);
            }
        } catch (error) {
            if (!nextItem.cancelled) {
                nextItem.reject(error);
            }
        } finally {
            this.runningCount--;
            this.running.delete(nextItem);
            this.processQueue();
        }
    }

    /**
     * Get the next item from the queue based on priority
     * @returns {Object|null} Next queue item or null if queue is empty
     */
    getNextItem() {
        // Get all priorities in descending order
        const priorities = Array.from(this.queues.keys()).sort((a, b) => b - a);

        for (const priority of priorities) {
            const queue = this.queues.get(priority);
            
            // Remove cancelled requests
            while (queue.length > 0 && queue[0].cancelled) {
                queue.shift();
            }

            if (queue.length > 0) {
                const item = queue.shift();
                
                // Clean up empty queues
                if (queue.length === 0) {
                    this.queues.delete(priority);
                }
                
                return item;
            }
        }

        return null;
    }

    /**
     * Execute a request with timeout and error handling
     * @param {Object} config - Request configuration
     * @returns {Promise} Request result
     */
    async executeRequest(config) {
        const { signal, ...requestConfig } = config;

        try {
            const response = await fetch(requestConfig.url, {
                ...requestConfig,
                signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }
            throw error;
        }
    }

    /**
     * Cancel all requests with a given fingerprint
     * @param {string} fingerprint - Request fingerprint to cancel
     */
    cancelRequests(fingerprint) {
        // Cancel queued requests
        for (const [priority, queue] of this.queues.entries()) {
            const updatedQueue = queue.map(item => {
                if (item.request.fingerprint === fingerprint) {
                    item.cancelled = true;
                    item.controller.abort();
                }
                return item;
            });
            this.queues.set(priority, updatedQueue);
        }

        // Cancel running requests
        for (const item of this.running) {
            if (item.request.fingerprint === fingerprint) {
                item.cancelled = true;
                item.controller.abort();
            }
        }
    }

    /**
     * Clear all queued requests
     */
    clear() {
        // Cancel all queued requests
        for (const [priority, queue] of this.queues.entries()) {
            queue.forEach(item => {
                item.cancelled = true;
                item.controller.abort();
            });
        }
        this.queues.clear();

        // Cancel running requests
        for (const item of this.running) {
            item.cancelled = true;
            item.controller.abort();
        }
        this.running.clear();
        this.runningCount = 0;
    }

    /**
     * Get current queue statistics
     * @returns {Object} Queue statistics
     */
    getStats() {
        const queueSizes = {};
        for (const [priority, queue] of this.queues.entries()) {
            queueSizes[priority] = queue.length;
        }

        return {
            running: this.runningCount,
            queued: Array.from(this.queues.values())
                .reduce((total, queue) => total + queue.length, 0),
            queuesByPriority: queueSizes
        };
    }
}

export default RequestQueue;
