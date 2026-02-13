/**
 * Migration: Add execution_id to synced_items table
 * This allows us to track which execution synced each item
 */

const { db } = require('./db');

async function migrate() {
  console.log('Starting migration: Add execution_id to synced_items');
  
  try {
    // Check if column already exists
    const tableInfo = await db.raw('PRAGMA table_info(synced_items)');
    const hasExecutionId = tableInfo.some(col => col.name === 'execution_id');
    
    if (hasExecutionId) {
      console.log('✓ Column execution_id already exists in synced_items');
      return;
    }
    
    // Add execution_id column
    console.log('Adding execution_id column to synced_items...');
    await db.raw('ALTER TABLE synced_items ADD COLUMN execution_id INTEGER');
    console.log('✓ Added execution_id column');
    
    // Add index for better query performance
    console.log('Creating index on execution_id...');
    await db.raw('CREATE INDEX idx_synced_items_execution_id ON synced_items(execution_id)');
    console.log('✓ Created index');
    
    console.log('\n✅ Migration completed successfully');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await db.destroy();
  }
}

migrate();
