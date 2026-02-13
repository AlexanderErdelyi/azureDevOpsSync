/**
 * Connector Management API Routes
 * CRUD operations for connectors
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const { encrypt, decrypt } = require('../lib/crypto');
const { registry } = require('../lib/connectors');

/**
 * GET /api/connectors
 * List all connectors
 * Query params: ?active=true (filter by active status)
 */
router.get('/', async (req, res) => {
  try {
    const activeOnly = req.query.active === 'true';
    const connectors = await registry.listConnectors(activeOnly);
    
    // Remove encrypted credentials from response
    const sanitized = connectors.map(conn => {
      const { encrypted_credentials, ...safe } = conn;
      return safe;
    });
    
    res.json({
      success: true,
      count: sanitized.length,
      connectors: sanitized
    });
  } catch (error) {
    console.error('Error listing connectors:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list connectors',
      message: error.message
    });
  }
});

/**
 * GET /api/connectors/:id
 * Get a specific connector by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const connector = await db('connectors')
      .where({ id })
      .first();
    
    if (!connector) {
      return res.status(404).json({
        success: false,
        error: 'Connector not found'
      });
    }
    
    // Remove encrypted credentials
    const { encrypted_credentials, ...safe } = connector;
    
    res.json({
      success: true,
      connector: safe
    });
  } catch (error) {
    console.error('Error getting connector:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connector',
      message: error.message
    });
  }
});

/**
 * POST /api/connectors
 * Create a new connector
 * Body: { name, connector_type, base_url, endpoint, auth_type, credentials, metadata }
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      connector_type,
      base_url,
      endpoint,
      auth_type,
      credentials,
      metadata = {}
    } = req.body;
    
    // Validate required fields
    if (!name || !connector_type || !base_url || !auth_type || !credentials) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['name', 'connector_type', 'base_url', 'auth_type', 'credentials']
      });
    }
    
    // Verify connector type is registered
    const registeredTypes = registry.getRegisteredTypes();
    if (!registeredTypes.includes(connector_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid connector type',
        message: `Connector type '${connector_type}' is not registered`,
        available_types: registeredTypes
      });
    }
    
    // Encrypt credentials
    const encryptedCreds = encrypt(credentials);
    
    // Insert into database
    const [id] = await db('connectors').insert({
      name,
      connector_type,
      base_url,
      endpoint: endpoint || null,
      auth_type,
      encrypted_credentials: encryptedCreds,
      is_active: 1,
      metadata: JSON.stringify(metadata),
      created_at: new Date(),
      updated_at: new Date()
    });
    
    // Clear connector cache
    registry.clearCache();
    
    res.status(201).json({
      success: true,
      message: 'Connector created successfully',
      connector_id: id
    });
  } catch (error) {
    console.error('Error creating connector:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create connector',
      message: error.message
    });
  }
});

/**
 * PUT /api/connectors/:id
 * Update an existing connector
 * Body: { name?, base_url?, endpoint?, auth_type?, credentials?, metadata?, is_active? }
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    
    // Check if connector exists
    const existing = await db('connectors').where({ id }).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Connector not found'
      });
    }
    
    // Build update object
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.base_url !== undefined) updates.base_url = req.body.base_url;
    if (req.body.endpoint !== undefined) updates.endpoint = req.body.endpoint;
    if (req.body.auth_type !== undefined) updates.auth_type = req.body.auth_type;
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active ? 1 : 0;
    
    // Handle credentials separately (need encryption)
    if (req.body.credentials !== undefined) {
      updates.encrypted_credentials = encrypt(req.body.credentials);
    }
    
    // Handle metadata (need JSON stringification)
    if (req.body.metadata !== undefined) {
      updates.metadata = JSON.stringify(req.body.metadata);
    }
    
    // Update timestamp
    updates.updated_at = new Date();
    
    // Perform update
    await db('connectors')
      .where({ id })
      .update(updates);
    
    // Clear connector cache
    registry.clearCache();
    
    res.json({
      success: true,
      message: 'Connector updated successfully'
    });
  } catch (error) {
    console.error('Error updating connector:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update connector',
      message: error.message
    });
  }
});

/**
 * DELETE /api/connectors/:id
 * Delete a connector (and all related data)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if connector exists
    const existing = await db('connectors').where({ id }).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Connector not found'
      });
    }
    
    // Delete in a transaction (cascade deletes)
    await db.transaction(async (trx) => {
      // Delete related records
      await trx('sync_executions').where({ source_connector_id: id }).orWhere({ target_connector_id: id }).del();
      await trx('sync_field_mappings').whereIn('sync_config_id', 
        trx('sync_configurations').where({ source_connector_id: id }).orWhere({ target_connector_id: id }).select('id')
      ).del();
      await trx('sync_status_mappings').whereIn('sync_config_id',
        trx('sync_configurations').where({ source_connector_id: id }).orWhere({ target_connector_id: id }).select('id')
      ).del();
      await trx('sync_type_mappings').whereIn('sync_config_id',
        trx('sync_configurations').where({ source_connector_id: id }).orWhere({ target_connector_id: id }).select('id')
      ).del();
      await trx('sync_configurations').where({ source_connector_id: id }).orWhere({ target_connector_id: id }).del();
      await trx('connector_fields').where({ connector_id: id }).del();
      await trx('connector_statuses').where({ connector_id: id }).del();
      await trx('connector_work_item_types').where({ connector_id: id }).del();
      await trx('connectors').where({ id }).del();
    });
    
    // Clear connector cache
    registry.clearCache();
    
    res.json({
      success: true,
      message: 'Connector and all related data deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting connector:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete connector',
      message: error.message
    });
  }
});

/**
 * POST /api/connectors/:id/test
 * Test connection to a connector
 */
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await registry.testConnector(id);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Connection successful',
        details: result.details
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Connection failed',
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error testing connector:', error);
    
    // Detect decryption failure and give actionable message
    const isDecryptError = error.message && error.message.includes('Failed to decrypt');
    res.status(500).json({
      success: false,
      error: isDecryptError 
        ? 'Credentials cannot be decrypted. Please edit this connector and re-enter your credentials (PAT token).'
        : 'Failed to test connector',
      message: error.message
    });
  }
});

/**
 * POST /api/connectors/:id/discover
 * Discover and save metadata for a connector
 * (work item types, fields, statuses)
 */
router.post('/:id/discover', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Discover metadata
    const metadata = await registry.discoverMetadata(id);
    
    // Save to database
    const summary = await registry.saveDiscoveredMetadata(id, metadata);
    
    res.json({
      success: true,
      message: 'Metadata discovered and saved successfully',
      summary: {
        work_item_types: summary.workItemTypes,
        fields: summary.fields,
        statuses: summary.statuses
      },
      metadata: {
        work_item_types: metadata.workItemTypes.map(t => ({
          type_name: t.type_name,
          field_count: t.fields?.length || 0,
          status_count: t.statuses?.length || 0,
          error: t.error
        }))
      }
    });
  } catch (error) {
    console.error('Error discovering metadata:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover metadata',
      message: error.message
    });
  }
});

/**
 * GET /api/connectors/types/available
 * List available connector types
 */
router.get('/types/available', (req, res) => {
  try {
    const types = registry.getRegisteredTypes();
    
    res.json({
      success: true,
      connector_types: types
    });
  } catch (error) {
    console.error('Error getting connector types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connector types',
      message: error.message
    });
  }
});

module.exports = router;
