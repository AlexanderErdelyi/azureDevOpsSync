const azdev = require('azure-devops-node-api');

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

  async syncWorkItem(sourceWorkItem, targetProject) {
    // Extract key fields from source work item
    const sourceFields = sourceWorkItem.fields;
    const targetFields = {
      'System.Title': sourceFields['System.Title'],
      'System.Description': sourceFields['System.Description'] || '',
      'System.State': sourceFields['System.State'],
      'System.Tags': sourceFields['System.Tags'] || ''
    };

    // Add optional fields if they exist
    if (sourceFields['System.AreaPath']) {
      targetFields['System.AreaPath'] = targetProject;
    }
    if (sourceFields['System.IterationPath']) {
      targetFields['System.IterationPath'] = targetProject;
    }

    // Create work item in target project
    const workItemType = sourceFields['System.WorkItemType'];
    return await this.createWorkItem(targetProject, workItemType, targetFields);
  }
}

module.exports = AzureDevOpsClient;
