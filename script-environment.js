const { NodeVM, VMScript } = require('vm2');
const fs = require('fs').promises;
const path = require('path');

class ScriptEnvironment {
    constructor(options = {}) {
        this.timeout = options.timeout || 1000;
        this.scriptsDir = options.scriptsDir || './generated-scripts';
        this.resultsDir = options.resultsDir || './execution-results';
        this.logsDir = options.logsDir || './execution-logs';
        this.vm = new NodeVM({
            console: 'inherit',
            timeout: this.timeout,
            sandbox: {},
            require: {
                external: true,
                builtin: ['fs', 'path', 'util', 'events', 'stream', 'string_decoder', 'assert', 'async_hooks', 'timers', 'zlib']
            }
        });
    }

    async init() {
        await this.ensureDirectoryExists(this.scriptsDir);
        await this.ensureDirectoryExists(this.resultsDir);
        await this.ensureDirectoryExists(this.logsDir);
    }

    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    async executeScript(scriptContent, scriptName) {
        const scriptId = `${scriptName}-${Date.now()}`;
        const scriptPath = path.join(this.scriptsDir, `${scriptId}.js`);
        const resultPath = path.join(this.resultsDir, `${scriptId}.json`);
        const logPath = path.join(this.logsDir, `${scriptId}.log`);

        try {
            // Save the script to a file
            await fs.writeFile(scriptPath, scriptContent);

            // Capture console output
            const logStream = fs.createWriteStream(logPath);
            const originalConsoleLog = console.log;
            console.log = (...args) => {
                logStream.write(util.format(...args) + '\n');
                originalConsoleLog(...args);
            };

            // Execute the script
            const script = new VMScript(scriptContent, scriptPath);
            const result = this.vm.run(script);

            // Save the result
            await fs.writeFile(resultPath, JSON.stringify({ result }, null, 2));

            return {
                success: true,
                result,
                logs: await fs.readFile(logPath, 'utf-8'),
                scriptId
            };
        } catch (error) {
            // Save the error
            await fs.writeFile(resultPath, JSON.stringify({ error: error.message }, null, 2));

            return {
                success: false,
                error: error.message,
                logs: await fs.readFile(logPath, 'utf-8'),
                scriptId
            };
        } finally {
            // Restore console.log
            console.log = originalConsoleLog;
        }
    }

    async getScriptHistory(scriptName) {
        const files = await fs.readdir(this.resultsDir);
        const history = [];

        for (const file of files) {
            if (file.startsWith(scriptName) && file.endsWith('.json')) {
                const filePath = path.join(this.resultsDir, file);
                const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
                history.push({
                    scriptId: file.replace('.json', ''),
                    ...data
                });
            }
        }

        return history;
    }
}

module.exports = ScriptEnvironment;
