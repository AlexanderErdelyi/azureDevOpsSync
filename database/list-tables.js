require('dotenv').config();
const { db } = require('./db');

async function listTables() {
  try {
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    console.log('Tables created:');
    tables.forEach(t => console.log('  -', t.name));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

listTables();
