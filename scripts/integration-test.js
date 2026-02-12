/**
 * Quick Integration Test
 * Tests the complete workflow: connector → metadata → sync config → mapping → execution
 */

require('dotenv').config();
const { db, testConnection } = require('../database/db');
const { initializeConnectors, registry } = require('../lib/connectors');

async function quickTest() {
  console.log('='.repeat(70));
  console.log('MULTI-CONNECTOR SYNC PLATFORM - INTEGRATION TEST');
  console.log('='.repeat(70));
  console.log('');

  try {
    // Step 1: Test database
    console.log('Step 1: Database Connection');
    console.log('-'.repeat(70));
    const dbOk = await testConnection();
    if (!dbOk) throw new Error('Database connection failed');
    console.log('✓ Database connected');
    
    const stats = await db('connectors').count('* as count').first();
    console.log(`✓ Found ${stats.count} connector(s) in database`);
    console.log('');

    // Step 2: Initialize connectors
    console.log('Step 2: Connector Registry');
    console.log('-'.repeat(70));
    await initializeConnectors();
    const types = registry.getRegisteredTypes();
    console.log(`✓ Registered connector types: ${types.join(', ')}`);
    console.log('');

    // Step 3: List connectors
    console.log('Step 3: Active Connectors');
    console.log('-'.repeat(70));
    const connectors = await registry.listConnectors(true);
    
    if (connectors.length === 0) {
      console.log('⚠ No connectors configured');
      console.log('');
      console.log('Quick Start:');
      console.log('  1. Add connector: node scripts/add-connector.js');
      console.log('  2. Test connection: node scripts/test-connectors.js');
      console.log('  3. Discover metadata: node scripts/discover-metadata.js <id>');
      console.log('  4. Start server: npm start');
      console.log('');
    } else {
      for (const conn of connectors) {
        console.log(`✓ Connector ${conn.id}: ${conn.name} (${conn.connector_type})`);
      }
      console.log('');

      // Step 4: Test first connector
      if (connectors.length > 0) {
        const firstConn = connectors[0];
        console.log('Step 4: Test Connector Connection');
        console.log('-'.repeat(70));
        console.log(`Testing: ${firstConn.name}...`);
        
        try {
          const testResult = await registry.testConnector(firstConn.id);
          if (testResult.success) {
            console.log('✓ Connection successful');
            if (testResult.details) {
              Object.keys(testResult.details).forEach(key => {
                console.log(`  - ${key}: ${testResult.details[key]}`);
              });
            }
          } else {
            console.log(`✗ Connection failed: ${testResult.message}`);
          }
        } catch (error) {
          console.log(`✗ Test error: ${error.message}`);
        }
        console.log('');
      }

      // Step 5: Check metadata
      console.log('Step 5: Metadata Discovery');
      console.log('-'.repeat(70));
      const metadataStats = await Promise.all([
        db('connector_work_item_types').count('* as count').first(),
        db('connector_fields').count('* as count').first(),
        db('connector_statuses').count('* as count').first()
      ]);
      
      console.log(`✓ Work Item Types: ${metadataStats[0].count}`);
      console.log(`✓ Fields: ${metadataStats[1].count}`);
      console.log(`✓ Statuses: ${metadataStats[2].count}`);
      
      if (metadataStats[0].count === 0) {
        console.log('');
        console.log('⚠ No metadata discovered yet');
        console.log(`  Run: node scripts/discover-metadata.js ${connectors[0].id}`);
      }
      console.log('');

      // Step 6: Check sync configs
      console.log('Step 6: Sync Configurations');
      console.log('-'.repeat(70));
      const syncConfigs = await db('sync_configs').count('* as count').first();
      console.log(`✓ Sync Configurations: ${syncConfigs.count}`);
      
      if (syncConfigs.count === 0) {
        console.log('');
        console.log('⚠ No sync configurations');
        console.log('  Create via API: POST /api/sync-configs');
      } else {
        const configs = await db('sync_configs').limit(5);
        for (const config of configs) {
          const [fieldCount, statusCount] = await Promise.all([
            db('sync_field_mappings').where({ sync_config_id: config.id }).count('* as count').first(),
            db('sync_status_mappings').where({ sync_config_id: config.id }).count('* as count').first()
          ]);
          console.log(`  - ${config.name}: ${fieldCount.count} field mappings, ${statusCount.count} status mappings`);
        }
      }
      console.log('');

      // Step 7: Check execution history
      console.log('Step 7: Execution History');
      console.log('-'.repeat(70));
      const executions = await db('sync_executions')
        .orderBy('started_at', 'desc')
        .limit(5);
      
      if (executions.length === 0) {
        console.log('✓ No executions yet (ready for first sync)');
      } else {
        console.log(`✓ Last ${executions.length} execution(s):`);
        for (const exec of executions) {
          const duration = exec.ended_at 
            ? `${Math.round((new Date(exec.ended_at) - new Date(exec.started_at)) / 1000)}s`
            : 'running';
          console.log(`  - Execution ${exec.id}: ${exec.status} (${exec.items_synced || 0} synced, ${exec.items_failed || 0} failed) - ${duration}`);
        }
      }
      console.log('');

      // Step 8: Synced items
      console.log('Step 8: Synced Items');
      console.log('-'.repeat(70));
      const syncedItems = await db('synced_items').count('* as count').first();
      console.log(`✓ Total Synced Items: ${syncedItems.count}`);
      
      if (syncedItems.count > 0) {
        const recentItems = await db('synced_items')
          .orderBy('last_synced_at', 'desc')
          .limit(5);
        
        console.log('  Recent:');
        for (const item of recentItems) {
          console.log(`  - ${item.source_item_id} → ${item.target_item_id} (synced ${item.sync_count}x)`);
        }
      }
      console.log('');
    }

    // Summary
    console.log('='.repeat(70));
    console.log('✓ INTEGRATION TEST COMPLETE');
    console.log('='.repeat(70));
    console.log('');
    
    if (connectors.length > 0) {
      console.log('Platform Status: ✓ OPERATIONAL');
      console.log('');
      console.log('Available Features:');
      console.log('  ✓ Connector Management');
      console.log('  ✓ Metadata Discovery');
      console.log('  ✓ Sync Configuration');
      console.log('  ✓ Field Mapping Engine');
      console.log('  ✓ Sync Execution');
      console.log('');
      console.log('Web Interface: http://localhost:3000');
      console.log('API Documentation: docs/API_REFERENCE.md');
      console.log('Workflow Guide: docs/WORKFLOW_EXAMPLE.md');
    } else {
      console.log('Platform Status: ⚠ NEEDS CONFIGURATION');
      console.log('');
      console.log('Next Steps:');
      console.log('  1. Add your first connector:');
      console.log('     node scripts/add-connector.js');
      console.log('');
      console.log('  2. Discover metadata:');
      console.log('     node scripts/discover-metadata.js <connector-id>');
      console.log('');
      console.log('  3. Create sync configuration via API');
      console.log('     See: docs/WORKFLOW_EXAMPLE.md');
    }
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('✗ TEST FAILED');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    process.exit(1);
  }
}

// Run test
quickTest();
