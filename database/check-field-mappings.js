const { db } = require('./db');

async function checkFieldMappings() {
  try {
    console.log('\n=== Checking Field Mappings for Sync Config 4 ===\n');
    
    const typeMappings = await db('sync_type_mappings').where({ sync_config_id: 4 });
    
    if (typeMappings.length === 0) {
      console.log('No type mappings found for sync config 4');
      process.exit(0);
    }
    
    for (const tm of typeMappings) {
      console.log(`\n=== Type Mapping ${tm.id} ===`);
      
      const srcType = await db('connector_work_item_types').where({ id: tm.source_type_id }).first();
      const tgtType = await db('connector_work_item_types').where({ id: tm.target_type_id }).first();
      
      console.log('Source Type:', srcType?.type_name);
      console.log('Target Type:', tgtType?.type_name);
      
      const fields = await db('sync_field_mappings').where({ type_mapping_id: tm.id });
      
      console.log('\nField Mappings:', fields.length, 'total');
      for (const f of fields) {
        const srcField = await db('connector_fields').where({ id: f.source_field_id }).first();
        const tgtField = await db('connector_fields').where({ id: f.target_field_id }).first();
        console.log(`  ${srcField?.field_name} -> ${tgtField?.field_name}`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkFieldMappings();
