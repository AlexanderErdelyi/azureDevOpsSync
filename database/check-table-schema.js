const { db } = require('./db');

async function checkSchema() {
  try {
    console.log('\n=== Checking table schemas ===\n');
    
    const fieldMappingSchema = await db.raw("PRAGMA table_info(sync_field_mappings)");
    console.log('sync_field_mappings schema:');
    fieldMappingSchema.forEach(col => console.log(`  - ${col.name} (${col.type})`));
    
    console.log('\nsync_status_mappings schema:');
    const statusMappingSchema = await db.raw("PRAGMA table_info(sync_status_mappings)");
    statusMappingSchema.forEach(col => console.log(`  - ${col.name} (${col.type})`));
    
    console.log('\nsync_type_mappings schema:');
    const typeMappingSchema = await db.raw("PRAGMA table_info(sync_type_mappings)");
    typeMappingSchema.forEach(col => console.log(`  - ${col.name} (${col.type})`));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchema();
