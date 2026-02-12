import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Mail, 
  Server, 
  Save, 
  RefreshCw,
  Send,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { settingsApi } from '../services/api';
import './Page.css';

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState('smtp'); // smtp, general
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState(null);
  
  const [smtpSettings, setSmtpSettings] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: 'false',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: ''
  });

  const [generalSettings, setGeneralSettings] = useState({
    max_concurrent_syncs: 5,
    sync_batch_size: 100,
    log_retention_days: 90,
    conflict_resolution_default: 'last-write-wins'
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await settingsApi.getSettings();
      const settings = res.data.settings;
      
      // Load SMTP settings
      setSmtpSettings({
        smtp_host: settings.smtp_host?.value || '',
        smtp_port: settings.smtp_port?.value || '587',
        smtp_secure: String(settings.smtp_secure?.value || 'false'),
        smtp_user: settings.smtp_user?.value || '',
        smtp_pass: settings.smtp_pass?.value || '',
        smtp_from: settings.smtp_from?.value || ''
      });

      // Load general settings
      setGeneralSettings({
        max_concurrent_syncs: settings.max_concurrent_syncs?.value || 5,
        sync_batch_size: settings.sync_batch_size?.value || 100,
        log_retention_days: settings.log_retention_days?.value || 90,
        conflict_resolution_default: settings.conflict_resolution_default?.value || 'last-write-wins'
      });
    } catch (error) {
      console.error('Error loading settings:', error);
      alert('Error loading settings: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const saveSmtpSettings = async () => {
    try {
      setSaving(true);
      
      const settingsToUpdate = {
        smtp_host: { value: smtpSettings.smtp_host, value_type: 'string', description: 'SMTP server hostname' },
        smtp_port: { value: smtpSettings.smtp_port, value_type: 'string', description: 'SMTP server port' },
        smtp_secure: { value: smtpSettings.smtp_secure, value_type: 'boolean', description: 'Use TLS/SSL' },
        smtp_user: { value: smtpSettings.smtp_user, value_type: 'string', description: 'SMTP username' },
        smtp_pass: { value: smtpSettings.smtp_pass, value_type: 'string', description: 'SMTP password' },
        smtp_from: { value: smtpSettings.smtp_from, value_type: 'string', description: 'From email address' }
      };
      
      await settingsApi.updateSettings(settingsToUpdate);
      alert('✓ SMTP settings saved successfully!');
      setTestResult(null);
    } catch (error) {
      console.error('Error saving SMTP settings:', error);
      alert('Error saving settings: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const saveGeneralSettings = async () => {
    try {
      setSaving(true);
      
      const settingsToUpdate = {
        max_concurrent_syncs: { value: generalSettings.max_concurrent_syncs, value_type: 'int', description: 'Maximum concurrent syncs' },
        sync_batch_size: { value: generalSettings.sync_batch_size, value_type: 'int', description: 'Sync batch size' },
        log_retention_days: { value: generalSettings.log_retention_days, value_type: 'int', description: 'Log retention in days' },
        conflict_resolution_default: { value: generalSettings.conflict_resolution_default, value_type: 'string', description: 'Default conflict resolution strategy' }
      };
      
      await settingsApi.updateSettings(settingsToUpdate);
      alert('✓ General settings saved successfully!');
    } catch (error) {
      console.error('Error saving general settings:', error);
      alert('Error saving settings: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const testSmtpConnection = async () => {
    if (!testEmail) {
      alert('Please enter an email address to test');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      
      await settingsApi.testSmtp(testEmail);
      setTestResult({ success: true, message: 'Test email sent successfully! Check your inbox.' });
    } catch (error) {
      console.error('Error testing SMTP:', error);
      setTestResult({ 
        success: false, 
        message: error.response?.data?.message || error.message || 'Failed to send test email'
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>System Settings</h1>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <RefreshCw size={32} className="spin" style={{ color: '#3b82f6', marginBottom: '1rem' }} />
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-content">
          <div className="header-icon">
            <SettingsIcon size={28} />
          </div>
          <div>
            <h1>System Settings</h1>
            <p>Configure system-wide settings and integrations</p>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Tabs */}
        <div style={{ borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <button
              onClick={() => setActiveTab('smtp')}
              style={{
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'smtp' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'smtp' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'smtp' ? '600' : '400',
                cursor: 'pointer',
                marginBottom: '-2px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Mail size={18} />
              Email / SMTP
            </button>
            <button
              onClick={() => setActiveTab('general')}
              style={{
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'general' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'general' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'general' ? '600' : '400',
                cursor: 'pointer',
                marginBottom: '-2px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Server size={18} />
              General
            </button>
          </div>
        </div>

        {/* SMTP Settings Tab */}
        {activeTab === 'smtp' && (
          <div>
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e40af' }}>
                <strong>Note:</strong> Configure SMTP settings to enable email notifications for sync events. 
                You can use SMTP providers like SendGrid, Gmail, Outlook, or your own SMTP server.
              </p>
            </div>

            <div className="form-group">
              <label>SMTP Host *</label>
              <input
                type="text"
                value={smtpSettings.smtp_host}
                onChange={e => setSmtpSettings({ ...smtpSettings, smtp_host: e.target.value })}
                placeholder="smtp.sendgrid.net or smtp.gmail.com"
                className="form-control"
              />
              <small style={{ display: 'block', marginTop: '0.5rem', color: '#6b7280' }}>
                Examples: smtp.sendgrid.net, smtp.gmail.com, smtp.office365.com
              </small>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label>Port *</label>
                <input
                  type="number"
                  value={smtpSettings.smtp_port}
                  onChange={e => setSmtpSettings({ ...smtpSettings, smtp_port: e.target.value })}
                  className="form-control"
                />
                <small style={{ display: 'block', marginTop: '0.5rem', color: '#6b7280' }}>
                  Common: 587 (TLS), 465 (SSL), 25 (plain)
                </small>
              </div>

              <div className="form-group">
                <label>Use TLS/SSL</label>
                <select
                  value={smtpSettings.smtp_secure}
                  onChange={e => setSmtpSettings({ ...smtpSettings, smtp_secure: e.target.value })}
                  className="form-control"
                >
                  <option value="false">No (STARTTLS)</option>
                  <option value="true">Yes (TLS/SSL)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Username / API Key *</label>
              <input
                type="text"
                value={smtpSettings.smtp_user}
                onChange={e => setSmtpSettings({ ...smtpSettings, smtp_user: e.target.value })}
                placeholder="username or API key"
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label>Password / API Secret *</label>
              <input
                type="password"
                value={smtpSettings.smtp_pass}
                onChange={e => setSmtpSettings({ ...smtpSettings, smtp_pass: e.target.value })}
                placeholder="password or API secret"
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label>From Email Address *</label>
              <input
                type="email"
                value={smtpSettings.smtp_from}
                onChange={e => setSmtpSettings({ ...smtpSettings, smtp_from: e.target.value })}
                placeholder="noreply@example.com"
                className="form-control"
              />
            </div>

            {/* Test SMTP */}
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>Test Configuration</h3>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                Send a test email to verify your SMTP configuration works correctly.
              </p>
              
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="Enter email address to test"
                  className="form-control"
                  style={{ flex: 1 }}
                />
                <button
                  onClick={testSmtpConnection}
                  disabled={testing || !smtpSettings.smtp_host}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
                >
                  {testing ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Send Test
                    </>
                  )}
                </button>
              </div>

              {testResult && (
                <div style={{ 
                  padding: '0.75rem', 
                  background: testResult.success ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${testResult.success ? '#86efac' : '#fca5a5'}`,
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {testResult.success ? (
                    <CheckCircle size={18} style={{ color: '#16a34a' }} />
                  ) : (
                    <XCircle size={18} style={{ color: '#dc2626' }} />
                  )}
                  <span style={{ 
                    fontSize: '0.875rem', 
                    color: testResult.success ? '#16a34a' : '#dc2626' 
                  }}>
                    {testResult.message}
                  </span>
                </div>
              )}
            </div>

            {/* Save Button */}
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={saveSmtpSettings}
                disabled={saving}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {saving ? (
                  <>
                    <RefreshCw size={18} className="spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save SMTP Settings
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* General Settings Tab */}
        {activeTab === 'general' && (
          <div>
            <div className="form-group">
              <label>Maximum Concurrent Syncs</label>
              <input
                type="number"
                value={generalSettings.max_concurrent_syncs}
                onChange={e => setGeneralSettings({ ...generalSettings, max_concurrent_syncs: parseInt(e.target.value, 10) })}
                min="1"
                max="20"
                className="form-control"
                style={{ maxWidth: '200px' }}
              />
              <small style={{ display: 'block', marginTop: '0.5rem', color: '#6b7280' }}>
                Maximum number of syncs that can run simultaneously (1-20)
              </small>
            </div>

            <div className="form-group">
              <label>Sync Batch Size</label>
              <input
                type="number"
                value={generalSettings.sync_batch_size}
                onChange={e => setGeneralSettings({ ...generalSettings, sync_batch_size: parseInt(e.target.value, 10) })}
                min="10"
                max="1000"
                className="form-control"
                style={{ maxWidth: '200px' }}
              />
              <small style={{ display: 'block', marginTop: '0.5rem', color: '#6b7280' }}>
                Number of work items to process in each batch (10-1000)
              </small>
            </div>

            <div className="form-group">
              <label>Log Retention Days</label>
              <input
                type="number"
                value={generalSettings.log_retention_days}
                onChange={e => setGeneralSettings({ ...generalSettings, log_retention_days: parseInt(e.target.value, 10) })}
                min="7"
                max="365"
                className="form-control"
                style={{ maxWidth: '200px' }}
              />
              <small style={{ display: 'block', marginTop: '0.5rem', color: '#6b7280' }}>
                Number of days to retain sync execution logs (7-365)
              </small>
            </div>

            <div className="form-group">
              <label>Default Conflict Resolution</label>
              <select
                value={generalSettings.conflict_resolution_default}
                onChange={e => setGeneralSettings({ ...generalSettings, conflict_resolution_default: e.target.value })}
                className="form-control"
                style={{ maxWidth: '300px' }}
              >
                <option value="last-write-wins">Last Write Wins</option>
                <option value="source-priority">Source Priority</option>
                <option value="target-priority">Target Priority</option>
                <option value="manual">Manual Resolution Required</option>
              </select>
              <small style={{ display: 'block', marginTop: '0.5rem', color: '#6b7280' }}>
                Default strategy for automatic conflict resolution
              </small>
            </div>

            {/* Save Button */}
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={saveGeneralSettings}
                disabled={saving}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {saving ? (
                  <>
                    <RefreshCw size={18} className="spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save General Settings
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
