const { db } = require('./db');
const { decrypt } = require('../lib/crypto');

async function checkConnectorCredentials() {
  try {
    const connector = await db('connectors').where({ id: 1 }).first();
    
    if (!connector) {
      console.log('Connector not found');
      return;
    }
    
    console.log('Connector:', {
      id: connector.id,
      name: connector.name,
      type: connector.connector_type,
      base_url: connector.base_url,
      endpoint: connector.endpoint,
      auth_type: connector.auth_type
    });
    
    console.log('\nEncrypted credentials:', connector.encrypted_credentials);
    
    try {
      const credentials = decrypt(connector.encrypted_credentials);
      console.log('\nDecrypted credentials:', credentials);
      console.log('Has token:', !!credentials.token);
      if (credentials.token) {
        console.log('Token length:', credentials.token.length);
        console.log('Token preview:', credentials.token.substring(0, 10) + '...');
      }
    } catch (error) {
      console.log('\nFailed to decrypt:', error.message);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.destroy();
  }
}

checkConnectorCredentials();
