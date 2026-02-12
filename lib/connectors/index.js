/**
 * Initialize and register all built-in connectors
 */

const registry = require('./ConnectorRegistry');
const AzureDevOpsConnector = require('./AzureDevOpsConnector');
const ServiceDeskPlusConnector = require('./ServiceDeskPlusConnector');

/**
 * Register all built-in connector types
 */
function registerBuiltInConnectors() {
  // Register Azure DevOps connector
  registry.register('azuredevops', AzureDevOpsConnector);
  
  // Register ServiceDesk Plus connector
  registry.register('servicedeskplus', ServiceDeskPlusConnector);
  
  console.log('Built-in connectors registered:', registry.getRegisteredTypes().join(', '));
}

/**
 * Initialize connector system
 * Call this on server startup
 */
async function initializeConnectors() {
  try {
    registerBuiltInConnectors();
    
    // List available connectors from database
    const connectors = await registry.listConnectors(true);
    console.log(`Found ${connectors.length} active connector(s) in database`);
    
    for (const connector of connectors) {
      console.log(`  - ${connector.name} (${connector.connector_type})`);
    }
    
    return true;
  } catch (error) {
    console.error('Failed to initialize connectors:', error);
    throw error;
  }
}

module.exports = {
  registerBuiltInConnectors,
  initializeConnectors,
  registry
};
