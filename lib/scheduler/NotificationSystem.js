/**
 * Notification System - Send email alerts for sync events
 * 
 * Handles:
 * - Email notifications on sync completion/failure
 * - Configurable notification settings per sync config
 * - Event-based triggers (sync_completed, sync_failed, conflict_detected)
 */

const nodemailer = require('nodemailer');
const { db } = require('../../database/db');

class NotificationSystem {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
  }

  /**
   * Initialize email transporter
   * @param {Object} config - SMTP configuration
   */
  configure(config) {
    const {
      host = process.env.SMTP_HOST,
      port = process.env.SMTP_PORT || 587,
      secure = process.env.SMTP_SECURE === 'true',
      user = process.env.SMTP_USER,
      pass = process.env.SMTP_PASS,
      from = process.env.SMTP_FROM || 'noreply@sync-platform.local'
    } = config || {};

    if (!host || !user || !pass) {
      console.log('NotificationSystem: SMTP not configured. Email notifications disabled.');
      console.log('  Set environment variables: SMTP_HOST, SMTP_USER, SMTP_PASS');
      this.isConfigured = false;
      return;
    }

    this.transporter = nodemailer.createTransporter({
      host,
      port: parseInt(port),
      secure,
      auth: {
        user,
        pass
      }
    });

    this.fromAddress = from;
    this.isConfigured = true;

    console.log(`NotificationSystem: Configured with SMTP ${host}:${port}`);
  }

  /**
   * Send notification for an event
   * @param {string} eventType - Event type (sync_completed, sync_failed, etc.)
   * @param {Object} eventData - Event data
   */
  async sendNotifications(eventType, eventData) {
    try {
      // Get notification settings for this event
      const settings = await db('notification_settings')
        .where({ is_active: 1 })
        .whereRaw(`json_extract(event_triggers, '$') LIKE '%${eventType}%'`);

      if (eventData.syncConfigId) {
        // Also get config-specific settings
        const configSettings = await db('notification_settings')
          .where({ sync_config_id: eventData.syncConfigId, is_active: 1 })
          .whereRaw(`json_extract(event_triggers, '$') LIKE '%${eventType}%'`);
        
        settings.push(...configSettings);
      }

      if (settings.length === 0) {
        console.log(`NotificationSystem: No active notifications for event ${eventType}`);
        return;
      }

      console.log(`NotificationSystem: Sending ${settings.length} notification(s) for ${eventType}`);

      // Send each notification
      for (const setting of settings) {
        try {
          switch (setting.notification_type) {
            case 'email':
              await this.sendEmail(setting, eventType, eventData);
              break;
            // Future: case 'slack', 'teams', 'webhook'
            default:
              console.log(`NotificationSystem: Unsupported notification type: ${setting.notification_type}`);
          }
        } catch (error) {
          console.error(`NotificationSystem: Error sending notification ${setting.id}:`, error);
        }
      }

    } catch (error) {
      console.error('NotificationSystem: Error sending notifications:', error);
    }
  }

  /**
   * Send email notification
   * @param {Object} setting - Notification setting
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   */
  async sendEmail(setting, eventType, eventData) {
    if (!this.isConfigured) {
      console.log('NotificationSystem: Email not configured, skipping...');
      return;
    }

    const recipients = typeof setting.recipients === 'string' 
      ? JSON.parse(setting.recipients) 
      : setting.recipients;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      console.log('NotificationSystem: No recipients configured');
      return;
    }

    const { subject, body } = this.buildEmailContent(eventType, eventData);

    const mailOptions = {
      from: this.fromAddress,
      to: recipients.join(', '),
      subject,
      html: body,
      text: body.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`NotificationSystem: Email sent to ${recipients.length} recipient(s): ${info.messageId}`);
    } catch (error) {
      console.error('NotificationSystem: Error sending email:', error);
      throw error;
    }
  }

  /**
   * Build email content based on event type
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   * @returns {Object} Email subject and body
   */
  buildEmailContent(eventType, eventData) {
    const {
      syncConfigId,
      syncConfigName,
      executionId,
      itemsSynced,
      itemsFailed,
      startedAt,
      endedAt,
      errorMessage
    } = eventData;

    let subject, body;

    switch (eventType) {
      case 'sync_completed':
        subject = `✓ Sync Completed: ${syncConfigName}`;
        body = `
          <h2>Sync Completed Successfully</h2>
          <p>Your sync configuration has completed successfully.</p>
          <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
            <tr><th align="left">Configuration:</th><td>${syncConfigName}</td></tr>
            <tr><th align="left">Execution ID:</th><td>${executionId}</td></tr>
            <tr><th align="left">Items Synced:</th><td>${itemsSynced}</td></tr>
            <tr><th align="left">Items Failed:</th><td>${itemsFailed}</td></tr>
            <tr><th align="left">Started:</th><td>${new Date(startedAt).toLocaleString()}</td></tr>
            <tr><th align="left">Completed:</th><td>${new Date(endedAt).toLocaleString()}</td></tr>
            <tr><th align="left">Duration:</th><td>${this.formatDuration(startedAt, endedAt)}</td></tr>
          </table>
          <p><small>This is an automated notification from the Multi-Connector Sync Platform.</small></p>
        `;
        break;

      case 'sync_failed':
        subject = `✗ Sync Failed: ${syncConfigName}`;
        body = `
          <h2>Sync Failed</h2>
          <p>Your sync configuration has failed to complete.</p>
          <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
            <tr><th align="left">Configuration:</th><td>${syncConfigName}</td></tr>
            <tr><th align="left">Execution ID:</th><td>${executionId}</td></tr>
            <tr><th align="left">Items Synced:</th><td>${itemsSynced || 0}</td></tr>
            <tr><th align="left">Items Failed:</th><td>${itemsFailed || 0}</td></tr>
            <tr><th align="left">Started:</th><td>${new Date(startedAt).toLocaleString()}</td></tr>
            <tr><th align="left">Failed:</th><td>${new Date(endedAt).toLocaleString()}</td></tr>
            <tr><th align="left">Error:</th><td style="color: red;">${errorMessage || 'Unknown error'}</td></tr>
          </table>
          <p><strong>Action Required:</strong> Please check the execution logs for more details.</p>
          <p><small>This is an automated notification from the Multi-Connector Sync Platform.</small></p>
        `;
        break;

      case 'conflict_detected':
        subject = `⚠ Conflict Detected: ${syncConfigName}`;
        body = `
          <h2>Sync Conflict Detected</h2>
          <p>A conflict was detected during synchronization that requires your attention.</p>
          <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
            <tr><th align="left">Configuration:</th><td>${syncConfigName}</td></tr>
            <tr><th align="left">Execution ID:</th><td>${executionId}</td></tr>
            <tr><th align="left">Item ID:</th><td>${eventData.itemId}</td></tr>
            <tr><th align="left">Conflict Type:</th><td>${eventData.conflictType}</td></tr>
          </table>
          <p><strong>Action Required:</strong> Please resolve this conflict manually.</p>
          <p><small>This is an automated notification from the Multi-Connector Sync Platform.</small></p>
        `;
        break;

      default:
        subject = `Sync Platform Notification: ${syncConfigName}`;
        body = `
          <h2>${eventType}</h2>
          <p>An event occurred for sync configuration: ${syncConfigName}</p>
          <pre>${JSON.stringify(eventData, null, 2)}</pre>
          <p><small>This is an automated notification from the Multi-Connector Sync Platform.</small></p>
        `;
    }

    return { subject, body };
  }

  /**
   * Format duration between two timestamps
   * @param {string|number} start - Start timestamp
   * @param {string|number} end - End timestamp
   * @returns {string} Formatted duration
   */
  formatDuration(start, end) {
    const ms = new Date(end) - new Date(start);
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Test notification configuration
   * @param {Array} recipients - Email recipients
   * @returns {Promise<boolean>} Success status
   */
  async testConfiguration(recipients) {
    if (!this.isConfigured) {
      throw new Error('Email not configured. Set SMTP environment variables.');
    }

    const mailOptions = {
      from: this.fromAddress,
      to: recipients.join(', '),
      subject: 'Test Notification - Multi-Connector Sync Platform',
      html: `
        <h2>Test Notification</h2>
        <p>This is a test email from the Multi-Connector Sync Platform.</p>
        <p>If you received this email, your notification configuration is working correctly.</p>
        <p><small>Time: ${new Date().toLocaleString()}</small></p>
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('NotificationSystem: Test email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('NotificationSystem: Test email failed:', error);
      throw error;
    }
  }
}

// Singleton instance
const notificationSystem = new NotificationSystem();

// Auto-configure on load
notificationSystem.configure();

module.exports = notificationSystem;
