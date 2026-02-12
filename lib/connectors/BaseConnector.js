/**
 * BaseConnector - Abstract base class for all connector implementations
 * 
 * This class defines the interface that all connectors must implement to
 * integrate with the multi-connector sync platform.
 */

class BaseConnector {
  /**
   * @param {Object} config - Connector configuration
   * @param {number} config.id - Database ID of the connector
   * @param {string} config.name - Connector name
   * @param {string} config.connector_type - Type identifier
   * @param {string} config.base_url - Base URL for API
   * @param {string} config.endpoint - Endpoint/project identifier
   * @param {string} config.auth_type - Authentication type
   * @param {Object} config.credentials - Decrypted credentials
   * @param {Object} config.metadata - Connector-specific metadata
   */
  constructor(config) {
    if (this.constructor === BaseConnector) {
      throw new Error('BaseConnector is abstract and cannot be instantiated directly');
    }

    this.id = config.id;
    this.name = config.name;
    this.connectorType = config.connector_type;
    this.baseUrl = config.base_url;
    this.endpoint = config.endpoint;
    this.authType = config.auth_type;
    this.credentials = config.credentials;
    this.metadata = config.metadata || {};
    this.connection = null;
  }

  /**
   * Get the connector type identifier
   * @returns {string} Connector type
   */
  getType() {
    return this.connectorType;
  }

  /**
   * Get the connector ID
   * @returns {number} Database ID
   */
  getId() {
    return this.id;
  }

  /**
   * Get the connector name
   * @returns {string} Connector name
   */
  getName() {
    return this.name;
  }

  // ============================================================
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ============================================================

  /**
   * Establish connection to the remote system
   * @abstract
   * @returns {Promise<boolean>} True if connection successful
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Test the connection and credentials
   * @abstract
   * @returns {Promise<Object>} { success: boolean, message: string, details: Object }
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass');
  }

  /**
   * Get all work item types available in this connector
   * @abstract
   * @returns {Promise<Array>} Array of work item type objects
   * Format: [{ type_name, type_id, metadata }]
   */
  async getWorkItemTypes() {
    throw new Error('getWorkItemTypes() must be implemented by subclass');
  }

  /**
   * Get all statuses for a specific work item type
   * @abstract
   * @param {string} workItemTypeId - Work item type identifier
   * @returns {Promise<Array>} Array of status objects
   * Format: [{ status_name, status_value, status_category, sort_order }]
   */
  async getStatuses(workItemTypeId) {
    throw new Error('getStatuses() must be implemented by subclass');
  }

  /**
   * Get all fields for a specific work item type
   * @abstract
   * @param {string} workItemTypeId - Work item type identifier
   * @returns {Promise<Array>} Array of field objects
   * Format: [{ field_name, field_reference, field_type, is_required, is_readonly, allowed_values }]
   */
  async getFields(workItemTypeId) {
    throw new Error('getFields() must be implemented by subclass');
  }

  /**
   * Get a single work item by ID
   * @abstract
   * @param {string} workItemId - Work item identifier
   * @returns {Promise<Object>} Work item object with fields
   */
  async getWorkItem(workItemId) {
    throw new Error('getWorkItem() must be implemented by subclass');
  }

  /**
   * Query work items based on filter criteria
   * @abstract
   * @param {Object} filter - Query filter (connector-specific format)
   * @returns {Promise<Array>} Array of work item objects
   */
  async queryWorkItems(filter) {
    throw new Error('queryWorkItems() must be implemented by subclass');
  }

  /**
   * Create a new work item
   * @abstract
   * @param {string} workItemType - Type of work item to create
   * @param {Object} fields - Field values for the work item
   * @returns {Promise<Object>} Created work item with ID
   */
  async createWorkItem(workItemType, fields) {
    throw new Error('createWorkItem() must be implemented by subclass');
  }

  /**
   * Update an existing work item
   * @abstract
   * @param {string} workItemId - Work item identifier
   * @param {Object} fields - Field values to update
   * @returns {Promise<Object>} Updated work item
   */
  async updateWorkItem(workItemId, fields) {
    throw new Error('updateWorkItem() must be implemented by subclass');
  }

  /**
   * Delete a work item (if supported)
   * @abstract
   * @param {string} workItemId - Work item identifier
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteWorkItem(workItemId) {
    throw new Error('deleteWorkItem() must be implemented by subclass');
  }

  // ============================================================
  // OPTIONAL METHODS - Can be overridden by subclasses
  // ============================================================

  /**
   * Get the URL to view a work item in the remote system
   * @param {string} workItemId - Work item identifier
   * @returns {string} URL to work item
   */
  getWorkItemUrl(workItemId) {
    return `${this.baseUrl}/${this.endpoint}/_workitems/edit/${workItemId}`;
  }

  /**
   * Validate field value before sync
   * @param {string} fieldReference - Field reference name
   * @param {*} value - Field value to validate
   * @param {Object} fieldMetadata - Field metadata
   * @returns {Object} { valid: boolean, error: string, transformedValue: * }
   */
  validateFieldValue(fieldReference, value, fieldMetadata) {
    // Default implementation - can be overridden
    if (fieldMetadata.is_required && (value === null || value === undefined || value === '')) {
      return {
        valid: false,
        error: `Field ${fieldReference} is required`,
        transformedValue: null
      };
    }

    if (fieldMetadata.allowed_values && fieldMetadata.allowed_values.length > 0) {
      if (!fieldMetadata.allowed_values.includes(value)) {
        return {
          valid: false,
          error: `Value '${value}' is not allowed for field ${fieldReference}. Allowed values: ${fieldMetadata.allowed_values.join(', ')}`,
          transformedValue: null
        };
      }
    }

    return {
      valid: true,
      error: null,
      transformedValue: value
    };
  }

  /**
   * Transform field value for this connector's format
   * @param {string} fieldReference - Field reference name
   * @param {*} value - Field value to transform
   * @param {string} sourceConnectorType - Source connector type
   * @returns {*} Transformed value
   */
  transformFieldValue(fieldReference, value, sourceConnectorType) {
    // Default implementation - can be overridden
    return value;
  }

  /**
   * Get connector capabilities
   * @returns {Object} Capabilities object
   */
  getCapabilities() {
    return {
      supportsCreate: true,
      supportsUpdate: true,
      supportsDelete: false,
      supportsQuery: true,
      supportsAttachments: false,
      supportsComments: false,
      supportsLinks: false,
      supportsHistory: false,
      supportsBidirectionalSync: true,
      supportsWebhooks: false,
      supportsRealTimeUpdates: false
    };
  }

  /**
   * Close connection and cleanup resources
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.connection = null;
  }

  /**
   * Get rate limit information (if applicable)
   * @returns {Object} { limit: number, remaining: number, reset: Date }
   */
  getRateLimitInfo() {
    return {
      limit: null,
      remaining: null,
      reset: null
    };
  }

  /**
   * Log connector activity (can be overridden for custom logging)
   * @param {string} level - Log level (info, warn, error)
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  log(level, message, context = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      connector: this.name,
      type: this.connectorType,
      level,
      message,
      ...context
    };

    switch (level) {
      case 'error':
        console.error(JSON.stringify(logData));
        break;
      case 'warn':
        console.warn(JSON.stringify(logData));
        break;
      default:
        console.log(JSON.stringify(logData));
    }
  }
}

module.exports = BaseConnector;
