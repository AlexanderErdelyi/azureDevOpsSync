/**
 * Migration: Add synced_comments table
 * This table tracks synced comments between work items
 */

const { db } = require('./db');

async function migrate() {
  console.log('Starting synced_comments table migration...');
  
  try {
    // Check if synced_comments table exists
    const tableExists = await db.schema.hasTable('synced_comments');
    
    if (!tableExists) {
      console.log('Creating synced_comments table...');
      
      await db.schema.createTable('synced_comments', (table) => {
        table.increments('id').primary();
        table.integer('synced_item_id')
          .notNullable()
          .references('id')
          .inTable('synced_items')
          .onDelete('CASCADE')
          .comment('Reference to the synced work item');
        table.string('source_comment_id', 255)
          .notNullable()
          .comment('ID of the comment in the source system');
        table.string('target_comment_id', 255)
          .comment('ID of the comment in the target system');
        table.text('comment_text')
          .comment('Text content of the comment');
        table.string('author', 255)
          .comment('Author of the original comment');
        table.timestamp('created_at')
          .comment('When the comment was created in source');
        table.timestamp('synced_at')
          .defaultTo(db.fn.now())
          .comment('When the comment was synced');
        table.string('sync_status', 50)
          .defaultTo('synced')
          .comment('Status: synced, failed, skipped');
        
        // Add indexes for performance
        table.index('synced_item_id', 'idx_synced_comments_item');
        table.index('source_comment_id', 'idx_synced_comments_source');
        table.index(['synced_item_id', 'source_comment_id'], 'idx_synced_comments_lookup');
      });
      
      console.log('✓ Created synced_comments table with indexes');
    } else {
      console.log('• synced_comments table already exists');
    }
    
    console.log('\n=== Migration Summary ===');
    console.log('✓ synced_comments table ready');
    console.log('========================\n');
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrate };
