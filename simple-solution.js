const fs = require('fs').promises;
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const os = require('os');

class ErrorGenerator {
    constructor(options = {}) {
        this.config = {
            resultsDir: options.resultsDir || './error-results',
            windowSize: options.windowSize || 1000,
            maxHistorySize: options.maxHistorySize || 1000,
            cleanupInterval: options.cleanupInterval || 1000,
            retentionPeriod: options.retentionPeriod || 60 * 60 * 1000, // 1 hour
            batchSize: options.batchSize || 10
        };

        this.stats = {
            totalTests: 0,
            successfulTests: 0,
            failedTests: 0,
            totalComplexity: 0,
            testStartTime: Date.now(),
            errorRates: [],
            errorTypes: new Map(),
            peakErrorRate: 0
        };

        // Buffer for logging
        this.logBuffer = [];
        this.isDisplaying = false;
    }

    async initialize() {
        await fs.mkdir(this.config.resultsDir, { recursive: true });
        console.clear(); // Safer than direct terminal commands
        this.setupCleanupHandlers();
        await this.updateDisplay();
    }

    setupCleanupHandlers() {
        process.on('SIGINT', () => {
            process.exit(0);
        });

        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            process.exit(1);
        });
    }

    generateErrorScenario() {
        const scenarios = [
            // Type errors (safe)
            'null.toString()',
            'undefined.method()',
            '({}).nonexistent.property',
            
            // Reference errors (safe)
            'nonExistentVariable',
            'undefinedFunction()',
            
            // Async errors (safe)
            'Promise.race([Promise.reject("Test Error")])',
            
            // Syntax errors (safe)
            'eval("{")',
            'eval("function(){{")',
            
            // URI errors (safe)
            'decodeURIComponent("%")',
            'encodeURI("\uD800")',
            
            // Range errors (safe)
            'new Array(-1)',
            "Number.prototype.toString.call(null)"
        ];

        const selectedOp = scenarios[Math.floor(Math.random() * scenarios.length)];
        return {
            script: `
                (async () => {
                    ${selectedOp}
                })()
            `
        };
    }

    calculateComplexity(script) {
        const metrics = {
            length: script.length,
            operations: (script.match(/[\+\-\*\/%\(\)]/g) || []).length,
            branches: (script.match(/if|else|switch|case|while|for|do/g) || []).length,
            functionCalls: (script.match(/\w+\(/g) || []).length,
            variables: new Set(script.match(/\b(?:let|const|var)\s+(\w+)/g) || []).size
        };

        return {
            score: Object.values(metrics).reduce((sum, value) => sum + value, 0),
            metrics
        };
    }

    async runTest() {
        const startTime = Date.now();
        const { script } = this.generateErrorScenario();
        const { score: complexity, metrics } = this.calculateComplexity(script);

        try {
            await eval(script);
            return this.processTestResult({ success: true, script, complexity, metrics, startTime });
        } catch (error) {
            return this.processTestResult({ success: false, script, complexity, metrics, startTime, error });
        }
    }

    processTestResult({ success, script, complexity, metrics, startTime, error = null }) {
        const duration = Date.now() - startTime;
        const testResult = {
            id: Date.now(),
            script,
            complexity,
            metrics,
            success,
            duration,
            timestamp: new Date().toISOString()
        };

        if (!error) {
            testResult.error = {
                message: error?.message || 'Unknown error',
                type: error?.constructor?.name || 'Unknown'
            };
        }

        this.updateStats(testResult);
        this.saveResult(testResult);
        return testResult;
    }

    updateStats(result) {
        const stats = this.stats;
        stats.totalTests++;
        result.success ? stats.successfulTests++ : stats.failedTests++;
        
        stats.totalComplexity += result.complexity;

        if (!result.success) {
            const errorType = result.error.type;
            stats.errorTypes.set(errorType, (stats.errorTypes.get(errorType) || 0) + 1);
            stats.errorRates.push({ timestamp: Date.now() });
        }

        const currentErrorRate = this.calculateErrorRate();
        stats.peakErrorRate = Math.max(stats.peakErrorRate, currentErrorRate);

        this.updateDisplay();
    }

    calculateErrorRate() {
        const now = Date.now();
        this.stats.errorRates = this.stats.errorRates.filter(
            rate => now - rate.timestamp < this.config.windowSize
        );
        return (this.stats.errorRates.length / this.config.windowSize) * 1000;
    }

    async updateDisplay() {
        if (this.isDisplaying) return;
        this.isDisplaying = true;

        try {
            const stats = this.stats;
            const runtime = ((Date.now() - stats.testStartTime) / 1000).toFixed(1);
            const successRate = ((stats.successfulTests / stats.totalTests) * 100).toFixed(1);
            const avgComplexity = (stats.totalComplexity / stats.totalTests || 0).toFixed(1);
            const currentErrorRate = this.calculateErrorRate().toFixed(1);

            const errorTypes = Array.from(stats.errorTypes.entries())
                .map(([type, count]) => `${type}: ${count}`)
                .join(', ');

            const status = `
Error Generator Status
---------------------
Error Rate: ${currentErrorRate} errors/sec
Peak Rate: ${stats.peakErrorRate.toFixed(1)} errors/sec
Error Types: ${errorTypes}

Total Tests: ${stats.totalTests}
Failed Tests: ${stats.failedTests}
Success Rate: ${successRate}%

Complexity: ${avgComplexity}
Runtime: ${runtime}s
`;
            console.clear();
            console.log(status);
        } finally {
            this.isDisplaying = false;
        }
    }

    async saveResult(result) {
        const filename = path.join(this.config.resultsDir, `test_${result.id}.json`);
        await fs.writeFile(filename, JSON.stringify(result, null, 2))
            .catch(error => console.error('Failed to save result:', error));

        if (this.stats.totalTests % this.config.cleanupInterval === 0) {
            this.cleanupOldResults().catch(error => console.error('Cleanup failed:', error));
        }
    }

    async cleanupOldResults() {
        try {
            const files = await fs.readdir(this.config.resultsDir);
            const cutoffTime = Date.now() - this.config.retentionPeriod;
            
            await Promise.all(files.map(async (file) => {
                const filePath = path.join(this.config.resultsDir, file);
                const stats = await fs.stat(filePath);
                if (stats.mtimeMs < cutoffTime) {
                    await fs.unlink(filePath);
                }
            }));
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

class ErrorGeneratorCluster {
    constructor(options = {}) {
        this.options = options;
        this.numWorkers = options.numWorkers || Math.max(1, os.cpus().length - 1);
    }

    async start() {
        if (!isMainThread) {
            const generator = new ErrorGenerator(this.options);
            await generator.initialize();
            
            while (true) {
                try {
                    await Promise.all(Array(generator.config.batchSize)
                        .fill(0)
                        .map(() => generator.runTest())
                    );
                    // Small delay to prevent overwhelming the system
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error('Worker batch error:', error);
                }
            }
        } else {
            console.log(`Starting Error Generator with ${this.numWorkers} workers`);
            
            const workers = Array(this.numWorkers)
                .fill(null)
                .map(() => new Worker(__filename));

            workers.forEach(worker => {
                worker.on('error', error => console.error('Worker error:', error));
                worker.on('exit', code => {
                    if (code !== 0) {
                        console.error(`Worker stopped with exit code ${code}`);
                    }
                });
            });
        }
    }
}

if (require.main === module) {
    const cluster = new ErrorGeneratorCluster();
    cluster.start().catch(console.error);
}

module.exports = { ErrorGenerator, ErrorGeneratorCluster };
