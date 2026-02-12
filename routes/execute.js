/**
 * Sync Execution API Routes
 * Execute synchronization between connectors
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const { registry } = require('../lib/connectors');
const mappingEngine = require('../lib/mapping/MappingEngine');
const SyncEngine = require('../lib/SyncEngine');

/**
 * POST /api/execute/sync/:configId
 * Execute a sync configuration
 * Optional body: { work_item_ids: [1, 2, 3], dry_run: false }
 */
router.post('/sync/:configId', async (req, res) => {
  const { configId } = req.params;
  const { work_item_ids = null, dry_run = false, direction = 'source-to-target' } = req.body;
  
  try {
    // Load sync configuration
    const config = await db('sync_configs').where({ id: configId }).first();
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Sync configuration not found'
      });
    }
    
    if (!config.is_active) {
      return res.status(400).json({
        success: false,
        error: 'Sync configuration is not active'
      });
    }
    
    // Initialize sync engine
    const syncEngine = new SyncEngine(config);
    await syncEngine.initialize();
    
    // Execute sync
    const result = await syncEngine.execute({
      work_item_ids,
      dry_run,
      direction
    });
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('Sync execution error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Sync execution failed',
      message: error.message
    });
  }
});

/**
 * GET /api/execute/history/:configId
 * Get sync execution history for a configuration
 */
router.get('/history/:configId', async (req, res) => {
  try {
    const { configId } = req.params;
    const { limit = 50 } = req.query;
    
    const executions = await db('sync_executions')
      .where({ sync_config_id: configId })
      .orderBy('started_at', 'desc')
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      count: executions.length,
      executions: executions
    });
  } catch (error) {
    console.error('Error fetching execution history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch execution history',
      message: error.message
    });
  }
});

/**
 * GET /api/execute/status/:executionId
 * Get status of a specific sync execution
 */
router.get('/status/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;
    
    const execution = await db('sync_executions')
      .where({ id: executionId })
      .first();
    
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }
    
    // Get errors for this execution
    const errors = await db('sync_errors')
      .where({ sync_execution_id: executionId })
      .select('source_item_id', 'error_type', 'error_message', 'created_at');
    
    res.json({
      success: true,
      execution: execution,
      errors: errors
    });
  } catch (error) {
    console.error('Error fetching execution status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch execution status',
      message: error.message
    });
  }
});

/**
 * GET /api/execute/synced-items/:configId
 * Get synced items for a configuration
 */
router.get('/synced-items/:configId', async (req, res) => {
  try {
    const { configId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    
    const items = await db('synced_items')
      .where({ sync_config_id: configId })
      .orderBy('last_synced_at', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset));
    
    const total = await db('synced_items')
      .where({ sync_config_id: configId })
      .count('* as count')
      .first();
    
    res.json({
      success: true,
      total: total.count,
      count: items.length,
      items: items
    });
  } catch (error) {
    console.error('Error fetching synced items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch synced items',
      message: error.message
    });
  }
});

/**
 * POST /api/execute/validate/:configId
 * Validate a sync configuration without executing
 */
router.post('/validate/:configId', async (req, res) => {
  try {
    const { configId } = req.params;
    
    // Load configuration
    const config = await db('sync_configs').where({ id: configId }).first();
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Sync configuration not found'
      });
    }
    
    const validation = {
      config_valid: true,
      issues: []
    };
    
    // Validate connectors exist and are active
    const [sourceConn, targetConn] = await Promise.all([
      db('connectors').where({ id: config.source_connector_id }).first(),
      db('connectors').where({ id: config.target_connector_id }).first()
    ]);
    
    if (!sourceConn) {
      validation.config_valid = false;
      validation.issues.push({
        type: 'error',
        field: 'source_connector_id',
        message: 'Source connector not found'
      });
    } else if (!sourceConn.is_active) {
      validation.issues.push({
        type: 'warning',
        field: 'source_connector_id',
        message: 'Source connector is not active'
      });
    }
    
    if (!targetConn) {
      validation.config_valid = false;
      validation.issues.push({
        type: 'error',
        field: 'target_connector_id',
        message: 'Target connector not found'
      });
    } else if (!targetConn.is_active) {
      validation.issues.push({
        type: 'warning',
        field: 'target_connector_id',
        message: 'Target connector is not active'
      });
    }
    
    // Validate mappings
    const mappingValidation = await mappingEngine.validateMappings(configId);
    validation.config_valid = validation.config_valid && mappingValidation.valid;
    validation.issues.push(...mappingValidation.issues);
    
    // Test connector connections
    if (sourceConn) {
      try {
        const sourceTest = await registry.testConnector(config.source_connector_id);
        if (!sourceTest.success) {
          validation.issues.push({
            type: 'error',
            field: 'source_connector',
            message: `Source connector connection failed: ${sourceTest.message}`
          });
          validation.config_valid = false;
        }
      } catch (error) {
        validation.issues.push({
          type: 'error',
          field: 'source_connector',
          message: `Could not test source connector: ${error.message}`
        });
        validation.config_valid = false;
      }
    }
    
    if (targetConn) {
      try {
        const targetTest = await registry.testConnector(config.target_connector_id);
        if (!targetTest.success) {
          validation.issues.push({
            type: 'error',
            field: 'target_connector',
            message: `Target connector connection failed: ${targetTest.message}`
          });
          validation.config_valid = false;
        }
      } catch (error) {
        validation.issues.push({
          type: 'error',
          field: 'target_connector',
          message: `Could not test target connector: ${error.message}`
        });
        validation.config_valid = false;
      }
    }
    
    res.json({
      success: true,
      validation: validation
    });
    
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Validation failed',
      message: error.message
    });
  }
});

/**
 * POST /api/execute/test-mapping
 * Test field mapping with sample data
 * Body: { sync_config_id, sample_source_item }
 */
router.post('/test-mapping', async (req, res) => {
  try {
    const { sync_config_id, sample_source_item } = req.body;
    
    if (!sync_config_id || !sample_source_item) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sync_config_id, sample_source_item'
      });
    }
    
    // Map the sample item
    const mapped = await mappingEngine.mapWorkItem(sample_source_item, sync_config_id, {
      test: true
    });
    
    res.json({
      success: true,
      source: sample_source_item,
      mapped: mapped
    });
    
  } catch (error) {
    console.error('Mapping test error:', error);
    res.status(500).json({
      success: false,
      error: 'Mapping test failed',
      message: error.message
    });
  }
});

module.exports = router;
