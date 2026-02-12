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
  testConnection: (id) => api.get(`/connectors/${id}/test`)
};

export const metadataApi = {
  getMetadata: (connectorId) => api.get(`/metadata/${connectorId}`),
  getWorkItemTypes: (connectorId) => api.get(`/metadata/${connectorId}/work-item-types`),
  getWorkItemFields: (connectorId, workItemType) => api.get(`/metadata/${connectorId}/work-item-types/${workItemType}/fields`)
};

export const syncConfigApi = {
  getSyncConfigs: () => api.get('/sync-configs'),
  getSyncConfig: (id) => api.get(`/sync-configs/${id}`),
  createSyncConfig: (data) => api.post('/sync-configs', data),
  updateSyncConfig: (id, data) => api.put(`/sync-configs/${id}`, data),
  deleteSyncConfig: (id) => api.delete(`/sync-configs/${id}`)
};

export const executeApi = {
  executeSyncDryRun: (configId, workItemIds = null) => api.post(`/execute/${configId}/dry-run`, { work_item_ids: workItemIds }),
  executeSync: (configId, workItemIds = null) => api.post(`/execute/${configId}`, { work_item_ids: workItemIds }),
  getExecutionHistory: (configId, limit = 50) => api.get(`/execute/history/${configId}`, { params: { limit } }),
  getExecutionDetails: (executionId) => api.get(`/execute/details/${executionId}`)
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

export default api;
