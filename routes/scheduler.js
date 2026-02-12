/**
 * Scheduler Management Routes
 * 
 * Endpoints:
 * - GET /api/scheduler/status - Get scheduler status
 * - POST /api/scheduler/start - Start scheduler
 * - POST /api/scheduler/stop - Stop scheduler
 * - POST /api/scheduler/schedule/:configId - Schedule a sync config
 * - POST /api/scheduler/unschedule/:configId - Unschedule a sync config
 * - GET /api/jobs/status/:jobId - Get job status
 * - GET /api/jobs/queue - Get queue status
 * - POST /api/jobs/queue/:configId - Queue a sync job manually
 * - GET /api/notifications - List notification settings
 * - POST /api/notifications - Create notification setting
 * - PUT /api/notifications/:id - Update notification setting
 * - DELETE /api/notifications/:id - Delete notification setting
 * - POST /api/notifications/test - Test notification configuration
 */

const express = require('express');
const { db } = require('../database/db');
const scheduler = require('../lib/scheduler/CronScheduler');
const jobQueue = require('../lib/scheduler/JobQueue');
const notificationSystem = require('../lib/scheduler/NotificationSystem');

const router = express.Router();

// ============================================================
// SCHEDULER MANAGEMENT
// ============================================================

/**
 * GET /api/scheduler/status
 * Get scheduler status
 */
router.get('/scheduler/status', (req, res) => {
  try {
    const status = scheduler.getStatus();
    res.json({
      success: true,
      scheduler: status
    });
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/scheduler/start
 * Start the scheduler
 */
router.post('/scheduler/start', async (req, res) => {
  try {
    await scheduler.start();
    res.json({
      success: true,
      message: 'Scheduler started successfully',
      status: scheduler.getStatus()
    });
  } catch (error) {
    console.error('Error starting scheduler:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/scheduler/stop
 * Stop the scheduler
 */
router.post('/scheduler/stop', (req, res) => {
  try {
    scheduler.stop();
    res.json({
      success: true,
      message: 'Scheduler stopped successfully',
      status: scheduler.getStatus()
    });
  } catch (error) {
    console.error('Error stopping scheduler:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/scheduler/schedule/:configId
 * Schedule a sync configuration
 */
router.post('/scheduler/schedule/:configId', async (req, res) => {
  try {
    const { configId } = req.params;
    const { schedule_cron } = req.body;

    if (!schedule_cron) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'schedule_cron is required'
      });
    }

    // Get config
    const config = await db('sync_configs').where({ id: configId }).first();
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Sync config ${configId} not found`
      });
    }

    // Update config
    await db('sync_configs')
      .where({ id: configId })
      .update({
        trigger_type: 'scheduled',
        schedule_cron
      });

    // Schedule it
    await scheduler.scheduleSync(configId, schedule_cron, config.name);

    res.json({
      success: true,
      message: 'Sync configuration scheduled successfully',
      next_run: await db('sync_configs')
        .where({ id: configId })
        .select('next_sync_at')
        .first()
    });

  } catch (error) {
    console.error('Error scheduling sync:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/scheduler/unschedule/:configId
 * Unschedule a sync configuration
 */
router.post('/scheduler/unschedule/:configId', async (req, res) => {
  try {
    const { configId } = req.params;

    scheduler.unscheduleSync(parseInt(configId));

    // Update config
    await db('sync_configs')
      .where({ id: configId })
      .update({
        trigger_type: 'manual',
        schedule_cron: null,
        next_sync_at: null
      });

    res.json({
      success: true,
      message: 'Sync configuration unscheduled successfully'
    });

  } catch (error) {
    console.error('Error unscheduling sync:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// ============================================================
// JOB QUEUE MANAGEMENT
// ============================================================

/**
 * GET /api/jobs/status/:jobId
 * Get job status
 */
router.get('/jobs/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobQueue.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Job ${jobId} not found`
      });
    }

    res.json({
      success: true,
      job
    });

  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/jobs/queue
 * Get queue status
 */
router.get('/jobs/queue', (req, res) => {
  try {
    const status = jobQueue.getStatus();
    res.json({
      success: true,
      queue: status
    });
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/jobs/queue/:configId
 * Manually queue a sync job
 */
router.post('/jobs/queue/:configId', async (req, res) => {
  try {
    const { configId } = req.params;
    const { work_item_ids, dry_run } = req.body;

    // Verify config exists
    const config = await db('sync_configs').where({ id: configId }).first();
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Sync config ${configId} not found`
      });
    }

    // Queue job
    const jobId = await jobQueue.addJob({
      type: 'sync',
      configId: parseInt(configId),
      options: {
        workItemIds: work_item_ids,
        dryRun: dry_run || false,
        triggeredBy: 'manual'
      }
    });

    res.status(202).json({
      success: true,
      message: 'Sync job queued successfully',
      job_id: jobId
    });

  } catch (error) {
    console.error('Error queueing job:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// ============================================================
// NOTIFICATION MANAGEMENT
// ============================================================

/**
 * GET /api/notifications
 * List notification settings
 */
router.get('/notifications', async (req, res) => {
  try {
    const { sync_config_id, active } = req.query;

    let query = db('notification_settings')
      .select('notification_settings.*', 'sync_configs.name as sync_config_name')
      .leftJoin('sync_configs', 'notification_settings.sync_config_id', 'sync_configs.id');

    if (sync_config_id) {
      query = query.where('notification_settings.sync_config_id', sync_config_id);
    }

    if (active !== undefined) {
      query = query.where('notification_settings.is_active', active === 'true' ? 1 : 0);
    }

    const settings = await query;

    // Parse JSON fields
    const parsedSettings = settings.map(s => ({
      ...s,
      event_triggers: typeof s.event_triggers === 'string' ? JSON.parse(s.event_triggers) : s.event_triggers,
      recipients: typeof s.recipients === 'string' ? JSON.parse(s.recipients) : s.recipients,
      settings: typeof s.settings === 'string' ? JSON.parse(s.settings) : s.settings
    }));

    res.json({
      success: true,
      count: parsedSettings.length,
      notification_settings: parsedSettings
    });

  } catch (error) {
    console.error('Error listing notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/notifications
 * Create notification setting
 */
router.post('/notifications', async (req, res) => {
  try {
    const { sync_config_id, notification_type, event_triggers, recipients, settings } = req.body;

    if (!notification_type || !event_triggers || !recipients) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'notification_type, event_triggers, and recipients are required'
      });
    }

    const [id] = await db('notification_settings').insert({
      sync_config_id: sync_config_id || null,
      notification_type,
      event_triggers: JSON.stringify(event_triggers),
      recipients: JSON.stringify(recipients),
      settings: JSON.stringify(settings || {}),
      is_active: true
    });

    res.status(201).json({
      success: true,
      message: 'Notification setting created successfully',
      notification_id: id
    });

  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * PUT /api/notifications/:id
 * Update notification setting
 */
router.put('/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { notification_type, event_triggers, recipients, settings, is_active } = req.body;

    const notification = await db('notification_settings').where({ id }).first();
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Notification setting ${id} not found`
      });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (notification_type !== undefined) updates.notification_type = notification_type;
    if (event_triggers !== undefined) updates.event_triggers = JSON.stringify(event_triggers);
    if (recipients !== undefined) updates.recipients = JSON.stringify(recipients);
    if (settings !== undefined) updates.settings = JSON.stringify(settings);
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;

    await db('notification_settings').where({ id }).update(updates);

    res.json({
      success: true,
      message: 'Notification setting updated successfully'
    });

  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete notification setting
 */
router.delete('/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await db('notification_settings').where({ id }).first();
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Notification setting ${id} not found`
      });
    }

    await db('notification_settings').where({ id }).delete();

    res.json({
      success: true,
      message: 'Notification setting deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/notifications/test
 * Test notification configuration
 */
router.post('/notifications/test', async (req, res) => {
  try {
    const { recipients } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'recipients array is required'
      });
    }

    await notificationSystem.testConfiguration(recipients);

    res.json({
      success: true,
      message: 'Test notification sent successfully'
    });

  } catch (error) {
    console.error('Error testing notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
