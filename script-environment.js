// script-environment.js
const vm = require('node:vm');
const fs = require('node:fs').promises;
const path = require('node:path');
const { performance } = require('node:perf_hooks');

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
    },

    // Process Execution
    'child_process': {
        risk: 'CRITICAL',
        reasons: [
            'System command execution',
            'Shell access',
            'Arbitrary program execution'
        ]
    },
    'worker_threads': {
        risk: 'HIGH',
        reasons: [
            'Parallel processing abuse',
            'Resource exhaustion',
            'Sandbox escape attempts'
        ]
    },

    // System Information
    'os': {
        risk: 'MEDIUM',
        reasons: [
            'System information disclosure',
            'Network interface enumeration',
            'Resource usage monitoring'
        ]
    },

    // Crypto (can be CPU intensive)
    'crypto': {
        risk: 'MEDIUM',
        reasons: [
            'Resource exhaustion via heavy computation',
            'Random number generation manipulation',
            'Cryptographic attack vectors'
        ]
    },

    // Global Object Modifications
    'global': {
        risk: 'HIGH',
        reasons: [
            'Global scope pollution',
            'Prototype chain manipulation',
            'Context leakage'
        ]
    },
    'Buffer': {
        risk: 'HIGH',
        reasons: [
            'Memory manipulation',
            'Binary data attacks',
            'Buffer overflow potential'
        ]
    },

    // Timing Attacks
    'setInterval': {
        risk: 'MEDIUM',
        reasons: [
            'Resource exhaustion',
            'Infinite loops',
            'Timer-based attacks'
        ]
    },
    'setTimeout': {
        risk: 'MEDIUM',
        reasons: [
            'Delayed execution tricks',
            'Timer-based attacks',
            'Resource leaks'
        ]
    },

    // Constructor Access
    'Function': {
        risk: 'HIGH',
        reasons: [
            'Dynamic code generation',
            'Scope chain manipulation',
            'Sandbox escape attempts'
        ]
    },
    'WebAssembly': {
        risk: 'HIGH',
        reasons: [
            'Native code execution',
            'Performance attacks',
            'Memory manipulation'
        ]
    },

    // Reflection/Introspection
    'Proxy': {
        risk: 'MEDIUM',
        reasons: [
            'Object behavior manipulation',
            'Access control bypass',
            'Prototype pollution'
        ]
    },
    'Reflect': {
        risk: 'MEDIUM',
        reasons: [
            'Object manipulation',
            'Property access bypass',
            'Metaprogramming risks'
        ]
    }
};

class ScriptEnvironment {
    constructor(options = {}) {
        this.timeout = options.timeout || 1000;
        this.scriptsDir = options.scriptsDir || './test-scripts';
        this.resultsDir = options.resultsDir || './test-results';
        this.logsDir = options.logsDir || './test-logs';
        this.maxMemory = options.maxMemory || 1024 * 1024 * 10; // 10 MB default
        this.maxCalls = options.maxCalls || 10000;
        this.callCount = 0;
    }

    async init() {
        await Promise.all([
            fs.mkdir(this.scriptsDir, { recursive: true }),
            fs.mkdir(this.resultsDir, { recursive: true }),
            fs.mkdir(this.logsDir, { recursive: true })
        ]);
    }

    createContext() {
        // Start with minimal safe globals
        const safeGlobals = {
            console: {
                log: (...args) => {
                    if (this.callCount++ > this.maxCalls) {
                        throw new Error('Too many calls');
                    }
                    this.logs.push(args.join(' '));
                },
                error: (...args) => {
                    if (this.callCount++ > this.maxCalls) {
                        throw new Error('Too many calls');
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
            // Add any other safe APIs here
        };

        // Create context with only safe globals
        const context = vm.createContext(safeGlobals, {
            codeGeneration: {
                strings: false,
                wasm: false
            }
        });

        // Freeze the context to prevent modification
        Object.freeze(context);

        return context;
    }

    checkBlacklist(scriptContent) {
        for (const key in BLACKLIST) {
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            if (regex.test(scriptContent)) {
                throw new Error(`Usage of '${key}' is not allowed (${BLACKLIST[key].risk} risk)`);
            }
        }
    }

    monitorMemoryUsage() {
        const used = process.memoryUsage().heapUsed;
        if (used > this.maxMemory) {
            throw new Error('Memory limit exceeded');
        }
    }

    async executeScript(scriptContent, scriptId) {
        this.logs = [];
        this.errors = [];
        this.callCount = 0;
        const startTime = performance.now();

        // Check for blacklisted items
        this.checkBlacklist(scriptContent);

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
                executionTime: performance.now() - startTime
            };
            
            // Log execution time to console
            console.log(`Script ${scriptId} executed in ${executionData.executionTime.toFixed(2)}ms`);

            // Save results
            const resultPath = path.join(this.resultsDir, `${scriptId}_${startTime}.json`);
            await fs.writeFile(resultPath, JSON.stringify(executionData, null, 2));

            return executionData;

        } catch (error) {
            this.monitorMemoryUsage();
            
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
            const resultPath = path.join(this.resultsDir, `${scriptId}_${startTime}.json`);
            await fs.writeFile(resultPath, JSON.stringify(errorData, null, 2));

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
