/**
 * Sync Execution API Routes
 * Execute synchronization between connectors
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const { registry } = require('../lib/connectors');
const mappingEngine = require('../lib/mapping/MappingEngine');

/**
 * POST /api/execute/sync/:configId
 * Execute a sync configuration
 * Optional body: { work_item_ids: [1, 2, 3], dry_run: false }
 */
router.post('/sync/:configId', async (req, res) => {
  const { configId } = req.params;
  const { work_item_ids = null, dry_run = false } = req.body;
  
  let executionId = null;
  
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
    
    // Create execution record
    if (!dry_run) {
      [executionId] = await db('sync_executions').insert({
        sync_config_id: configId,
        source_connector_id: config.source_connector_id,
        target_connector_id: config.target_connector_id,
        status: 'running',
        started_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    
    // Get connectors
    const sourceConnector = await registry.get(config.source_connector_id);
    const targetConnector = await registry.get(config.target_connector_id);
    
    // Connect to both connectors
    await sourceConnector.connect();
    await targetConnector.connect();
    
    // Query work items from source
    let query = config.sync_filter ? JSON.parse(config.sync_filter) : null;
    let sourceWorkItems;
    
    if (work_item_ids && work_item_ids.length > 0) {
      // Sync specific work items
      sourceWorkItems = await Promise.all(
        work_item_ids.map(id => sourceConnector.getWorkItem(id))
      );
    } else if (query) {
      // Query with filter
      sourceWorkItems = await sourceConnector.queryWorkItems(query);
    } else {
      // No filter - return error (require explicit filter or IDs)
      throw new Error('Must specify either work_item_ids or configure sync_filter');
    }
    
    // Load mappings
    const mappings = await mappingEngine.loadMappings(configId);
    
    // Process each work item
    const results = {
      total: sourceWorkItems.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      items: []
    };
    
    for (const sourceItem of sourceWorkItems) {
      try {
        // Map the work item
        const mapped = await mappingEngine.mapWorkItem(sourceItem, configId, {
          sourceConnector: sourceConnector.getName(),
          targetConnector: targetConnector.getName()
        });
        
        // Check if work item already synced
        const existing = await db('synced_items')
          .where({
            sync_config_id: configId,
            source_connector_id: config.source_connector_id,
            source_item_id: sourceItem.id.toString()
          })
          .first();
        
        let targetId = existing ? existing.target_item_id : null;
        let action = 'skipped';
        
        if (dry_run) {
          action = existing ? 'would_update' : 'would_create';
        } else {
          if (existing) {
            // Update existing work item
            await targetConnector.updateWorkItem(targetId, mapped.fields);
            action = 'updated';
            results.updated++;
            
            // Update synced_items record
            await db('synced_items')
              .where({ id: existing.id })
              .update({
                last_synced_at: new Date(),
                sync_count: existing.sync_count + 1,
                updated_at: new Date()
              });
          } else {
            // Create new work item
            const created = await targetConnector.createWorkItem(
              mapped.type || 'Task',
              mapped.fields
            );
            
            targetId = created.id;
            action = 'created';
            results.created++;
            
            // Record in synced_items
            await db('synced_items').insert({
              sync_config_id: configId,
              source_connector_id: config.source_connector_id,
              target_connector_id: config.target_connector_id,
              source_item_id: sourceItem.id.toString(),
              target_item_id: targetId.toString(),
              source_type: sourceItem.type || 'unknown',
              target_type: mapped.type || 'Task',
              last_synced_at: new Date(),
              sync_count: 1,
              created_at: new Date(),
              updated_at: new Date()
            });
          }
        }
        
        results.items.push({
          source_id: sourceItem.id,
          target_id: targetId,
          action: action,
          success: true
        });
        
      } catch (error) {
        console.error(`Error syncing work item ${sourceItem.id}:`, error);
        results.errors++;
        results.items.push({
          source_id: sourceItem.id,
          action: 'error',
          success: false,
          error: error.message
        });
        
        // Log error if not dry run
        if (!dry_run && executionId) {
          await db('sync_errors').insert({
            sync_execution_id: executionId,
            sync_config_id: configId,
            source_item_id: sourceItem.id.toString(),
            error_type: 'sync_failed',
            error_message: error.message,
            stack_trace: error.stack,
            created_at: new Date()
          });
        }
      }
    }
    
    // Update execution record
    if (!dry_run && executionId) {
      await db('sync_executions')
        .where({ id: executionId })
        .update({
          status: results.errors > 0 ? 'completed_with_errors' : 'completed',
          ended_at: new Date(),
          items_synced: results.created + results.updated,
          items_failed: results.errors,
          updated_at: new Date()
        });
      
      // Update sync config last_sync timestamp
      await db('sync_configs')
        .where({ id: configId })
        .update({
          last_sync_at: new Date(),
          updated_at: new Date()
        });
    }
    
    res.json({
      success: true,
      dry_run: dry_run,
      execution_id: executionId,
      results: results
    });
    
  } catch (error) {
    console.error('Sync execution error:', error);
    
    // Update execution record with error
    if (!dry_run && executionId) {
      await db('sync_executions')
        .where({ id: executionId })
        .update({
          status: 'failed',
          ended_at: new Date(),
          updated_at: new Date()
        });
      
      await db('sync_errors').insert({
        sync_execution_id: executionId,
        sync_config_id: configId,
        error_type: 'execution_failed',
        error_message: error.message,
        stack_trace: error.stack,
        created_at: new Date()
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Sync execution failed',
      message: error.message,
      execution_id: executionId
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
