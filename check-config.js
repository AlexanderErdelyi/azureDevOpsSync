const { db } = require('./database/db');

async function checkConfig() {
  const config = await db('sync_configs').where({ id: 19 }).first();
  console.log('\nTest2Misc Config:');
  console.log('  ID:', config.id);
  console.log('  Name:', config.name);
  console.log('  trigger_type:', config.trigger_type);
  console.log('  schedule_cron:', config.schedule_cron);
  console.log('  is_active:', config.is_active);
  process.exit(0);
}

checkConfig();
