/**
 * Database Connection and Management
 * Handles SQLite database initialization and provides Knex query builder
 */

const knex = require('knex');
const path = require('path');
const fs = require('fs');

// Database configuration
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/sync.db');
const DB_DIR = path.dirname(DB_PATH);

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize Knex with SQLite
const db = knex({
  client: 'sqlite3',
  connection: {
    filename: DB_PATH
  },
  useNullAsDefault: true,
  pool: {
    afterCreate: (conn, cb) => {
      // Enable foreign keys
      conn.run('PRAGMA foreign_keys = ON', cb);
    }
  }
});

/**
 * Initialize database - create tables if they don't exist
 */
async function initializeDatabase() {
  try {
    // Check if database is already initialized
    const tables = await db.raw(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='connectors'"
    );

    if (tables.length === 0) {
      console.log('Initializing database schema...');
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // Remove comments and split by semicolon
      const statements = schema
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      // Execute each statement
      for (const statement of statements) {
        try {
          await db.raw(statement);
        } catch (error) {
          console.error('Error executing statement:', statement.substring(0, 100));
          throw error;
        }
      }

      console.log('Database schema initialized successfully');
    } else {
      console.log('Database already initialized');
    }

    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

/**
 * Test database connection
 */
async function testConnection() {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Close database connection
 */
async function closeDatabase() {
  await db.destroy();
}

/**
 * Get database statistics
 */
async function getDatabaseStats() {
  try {
    const stats = {
      connectors: await db('connectors').count('* as count').first(),
      syncConfigs: await db('sync_configs').count('* as count').first(),
      syncedItems: await db('synced_items').count('* as count').first(),
      executions: await db('sync_executions').count('* as count').first(),
      pendingConflicts: await db('sync_conflicts')
        .whereNull('resolution')
        .count('* as count')
        .first(),
    };

    return {
      connectors: stats.connectors.count,
      syncConfigs: stats.syncConfigs.count,
      syncedItems: stats.syncedItems.count,
      executions: stats.executions.count,
      pendingConflicts: stats.pendingConflicts.count,
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    throw error;
  }
}

/**
 * Clean up old sync execution logs
 * @param {number} retentionDays - Number of days to retain logs
 */
async function cleanupOldLogs(retentionDays = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleted = await db('sync_executions')
      .where('completed_at', '<', cutoffDate.toISOString())
      .andWhere('status', 'completed')
      .delete();

    console.log(`Cleaned up ${deleted} old sync execution logs`);
    return deleted;
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    throw error;
  }
}

/**
 * Reset database (WARNING: Deletes all data)
 */
async function resetDatabase() {
  try {
    console.warn('WARNING: Resetting database - all data will be lost!');
    
    // Drop all tables
    const tables = await db.raw(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );

    for (const table of tables) {
      await db.schema.dropTableIfExists(table.name);
    }

    // Reinitialize
    await initializeDatabase();
    console.log('Database reset complete');
    return true;
  } catch (error) {
    console.error('Database reset error:', error);
    throw error;
  }
}

module.exports = {
  db,
  initializeDatabase,
  testConnection,
  closeDatabase,
  getDatabaseStats,
  cleanupOldLogs,
  resetDatabase,
};
