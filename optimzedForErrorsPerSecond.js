const fs = require('fs').promises;
const path = require('path');

class SimpleTestRunner {
    constructor() {
        this.resultsDir = './simple-results';
        this.stats = {
            totalTests: 0,
            successfulTests: 0,
            failedTests: 0,
            totalComplexity: 0,
            complexityHistory: [],
            throughputHistory: [],
            lastUpdateTime: Date.now(),
            errorsPerSecond: 0,
            peakErrorRate: 0
        };
    }

    async init() {
        await fs.mkdir(this.resultsDir, { recursive: true });
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
        // Optimized for rapid error generation
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
            
            // Syntax errors via eval (fast)
            'eval("{")',
            'eval("function(){{")',
            'eval("return}")',
            
            // URI errors (quick)
            'decodeURIComponent("%")',
            'encodeURI("\uD800")',
            
            // Range errors (immediate)
            'new Array(-1)',
            'new Array(1e99)',
            "Number.prototype.toString.call(null)",
            
            // Stack overflow (fast)
            '(function f(){f()})())',
            
            // Promise rejections (async but quick)
            'Promise.reject(new Error()).then(x => x.nonexistent)',
            'new Promise(() => { throw new Error(); })',
            
            // Type conversion errors (immediate)
            'Number(Symbol())',
            'BigInt("invalid")',
            'Object.create(null).toString()'
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
                    stack: error.stack
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
        const timeWindow = now - this.stats.lastUpdateTime;
        
        // Update basic stats
        this.stats.totalTests++;
        if (result.success) {
            this.stats.successfulTests++;
        } else {
            this.stats.failedTests++;
        }

        // Update complexity metrics
        this.stats.totalComplexity += result.complexity;
        this.stats.complexityHistory.push({
            timestamp: now,
            complexity: result.complexity,
            duration: result.duration,
            success: result.success
        });

        // Calculate current error rate
        const recentTests = this.stats.complexityHistory.filter(t => t.timestamp > now - 1000);
        const recentErrors = recentTests.filter(t => !t.success).length;
        this.stats.errorsPerSecond = recentErrors;
        this.stats.peakErrorRate = Math.max(this.stats.peakErrorRate, recentErrors);

        // Calculate throughput
        const throughput = recentTests.length;
        this.stats.throughputHistory.push({
            timestamp: now,
            throughput,
            avgComplexity: recentTests.reduce((sum, t) => sum + t.complexity, 0) / recentTests.length
        });

        // Trim history arrays to last minute of data
        const cutoff = now - 60000;
        this.stats.complexityHistory = this.stats.complexityHistory.filter(t => t.timestamp > cutoff);
        this.stats.throughputHistory = this.stats.throughputHistory.filter(t => t.timestamp > cutoff);
        
        this.stats.lastUpdateTime = now;
    }

    async saveResult(result) {
        const filename = path.join(this.resultsDir, `test_${result.id}.json`);
        await fs.writeFile(filename, JSON.stringify(result, null, 2));
    }

    printStats() {
        console.clear();
        console.log('Error Generation Stats:');
        console.log('=====================');
        console.log(`Current Error Rate: ${this.stats.errorsPerSecond} errors/sec`);
        console.log(`Peak Error Rate: ${this.stats.peakErrorRate} errors/sec`);
        console.log(`Total Tests: ${this.stats.totalTests}`);
        console.log(`Failed Tests: ${this.stats.failedTests}`);
        console.log(`Average Complexity: ${(this.stats.totalComplexity / this.stats.totalTests || 0).toFixed(2)}`);
        console.log(`Runtime: ${((Date.now() - this.stats.lastUpdateTime) / 1000).toFixed(1)}s`);
    }
}

async function main() {
    const runner = new SimpleTestRunner();
    await runner.init();

    console.log('Starting error generation test run...\n');

    // Run continuously to maximize error rate
    while (true) {
        try {
            // Run multiple tests in parallel for higher throughput
            await Promise.all(Array(50).fill(0).map(() => runner.runTest()));
            runner.printStats();
        } catch (error) {
            console.error('Batch error:', error);
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SimpleTestRunner;