/**
 * Sync Configuration API Routes (Simplified)
 * Manage sync configurations and mappings
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/db');

/**
 * GET /api/sync-configs
 * List all sync configurations
 * Query params: ?active=true, ?source_connector_id=1, ?target_connector_id=2
 */
router.get('/', async (req, res) => {
  try {
    let query = db('sync_configs')
      .select('sync_configs.*')
      .select(
        db.ref('name').withSchema('source_conn').as('source_connector_name'),
        db.ref('name').withSchema('target_conn').as('target_connector_name')
      )
      .leftJoin('connectors as source_conn', 'sync_configs.source_connector_id', 'source_conn.id')
      .leftJoin('connectors as target_conn', 'sync_configs.target_connector_id', 'target_conn.id');
    
    if (req.query.active === 'true') {
      query = query.where({ 'sync_configs.is_active': 1 });
    }
    
    if (req.query.source_connector_id) {
      query = query.where({ source_connector_id: req.query.source_connector_id });
    }
    
    if (req.query.target_connector_id) {
      query = query.where({ target_connector_id: req.query.target_connector_id });
    }
    
    const configs = await query;
    
    res.json({
      success: true,
      count: configs.length,
      configs: configs  // Changed from sync_configs to configs
    });
  } catch (error) {
    console.error('Error listing sync configurations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list sync configurations',
      message: error.message
    });
  }
});

/**
 * GET /api/sync-configs/:id
 * Get a specific sync configuration with all mappings
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get main config
    const config = await db('sync_configs')
      .where({ id })
      .first();
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Sync configuration not found'
      });
    }
    
    // Get field mappings
    const fieldMappings = await db('sync_field_mappings')
      .where({ sync_config_id: id })
      .orderBy('source_field_id');
    
    // Get status mappings
    const statusMappings = await db('sync_status_mappings')
      .where({ sync_config_id: id })
      .orderBy('source_status_id');
    
    // Get type mappings
    const typeMappings = await db('sync_type_mappings')
      .where({ sync_config_id: id })
      .orderBy('source_type_id');
    
    res.json({
      success: true,
      sync_config: {
        ...config,
        field_mappings: fieldMappings,
        status_mappings: statusMappings,
        type_mappings: typeMappings
      }
    });
  } catch (error) {
    console.error('Error getting sync configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync configuration',
      message: error.message
    });
  }
});

/**
 * POST /api/sync-configs
 * Create a new sync configuration
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      source_connector_id,
      target_connector_id,
      source_work_item_type,
      target_work_item_type,
      field_mappings = [],
      direction = 'one-way',
      trigger_type = 'manual',
      schedule_cron = null,
      conflict_resolution = 'last-write-wins',
      sync_filter = null,
      options = {}
    } = req.body;
    
    // Validate required fields
    if (!name || !source_connector_id || !target_connector_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['name', 'source_connector_id', 'target_connector_id']
      });
    }
    
    // Validate direction
    const validDirections = ['one-way', 'bidirectional'];
    if (!validDirections.includes(direction)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid direction',
        valid_values: validDirections
      });
    }
    
    // Validate trigger_type
    const validTriggers = ['manual', 'scheduled', 'webhook'];
    if (!validTriggers.includes(trigger_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid trigger_type',
        valid_values: validTriggers
      });
    }
    
    // Use transaction to ensure all or nothing
    const configId = await db.transaction(async (trx) => {
      // Insert config
      const [id] = await trx('sync_configs').insert({
        name,
        description,
        source_connector_id,
        target_connector_id,
        direction,
        trigger_type,
        schedule_cron,
        conflict_resolution,
        sync_filter: sync_filter ? JSON.stringify(sync_filter) : null,
        is_active: 1,
        options: JSON.stringify(options),
        created_at: new Date(),
        updated_at: new Date()
      });
      
      // If work item types and field mappings provided, create them
      if (source_work_item_type && target_work_item_type && field_mappings.length > 0) {
        // Find work item type IDs by name
        const sourceType = await trx('connector_work_item_types')
          .where({
            connector_id: source_connector_id,
            type_name: source_work_item_type
          })
          .first();
          
        const targetType = await trx('connector_work_item_types')
          .where({
            connector_id: target_connector_id,
            type_name: target_work_item_type
          })
          .first();
          
        if (sourceType && targetType) {
          // Create type mapping
          const [typeMappingId] = await trx('sync_type_mappings').insert({
            sync_config_id: id,
            source_type_id: sourceType.id,
            target_type_id: targetType.id,
            is_active: true,
            created_at: new Date()
          });
          
          // Create field mappings
          for (const mapping of field_mappings) {
            if (!mapping.source_field || !mapping.target_field) continue;
            
            // Find field IDs by name or reference
            const sourceField = await trx('connector_fields')
              .where({ work_item_type_id: sourceType.id })
              .andWhere(function() {
                this.where('field_name', mapping.source_field)
                    .orWhere('field_reference', mapping.source_field);
              })
              .first();
              
            const targetField = await trx('connector_fields')
              .where({ work_item_type_id: targetType.id })
              .andWhere(function() {
                this.where('field_name', mapping.target_field)
                    .orWhere('field_reference', mapping.target_field);
              })
              .first();
              
            if (sourceField && targetField) {
              await trx('sync_field_mappings').insert({
                type_mapping_id: typeMappingId,
                source_field_id: sourceField.id,
                target_field_id: targetField.id,
                transformation_function: mapping.transformation || null,
                is_active: true,
                created_at: new Date()
              });
            }
          }
        }
      }
      
      return id;
    });
    
    res.status(201).json({
      success: true,
      message: 'Sync configuration created successfully',
      sync_config_id: configId
    });
  } catch (error) {
    console.error('Error creating sync configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create sync configuration',
      message: error.message
    });
  }
});

/**
 * PUT /api/sync-configs/:id
 * Update a sync configuration
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    
    // Check if exists
    const existing = await db('sync_configs').where({ id }).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Sync configuration not found'
      });
    }
    
    // Build update object
    const allowedUpdates = ['name', 'description', 'direction', 'trigger_type', 
                            'schedule_cron', 'conflict_resolution', 'is_active', 
                            'sync_filter', 'options'];
    
    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        if (field === 'is_active') {
          updates[field] = req.body[field] ? 1 : 0;
        } else if (field === 'options' || field === 'sync_filter') {
          updates[field] = JSON.stringify(req.body[field]);
        } else {
          updates[field] = req.body[field];
        }
      }
    }
    
    updates.updated_at = new Date();
    
    await db('sync_configs')
      .where({ id })
      .update(updates);
    
    res.json({
      success: true,
      message: 'Sync configuration updated successfully'
    });
  } catch (error) {
    console.error('Error updating sync configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update sync configuration',
      message: error.message
    });
  }
});

/**
 * DELETE /api/sync-configs/:id
 * Delete a sync configuration and all mappings
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if exists
    const existing = await db('sync_configs').where({ id }).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Sync configuration not found'
      });
    }
    
    // Delete in transaction
    await db.transaction(async (trx) => {
      // First, get all type mapping IDs for this config
      const typeMappingIds = await trx('sync_type_mappings')
        .where({ sync_config_id: id })
        .pluck('id');
      
      // Delete field and status mappings that reference these type mappings
      if (typeMappingIds.length > 0) {
        await trx('sync_field_mappings').whereIn('type_mapping_id', typeMappingIds).del();
        await trx('sync_status_mappings').whereIn('type_mapping_id', typeMappingIds).del();
      }
      
      // Delete type mappings
      await trx('sync_type_mappings').where({ sync_config_id: id }).del();
      
      // Delete execution history
      await trx('sync_executions').where({ sync_config_id: id }).del();
      
      // Delete the config itself
      await trx('sync_configs').where({ id }).del();
    });
    
    res.json({
      success: true,
      message: 'Sync configuration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting sync configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete sync configuration',
      message: error.message
    });
  }
});

router.post('/:id/field-mappings', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      source_field_id,
      target_field_id,
      mapping_type = 'direct',
      transformation = null,
      constant_value = null
    } = req.body;
    
    if (!source_field_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: source_field_id'
      });
    }
    
    const [mappingId] = await db('sync_field_mappings').insert({
      sync_config_id: id,
      source_field_id,
      target_field_id,
      mapping_type,
      transformation,
      constant_value,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    res.status(201).json({
      success: true,
      message: 'Field mapping created successfully',
      field_mapping_id: mappingId
    });
  } catch (error) {
    console.error('Error creating field mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create field mapping',
      message: error.message
    });
  }
});

router.post('/:id/status-mappings', async (req, res) => {
  try {
    const { id } = req.params;
    const { source_status_id, target_status_id } = req.body;
    
    if (!source_status_id || !target_status_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: source_status_id, target_status_id'
      });
    }
    
    const [mappingId] = await db('sync_status_mappings').insert({
      sync_config_id: id,
      source_status_id,
      target_status_id,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    res.status(201).json({
      success: true,
      message: 'Status mapping created successfully',
      status_mapping_id: mappingId
    });
  } catch (error) {
    console.error('Error creating status mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create status mapping',
      message: error.message
    });
  }
});

router.delete('/:id/field-mappings/:mappingId', async (req, res) => {
  try {
    const { id, mappingId } = req.params;
    
    await db('sync_field_mappings')
      .where({ id: mappingId, sync_config_id: id })
      .del();
    
    res.json({
      success: true,
      message: 'Field mapping deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting field mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete field mapping',
      message: error.message
    });
  }
});

router.delete('/:id/status-mappings/:mappingId', async (req, res) => {
  try {
    const { id, mappingId } = req.params;
    
    await db('sync_status_mappings')
      .where({ id: mappingId, sync_config_id: id })
      .del();
    
    res.json({
      success: true,
      message: 'Status mapping deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting status mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete status mapping',
      message: error.message
    });
  }
});

module.exports = router;
