const fs = require('fs').promises;
const path = require('path');

class SimpleTestRunner {
    constructor() {
        this.resultsDir = './simple-results';
    }

    async init() {
        await fs.mkdir(this.resultsDir, { recursive: true });
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
        
        return `
            async function test(a, b) {
                ${selectedOp}
            }
            test(${Math.random() * 100}, ${Math.random() * 100});
        `;
    }

    async runTest() {
        const script = this.generateTestScript();
        const testId = Date.now();

        try {
            // Execute the script within a try-catch block
            let result;
            try {
                result = await eval(script);
            } catch (innerError) {
                throw new Error(`Execution error: ${innerError.message}`);
            }

            const testResult = {
                id: testId,
                script: script,
                success: true,
                result: result,
                timestamp: new Date().toISOString()
            };

            await this.saveResult(testResult);
            return testResult;

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