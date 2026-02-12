import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plug, 
  Settings, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock,
  RefreshCw,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { connectorApi, syncConfigApi, executeApi, schedulerApi, jobQueueApi } from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    connectors: { total: 0, active: 0 },
    syncConfigs: { total: 0, scheduled: 0 },
    executions: { today: 0, success: 0, failed: 0 },
    scheduler: { isRunning: false, jobCount: 0 },
    queue: { queuedJobs: 0, activeJobs: 0 }
  });
  const [recentExecutions, setRecentExecutions] = useState([]);
  const [syncConfigs, setSyncConfigs] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load connectors
      const connectorsRes = await connectorApi.getConnectors();
      const connectors = connectorsRes.data.connectors || [];

      // Load sync configs
      const configsRes = await syncConfigApi.getSyncConfigs();
      const configs = configsRes.data.configs || [];
      setSyncConfigs(configs);

      // Load scheduler status
      const schedulerRes = await schedulerApi.getStatus();
      const schedulerData = schedulerRes.data.scheduler || { isRunning: false, jobCount: 0 };

      // Load queue status
      const queueRes = await jobQueueApi.getQueueStatus();
      const queueData = queueRes.data.queue || { queuedJobs: 0, activeJobs: 0 };

      // Load recent executions for all configs
      const executionPromises = configs.slice(0, 5).map(config => 
        executeApi.getExecutionHistory(config.id, 5).catch(() => ({ data: { history: [] } }))
      );
      const executionsResults = await Promise.all(executionPromises);
      
      const allExecutions = executionsResults
        .flatMap(res => res.data.history || [])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10);
      
      setRecentExecutions(allExecutions);

      // Calculate stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayExecutions = allExecutions.filter(e => new Date(e.created_at) >= today);
      
      setStats({
        connectors: {
          total: connectors.length,
          active: connectors.filter(c => c.is_active).length
        },
        syncConfigs: {
          total: configs.length,
          scheduled: configs.filter(c => c.trigger_type === 'scheduled').length
        },
        executions: {
          today: todayExecutions.length,
          success: allExecutions.filter(e => e.status === 'completed').length,
          failed: allExecutions.filter(e => e.status === 'failed').length
        },
        scheduler: schedulerData,
        queue: queueData
      });

    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>Dashboard</h1>
        </div>
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">Overview of your sync platform</p>
        </div>
        <button className="btn-refresh" onClick={loadDashboardData}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#3b82f6' }}>
            <Plug size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.connectors.active}/{stats.connectors.total}</div>
            <div className="stat-label">Active Connectors</div>
            <Link to="/connectors" className="stat-link">
              View all <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#8b5cf6' }}>
            <Settings size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.syncConfigs.total}</div>
            <div className="stat-label">Sync Configurations</div>
            <div className="stat-subtext">{stats.syncConfigs.scheduled} scheduled</div>
            <Link to="/sync-configs" className="stat-link">
              Manage <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: stats.scheduler.isRunning ? '#10b981' : '#6b7280' }}>
            <Clock size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.scheduler.jobCount}</div>
            <div className="stat-label">Scheduled Jobs</div>
            <div className="stat-subtext">
              Scheduler {stats.scheduler.isRunning ? 'running' : 'stopped'}
            </div>
            <Link to="/scheduler" className="stat-link">
              Configure <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f59e0b' }}>
            <Activity size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.queue.activeJobs}/{stats.queue.queuedJobs + stats.queue.activeJobs}</div>
            <div className="stat-label">Active/Queued Jobs</div>
            <Link to="/monitoring" className="stat-link">
              Monitor <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* Execution Stats */}
      <div className="section">
        <h2 className="section-title">Today's Executions</h2>
        <div className="execution-stats">
          <div className="execution-stat success">
            <CheckCircle2 size={20} />
            <div>
              <div className="execution-stat-value">{stats.executions.success}</div>
              <div className="execution-stat-label">Successful</div>
            </div>
          </div>
          <div className="execution-stat failed">
            <XCircle size={20} />
            <div>
              <div className="execution-stat-value">{stats.executions.failed}</div>
              <div className="execution-stat-label">Failed</div>
            </div>
          </div>
          <div className="execution-stat total">
            <TrendingUp size={20} />
            <div>
              <div className="execution-stat-value">{stats.executions.today}</div>
              <div className="execution-stat-label">Total Today</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Sync Configs */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Sync Configurations</h2>
          <Link to="/sync-configs" className="btn-link">View all</Link>
        </div>
        
        {syncConfigs.length === 0 ? (
          <div className="empty-state">
            <Settings size={48} className="empty-icon" />
            <p>No sync configurations yet</p>
            <Link to="/sync-configs" className="btn-primary">Create First Config</Link>
          </div>
        ) : (
          <div className="config-grid">
            {syncConfigs.slice(0, 4).map(config => (
              <div key={config.id} className="config-card">
                <div className="config-header">
                  <h3 className="config-name">{config.name}</h3>
                  <span className={`config-status ${config.is_active ? 'active' : 'inactive'}`}>
                    {config.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="config-info">
                  <div className="config-direction">
                    <span className="connector-name">{config.source_connector_name || `Connector ${config.source_connector_id}`}</span>
                    <ArrowRight size={14} className="direction-arrow" />
                    <span className="connector-name">{config.target_connector_name || `Connector ${config.target_connector_id}`}</span>
                  </div>
                  <div className="config-details">
                    <span className={`trigger-badge ${config.trigger_type}`}>
                      {config.trigger_type === 'scheduled' ? 'Scheduled' : 
                       config.trigger_type === 'webhook' ? 'Webhook' : 'Manual'}
                    </span>
                    {config.schedule_cron && (
                      <span className="cron-info" title={config.schedule_cron}>
                        <Clock size={12} /> {config.schedule_cron}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Executions */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Recent Executions</h2>
          <Link to="/monitoring" className="btn-link">View all</Link>
        </div>
        
        {recentExecutions.length === 0 ? (
          <div className="empty-state-small">
            <Activity size={32} className="empty-icon" />
            <p>No executions yet</p>
          </div>
        ) : (
          <div className="execution-list">
            {recentExecutions.map(execution => (
              <div key={execution.id} className="execution-item">
                <div className="execution-status-icon">
                  {execution.status === 'completed' && <CheckCircle2 size={20} className="status-success" />}
                  {execution.status === 'failed' && <XCircle size={20} className="status-error" />}
                  {execution.status === 'running' && <RefreshCw size={20} className="status-running" />}
                </div>
                <div className="execution-details">
                  <div className="execution-name">
                    Sync Config #{execution.sync_config_id}
                  </div>
                  <div className="execution-meta">
                    {formatDate(execution.created_at)} · 
                    {execution.items_synced || 0} synced · 
                    {execution.items_failed || 0} failed ·
                    {formatDuration(execution.duration_ms)}
                  </div>
                </div>
                <span className={`execution-status-badge status-${execution.status}`}>
                  {execution.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
