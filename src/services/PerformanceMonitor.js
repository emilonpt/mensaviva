import MarkerManager from './MarkerManager.js';
import MemoryManager from './MemoryManager.js';
import FilterEngine from './FilterEngine.js';
import SearchEngine from './SearchEngine.js';
import ViewportOptimizer from './ViewportOptimizer.js';

/**
 * Monitors application performance and generates reports
 */
class PerformanceMonitor {
    constructor(options = {}) {
        this.options = {
            sampleInterval: options.sampleInterval || 1000, // 1 second
            metricsRetention: options.metricsRetention || 3600000, // 1 hour
            reportInterval: options.reportInterval || 300000, // 5 minutes
            budgets: {
                frameTime: options.frameTimeBudget || 16, // 60fps
                memoryUsage: options.memoryBudget || 200 * 1024 * 1024, // 200MB
                markerUpdateTime: options.markerUpdateBudget || 50, // 50ms
                searchResponseTime: options.searchResponseBudget || 100, // 100ms
                filterProcessingTime: options.filterProcessingBudget || 150, // 150ms
                ...options.budgets
            },
            alerts: {
                frameTimeThreshold: 30, // Alert if frame time exceeds 30ms
                memoryUsageThreshold: 0.9, // Alert at 90% of budget
                errorRateThreshold: 0.05, // Alert if error rate exceeds 5%
                ...options.alerts
            },
            ...options
        };

        // Performance metrics
        this.metrics = {
            frames: [],
            memory: [],
            operations: [],
            errors: [],
            budgetViolations: []
        };

        // Current performance state
        this.currentState = {
            fps: 0,
            frameTime: 0,
            memoryUsage: 0,
            errorRate: 0
        };

        // Last report timestamp
        this.lastReport = Date.now();

        // Start monitoring
        this.startMonitoring();
    }

    /**
     * Start performance monitoring
     */
    startMonitoring() {
        // Frame timing
        this.frameObserver = new PerformanceObserver(this.handleFrameUpdates.bind(this));
        this.frameObserver.observe({ entryTypes: ['frame'] });

        // Resource timing
        this.resourceObserver = new PerformanceObserver(this.handleResourceUpdates.bind(this));
        this.resourceObserver.observe({ entryTypes: ['resource'] });

        // Regular metric collection
        this.metricInterval = setInterval(() => {
            this.collectMetrics();
        }, this.options.sampleInterval);

        // Regular reporting
        this.reportInterval = setInterval(() => {
            this.generateReport();
        }, this.options.reportInterval);

        // Monitor service operations
        this.monitorServices();
    }

    /**
     * Handle frame timing updates
     * @param {PerformanceObserverEntryList} list - Frame entries
     */
    handleFrameUpdates(list) {
        const frames = list.getEntries();
        frames.forEach(frame => {
            this.metrics.frames.push({
                timestamp: Date.now(),
                duration: frame.duration
            });

            this.currentState.frameTime = frame.duration;
            this.currentState.fps = 1000 / frame.duration;

            // Check frame budget
            if (frame.duration > this.options.budgets.frameTime) {
                this.recordBudgetViolation('frame', frame.duration);
            }
        });

        this.pruneMetrics();
    }

    /**
     * Handle resource timing updates
     * @param {PerformanceObserverEntryList} list - Resource entries
     */
    handleResourceUpdates(list) {
        const resources = list.getEntries();
        resources.forEach(resource => {
            this.metrics.operations.push({
                type: 'resource',
                name: resource.name,
                duration: resource.duration,
                timestamp: Date.now()
            });
        });
    }

    /**
     * Collect metrics from various services
     */
    collectMetrics() {
        // Memory metrics
        const memoryMetrics = MemoryManager.getMetrics();
        this.metrics.memory.push({
            timestamp: Date.now(),
            ...memoryMetrics.current
        });
        this.currentState.memoryUsage = memoryMetrics.current?.used || 0;

        // Check memory budget
        if (this.currentState.memoryUsage > this.options.budgets.memoryUsage) {
            this.recordBudgetViolation('memory', this.currentState.memoryUsage);
        }

        // Service metrics
        this.collectServiceMetrics();
        
        this.pruneMetrics();
    }

    /**
     * Collect metrics from all services
     */
    collectServiceMetrics() {
        // Marker metrics
        const markerStats = MarkerManager.getStats();
        this.recordOperationMetrics('marker', markerStats);

        // Filter metrics
        const filterStats = FilterEngine.getMetrics();
        this.recordOperationMetrics('filter', filterStats);

        // Search metrics
        const searchStats = SearchEngine.getMetrics();
        this.recordOperationMetrics('search', searchStats);

        // Viewport metrics
        const viewportStats = ViewportOptimizer.getMetrics();
        this.recordOperationMetrics('viewport', viewportStats);
    }

    /**
     * Record operation metrics
     * @param {string} type - Operation type
     * @param {Object} stats - Operation statistics
     */
    recordOperationMetrics(type, stats) {
        this.metrics.operations.push({
            type,
            timestamp: Date.now(),
            ...stats
        });

        // Check operation budgets
        const budget = this.options.budgets[`${type}UpdateTime`];
        if (budget && stats.lastUpdateTime > budget) {
            this.recordBudgetViolation(type, stats.lastUpdateTime);
        }
    }

    /**
     * Record budget violation
     * @param {string} type - Violation type
     * @param {number} value - Actual value
     */
    recordBudgetViolation(type, value) {
        this.metrics.budgetViolations.push({
            type,
            value,
            budget: this.options.budgets[`${type}UpdateTime`] || this.options.budgets[type],
            timestamp: Date.now()
        });

        // Emit alert if needed
        this.checkAlerts(type, value);
    }

    /**
     * Check alert thresholds
     * @param {string} type - Metric type
     * @param {number} value - Metric value
     */
    checkAlerts(type, value) {
        const threshold = this.options.alerts[`${type}Threshold`];
        if (!threshold) return;

        const budget = this.options.budgets[`${type}UpdateTime`] || this.options.budgets[type];
        if (value > budget * threshold) {
            this.emitAlert(type, value, budget);
        }
    }

    /**
     * Emit performance alert
     * @param {string} type - Alert type
     * @param {number} value - Current value
     * @param {number} budget - Performance budget
     */
    emitAlert(type, value, budget) {
        const event = new CustomEvent('performanceAlert', {
            detail: {
                type,
                value,
                budget,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    }

    /**
     * Generate performance report
     * @returns {Object} Performance report
     */
    generateReport() {
        const now = Date.now();
        const reportPeriod = now - this.lastReport;

        const report = {
            timestamp: now,
            period: reportPeriod,
            summary: this.generateSummary(),
            details: this.generateDetails(),
            budgets: this.generateBudgetReport(),
            recommendations: this.generateRecommendations()
        };

        this.lastReport = now;

        // Emit report event
        window.dispatchEvent(new CustomEvent('performanceReport', {
            detail: report
        }));

        return report;
    }

    /**
     * Generate performance summary
     * @returns {Object} Performance summary
     */
    generateSummary() {
        const recentFrames = this.metrics.frames.slice(-100);
        const averageFrameTime = recentFrames.reduce((sum, frame) => 
            sum + frame.duration, 0) / recentFrames.length;

        return {
            fps: this.currentState.fps,
            frameTime: averageFrameTime,
            memoryUsage: this.currentState.memoryUsage,
            errorRate: this.currentState.errorRate,
            budgetViolations: this.metrics.budgetViolations.length
        };
    }

    /**
     * Generate detailed metrics
     * @returns {Object} Detailed metrics
     */
    generateDetails() {
        return {
            operations: this.aggregateOperations(),
            memory: this.aggregateMemoryMetrics(),
            errors: this.aggregateErrors()
        };
    }

    /**
     * Generate budget compliance report
     * @returns {Object} Budget report
     */
    generateBudgetReport() {
        const report = {};
        for (const [metric, budget] of Object.entries(this.options.budgets)) {
            const violations = this.metrics.budgetViolations.filter(v => v.type === metric);
            report[metric] = {
                budget,
                violations: violations.length,
                worstViolation: violations.length > 0 ? 
                    Math.max(...violations.map(v => v.value)) : null
            };
        }
        return report;
    }

    /**
     * Generate performance recommendations
     * @returns {Array} Recommendations
     */
    generateRecommendations() {
        const recommendations = [];

        // Check frame rate
        if (this.currentState.frameTime > this.options.budgets.frameTime) {
            recommendations.push({
                type: 'frame',
                severity: 'high',
                message: 'Frame time consistently above budget',
                action: 'Consider reducing marker updates or visual effects'
            });
        }

        // Check memory usage
        if (this.currentState.memoryUsage > this.options.budgets.memoryUsage * 0.8) {
            recommendations.push({
                type: 'memory',
                severity: 'medium',
                message: 'Memory usage approaching budget',
                action: 'Review cache sizes and resource cleanup settings'
            });
        }

        return recommendations;
    }

    /**
     * Aggregate operation metrics
     * @returns {Object} Aggregated operations
     */
    aggregateOperations() {
        const operations = {};
        for (const op of this.metrics.operations) {
            if (!operations[op.type]) {
                operations[op.type] = {
                    count: 0,
                    totalTime: 0,
                    avgTime: 0,
                    maxTime: 0
                };
            }
            const stats = operations[op.type];
            stats.count++;
            stats.totalTime += op.duration;
            stats.avgTime = stats.totalTime / stats.count;
            stats.maxTime = Math.max(stats.maxTime, op.duration);
        }
        return operations;
    }

    /**
     * Aggregate memory metrics
     * @returns {Object} Aggregated memory metrics
     */
    aggregateMemoryMetrics() {
        const memory = this.metrics.memory;
        if (memory.length === 0) return null;

        return {
            average: memory.reduce((sum, m) => sum + m.used, 0) / memory.length,
            peak: Math.max(...memory.map(m => m.used)),
            current: memory[memory.length - 1].used
        };
    }

    /**
     * Aggregate error metrics
     * @returns {Object} Aggregated error metrics
     */
    aggregateErrors() {
        const errors = this.metrics.errors;
        return {
            total: errors.length,
            byType: errors.reduce((types, error) => {
                types[error.type] = (types[error.type] || 0) + 1;
                return types;
            }, {})
        };
    }

    /**
     * Prune old metrics
     */
    pruneMetrics() {
        const cutoff = Date.now() - this.options.metricsRetention;
        
        ['frames', 'memory', 'operations', 'errors', 'budgetViolations'].forEach(type => {
            this.metrics[type] = this.metrics[type].filter(m => 
                m.timestamp >= cutoff
            );
        });
    }

    /**
     * Monitor service operations
     */
    monitorServices() {
        // Monitor API errors
        window.addEventListener('error', (error) => {
            this.metrics.errors.push({
                type: 'api',
                message: error.message,
                timestamp: Date.now()
            });
        });

        // Monitor performance marks
        const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach(entry => {
                if (entry.entryType === 'measure') {
                    this.recordOperationMetrics(entry.name, {
                        duration: entry.duration
                    });
                }
            });
        });
        observer.observe({ entryTypes: ['measure'] });
    }

    /**
     * Clean up resources
     */
    destroy() {
        clearInterval(this.metricInterval);
        clearInterval(this.reportInterval);
        this.frameObserver?.disconnect();
        this.resourceObserver?.disconnect();
    }
}

export default new PerformanceMonitor();
