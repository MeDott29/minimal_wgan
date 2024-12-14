// script-environment.js
const vm = require('node:vm');
const fs = require('node:fs').promises;
const path = require('node:path');
const { performance } = require('node:perf_hooks');

// Security configuration - APIs that are blocked in the sandbox
const BLACKLIST = {
    // System Access
    'process': {
        risk: 'CRITICAL',
        reasons: [
            'Access to environment variables and secrets',
            'System information exposure',
            'Process termination capability',
            'Direct stdio access'
        ]
    },
    'require': {
        risk: 'CRITICAL',
        reasons: [
            'Arbitrary module loading',
            'File system access',
            'Network capabilities',
            'Native module execution'
        ]
    },
    'eval': {
        risk: 'CRITICAL',
        reasons: [
            'Dynamic code execution',
            'Sandbox escape potential',
            'Context manipulation'
        ]
    },

    // File System Operations
    'fs': {
        risk: 'HIGH',
        reasons: [
            'File reading/writing',
            'Directory manipulation',
            'File deletion',
            'Sensitive data access'
        ]
    },
    'path': {
        risk: 'MEDIUM',
        reasons: [
            'File path traversal',
            'System structure discovery'
        ]
    },

    // Network Access
    'http': {
        risk: 'HIGH',
        reasons: [
            'Unauthorized network requests',
            'Data exfiltration',
            'Server creation'
        ]
    },
    'https': {
        risk: 'HIGH',
        reasons: [
            'Unauthorized secure network requests',
            'Certificate manipulation'
        ]
    },
    'net': {
        risk: 'HIGH',
        reasons: [
            'Raw socket access',
            'Network scanning',
            'Unauthorized connections'
        ]
    }
};

class ScriptEnvironment {
    constructor(options = {}) {
        // Initialize configuration
        this.timeout = options.timeout || 1000; // Default 1 second timeout
        this.scriptsDir = options.scriptsDir || './scripts';
        this.resultsDir = options.resultsDir || './results';
        this.logsDir = options.logsDir || './logs';
        this.maxMemory = options.maxMemory || 1024 * 1024 * 10; // 10 MB default
        this.maxCalls = options.maxCalls || 10000;
        
        // Initialize state
        this.logs = [];
        this.errors = [];
        this.callCount = 0;
    }

    async init() {
        try {
            // Ensure required directories exist
            await Promise.all([
                fs.mkdir(this.scriptsDir, { recursive: true }),
                fs.mkdir(this.resultsDir, { recursive: true }),
                fs.mkdir(this.logsDir, { recursive: true })
            ]);
        } catch (error) {
            throw new Error(`Failed to initialize directories: ${error.message}`);
        }
    }

    createContext() {
        // Create a minimal set of safe globals
        const safeGlobals = {
            console: {
                log: (...args) => {
                    if (this.callCount++ > this.maxCalls) {
                        throw new Error('Maximum call limit exceeded');
                    }
                    this.logs.push(args.join(' '));
                },
                error: (...args) => {
                    if (this.callCount++ > this.maxCalls) {
                        throw new Error('Maximum call limit exceeded');
                    }
                    this.errors.push(args.join(' '));
                }
            },
            // Safe built-ins
            Math,
            Date,
            Array,
            Object,
            String,
            Number,
            Boolean,
            Error,
            // Add any additional safe APIs here
        };

        // Create and freeze the context
        const context = vm.createContext(safeGlobals, {
            codeGeneration: {
                strings: false,
                wasm: false
            }
        });

        Object.freeze(context);
        return context;
    }

    checkBlacklist(scriptContent) {
        for (const [key, info] of Object.entries(BLACKLIST)) {
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            if (regex.test(scriptContent)) {
                throw new Error(
                    `Usage of '${key}' is not allowed (${info.risk} risk)\n` +
                    `Reasons:\n${info.reasons.map(r => `- ${r}`).join('\n')}`
                );
            }
        }
    }

    monitorMemoryUsage() {
        const used = process.memoryUsage().heapUsed;
        if (used > this.maxMemory) {
            throw new Error(`Memory limit exceeded: ${used} bytes used (max: ${this.maxMemory} bytes)`);
        }
    }

    async executeScript(scriptContent, scriptId) {
        // Reset state for new execution
        this.logs = [];
        this.errors = [];
        this.callCount = 0;
        const startTime = performance.now();

        try {
            // Security checks
            this.checkBlacklist(scriptContent);
            
            // Save script for reference
            const scriptPath = path.join(this.scriptsDir, `${scriptId}.js`);
            await fs.writeFile(scriptPath, scriptContent);

            // Create context and execute
            const context = this.createContext();
            const script = new vm.Script(scriptContent);
            
            const result = script.runInContext(context, {
                timeout: this.timeout,
                displayErrors: true
            });

            // Check resource usage
            this.monitorMemoryUsage();

            // Prepare execution data
            const executionData = {
                scriptId,
                success: true,
                result: this.sanitizeOutput(result),
                logs: this.logs,
                errors: this.errors,
                executionTime: performance.now() - startTime
            };

            // Save results
            const resultPath = path.join(
                this.resultsDir,
                `${scriptId}_${Date.now()}.json`
            );
            await fs.writeFile(
                resultPath,
                JSON.stringify(executionData, null, 2)
            );

            return executionData;

        } catch (error) {
            // Handle execution errors
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
                executionTime: performance.now() - startTime
            };

            // Save error results
            const resultPath = path.join(
                this.resultsDir,
                `${scriptId}_${Date.now()}.json`
            );
            await fs.writeFile(
                resultPath,
                JSON.stringify(errorData, null, 2)
            );

            return errorData;
        }
    }

    sanitizeOutput(output) {
        if (typeof output === 'object' && output !== null) {
            const seen = new WeakSet();
            const replacer = (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) {
                        return '[Circular]';
                    }
                    seen.add(value);
                }
                if (typeof value === 'function') {
                    return `[Function: ${value.name || 'anonymous'}]`;
                }
                return value;
            };
            return JSON.parse(JSON.stringify(output, replacer));
        }
        return output;
    }

    async getScriptHistory(scriptId) {
        try {
            const files = await fs.readdir(this.resultsDir);
            const history = [];

            for (const file of files) {
                if (file.startsWith(scriptId) && file.endsWith('.json')) {
                    const content = await fs.readFile(
                        path.join(this.resultsDir, file),
                        'utf8'
                    );
                    history.push(JSON.parse(content));
                }
            }

            return history;
        } catch (error) {
            throw new Error(`Failed to get script history: ${error.message}`);
        }
    }
}

module.exports = ScriptEnvironment;