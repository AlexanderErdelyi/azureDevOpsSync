/**
 * Database migration runner
 * Handles database schema migrations for version upgrades
 */

const fs = require('fs');
const path = require('path');
const { db } = require('./db');

// Migration tracking table
const MIGRATIONS_TABLE = 'schema_migrations';

/**
 * Initialize migrations tracking table
 */
async function initMigrationsTable() {
  const exists = await db.schema.hasTable(MIGRATIONS_TABLE);
  
  if (!exists) {
    await db.schema.createTable(MIGRATIONS_TABLE, (table) => {
      table.increments('id');
      table.string('name').notNullable().unique();
      table.text('content');
      table.timestamp('applied_at').defaultTo(db.fn.now());
    });
    console.log('   ✓ Migrations tracking table created');
  }
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations() {
  await initMigrationsTable();
  const migrations = await db(MIGRATIONS_TABLE).select('name').orderBy('id');
  return migrations.map(m => m.name);
}

/**
 * Get list of pending migrations from migrations directory
 */
async function getPendingMigrations() {
  const migrationsDir = path.join(__dirname, '../migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = await getAppliedMigrations();
  return files.filter(f => !applied.includes(f));
}

/**
 * Run a single migration
 */
async function runMigration(filename) {
  const migrationsDir = path.join(__dirname, '../migrations');
  const filePath = path.join(migrationsDir, filename);
  const content = fs.readFileSync(filePath, 'utf8');

  console.log(`   Running migration: ${filename}`);

  try {
    // Split into statements and execute
    const statements = content
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      await db.raw(statement);
    }

    // Record migration
    await db(MIGRATIONS_TABLE).insert({
      name: filename,
      content: content,
    });

    console.log(`   ✓ Migration completed: ${filename}`);
    return true;
  } catch (error) {
    console.error(`   ✗ Migration failed: ${filename}`, error);
    throw error;
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations() {
  try {
    const pending = await getPendingMigrations();

    if (pending.length === 0) {
      console.log('   No pending migrations');
      return { applied: 0, pending: 0 };
    }

    console.log(`   Found ${pending.length} pending migration(s)`);

    for (const migration of pending) {
      await runMigration(migration);
    }

    const applied = await getAppliedMigrations();
    console.log(`   ✓ All migrations completed. Total applied: ${applied.length}`);

    return { applied: pending.length, total: applied.length };
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

/**
 * Create a new migration file
 */
function createMigration(name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `${timestamp}_${name}.sql`;
  const migrationsDir = path.join(__dirname, '../migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  const filePath = path.join(migrationsDir, filename);
  const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Add your migration SQL here

-- Example: Add a new column
-- ALTER TABLE connectors ADD COLUMN new_field TEXT;

-- Example: Create a new table
-- CREATE TABLE new_table (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   name TEXT NOT NULL
-- );

-- Example: Create an index
-- CREATE INDEX idx_new_field ON connectors(new_field);
`;

  fs.writeFileSync(filePath, template);
  console.log(`Created migration file: ${filename}`);
  return filename;
}

module.exports = {
  initMigrationsTable,
  getAppliedMigrations,
  getPendingMigrations,
  runMigration,
  runMigrations,
  createMigration,
};
