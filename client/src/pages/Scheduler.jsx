import React, { useState, useEffect } from 'react';
import { Play, Square, Clock, RefreshCw } from 'lucide-react';
import { schedulerApi, syncConfigApi, jobQueueApi } from '../services/api';
import './Page.css';

const Scheduler = () => {
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [queueStatus, setQueueStatus] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
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

  if (loading) {
    return <div className="page"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Scheduler</h1>
          <p className="subtitle">Manage scheduled sync jobs</p>
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
            <div className="stat-value">{schedulerStatus?.isRunning ? 'Running' : 'Stopped'}</div>
            <div className="stat-label">{schedulerStatus?.jobCount || 0} scheduled jobs</div>
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
          {configs.map(config => (
            <div key={config.id} className="schedule-item">
              <div className="schedule-info">
                <h4>{config.name}</h4>
                {config.schedule_cron && (
                  <code className="cron-expression">{config.schedule_cron}</code>
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
          ))}
        </div>
      </div>
    </div>
  );
};

export default Scheduler;
