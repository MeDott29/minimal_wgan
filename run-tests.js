// run-tests.js
const fs = require('node:fs').promises;
const path = require('node:path');
const ScriptEnvironment = require('./script-environment');

class TestRunner {
    constructor(options = {}) {
        this.env = new ScriptEnvironment({
            timeout: options.timeout || 5000,
            scriptsDir: options.scriptsDir || './test-scripts',
            resultsDir: options.resultsDir || './test-results',
            logsDir: options.logsDir || './test-logs'
        });
        
        this.results = {
            passed: 0,
            failed: 0,
            skipped: 0,
            total: 0,
            startTime: null,
            endTime: null,
            details: []
        };
    }

    async loadTestCases(filePath) {
        try {
            const testData = await fs.readFile(filePath, 'utf8');
            return JSON.parse(testData);
        } catch (error) {
            console.error('Error loading test cases:', error);
            throw new Error(`Failed to load test cases from ${filePath}`);
        }
    }

    async runTest(testCase) {
        console.log(`\nRunning test: ${testCase.id}`);
        console.log(`Description: ${testCase.description}`);
        console.log('----------------------------------------');

        try {
            const startTime = performance.now();
            const result = await this.env.executeScript(testCase.script, testCase.id);
            const duration = performance.now() - startTime;

            // Compare output if test should succeed
            const outputMatches = testCase.shouldSucceed ? 
                JSON.stringify(result.result) === JSON.stringify(testCase.expectedOutput) : 
                true;

            // Determine if test passed based on success state and output
            const passed = (result.success === testCase.shouldSucceed) && outputMatches;

            // Store detailed test results
            const testResult = {
                id: testCase.id,
                description: testCase.description,
                passed,
                duration,
                expected: {
                    success: testCase.shouldSucceed,
                    output: testCase.expectedOutput
                },
                actual: {
                    success: result.success,
                    output: result.result,
                    logs: result.logs,
                    errors: result.errors
                }
            };

            this.results.details.push(testResult);
            this.results[passed ? 'passed' : 'failed']++;
            
            // Print test results
            this.printTestResult(testResult);
            
            return testResult;

        } catch (error) {
            console.error('Test execution error:', error);
            this.results.failed++;
            return {
                id: testCase.id,
                passed: false,
                error: error.message
            };
        }
    }

    printTestResult(result) {
        console.log('\nTest Results:');
        console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`Duration: ${result.duration.toFixed(2)}ms`);

        if (result.actual.logs.length > 0) {
            console.log('\nLogs:');
            result.actual.logs.forEach(log => console.log(`  ${log}`));
        }

        if (result.actual.errors.length > 0) {
            console.log('\nErrors:');
            result.actual.errors.forEach(error => console.log(`  ${error}`));
        }

        if (!result.passed) {
            console.log('\nFailure Details:');
            console.log('Expected:');
            console.log('  Success:', result.expected.success);
            console.log('  Output:', result.expected.output);
            console.log('Actual:');
            console.log('  Success:', result.actual.success);
            console.log('  Output:', result.actual.output);
        }
    }

    printSummary() {
        const duration = this.results.endTime - this.results.startTime;
        console.log('\n========== Test Summary ==========');
        console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`Total Tests: ${this.results.total}`);
        console.log(`Passed: ${this.results.passed}`);
        console.log(`Failed: ${this.results.failed}`);
        console.log(`Skipped: ${this.results.skipped}`);
        console.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(2)}%`);
        console.log('=================================');

        if (this.results.failed > 0) {
            console.log('\nFailed Tests:');
            this.results.details
                .filter(result => !result.passed)
                .forEach(result => {
                    console.log(`- ${result.id}: ${result.description}`);
                });
        }
    }

    async saveResults(outputPath) {
        try {
            const resultsData = {
                summary: {
                    total: this.results.total,
                    passed: this.results.passed,
                    failed: this.results.failed,
                    skipped: this.results.skipped,
                    duration: this.results.endTime - this.results.startTime
                },
                details: this.results.details
            };

            await fs.writeFile(
                outputPath,
                JSON.stringify(resultsData, null, 2)
            );
            console.log(`\nTest results saved to: ${outputPath}`);
        } catch (error) {
            console.error('Error saving test results:', error);
        }
    }
}

async function main() {
    try {
        const runner = new TestRunner();
        await runner.env.init();

        // Load test cases
        const { testCases } = await runner.loadTestCases(
            path.join(process.cwd(), 'test-cases.json')
        );

        // Start timing
        runner.results.startTime = performance.now();
        runner.results.total = testCases.length;

        // Run all tests
        for (const testCase of testCases) {
            await runner.runTest(testCase);
        }

        // End timing
        runner.results.endTime = performance.now();

        // Print and save results
        runner.printSummary();
        await runner.saveResults(
            path.join(runner.env.resultsDir, `test-run-${Date.now()}.json`)
        );

    } catch (error) {
        console.error('Test runner error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = TestRunner;