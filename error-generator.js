const fs = require('fs').promises;
const path = require('path');

class ErrorGenerator {
    constructor() {
        this.metrics = {
            startTime: Date.now(),
            lastMetricUpdate: Date.now(),
            totalErrors: 0,
            totalOperations: 0,
            errorRates: [],
            maxErrorRate: 0,
            minErrorRate: Infinity,
            batchSizes: [],
            latencies: []
        };
        
        this.resultsDir = './error-metrics';
    }

    async init() {
        await fs.mkdir(this.resultsDir, { recursive: true });
    }

    // Generate highly optimized error-producing operations
    generateErrorOps(batchSize = 1000) {
        const ops = [];
        for (let i = 0; i < batchSize; i++) {
            const errorTypes = [
                // Memory-intensive errors
                () => new Array(1e6).fill('x'),
                () => new Array(1e5).map(() => ({})),
                
                // Type errors (very fast to generate)
                () => null.toString(),
                () => undefined.method(),
                () => ({}).nonexistent.property,
                
                // Stack overflow errors (recursive)
                () => (function r() { r(); })(),
                
                // Async errors (Promise rejections)
                () => Promise.reject(new Error('Fast rejection')),
                
                // Reference errors (undefined variables)
                () => nonExistentVariable,
                
                // Syntax errors via eval
                () => eval('}{'),
                
                // Type conversion errors
                () => Number(undefined),
                () => new Array(-1),
                () => decodeURIComponent('%')
            ];

            ops.push(errorTypes[Math.floor(Math.random() * errorTypes.length)]);
        }
        return ops;
    }

    // Run operations in parallel for maximum error generation
    async runBatch(batchSize) {
        const startTime = process.hrtime.bigint();
        const ops = this.generateErrorOps(batchSize);
        
        const results = await Promise.allSettled(
            ops.map(op => new Promise(resolve => {
                try {
                    op();
                    resolve(false); // No error
                } catch (e) {
                    resolve(true); // Error occurred
                }
            }))
        );

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1e6; // Convert to ms

        const errorCount = results.filter(r => r.value === true).length;
        this.updateMetrics(errorCount, batchSize, duration);
        
        return {
            errors: errorCount,
            operations: batchSize,
            duration: duration
        };
    }

    // Dynamically adjust batch size based on performance
    calculateNextBatchSize() {
        const currentRate = this.getCurrentErrorRate();
        const lastBatchSize = this.metrics.batchSizes[this.metrics.batchSizes.length - 1] || 1000;
        
        if (currentRate > this.metrics.maxErrorRate) {
            return Math.floor(lastBatchSize * 1.5); // Increase batch size
        } else if (currentRate < this.metrics.maxErrorRate * 0.8) {
            return Math.max(100, Math.floor(lastBatchSize * 0.8)); // Decrease but maintain minimum
        }
        return lastBatchSize;
    }

    // Update metrics with latest batch results
    updateMetrics(errors, operations, duration) {
        const now = Date.now();
        const timeDiff = (now - this.metrics.lastMetricUpdate) / 1000; // Convert to seconds
        const errorRate = errors / timeDiff;

        this.metrics.totalErrors += errors;
        this.metrics.totalOperations += operations;
        this.metrics.errorRates.push(errorRate);
        this.metrics.batchSizes.push(operations);
        this.metrics.latencies.push(duration);
        this.metrics.maxErrorRate = Math.max(this.metrics.maxErrorRate, errorRate);
        this.metrics.minErrorRate = Math.min(this.metrics.minErrorRate, errorRate);
        this.metrics.lastMetricUpdate = now;

        // Keep only last 100 measurements for moving averages
        if (this.metrics.errorRates.length > 100) {
            this.metrics.errorRates.shift();
            this.metrics.batchSizes.shift();
            this.metrics.latencies.shift();
        }
    }

    getCurrentErrorRate() {
        const recentRates = this.metrics.errorRates.slice(-10);
        return recentRates.reduce((a, b) => a + b, 0) / recentRates.length;
    }

    // Save detailed metrics to file
    async saveMetrics() {
        const filename = path.join(this.resultsDir, `metrics_${Date.now()}.json`);
        await fs.writeFile(filename, JSON.stringify({
            ...this.metrics,
            duration: (Date.now() - this.metrics.startTime) / 1000,
            avgErrorRate: this.metrics.errorRates.reduce((a, b) => a + b, 0) / this.metrics.errorRates.length,
            avgLatency: this.metrics.latencies.reduce((a, b) => a + b, 0) / this.metrics.latencies.length
        }, null, 2));
    }

    // Print current stats to console
    printStats() {
        const currentRate = this.getCurrentErrorRate();
        const avgLatency = this.metrics.latencies.slice(-10).reduce((a, b) => a + b, 0) / 10;
        
        console.clear();
        console.log('Error Generation Stats:');
        console.log('=====================');
        console.log(`Current Error Rate: ${currentRate.toFixed(2)} errors/sec`);
        console.log(`Peak Error Rate: ${this.metrics.maxErrorRate.toFixed(2)} errors/sec`);
        console.log(`Total Errors: ${this.metrics.totalErrors}`);
        console.log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
        console.log(`Current Batch Size: ${this.metrics.batchSizes[this.metrics.batchSizes.length - 1]}`);
        console.log(`Runtime: ${((Date.now() - this.metrics.startTime) / 1000).toFixed(1)}s`);
    }
}

async function main() {
    const generator = new ErrorGenerator();
    await generator.init();

    console.log('Starting error generation...\n');

    // Run continuously, adjusting batch size for maximum error rate
    while (true) {
        const batchSize = generator.calculateNextBatchSize();
        await generator.runBatch(batchSize);
        generator.printStats();
        await generator.saveMetrics();

        // Small delay to prevent complete system overload
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ErrorGenerator;