// test-db.js
const SimpleDB = require('./simple-db');
const fs = require('node:fs').promises;
const path = require('node:path');
const assert = require('node:assert').strict;

class DBTester {
    constructor() {
        this.dbPath = path.join(process.cwd(), 'test-db');
        this.db = new SimpleDB({ dbPath: this.dbPath });
    }

    async setup() {
        await this.db.init();
    }

    async cleanup() {
        await fs.rm(this.dbPath, { recursive: true, force: true });
    }

    async runTests() {
        try {
            await this.setup();
            
            console.log('\nRunning Database Tests...');
            console.log('========================');

            // Basic CRUD Tests
            await this.testCreate();
            await this.testRead();
            await this.testUpdate();
            await this.testDelete();

            // Query Tests
            await this.testFind();
            await this.testQueryOperators();

            // Index Tests
            await this.testIndexing();

            // Concurrency Tests
            await this.testConcurrentAccess();

            // Backup Tests
            await this.testBackup();

            console.log('\nAll tests passed! ✅');

        } catch (error) {
            console.error('\nTest failed! ❌');
            console.error(error);
            process.exit(1);
        } finally {
            await this.cleanup();
        }
    }

    async testCreate() {
        console.log('\nTesting Create...');
        
        // Test basic creation
        const doc = await this.db.create('users', {
            name: 'John Doe',
            email: 'john@example.com'
        });
        
        assert(doc.id, 'Document should have an ID');
        assert.equal(doc.name, 'John Doe', 'Name should match');
        
        // Test duplicate creation
        try {
            await this.db.create('users', { id: doc.id, name: 'Jane Doe' });
            assert.fail('Should not allow duplicate IDs');
        } catch (error) {
            assert(error.message.includes('already exists'));
        }
        
        console.log('Create tests passed! ✅');
    }

    async testRead() {
        console.log('\nTesting Read...');
        
        // Create test document
        const created = await this.db.create('users', {
            name: 'Jane Doe',
            email: 'jane@example.com'
        });
        
        // Test successful read
        const doc = await this.db.read('users', created.id);
        assert.equal(doc.name, 'Jane Doe', 'Should read correct document');
        
        // Test reading non-existent document
        const nonexistent = await this.db.read('users', 'invalid-id');
        assert.equal(nonexistent, null, 'Should return null for non-existent document');
        
        console.log('Read tests passed! ✅');
    }

    async testUpdate() {
        console.log('\nTesting Update...');
        
        // Create test document
        const doc = await this.db.create('users', {
            name: 'Bob Smith',
            email: 'bob@example.com'
        });
        
        // Test update
        const updated = await this.db.update('users', doc.id, {
            name: 'Robert Smith'
        });
        
        assert.equal(updated.name, 'Robert Smith', 'Name should be updated');
        assert.equal(updated.email, 'bob@example.com', 'Unmodified fields should persist');
        
        // Test updating non-existent document
        try {
            await this.db.update('users', 'invalid-id', { name: 'Test' });
            assert.fail('Should not update non-existent document');
        } catch (error) {
            assert(error.message.includes('not found'));
        }
        
        console.log('Update tests passed! ✅');
    }

    async testDelete() {
        console.log('\nTesting Delete...');
        
        // Create test document
        const doc = await this.db.create('users', {
            name: 'Alice Brown',
            email: 'alice@example.com'
        });
        
        // Test successful delete
        const deleted = await this.db.delete('users', doc.id);
        assert.equal