const { db, testConnection } = require('./db');

async function checkAndFixSyncConflicts() {
  try {
    await testConnection();
    
    console.log('Checking sync_conflicts table schema...\n');
    
    // Get table info
    const columns = await db.raw("PRAGMA table_info(sync_conflicts)");
    console.log('Current columns:', columns.map(c => c.name).join(', '));
    
    // Check if status column exists
    const hasStatus = columns.some(c => c.name === 'status');
    
    if (!hasStatus) {
      console.log('\nAdding missing columns to sync_conflicts...');
      
      // Drop and recreate table with correct schema
      await db.schema.dropTableIfExists('sync_conflicts');
      
      await db.schema.createTable('sync_conflicts', (table) => {
        table.increments('id').primary();
        table.integer('sync_config_id').unsigned().notNullable();
        table.integer('execution_id').unsigned().nullable();
        
        // Work item identifiers
        table.string('source_work_item_id').notNullable();
        table.string('target_work_item_id').nullable();
        table.string('work_item_type').notNullable();
        
        // Conflict details
        table.string('conflict_type').notNullable();
        table.string('field_name').nullable();
        table.text('source_value').nullable();
        table.text('target_value').nullable();
        table.text('base_value').nullable();
        
        // Resolution
        table.string('status').notNullable().defaultTo('unresolved');
        table.string('resolution_strategy').nullable();
        table.text('resolved_value').nullable();
        table.string('resolved_by').nullable();
        table.timestamp('resolved_at').nullable();
        
        // Metadata
        table.text('metadata').nullable();
        table.timestamp('detected_at').notNullable().defaultTo(db.fn.now());
        table.timestamps(true, true);
      });
      
      console.log('✓ sync_conflicts table recreated with correct schema');
    } else {
      console.log('✓ sync_conflicts table schema is correct');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.destroy();
  }
}

checkAndFixSyncConflicts();
