/**
 * Database Migration Runner
 * Runs SQL migration files in the migrations directory
 */

const fs = require('fs');
const path = require('path');
const { db } = require('../database/db');

async function runMigrations() {
  console.log('Running database migrations...');
  
  const migrationsDir = path.join(__dirname, '../database/migrations');
  
  // Create migrations tracking table if it doesn't exist
  await db.schema.hasTable('migrations').then(async (exists) => {
    if (!exists) {
      await db.schema.createTable('migrations', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable().unique();
        table.timestamp('applied_at').defaultTo(db.fn.now());
      });
      console.log('Created migrations tracking table');
    }
  });
  
  // Get list of already applied migrations
  const appliedMigrations = await db('migrations').select('name');
  const appliedNames = new Set(appliedMigrations.map(m => m.name));
  
  // Read migration files
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Apply in order
  
  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`  ✓ ${file} (already applied)`);
      continue;
    }
    
    console.log(`  → Applying ${file}...`);
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      // Execute the entire SQL file as-is
      // SQLite can handle multiple statements in one call
      await db.raw(sql);
      
      // Record migration as applied
      await db('migrations').insert({ name: file });
      console.log(`  ✓ ${file} applied successfully`);
    } catch (error) {
      console.error(`  ✗ ${file} failed:`, error.message);
      throw error;
    }
  }
  
  console.log('Migrations complete!');
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
