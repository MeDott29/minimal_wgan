// run-tests.js
const fs = require('node:fs').promises;
const path = require('node:path');
const ScriptEnvironment = require('./script-environment');

async function loadTestCases() {
    const testData = await fs.readFile(path.join(process.cwd(), 'test-cases.json'), 'utf8');
    return JSON.parse(testData);
}

async function runTest(env, testCase) {
    console.log(`\nRunning test: ${testCase.id}`);
    console.log(`Description: ${testCase.description}`);
    console.log('----------------------------------------');

    try {
        const result = await env.executeScript(testCase.script, testCase.id);
        
        // Deep comparison of output
        const outputMatches = JSON.stringify(result.result) === JSON.stringify(testCase.expectedOutput);
        
        console.log('Test Results:');
        console.log('Success:', result.success);
        console.log('Expected Output:', testCase.expectedOutput);
        console.log('Actual Output:', result.result);
        console.log('Output Matches:', outputMatches);
        console.log('Logs:', result.logs);
        
        if (result.error) {
            console.log('Error:', result.error);
        }
        
        // Verify if test behaved as expected
        const testPassed = (result.success === testCase.shouldSucceed) && 
                         (testCase.shouldSucceed ? outputMatches : true);
        
        console.log('\nTest', testPassed ? 'PASSED' : 'FAILED');
        return testPassed;
    } catch (error) {
        console.error('Test execution error:', error);
        return false;
    }
}

async function main() {
    try {
        // Initialize the script environment
        const env = new ScriptEnvironment({
            timeout: 5000,
            scriptsDir: './test-scripts',
            resultsDir: './test-results',
            logsDir: './test-logs'
        });
        await env.init();

        // Load and run test cases
        const { testCases } = await loadTestCases();
        let passed = 0;
        let failed = 0;

        for (const testCase of testCases) {
            const result = await runTest(env, testCase);
            if (result) {
                passed++;
            } else {
                failed++;
            }
        }

        // Print summary
        console.log('\n========== Test Summary ==========');
        console.log(`Total Tests: ${testCases.length}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log('=================================');

    } catch (error) {
        console.error('Test runner error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}