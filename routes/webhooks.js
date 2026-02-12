/**
 * Webhook Routes - Handle incoming webhook events
 * 
 * Endpoints:
 * - POST /api/webhooks/register - Register a new webhook
 * - GET /api/webhooks - List webhooks
 * - GET /api/webhooks/:id - Get webhook details
 * - PUT /api/webhooks/:id - Update webhook
 * - DELETE /api/webhooks/:id - Delete webhook
 * - POST /api/webhooks/:id/test - Test webhook
 * - POST /api/webhooks/receive/:webhook_url - Receive webhook payload
 * - GET /api/webhooks/:id/deliveries - Get webhook delivery history
 */

const express = require('express');
const crypto = require('crypto');
const { db } = require('../database/db');
const jobQueue = require('../lib/scheduler/JobQueue');

const router = express.Router();

/**
 * Generate webhook secret
 */
function generateWebhookSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate webhook URL
 */
function generateWebhookUrl() {
  return `webhook_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Verify webhook signature
 * @param {string} payload - Request body as string
 * @param {string} signature - Signature from header
 * @param {string} secret - Webhook secret
 * @returns {boolean} Is signature valid
 */
function verifySignature(payload, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = 'sha256=' + hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * POST /api/webhooks/register
 * Register a new webhook
 */
router.post('/register', async (req, res) => {
  try {
    const { name, sync_config_id, connector_id, event_types, metadata } = req.body;

    // Validate required fields
    if (!name || !sync_config_id || !connector_id) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'name, sync_config_id, and connector_id are required'
      });
    }

    // Verify sync config exists
    const config = await db('sync_configs').where({ id: sync_config_id }).first();
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Sync config ${sync_config_id} not found`
      });
    }

    // Verify connector exists
    const connector = await db('connectors').where({ id: connector_id }).first();
    if (!connector) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Connector ${connector_id} not found`
      });
    }

    // Generate webhook URL and secret
    const webhookUrl = generateWebhookUrl();
    const secret = generateWebhookSecret();

    // Insert webhook
    const [webhookId] = await db('webhooks').insert({
      name,
      sync_config_id,
      connector_id,
      webhook_url: webhookUrl,
      secret,
      is_active: true,
      event_types: JSON.stringify(event_types || ['*']),
      metadata: JSON.stringify(metadata || {}),
      trigger_count: 0
    });

    res.status(201).json({
      success: true,
      message: 'Webhook registered successfully',
      webhook: {
        id: webhookId,
        name,
        webhook_url: webhookUrl,
        secret, // Return secret once for user to configure source system
        full_url: `${req.protocol}://${req.get('host')}/api/webhooks/receive/${webhookUrl}`,
        event_types: event_types || ['*']
      }
    });

  } catch (error) {
    console.error('Error registering webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/webhooks
 * List all webhooks
 */
router.get('/', async (req, res) => {
  try {
    const { sync_config_id, connector_id, active } = req.query;

    let query = db('webhooks')
      .select(
        'webhooks.*',
        'sync_configs.name as sync_config_name',
        'connectors.name as connector_name'
      )
      .leftJoin('sync_configs', 'webhooks.sync_config_id', 'sync_configs.id')
      .leftJoin('connectors', 'webhooks.connector_id', 'connectors.id');

    if (sync_config_id) {
      query = query.where('webhooks.sync_config_id', sync_config_id);
    }

    if (connector_id) {
      query = query.where('webhooks.connector_id', connector_id);
    }

    if (active !== undefined) {
      query = query.where('webhooks.is_active', active === 'true' ? 1 : 0);
    }

    const webhooks = await query;

    // Parse JSON fields and remove secrets
    const parsedWebhooks = webhooks.map(w => ({
      ...w,
      event_types: typeof w.event_types === 'string' ? JSON.parse(w.event_types) : w.event_types,
      metadata: typeof w.metadata === 'string' ? JSON.parse(w.metadata) : w.metadata,
      secret: undefined, // Don't return secret
      full_url: `${req.protocol}://${req.get('host')}/api/webhooks/receive/${w.webhook_url}`
    }));

    res.json({
      success: true,
      count: parsedWebhooks.length,
      webhooks: parsedWebhooks
    });

  } catch (error) {
    console.error('Error listing webhooks:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/webhooks/:id
 * Get webhook details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const webhook = await db('webhooks')
      .select(
        'webhooks.*',
        'sync_configs.name as sync_config_name',
        'connectors.name as connector_name'
      )
      .leftJoin('sync_configs', 'webhooks.sync_config_id', 'sync_configs.id')
      .leftJoin('connectors', 'webhooks.connector_id', 'connectors.id')
      .where('webhooks.id', id)
      .first();

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Webhook ${id} not found`
      });
    }

    // Parse JSON fields and remove secret
    webhook.event_types = typeof webhook.event_types === 'string' 
      ? JSON.parse(webhook.event_types) 
      : webhook.event_types;
    webhook.metadata = typeof webhook.metadata === 'string' 
      ? JSON.parse(webhook.metadata) 
      : webhook.metadata;
    webhook.full_url = `${req.protocol}://${req.get('host')}/api/webhooks/receive/${webhook.webhook_url}`;
    delete webhook.secret;

    res.json({
      success: true,
      webhook
    });

  } catch (error) {
    console.error('Error getting webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * PUT /api/webhooks/:id
 * Update webhook
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, is_active, event_types, metadata } = req.body;

    const webhook = await db('webhooks').where({ id }).first();
    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Webhook ${id} not found`
      });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    if (event_types !== undefined) updates.event_types = JSON.stringify(event_types);
    if (metadata !== undefined) updates.metadata = JSON.stringify(metadata);

    await db('webhooks').where({ id }).update(updates);

    res.json({
      success: true,
      message: 'Webhook updated successfully'
    });

  } catch (error) {
    console.error('Error updating webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * DELETE /api/webhooks/:id
 * Delete webhook
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const webhook = await db('webhooks').where({ id }).first();
    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Webhook ${id} not found`
      });
    }

    await db('webhooks').where({ id }).delete();

    res.json({
      success: true,
      message: 'Webhook deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/webhooks/receive/:webhook_url
 * Receive webhook payload
 */
router.post('/receive/:webhook_url', express.raw({ type: 'application/json' }), async (req, res) => {
  const startTime = Date.now();
  let deliveryId = null;

  try {
    const { webhook_url } = req.params;

    // Find webhook
    const webhook = await db('webhooks')
      .where({ webhook_url, is_active: 1 })
      .first();

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Webhook not found or inactive'
      });
    }

    // Get signature from headers
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-webhook-signature'];
    
    // Verify signature
    const payload = req.body.toString('utf8');
    const signatureValid = verifySignature(payload, signature, webhook.secret);

    // Parse payload
    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch (e) {
      parsedPayload = { raw: payload };
    }

    // Log delivery
    [deliveryId] = await db('webhook_deliveries').insert({
      webhook_id: webhook.id,
      payload: JSON.stringify(parsedPayload),
      headers: JSON.stringify(req.headers),
      signature,
      signature_valid: signatureValid ? 1 : 0,
      status: signatureValid ? 'processing' : 'rejected',
      created_at: new Date().toISOString()
    });

    // Reject if signature invalid
    if (!signatureValid) {
      const processingTime = Date.now() - startTime;
      await db('webhook_deliveries')
        .where({ id: deliveryId })
        .update({
          status: 'rejected',
          response_code: 401,
          error_message: 'Invalid signature',
          processing_time_ms: processingTime
        });

      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid webhook signature'
      });
    }

    // Queue sync job
    const jobId = await jobQueue.addJob({
      type: 'sync',
      configId: webhook.sync_config_id,
      options: {
        triggeredBy: 'webhook',
        webhookId: webhook.id,
        webhookPayload: parsedPayload
      }
    });

    // Update webhook stats
    await db('webhooks')
      .where({ id: webhook.id })
      .update({
        last_triggered_at: new Date().toISOString(),
        trigger_count: webhook.trigger_count + 1
      });

    // Update delivery status
    const processingTime = Date.now() - startTime;
    await db('webhook_deliveries')
      .where({ id: deliveryId })
      .update({
        status: 'success',
        response_code: 202,
        processing_time_ms: processingTime
      });

    res.status(202).json({
      success: true,
      message: 'Webhook received and queued for processing',
      job_id: jobId,
      delivery_id: deliveryId
    });

  } catch (error) {
    console.error('Error processing webhook:', error);

    if (deliveryId) {
      const processingTime = Date.now() - startTime;
      await db('webhook_deliveries')
        .where({ id: deliveryId })
        .update({
          status: 'failed',
          response_code: 500,
          error_message: error.message,
          processing_time_ms: processingTime
        });
    }

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/webhooks/:id/deliveries
 * Get webhook delivery history
 */
router.get('/:id/deliveries', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const webhook = await db('webhooks').where({ id }).first();
    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Webhook ${id} not found`
      });
    }

    const deliveries = await db('webhook_deliveries')
      .where({ webhook_id: id })
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const total = await db('webhook_deliveries')
      .where({ webhook_id: id })
      .count('* as count')
      .first();

    // Parse JSON fields
    const parsedDeliveries = deliveries.map(d => ({
      ...d,
      payload: typeof d.payload === 'string' ? JSON.parse(d.payload) : d.payload,
      headers: typeof d.headers === 'string' ? JSON.parse(d.headers) : d.headers
    }));

    res.json({
      success: true,
      total: total.count,
      count: parsedDeliveries.length,
      deliveries: parsedDeliveries
    });

  } catch (error) {
    console.error('Error getting webhook deliveries:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
