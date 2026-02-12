/**
 * System Settings API Routes
 * Manage system-wide configuration settings
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/db');

/**
 * GET /api/settings
 * Get all system settings or filter by prefix
 */
router.get('/', async (req, res) => {
  try {
    const { prefix } = req.query;
    
    let query = db('system_settings');
    
    if (prefix) {
      query = query.where('key', 'like', `${prefix}%`);
    }
    
    const settings = await query.select('*');
    
    // Parse values based on type
    const parsedSettings = settings.reduce((acc, setting) => {
      let value = setting.value;
      
      switch (setting.value_type) {
        case 'int':
          value = parseInt(value);
          break;
        case 'boolean':
          value = value === 'true' || value === '1';
          break;
        case 'json':
          try {
            value = JSON.parse(value);
          } catch (e) {
            console.error(`Error parsing JSON for ${setting.key}:`, e);
          }
          break;
      }
      
      acc[setting.key] = {
        value,
        description: setting.description,
        value_type: setting.value_type,
        updated_at: setting.updated_at
      };
      
      return acc;
    }, {});
    
    res.json({
      success: true,
      settings: parsedSettings
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get settings',
      message: error.message
    });
  }
});

/**
 * GET /api/settings/:key
 * Get a specific setting
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    const setting = await db('system_settings')
      .where({ key })
      .first();
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'Setting not found'
      });
    }
    
    let value = setting.value;
    
    switch (setting.value_type) {
      case 'int':
        value = parseInt(value);
        break;
      case 'boolean':
        value = value === 'true' || value === '1';
        break;
      case 'json':
        try {
          value = JSON.parse(value);
        } catch (e) {
          console.error(`Error parsing JSON for ${setting.key}:`, e);
        }
        break;
    }
    
    res.json({
      success: true,
      setting: {
        key: setting.key,
        value,
        description: setting.description,
        value_type: setting.value_type,
        updated_at: setting.updated_at
      }
    });
  } catch (error) {
    console.error('Error getting setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get setting',
      message: error.message
    });
  }
});

/**
 * PUT /api/settings
 * Update multiple settings at once
 */
router.put('/', async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid settings object'
      });
    }
    
    // Update each setting
    for (const [key, data] of Object.entries(settings)) {
      let value = data.value;
      const valueType = data.value_type || 'string';
      const description = data.description || '';
      
      // Convert value to string for storage
      if (valueType === 'json') {
        value = JSON.stringify(value);
      } else if (valueType === 'boolean') {
        value = value ? 'true' : 'false';
      } else {
        value = String(value);
      }
      
      // Check if setting exists
      const existing = await db('system_settings').where({ key }).first();
      
      if (existing) {
        await db('system_settings')
          .where({ key })
          .update({
            value,
            value_type: valueType,
            description: description || existing.description,
            updated_at: new Date().toISOString()
          });
      } else {
        await db('system_settings').insert({
          key,
          value,
          value_type: valueType,
          description
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings',
      message: error.message
    });
  }
});

/**
 * PUT /api/settings/:key
 * Update a single setting
 */
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, value_type, description } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing value'
      });
    }
    
    // Check if setting exists
    const existing = await db('system_settings').where({ key }).first();
    
    let stringValue = value;
    const type = value_type || existing?.value_type || 'string';
    
    // Convert value to string for storage
    if (type === 'json') {
      stringValue = JSON.stringify(value);
    } else if (type === 'boolean') {
      stringValue = value ? 'true' : 'false';
    } else {
      stringValue = String(value);
    }
    
    if (existing) {
      await db('system_settings')
        .where({ key })
        .update({
          value: stringValue,
          value_type: type,
          description: description || existing.description,
          updated_at: new Date().toISOString()
        });
    } else {
      await db('system_settings').insert({
        key,
        value: stringValue,
        value_type: type,
        description: description || ''
      });
    }
    
    res.json({
      success: true,
      message: 'Setting updated successfully'
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update setting',
      message: error.message
    });
  }
});

/**
 * POST /api/settings/test-smtp
 * Test SMTP configuration
 */
router.post('/test-smtp', async (req, res) => {
  try {
    const { to_email } = req.body;
    
    if (!to_email) {
      return res.status(400).json({
        success: false,
        error: 'Missing to_email parameter'
      });
    }
    
    // Get SMTP settings from database
    const smtpSettings = await db('system_settings')
      .whereIn('key', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_secure'])
      .select('*');
    
    const config = {};
    smtpSettings.forEach(s => {
      config[s.key] = s.value;
    });
    
    if (!config.smtp_host) {
      return res.status(400).json({
        success: false,
        error: 'SMTP not configured. Please configure SMTP settings first.'
      });
    }
    
    // Create nodemailer transporter
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: parseInt(config.smtp_port) || 587,
      secure: config.smtp_secure === 'true',
      auth: {
        user: config.smtp_user,
        pass: config.smtp_pass
      }
    });
    
    // Send test email
    await transporter.sendMail({
      from: config.smtp_from || config.smtp_user,
      to: to_email,
      subject: 'Test Email from Azure DevOps Sync Platform',
      html: `
        <h2>SMTP Test Successful</h2>
        <p>This is a test email from your Azure DevOps Sync Platform.</p>
        <p>If you received this email, your SMTP configuration is working correctly!</p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          SMTP Server: ${config.smtp_host}:${config.smtp_port}<br>
          Sent at: ${new Date().toLocaleString()}
        </p>
      `
    });
    
    res.json({
      success: true,
      message: 'Test email sent successfully'
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test email',
      message: error.message
    });
  }
});

module.exports = router;
