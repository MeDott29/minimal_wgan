// simple-db.js
const fs = require('node:fs').promises;
const path = require('node:path');
const crypto = require('node:crypto');

class SimpleDB {
    constructor(options = {}) {
        this.dbPath = options.dbPath || './db';
        this.lockPath = path.join(this.dbPath, '.locks');
        this.dataPath = path.join(this.dbPath, 'data');
        this.indexPath = path.join(this.dbPath, 'indexes');
        this.lockTimeout = options.lockTimeout || 5000;
        this.retryDelay = options.retryDelay || 100;
        this.maxRetries = options.maxRetries || 50;
    }

    async init() {
        await Promise.all([
            fs.mkdir(this.dbPath, { recursive: true }),
            fs.mkdir(this.lockPath, { recursive: true }),
            fs.mkdir(this.dataPath, { recursive: true }),
            fs.mkdir(this.indexPath, { recursive: true })
        ]);
    }

    async generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    async acquireLock(collection, id) {
        const lockFile = path.join(this.lockPath, `${collection}_${id}.lock`);
        let retries = 0;

        while (retries < this.maxRetries) {
            try {
                await fs.writeFile(lockFile, Date.now().toString(), { flag: 'wx' });
                return lockFile;
            } catch (error) {
                if (error.code === 'EEXIST') {
                    try {
                        const stat = await fs.stat(lockFile);
                        if (Date.now() - stat.mtime > this.lockTimeout) {
                            await fs.unlink(lockFile);
                            continue;
                        }
                    } catch (statError) {
                        if (statError.code === 'ENOENT') continue;
                        throw statError;
                    }
                }
                retries++;
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }
        throw new Error(`Failed to acquire lock for ${collection}:${id}`);
    }

    async releaseLock(lockFile) {
        try {
            await fs.unlink(lockFile);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Error releasing lock ${lockFile}:`, error);
            }
        }
    }

    getCollectionPath(collection) {
        return path.join(this.dataPath, collection);
    }

    getDocumentPath(collection, id) {
        return path.join(this.getCollectionPath(collection), `${id}.json`);
    }

    async ensureCollection(collection) {
        await fs.mkdir(this.getCollectionPath(collection), { recursive: true });
    }

    async create(collection, document) {
        await this.ensureCollection(collection);
        
        const id = document.id || await this.generateId();
        document.id = id;
        
        const lockFile = await this.acquireLock(collection, id);
        
        try {
            const docPath = this.getDocumentPath(collection, id);
            
            try {
                await fs.access(docPath);
                throw new Error(`Document ${id} already exists in ${collection}`);
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
            
            await fs.writeFile(docPath, JSON.stringify(document, null, 2));
            return document;
            
        } finally {
            await this.releaseLock(lockFile);
        }
    }

    async read(collection, id) {
        const docPath = this.getDocumentPath(collection, id);
        const lockFile = await this.acquireLock(collection, id);
        
        try {
            const data = await fs.readFile(docPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        } finally {
            await this.releaseLock(lockFile);
        }
    }

    async update(collection, id, updates) {
        const lockFile = await this.acquireLock(collection, id);
        
        try {
            const document = await this.read(collection, id);
            if (!document) {
                throw new Error(`Document ${id} not found in ${collection}`);
            }
            
            const updated = { ...document, ...updates, id };
            await fs.writeFile(
                this.getDocumentPath(collection, id),
                JSON.stringify(updated, null, 2)
            );
            
            return updated;
        } finally {
            await this.releaseLock(lockFile);
        }
    }

    async delete(collection, id) {
        const lockFile = await this.acquireLock(collection, id);
        
        try {
            await fs.unlink(this.getDocumentPath(collection, id));
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return false;
            }
            throw error;
        } finally {
            await this.releaseLock(lockFile);
        }
    }

    async find(collection, query = {}) {
        await this.ensureCollection(collection);
        const collectionPath = this.getCollectionPath(collection);
        
        try {
            const files = await fs.readdir(collectionPath);
            const documents = [];
            
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                
                const id = file.slice(0, -5);
                const doc = await this.read(collection, id);
                
                if (doc && this.matchesQuery(doc, query)) {
                    documents.push(doc);
                }
            }
            
            return documents;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    matchesQuery(doc, query) {
        for (const [key, value] of Object.entries(query)) {
            if (!doc.hasOwnProperty(key)) return false;
            
            if (typeof value === 'object' && value !== null) {
                for (const [op, opValue] of Object.entries(value)) {
                    switch (op) {
                        case '$gt':
                            if (!(doc[key] > opValue)) return false;
                            break;
                        case '$gte':
                            if (!(doc[key] >= opValue)) return false;
                            break;
                        case '$lt':
                            if (!(doc[key] < opValue)) return false;
                            break;
                        case '$lte':
                            if (!(doc[key] <= opValue)) return false;
                            break;
                        case '$ne':
                            if (doc[key] === opValue) return false;
                            break;
                        case '$in':
                            if (!Array.isArray(opValue) || !opValue.includes(doc[key])) return false;
                            break;
                        default:
                            throw new Error(`Unknown operator: ${op}`);
                    }
                }
            } else if (doc[key] !== value) {
                return false;
            }
        }
        return true;
    }

    async createIndex(collection, field) {
        const documents = await this.find(collection);
        const index = {};
        
        for (const doc of documents) {
            const value = doc[field];
            if (value === undefined) continue;
            
            if (!index[value]) {
                index[value] = [];
            }
            index[value].push(doc.id);
        }
        
        const indexFile = path.join(this.indexPath, `${collection}_${field}.idx`);
        await fs.writeFile(indexFile, JSON.stringify(index, null, 2));
    }

    async findByIndex(collection, field, value) {
        const indexFile = path.join(this.indexPath, `${collection}_${field}.idx`);
        
        try {
            const indexData = await fs.readFile(indexFile, 'utf8');
            const index = JSON.parse(indexData);
            
            const ids = index[value] || [];
            const documents = [];
            
            for (const id of ids) {
                const doc = await this.read(collection, id);
                if (doc) {
                    documents.push(doc);
                }
            }
            
            return documents;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    async backup(backupPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(backupPath, `backup_${timestamp}`);
        
        await fs.mkdir(backupDir, { recursive: true });
        
        const copyDir = async (src, dest) => {
            await fs.mkdir(dest, { recursive: true });
            const entries = await fs.readdir(src, { withFileTypes: true });
            
            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                
                if (entry.isDirectory()) {
                    await copyDir(srcPath, destPath);
                } else {
                    await fs.copyFile(srcPath, destPath);
                }
            }
        };
        
        await copyDir(this.dataPath, path.join(backupDir, 'data'));
        await copyDir(this.indexPath, path.join(backupDir, 'indexes'));
        
        return backupDir;
    }
}

module.exports = SimpleDB;