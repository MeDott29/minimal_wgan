const fs = require('fs').promises;
const path = require('path');

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
            testStartTime: Date.now()
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

        // Update display
        await this.updateDisplay();
    }

    async updateDisplay() {
        const runtime = ((Date.now() - this.stats.testStartTime) / 1000).toFixed(1);
        const successRate = ((this.stats.successfulTests / this.stats.totalTests) * 100).toFixed(1);
        const avgComplexity = (this.stats.totalComplexity / this.stats.totalTests || 0).toFixed(1);

        // Move cursor to start of frame
        process.stdout.write('\x1b[0f');

        // Update frame with current stats
        const frame = `
╔════════════════════════════════════════════════════╗
║              Error Generator Status                 ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║  Error Rate:     ${String(this.stats.errorsPerSecond).padEnd(8)} errors/sec        ║
║  Peak Rate:      ${String(this.stats.peakErrorRate).padEnd(8)} errors/sec        ║
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

async function main() {
    const generator = new ErrorGenerator();
    await generator.init();

    // Handle cleanup on exit
    process.on('SIGINT', () => {
        generator.cleanup();
        process.exit();
    });

    // Run continuously to maximize error rate
    while (true) {
        try {
            // Run multiple tests in parallel for higher throughput
            await Promise.all(Array(50).fill(0).map(() => generator.runTest()));
        } catch (error) {
            console.error('Batch error:', error);
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ErrorGenerator;