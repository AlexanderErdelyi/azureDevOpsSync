import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Clock, Play, AlertCircle, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { syncConfigApi, executeApi } from '../services/api';
import './Page.css';

const Monitoring = () => {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [expandedExecution, setExpandedExecution] = useState(null);
  const [executionDetails, setExecutionDetails] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [rateLimited, setRateLimited] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  useEffect(() => {
    if (selectedConfig) {
      loadExecutions(selectedConfig);
    }
  }, [selectedConfig]);

  const loadConfigs = async () => {
    try {
      const res = await syncConfigApi.getSyncConfigs();
      const configs = res.data.configs || [];
      setConfigs(configs);
      if (configs.length > 0 && !selectedConfig) {
        setSelectedConfig(configs[0].id);
      }
    } catch (error) {
      console.error('Error loading configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadExecutions = async (configId) => {
    try {
      setRateLimited(false);
      const res = await executeApi.getExecutionHistory(configId, 100);
      setExecutions(res.data.executions || []);
      setLastRefresh(Date.now());
    } catch (error) {
      console.error('Error loading executions:', error);
      if (error.response?.status === 429) {
        setRateLimited(true);
      }
      setExecutions([]);
    }
  };

  const handleManualRefresh = () => {
    // Debounce: prevent refresh if less than 2 seconds since last refresh
    const timeSinceLastRefresh = Date.now() - lastRefresh;
    if (timeSinceLastRefresh < 2000) {
      // Visual feedback - button is temporarily disabled in UI
      return;
    }
    loadExecutions(selectedConfig);
  };

  const executeSync = async (dryRun = false) => {
    if (!selectedConfig) {
      alert('Please select a sync configuration first');
      return;    }
    
    setExecuting(true);
    try {
      let result;
      if (dryRun) {
        result = await executeApi.executeSyncDryRun(selectedConfig);
        alert(`Dry run completed!\n\nTotal: ${result.data.results.total}\nWould create: ${result.data.results.created}\nWould update: ${result.data.results.updated}\nErrors: ${result.data.results.errors}`);
      } else {
        result = await executeApi.executeSync(selectedConfig);
        alert(`Sync executed successfully!\n\nTotal: ${result.data.results.total}\nCreated: ${result.data.results.created}\nUpdated: ${result.data.results.updated}\nErrors: ${result.data.results.errors}`);
      }
      setTimeout(() => loadExecutions(selectedConfig), 1000);
    } catch (error) {
      console.error('Execute sync error:', error);
      alert('Error: ' + (error.response?.data?.message || error.response?.data?.error || error.message));
    } finally {
      setExecuting(false);
    }
  };

  const previewSync = async () => {
    if (!selectedConfig) {
      alert('Please select a sync configuration first');
      return;
    }
    
    setPreviewLoading(true);
    try {
      const result = await executeApi.previewSync(selectedConfig);
      setPreviewData(result.data);
      setShowPreview(true);
    } catch (error) {
      console.error('Preview sync error:', error);
      alert('Error: ' + (error.response?.data?.message || error.response?.data?.error || error.message));
    } finally {
      setPreviewLoading(false);
    }
  };

  const executeFromPreview = async (selectedItems = null) => {
    setShowPreview(false);
    
    if (!selectedConfig) {
      alert('Please select a sync configuration first');
      return;
    }
    
    setExecuting(true);
    try {
      // Filter out error items from preview data
      const validItems = previewData?.items?.filter(item => item.action !== 'error') || [];
      const workItemIds = selectedItems || (validItems.length > 0 ? validItems.map(item => item.sourceId) : null);
      const result = await executeApi.executeSync(selectedConfig, workItemIds);
      alert(`Sync executed successfully!\n\nTotal: ${result.data.results.total}\nCreated: ${result.data.results.created}\nUpdated: ${result.data.results.updated}\nErrors: ${result.data.results.errors}`);
      setTimeout(() => loadExecutions(selectedConfig), 1000);
    } catch (error) {
      console.error('Execute sync error:', error);
      alert('Error: ' + (error.response?.data?.message || error.response?.data?.error || error.message));
    } finally {
      setExecuting(false);
      setPreviewData(null);
    }
  };

  const toggleExecutionDetails = async (executionId) => {
    if (expandedExecution === executionId) {
      setExpandedExecution(null);
    } else {
      setExpandedExecution(executionId);
      // Load execution details if not already loaded
      if (!executionDetails[executionId]) {
        try {
          const res = await executeApi.getExecutionDetails(executionId);
          setExecutionDetails(prev => ({
            ...prev,
            [executionId]: {
              logs: res.data.logs || [],
              errors: res.data.errors || [],
              syncedItems: res.data.syncedItems || []
            }
          }));
        } catch (error) {
          console.error('Error loading execution details:', error);
          setExecutionDetails(prev => ({
            ...prev,
            [executionId]: { logs: [], errors: [], syncedItems: [] }
          }));
        }
      }
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatLogTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getLogIcon = (level) => {
    switch (level) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'warning': return '⚠';
      case 'info':
      default: return 'ℹ';
    }
  };

  const getLogColor = (level) => {
    switch (level) {
      case 'success': return '#10b981';
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'info':
      default: return '#3b82f6';
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (loading) {
    return <div className="page"><div className="loading">Loading...</div></div>;
  }

  const currentConfig = configs.find(c => c.id == selectedConfig);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Monitoring</h1>
          <p className="subtitle">Real-time sync monitoring and execution logs</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleManualRefresh} disabled={rateLimited || (Date.now() - lastRefresh < 2000)}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="btn-secondary" onClick={previewSync} disabled={previewLoading || executing}>
            <Eye size={16} />
            Preview Sync
          </button>
          <button className="btn-secondary" onClick={() => executeSync(true)} disabled={executing}>
            <AlertCircle size={16} />
            Dry Run
          </button>
          <button className="btn-primary" onClick={() => executeSync(false)} disabled={executing}>
            <Play size={16} />
            Execute Sync
          </button>
        </div>
      </div>

      <div className="monitoring-layout">
        <div className="config-selector">
          <h3>Sync Configurations</h3>
          {configs.map(config => (
            <button
              key={config.id}
              className={`config-item ${selectedConfig == config.id ? 'active' : ''}`}
              onClick={() => setSelectedConfig(config.id)}
            >
              <span className="config-name">{config.name}</span>
              <span className={`status-dot ${config.is_active ? 'active' : ''}`}></span>
            </button>
          ))}
        </div>

        <div className="execution-log">
          {currentConfig && (
            <div className="log-header">
              <h3>{currentConfig.name}</h3>
              <span className="log-count">{executions.length} executions</span>
            </div>
          )}

          <div className="execution-list">
            {executions.map(exec => (
              <div key={exec.id} className={`execution-item status-${exec.status}`}>
                <div className="execution-icon">
                  {exec.status === 'completed' && <CheckCircle2 size={20} />}
                  {exec.status === 'failed' && <XCircle size={20} />}
                  {exec.status === 'running' && <RefreshCw size={20} className="spinning" />}
                </div>
                <div className="execution-info">
                  <div className="execution-header">
                    <span className="execution-id">Execution #{exec.id}</span>
                    <span className="execution-time">{formatDate(exec.started_at || exec.created_at)}</span>
                  </div>
                  <div className="execution-stats">
                    <span>Synced: {exec.items_synced || 0}</span>
                    <span>Failed: {exec.items_failed || 0}</span>
                    <span>Duration: {formatDuration(exec.duration_ms)}</span>
                  </div>
                  {exec.error_message && (
                    <div className="execution-error">{exec.error_message}</div>
                  )}
                  {(exec.items_failed > 0 || exec.items_synced > 0 || exec.error_message) && (
                    <button 
                      className="btn-link"
                      onClick={() => toggleExecutionDetails(exec.id)}
                      style={{ marginTop: '0.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      {expandedExecution === exec.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {expandedExecution === exec.id ? 'Hide' : 'View'} Execution Log
                    </button>
                  )}
                  {expandedExecution === exec.id && (
                    <div style={{ 
                      marginTop: '1rem', 
                      background: '#f9fafb', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      overflow: 'hidden'
                    }}>
                      {/* Execution Logs */}
                      {executionDetails[exec.id]?.logs && executionDetails[exec.id].logs.length > 0 && (
                        <div style={{ 
                          padding: '1rem',
                          borderBottom: executionDetails[exec.id]?.errors?.length > 0 ? '1px solid #e5e7eb' : 'none'
                        }}>
                          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                            📋 Execution Log ({executionDetails[exec.id].logs.length} entries)
                          </h4>
                          <div style={{ 
                            maxHeight: '300px',
                            overflowY: 'auto',
                            background: '#1f2937',
                            padding: '0.75rem',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.8125rem'
                          }}>
                            {executionDetails[exec.id].logs.map((log, idx) => (
                              <div 
                                key={idx} 
                                style={{ 
                                  padding: '0.375rem 0',
                                  borderBottom: idx < executionDetails[exec.id].logs.length - 1 ? '1px solid #374151' : 'none',
                                  color: '#e5e7eb'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                  <span style={{ 
                                    color: getLogColor(log.level),
                                    fontWeight: 'bold',
                                    minWidth: '1rem'
                                  }}>
                                    {getLogIcon(log.level)}
                                  </span>
                                  <span style={{ color: '#9ca3af', minWidth: '4.5rem' }}>
                                    {formatLogTime(log.timestamp)}
                                  </span>
                                  <span style={{ flex: 1 }}>
                                    {log.message}
                                    {log.work_item_id && (
                                      <span style={{ color: '#9ca3af', marginLeft: '0.5rem' }}>
                                        [ID: {log.work_item_id}]
                                      </span>
                                    )}
                                    {log.error && (
                                      <div style={{ 
                                        color: '#fca5a5', 
                                        marginTop: '0.25rem',
                                        paddingLeft: '1rem',
                                        fontSize: '0.75rem'
                                      }}>
                                        → {log.error}
                                      </div>
                                    )}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Synced Items */}
                      {executionDetails[exec.id]?.syncedItems && executionDetails[exec.id].syncedItems.length > 0 && (
                        <div style={{ 
                          padding: '1rem',
                          borderBottom: executionDetails[exec.id]?.errors?.length > 0 ? '1px solid #e5e7eb' : 'none'
                        }}>
                          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#059669' }}>
                            ✅ Synced Items ({executionDetails[exec.id].syncedItems.length})
                          </h4>
                          <div style={{ 
                            overflowX: 'auto',
                            maxHeight: '300px',
                            overflowY: 'auto'
                          }}>
                            <table style={{ 
                              width: '100%',
                              borderCollapse: 'collapse',
                              fontSize: '0.8125rem'
                            }}>
                              <thead>
                                <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Source</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Target</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Type Mapping</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Sync Count</th>
                                </tr>
                              </thead>
                              <tbody>
                                {executionDetails[exec.id].syncedItems.map((item, idx) => {
                                  const sourceUrl = `${item.source_base_url}/${item.source_project}/_workitems/edit/${item.source_item_id}`;
                                  const targetUrl = `${item.target_base_url}/${item.target_project}/_workitems/edit/${item.target_item_id}`;
                                  
                                  return (
                                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                      <td style={{ padding: '0.5rem' }}>
                                        <div style={{ marginBottom: '0.25rem' }}>
                                          <span style={{ 
                                            color: '#6b7280',
                                            fontSize: '0.75rem'
                                          }}>
                                            {item.source_project}
                                          </span>
                                        </div>
                                        <a 
                                          href={sourceUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          style={{ 
                                            color: '#2563eb',
                                            textDecoration: 'none',
                                            fontWeight: '500',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                          }}
                                          onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                                          onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                                        >
                                          #{item.source_item_id}
                                          <span style={{ fontSize: '0.75rem' }}>↗</span>
                                        </a>
                                      </td>
                                      <td style={{ padding: '0.5rem' }}>
                                        <div style={{ marginBottom: '0.25rem' }}>
                                          <span style={{ 
                                            color: '#6b7280',
                                            fontSize: '0.75rem'
                                          }}>
                                            {item.target_project}
                                          </span>
                                        </div>
                                        <a 
                                          href={targetUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          style={{ 
                                            color: '#2563eb',
                                            textDecoration: 'none',
                                            fontWeight: '500',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                          }}
                                          onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                                          onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                                        >
                                          #{item.target_item_id}
                                          <span style={{ fontSize: '0.75rem' }}>↗</span>
                                        </a>
                                      </td>
                                      <td style={{ padding: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          <span style={{ 
                                            background: '#dbeafe',
                                            color: '#1e40af',
                                            padding: '0.125rem 0.5rem',
                                            borderRadius: '9999px',
                                            fontSize: '0.75rem',
                                            fontWeight: '500'
                                          }}>
                                            {item.source_item_type}
                                          </span>
                                          <span style={{ color: '#9ca3af' }}>→</span>
                                          <span style={{ 
                                            background: '#dcfce7',
                                            color: '#166534',
                                            padding: '0.125rem 0.5rem',
                                            borderRadius: '9999px',
                                            fontSize: '0.75rem',
                                            fontWeight: '500'
                                          }}>
                                            {item.target_item_type}
                                          </span>
                                        </div>
                                      </td>
                                      <td style={{ padding: '0.5rem', color: '#6b7280', textAlign: 'center' }}>
                                        {item.sync_count}x
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      
                      {/* Error Details */}
                      {executionDetails[exec.id]?.errors && executionDetails[exec.id].errors.length > 0 && (
                        <div style={{ padding: '1rem' }}>
                          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#dc2626' }}>
                            🔴 Errors ({executionDetails[exec.id].errors.length})
                          </h4>
                          <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '0.75rem',
                            maxHeight: '300px',
                            overflowY: 'auto'
                          }}>
                            {executionDetails[exec.id].errors.map((error, idx) => (
                              <div key={idx} style={{ 
                                padding: '0.75rem', 
                                background: '#fef2f2', 
                                border: '1px solid #fecaca',
                                borderRadius: '4px'
                              }}>
                                <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <strong style={{ fontSize: '0.875rem', color: '#991b1b' }}>
                                    {error.error_type}
                                  </strong>
                                  {error.item_id && (
                                    <span style={{ 
                                      fontSize: '0.75rem', 
                                      color: '#6b7280',
                                      background: 'white',
                                      padding: '0.125rem 0.5rem',
                                      borderRadius: '9999px',
                                      border: '1px solid #e5e7eb'
                                    }}>
                                      Work Item #{error.item_id}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.875rem', color: '#374151', wordBreak: 'break-word', marginBottom: '0.5rem' }}>
                                  {error.error_message}
                                </div>
                                {error.stack_trace && (
                                  <details style={{ marginTop: '0.5rem' }}>
                                    <summary style={{ 
                                      fontSize: '0.75rem', 
                                      color: '#6b7280', 
                                      cursor: 'pointer',
                                      userSelect: 'none'
                                    }}>
                                      View stack trace
                                    </summary>
                                    <pre style={{ 
                                      fontSize: '0.6875rem', 
                                      color: '#6b7280',
                                      background: 'white',
                                      padding: '0.5rem',
                                      borderRadius: '4px',
                                      marginTop: '0.5rem',
                                      overflow: 'auto',
                                      maxHeight: '150px'
                                    }}>
                                      {error.stack_trace}
                                    </pre>
                                  </details>
                                )}
                                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                                  {formatDate(error.created_at)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {(!executionDetails[exec.id] || (!executionDetails[exec.id].logs?.length && !executionDetails[exec.id].errors?.length && !executionDetails[exec.id].syncedItems?.length)) && (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
                          Loading execution details...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))} {executions.length === 0 && (
              <div className="empty-state-small">
                <Clock size={32} />
                <p>No executions yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            maxWidth: '900px',
            width: '90%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>
                  Preview Sync
                </h2>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                  Review what will be synced before execution
                </p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            {/* Summary Stats */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid #e5e7eb',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#3b82f6' }}>
                  {previewData.summary?.total || 0}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Total Items
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#10b981' }}>
                  {previewData.summary?.willCreate || 0}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Will Create
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f59e0b' }}>
                  {previewData.summary?.willUpdate || 0}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Will Update
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#ef4444' }}>
                  {previewData.summary?.errors || 0}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Errors
                </div>
              </div>
            </div>

            {/* Items List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1.5rem'
            }}>
              {previewData.items && previewData.items.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {previewData.items.map((item, idx) => (
                    <div key={idx} style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1rem',
                      background: item.action === 'error' ? '#fef2f2' : '#f9fafb'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '9999px',
                              background: item.action === 'create' ? '#dcfce7' : item.action === 'update' ? '#fef3c7' : '#fee2e2',
                              color: item.action === 'create' ? '#166534' : item.action === 'update' ? '#92400e' : '#991b1b'
                            }}>
                              {item.action === 'create' ? 'CREATE' : item.action === 'update' ? 'UPDATE' : 'ERROR'}
                            </span>
                            <strong style={{ fontSize: '0.875rem', color: '#374151' }}>
                              ID: {item.sourceId}
                            </strong>
                            {item.sourceType && (
                              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                ({item.sourceType})
                              </span>
                            )}
                          </div>
                          {item.title && (
                            <div style={{ fontSize: '0.875rem', color: '#111827', fontWeight: '500', marginBottom: '0.5rem' }}>
                              {item.title}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {item.error && (
                        <div style={{
                          padding: '0.75rem',
                          background: '#fee2e2',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          color: '#991b1b'
                        }}>
                          {item.error}
                        </div>
                      )}
                      
                      {item.mappedFields && Object.keys(item.mappedFields).length > 0 && (
                        <details style={{ marginTop: '0.75rem' }}>
                          <summary style={{
                            fontSize: '0.875rem',
                            color: '#6b7280',
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}>
                            View mapped fields ({Object.keys(item.mappedFields).length})
                          </summary>
                          <div style={{
                            marginTop: '0.5rem',
                            padding: '0.75rem',
                            background: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            fontSize: '0.8125rem',
                            maxHeight: '200px',
                            overflowY: 'auto'
                          }}>
                            {Object.entries(item.mappedFields).map(([key, value]) => (
                              <div key={key} style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 2fr',
                                gap: '0.5rem',
                                padding: '0.5rem 0',
                                borderBottom: '1px solid #f3f4f6'
                              }}>
                                <strong style={{ color: '#374151' }}>{key}:</strong>
                                <span style={{ color: '#6b7280', wordBreak: 'break-word' }}>
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                  <Clock size={48} style={{ margin: '0 auto 1rem' }} />
                  <p style={{ fontSize: '1rem', margin: 0 }}>No items to sync</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1.5rem',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '1rem'
            }}>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  padding: '0.625rem 1.25rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              {(() => {
                const validItems = previewData.items?.filter(item => item.action !== 'error') || [];
                const hasNoValidItems = validItems.length === 0;
                return (
                  <button
                    onClick={() => executeFromPreview()}
                    disabled={hasNoValidItems}
                    style={{
                      padding: '0.625rem 1.25rem',
                      border: 'none',
                      borderRadius: '6px',
                      background: hasNoValidItems ? '#d1d5db' : '#3b82f6',
                      color: 'white',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: hasNoValidItems ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <Play size={16} />
                    Execute Sync
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Monitoring;
