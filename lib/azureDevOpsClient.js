const azdev = require('azure-devops-node-api');
const { prepareFieldsForSync } = require('./fieldConfig');

class AzureDevOpsClient {
  constructor(orgUrl, token) {
    this.orgUrl = orgUrl;
    this.token = token;
    this.connection = null;
  }

  async connect() {
    const authHandler = azdev.getPersonalAccessTokenHandler(this.token);
    this.connection = new azdev.WebApi(this.orgUrl, authHandler);
    return this.connection;
  }

  async getWorkItemTrackingApi() {
    if (!this.connection) {
      await this.connect();
    }
    return await this.connection.getWorkItemTrackingApi();
  }

  async getWorkItemFields(project) {
    const witApi = await this.getWorkItemTrackingApi();
    return await witApi.getFields(project);
  }

  async getWorkItemType(project, type) {
    const witApi = await this.getWorkItemTrackingApi();
    return await witApi.getWorkItemType(project, type);
  }

  async getWorkItemTypeFieldsWithReferences(project, type) {
    const witApi = await this.getWorkItemTrackingApi();
    const workItemType = await witApi.getWorkItemType(project, type);
    
    // Get field metadata
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

  async getWorkItem(workItemId) {
    const witApi = await this.getWorkItemTrackingApi();
    return await witApi.getWorkItem(workItemId);
  }

  async getWorkItems(project, wiql) {
    const witApi = await this.getWorkItemTrackingApi();
    const queryResult = await witApi.queryByWiql({ query: wiql }, project);
    
    if (!queryResult.workItems || queryResult.workItems.length === 0) {
      return [];
    }

    const ids = queryResult.workItems.map(wi => wi.id);
    return await witApi.getWorkItems(ids, null, null, null, null);
  }

  async createWorkItem(project, workItemType, fields) {
    const witApi = await this.getWorkItemTrackingApi();
    
    const document = Object.keys(fields).map(key => ({
      op: 'add',
      path: `/fields/${key}`,
      value: fields[key]
    }));

    return await witApi.createWorkItem(null, document, project, workItemType);
  }

  async updateWorkItem(workItemId, fields) {
    const witApi = await this.getWorkItemTrackingApi();
    
    const document = Object.keys(fields).map(key => ({
      op: 'add',
      path: `/fields/${key}`,
      value: fields[key]
    }));

    return await witApi.updateWorkItem(null, document, workItemId);
  }

  async syncWorkItem(sourceWorkItem, targetProject, options = {}) {
    const sourceFields = sourceWorkItem.fields;
    const sourceProject = sourceFields['System.TeamProject'];
    const workItemType = sourceFields['System.WorkItemType'];
    
    // Get field metadata for validation if requested
    let targetFieldMetadata = null;
    if (options.validateFields) {
      try {
        targetFieldMetadata = await this.getWorkItemTypeFieldsWithReferences(targetProject, workItemType);
      } catch (error) {
        console.error('Could not retrieve field metadata:', error.message);
      }
    }
    
    // Prepare all fields for synchronization
    const targetFields = prepareFieldsForSync(
      sourceFields,
      sourceProject,
      targetProject,
      { ...options, targetFieldMetadata }
    );

    // Create work item in target project
    return await this.createWorkItem(targetProject, workItemType, targetFields);
  }

  async syncWorkItemWithDetails(sourceWorkItem, targetProject, options = {}) {
    const sourceFields = sourceWorkItem.fields;
    const sourceProject = sourceFields['System.TeamProject'];
    const workItemType = sourceFields['System.WorkItemType'];
    const registerActivity = options.registerActivity !== false; // Default to true
    
    // Get field metadata for validation
    let targetFieldMetadata = null;
    const fieldsSkippedDueToMetadata = [];
    
    try {
      targetFieldMetadata = await this.getWorkItemTypeFieldsWithReferences(targetProject, workItemType);
    } catch (error) {
      console.error('Could not retrieve field metadata:', error.message);
    }
    
    // Prepare fields for synchronization with metadata validation
    const targetFields = prepareFieldsForSync(
      sourceFields,
      sourceProject,
      targetProject,
      { 
        ...options, 
        targetFieldMetadata,
        onFieldSkipped: (fieldName, reason) => {
          fieldsSkippedDueToMetadata.push({ field: fieldName, reason });
        }
      }
    );

    // Create the work item
    const createdWorkItem = await this.createWorkItem(targetProject, workItemType, targetFields);
    
    // Register activity by updating the work item (makes it appear in @RecentProjectActivity)
    if (registerActivity) {
      try {
        // Update the work item with a dummy change to register activity
        // This sets ChangedDate != CreatedDate, making it appear in activity filters
        await this.updateWorkItem(createdWorkItem.id, {
          'System.History': '<div>Synced from work item #' + sourceWorkItem.id + ' in project ' + sourceProject + '</div>'
        });
      } catch (error) {
        console.error('Could not register activity:', error.message);
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
}

module.exports = AzureDevOpsClient;
