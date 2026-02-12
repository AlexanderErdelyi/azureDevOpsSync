/**
 * ServiceDeskPlusConnector - ManageEngine ServiceDesk Plus implementation
 * 
 * Integrates with ServiceDesk Plus using REST API v3
 * Documentation: https://www.manageengine.com/products/service-desk/sdpod-v3-api/
 */

const BaseConnector = require('./BaseConnector');

class ServiceDeskPlusConnector extends BaseConnector {
  constructor(config) {
    super(config);
    
    // ServiceDesk Plus specific properties
    this.apiKey = config.credentials.apiKey || config.credentials.token;
    this.technician_key = config.credentials.technician_key; // Optional for cloud version
    this.isCloud = config.metadata?.isCloud || true;
    this.site = config.endpoint; // Site name/portal name
  }

  /**
   * Establish connection to ServiceDesk Plus
   */
  async connect() {
    try {
      // ServiceDesk Plus uses API key per request, no persistent connection
      this.connection = {
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        site: this.site
      };
      
      this.log('info', 'Connected to ServiceDesk Plus', { 
        site: this.site,
        isCloud: this.isCloud 
      });
      return true;
    } catch (error) {
      this.log('error', 'Failed to connect to ServiceDesk Plus', { error: error.message });
      throw error;
    }
  }

  /**
   * Test connection and credentials
   */
  async testConnection() {
    try {
      // Test by fetching request templates (lightweight API call)
      const response = await this.makeRequest('GET', '/api/v3/request_templates', {
        list_info: { row_count: 1 }
      });
      
      return {
        success: true,
        message: 'Connection successful',
        details: {
          server: this.baseUrl,
          site: this.site,
          isCloud: this.isCloud
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        details: {
          server: this.baseUrl,
          site: this.site,
          error: error.message
        }
      };
    }
  }

  /**
   * Get all work item types (request types in ServiceDesk Plus)
   */
  async getWorkItemTypes() {
    try {
      // In ServiceDesk Plus, work item types are "Request Types" from templates
      const response = await this.makeRequest('GET', '/api/v3/request_types');
      
      if (!response.request_types) {
        return [];
      }

      return response.request_types.map(type => ({
        type_name: type.name,
        type_id: type.id.toString(),
        metadata: {
          description: type.description || '',
          color: type.color || '#0066CC',
          icon: type.icon || 'request'
        }
      }));
    } catch (error) {
      this.log('error', 'Failed to get work item types', { error: error.message });
      // Return default types if API call fails
      return [
        { type_name: 'Incident', type_id: 'incident', metadata: { color: '#E74C3C' } },
        { type_name: 'Service Request', type_id: 'service_request', metadata: { color: '#3498DB' } },
        { type_name: 'Problem', type_id: 'problem', metadata: { color: '#F39C12' } },
        { type_name: 'Change', type_id: 'change', metadata: { color: '#9B59B6' } }
      ];
    }
  }

  /**
   * Get all statuses for a work item type
   */
  async getStatuses(workItemTypeId) {
    try {
      // ServiceDesk Plus statuses are global, not per work item type
      const response = await this.makeRequest('GET', '/api/v3/statuses');
      
      if (!response.statuses) {
        return this.getDefaultStatuses();
      }

      return response.statuses.map((status, index) => ({
        status_name: status.name,
        status_value: status.id.toString(),
        status_category: this.mapStatusCategory(status.name),
        sort_order: index
      }));
    } catch (error) {
      this.log('error', 'Failed to get statuses', { error: error.message });
      return this.getDefaultStatuses();
    }
  }

  /**
   * Get default statuses if API call fails
   */
  getDefaultStatuses() {
    return [
      { status_name: 'Open', status_value: 'open', status_category: 'proposed', sort_order: 0 },
      { status_name: 'In Progress', status_value: 'in_progress', status_category: 'in_progress', sort_order: 1 },
      { status_name: 'Pending', status_value: 'pending', status_category: 'in_progress', sort_order: 2 },
      { status_name: 'Resolved', status_value: 'resolved', status_category: 'completed', sort_order: 3 },
      { status_name: 'Closed', status_value: 'closed', status_category: 'completed', sort_order: 4 }
    ];
  }

  /**
   * Get all fields for a work item type
   */
  async getFields(workItemTypeId) {
    try {
      // ServiceDesk Plus has form fields that can vary by template
      // Return standard fields that are common across all requests
      return this.getStandardFields();
    } catch (error) {
      this.log('error', 'Failed to get fields', { error: error.message });
      return this.getStandardFields();
    }
  }

  /**
   * Get standard ServiceDesk Plus request fields
   */
  getStandardFields() {
    return [
      {
        field_name: 'Subject',
        field_reference: 'subject',
        field_type: 'string',
        is_required: true,
        is_readonly: false,
        allowed_values: null,
        default_value: null
      },
      {
        field_name: 'Description',
        field_reference: 'description',
        field_type: 'html',
        is_required: true,
        is_readonly: false,
        allowed_values: null,
        default_value: null
      },
      {
        field_name: 'Priority',
        field_reference: 'priority.name',
        field_type: 'picklist',
        is_required: false,
        is_readonly: false,
        allowed_values: ['Low', 'Normal', 'High', 'Urgent'],
        default_value: 'Normal'
      },
      {
        field_name: 'Status',
        field_reference: 'status.name',
        field_type: 'picklist',
        is_required: false,
        is_readonly: false,
        allowed_values: null,
        default_value: 'Open'
      },
      {
        field_name: 'Requester',
        field_reference: 'requester.name',
        field_type: 'identity',
        is_required: true,
        is_readonly: false,
        allowed_values: null,
        default_value: null
      },
      {
        field_name: 'Technician',
        field_reference: 'technician.name',
        field_type: 'identity',
        is_required: false,
        is_readonly: false,
        allowed_values: null,
        default_value: null
      },
      {
        field_name: 'Category',
        field_reference: 'category.name',
        field_type: 'string',
        is_required: false,
        is_readonly: false,
        allowed_values: null,
        default_value: null
      },
      {
        field_name: 'Subcategory',
        field_reference: 'subcategory.name',
        field_type: 'string',
        is_required: false,
        is_readonly: false,
        allowed_values: null,
        default_value: null
      }
    ];
  }

  /**
   * Get a single work item (request)
   */
  async getWorkItem(workItemId) {
    try {
      const response = await this.makeRequest('GET', `/api/v3/requests/${workItemId}`);
      return this.normalizeRequest(response.request);
    } catch (error) {
      this.log('error', 'Failed to get work item', { workItemId, error: error.message });
      throw error;
    }
  }

  /**
   * Query work items with filter
   */
  async queryWorkItems(filter) {
    try {
      // Filter format: { list_info: { search_criteria: [...], row_count: 50 } }
      const response = await this.makeRequest('GET', '/api/v3/requests', filter);
      
      if (!response.requests) {
        return [];
      }

      return response.requests.map(req => this.normalizeRequest(req));
    } catch (error) {
      this.log('error', 'Failed to query work items', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new work item (request)
   */
  async createWorkItem(workItemType, fields) {
    try {
      // Transform fields to ServiceDesk Plus format
      const requestData = this.transformToServiceDeskFormat(fields);
      
      const response = await this.makeRequest('POST', '/api/v3/requests', {
        request: requestData
      });
      
      this.log('info', 'Work item created', { 
        id: response.request.id, 
        type: workItemType,
        subject: requestData.subject
      });
      
      return this.normalizeRequest(response.request);
    } catch (error) {
      this.log('error', 'Failed to create work item', { 
        workItemType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update an existing work item (request)
   */
  async updateWorkItem(workItemId, fields) {
    try {
      // Transform fields to ServiceDesk Plus format
      const requestData = this.transformToServiceDeskFormat(fields);
      
      const response = await this.makeRequest('PUT', `/api/v3/requests/${workItemId}`, {
        request: requestData
      });
      
      this.log('info', 'Work item updated', { 
        id: workItemId,
        fieldsUpdated: Object.keys(fields).length
      });
      
      return this.normalizeRequest(response.request);
    } catch (error) {
      this.log('error', 'Failed to update work item', { 
        workItemId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete work item (ServiceDesk Plus supports archive/delete)
   */
  async deleteWorkItem(workItemId) {
    try {
      await this.makeRequest('DELETE', `/api/v3/requests/${workItemId}`);
      
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
   * Make HTTP request to ServiceDesk Plus API
   */
  async makeRequest(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'authtoken': this.apiKey
    };

    if (this.technician_key) {
      headers['TECHNICIAN_KEY'] = this.technician_key;
    }

    const options = {
      method,
      headers
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify({ input_data: JSON.stringify(data) });
    } else if (data && method === 'GET') {
      // For GET requests, add query parameters
      const params = new URLSearchParams({ input_data: JSON.stringify(data) });
      url += '?' + params.toString();
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`ServiceDesk Plus API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Normalize ServiceDesk Plus request to standard format
   */
  normalizeRequest(request) {
    return {
      id: request.id,
      fields: {
        'System.Id': request.id,
        'System.Title': request.subject,
        'System.Description': request.description,
        'System.State': request.status?.name || 'Open',
        'System.WorkItemType': request.request_type?.name || 'Service Request',
        'Microsoft.VSTS.Common.Priority': this.mapPriority(request.priority?.name),
        'System.AssignedTo': request.technician?.name || '',
        'System.CreatedDate': request.created_time?.display_value,
        'System.ChangedDate': request.last_updated_time?.display_value,
        'System.CreatedBy': request.requester?.name || '',
        'Category': request.category?.name || '',
        'Subcategory': request.subcategory?.name || ''
      }
    };
  }

  /**
   * Transform standard fields to ServiceDesk Plus format
   */
  transformToServiceDeskFormat(fields) {
    const requestData = {};

    // Map standard fields
    if (fields['System.Title']) requestData.subject = fields['System.Title'];
    if (fields['System.Description']) requestData.description = fields['System.Description'];
    
    if (fields['System.State']) {
      requestData.status = { name: fields['System.State'] };
    }
    
    if (fields['Microsoft.VSTS.Common.Priority']) {
      requestData.priority = { name: this.mapPriorityToServiceDesk(fields['Microsoft.VSTS.Common.Priority']) };
    }
    
    if (fields['System.AssignedTo']) {
      requestData.technician = { name: fields['System.AssignedTo'] };
    }
    
    if (fields['Category']) {
      requestData.category = { name: fields['Category'] };
    }
    
    if (fields['Subcategory']) {
      requestData.subcategory = { name: fields['Subcategory'] };
    }

    // Add requester (use a default if not provided)
    if (fields['System.CreatedBy']) {
      requestData.requester = { name: fields['System.CreatedBy'] };
    } else {
      requestData.requester = { name: 'System' };
    }

    return requestData;
  }

  /**
   * Map ServiceDesk Plus priority to Azure DevOps priority
   */
  mapPriority(serviceDeskPriority) {
    const priorityMap = {
      'Low': '4',
      'Normal': '3',
      'High': '2',
      'Urgent': '1'
    };
    return priorityMap[serviceDeskPriority] || '3';
  }

  /**
   * Map Azure DevOps priority to ServiceDesk Plus priority
   */
  mapPriorityToServiceDesk(azurePriority) {
    const priorityMap = {
      '1': 'Urgent',
      '2': 'High',
      '3': 'Normal',
      '4': 'Low'
    };
    return priorityMap[azurePriority?.toString()] || 'Normal';
  }

  /**
   * Map status name to category
   */
  mapStatusCategory(statusName) {
    const categoryMap = {
      'Open': 'proposed',
      'In Progress': 'in_progress',
      'Pending': 'in_progress',
      'On Hold': 'in_progress',
      'Resolved': 'completed',
      'Closed': 'completed',
      'Cancelled': 'removed'
    };
    return categoryMap[statusName] || 'in_progress';
  }

  /**
   * Get work item URL
   */
  getWorkItemUrl(workItemId) {
    return `${this.baseUrl}/${this.site}/WorkOrder.do?woMode=viewWO&woID=${workItemId}`;
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
      supportsLinks: false,
      supportsHistory: true,
      supportsBidirectionalSync: true,
      supportsWebhooks: true,
      supportsRealTimeUpdates: false
    };
  }
}

module.exports = ServiceDeskPlusConnector;
