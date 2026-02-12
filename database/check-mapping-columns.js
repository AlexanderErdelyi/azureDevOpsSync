const { db } = require('./db');

async function checkColumns() {
  try {
    console.log('\n=== Checking sync_field_mappings columns ===\n');
    
    const mapping = await db('sync_field_mappings').limit(1);
    console.log('sync_field_mappings columns:', mapping.length > 0 ? Object.keys(mapping[0]) : 'No data');
    
    const statusMapping = await db('sync_status_mappings').limit(1);
    console.log('sync_status_mappings columns:', statusMapping.length > 0 ? Object.keys(statusMapping[0]) : 'No data');
    
    const typeMapping = await db('sync_type_mappings').limit(1);
    console.log('sync_type_mappings columns:', typeMapping.length > 0 ? Object.keys(typeMapping[0]) : 'No data');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkColumns();
