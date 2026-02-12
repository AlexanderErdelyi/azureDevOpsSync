import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, TestTube, RefreshCw } from 'lucide-react';
import { connectorApi } from '../services/api';
import './Connectors.css';

const CONNECTOR_TYPES = [
  { value: 'azuredevops', label: 'Azure DevOps' },
  { value: 'servicedeskplus', label: 'ServiceDesk Plus' }
];

const Connectors = () => {
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    type: 'azuredevops',
    base_url: '',
    auth_type: 'pat',
    credentials: { pat: '', api_key: '', username: '', password: '' },
    is_active: true
  });

  useEffect(() => {
    loadConnectors();
  }, []);

  const loadConnectors = async () => {
    try {
      setLoading(true);
      const res = await connectorApi.getConnectors();
      setConnectors(res.data.connectors || []);
    } catch (error) {
      console.error('Error loading connectors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await connectorApi.updateConnector(editingId, form);
      } else {
        await connectorApi.createConnector(form);
      }
      await loadConnectors();
      resetForm();
    } catch (error) {
      console.error('Error saving connector:', error);
      alert('Error saving connector: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this connector?')) return;
    try {
      await connectorApi.deleteConnector(id);
      await loadConnectors();
    } catch (error) {
      console.error('Error deleting connector:', error);
      alert('Error deleting connector: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleTest = async (id) => {
    setTestingId(id);
    try {
      const res = await connectorApi.testConnection(id);
      if (res.data.success) {
        alert('✓ Connection successful!');
      } else {
        alert('✗ Connection failed: ' + res.data.message);
      }
    } catch (error) {
      alert('✗ Connection failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setTestingId(null);
    }
  };

  const startEdit = (connector) => {
    setEditingId(connector.id);
    setForm({
      name: connector.name,
      type: connector.type,
      base_url: connector.base_url,
      auth_type: connector.auth_type,
      credentials: connector.credentials || { pat: '', api_key: '', username: '', password: '' },
      is_active: connector.is_active
    });
    setShowAddForm(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setShowAddForm(false);
    setForm({
      name: '',
      type: 'azuredevops',
      base_url: '',
      auth_type: 'pat',
      credentials: { pat: '', api_key: '', username: '', password: '' },
      is_active: true
    });
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Connectors</h1>
        </div>
        <div className="loading">Loading connectors...</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Connectors</h1>
          <p className="subtitle">Manage connector configurations</p>
        </div>
        <div className="header-actions">
          <button className="btn-refresh" onClick={loadConnectors}>
            <RefreshCw size={16} />
            Refresh
          </button>
          {!showAddForm && (
            <button className="btn-primary" onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              Add Connector
            </button>
          )}
        </div>
      </div>

      {showAddForm && (
        <div className="form-card">
          <div className="form-header">
            <h3>{editingId ? 'Edit Connector' : 'Add New Connector'}</h3>
            <button className="btn-icon" onClick={resetForm}>
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="My Connector"
                  required
                />
              </div>
              <div className="form-group">
                <label>Type *</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value })}
                  required
                >
                  {CONNECTOR_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Base URL *</label>
              <input
                type="url"
                value={form.base_url}
                onChange={e => setForm({ ...form, base_url: e.target.value })}
                placeholder={form.type === 'azuredevops' ? 'https://dev.azure.com/organization' : 'https://sdp.example.com'}
                required
              />
            </div>

            <div className="form-group">
              <label>Authentication Type *</label>
              <select
                value={form.auth_type}
                onChange={e => setForm({ ...form, auth_type: e.target.value })}
                required
              >
                <option value="pat">Personal Access Token</option>
                <option value="apikey">API Key</option>
                <option value="basic">Basic Auth</option>
              </select>
            </div>

            {form.auth_type === 'pat' && (
              <div className="form-group">
                <label>Personal Access Token *</label>
                <input
                  type="password"
                  value={form.credentials.pat || ''}
                  onChange={e => setForm({ ...form, credentials: { ...form.credentials, pat: e.target.value } })}
                  placeholder="••••••••••••••••"
                  required
                />
              </div>
            )}

            {form.auth_type === 'apikey' && (
              <div className="form-group">
                <label>API Key *</label>
                <input
                  type="password"
                  value={form.credentials.api_key || ''}
                  onChange={e => setForm({ ...form, credentials: { ...form.credentials, api_key: e.target.value } })}
                  placeholder="••••••••••••••••"
                  required
                />
              </div>
            )}

            {form.auth_type === 'basic' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Username *</label>
                    <input
                      type="text"
                      value={form.credentials.username || ''}
                      onChange={e => setForm({ ...form, credentials: { ...form.credentials, username: e.target.value } })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Password *</label>
                    <input
                      type="password"
                      value={form.credentials.password || ''}
                      onChange={e => setForm({ ...form, credentials: { ...form.credentials, password: e.target.value } })}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                />
                <span>Active</span>
              </label>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                <Check size={16} />
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="connectors-list">
        {connectors.length === 0 ? (
          <div className="empty-state">
            <p>No connectors configured yet</p>
            <button className="btn-primary" onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              Add First Connector
            </button>
          </div>
        ) : (
          <div className="connector-grid">
            {connectors.map(connector => (
              <div key={connector.id} className={`connector-card ${connector.is_active ? 'active' : 'inactive'}`}>
                <div className="connector-header">
                  <div>
                    <h3 className="connector-name">{connector.name}</h3>
                    <span className="connector-type">{CONNECTOR_TYPES.find(t => t.value === connector.type)?.label || connector.type}</span>
                  </div>
                  <span className={`status-badge ${connector.is_active ? 'active' : 'inactive'}`}>
                    {connector.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="connector-details">
                  <div className="detail-row">
                    <span className="detail-label">URL:</span>
                    <span className="detail-value">{connector.base_url}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Auth:</span>
                    <span className="detail-value">{connector.auth_type.toUpperCase()}</span>
                  </div>
                </div>

                <div className="connector-actions">
                  <button
                    className="btn-icon-action"
                    onClick={() => handleTest(connector.id)}
                    disabled={testingId === connector.id}
                    title="Test Connection"
                  >
                    {testingId === connector.id ? <RefreshCw size={16} className="spinning" /> : <TestTube size={16} />}
                  </button>
                  <button
                    className="btn-icon-action"
                    onClick={() => startEdit(connector)}
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    className="btn-icon-action danger"
                    onClick={() => handleDelete(connector.id)}
                    title="Delete"
                  >
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

export default Connectors;
