const { db } = require('./database/db');

async function fixTimestamps() {
  const rows = await db('sync_executions').select('id', 'started_at', 'completed_at');
  let fixed = 0;
  
  for (const r of rows) {
    const updates = {};
    
    if (r.started_at && !String(r.started_at).startsWith('202')) {
      updates.started_at = new Date(Number(r.started_at)).toISOString();
    }
    if (r.completed_at && !String(r.completed_at).startsWith('202')) {
      updates.completed_at = new Date(Number(r.completed_at)).toISOString();
    }
    
    if (Object.keys(updates).length > 0) {
      await db('sync_executions').where({ id: r.id }).update(updates);
      console.log('Fixed ID:', r.id, updates);
      fixed++;
    }
  }
  
  console.log(`Done. Fixed ${fixed} of ${rows.length} rows.`);
  process.exit(0);
}

fixTimestamps().catch(e => { console.error(e); process.exit(1); });
