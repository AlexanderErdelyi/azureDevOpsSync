/**
 * AzureDevOpsConnector - Azure DevOps implementation of BaseConnector
 * 
 * Integrates with Azure DevOps using the azure-devops-node-api SDK
 */

const azdev = require('azure-devops-node-api');
const BaseConnector = require('./BaseConnector');
const { prepareFieldsForSync } = require('../fieldConfig');

class AzureDevOpsConnector extends BaseConnector {
  constructor(config) {
    super(config);
    
    // Azure DevOps specific properties
    this.project = config.endpoint; // Project name stored in endpoint
    this.token = config.credentials.token;
    this.witApi = null;
  }

  /**
   * Establish connection to Azure DevOps
   */
  async connect() {
    try {
      const authHandler = azdev.getPersonalAccessTokenHandler(this.token);
      this.connection = new azdev.WebApi(this.baseUrl, authHandler);
      this.witApi = await this.connection.getWorkItemTrackingApi();
      
      this.log('info', 'Connected to Azure DevOps', { project: this.project });
      return true;
    } catch (error) {
      this.log('error', 'Failed to connect to Azure DevOps', { error: error.message });
      throw error;
    }
  }

  /**
   * Get Work Item Tracking API (lazy initialization)
   */
  async getWorkItemTrackingApi() {
    if (!this.witApi) {
      await this.connect();
    }
    return this.witApi;
  }

  /**
   * Test connection and credentials
   */
  async testConnection() {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      // Try to get work item types as a connection test
      const types = await witApi.getWorkItemTypes(this.project);
      
      return {
        success: true,
        message: 'Connection successful',
        details: {
          organization: this.baseUrl,
          project: this.project,
          workItemTypesCount: types.length
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        details: {
          organization: this.baseUrl,
          project: this.project,
          error: error.message
        }
      };
    }
  }

  /**
   * Get all work item types
   */
  async getWorkItemTypes() {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const types = await witApi.getWorkItemTypes(this.project);
      
      return types.map(type => ({
        type_name: type.name,
        type_id: type.name, // Azure DevOps uses name as ID
        metadata: {
          description: type.description,
          color: type.color,
          icon: type.icon ? type.icon.id : null,
          isDisabled: type.isDisabled || false
        }
      }));
    } catch (error) {
      this.log('error', 'Failed to get work item types', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all statuses for a work item type
   */
  async getStatuses(workItemTypeId) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const workItemType = await witApi.getWorkItemType(this.project, workItemTypeId);
      
      if (!workItemType.states) {
        return [];
      }

      return workItemType.states.map((state, index) => ({
        status_name: state.name,
        status_value: state.name,
        status_category: state.category || 'InProgress',
        sort_order: index
      }));
    } catch (error) {
      this.log('error', 'Failed to get statuses', { workItemType: workItemTypeId, error: error.message });
      throw error;
    }
  }

  /**
   * Get all fields for a work item type
   */
  async getFields(workItemTypeId) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const workItemType = await witApi.getWorkItemType(this.project, workItemTypeId);
      
      if (!workItemType.fields) {
        return [];
      }

      return workItemType.fields.map(field => ({
        field_name: field.name,
        field_reference: field.referenceName,
        field_type: this.mapFieldType(field.type),
        is_required: field.required || false,
        is_readonly: field.readOnly || false,
        allowed_values: field.allowedValues || null,
        default_value: field.defaultValue || null
      }));
    } catch (error) {
      this.log('error', 'Failed to get fields', { workItemType: workItemTypeId, error: error.message });
      throw error;
    }
  }

  /**
   * Get field metadata with references (internal helper)
   */
  async getFieldMetadata(workItemTypeId) {
    const witApi = await this.getWorkItemTrackingApi();
    const workItemType = await witApi.getWorkItemType(this.project, workItemTypeId);
    
    const fieldMetadata = {};
    if (workItemType.fields) {
      for (const field of workItemType.fields) {
        fieldMetadata[field.referenceName] = {
          name: field.name,
          referenceName: field.referenceName,
          readOnly: field.readOnly || false,
          type: field.type,
          required: field.required || false,
          canSortBy: field.canSortBy || false,
        };
      }
    }
    
    return fieldMetadata;
  }

  /**
   * Get a single work item
   */
  async getWorkItem(workItemId) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      return await witApi.getWorkItem(parseInt(workItemId));
    } catch (error) {
      this.log('error', 'Failed to get work item', { workItemId, error: error.message });
      throw error;
    }
  }

  /**
   * Query work items using WIQL
   */
  async queryWorkItems(filter) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      // Handle null/undefined filter
      if (!filter) {
        return [];
      }
      
      // Filter should contain { wiql: "SELECT [System.Id] FROM WorkItems WHERE ..." }
      const wiql = filter.wiql || filter;
      // timePrecision=true allows full ISO timestamps in ChangedDate filters
      const queryResult = await witApi.queryByWiql({ query: wiql }, this.project, true);
      
      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        return [];
      }

      const ids = queryResult.workItems.map(wi => wi.id);
      return await witApi.getWorkItems(ids, null, null, null, null);
    } catch (error) {
      this.log('error', 'Failed to query work items', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new work item
   */
  async createWorkItem(workItemType, fields) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      const document = Object.keys(fields).map(key => ({
        op: 'add',
        path: `/fields/${key}`,
        value: fields[key]
      }));

      const result = await witApi.createWorkItem(null, document, this.project, workItemType);
      
      this.log('info', 'Work item created', { 
        id: result.id, 
        type: workItemType,
        title: fields['System.Title']
      });
      
      return result;
    } catch (error) {
      this.log('error', 'Failed to create work item', { 
        workItemType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update an existing work item
   */
  async updateWorkItem(workItemId, fields) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      const document = Object.keys(fields).map(key => ({
        op: 'add',
        path: `/fields/${key}`,
        value: fields[key]
      }));

      const result = await witApi.updateWorkItem(null, document, parseInt(workItemId));
      
      this.log('info', 'Work item updated', { 
        id: workItemId,
        fieldsUpdated: Object.keys(fields).length
      });
      
      return result;
    } catch (error) {
      this.log('error', 'Failed to update work item', { 
        workItemId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete work item (Azure DevOps supports soft delete)
   */
  async deleteWorkItem(workItemId) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      await witApi.deleteWorkItem(parseInt(workItemId));
      
      this.log('info', 'Work item deleted', { id: workItemId });
      return true;
    } catch (error) {
      this.log('error', 'Failed to delete work item', { 
        workItemId, 
        error: error.message 
      });
      return false;
    }
  }

  /**
   * Sync a work item from source to this connector (target)
   * @param {Object} sourceWorkItem - Source work item with fields
   * @param {string} sourceProject - Source project name
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Sync result with details
   */
  async syncFromSource(sourceWorkItem, sourceProject, options = {}) {
    const sourceFields = sourceWorkItem.fields;
    const workItemType = sourceFields['System.WorkItemType'];
    const registerActivity = options.registerActivity !== false;
    
    // Get field metadata for validation
    let targetFieldMetadata = null;
    const fieldsSkippedDueToMetadata = [];
    
    try {
      targetFieldMetadata = await this.getFieldMetadata(workItemType);
    } catch (error) {
      this.log('warn', 'Could not retrieve field metadata', { error: error.message });
    }
    
    // Prepare fields for synchronization with metadata validation
    const targetFields = prepareFieldsForSync(
      sourceFields,
      sourceProject,
      this.project,
      { 
        ...options, 
        targetFieldMetadata,
        onFieldSkipped: (fieldName, reason) => {
          fieldsSkippedDueToMetadata.push({ field: fieldName, reason });
        }
      }
    );

    // Create the work item
    const createdWorkItem = await this.createWorkItem(workItemType, targetFields);
    
    // Register activity by updating the work item (makes it appear in @RecentProjectActivity)
    if (registerActivity) {
      try {
        await this.updateWorkItem(createdWorkItem.id, {
          'System.History': `<div>Synced from work item #${sourceWorkItem.id} in project ${sourceProject}</div>`
        });
      } catch (error) {
        this.log('warn', 'Could not register activity', { error: error.message });
      }
    }
    
    // Return detailed sync result
    return {
      success: true,
      sourceId: sourceWorkItem.id,
      targetId: createdWorkItem.id,
      workItemType: workItemType,
      title: sourceFields['System.Title'],
      fieldsSynced: Object.keys(targetFields).length,
      syncedFields: Object.keys(targetFields),
      fieldsSkipped: fieldsSkippedDueToMetadata.length > 0 ? fieldsSkippedDueToMetadata : undefined,
      activityRegistered: registerActivity,
    };
  }

  /**
   * Get work item URL
   */
  getWorkItemUrl(workItemId) {
    return `${this.baseUrl}/${this.project}/_workitems/edit/${workItemId}`;
  }

  /**
   * Map Azure DevOps field type to standard type
   */
  mapFieldType(azureType) {
    const typeMap = {
      'String': 'string',
      'Integer': 'int',
      'Double': 'double',
      'DateTime': 'datetime',
      'PlainText': 'string',
      'Html': 'html',
      'TreePath': 'string',
      'History': 'html',
      'Boolean': 'boolean',
      'Identity': 'identity',
      'PicklistString': 'picklist',
      'PicklistInteger': 'picklist',
      'PicklistDouble': 'picklist'
    };
    
    return typeMap[azureType] || 'string';
  }

  /**
   * Get connector capabilities
   */
  getCapabilities() {
    return {
      supportsCreate: true,
      supportsUpdate: true,
      supportsDelete: true,
      supportsQuery: true,
      supportsAttachments: true,
      supportsComments: true,
      supportsLinks: true,
      supportsHistory: true,
      supportsBidirectionalSync: true,
      supportsWebhooks: true,
      supportsRealTimeUpdates: false
    };
  }

  /**
   * Transform field value for Azure DevOps
   */
  transformFieldValue(fieldReference, value, sourceConnectorType) {
    // Area Path and Iteration Path need project name replacement
    if (fieldReference === 'System.AreaPath' || fieldReference === 'System.IterationPath') {
      if (typeof value === 'string' && value.includes('\\')) {
        const parts = value.split('\\');
        parts[0] = this.project; // Replace project name
        return parts.join('\\');
      }
    }
    
    return value;
  }

  /**
   * Get comments for a work item
   * @param {number} workItemId - Work item ID
   * @returns {Promise<Array>} Array of comments
   */
  async getComments(workItemId) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const comments = await witApi.getComments(this.project, parseInt(workItemId));
      
      return comments.comments.map(comment => ({
        id: comment.id,
        text: comment.text,
        createdBy: comment.createdBy?.displayName,
        createdDate: comment.createdDate,
        modifiedBy: comment.modifiedBy?.displayName,
        modifiedDate: comment.modifiedDate
      }));
    } catch (error) {
      this.log('error', 'Failed to get comments', { 
        workItemId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Add a comment to a work item
   * @param {number} workItemId - Work item ID
   * @param {string} text - Comment text
   * @returns {Promise<Object>} Created comment
   */
  async addComment(workItemId, text) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const comment = await witApi.addComment({
        text: text
      }, this.project, parseInt(workItemId));
      
      this.log('info', 'Comment added', { 
        workItemId, 
        commentId: comment.id 
      });
      
      return {
        id: comment.id,
        text: comment.text,
        createdBy: comment.createdBy?.displayName,
        createdDate: comment.createdDate
      };
    } catch (error) {
      this.log('error', 'Failed to add comment', { 
        workItemId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get work item relations (links)
   * @param {number} workItemId - Work item ID
   * @returns {Promise<Array>} Array of relations/links
   */
  async getWorkItemRelations(workItemId) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      // expand=1 means expand relations (WorkItemExpand.Relations)
      const workItem = await witApi.getWorkItem(parseInt(workItemId), null, null, 1);
      
      if (!workItem.relations) {
        return [];
      }
      
      return workItem.relations.map(rel => ({
        rel: rel.rel,
        url: rel.url,
        attributes: rel.attributes,
        // Extract linked work item ID from URL
        linkedWorkItemId: this._extractWorkItemIdFromUrl(rel.url)
      }));
    } catch (error) {
      this.log('error', 'Failed to get work item relations', { 
        workItemId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Add a work item relation/link
   * @param {number} workItemId - Source work item ID
   * @param {string} relationType - Relation type (e.g., 'System.LinkTypes.Hierarchy-Forward' for parent)
   * @param {number} targetWorkItemId - Target work item ID
   * @returns {Promise<Object>} Updated work item
   */
  async addWorkItemRelation(workItemId, relationType, targetWorkItemId) {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      const document = [{
        op: 'add',
        path: '/relations/-',
        value: {
          rel: relationType,
          url: `${this.baseUrl}/_apis/wit/workItems/${targetWorkItemId}`,
          attributes: {
            comment: 'Link added by sync'
          }
        }
      }];
      
      const result = await witApi.updateWorkItem(null, document, parseInt(workItemId));
      
      this.log('info', 'Work item relation added', { 
        workItemId, 
        relationType,
        targetWorkItemId 
      });
      
      return result;
    } catch (error) {
      this.log('error', 'Failed to add work item relation', { 
        workItemId, 
        relationType,
        targetWorkItemId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Extract work item ID from Azure DevOps URL
   * @private
   */
  _extractWorkItemIdFromUrl(url) {
    const match = url.match(/workItems\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }
}

module.exports = AzureDevOpsConnector;
