import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, RefreshCw, Webhook as WebhookIcon } from 'lucide-react';
import { webhookApi, syncConfigApi, connectorApi } from '../services/api';
import './Page.css';

const Webhooks = () => {
  const [webhooks, setWebhooks] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    sync_config_id: '',
    connector_id: '',
    event_types: ['workitem.created', 'workitem.updated']
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [webhooksRes, configsRes, connectorsRes] = await Promise.all([
        webhookApi.getWebhooks(),
        syncConfigApi.getSyncConfigs(),
        connectorApi.getConnectors()
      ]);
      setWebhooks(webhooksRes.data.webhooks || []);
      setConfigs(configsRes.data.configs || []);
      setConnectors(connectorsRes.data.connectors || []);
    } catch (error) {
      console.error('Error loading webhooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await webhookApi.registerWebhook(form);
      await loadData();
      setShowForm(false);
      resetForm();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const deleteWebhook = async (id) => {
    if (!confirm('Delete this webhook?')) return;
    try {
      await webhookApi.deleteWebhook(id);
      await loadData();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url);
    alert('URL copied to clipboard!');
  };

  const resetForm = () => {
    setForm({
      name: '',
      sync_config_id: '',
      connector_id: '',
      event_types: ['workitem.created', 'workitem.updated']
    });
  };

  if (loading) {
    return <div className="page"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Webhooks</h1>
          <p className="subtitle">Configure webhook endpoints</p>
        </div>
        <div className="header-actions">
          <button className="btn-refresh" onClick={loadData}>
            <RefreshCw size={16} />
            Refresh
          </button>
          {!showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={16} />
              Register Webhook
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="form-card">
          <h3>Register New Webhook</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Azure DevOps Webhook"
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Sync Configuration *</label>
                <select
                  value={form.sync_config_id}
                  onChange={e => setForm({ ...form, sync_config_id: e.target.value })}
                  required
                >
                  <option value="">Select config...</option>
                  {configs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Connector *</label>
                <select
                  value={form.connector_id}
                  onChange={e => setForm({ ...form, connector_id: e.target.value })}
                  required
                >
                  <option value="">Select connector...</option>
                  {connectors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Register
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="page-content">
        {webhooks.length === 0 ? (
          <div className="empty-state">
            <WebhookIcon size={48} />
            <p>No webhooks configured</p>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={16} />
              Register First Webhook
            </button>
          </div>
        ) : (
          <div className="webhook-list">
            {webhooks.map(webhook => (
              <div key={webhook.id} className="webhook-item">
                <div className="webhook-header">
                  <h3>{webhook.name}</h3>
                  <span className={`status-badge ${webhook.is_active ? 'active' : 'inactive'}`}>
                    {webhook.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="webhook-url">
                  <code>{webhook.full_url}</code>
                  <button className="btn-icon" onClick={() => copyUrl(webhook.full_url)} title="Copy URL">
                    <Copy size={16} />
                  </button>
                </div>
                <div className="webhook-meta">
                  <span>Triggers: {webhook.trigger_count || 0}</span>
                </div>
                <div className="webhook-actions">
                  <button className="btn-icon-action danger" onClick={() => deleteWebhook(webhook.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Webhooks;
