const { db } = require('./db');

async function deleteConnector() {
  try {
    // Delete connector directly (cascade will happen via DB constraints if set up)
    await db('connectors').where({ id: 1 }).delete();
    console.log('✓ Connector deleted successfully');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.destroy();
  }
}

deleteConnector();
