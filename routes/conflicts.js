/**
 * Conflict Management API Routes
 * View and resolve synchronization conflicts
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const ConflictResolver = require('../lib/conflict/ConflictResolver');
const { registry } = require('../lib/connectors');

/**
 * GET /api/conflicts
 * Get all conflicts (with optional filters)
 * Query params: status, sync_config_id, limit, offset
 */
router.get('/', async (req, res) => {
  try {
    const {
      status = 'unresolved',
      sync_config_id = null,
      limit = 50,
      offset = 0
    } = req.query;

    let query = db('sync_conflicts')
      .select('sync_conflicts.*', 'sync_configs.name as config_name')
      .leftJoin('sync_configs', 'sync_conflicts.sync_config_id', 'sync_configs.id')
      .orderBy('sync_conflicts.detected_at', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    if (status) {
      query = query.where('sync_conflicts.status', status);
    }

    if (sync_config_id) {
      query = query.where('sync_conflicts.sync_config_id', sync_config_id);
    }

    const conflicts = await query;

    // Get total count
    let countQuery = db('sync_conflicts').count('* as count');
    if (status) {
      countQuery = countQuery.where('status', status);
    }
    if (sync_config_id) {
      countQuery = countQuery.where('sync_config_id', sync_config_id);
    }
    const [{ count }] = await countQuery;

    res.json({
      success: true,
      conflicts: conflicts.map(c => ({
        ...c,
        metadata: c.metadata ? JSON.parse(c.metadata) : null
      })),
      total: parseInt(count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error fetching conflicts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conflicts',
      message: error.message
    });
  }
});

/**
 * GET /api/conflicts/:id
 * Get detailed information about a specific conflict
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const conflict = await db('sync_conflicts')
      .select(
        'sync_conflicts.*',
        'sync_configs.name as config_name',
        'sync_configs.bidirectional',
        'sync_configs.conflict_resolution_strategy'
      )
      .leftJoin('sync_configs', 'sync_conflicts.sync_config_id', 'sync_configs.id')
      .where('sync_conflicts.id', id)
      .first();

    if (!conflict) {
      return res.status(404).json({
        success: false,
        error: 'Conflict not found'
      });
    }

    // Get resolution history
    const resolutions = await db('conflict_resolutions')
      .where({ conflict_id: id })
      .orderBy('resolved_at', 'desc');

    res.json({
      success: true,
      conflict: {
        ...conflict,
        metadata: conflict.metadata ? JSON.parse(conflict.metadata) : null
      },
      resolutions: resolutions.map(r => ({
        ...r,
        metadata: r.metadata ? JSON.parse(r.metadata) : null,
        application_result: r.application_result ? JSON.parse(r.application_result) : null
      }))
    });

  } catch (error) {
    console.error('Error fetching conflict:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conflict',
      message: error.message
    });
  }
});

/**
 * POST /api/conflicts/:id/resolve
 * Resolve a conflict manually
 * Body: { resolved_value, rationale, resolved_by, apply_immediately }
 */
router.post('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      resolved_value,
      rationale = '',
      resolved_by = 'user',
      apply_immediately = true
    } = req.body;

    // Get conflict details
    const conflict = await db('sync_conflicts')
      .where({ id })
      .first();

    if (!conflict) {
      return res.status(404).json({
        success: false,
        error: 'Conflict not found'
      });
    }

    if (conflict.status === 'resolved') {
      return res.status(400).json({
        success: false,
        error: 'Conflict already resolved'
      });
    }

    // Get sync config and connectors
    const config = await db('sync_configs')
      .where({ id: conflict.sync_config_id })
      .first();

    const sourceConnector = await registry.get(config.source_connector_id);
    const targetConnector = await registry.get(config.target_connector_id);

    await sourceConnector.connect();
    await targetConnector.connect();

    const resolver = new ConflictResolver(config, sourceConnector, targetConnector);

    // Manually resolve
    const resolution = await resolver.resolveManually(
      id,
      resolved_value,
      rationale,
      resolved_by
    );

    // Apply resolution if requested
    let applicationResult = null;
    if (apply_immediately) {
      applicationResult = await resolver.applyResolution(conflict, {
        resolvedValue: resolved_value,
        strategy: 'manual'
      });
    }

    res.json({
      success: true,
      resolution,
      application_result: applicationResult
    });

  } catch (error) {
    console.error('Error resolving conflict:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve conflict',
      message: error.message
    });
  }
});

/**
 * POST /api/conflicts/:id/resolve-auto
 * Resolve a conflict using automatic strategy
 * Body: { strategy } - optional, uses config default if not provided
 */
router.post('/:id/resolve-auto', async (req, res) => {
  try {
    const { id } = req.params;
    const { strategy = null } = req.body;

    // Get conflict details
    const conflict = await db('sync_conflicts')
      .where({ id })
      .first();

    if (!conflict) {
      return res.status(404).json({
        success: false,
        error: 'Conflict not found'
      });
    }

    if (conflict.status === 'resolved') {
      return res.status(400).json({
        success: false,
        error: 'Conflict already resolved'
      });
    }

    // Get sync config and connectors
    const config = await db('sync_configs')
      .where({ id: conflict.sync_config_id })
      .first();

    const sourceConnector = await registry.get(config.source_connector_id);
    const targetConnector = await registry.get(config.target_connector_id);

    await sourceConnector.connect();
    await targetConnector.connect();

    const resolver = new ConflictResolver(config, sourceConnector, targetConnector);

    // Resolve with strategy
    const resolution = await resolver.resolve(conflict, strategy);

    if (resolution.requiresManual) {
      return res.status(400).json({
        success: false,
        error: 'This conflict requires manual resolution',
        conflict
      });
    }

    // Apply resolution
    const applicationResult = await resolver.applyResolution(conflict, resolution);

    res.json({
      success: true,
      resolution,
      application_result: applicationResult
    });

  } catch (error) {
    console.error('Error auto-resolving conflict:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to auto-resolve conflict',
      message: error.message
    });
  }
});

/**
 * POST /api/conflicts/resolve-batch
 * Resolve multiple conflicts with the same strategy
 * Body: { conflict_ids: [1,2,3], strategy }
 */
router.post('/resolve-batch', async (req, res) => {
  try {
    const { conflict_ids, strategy = 'last-write-wins' } = req.body;

    if (!conflict_ids || !Array.isArray(conflict_ids) || conflict_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'conflict_ids array is required'
      });
    }

    // Get conflicts
    const conflicts = await db('sync_conflicts')
      .whereIn('id', conflict_ids)
      .where('status', 'unresolved');

    if (conflicts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No unresolved conflicts found with provided IDs'
      });
    }

    // Group by sync config
    const conflictsByConfig = {};
    for (const conflict of conflicts) {
      if (!conflictsByConfig[conflict.sync_config_id]) {
        conflictsByConfig[conflict.sync_config_id] = [];
      }
      conflictsByConfig[conflict.sync_config_id].push(conflict);
    }

    const results = [];

    // Resolve conflicts for each config
    for (const [configId, configConflicts] of Object.entries(conflictsByConfig)) {
      const config = await db('sync_configs').where({ id: configId }).first();
      const sourceConnector = await registry.get(config.source_connector_id);
      const targetConnector = await registry.get(config.target_connector_id);

      await sourceConnector.connect();
      await targetConnector.connect();

      const resolver = new ConflictResolver(config, sourceConnector, targetConnector);
      const batchResults = await resolver.resolveMany(configConflicts, strategy);

      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      resolved: successCount,
      failed: failureCount,
      results
    });

  } catch (error) {
    console.error('Error batch resolving conflicts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to batch resolve conflicts',
      message: error.message
    });
  }
});

/**
 * POST /api/conflicts/:id/ignore
 * Mark a conflict as ignored (won't be auto-resolved)
 */
router.post('/:id/ignore', async (req, res) => {
  try {
    const { id } = req.params;

    const conflict = await db('sync_conflicts')
      .where({ id })
      .first();

    if (!conflict) {
      return res.status(404).json({
        success: false,
        error: 'Conflict not found'
      });
    }

    await db('sync_conflicts')
      .where({ id })
      .update({
        status: 'ignored',
        resolved_by: 'user',
        resolved_at: new Date(),
        updated_at: new Date()
      });

    res.json({
      success: true,
      message: 'Conflict marked as ignored'
    });

  } catch (error) {
    console.error('Error ignoring conflict:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to ignore conflict',
      message: error.message
    });
  }
});

/**
 * GET /api/conflicts/stats/:configId
 * Get conflict statistics for a sync configuration
 */
router.get('/stats/:configId', async (req, res) => {
  try {
    const { configId } = req.params;

    const stats = await db('sync_conflicts')
      .where({ sync_config_id: configId })
      .select('status')
      .count('* as count')
      .groupBy('status');

    const conflictTypeStats = await db('sync_conflicts')
      .where({ sync_config_id: configId })
      .select('conflict_type')
      .count('* as count')
      .groupBy('conflict_type');

    // Total conflicts
    const [{ total }] = await db('sync_conflicts')
      .where({ sync_config_id: configId })
      .count('* as total');

    res.json({
      success: true,
      total: parseInt(total),
      by_status: stats.reduce((acc, { status, count }) => {
        acc[status] = parseInt(count);
        return acc;
      }, {}),
      by_type: conflictTypeStats.reduce((acc, { conflict_type, count }) => {
        acc[conflict_type] = parseInt(count);
        return acc;
      }, {})
    });

  } catch (error) {
    console.error('Error fetching conflict stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conflict stats',
      message: error.message
    });
  }
});

module.exports = router;
