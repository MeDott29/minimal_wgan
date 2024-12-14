const ScriptEnvironment = require('./script-environment');

async function main() {
    const env = new ScriptEnvironment({
        timeout: 3000,
        scriptsDir: './generated-scripts',
        resultsDir: './execution-results',
        logsDir: './execution-logs'
    });

    await env.init();
    
    // Test 1: Simple valid script
    console.log('\nTest 1: Running simple valid script...');
    const result1 = await env.executeScript(`
        let x = 5;
        let y = 10;
        console.log('Computing sum...');
        x + y;
    `, 'test-001');
    console.log('Result 1:', JSON.stringify(result1, null, 2));

    // Test 2: Script with error
    console.log('\nTest 2: Running script with error...');
    const result2 = await env.executeScript(`
        throw new Error('This is a test error');
    `, 'test-002');
    console.log('Result 2:', JSON.stringify(result2, null, 2));

    // Test 3: Script with infinite loop (should timeout)
    console.log('\nTest 3: Running script that should timeout...');
    const result3 = await env.executeScript(`
        while(true) { }
    `, 'test-003');
    console.log('Result 3:', JSON.stringify(result3, null, 2));

    // Test 4: Get history for a script
    console.log('\nTest 4: Getting script history...');
    const history = await env.getScriptHistory('test-001');
    console.log('History:', JSON.stringify(history, null, 2));
}

main().catch(console.error);
