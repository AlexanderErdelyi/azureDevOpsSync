import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add response interceptor for error handling
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export const connectorApi = {
  getConnectors: () => api.get('/connectors'),
  getConnector: (id) => api.get(`/connectors/${id}`),
  createConnector: (data) => api.post('/connectors', data),
  updateConnector: (id, data) => api.put(`/connectors/${id}`, data),
  deleteConnector: (id) => api.delete(`/connectors/${id}`),
  testConnection: (id) => api.post(`/connectors/${id}/test`),
  discoverMetadata: (id) => api.post(`/connectors/${id}/discover`)
};

export const metadataApi = {
  getWorkItemTypes: (connectorId, enabledOnly = false) => 
    api.get('/metadata/work-item-types', { params: { connector_id: connectorId, enabled_only: enabledOnly } }),
  getWorkItemFields: (connectorId, typeId = null, requiredOnly = false) => 
    typeId ? api.get('/metadata/fields', { params: { connector_id: connectorId, type_id: typeId, required_only: requiredOnly } })
          : api.get('/metadata/fields', { params: { connector_id: connectorId } }),
  getStatuses: (connectorId, typeId = null) => 
    typeId ? api.get('/metadata/statuses', { params: { connector_id: connectorId, type_id: typeId } })
          : api.get('/metadata/statuses', { params: { connector_id: connectorId } }),
  updateWorkItemType: (id, data) => api.put(`/metadata/work-item-types/${id}`, data),
  updateField: (id, data) => api.put(`/metadata/fields/${id}`, data),
  suggestMappings: (sourceConnectorId, sourceTypeId, targetConnectorId, targetTypeId) => 
    api.get('/metadata/suggest-mappings', { 
      params: { 
        source_connector_id: sourceConnectorId, 
        source_type_id: sourceTypeId,
        target_connector_id: targetConnectorId,
        target_type_id: targetTypeId
      } 
    })
};

export const syncConfigApi = {
  getSyncConfigs: () => api.get('/sync-configs'),
  getSyncConfig: (id) => api.get(`/sync-configs/${id}`),
  createSyncConfig: (data) => api.post('/sync-configs', data),
  updateSyncConfig: (id, data) => api.put(`/sync-configs/${id}`, data),
  deleteSyncConfig: (id) => api.delete(`/sync-configs/${id}`)
};

export const executeApi = {
  executeSyncDryRun: (configId, workItemIds = null) => api.post(`/execute/sync/${configId}`, { work_item_ids: workItemIds, dry_run: true }),
  executeSync: (configId, workItemIds = null) => api.post(`/execute/sync/${configId}`, { work_item_ids: workItemIds }),
  getExecutionHistory: (configId, limit = 50) => api.get(`/execute/history/${configId}`, { params: { limit } }),
  getExecutionDetails: (executionId) => api.get(`/execute/status/${executionId}`)
};

export const schedulerApi = {
  getStatus: () => api.get('/scheduler/status'),
  start: () => api.post('/scheduler/start'),
  stop: () => api.post('/scheduler/stop'),
  scheduleSync: (configId, cronExpression) => api.post(`/scheduler/schedule/${configId}`, { schedule_cron: cronExpression }),
  unscheduleSync: (configId) => api.post(`/scheduler/unschedule/${configId}`)
};

export const jobQueueApi = {
  getJobStatus: (jobId) => api.get(`/jobs/status/${jobId}`),
  getQueueStatus: () => api.get('/jobs/queue'),
  queueJob: (configId, data = {}) => api.post(`/jobs/queue/${configId}`, data)
};

export const webhookApi = {
  getWebhooks: () => api.get('/webhooks'),
  getWebhook: (id) => api.get(`/webhooks/${id}`),
  registerWebhook: (data) => api.post('/webhooks/register', data),
  updateWebhook: (id, data) => api.put(`/webhooks/${id}`, data),
  deleteWebhook: (id) => api.delete(`/webhooks/${id}`),
  getDeliveries: (id, limit = 50) => api.get(`/webhooks/${id}/deliveries`, { params: { limit } })
};

export const notificationApi = {
  getNotifications: (syncConfigId = null) => api.get('/notifications', { params: syncConfigId ? { sync_config_id: syncConfigId } : {} }),
  createNotification: (data) => api.post('/notifications', data),
  updateNotification: (id, data) => api.put(`/notifications/${id}`, data),
  deleteNotification: (id) => api.delete(`/notifications/${id}`),
  testConfiguration: (recipients) => api.post('/notifications/test', { recipients })
};

export const conflictsApi = {
  getConflicts: (params = {}) => api.get('/conflicts', { params }),
  getConflict: (id) => api.get(`/conflicts/${id}`),
  resolveManually: (id, resolvedValue, rationale, resolvedBy = 'user') => 
    api.post(`/conflicts/${id}/resolve`, { resolved_value: resolvedValue, rationale, resolved_by: resolvedBy }),
  resolveAuto: (id, strategy = null) => api.post(`/conflicts/${id}/resolve-auto`, { strategy }),
  resolveBatch: (conflictIds, strategy) => api.post('/conflicts/resolve-batch', { conflict_ids: conflictIds, strategy }),
  ignoreConflict: (id) => api.post(`/conflicts/${id}/ignore`),
  getStats: (configId) => api.get(`/conflicts/stats/${configId}`)
};

export const settingsApi = {
  getSettings: (prefix = null) => api.get('/settings', { params: prefix ? { prefix } : {} }),
  getSetting: (key) => api.get(`/settings/${key}`),
  updateSettings: (settings) => api.put('/settings', { settings }),
  updateSetting: (key, value, valueType = 'string', description = '') => 
    api.put(`/settings/${key}`, { value, value_type: valueType, description }),
  testSmtp: (toEmail) => api.post('/settings/test-smtp', { to_email: toEmail })
};

export default api;
