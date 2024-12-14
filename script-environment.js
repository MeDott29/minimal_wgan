// script-environment.js
const vm = require('node:vm');
const fs = require('node:fs').promises;
const path = require('node:path');

class ScriptEnvironment {
    constructor(options = {}) {
        this.timeout = options.timeout || 1000;
        this.scriptsDir = options.scriptsDir || './test-scripts';
        this.resultsDir = options.resultsDir || './test-results';
        this.logsDir = options.logsDir || './test-logs';
    }

    async init() {
        await Promise.all([
            fs.mkdir(this.scriptsDir, { recursive: true }),
            fs.mkdir(this.resultsDir, { recursive: true }),
            fs.mkdir(this.logsDir, { recursive: true })
        ]);
    }

    createContext() {
        // Create a new context with limited capabilities
        return vm.createContext({
            console: {
                log: (...args) => this.logs.push(args.join(' ')),
                error: (...args) => this.errors.push(args.join(' '))
            },
            Math,
            Date,
            Array,
            Object,
            String,
            Number,
            Boolean,
            Error
        });
    }

    async executeScript(scriptContent, scriptId) {
        this.logs = [];
        this.errors = [];
        const startTime = Date.now();

        try {
            // Save script to file for reference
            const scriptPath = path.join(this.scriptsDir, `${scriptId}.js`);
            await fs.writeFile(scriptPath, scriptContent);

            // Create context and run script
            const context = this.createContext();
            const script = new vm.Script(scriptContent);
            const result = script.runInContext(context, {
                timeout: this.timeout,
                displayErrors: true
            });

            const executionData = {
                scriptId,
                success: true,
                result,
                logs: this.logs,
                errors: this.errors,
                executionTime: Date.now() - startTime
            };

            // Save results
            const resultPath = path.join(this.resultsDir, `${scriptId}_${startTime}.json`);
            await fs.writeFile(resultPath, JSON.stringify(executionData, null, 2));

            return executionData;

        } catch (error) {
            const errorData = {
                scriptId,
                success: false,
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                },
                logs: this.logs,
                errors: this.errors,
                executionTime: Date.now() - startTime
            };

            // Save error results
            const resultPath = path.join(this.resultsDir, `${scriptId}_${startTime}.json`);
            await fs.writeFile(resultPath, JSON.stringify(errorData, null, 2));

            return errorData;
        }
    }

    async getScriptHistory(scriptId) {
        const files = await fs.readdir(this.resultsDir);
        const history = [];

        for (const file of files) {
            if (file.startsWith(scriptId) && file.endsWith('.json')) {
                const content = await fs.readFile(path.join(this.resultsDir, file), 'utf8');
                history.push(JSON.parse(content));
            }
        }

        return history;
    }
}

module.exports = ScriptEnvironment;