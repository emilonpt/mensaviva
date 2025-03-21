import MarkerManager from './MarkerManager.js';
import RestaurantDataStore from './RestaurantDataStore.js';
import SpatialCacheManager from '../utils/SpatialCacheManager.js';
import FilterEngine from './FilterEngine.js';
import SearchEngine from './SearchEngine.js';

/**
 * Manages memory usage and garbage collection across the application
 */
class MemoryManager {
    constructor(options = {}) {
        this.options = {
            maxMemoryUsage: options.maxMemoryUsage || 200 * 1024 * 1024, // 200MB
            gcThreshold: options.gcThreshold || 0.8, // 80% of max memory
            cleanupInterval: options.cleanupInterval || 60000, // 1 minute
            metricsRetention: options.metricsRetention || 3600000, // 1 hour
            unusedTimeout: options.unusedTimeout || 300000, // 5 minutes
            ...options
        };

        // Memory usage tracking
        this.metrics = {
            timestamps: [],
            memoryUsage: [],
            gcEvents: [],
            leakSuspects: new Map()
        };

        // Resource tracking
        this.resourceUsage = new Map();
        this.lastAccess = new Map();
        
        // Start monitoring
        this.startMonitoring();
    }

    /**
     * Start memory monitoring
     */
    startMonitoring() {
        // Regular cleanup check
        this.cleanupInterval = setInterval(() => {
            this.checkMemoryUsage();
        }, this.options.cleanupInterval);

        // Performance monitoring
        if (window.performance && performance.memory) {
            this.memoryMonitorInterval = setInterval(() => {
                this.recordMemoryMetrics();
            }, 10000); // Every 10 seconds
        }

        // Resource monitoring
        this.setupResourceMonitoring();
    }

    /**
     * Record memory metrics
     */
    recordMemoryMetrics() {
        const now = Date.now();
        const memory = performance.memory;

        this.metrics.timestamps.push(now);
        this.metrics.memoryUsage.push({
            total: memory.totalJSHeapSize,
            used: memory.usedJSHeapSize,
            limit: memory.jsHeapSizeLimit
        });

        // Keep only recent metrics
        while (this.metrics.timestamps[0] < now - this.options.metricsRetention) {
            this.metrics.timestamps.shift();
            this.metrics.memoryUsage.shift();
        }

        // Check for memory leaks
        this.detectMemoryLeaks();
    }

    /**
     * Check memory usage and trigger cleanup if needed
     */
    async checkMemoryUsage() {
        if (!performance.memory) return;

        const usage = performance.memory.usedJSHeapSize;
        const limit = this.options.maxMemoryUsage;

        if (usage > limit * this.options.gcThreshold) {
            console.warn('Memory usage high, triggering cleanup');
            await this.forceCleanup();
        }

        // Clean up unused resources
        this.cleanupUnusedResources();
    }

    /**
     * Force cleanup of resources
     */
    async forceCleanup() {
        const startTime = performance.now();
        const initialMemory = performance.memory.usedJSHeapSize;

        try {
            // Clear caches
            await Promise.all([
                this.clearCaches(),
                this.cleanupMarkers(),
                this.pruneDataStore()
            ]);

            // Force garbage collection if available
            if (window.gc) {
                window.gc();
            }

            // Record GC event
            const endMemory = performance.memory.usedJSHeapSize;
            this.metrics.gcEvents.push({
                timestamp: Date.now(),
                duration: performance.now() - startTime,
                freedMemory: initialMemory - endMemory
            });
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    /**
     * Clear various caches
     */
    async clearCaches() {
        SpatialCacheManager.pruneCache();
        FilterEngine.clearCache();
        SearchEngine.clearCache();
    }

    /**
     * Clean up unused markers
     */
    async cleanupMarkers() {
        const stats = MarkerManager.getStats();
        const unusedMarkers = stats.markers.filter(marker => 
            !this.isMarkerInUse(marker)
        );

        if (unusedMarkers.length > 0) {
            console.log(`Cleaning up ${unusedMarkers.length} unused markers`);
            await MarkerManager.removeMarkers(unusedMarkers.map(m => m.id));
        }
    }

    /**
     * Check if marker is in use
     * @param {Object} marker - Marker to check
     * @returns {boolean} True if marker is in use
     */
    isMarkerInUse(marker) {
        const lastAccess = this.lastAccess.get(marker.id);
        if (!lastAccess) return false;

        return Date.now() - lastAccess < this.options.unusedTimeout;
    }

    /**
     * Prune data store
     */
    async pruneDataStore() {
        await RestaurantDataStore.prune();
    }

    /**
     * Set up resource monitoring
     */
    setupResourceMonitoring() {
        // Monitor marker access
        const originalUpdateMarker = MarkerManager.updateMarker;
        MarkerManager.updateMarker = (id, data) => {
            this.recordResourceAccess('marker', id);
            return originalUpdateMarker.call(MarkerManager, id, data);
        };

        // Monitor restaurant data access
        const originalGetRestaurant = RestaurantDataStore.getRestaurant;
        RestaurantDataStore.getRestaurant = (id) => {
            this.recordResourceAccess('restaurant', id);
            return originalGetRestaurant.call(RestaurantDataStore, id);
        };
    }

    /**
     * Record resource access
     * @param {string} type - Resource type
     * @param {string} id - Resource ID
     */
    recordResourceAccess(type, id) {
        const key = `${type}:${id}`;
        this.lastAccess.set(key, Date.now());
        
        const usage = this.resourceUsage.get(key) || { count: 0, type };
        usage.count++;
        usage.lastAccess = Date.now();
        this.resourceUsage.set(key, usage);
    }

    /**
     * Clean up unused resources
     */
    cleanupUnusedResources() {
        const now = Date.now();
        
        // Clean up last access records
        for (const [key, lastAccess] of this.lastAccess.entries()) {
            if (now - lastAccess > this.options.unusedTimeout) {
                this.lastAccess.delete(key);
                this.resourceUsage.delete(key);
            }
        }
    }

    /**
     * Detect potential memory leaks
     */
    detectMemoryLeaks() {
        const recentMetrics = this.metrics.memoryUsage.slice(-6); // Last minute
        if (recentMetrics.length < 6) return;

        // Check for consistent memory growth
        const growth = recentMetrics.every((metric, i) => 
            i === 0 || metric.used > recentMetrics[i - 1].used
        );

        if (growth) {
            const suspects = this.findLeakSuspects();
            if (suspects.length > 0) {
                console.warn('Potential memory leak detected:', suspects);
            }
        }
    }

    /**
     * Find potential memory leak sources
     * @returns {Array} Suspicious resources
     */
    findLeakSuspects() {
        const suspects = [];

        // Check for resources with high access counts
        for (const [key, usage] of this.resourceUsage.entries()) {
            if (usage.count > 1000) { // Arbitrary threshold
                suspects.push({
                    resource: key,
                    accessCount: usage.count,
                    lastAccess: usage.lastAccess
                });
            }
        }

        return suspects;
    }

    /**
     * Get memory metrics
     * @returns {Object} Memory metrics
     */
    getMetrics() {
        const currentMemory = performance.memory ? {
            total: performance.memory.totalJSHeapSize,
            used: performance.memory.usedJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit
        } : null;

        return {
            current: currentMemory,
            history: {
                timestamps: this.metrics.timestamps,
                usage: this.metrics.memoryUsage
            },
            gcEvents: this.metrics.gcEvents,
            resourceUsage: Array.from(this.resourceUsage.entries())
                .map(([key, usage]) => ({
                    resource: key,
                    ...usage
                }))
        };
    }

    /**
     * Clean up memory manager
     */
    destroy() {
        clearInterval(this.cleanupInterval);
        clearInterval(this.memoryMonitorInterval);
        this.metrics = {
            timestamps: [],
            memoryUsage: [],
            gcEvents: [],
            leakSuspects: new Map()
        };
        this.resourceUsage.clear();
        this.lastAccess.clear();
    }
}

export default new MemoryManager();
