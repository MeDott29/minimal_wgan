const fs = require('fs').promises;
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const os = require('os');

class ErrorGenerator {
    constructor() {
        this.resultsDir = './error-results';
        this.stats = {
            totalTests: 0,
            successfulTests: 0,
            failedTests: 0,
            totalComplexity: 0,
            complexityHistory: [],
            throughputHistory: [],
            lastUpdateTime: Date.now(),
            errorsPerSecond: 0,
            peakErrorRate: 0,
            testStartTime: Date.now(),
            errorRates: [],
            windowSize: 1000, // 1 second window
            errorTypes: new Map(),
            successRate: '0.0',
            avgComplexity: '0.0',
            runtime: '0.0'
        };

        // Initialize the TUI frame
        this.frame = this.createFrame();
        process.stdout.write(this.frame);
    }

    createFrame() {
        return `
╔════════════════════════════════════════════════════╗
║              Error Generator Status                 ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║  Error Rate:     0 errors/sec                      ║
║  Peak Rate:      0 errors/sec                      ║
║                                                    ║
║  Error Types:                                      ║
║  None recorded yet                                 ║
║                                                    ║
║  Total Tests:    0                                 ║
║  Failed Tests:   0                                 ║
║  Success Rate:   0%                                ║
║                                                    ║
║  Complexity:     0                                 ║
║  Runtime:        0s                                ║
║                                                    ║
╚════════════════════════════════════════════════════╝
`;
    }

    async init() {
        await fs.mkdir(this.resultsDir, { recursive: true });
        // Clear screen and hide cursor
        process.stdout.write('\x1b[2J\x1b[0f\x1b[?25l');
    }

    calculateComplexity(script) {
        const metrics = {
            length: script.length,
            operations: (script.match(/[\+\-\*\/%\(\)]/g) || []).length,
            branches: (script.match(/if|else|switch|case|while|for|do/g) || []).length,
            functionCalls: (script.match(/\w+\(/g) || []).length,
            variables: new Set(script.match(/\b(?:let|const|var)\s+(\w+)/g) || []).size,
            asyncOperations: (script.match(/async|await|Promise|setTimeout/g) || []).length,
            errorHandling: (script.match(/try|catch|throw|finally/g) || []).length
        };

        return {
            score: metrics.length * 0.01 +
                  metrics.operations * 0.5 +
                  metrics.branches * 2 +
                  metrics.functionCalls * 1.5 +
                  metrics.variables * 1 +
                  metrics.asyncOperations * 3 +
                  metrics.errorHandling * 2,
            metrics
        };
    }

    generateTestScript() {
        const operations = [
            // Memory errors (fast to trigger)
            'new Array(1e9).fill(0)',
            'Buffer.allocUnsafe(1e9)',
            '({}).constructor.constructor("return process")()',
            
            // Type errors (very fast)
            'null.toString()',
            'undefined.method()',
            '({}).nonexistent.property',
            
            // Reference errors (immediate)
            'nonExistentVariable',
            'undefinedFunction()',
            'this.doesNotExist.atAll()',
            
            // Recursive errors (very fast)
            '(() => { const x = []; x.push(x); JSON.stringify(x) })()',
            
            // Memory-intensive operations
            'new Array(2**32)',
            'Array(2**31).join("x")',
            
            // CPU-intensive errors
            '(() => { while(true) {} })()',
            
            // Async errors that resolve quickly
            'Promise.race([Promise.reject("Quick Error")])',
            
            // Type coercion errors
            'BigInt(Symbol())',
            '({}) + ({})',
            
            // Prototype chain errors
            'Object.create(null).toString()',
            'Object.setPrototypeOf({}, null).toString()',
            
            // Syntax errors via eval
            'eval("{")',
            'eval("function(){{")',
            'eval("return}")',
            
            // URI errors
            'decodeURIComponent("%")',
            'encodeURI("\uD800")',
            
            // Range errors
            'new Array(-1)',
            'new Array(1e99)',
            "Number.prototype.toString.call(null)"
        ];

        const selectedOp = operations[Math.floor(Math.random() * operations.length)];
        const script = `
            (async () => {
                ${selectedOp}
            })()
        `;

        const complexity = this.calculateComplexity(script);
        return { script, complexity: complexity.score, metrics: complexity.metrics };
    }

    calculateErrorRate() {
        const now = Date.now();
        const window = this.stats.windowSize;
        
        // Remove old entries
        this.stats.errorRates = this.stats.errorRates.filter(
            rate => now - rate.timestamp < window
        );
        
        // Calculate current rate
        const errorsInWindow = this.stats.errorRates.length;
        const rate = (errorsInWindow / window) * 1000; // errors per second
        
        return rate;
    }

    classifyError(error) {
        const type = error.constructor.name;
        const count = (this.stats.errorTypes.get(type) || 0) + 1;
        this.stats.errorTypes.set(type, count);
        return type;
    }

    async runTest() {
        const { script, complexity, metrics } = this.generateTestScript();
        const testId = Date.now();
        const startTime = Date.now();

        try {
            await eval(script);
            
            const testResult = {
                id: testId,
                script,
                complexity,
                metrics,
                success: true,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };

            await this.updateStats(testResult);
            await this.saveResult(testResult);
            return testResult;

        } catch (error) {
            const testResult = {
                id: testId,
                script,
                complexity,
                metrics,
                success: false,
                error: {
                    message: error.message,
                    stack: error.stack,
                    type: this.classifyError(error)
                },
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };

            await this.updateStats(testResult);
            await this.saveResult(testResult);
            return testResult;
        }
    }

    async updateStats(result) {
        const now = Date.now();
        
        // Update basic stats
        this.stats.totalTests++;
        if (result.success) {
            this.stats.successfulTests++;
        } else {
            this.stats.failedTests++;
            this.stats.errorRates.push({
                timestamp: now,
                error: result.error
            });
        }

        // Update complexity metrics
        this.stats.totalComplexity += result.complexity;
        this.stats.complexityHistory.push({
            timestamp: now,
            complexity: result.complexity,
            duration: result.duration,
            success: result.success
        });

        // Limit history size to prevent memory bloat
        if (this.stats.complexityHistory.length > 1000) {
            this.stats.complexityHistory = this.stats.complexityHistory.slice(-1000);
        }

        // Calculate current error rate
        this.stats.errorsPerSecond = this.calculateErrorRate();
        this.stats.peakErrorRate = Math.max(this.stats.peakErrorRate, this.stats.errorsPerSecond);

        // Update display
        await this.updateDisplay();

        // Periodic cleanup
        if (this.stats.totalTests % 1000 === 0) {
            await this.cleanupOldResults();
        }
    }

    async cleanupOldResults() {
        const files = await fs.readdir(this.resultsDir);
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        for (const file of files) {
            const filePath = path.join(this.resultsDir, file);
            const stats = await fs.stat(filePath);
            if (stats.mtimeMs < oneHourAgo) {
                await fs.unlink(filePath);
            }
        }
    }

    async updateDisplay() {
        const runtime = ((Date.now() - this.stats.testStartTime) / 1000).toFixed(1);
        const successRate = ((this.stats.successfulTests / this.stats.totalTests) * 100).toFixed(1);
        const avgComplexity = (this.stats.totalComplexity / this.stats.totalTests || 0).toFixed(1);

        const errorTypes = Array.from(this.stats.errorTypes.entries())
            .map(([type, count]) => `║  ${type}: ${count}`.padEnd(50))
            .join('\n');

        // Move cursor to start of frame
        process.stdout.write('\x1b[0f');

        // Update frame with current stats
        const frame = `
╔════════════════════════════════════════════════════╗
║              Error Generator Status                 ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║  Error Rate:     ${String(this.stats.errorsPerSecond.toFixed(1)).padEnd(8)} errors/sec        ║
║  Peak Rate:      ${String(this.stats.peakErrorRate.toFixed(1)).padEnd(8)} errors/sec        ║
║                                                    ║
║  Error Types:                                      ║
${errorTypes}
║                                                    ║
║  Total Tests:    ${String(this.stats.totalTests).padEnd(8)}                    ║
║  Failed Tests:   ${String(this.stats.failedTests).padEnd(8)}                    ║
║  Success Rate:   ${successRate.padEnd(8)}%                   ║
║                                                    ║
║  Complexity:     ${avgComplexity.padEnd(8)}                    ║
║  Runtime:        ${runtime.padEnd(8)}s                   ║
║                                                    ║
╚════════════════════════════════════════════════════╝
`;
        process.stdout.write(frame);
    }

    async saveResult(result) {
        const filename = path.join(this.resultsDir, `test_${result.id}.json`);
        await fs.writeFile(filename, JSON.stringify(result, null, 2));
    }

    cleanup() {
        // Show cursor again
        process.stdout.write('\x1b[?25h');
    }
}

async function runWorker() {
    const generator = new ErrorGenerator();
    await generator.init();

    while (true) {
        try {
            await Promise.all(Array(10).fill(0).map(() => generator.runTest()));
        } catch (error) {
            console.error('Worker batch error:', error);
        }
    }
}

async function main() {
    if (isMainThread) {
        const generator = new ErrorGenerator();
        await generator.init();

        // Handle cleanup on exit
        process.on('SIGINT', () => {
            generator.cleanup();
            process.exit();
        });

        // Create workers based on CPU cores
        const numCPUs = os.cpus().length;
        const workers = new Array(numCPUs).fill(null).map(() => {
            return new Worker(__filename);
        });

        workers.forEach(worker => {
            worker.on('error', console.error);
            worker.on('exit', code => {
                if (code !== 0) {
                    console.error(`Worker stopped with exit code ${code}`);
                }
            });
        });
    } else {
        await runWorker();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ErrorGenerator;