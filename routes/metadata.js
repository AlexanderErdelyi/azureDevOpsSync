/**
 * Metadata Query API Routes
 * Query work item types, fields, and statuses for connectors
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/db');

/**
 * GET /api/metadata/work-item-types
 * Get work item types for a connector
 * Query params: connector_id, enabled_only
 */
router.get('/work-item-types', async (req, res) => {
  try {
    const { connector_id, enabled_only } = req.query;
    
    if (!connector_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: connector_id'
      });
    }
    
    let query = db('connector_work_item_types')
      .where({ connector_id });
    
    if (enabled_only === 'true') {
      query = query.where({ is_enabled: 1 });
    }
    
    const types = await query.orderBy('type_name');
    
    res.json({
      success: true,
      connector_id: parseInt(connector_id),
      count: types.length,
      work_item_types: types
    });
  } catch (error) {
    console.error('Error getting work item types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get work item types',
      message: error.message
    });
  }
});

/**
 * GET /api/metadata/fields
 * Get fields for a connector and work item type
 * Query params: connector_id, type_id, required_only
 */
router.get('/fields', async (req, res) => {
  try {
    const { connector_id, type_id, required_only } = req.query;
    
    if (!connector_id || !type_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: connector_id, type_id'
      });
    }
    
    let query = db('connector_fields')
      .where({
        connector_id,
        work_item_type_id: type_id
      });
    
    if (required_only === 'true') {
      query = query.where({ is_required: 1 });
    }
    
    const fields = await query.orderBy('field_name');
    
    res.json({
      success: true,
      connector_id: parseInt(connector_id),
      work_item_type_id: parseInt(type_id),
      count: fields.length,
      fields: fields
    });
  } catch (error) {
    console.error('Error getting fields:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get fields',
      message: error.message
    });
  }
});

/**
 * GET /api/metadata/statuses
 * Get statuses for a connector and work item type
 * Query params: connector_id, type_id
 */
router.get('/statuses', async (req, res) => {
  try {
    const { connector_id, type_id } = req.query;
    
    if (!connector_id || !type_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: connector_id, type_id'
      });
    }
    
    const statuses = await db('connector_statuses')
      .where({
        connector_id,
        work_item_type_id: type_id
      })
      .orderBy('status_name');
    
    res.json({
      success: true,
      connector_id: parseInt(connector_id),
      work_item_type_id: parseInt(type_id),
      count: statuses.length,
      statuses: statuses
    });
  } catch (error) {
    console.error('Error getting statuses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statuses',
      message: error.message
    });
  }
});

/**
 * GET /api/metadata/suggest-mappings
 * Get AI-suggested field/status mappings between two connectors
 * Query params: source_connector_id, source_type_id, target_connector_id, target_type_id
 */
router.get('/suggest-mappings', async (req, res) => {
  try {
    const {
      source_connector_id,
      source_type_id,
      target_connector_id,
      target_type_id
    } = req.query;
    
    if (!source_connector_id || !source_type_id || !target_connector_id || !target_type_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        required: ['source_connector_id', 'source_type_id', 'target_connector_id', 'target_type_id']
      });
    }
    
    // Get source fields with suggestions
    const sourceFields = await db('connector_fields')
      .where({
        connector_id: source_connector_id,
        work_item_type_id: source_type_id
      })
      .orderBy('field_name');
    
    // Get target fields
    const targetFields = await db('connector_fields')
      .where({
        connector_id: target_connector_id,
        work_item_type_id: target_type_id
      })
      .orderBy('field_name');
    
    // Get source statuses
    const sourceStatuses = await db('connector_statuses')
      .where({
        connector_id: source_connector_id,
        work_item_type_id: source_type_id
      })
      .orderBy('status_name');
    
    // Get target statuses
    const targetStatuses = await db('connector_statuses')
      .where({
        connector_id: target_connector_id,
        work_item_type_id: target_type_id
      })
      .orderBy('status_name');
    
    // Build suggested field mappings
    const fieldMappings = sourceFields.map(sourceField => {
      // Find best match in target fields
      let suggestion = null;
      let confidence = 0;
      
      // Try exact match first
      const exactMatch = targetFields.find(tf => 
        tf.field_name.toLowerCase() === sourceField.field_name.toLowerCase()
      );
      
      if (exactMatch) {
        suggestion = exactMatch;
        confidence = 1.0;
      } else {
        // Try reference name match
        const refMatch = targetFields.find(tf =>
          tf.reference_name?.toLowerCase() === sourceField.reference_name?.toLowerCase()
        );
        
        if (refMatch) {
          suggestion = refMatch;
          confidence = 0.9;
        } else {
          // Try type-based matching with similar names
          const typeMatch = targetFields.find(tf =>
            tf.field_type === sourceField.field_type &&
            (tf.field_name.toLowerCase().includes(sourceField.field_name.toLowerCase().split('.').pop()) ||
             sourceField.field_name.toLowerCase().includes(tf.field_name.toLowerCase().split('.').pop()))
          );
          
          if (typeMatch) {
            suggestion = typeMatch;
            confidence = 0.7;
          }
        }
      }
      
      return {
        source_field: sourceField,
        suggested_target_field: suggestion,
        confidence: confidence,
        requires_transformation: sourceField.field_type !== suggestion?.field_type
      };
    });
    
    // Build suggested status mappings
    const statusMappings = sourceStatuses.map(sourceStatus => {
      // Find best match in target statuses
      let suggestion = null;
      let confidence = 0;
      
      // Try exact match
      const exactMatch = targetStatuses.find(ts =>
        ts.status_name.toLowerCase() === sourceStatus.status_name.toLowerCase()
      );
      
      if (exactMatch) {
        suggestion = exactMatch;
        confidence = 1.0;
      } else {
        // Try category match
        const categoryMatch = targetStatuses.find(ts =>
          ts.category === sourceStatus.category
        );
        
        if (categoryMatch) {
          suggestion = categoryMatch;
          confidence = 0.8;
        }
      }
      
      return {
        source_status: sourceStatus,
        suggested_target_status: suggestion,
        confidence: confidence
      };
    });
    
    res.json({
      success: true,
      source: {
        connector_id: parseInt(source_connector_id),
        type_id: parseInt(source_type_id)
      },
      target: {
        connector_id: parseInt(target_connector_id),
        type_id: parseInt(target_type_id)
      },
      suggestions: {
        field_mappings: fieldMappings,
        status_mappings: statusMappings
      },
      summary: {
        total_source_fields: sourceFields.length,
        mapped_fields: fieldMappings.filter(m => m.suggested_target_field).length,
        high_confidence_fields: fieldMappings.filter(m => m.confidence >= 0.9).length,
        total_source_statuses: sourceStatuses.length,
        mapped_statuses: statusMappings.filter(m => m.suggested_target_status).length,
        high_confidence_statuses: statusMappings.filter(m => m.confidence >= 0.9).length
      }
    });
  } catch (error) {
    console.error('Error suggesting mappings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to suggest mappings',
      message: error.message
    });
  }
});

/**
 * PUT /api/metadata/work-item-types/:id
 * Update work item type settings (enable/disable for sync)
 */
router.put('/work-item-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_enabled } = req.body;
    
    if (is_enabled === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: is_enabled'
      });
    }
    
    await db('connector_work_item_types')
      .where({ id })
      .update({ is_enabled: is_enabled ? 1 : 0 });
    
    res.json({
      success: true,
      message: 'Work item type updated successfully'
    });
  } catch (error) {
    console.error('Error updating work item type:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update work item type',
      message: error.message
    });
  }
});

module.exports = router;
