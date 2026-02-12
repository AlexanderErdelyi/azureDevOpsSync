/**
 * Migration: Add execution logs support
 * Adds execution_logs column to sync_executions table
 */

const { db } = require('./db');

async function migrate() {
  console.log('Starting execution logs migration...');
  
  try {
    // Check if execution_logs column exists
    const hasLogsColumn = await db.schema.hasColumn('sync_executions', 'execution_logs');
    
    if (!hasLogsColumn) {
      await db.schema.table('sync_executions', (table) => {
        table.text('execution_logs'); // Stores JSON array of log entries
      });
      console.log('✓ Added execution_logs column to sync_executions');
    } else {
      console.log('• execution_logs column already exists');
    }
    
    console.log('\n✓ Execution logs migration completed successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
