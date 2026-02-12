import React, { useState, useEffect } from 'react';
import { Play, Square, Clock, RefreshCw, Activity, Heart } from 'lucide-react';
import { schedulerApi, syncConfigApi, jobQueueApi } from '../services/api';
import './Page.css';

const Scheduler = () => {
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [queueStatus, setQueueStatus] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [schedulerRes, queueRes, configsRes] = await Promise.all([
        schedulerApi.getStatus(),
        jobQueueApi.getQueueStatus(),
        syncConfigApi.getSyncConfigs()
      ]);
      setSchedulerStatus(schedulerRes.data.scheduler);
      setQueueStatus(queueRes.data.queue);
      setConfigs(configsRes.data.configs || []);
    } catch (error) {
      console.error('Error loading scheduler data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleScheduler = async () => {
    try {
      if (schedulerStatus?.isRunning) {
        await schedulerApi.stop();
      } else {
        await schedulerApi.start();
      }
      await loadData();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const scheduleConfig = async (configId) => {
    const cron = prompt('Enter cron expression (e.g., 0 * * * * for hourly):');
    if (!cron) return;
    try {
      await schedulerApi.scheduleSync(configId, cron);
      await loadData();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const unscheduleConfig = async (configId) => {
    try {
      await schedulerApi.unscheduleSync(configId);
      await loadData();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const getHealthStatusColor = (status) => {
    switch (status) {
      case 'healthy': return '#10b981'; // green
      case 'degraded': return '#f59e0b'; // yellow
      case 'stopped': return '#6b7280'; // gray
      default: return '#6b7280';
    }
  };

  const getHealthStatusIcon = (status) => {
    switch (status) {
      case 'healthy': return <Heart size={20} fill="#10b981" color="#10b981" />;
      case 'degraded': return <Activity size={20} color="#f59e0b" />;
      case 'stopped': return <Square size={20} color="#6b7280" />;
      default: return <Activity size={20} color="#6b7280" />;
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined) return 'N/A';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  if (loading) {
    return <div className="page"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Scheduler</h1>
          <p className="subtitle">Manage scheduled sync jobs and monitor health</p>
        </div>
        <button className="btn-refresh" onClick={loadData}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="page-content">
        <div className="stat-cards">
          <div className="stat-card">
            <div className="stat-header">
              <h3>Scheduler Status</h3>
              <button 
                className={`btn-toggle ${schedulerStatus?.isRunning ? 'active' : ''}`}
                onClick={toggleScheduler}
              >
                {schedulerStatus?.isRunning ? <Square size={16} /> : <Play size={16} />}
                {schedulerStatus?.isRunning ? 'Stop' : 'Start'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              {getHealthStatusIcon(schedulerStatus?.status)}
              <div className="stat-value" style={{ color: getHealthStatusColor(schedulerStatus?.status) }}>
                {schedulerStatus?.status ? schedulerStatus.status.charAt(0).toUpperCase() + schedulerStatus.status.slice(1) : 'Unknown'}
              </div>
            </div>
            <div className="stat-label">{schedulerStatus?.jobCount || 0} scheduled jobs</div>
            {schedulerStatus?.isRunning && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <Heart size={14} color="#6b7280" />
                  <span>Last Heartbeat: {formatDuration(schedulerStatus?.heartbeatAgeSeconds)}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '1.75rem' }}>
                  {formatDate(schedulerStatus?.lastHeartbeat)}
                </div>
              </div>
            )}
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <h3>Job Queue</h3>
            </div>
            <div className="stat-grid">
              <div>
                <div className="stat-value">{queueStatus?.activeJobs || 0}</div>
                <div className="stat-label">Active</div>
              </div>
              <div>
                <div className="stat-value">{queueStatus?.queuedJobs || 0}</div>
                <div className="stat-label">Queued</div>
              </div>
            </div>
          </div>
        </div>

        <div className="config-schedule-list">
          <h3>Sync Configurations</h3>
          {configs.map(config => {
            // Find job details from scheduler status
            const jobDetails = schedulerStatus?.jobs?.find(j => j.configId === config.id);
            
            return (
              <div key={config.id} className="schedule-item">
                <div className="schedule-info">
                  <h4>{config.name}</h4>
                  {config.schedule_cron && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <code className="cron-expression">{config.schedule_cron}</code>
                      {jobDetails && (
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                            {jobDetails.lastRun && (
                              <div>
                                <strong style={{ color: '#374151' }}>Last Run:</strong>{' '}
                                {formatDate(jobDetails.lastRun)}
                              </div>
                            )}
                            {jobDetails.nextRun && (
                              <div>
                                <strong style={{ color: '#374151' }}>Next Run:</strong>{' '}
                                {formatDate(jobDetails.nextRun)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {!config.schedule_cron && (
                    <span className="no-schedule">Not scheduled</span>
                  )}
                </div>
                <div className="schedule-actions">
                  {config.schedule_cron ? (
                    <button className="btn-secondary" onClick={() => unscheduleConfig(config.id)}>
                      Unschedule
                    </button>
                  ) : (
                    <button className="btn-primary" onClick={() => scheduleConfig(config.id)}>
                      <Clock size={16} />
                      Schedule
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Scheduler;
