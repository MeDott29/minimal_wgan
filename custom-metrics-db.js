const fs = require('fs').promises;
const path = require('path');

class FileDB {
    constructor(basePath = 'ai_metrics_db') {
        this.basePath = basePath;
        this.tables = {
            scripts: path.join(basePath, 'scripts'),
            errors: path.join(basePath, 'errors'),
            metrics: path.join(basePath, 'metrics')
        };
        this.indexes = {};
        this.counters = {};
    }

    async init() {
        // Create base directory and table directories
        await fs.mkdir(this.basePath, { recursive: true });
        await Promise.all(
            Object.values(this.tables).map(dir => 
                fs.mkdir(dir, { recursive: true })
            )
        );

        // Initialize counters
        await Promise.all(
            Object.keys(this.tables).map(async table => {
                this.counters[table] = await this.getHighestId(table);
            })
        );

        // Load indexes
        await this.loadIndexes();
    }

    async loadIndexes() {
        for (const [table, dir] of Object.entries(this.tables)) {
            this.indexes[table] = {
                timestamp: new Map(),
                id: new Map()
            };

            try {
                const files = await fs.readdir(dir);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const data = JSON.parse(
                            await fs.readFile(path.join(dir, file), 'utf8')
                        );
                        this.indexes[table].id.set(data.id, file);
                        this.indexes[table].timestamp.set(data.timestamp, data.id);
                    }
                }
            } catch (error) {
                console.error(`Error loading index for ${table}:`, error);
            }
        }
    }

    async getHighestId(table) {
        try {
            const files = await fs.readdir(this.tables[table]);
            let maxId = 0;
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const id = parseInt(file.split('_')[0]);
                    maxId = Math.max(maxId, id);
                }
            }
            
            return maxId;
        } catch (error) {
            return 0;
        }
    }

    async insert(table, data) {
        if (!this.tables[table]) {
            throw new Error(`Table ${table} does not exist`);
        }

        const id = ++this.counters[table];
        const timestamp = new Date().toISOString();
        const record = { id, timestamp, ...data };
        const fileName = `${id}_${timestamp.replace(/[:.]/g, '-')}.json`;
        const filePath = path.join(this.tables[table], fileName);

        await fs.writeFile(filePath, JSON.stringify(record, null, 2));

        // Update indexes
        this.indexes[table].id.set(id, fileName);
        this.indexes[table].timestamp.set(timestamp, id);

        return id;
    }

    async get(table, id) {
        const fileName = this.indexes[table].id.get(id);
        if (!fileName) return null;

        const filePath = path.join(this.tables[table], fileName);
        try {
            return JSON.parse(await fs.readFile(filePath, 'utf8'));
        } catch (error) {
            return null;
        }
    }

    async query(table, conditions = {}, limit = null) {
        const results = [];
        const files = await fs.readdir(this.tables[table]);

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const data = JSON.parse(
                await fs.readFile(path.join(this.tables[table], file), 'utf8')
            );

            if (this._matchesConditions(data, conditions)) {
                results.push(data);
            }

            if (limit && results.length >= limit) break;
        }

        return results;
    }

    _matchesConditions(data, conditions) {
        for (const [key, value] of Object.entries(conditions)) {
            if (typeof value === 'function') {
                if (!value(data[key])) return false;
            } else if (data[key] !== value) {
                return false;
            }
        }
        return true;
    }
}

class AIMetricsSystem {
    constructor(basePath = 'ai_metrics_db') {
        this.db = new FileDB(basePath);
    }

    async init() {
        await this.db.init();
    }

    async recordScript(content, manual_intervention = false) {
        return await this.db.insert('scripts', {
            content,
            char_count: content.length,
            run_count: 0,
            manual_intervention
        });
    }

    async recordError(scriptId, errorMessage, stackTrace) {
        return await this.db.insert('errors', {
            script_id: scriptId,
            error_message: errorMessage,
            stack_trace: stackTrace
        });
    }

    async updateMetrics() {
        const [scripts, errors] = await Promise.all([
            this.db.query('scripts'),
            this.db.query('errors')
        ]);

        const totalScripts = scripts.length;
        const totalRuns = scripts.reduce((sum, s) => sum + (s.run_count || 0), 0);
        const totalErrors = errors.length;
        const avgChars = scripts.reduce((sum, s) => sum + s.char_count, 0) / totalScripts;
        const totalManualScripts = scripts.filter(s => s.manual_intervention).length;

        // Calculate errors per minute
        const now = new Date();
        const oneMinuteAgo = new Date(now - 60000);
        const recentErrors = errors.filter(e => 
            new Date(e.timestamp) >= oneMinuteAgo
        ).length;

        return await this.db.insert('metrics', {
            total_scripts: totalScripts,
            total_runs: totalRuns,
            total_errors: totalErrors,
            avg_chars_per_script: avgChars,
            errors_per_minute: recentErrors,
            total_manual_scripts: totalManualScripts
        });
    }

    async getProgressTowardsGoal(targetErrors = 1000000) {
        const errors = await this.db.query('errors');
        const currentErrors = errors.length;
        const progress = (currentErrors / targetErrors) * 100;

        return {
            currentErrors,
            targetErrors,
            progressPercentage: progress,
            remainingErrors: targetErrors - currentErrors
        };
    }

    async getErrorGenerationRate() {
        const errors = await this.db.query('errors');
        if (errors.length === 0) {
            return {
                errorsPerMinute: 0,
                totalErrors: 0,
                minutesElapsed: 0
            };
        }

        const firstError = new Date(errors[0].timestamp);
        const lastError = new Date(errors[errors.length - 1].timestamp);
        const minutesElapsed = (lastError - firstError) / (1000 * 60);

        return {
            errorsPerMinute: errors.length / (minutesElapsed || 1),
            totalErrors: errors.length,
            minutesElapsed
        };
    }

    async generateReport() {
        const [progress, rate] = await Promise.all([
            this.getProgressTowardsGoal(),
            this.getErrorGenerationRate()
        ]);

        const metrics = await this.db.query('metrics', {}, 1);

        return {
            progress,
            rate,
            metrics: metrics[0],
            estimatedTimeToGoal: {
                minutes: progress.remainingErrors / (rate.errorsPerMinute || 1)
            },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = AIMetricsSystem;

// Example usage:
async function main() {
    const metrics = new AIMetricsSystem();
    await metrics.init();
    
    const scriptContent = await fs.readFile(__filename, 'utf-8');

    // Record a test script
    const scriptId = await metrics.recordScript(scriptContent);
    
    // Record a test error
    await metrics.recordError(
        scriptId,
        'ReferenceError: x is not defined',
        'at Object.<anonymous> (/test.js:1:1)'
    );
    
    // Update metrics
    await metrics.updateMetrics();
    
    // Generate report
    const report = await metrics.generateReport();
    console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
    main().catch(console.error);
}
