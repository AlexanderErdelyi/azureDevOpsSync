/**
 * Phase 7: Conflict Resolution - Database Migration
 * 
 * Creates tables for:
 * - sync_conflicts: Track detected conflicts between systems
 * - work_item_versions: Store historical versions for change detection
 * - conflict_resolutions: Audit trail of conflict resolution decisions
 */

const { db, testConnection } = require('./db');

async function migratePhase7() {
  console.log('Starting Phase 7 database migration...\n');

  try {
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    // 1. Create sync_conflicts table
    const hasConflictsTable = await db.schema.hasTable('sync_conflicts');
    if (!hasConflictsTable) {
      await db.schema.createTable('sync_conflicts', (table) => {
        table.increments('id').primary();
        table.integer('sync_config_id').unsigned().notNullable()
          .references('id').inTable('sync_configs').onDelete('CASCADE');
        table.integer('execution_id').unsigned().nullable()
          .references('id').inTable('sync_executions').onDelete('SET NULL');
        
        // Work item identifiers
        table.string('source_work_item_id').notNullable();
        table.string('target_work_item_id').nullable();
        table.string('work_item_type').notNullable();
        
        // Conflict details
        table.string('conflict_type').notNullable(); // field_conflict, version_conflict, deletion_conflict
        table.string('field_name').nullable(); // Specific field with conflict
        table.text('source_value').nullable(); // Value from source system
        table.text('target_value').nullable(); // Value from target system
        table.text('base_value').nullable(); // Original value before changes
        
        // Resolution
        table.string('status').notNullable().defaultTo('unresolved'); // unresolved, resolved, ignored
        table.string('resolution_strategy').nullable(); // last-write-wins, source-priority, target-priority, manual
        table.text('resolved_value').nullable(); // Final resolved value
        table.string('resolved_by').nullable(); // User who resolved (for manual)
        table.timestamp('resolved_at').nullable();
        
        // Metadata
        table.text('metadata').nullable(); // JSON with additional context
        table.timestamp('detected_at').notNullable().defaultTo(db.fn.now());
        table.timestamps(true, true);
      });
      console.log('✓ Created sync_conflicts table');
    } else {
      console.log('• sync_conflicts table already exists');
    }

    // 2. Create work_item_versions table for change tracking
    const hasVersionsTable = await db.schema.hasTable('work_item_versions');
    if (!hasVersionsTable) {
      await db.schema.createTable('work_item_versions', (table) => {
        table.increments('id').primary();
        table.integer('sync_config_id').unsigned().notNullable()
          .references('id').inTable('sync_configs').onDelete('CASCADE');
        
        // Work item identifiers
        table.string('connector_type').notNullable(); // 'source' or 'target'
        table.integer('connector_id').unsigned().notNullable()
          .references('id').inTable('connectors').onDelete('CASCADE');
        table.string('work_item_id').notNullable();
        table.string('work_item_type').notNullable();
        
        // Version tracking
        table.integer('version').notNullable().defaultTo(1);
        table.string('revision').nullable(); // System-specific revision number
        table.timestamp('changed_date').notNullable(); // From work item
        table.string('changed_by').nullable();
        
        // Snapshot of work item state
        table.text('fields_snapshot').notNullable(); // JSON snapshot of all fields
        table.string('hash').notNullable(); // Hash of fields for quick comparison
        
        // Sync context
        table.integer('execution_id').unsigned().nullable()
          .references('id').inTable('sync_executions').onDelete('SET NULL');
        table.timestamp('captured_at').notNullable().defaultTo(db.fn.now());
        
        // Indexes for performance
        table.index(['connector_id', 'work_item_id']);
        table.index(['sync_config_id', 'work_item_id']);
        table.index('hash');
        table.timestamps(true, true);
      });
      console.log('✓ Created work_item_versions table');
    } else {
      console.log('• work_item_versions table already exists');
    }

    // 3. Create conflict_resolutions table for audit trail
    const hasResolutionsTable = await db.schema.hasTable('conflict_resolutions');
    if (!hasResolutionsTable) {
      await db.schema.createTable('conflict_resolutions', (table) => {
        table.increments('id').primary();
        table.integer('conflict_id').unsigned().notNullable()
          .references('id').inTable('sync_conflicts').onDelete('CASCADE');
        
        // Resolution details
        table.string('strategy').notNullable(); // Strategy used
        table.text('previous_value').nullable();
        table.text('resolved_value').nullable();
        table.text('rationale').nullable(); // Human explanation for manual resolutions
        
        // Applied to systems
        table.boolean('applied_to_source').defaultTo(false);
        table.boolean('applied_to_target').defaultTo(false);
        table.text('application_result').nullable(); // JSON with success/error details
        
        // Audit
        table.string('resolved_by').nullable(); // User or 'system'
        table.timestamp('resolved_at').notNullable().defaultTo(db.fn.now());
        table.text('metadata').nullable(); // JSON with additional context
        
        table.timestamps(true, true);
      });
      console.log('✓ Created conflict_resolutions table');
    } else {
      console.log('• conflict_resolutions table already exists');
    }

    // 4. Add conflict tracking columns to sync_executions if not exists
    const hasConflictColumns = await db.schema.hasColumn('sync_executions', 'conflicts_detected');
    if (!hasConflictColumns) {
      await db.schema.table('sync_executions', (table) => {
        table.integer('conflicts_detected').defaultTo(0);
        table.integer('conflicts_resolved').defaultTo(0);
        table.integer('conflicts_unresolved').defaultTo(0);
      });
      console.log('✓ Added conflict tracking columns to sync_executions');
    } else {
      console.log('• sync_executions already has conflict tracking columns');
    }

    // 5. Add bidirectional sync columns to sync_configs if not exists
    const hasBidirectionalColumn = await db.schema.hasColumn('sync_configs', 'bidirectional');
    if (!hasBidirectionalColumn) {
      await db.schema.table('sync_configs', (table) => {
        table.boolean('bidirectional').defaultTo(false);
        table.string('conflict_resolution_strategy').defaultTo('last-write-wins');
        table.boolean('track_versions').defaultTo(true);
      });
      console.log('✓ Added bidirectional sync columns to sync_configs');
    } else {
      console.log('• sync_configs already has bidirectional sync columns');
    }

    console.log('\n✅ Phase 7 migration completed successfully!');
    console.log('\nNew tables:');
    console.log('  • sync_conflicts - Track detected conflicts');
    console.log('  • work_item_versions - Historical change tracking');
    console.log('  • conflict_resolutions - Resolution audit trail');
    console.log('\nUpdated tables:');
    console.log('  • sync_executions - Added conflict metrics');
    console.log('  • sync_configs - Added bidirectional sync settings');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run migration if called directly
if (require.main === module) {
  migratePhase7();
}

module.exports = { migratePhase7 };
