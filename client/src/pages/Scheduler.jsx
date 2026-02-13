import React, { useState, useEffect } from 'react';
import { Play, Square, Clock, RefreshCw, Activity, Heart } from 'lucide-react';
import { schedulerApi, syncConfigApi, jobQueueApi } from '../services/api';
import './Page.css';

const Scheduler = () => {
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [queueStatus, setQueueStatus] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rateLimited, setRateLimited] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 30 seconds, pausing when tab is hidden
    let intervalId = null;
    
    const startInterval = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        loadData().catch(err => {
          console.error('Auto-refresh failed:', err);
        });
      }, 30000);
    };
    
    const stopInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startInterval();
      } else {
        stopInterval();
      }
    };
    
    // Start interval and listen for visibility changes
    startInterval();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setRateLimited(false);
      const [schedulerRes, queueRes, configsRes] = await Promise.all([
        schedulerApi.getStatus(),
        jobQueueApi.getQueueStatus(),
        syncConfigApi.getSyncConfigs()
      ]);
      setSchedulerStatus(schedulerRes.data.scheduler);
      setQueueStatus(queueRes.data.queue);
      setConfigs(configsRes.data.configs || []);
      setLastRefresh(Date.now());
    } catch (error) {
      console.error('Error loading scheduler data:', error);
      // Check if it's a rate limit error
      if (error.response?.status === 429) {
        setRateLimited(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = () => {
    // Debounce: prevent refresh if less than 2 seconds since last refresh
    const timeSinceLastRefresh = Date.now() - lastRefresh;
    if (timeSinceLastRefresh < 2000) {
      // Visual feedback - button is temporarily disabled in UI
      return;
    }
    loadData();
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
    // Create a custom modal for schedule selection
    const scheduleOptions = [
      { label: 'Every minute', value: '* * * * *', description: 'Runs every minute (testing)' },
      { label: 'Every 5 minutes', value: '*/5 * * * *', description: 'Runs every 5 minutes' },
      { label: 'Every 15 minutes', value: '*/15 * * * *', description: 'Runs every 15 minutes' },
      { label: 'Every 30 minutes', value: '*/30 * * * *', description: 'Runs every 30 minutes' },
      { label: 'Every hour', value: '0 * * * *', description: 'Runs at the start of every hour' },
      { label: 'Every 3 hours', value: '0 */3 * * *', description: 'Runs every 3 hours' },
      { label: 'Every 6 hours', value: '0 */6 * * *', description: 'Runs every 6 hours' },
      { label: 'Daily at midnight', value: '0 0 * * *', description: 'Runs once per day at 00:00' },
      { label: 'Daily at 9 AM', value: '0 9 * * *', description: 'Runs once per day at 09:00' },
      { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5', description: 'Runs Monday-Friday at 09:00' },
      { label: 'Custom', value: 'custom', description: 'Enter your own cron expression' }
    ];

    let selectedSchedule = scheduleOptions[0].value;
    let customCron = '';

    const optionsHtml = scheduleOptions.map((opt, idx) => 
      `<option value="${opt.value}" ${idx === 0 ? 'selected' : ''}>${opt.label} - ${opt.description}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000';
    modal.innerHTML = `
      <div style="background:white;padding:2rem;border-radius:12px;max-width:500px;width:90%;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1)">
        <h3 style="margin:0 0 1rem 0;font-size:1.25rem;color:#1f2937">Schedule Sync</h3>
        <div style="margin-bottom:1.5rem">
          <label style="display:block;margin-bottom:0.5rem;font-weight:500;color:#374151;font-size:0.875rem">Select Schedule</label>
          <select id="scheduleSelect" style="width:100%;padding:0.625rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.875rem;color:#1f2937">
            ${optionsHtml}
          </select>
        </div>
        <div id="customCronField" style="display:none;margin-bottom:1.5rem">
          <label style="display:block;margin-bottom:0.5rem;font-weight:500;color:#374151;font-size:0.875rem">Custom Cron Expression</label>
          <input type="text" id="customCronInput" placeholder="* * * * *" style="width:100%;padding:0.625rem;border:1px solid #d1d5db;border-radius:6px;font-family:monospace;font-size:0.875rem" />
          <small style="display:block;margin-top:0.25rem;color:#6b7280;font-size:0.75rem">Format: minute hour day month weekday</small>
        </div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end">
          <button id="cancelBtn" style="padding:0.625rem 1.25rem;border:1px solid #d1d5db;background:white;border-radius:6px;cursor:pointer;font-size:0.875rem;font-weight:500;color:#374151">Cancel</button>
          <button id="confirmBtn" style="padding:0.625rem 1.25rem;border:none;background:#3b82f6;color:white;border-radius:6px;cursor:pointer;font-size:0.875rem;font-weight:500">Schedule</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const select = modal.querySelector('#scheduleSelect');
    const customField = modal.querySelector('#customCronField');
    const customInput = modal.querySelector('#customCronInput');

    select.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        customField.style.display = 'block';
        selectedSchedule = 'custom';
      } else {
        customField.style.display = 'none';
        selectedSchedule = e.target.value;
      }
    });

    customInput.addEventListener('input', (e) => {
      customCron = e.target.value;
    });

    const promise = new Promise((resolve, reject) => {
      modal.querySelector('#cancelBtn').onclick = () => {
        document.body.removeChild(modal);
        reject(new Error('Cancelled'));
      };

      modal.querySelector('#confirmBtn').onclick = () => {
        const finalCron = selectedSchedule === 'custom' ? customCron : selectedSchedule;
        document.body.removeChild(modal);
        resolve(finalCron);
      };

      modal.onclick = (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
          reject(new Error('Cancelled'));
        }
      };
    });

    try {
      const cron = await promise;
      if (!cron) return;
      
      await schedulerApi.scheduleSync(configId, cron);
      await loadData();
    } catch (error) {
      if (error.message === 'Cancelled') return;
      const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      alert('Error scheduling sync:\n\n' + errorMsg);
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
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const getCronDescription = (cronExpression) => {
    if (!cronExpression) return 'Not scheduled';
    
    const descriptions = {
      '* * * * *': 'Every minute',
      '*/5 * * * *': 'Every 5 minutes',
      '*/10 * * * *': 'Every 10 minutes',
      '*/15 * * * *': 'Every 15 minutes',
      '*/30 * * * *': 'Every 30 minutes',
      '0 * * * *': 'Every hour',
      '0 */2 * * *': 'Every 2 hours',
      '0 */3 * * *': 'Every 3 hours',
      '0 */6 * * *': 'Every 6 hours',
      '0 0 * * *': 'Daily at midnight',
      '0 9 * * *': 'Daily at 9 AM',
      '0 9 * * 1-5': 'Weekdays at 9 AM',
      '0 0 * * 0': 'Weekly on Sunday',
      '0 0 1 * *': 'Monthly on 1st'
    };
    
    return descriptions[cronExpression] || cronExpression;
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
        <button className="btn-refresh" onClick={handleManualRefresh} disabled={rateLimited || (Date.now() - lastRefresh < 2000)}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {rateLimited && (
        <div style={{
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          color: '#92400e',
          fontSize: '0.875rem'
        }}>
          ⚠️ Rate limit reached. Please wait a moment before refreshing again.
        </div>
      )}

      <div className="page-content">
        <div className="scheduler-overview">
          <div className="scheduler-status-card">
            <div className="status-header">
              <div className="status-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {getHealthStatusIcon(schedulerStatus?.status)}
                  <div>
                    <h3>Scheduler Status</h3>
                    <div className="status-badge" style={{ 
                      background: getHealthStatusColor(schedulerStatus?.status) + '20',
                      color: getHealthStatusColor(schedulerStatus?.status),
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      marginTop: '0.25rem',
                      display: 'inline-block'
                    }}>
                      {schedulerStatus?.status ? schedulerStatus.status.charAt(0).toUpperCase() + schedulerStatus.status.slice(1) : 'Unknown'}
                    </div>
                  </div>
                </div>
              </div>
              <button 
                className={`btn-toggle ${schedulerStatus?.isRunning ? 'active' : ''}`}
                onClick={toggleScheduler}
              >
                {schedulerStatus?.isRunning ? <Square size={16} /> : <Play size={16} />}
                {schedulerStatus?.isRunning ? 'Stop' : 'Start'}
              </button>
            </div>
            
            <div className="status-details">
              <div className="status-item">
                <Clock size={18} color="#6b7280" />
                <div>
                  <div className="status-label">Scheduled Jobs</div>
                  <div className="status-value">{schedulerStatus?.jobCount || 0}</div>
                </div>
              </div>
              
              {schedulerStatus?.isRunning && schedulerStatus?.lastHeartbeat && (
                <div className="status-item">
                  <Heart size={18} color="#10b981" />
                  <div>
                    <div className="status-label">Last Heartbeat</div>
                    <div className="status-value">{formatDuration(schedulerStatus?.heartbeatAgeSeconds)}</div>
                    <div className="status-timestamp">{formatDate(schedulerStatus?.lastHeartbeat)}</div>
                  </div>
                </div>
              )}
              
              <div className="status-item">
                <Activity size={18} color="#6b7280" />
                <div>
                  <div className="status-label">Active Jobs</div>
                  <div className="status-value">{queueStatus?.activeJobs || 0}</div>
                </div>
              </div>
              
              <div className="status-item">
                <RefreshCw size={18} color="#6b7280" />
                <div>
                  <div className="status-label">Queued Jobs</div>
                  <div className="status-value">{queueStatus?.queuedJobs || 0}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="config-schedule-list">
          <h3>Scheduled Configurations</h3>
          {configs.filter(c => c.schedule_cron).length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem', 
              color: '#6b7280',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px dashed #d1d5db'
            }}>
              No scheduled configurations. Click "Schedule" on any configuration to set up automatic syncing.
            </div>
          )}
          {configs.map(config => {
            if (!config.schedule_cron) return null;
            
            // Find job details from scheduler status (compare as strings to handle type mismatch)
            const jobDetails = schedulerStatus?.jobs?.find(j => String(j.configId) === String(config.id));
            
            return (
              <div key={config.id} className="schedule-item-enhanced">
                <div className="schedule-header">
                  <h4>{config.name}</h4>
                  <button className="btn-secondary" onClick={() => unscheduleConfig(config.id)}>
                    Unschedule
                  </button>
                </div>
                
                <div className="schedule-details">
                  <div className="schedule-detail-item">
                    <Clock size={16} color="#6b7280" />
                    <div>
                      <span className="detail-label">Schedule</span>
                      <div className="detail-value" style={{ marginBottom: '0.25rem' }}>{getCronDescription(config.schedule_cron)}</div>
                      <code className="cron-expression" style={{ fontSize: '0.75rem', opacity: 0.7 }}>{config.schedule_cron}</code>
                    </div>
                  </div>
                  
                  {jobDetails?.lastRun && (
                    <div className="schedule-detail-item">
                      <Activity size={16} color="#10b981" />
                      <div>
                        <span className="detail-label">Last Execution</span>
                        <span className="detail-value">{formatDate(jobDetails.lastRun)}</span>
                      </div>
                    </div>
                  )}
                  
                  {jobDetails?.nextRun && (
                    <div className="schedule-detail-item">
                      <RefreshCw size={16} color="#3b82f6" />
                      <div>
                        <span className="detail-label">Next Execution</span>
                        <span className="detail-value">{formatDate(jobDetails.nextRun)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          <div style={{ marginTop: '2rem' }}>
            <h3>Available Configurations</h3>
            {configs.filter(c => !c.schedule_cron).length === 0 ? (
              <div style={{ 
                padding: '1rem', 
                color: '#6b7280',
                fontSize: '0.875rem',
                fontStyle: 'italic'
              }}>
                All configurations are scheduled.
              </div>
            ) : (
              configs.filter(c => !c.schedule_cron).map(config => (
                <div key={config.id} className="schedule-item">
                  <div className="schedule-info">
                    <h4>{config.name}</h4>
                    <span className="no-schedule">Not scheduled</span>
                  </div>
                  <div className="schedule-actions">
                    <button className="btn-primary" onClick={() => scheduleConfig(config.id)}>
                      <Clock size={16} />
                      Schedule
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Scheduler;
