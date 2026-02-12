import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Clock, Play, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
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
      const res = await executeApi.getExecutionHistory(configId, 100);
      setExecutions(res.data.executions || []);
    } catch (error) {
      console.error('Error loading executions:', error);
      setExecutions([]);
    }
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
          <button className="btn-secondary" onClick={() => loadExecutions(selectedConfig)}>
            <RefreshCw size={16} />
            Refresh
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
    </div>
  );
};

export default Monitoring;
