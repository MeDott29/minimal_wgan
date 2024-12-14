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
            lastUpdateTime: Date.now()
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

        // Weight different factors
        const complexity = 
            metrics.length * 0.01 +
            metrics.operations * 0.5 +
            metrics.branches * 2 +
            metrics.functionCalls * 1.5 +
            metrics.variables * 1 +
            metrics.asyncOperations * 3 +
            metrics.errorHandling * 2;

        return {
            score: complexity,
            metrics
        };
    }

    generateTestScript() {
        const operations = [
            // Basic arithmetic
            'return a + b;',
            'return a - b;',
            'return a * b;',
            'return a / b;',
            'return a % b;',
            'return a ** b;',

            // Type operations
            'return a.toString() + b;',
            'return Number(a.toString()) + b;',
            'return String(a) + String(b);',
            'return parseInt(a) + parseFloat(b);',

            // Array operations
            'return [a, b].join("");',
            'return new Array(a).fill(b);',
            'return Array.from({length: a}, (_, i) => i + b);',
            'return [a, b].map(x => x * 2);',

            // Object operations
            'return {a, b};',
            'return Object.assign({}, {a}, {b});',
            'return JSON.parse(JSON.stringify({a, b}));',
            'return Object.keys({a, b}).length;',

            // Error scenarios
            'throw new Error("Random failure");',
            'return undefined.prop;',
            'return null.method();',
            'return a.nonexistentMethod();',
            'return b.impossible.chain.of.properties;',
            'return new Error("Deliberate error");',

            // Math operations
            'return Math.pow(a, b);',
            'return Math.sqrt(Math.abs(a * b));',
            'return Math.round(a / b);',
            'return Math.max(a, b, a * b);',

            // String operations
            'return `Template ${a} and ${b}`;',
            'return a.toString().repeat(b);',
            'return a.toString().padStart(b, "0");',
            'return String(a).split("").reverse().join("");',

            // Async operations
            'return new Promise(r => setTimeout(r, 50)).then(() => a + b);',
            'return Promise.resolve(a).then(x => x + b);',
            'return Promise.reject(new Error("async fail"));',
            'return new Promise((_, r) => r("failed"));',

            // Type checks
            'return typeof a === typeof b;',
            'return Object.prototype.toString.call(a);',
            'return Array.isArray([a, b]);',
            'return isNaN(a / b);'
        ];

        const selectedOp = operations[Math.floor(Math.random() * operations.length)];
        
        const script = `
            async function test(a, b) {
                ${selectedOp}
            }
            test(${Math.random() * 100}, ${Math.random() * 100});
        `;

        const complexity = this.calculateComplexity(script);
        
        // Store complexity with the test
        return {
            script,
            complexity: complexity.score,
            metrics: complexity.metrics
        };
    }

    async runTest() {
        const testData = this.generateTestScript();
        const testId = Date.now();
        const startTime = Date.now();

        
        try {
            // Execute the script within a try-catch block
            let result;
            try {
                result = await eval(testData.script);
            } catch (innerError) {
                throw new Error(`Execution error: ${innerError.message}`);
            }

            const testResult = {
                id: testId,
                script: testData.script,
                complexity: testData.complexity,
                metrics: testData.metrics,
                success: true,
                result: result,
                timestamp: new Date().toISOString()
            };

            await this.saveResult(testResult);

            // Track complexity and throughput
            const duration = Date.now() - startTime;
            this.stats.totalComplexity += testData.complexity;
            this.stats.complexityHistory.push({
                timestamp: Date.now(),
                complexity: testData.complexity,
                duration,
                success: testResult.success
            });

            // Calculate throughput (tests/second) over last minute
            const recentTests = this.stats.complexityHistory.filter(
                t => t.timestamp > Date.now() - 60000
            );
            const throughput = recentTests.length / 60;
            this.stats.throughputHistory.push({
                timestamp: Date.now(),
                throughput,
                avgComplexity: recentTests.reduce((sum, t) => sum + t.complexity, 0) / recentTests.length
            });

            return testResult;

            const testResult = {
        } catch (error) {
            const testResult = {
                id: testId,
                script: testData.script,
                complexity: testData.complexity,
                metrics: testData.metrics,
                success: false,
                error: {
                    message: error.message,
                    stack: error.stack
                },
                timestamp: new Date().toISOString()
            };

            await this.saveResult(testResult);

            // Track complexity and throughput for failed tests as well
            const duration = Date.now() - startTime;
            this.stats.totalComplexity += testData.complexity;
            this.stats.complexityHistory.push({
                timestamp: Date.now(),
                complexity: testData.complexity,
                duration,
                success: testResult.success
            });

            // Calculate throughput (tests/second) over last minute
            const recentTests = this.stats.complexityHistory.filter(
                t => t.timestamp > Date.now() - 60000
            );
            const throughput = recentTests.length / 60;
            this.stats.throughputHistory.push({
                timestamp: Date.now(),
                throughput,
                avgComplexity: recentTests.reduce((sum, t) => sum + t.complexity, 0) / recentTests.length
            });

            return testResult;
        }
    }

    async saveResult(result) {
        const filename = path.join(this.resultsDir, `test_${result.id}.json`);
        await fs.writeFile(filename, JSON.stringify(result, null, 2));
    }

    async getStats() {
        const files = await fs.readdir(this.resultsDir);
        let success = 0;
        let failure = 0;

        for (const file of files) {
            const content = JSON.parse(
                await fs.readFile(path.join(this.resultsDir, file), 'utf8')
            );
            if (content.success) success++;
            else failure++;
        }

        return {
            total: files.length,
            success,
            failure,
            successRate: (success / files.length * 100).toFixed(2) + '%'
        };
    }
}

async function main() {
    const runner = new SimpleTestRunner();
    await runner.init();

    console.log('Starting test run...\n');

    // Run tests until we reach 100 errors
    let errorCount = 0;
    let testCount = 0;

    while (errorCount < 100) {
        const result = await runner.runTest();
        testCount++;
        
        if (!result.success) {
            errorCount++;
        }

        console.log(`Test ${testCount.toString().padStart(3, '0')}: ${result.success ? '✅ Passed' : '❌ Failed'} (Errors: ${errorCount}/100)`);
    }

    // Show final statistics
    const stats = await runner.getStats();
    console.log('\nTest Statistics:');
    console.log('================');
    console.log(`Total Tests: ${stats.total}`);
    console.log(`Successful: ${stats.success}`);
    console.log(`Failed: ${stats.failure}`);
    console.log(`Success Rate: ${stats.successRate}`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SimpleTestRunner;

        } catch (error) {
            const testResult = {
                id: testId,
                script: script,
                success: false,
                error: {
                    message: error.message,
                    stack: error.stack
                },
                timestamp: new Date().toISOString()
            };

            await this.saveResult(testResult);
            return testResult;
        }
    }

    async saveResult(result) {
        const filename = path.join(this.resultsDir, `test_${result.id}.json`);
        await fs.writeFile(filename, JSON.stringify(result, null, 2));
    }

    async getStats() {
        const files = await fs.readdir(this.resultsDir);
        let success = 0;
        let failure = 0;

        for (const file of files) {
            const content = JSON.parse(
                await fs.readFile(path.join(this.resultsDir, file), 'utf8')
            );
            if (content.success) success++;
            else failure++;
        }

        return {
            total: files.length,
            success,
            failure,
            successRate: (success / files.length * 100).toFixed(2) + '%'
        };
    }
}

async function main() {
    const runner = new SimpleTestRunner();
    await runner.init();

    console.log('Starting test run...\n');

    // Run tests until we reach 100 errors
    let errorCount = 0;
    let testCount = 0;

    while (errorCount < 100) {
        const result = await runner.runTest();
        testCount++;
        
        if (!result.success) {
            errorCount++;
        }

        console.log(`Test ${testCount.toString().padStart(3, '0')}: ${result.success ? '✅ Passed' : '❌ Failed'} (Errors: ${errorCount}/100)`);
    }

    // Show final statistics
    const stats = await runner.getStats();
    console.log('\nTest Statistics:');
    console.log('================');
    console.log(`Total Tests: ${stats.total}`);
    console.log(`Successful: ${stats.success}`);
    console.log(`Failed: ${stats.failure}`);
    console.log(`Success Rate: ${stats.successRate}`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SimpleTestRunner;
