import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Mail, RefreshCw, Send } from 'lucide-react';
import { notificationApi, syncConfigApi } from '../services/api';
import './Page.css';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    sync_config_id: '',
    notification_type: 'email',
    event_triggers: ['sync_completed', 'sync_failed'],
    recipients: '',
    is_active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [notificationsRes, configsRes] = await Promise.all([
        notificationApi.getNotifications(),
        syncConfigApi.getSyncConfigs()
      ]);
      setNotifications(notificationsRes.data.notifications || []);
      setConfigs(configsRes.data.configs || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...form,
        recipients: form.recipients.split(',').map(r => r.trim())
      };
      await notificationApi.createNotification(data);
      await loadData();
      setShowForm(false);
      resetForm();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const deleteNotification = async (id) => {
    if (!confirm('Delete this notification?')) return;
    try {
      await notificationApi.deleteNotification(id);
      await loadData();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const testEmail = async () => {
    const email = prompt('Enter email address to test:');
    if (!email) return;
    try {
      await notificationApi.testConfiguration([email]);
      alert('Test email sent! Check your inbox.');
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const resetForm = () => {
    setForm({
      sync_config_id: '',
      notification_type: 'email',
      event_triggers: ['sync_completed', 'sync_failed'],
      recipients: '',
      is_active: true
    });
  };

  const toggleEvent = (event) => {
    setForm(prev => ({
      ...prev,
      event_triggers: prev.event_triggers.includes(event)
        ? prev.event_triggers.filter(e => e !== event)
        : [...prev.event_triggers, event]
    }));
  };

  if (loading) {
    return <div className="page"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p className="subtitle">Configure email notifications</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={testEmail}>
            <Send size={16} />
            Test Email
          </button>
          <button className="btn-refresh" onClick={loadData}>
            <RefreshCw size={16} />
            Refresh
          </button>
          {!showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={16} />
              Add Notification
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="form-card">
          <h3>Create Notification</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Sync Configuration</label>
              <select
                value={form.sync_config_id}
                onChange={e => setForm({ ...form, sync_config_id: e.target.value })}
              >
                <option value="">All Configurations</option>
                {configs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <small className="form-hint">Leave empty for global notifications</small>
            </div>

            <div className="form-group">
              <label>Event Triggers</label>
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.event_triggers.includes('sync_completed')}
                    onChange={() => toggleEvent('sync_completed')}
                  />
                  <span>Sync Completed</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.event_triggers.includes('sync_failed')}
                    onChange={() => toggleEvent('sync_failed')}
                  />
                  <span>Sync Failed</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.event_triggers.includes('conflict_detected')}
                    onChange={() => toggleEvent('conflict_detected')}
                  />
                  <span>Conflict Detected</span>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>Recipients (comma-separated) *</label>
              <input
                type="text"
                value={form.recipients}
                onChange={e => setForm({ ...form, recipients: e.target.value })}
                placeholder="admin@example.com, team@example.com"
                required
              />
            </div>

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
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="page-content">
        {notifications.length === 0 ? (
          <div className="empty-state">
            <Mail size={48} />
            <p>No notifications configured</p>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={16} />
              Add First Notification
            </button>
          </div>
        ) : (
          <div className="notification-list">
            {notifications.map(notification => (
              <div key={notification.id} className="notification-item">
                <div className="notification-header">
                  <Mail size={20} />
                  <div>
                    <h4>{notification.sync_config_id ? configs.find(c => c.id == notification.sync_config_id)?.name || 'Unknown Config' : 'All Configurations'}</h4>
                    <span className="notification-type">{notification.notification_type}</span>
                  </div>
                  <span className={`status-badge ${notification.is_active ? 'active' : 'inactive'}`}>
                    {notification.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="notification-details">
                  <div>
                    <strong>Events:</strong> {(notification.event_triggers || []).join(', ')}
                  </div>
                  <div>
                    <strong>Recipients:</strong> {(notification.recipients || []).join(', ')}
                  </div>
                </div>
                <div className="notification-actions">
                  <button className="btn-icon-action danger" onClick={() => deleteNotification(notification.id)}>
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

export default Notifications;
