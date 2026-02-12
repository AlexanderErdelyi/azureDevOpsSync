import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Clock, Play, AlertCircle } from 'lucide-react';
import { syncConfigApi, executeApi } from '../services/api';
import './Page.css';

const Monitoring = () => {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

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
      setExecutions(res.data.history || []);
    } catch (error) {
      console.error('Error loading executions:', error);
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
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
                    <span className="execution-time">{formatDate(exec.created_at)}</span>
                  </div>
                  <div className="execution-stats">
                    <span>Synced: {exec.items_synced || 0}</span>
                    <span>Failed: {exec.items_failed || 0}</span>
                    <span>Duration: {formatDuration(exec.duration_ms)}</span>
                  </div>
                  {exec.error_message && (
                    <div className="execution-error">{exec.error_message}</div>
                  )}
                </div>
              </div>
            ))}
            {executions.length === 0 && (
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
