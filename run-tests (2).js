// run-tests.js
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const DBTester = require('./db-tests');
const ScriptEnvironment = require('./script-environment');

class TestRunner {
    constructor() {
        this.results = {
            scriptTests: {
                passed: 0,
                failed: 0,
                total: 0,
                duration: 0
            },
            dbTests: {
                passed: 0,
                failed: 0,
                total: 0,
                duration: 0
            }
        };
    }

    formatDuration(ms) {
        if (ms < 1000) return `${ms.toFixed(2)}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }

    printHeader(text) {
        console.log('\n' + '='.repeat(50));
        console.log(text);
        console.log('='.repeat(50));
    }

    async runScriptTests() {
        this.printHeader('Running Script Environment Tests');
        const startTime = performance.now();

        try {
            const env = new ScriptEnvironment({
                timeout: 5000,
                scriptsDir: './test-scripts',
                resultsDir: './test-results',
                logsDir: './test-logs'
            });

            await env.init();

            // Load test cases
            const testCases = await this.loadTestCases();
            this.results.scriptTests.total = testCases.length;

            for (const testCase of testCases) {
                try {
                    console.log(`\nRunning test: ${testCase.id}`);
                    console.log(`Description: ${testCase.description}`);
                    console.log('-'.repeat(40));

                    const result = await env.executeScript(testCase.script, testCase.id);
                    const success = this.validateTestResult(result, testCase);

                    if (success) {
                        console.log('✅ Test passed');
                        this.results.scriptTests.passed++;
                    } else {
                        console.log('❌ Test failed');
                        this.results.scriptTests.failed++;
                        console.log('Expected:', testCase.expectedOutput);
                        console.log('Actual:', result.result);
                    }
                } catch (error) {
                    console.error(`❌ Test ${testCase.id} failed with error:`, error);
                    this.results.scriptTests.failed++;
                }
            }

        } catch (error) {
            console.error('Script test suite failed:', error);
            process.exit(1);
        }

        this.results.scriptTests.duration = performance.now() - startTime;
    }

    async runDBTests() {
        this.printHeader('Running Database Tests');
        const startTime = performance.now();

        try {
            const dbTester = new DBTester();
            await dbTester.runTests();
            
            // DBTester handles its own results reporting
            this.results.dbTests.duration = performance.now() - startTime;
            
        } catch (error) {
            console.error('Database test suite failed:', error);
            process.exit(1);
        }
    }

    async loadTestCases() {
        try {
            // First try loading from test-cases.json
            const testCasesPath = path.join(process.cwd(), 'test-cases.json');
            delete require.cache[require.resolve(testCasesPath)];
            const { testCases } = require(testCasesPath);
            return testCases;
        } catch (error) {
            console.log('No test-cases.json found, using default test cases');
            // Return default test cases if file doesn't exist
            return [{
                id: "default-001",
                description: "Basic arithmetic operations",
                script: "const a = 5;\nconst b = 3;\nconsole.log('Computing...');\nconst result = a + b;\n({ result })",
                expectedOutput: { result: 8 },
                shouldSucceed: true
            }];
        }
    }

    validateTestResult(result, testCase) {
        if (result.success !== testCase.shouldSucceed) return false;
        if (!testCase.shouldSucceed) return true;
        
        return JSON.stringify(result.result) === JSON.stringify(testCase.expectedOutput);
    }

    printSummary() {
        this.printHeader('Test Summary');

        console.log('\nScript Environment Tests:');
        console.log(`Total: ${this.results.scriptTests.total}`);
        console.log(`Passed: ${this.results.scriptTests.passed}`);
        console.log(`Failed: ${this.results.scriptTests.failed}`);
        console.log(`Duration: ${this.formatDuration(this.results.scriptTests.duration)}`);

        console.log('\nDatabase Tests:');
        console.log(`Duration: ${this.formatDuration(this.results.dbTests.duration)}`);

        console.log('\nTotal Test Duration:', 
            this.formatDuration(this.results.scriptTests.duration + this.results.dbTests.duration));

        const anyFailed = this.results.scriptTests.failed > 0;
        console.log('\nOverall Status:', anyFailed ? '❌ FAILED' : '✅ PASSED');
    }
}

async function main() {
    const runner = new TestRunner();

    try {
        await runner.runScriptTests();
        await runner.runDBTests();
        runner.printSummary();

        // Exit with appropriate code
        if (runner.results.scriptTests.failed > 0) {
            process.exit(1);
        }
    } catch (error) {
        console.error('Test runner failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = TestRunner;