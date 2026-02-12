import React, { useState, useEffect } from 'react';
import { connectorApi, metadataApi } from '../services/api';
import { 
  Database, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Download,
  Eye,
  EyeOff
} from 'lucide-react';
import './Page.css';

const Metadata = () => {
  const [connectors, setConnectors] = useState([]);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [workItemTypes, setWorkItemTypes] = useState([]);
  const [fields, setFields] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [activeTab, setActiveTab] = useState('types'); // types, fields, statuses
  const [selectedType, setSelectedType] = useState(null);

  useEffect(() => {
    loadConnectors();
  }, []);

  useEffect(() => {
    if (selectedConnector) {
      loadMetadata();
    }
  }, [selectedConnector]);

  const loadConnectors = async () => {
    try {
      const res = await connectorApi.getConnectors();
      setConnectors(res.data.connectors || []);
    } catch (error) {
      console.error('Error loading connectors:', error);
    }
  };

  const loadMetadata = async () => {
    if (!selectedConnector) return;
    
    setLoading(true);
    try {
      const [typesRes, fieldsRes, statusesRes] = await Promise.all([
        metadataApi.getWorkItemTypes(selectedConnector.id),
        metadataApi.getWorkItemFields(selectedConnector.id),
        metadataApi.getStatuses(selectedConnector.id)
      ]);
      
      setWorkItemTypes(typesRes.data.work_item_types || []);
      setFields(fieldsRes.data.fields || []);
      setStatuses(statusesRes.data.statuses || []);
    } catch (error) {
      console.error('Error loading metadata:', error);
      setWorkItemTypes([]);
      setFields([]);
      setStatuses([]);
    } finally {
      setLoading(false);
    }
  };

  const discoverMetadata = async () => {
    if (!selectedConnector) return;

    setDiscovering(true);
    try {
      const res = await connectorApi.discoverMetadata(selectedConnector.id);
      
      if (res.data.success) {
        alert(`✓ Metadata discovered successfully!\n\n${res.data.summary.work_item_types} Work Item Types\n${res.data.summary.fields} Fields\n${res.data.summary.statuses} Statuses`);
        await loadMetadata();
      }
    } catch (error) {
      console.error('Error discovering metadata:', error);
      alert('Error discovering metadata: ' + (error.response?.data?.error || error.message));
    } finally {
      setDiscovering(false);
    }
  };

  const toggleWorkItemType = async (typeId, currentEnabled) => {
    try {
      await metadataApi.updateWorkItemType(typeId, { is_enabled: !currentEnabled });
      await loadMetadata();
    } catch (error) {
      console.error('Error toggling work item type:', error);
      alert('Error updating work item type: ' + (error.response?.data?.error || error.message));
    }
  };

  const getFieldsForType = () => {
    if (!selectedType) return fields;
    return fields.filter(f => f.work_item_type === selectedType);
  };

  const getStatusesForType = () => {
    if (!selectedType) return statuses;
    return statuses.filter(s => s.work_item_type === selectedType);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-content">
          <div className="header-icon">
            <Database size={28} />
          </div>
          <div>
            <h1>Metadata Management</h1>
            <p>Discover and configure connector metadata (work item types, fields, statuses)</p>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Connector Selection */}
        <div className="card">
          <div className="card-header">
            <h2>Select Connector</h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <select 
                value={selectedConnector?.id || ''} 
                onChange={e => {
                  const connector = connectors.find(c => c.id === parseInt(e.target.value));
                  setSelectedConnector(connector);
                  setSelectedType(null);
                }}
                className="form-control"
                style={{ maxWidth: '400px' }}
              >
                <option value="">Select a connector...</option>
                {connectors.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.connector_type})
                  </option>
                ))}
              </select>

              {selectedConnector && (
                <button
                  onClick={discoverMetadata}
                  disabled={discovering}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {discovering ? (
                    <>
                      <RefreshCw size={18} className="spin" />
                      Discovering...
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      Discover Metadata
                    </>
                  )}
                </button>
              )}
            </div>

            {selectedConnector && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.875rem', color: '#0369a1' }}>
                  <strong>Tip:</strong> Click "Discover Metadata" to fetch work item types, fields, and statuses from {selectedConnector.name}. 
                  This needs to be done before creating sync configurations.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Metadata Display */}
        {selectedConnector && (
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Metadata for {selectedConnector.name}</h2>
                {loading && <RefreshCw size={20} className="spin" style={{ color: '#3b82f6' }} />}
              </div>
            </div>

            <div className="card-body">
              {/* Tabs */}
              <div style={{ borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '2rem' }}>
                  <button
                    onClick={() => setActiveTab('types')}
                    style={{
                      padding: '0.75rem 1rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: activeTab === 'types' ? '2px solid #3b82f6' : '2px solid transparent',
                      color: activeTab === 'types' ? '#3b82f6' : '#6b7280',
                      fontWeight: activeTab === 'types' ? '600' : '400',
                      cursor: 'pointer',
                      marginBottom: '-2px'
                    }}
                  >
                    Work Item Types ({workItemTypes.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('fields')}
                    style={{
                      padding: '0.75rem 1rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: activeTab === 'fields' ? '2px solid #3b82f6' : '2px solid transparent',
                      color: activeTab === 'fields' ? '#3b82f6' : '#6b7280',
                      fontWeight: activeTab === 'fields' ? '600' : '400',
                      cursor: 'pointer',
                      marginBottom: '-2px'
                    }}
                  >
                    Fields ({fields.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('statuses')}
                    style={{
                      padding: '0.75rem 1rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: activeTab === 'statuses' ? '2px solid #3b82f6' : '2px solid transparent',
                      color: activeTab === 'statuses' ? '#3b82f6' : '#6b7280',
                      fontWeight: activeTab === 'statuses' ? '600' : '400',
                      cursor: 'pointer',
                      marginBottom: '-2px'
                    }}
                  >
                    Statuses ({statuses.length})
                  </button>
                </div>
              </div>

              {/* Work Item Types Tab */}
              {activeTab === 'types' && (
                <div>
                  {workItemTypes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                      <AlertCircle size={48} style={{ color: '#9ca3af', marginBottom: '1rem' }} />
                      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                        No work item types found. Click "Discover Metadata" to fetch from the connector.
                      </p>
                    </div>
                  ) : (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Type Name</th>
                            <th>Display Name</th>
                            <th>Description</th>
                            <th>Enabled</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {workItemTypes.map(type => (
                            <tr key={type.id}>
                              <td>
                                <code style={{ fontSize: '0.875rem', background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                                  {type.type_name}
                                </code>
                              </td>
                              <td>{type.display_name || type.type_name}</td>
                              <td style={{ maxWidth: '300px', whiteSpace: 'normal' }}>
                                {type.description || '-'}
                              </td>
                              <td>
                                {type.enabled_for_sync ? (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#10b981' }}>
                                    <CheckCircle size={16} /> Enabled
                                  </span>
                                ) : (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#9ca3af' }}>
                                    <XCircle size={16} /> Disabled
                                  </span>
                                )}
                              </td>
                              <td>
                                <button
                                  onClick={() => toggleWorkItemType(type.id, type.enabled_for_sync)}
                                  className="btn btn-sm"
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                  {type.enabled_for_sync ? (
                                    <>
                                      <EyeOff size={16} /> Disable
                                    </>
                                  ) : (
                                    <>
                                      <Eye size={16} /> Enable
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Fields Tab */}
              {activeTab === 'fields' && (
                <div>
                  {workItemTypes.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                        Filter by Work Item Type:
                      </label>
                      <select
                        value={selectedType || ''}
                        onChange={e => setSelectedType(e.target.value || null)}
                        className="form-control"
                        style={{ maxWidth: '300px' }}
                      >
                        <option value="">All Types</option>
                        {workItemTypes.map(type => (
                          <option key={type.type_name} value={type.type_name}>
                            {type.display_name || type.type_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {getFieldsForType().length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                      <AlertCircle size={48} style={{ color: '#9ca3af', marginBottom: '1rem' }} />
                      <p style={{ color: '#6b7280' }}>
                        No fields found. Click "Discover Metadata" to fetch from the connector.
                      </p>
                    </div>
                  ) : (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Field Name</th>
                            <th>Display Name</th>
                            <th>Type</th>
                            <th>Work Item Type</th>
                            <th>Required</th>
                            <th>Read Only</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getFieldsForType().map((field, idx) => (
                            <tr key={idx}>
                              <td>
                                <code style={{ fontSize: '0.875rem', background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                                  {field.field_name}
                                </code>
                              </td>
                              <td>{field.display_name || field.field_name}</td>
                              <td>
                                <span style={{ 
                                  fontSize: '0.75rem', 
                                  padding: '0.25rem 0.5rem', 
                                  background: '#dbeafe', 
                                  color: '#1e40af',
                                  borderRadius: '4px'
                                }}>
                                  {field.field_type}
                                </span>
                              </td>
                              <td>{field.work_item_type || 'All'}</td>
                              <td>
                                {field.is_required ? (
                                  <CheckCircle size={16} style={{ color: '#10b981' }} />
                                ) : (
                                  <XCircle size={16} style={{ color: '#9ca3af' }} />
                                )}
                              </td>
                              <td>
                                {field.is_read_only ? (
                                  <CheckCircle size={16} style={{ color: '#f59e0b' }} />
                                ) : (
                                  <XCircle size={16} style={{ color: '#9ca3af' }} />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Statuses Tab */}
              {activeTab === 'statuses' && (
                <div>
                  {workItemTypes.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                        Filter by Work Item Type:
                      </label>
                      <select
                        value={selectedType || ''}
                        onChange={e => setSelectedType(e.target.value || null)}
                        className="form-control"
                        style={{ maxWidth: '300px' }}
                      >
                        <option value="">All Types</option>
                        {workItemTypes.map(type => (
                          <option key={type.type_name} value={type.type_name}>
                            {type.display_name || type.type_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {getStatusesForType().length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                      <AlertCircle size={48} style={{ color: '#9ca3af', marginBottom: '1rem' }} />
                      <p style={{ color: '#6b7280' }}>
                        No statuses found. Click "Discover Metadata" to fetch from the connector.
                      </p>
                    </div>
                  ) : (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Status Name</th>
                            <th>Display Name</th>
                            <th>Category</th>
                            <th>Work Item Type</th>
                            <th>Color</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getStatusesForType().map((status, idx) => (
                            <tr key={idx}>
                              <td>
                                <code style={{ fontSize: '0.875rem', background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                                  {status.status_name}
                                </code>
                              </td>
                              <td>{status.display_name || status.status_name}</td>
                              <td>
                                <span style={{ 
                                  fontSize: '0.75rem', 
                                  padding: '0.25rem 0.5rem', 
                                  background: '#e0e7ff', 
                                  color: '#4338ca',
                                  borderRadius: '4px'
                                }}>
                                  {status.category || 'Unknown'}
                                </span>
                              </td>
                              <td>{status.work_item_type || 'All'}</td>
                              <td>
                                {status.color && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ 
                                      width: '20px', 
                                      height: '20px', 
                                      background: status.color,
                                      border: '1px solid #d1d5db',
                                      borderRadius: '4px'
                                    }} />
                                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                      {status.color}
                                    </span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Metadata;
