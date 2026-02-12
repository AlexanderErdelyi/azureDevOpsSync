/**
 * Database migration - Add webhook and notification tables
 * Run this to add Phase 5 tables to existing database
 */

const { db, testConnection } = require('./db');

async function migrate() {
  console.log('='.repeat(70));
  console.log('DATABASE MIGRATION - Phase 5: Webhooks & Notifications');
  console.log('='.repeat(70));
  console.log('');

  try {
    // Test connection
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    console.log('✓ Database connected');
    console.log('');

    // Create webhooks table
    console.log('Creating webhooks table...');
    await db.schema.createTable('webhooks', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.integer('sync_config_id').notNullable()
        .references('id').inTable('sync_configs').onDelete('CASCADE');
      table.integer('connector_id').notNullable()
        .references('id').inTable('connectors').onDelete('CASCADE');
      table.string('webhook_url').notNullable().unique();
      table.string('secret').notNullable();
      table.boolean('is_active').defaultTo(true);
      table.json('event_types');
      table.json('metadata');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.timestamp('last_triggered_at');
      table.integer('trigger_count').defaultTo(0);
      
      table.index('webhook_url', 'idx_webhooks_url');
      table.index('sync_config_id', 'idx_webhooks_config');
      table.index('is_active', 'idx_webhooks_active');
    });
    console.log('✓ webhooks table created');

    // Create webhook_deliveries table
    console.log('Creating webhook_deliveries table...');
    await db.schema.createTable('webhook_deliveries', (table) => {
      table.increments('id').primary();
      table.integer('webhook_id').notNullable()
        .references('id').inTable('webhooks').onDelete('CASCADE');
      table.json('payload').notNullable();
      table.json('headers');
      table.string('signature');
      table.boolean('signature_valid');
      table.string('status').notNullable();
      table.integer('response_code');
      table.text('error_message');
      table.integer('processing_time_ms');
      table.timestamp('created_at').defaultTo(db.fn.now());
      
      table.index('webhook_id', 'idx_webhook_deliveries_webhook');
      table.index('status', 'idx_webhook_deliveries_status');
      table.index('created_at', 'idx_webhook_deliveries_created');
    });
    console.log('✓ webhook_deliveries table created');

    // Create notification_settings table
    console.log('Creating notification_settings table...');
    await db.schema.createTable('notification_settings', (table) => {
      table.increments('id').primary();
      table.integer('sync_config_id')
        .references('id').inTable('sync_configs').onDelete('CASCADE');
      table.string('notification_type').notNullable();
      table.json('event_triggers').notNullable();
      table.json('recipients').notNullable();
      table.json('settings');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      
      table.index('sync_config_id', 'idx_notification_settings_config');
      table.index('notification_type', 'idx_notification_settings_type');
      table.index('is_active', 'idx_notification_settings_active');
    });
    console.log('✓ notification_settings table created');

    console.log('');
    console.log('='.repeat(70));
    console.log('✓ MIGRATION COMPLETE');
    console.log('='.repeat(70));
    console.log('');
    console.log('Added tables:');
    console.log('  - webhooks');
    console.log('  - webhook_deliveries');
    console.log('  - notification_settings');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('✗ MIGRATION FAILED');
    console.error('');
    console.error('Error:', error.message);
    
    if (error.message.includes('already exists')) {
      console.error('');
      console.error('Tables already exist. Migration may have been run previously.');
    }
    
    console.error('');
    process.exit(1);
  }
}

migrate();
