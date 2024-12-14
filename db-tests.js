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
        
        // Test delete
        const deleted = await this.db.delete('users', doc.id);
        assert.equal(deleted, true, 'Delete should return true');
        
        // Verify document is gone
        const notFound = await this.db.read('users', doc.id);
        assert.equal(notFound, null, 'Document should not exist after deletion');
        
        // Test deleting non-existent document
        const deleteNonExistent = await this.db.delete('users', 'invalid-id');
        assert.equal(deleteNonExistent, false, 'Deleting non-existent document should return false');
        
        console.log('Delete tests passed! ✅');
    }
    
    async testFind() {
        console.log('\nTesting Find...');
        
        // Create test documents
        await this.db.create('users', {
            name: 'John Smith',
            age: 30,
            active: true
        });
        
        await this.db.create('users', {
            name: 'Jane Smith',
            age: 25,
            active: true
        });
        
        await this.db.create('users', {
            name: 'Bob Jones',
            age: 35,
            active: false
        });
        
        // Test simple query
        const activeUsers = await this.db.find('users', { active: true });
        assert.equal(activeUsers.length, 2, 'Should find 2 active users');
        
        // Test empty query (all documents)
        const allUsers = await this.db.find('users', {});
        assert.equal(allUsers.length, 3, 'Should find all users');
        
        // Test no matches
        const noMatches = await this.db.find('users', { age: 100 });
        assert.equal(noMatches.length, 0, 'Should find no matches');
        
        console.log('Find tests passed! ✅');
    }
    
    async testQueryOperators() {
        console.log('\nTesting Query Operators...');
        
        // Create test documents with various ages
        const ages = [20, 25, 30, 35, 40];
        for (const age of ages) {
            await this.db.create('users', {
                name: `Test User ${age}`,
                age: age
            });
        }
        
        // Test greater than
        const over30 = await this.db.find('users', { age: { $gt: 30 } });
        assert.equal(over30.length, 2, 'Should find 2 users over 30');
        
        // Test less than or equal
        const under25 = await this.db.find('users', { age: { $lte: 25 } });
        assert.equal(under25.length, 2, 'Should find 2 users 25 or under');
        
        // Test not equal
        const not30 = await this.db.find('users', { age: { $ne: 30 } });
        assert.equal(not30.length, 4, 'Should find 4 users not 30');
        
        // Test in array
        const specific = await this.db.find('users', { age: { $in: [25, 35] } });
        assert.equal(specific.length, 2, 'Should find 2 users with specific ages');
        
        console.log('Query Operators tests passed! ✅');
    }
    
    async testIndexing() {
        console.log('\nTesting Indexing...');
        
        // Create test documents
        await this.db.create('users', {
            name: 'Test User 1',
            email: 'test1@example.com'
        });
        
        await this.db.create('users', {
            name: 'Test User 2',
            email: 'test2@example.com'
        });
        
        // Create index on email field
        await this.db.createIndex('users', 'email');
        
        // Test finding by index
        const user = await this.db.findByIndex('users', 'email', 'test1@example.com');
        assert.equal(user.length, 1, 'Should find one user by email index');
        assert.equal(user[0].name, 'Test User 1', 'Should find correct user');
        
        // Test non-existent value
        const notFound = await this.db.findByIndex('users', 'email', 'nonexistent@example.com');
        assert.equal(notFound.length, 0, 'Should find no users with non-existent email');
        
        console.log('Indexing tests passed! ✅');
    }
    
    async testConcurrentAccess() {
        console.log('\nTesting Concurrent Access...');
        
        // Create initial document
        const doc = await this.db.create('users', {
            name: 'Concurrent Test',
            counter: 0
        });
        
        // Run multiple concurrent updates
        const updates = Array(5).fill().map(async () => {
            const current = await this.db.read('users', doc.id);
            const updated = await this.db.update('users', doc.id, {
                counter: current.counter + 1
            });
            return updated;
        });
        
        // Wait for all updates to complete
        await Promise.all(updates);
        
        // Verify final state
        const final = await this.db.read('users', doc.id);
        assert.equal(final.counter, 5, 'Counter should be updated correctly');
        
        console.log('Concurrent Access tests passed! ✅');
    }
    
    async testBackup() {
        console.log('\nTesting Backup...');
        
        // Create some test data
        await this.db.create('users', {
            name: 'Backup Test User',
            email: 'backup@example.com'
        });
        
        // Create backup
        const backupPath = path.join(process.cwd(), 'test-backup');
        const backupDir = await this.db.backup(backupPath);
        
        // Verify backup exists
        const backupExists = await fs.access(backupDir)
            .then(() => true)
            .catch(() => false);
        assert.equal(backupExists, true, 'Backup directory should exist');
        
        // Clean up backup
        await fs.rm(backupPath, { recursive: true, force: true });
        
        console.log('Backup tests passed! ✅');
    }
}

module.exports = DBTester;
