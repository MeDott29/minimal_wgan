const ScriptEnvironment = require('./script-environment');

class TestRunner {
    constructor() {
        this.env = new ScriptEnvironment({
            timeout: 1000,
            maxMemory: 10 * 1024 * 1024, // 10MB
            maxCalls: 10000,
            scriptsDir: './test-scripts',
            resultsDir: './test-results',
            logsDir: './test-logs'
        });
        this.results = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
    }

    async initialize() {
        await this.env.init();
    }

    formatResult(result) {
        return {
            success: result.success,
            output: result.result,
            logs: result.logs,
            errors: result.errors,
            executionTime: result.executionTime,
            error: result.error ? {
                name: result.error.name,
                message: result.error.message
            } : null
        };
    }

    async runTest(testCase) {
        console.log(`\nRunning Test: ${testCase.id}`);
        console.log(`Description: ${testCase.description}`);
        console.log('-'.repeat(50));

        const startTime = Date.now();
        const result = await this.env.executeScript(testCase.script, testCase.id);
        const endTime = Date.now();

        const formattedResult = this.formatResult(result);
        const expectedSuccess = testCase.shouldSucceed;
        const actualSuccess = result.success;
        const outputMatch = testCase.shouldSucceed ? 
            JSON.stringify(result.result) === JSON.stringify(testCase.expectedOutput) : 
            true;

        const passed = (expectedSuccess === actualSuccess) && outputMatch;

        const testResult = {
            id: testCase.id,
            description: testCase.description,
            passed,
            expectedSuccess,
            actualSuccess,
            outputMatch,
            expected: testCase.expectedOutput,
            actual: formattedResult,
            duration: endTime - startTime
        };

        this.results.details.push(testResult);
        this.results[passed ? 'passed' : 'failed']++;
        this.results.total++;

        this.printTestResult(testResult);
        return testResult;
    }

    printTestResult(result) {
        console.log(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
        console.log(`Duration: ${result.duration}ms`);
        
        if (!result.passed) {
            console.log('\nFailure Details:');
            if (result.expectedSuccess !== result.actualSuccess) {
                console.log(`- Expected script to ${result.expectedSuccess ? 'succeed' : 'fail'}`);
                console.log(`- Script ${result.actualSuccess ? 'succeeded' : 'failed'}`);
            }
            if (!result.outputMatch && result.expectedSuccess) {
                console.log('- Output mismatch:');
                console.log('  Expected:', result.expected);
                console.log('  Actual:', result.actual.output);
            }
            if (result.actual.error) {
                console.log('- Error:', result.actual.error);
            }
        }

        if (result.actual.logs.length > 0) {
            console.log('\nLogs:');
            result.actual.logs.forEach(log => console.log(`- ${log}`));
        }
    }

    printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('Test Summary');
        console.log('='.repeat(50));
        console.log(`Total Tests: ${this.results.total}`);
        console.log(`Passed: ${this.results.passed}`);
        console.log(`Failed: ${this.results.failed}`);
        console.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(2)}%`);
    }
}

module.exports = TestRunner;