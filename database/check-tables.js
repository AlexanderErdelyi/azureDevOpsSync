const { db } = require('./db');

async function checkTables() {
  try {
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('\nDatabase Tables:');
    tables.forEach(t => console.log('  -', t.name));
    
    console.log('\n\nsynced_items structure:');
    const cols = await db.raw('PRAGMA table_info(synced_items)');
    cols.forEach(c => console.log('  -', c.name, `(${c.type})`));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkTables();
