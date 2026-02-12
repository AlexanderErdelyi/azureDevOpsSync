/**
 * ConflictResolver - Resolves conflicts using various strategies
 * 
 * Strategies:
 * - last-write-wins: Most recent change wins
 * - source-priority: Source system always wins
 * - target-priority: Target system always wins
 * - manual: Requires human intervention
 * - merge: Attempt intelligent field-level merge
 */

const { db } = require('../../database/db');

class ConflictResolver {
  constructor(syncConfig, sourceConnector, targetConnector) {
    this.syncConfig = syncConfig;
    this.sourceConnector = sourceConnector;
    this.targetConnector = targetConnector;
  }

  /**
   * Resolve a conflict using the configured strategy
   */
  async resolve(conflict, strategy = null) {
    const resolutionStrategy = strategy || this.syncConfig.conflict_resolution_strategy || 'last-write-wins';

    let resolution;
    switch (resolutionStrategy) {
      case 'last-write-wins':
        resolution = await this._resolveLastWriteWins(conflict);
        break;
      case 'source-priority':
        resolution = await this._resolveSourcePriority(conflict);
        break;
      case 'target-priority':
        resolution = await this._resolveTargetPriority(conflict);
        break;
      case 'merge':
        resolution = await this._resolveMerge(conflict);
        break;
      case 'manual':
        return { requiresManual: true, conflict };
      default:
        throw new Error(`Unknown resolution strategy: ${resolutionStrategy}`);
    }

    // Save resolution
    await this._saveResolution(conflict.id, resolution);

    // Update conflict status
    await db('sync_conflicts')
      .where({ id: conflict.id })
      .update({
        status: 'resolved',
        resolution_strategy: resolutionStrategy,
        resolved_value: resolution.resolvedValue,
        resolved_by: 'system',
        resolved_at: new Date().toISOString()
      });

    return resolution;
  }

  /**
   * Manually resolve a conflict with a specific value
   */
  async resolveManually(conflictId, resolvedValue, rationale, resolvedBy) {
    const conflict = await db('sync_conflicts').where({ id: conflictId }).first();
    
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    if (conflict.status === 'resolved') {
      throw new Error(`Conflict ${conflictId} already resolved`);
    }

    // Update conflict
    await db('sync_conflicts')
      .where({ id: conflictId })
      .update({
        status: 'resolved',
        resolution_strategy: 'manual',
        resolved_value: resolvedValue,
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString()
      });

    // Save resolution record
    const resolution = {
      conflict_id: conflictId,
      strategy: 'manual',
      previous_value: conflict.target_value,
      resolved_value: resolvedValue,
      rationale: rationale,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString()
    };

    const [resolutionId] = await db('conflict_resolutions').insert(resolution);

    return { ...resolution, id: resolutionId };
  }

  /**
   * Apply resolved value to target system
   */
  async applyResolution(conflict, resolution) {
    try {
      const metadata = conflict.metadata ? JSON.parse(conflict.metadata) : {};
      
      // Determine which field to update
      const fieldName = conflict.field_name;
      const resolvedValue = resolution.resolvedValue;

      // Build update payload
      const updateFields = {
        [fieldName]: this._deserializeValue(resolvedValue)
      };

      // Apply to target system
      let targetResult = null;
      if (conflict.target_work_item_id) {
        try {
          targetResult = await this.targetConnector.updateWorkItem(
            conflict.target_work_item_id,
            updateFields
          );
        } catch (error) {
          console.error('Failed to apply resolution to target:', error.message);
          targetResult = { error: error.message };
        }
      }

      // For bidirectional sync, may need to update source too
      let sourceResult = null;
      if (this.syncConfig.bidirectional && resolution.strategy === 'target-priority') {
        try {
          sourceResult = await this.sourceConnector.updateWorkItem(
            conflict.source_work_item_id,
            updateFields
          );
        } catch (error) {
          console.error('Failed to apply resolution to source:', error.message);
          sourceResult = { error: error.message };
        }
      }

      // Update resolution record
      await db('conflict_resolutions')
        .where({ conflict_id: conflict.id })
        .update({
          applied_to_source: sourceResult !== null,
          applied_to_target: targetResult !== null,
          application_result: JSON.stringify({
            source: sourceResult,
            target: targetResult,
            applied_at: new Date().toISOString()
          })
        });

      return {
        success: true,
        sourceApplied: sourceResult !== null && !sourceResult.error,
        targetApplied: targetResult !== null && !targetResult.error,
        sourceResult,
        targetResult
      };

    } catch (error) {
      console.error('Failed to apply resolution:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Batch resolve multiple conflicts
   */
  async resolveMany(conflicts, strategy = null) {
    const results = [];
    
    for (const conflict of conflicts) {
      try {
        const resolution = await this.resolve(conflict, strategy);
        results.push({
          conflictId: conflict.id,
          success: true,
          resolution
        });
      } catch (error) {
        results.push({
          conflictId: conflict.id,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get conflict resolution history
   */
  async getResolutionHistory(conflictId) {
    return await db('conflict_resolutions')
      .where({ conflict_id: conflictId })
      .orderBy('resolved_at', 'desc');
  }

  // Resolution Strategies

  /**
   * Last Write Wins - Most recent change takes precedence
   */
  async _resolveLastWriteWins(conflict) {
    const metadata = conflict.metadata ? JSON.parse(conflict.metadata) : {};
    const sourceDate = new Date(metadata.source_changed_date || 0);
    const targetDate = new Date(metadata.target_changed_date || 0);

    const winner = sourceDate > targetDate ? 'source' : 'target';
    const resolvedValue = winner === 'source' ? conflict.source_value : conflict.target_value;

    return {
      strategy: 'last-write-wins',
      winner,
      resolvedValue,
      rationale: `${winner} had the most recent change (${winner === 'source' ? sourceDate : targetDate})`,
      metadata: {
        source_date: sourceDate,
        target_date: targetDate
      }
    };
  }

  /**
   * Source Priority - Source system always wins
   */
  async _resolveSourcePriority(conflict) {
    return {
      strategy: 'source-priority',
      winner: 'source',
      resolvedValue: conflict.source_value,
      rationale: 'Source system takes priority per configuration'
    };
  }

  /**
   * Target Priority - Target system always wins
   */
  async _resolveTargetPriority(conflict) {
    return {
      strategy: 'target-priority',
      winner: 'target',
      resolvedValue: conflict.target_value,
      rationale: 'Target system takes priority per configuration'
    };
  }

  /**
   * Merge - Attempt intelligent merge (basic implementation)
   */
  async _resolveMerge(conflict) {
    // For text fields, try to merge if possible
    const sourceVal = conflict.source_value;
    const targetVal = conflict.target_value;
    const baseVal = conflict.base_value;

    // If one side didn't change from base, use the other
    if (sourceVal === baseVal) {
      return {
        strategy: 'merge',
        winner: 'target',
        resolvedValue: targetVal,
        rationale: 'Source unchanged, accepted target changes'
      };
    }

    if (targetVal === baseVal) {
      return {
        strategy: 'merge',
        winner: 'source',
        resolvedValue: sourceVal,
        rationale: 'Target unchanged, accepted source changes'
      };
    }

    // Both changed - fall back to last-write-wins
    return await this._resolveLastWriteWins(conflict);
  }

  async _saveResolution(conflictId, resolution) {
    const record = {
      conflict_id: conflictId,
      strategy: resolution.strategy,
      previous_value: null, // Could retrieve from conflict
      resolved_value: resolution.resolvedValue,
      rationale: resolution.rationale,
      resolved_by: 'system',
      resolved_at: new Date().toISOString(),
      metadata: JSON.stringify(resolution.metadata || {})
    };

    const [resolutionId] = await db('conflict_resolutions').insert(record);
    return { ...record, id: resolutionId };
  }

  _deserializeValue(value) {
    if (value == null) return null;
    
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}

module.exports = ConflictResolver;
