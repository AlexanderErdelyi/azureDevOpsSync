/**
 * Discover and save metadata for a connector
 * (work item types, fields, statuses)
 */

require('dotenv').config();
const { initializeConnectors, registry } = require('../lib/connectors');

async function discoverMetadata() {
  const connectorId = parseInt(process.argv[2]);
  
  if (!connectorId) {
    console.error('Usage: node scripts/discover-metadata.js <connector-id>');
    console.error('');
    console.error('Get connector IDs with: node scripts/test-connectors.js');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('DISCOVER CONNECTOR METADATA');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Initialize connectors
    await initializeConnectors();

    // Get connector
    console.log(`Loading connector ID ${connectorId}...`);
    const connector = await registry.get(connectorId);
    console.log(`✓ Loaded: ${connector.getName()} (${connector.getType()})`);
    console.log('');

    // Discover metadata
    console.log('Discovering metadata...');
    const metadata = await registry.discoverMetadata(connectorId);
    
    console.log(`✓ Found ${metadata.workItemTypes.length} work item type(s)`);
    console.log('');

    // Display discovered metadata
    console.log('Work Item Types:');
    for (const type of metadata.workItemTypes) {
      console.log(`  - ${type.type_name}`);
      console.log(`    Fields: ${type.fields?.length || 0}`);
      console.log(`    Statuses: ${type.statuses?.length || 0}`);
      
      if (type.error) {
        console.log(`    Error: ${type.error}`);
      }
    }
    console.log('');

    // Save to database
    console.log('Saving metadata to database...');
    const summary = await registry.saveDiscoveredMetadata(connectorId, metadata);
    
    console.log(`✓ Saved:`);
    console.log(`  - Work Item Types: ${summary.workItemTypes}`);
    console.log(`  - Fields: ${summary.fields}`);
    console.log(`  - Statuses: ${summary.statuses}`);
    console.log('');

    console.log('='.repeat(60));
    console.log('✓ METADATA DISCOVERY COMPLETE');
    console.log('='.repeat(60));
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review the metadata in the database');
    console.log('  2. Enable work item types for sync');
    console.log('  3. Create sync configurations');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('✗ DISCOVERY FAILED');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

discoverMetadata();
