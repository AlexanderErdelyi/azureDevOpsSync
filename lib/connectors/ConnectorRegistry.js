/**
 * ConnectorRegistry - Plugin system for managing connector types
 * 
 * Provides factory pattern for creating connector instances from database configs
 */

const { db } = require('../../database/db');
const { decrypt } = require('../crypto');

class ConnectorRegistry {
  constructor() {
    this.connectorTypes = new Map();
    this.connectorInstances = new Map(); // Cache connector instances by ID
  }

  /**
   * Register a connector type
   * @param {string} type - Connector type identifier (e.g., 'azuredevops')
   * @param {class} ConnectorClass - Connector class that extends BaseConnector
   */
  register(type, ConnectorClass) {
    if (this.connectorTypes.has(type)) {
      console.warn(`Connector type '${type}' is already registered. Overwriting.`);
    }
    
    this.connectorTypes.set(type, ConnectorClass);
    console.log(`Registered connector type: ${type}`);
  }

  /**
   * Get all registered connector types
   * @returns {Array<string>} Array of connector type identifiers
   */
  getRegisteredTypes() {
    return Array.from(this.connectorTypes.keys());
  }

  /**
   * Check if a connector type is registered
   * @param {string} type - Connector type identifier
   * @returns {boolean} True if registered
   */
  isRegistered(type) {
    return this.connectorTypes.has(type);
  }

  /**
   * Create a connector instance from database config
   * @param {number} connectorId - Database ID of connector
   * @param {boolean} useCache - Whether to use cached instance (default: true)
   * @returns {Promise<BaseConnector>} Connector instance
   */
  async createFromDatabase(connectorId, useCache = true) {
    // Check cache first
    if (useCache && this.connectorInstances.has(connectorId)) {
      return this.connectorInstances.get(connectorId);
    }

    // Load connector config from database
    const config = await db('connectors')
      .where({ id: connectorId })
      .first();

    if (!config) {
      throw new Error(`Connector with ID ${connectorId} not found in database`);
    }

    if (!config.is_active) {
      throw new Error(`Connector '${config.name}' is not active`);
    }

    // Create connector instance
    const connector = this.create(config);

    // Cache the instance
    if (useCache) {
      this.connectorInstances.set(connectorId, connector);
    }

    return connector;
  }

  /**
   * Create a connector instance from config object
   * @param {Object} config - Connector configuration from database
   * @param {number} config.id - Connector ID
   * @param {string} config.name - Connector name
   * @param {string} config.connector_type - Connector type
   * @param {string} config.base_url - Base URL
   * @param {string} config.endpoint - Endpoint/project
   * @param {string} config.auth_type - Auth type
   * @param {string} config.encrypted_credentials - Encrypted credentials JSON
   * @param {Object} config.metadata - Metadata JSON
   * @returns {BaseConnector} Connector instance
   */
  create(config) {
    const ConnectorClass = this.connectorTypes.get(config.connector_type);
    
    if (!ConnectorClass) {
      throw new Error(`Connector type '${config.connector_type}' is not registered. Available types: ${this.getRegisteredTypes().join(', ')}`);
    }

    // Decrypt credentials
    let credentials;
    try {
      credentials = decrypt(config.encrypted_credentials);
    } catch (error) {
      throw new Error(`Failed to decrypt credentials for connector '${config.name}': ${error.message}`);
    }

    // Parse metadata if it's a string
    let metadata = config.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (error) {
        console.warn(`Failed to parse metadata for connector '${config.name}':`, error.message);
        metadata = {};
      }
    }

    // Create connector instance
    const connectorConfig = {
      id: config.id,
      name: config.name,
      connector_type: config.connector_type,
      base_url: config.base_url,
      endpoint: config.endpoint,
      auth_type: config.auth_type,
      credentials: credentials,
      metadata: metadata || {}
    };

    return new ConnectorClass(connectorConfig);
  }

  /**
   * Get connector instance by ID (with caching)
   * @param {number} connectorId - Connector ID
   * @returns {Promise<BaseConnector>} Connector instance
   */
  async get(connectorId) {
    return await this.createFromDatabase(connectorId, true);
  }

  /**
   * Clear cached connector instance
   * @param {number} connectorId - Connector ID
   */
  clearCache(connectorId) {
    if (this.connectorInstances.has(connectorId)) {
      this.connectorInstances.delete(connectorId);
      console.log(`Cleared connector cache for ID: ${connectorId}`);
    }
  }

  /**
   * Clear all cached connector instances
   */
  clearAllCaches() {
    const count = this.connectorInstances.size;
    this.connectorInstances.clear();
    console.log(`Cleared ${count} connector instances from cache`);
  }

  /**
   * List all connectors from database
   * @param {boolean} activeOnly - Only return active connectors (default: true)
   * @returns {Promise<Array>} Array of connector configs
   */
  async listConnectors(activeOnly = true) {
    let query = db('connectors').select('*');
    
    if (activeOnly) {
      query = query.where({ is_active: 1 });
    }

    return await query.orderBy('name');
  }

  /**
   * Test a connector's connection
   * @param {number} connectorId - Connector ID
   * @returns {Promise<Object>} Test result
   */
  async testConnector(connectorId) {
    try {
      const connector = await this.createFromDatabase(connectorId, false);
      const result = await connector.testConnection();
      return {
        connectorId,
        connectorName: connector.getName(),
        ...result
      };
    } catch (error) {
      return {
        connectorId,
        success: false,
        message: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Get connector by name
   * @param {string} name - Connector name
   * @returns {Promise<BaseConnector>} Connector instance
   */
  async getByName(name) {
    const config = await db('connectors')
      .where({ name })
      .first();

    if (!config) {
      throw new Error(`Connector '${name}' not found`);
    }

    return await this.createFromDatabase(config.id);
  }

  /**
   * Discover metadata (work item types, fields, statuses) for a connector
   * @param {number} connectorId - Connector ID
   * @returns {Promise<Object>} Discovered metadata
   */
  async discoverMetadata(connectorId) {
    const connector = await this.get(connectorId);
    
    try {
      const workItemTypes = await connector.getWorkItemTypes();
      
      // Get fields and statuses for each work item type
      const typesWithMetadata = [];
      for (const type of workItemTypes) {
        try {
          const [fields, statuses] = await Promise.all([
            connector.getFields(type.type_id),
            connector.getStatuses(type.type_id)
          ]);
          
          typesWithMetadata.push({
            ...type,
            fields,
            statuses
          });
        } catch (error) {
          console.error(`Failed to get metadata for type ${type.type_name}:`, error.message);
          typesWithMetadata.push({
            ...type,
            fields: [],
            statuses: [],
            error: error.message
          });
        }
      }

      return {
        connectorId,
        connectorName: connector.getName(),
        connectorType: connector.getType(),
        workItemTypes: typesWithMetadata,
        capabilities: connector.getCapabilities()
      };
    } catch (error) {
      throw new Error(`Failed to discover metadata for connector ${connectorId}: ${error.message}`);
    }
  }

  /**
   * Save discovered metadata to database
   * @param {number} connectorId - Connector ID
   * @param {Object} metadata - Discovered metadata
   * @returns {Promise<Object>} Summary of saved records
   */
  async saveDiscoveredMetadata(connectorId, metadata) {
    const summary = {
      workItemTypes: 0,
      fields: 0,
      statuses: 0
    };

    // Use transaction for consistency
    await db.transaction(async (trx) => {
      for (const typeData of metadata.workItemTypes) {
        // Insert or update work item type
        const [typeId] = await trx('connector_work_item_types')
          .insert({
            connector_id: connectorId,
            type_name: typeData.type_name,
            type_id: typeData.type_id,
            enabled_for_sync: 0,
            metadata: JSON.stringify(typeData.metadata || {}),
            created_at: new Date(),
            updated_at: new Date()
          })
          .onConflict(['connector_id', 'type_name'])
          .merge(['type_id', 'metadata', 'updated_at']);

        summary.workItemTypes++;

        // Get the actual type ID (for onConflict merge)
        const actualType = await trx('connector_work_item_types')
          .where({ connector_id: connectorId, type_name: typeData.type_name })
          .first();

        // Insert fields
        if (typeData.fields) {
          for (const field of typeData.fields) {
            await trx('connector_fields')
              .insert({
                work_item_type_id: actualType.id,
                field_name: field.field_name,
                field_reference: field.field_reference,
                field_type: field.field_type,
                is_required: field.is_required ? 1 : 0,
                is_readonly: field.is_readonly ? 1 : 0,
                enabled_for_sync: field.is_readonly ? 0 : 1,
                suggestion_score: this.calculateFieldSuggestionScore(field),
                allowed_values: field.allowed_values ? JSON.stringify(field.allowed_values) : null,
                default_value: field.default_value,
                created_at: new Date()
              })
              .onConflict(['work_item_type_id', 'field_reference'])
              .merge(['field_type', 'is_required', 'is_readonly', 'allowed_values', 'default_value']);

            summary.fields++;
          }
        }

        // Insert statuses
        if (typeData.statuses) {
          for (const status of typeData.statuses) {
            await trx('connector_statuses')
              .insert({
                work_item_type_id: actualType.id,
                status_name: status.status_name,
                status_value: status.status_value,
                status_category: status.status_category,
                enabled_for_sync: 1,
                sort_order: status.sort_order,
                created_at: new Date()
              })
              .onConflict(['work_item_type_id', 'status_name'])
              .merge(['status_value', 'status_category', 'sort_order']);

            summary.statuses++;
          }
        }
      }
    });

    return summary;
  }

  /**
   * Calculate suggestion score for a field (0-100)
   * Higher score = more likely to be useful for sync
   */
  calculateFieldSuggestionScore(field) {
    let score = 0;

    // Core fields get high scores
    const coreFields = ['title', 'description', 'state', 'status', 'priority', 'type'];
    const fieldLower = field.field_reference.toLowerCase();
    
    if (coreFields.some(core => fieldLower.includes(core))) {
      score += 50;
    }

    // Required fields are important
    if (field.is_required) {
      score += 30;
    }

    // Read-only fields get penalty
    if (field.is_readonly) {
      score -= 40;
    }

    // Simple types are easier to sync
    if (['string', 'int', 'datetime', 'picklist'].includes(field.field_type)) {
      score += 20;
    }

    // Ensure score is in range 0-100
    return Math.max(0, Math.min(100, score));
  }
}

// Create singleton instance
const registry = new ConnectorRegistry();

module.exports = registry;
