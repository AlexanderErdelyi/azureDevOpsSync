/**
 * Add a connector to the database
 * Interactive script to add Azure DevOps or ServiceDesk Plus connectors
 */

require('dotenv').config();
const readline = require('readline');
const { db } = require('../database/db');
const { encrypt } = require('../lib/crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function addConnector() {
  console.log('='.repeat(60));
  console.log('ADD CONNECTOR TO DATABASE');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Select connector type
    console.log('Available connector types:');
    console.log('  1. Azure DevOps');
    console.log('  2. ServiceDesk Plus');
    console.log('');

    const typeChoice = await question('Select connector type (1-2): ');
    
    let connectorType, name, baseUrl, endpoint, authType, credentials;

    if (typeChoice === '1') {
      // Azure DevOps
      connectorType = 'azuredevops';
      console.log('');
      console.log('Azure DevOps Configuration:');
      
      name = await question('  Connector name: ');
      baseUrl = await question('  Organization URL (e.g., https://dev.azure.com/myorg): ');
      endpoint = await question('  Project name: ');
      const token = await question('  Personal Access Token (PAT): ');
      
      authType = 'pat';
      credentials = { token };

    } else if (typeChoice === '2') {
      // ServiceDesk Plus
      connectorType = 'servicedeskplus';
      console.log('');
      console.log('ServiceDesk Plus Configuration:');
      
      name = await question('  Connector name: ');
      baseUrl = await question('  Server URL (e.g., https://sdpondemand.manageengine.com): ');
      endpoint = await question('  Site/Portal name: ');
      const apiKey = await question('  API Key/Auth Token: ');
      const technicianKey = await question('  Technician Key (optional, press Enter to skip): ');
      
      authType = 'apikey';
      credentials = { apiKey };
      if (technicianKey) {
        credentials.technician_key = technicianKey;
      }

    } else {
      console.log('Invalid choice');
      rl.close();
      process.exit(1);
    }

    // Encrypt credentials
    console.log('');
    console.log('Encrypting credentials...');
    const encryptedCreds = encrypt(credentials);

    // Insert into database
    console.log('Saving to database...');
    const [id] = await db('connectors').insert({
      name,
      connector_type: connectorType,
      base_url: baseUrl,
      endpoint,
      auth_type: authType,
      encrypted_credentials: encryptedCreds,
      is_active: 1,
      metadata: JSON.stringify({}),
      created_at: new Date(),
      updated_at: new Date()
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('✓ CONNECTOR ADDED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Connector ID: ${id}`);
    console.log(`Name: ${name}`);
    console.log(`Type: ${connectorType}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Test the connector: node scripts/test-connectors.js');
    console.log('  2. Discover metadata: node scripts/discover-metadata.js');
    console.log('  3. Start the server: npm start');
    console.log('');

    rl.close();
    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('✗ FAILED TO ADD CONNECTOR');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    
    rl.close();
    process.exit(1);
  }
}

addConnector();
