/**
 * Database initialization and startup script
 * Run this to set up the database for first use
 */

// Load environment variables first
require('dotenv').config();

const { 
  initializeDatabase, 
  testConnection, 
  getDatabaseStats,
  closeDatabase
} = require('./db');
const { runMigrations } = require('./migrations');
const { testEncryption } = require('../lib/crypto');

async function setup() {
  console.log('='.repeat(60));
  console.log('DATABASE SETUP');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Test database connection
    console.log('1. Testing database connection...');
    const connectionOk = await testConnection();
    if (!connectionOk) {
      throw new Error('Database connection failed');
    }
    console.log('   ✓ Database connection successful');
    console.log('');

    // Test encryption
    console.log('2. Testing encryption...');
    const encryptionOk = testEncryption();
    if (!encryptionOk) {
      throw new Error('Encryption test failed');
    }
    console.log('');

    // Initialize database schema
    console.log('3. Initializing database schema...');
    await initializeDatabase();
    console.log('');

    // Run migrations
    console.log('4. Running migrations...');
    const migrationResult = await runMigrations();
    console.log('');

    // Get statistics
    console.log('5. Database statistics:');
    const stats = await getDatabaseStats();
    console.log(`   - Connectors: ${stats.connectors}`);
    console.log(`   - Sync Configs: ${stats.syncConfigs}`);
    console.log(`   - Synced Items: ${stats.syncedItems}`);
    console.log(`   - Executions: ${stats.executions}`);
    console.log(`   - Pending Conflicts: ${stats.pendingConflicts}`);
    console.log('');

    console.log('='.repeat(60));
    console.log('✓ DATABASE SETUP COMPLETE');
    console.log('='.repeat(60));
    console.log('');
    console.log('Next steps:');
    console.log('  1. Set ENCRYPTION_KEY environment variable for production');
    console.log('  2. Start the server: npm start');
    console.log('  3. Access the UI to configure connectors');
    console.log('');

    await closeDatabase();
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('✗ SETUP FAILED');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    
    await closeDatabase();
    process.exit(1);
  }
}

// Run setup
setup();
