const { db } = require('./db');

async function checkSchema() {
  try {
    console.log('\n=== Checking Database Schema ===\n');
    
    // Check connector_work_item_types
    const types = await db('connector_work_item_types').limit(1);
    console.log('connector_work_item_types columns:', types.length > 0 ? Object.keys(types[0]) : 'No data');
    
    // Check if connector_fields exists
    try {
      const fields = await db('connector_fields').limit(1);
      console.log('connector_fields columns:', fields.length > 0 ? Object.keys(fields[0]) : 'Table exists but no data');
    } catch (e) {
      console.log('connector_fields:', e.message);
    }
    
    // Check if connector_statuses exists
    try {
      const statuses = await db('connector_statuses').limit(1);
      console.log('connector_statuses columns:', statuses.length > 0 ? Object.keys(statuses[0]) : 'Table exists but no data');
    } catch (e) {
      console.log('connector_statuses:', e.message);
    }
    
    // List all tables
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('\nAll tables:', tables.map(t => t.name).join(', '));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchema();
