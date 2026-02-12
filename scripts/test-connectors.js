/**
 * Test connector implementations
 * Run this to verify connectors are working correctly
 */

require('dotenv').config();
const { initializeConnectors, registry } = require('../lib/connectors');

async function testConnectors() {
  console.log('='.repeat(60));
  console.log('CONNECTOR SYSTEM TEST');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Initialize connectors
    console.log('1. Initializing connector registry...');
    await initializeConnectors();
    console.log('   ✓ Connector registry initialized');
    console.log('');

    // List registered types
    console.log('2. Registered connector types:');
    const types = registry.getRegisteredTypes();
    types.forEach(type => console.log(`   - ${type}`));
    console.log('');

    // List connectors from database
    console.log('3. Connectors in database:');
    const connectors = await registry.listConnectors(false);
    
    if (connectors.length === 0) {
      console.log('   No connectors found in database');
      console.log('   Run `node scripts/add-connector.js` to add a connector');
    } else {
      for (const conn of connectors) {
        console.log(`   - ID: ${conn.id}, Name: ${conn.name}, Type: ${conn.connector_type}, Active: ${conn.is_active ? 'Yes' : 'No'}`);
      }
    }
    console.log('');

    // Test each connector
    if (connectors.length > 0) {
      console.log('4. Testing connector connections...');
      for (const conn of connectors) {
        if (!conn.is_active) {
          console.log(`   ⊘ Skipping inactive connector: ${conn.name}`);
          continue;
        }

        console.log(`   Testing: ${conn.name} (${conn.connector_type})...`);
        const result = await registry.testConnector(conn.id);
        
        if (result.success) {
          console.log(`   ✓ Connection successful`);
          if (result.details) {
            Object.keys(result.details).forEach(key => {
              console.log(`     - ${key}: ${result.details[key]}`);
            });
          }
        } else {
          console.log(`   ✗ Connection failed: ${result.message}`);
        }
      }
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('✓ CONNECTOR TEST COMPLETE');
    console.log('='.repeat(60));
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
    process.exit(1);
  }
}

testConnectors();
