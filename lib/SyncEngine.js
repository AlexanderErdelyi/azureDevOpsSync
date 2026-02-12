/**
 * SyncEngine - Core synchronization engine with conflict resolution
 * 
 * Responsibilities:
 * - Execute sync operations between connectors
 * - Detect and resolve conflicts in bidirectional sync
 * - Track work item versions
 * - Manage sync state and history
 */

const { db } = require('../database/db');
const { registry } = require('./connectors');
const mappingEngine = require('./mapping/MappingEngine');
const ConflictDetector = require('./conflict/ConflictDetector');
const ConflictResolver = require('./conflict/ConflictResolver');

class SyncEngine {
  constructor(syncConfig) {
    this.config = syncConfig;
    this.conflictDetector = new ConflictDetector(syncConfig);
    this.sourceConnector = null;
    this.targetConnector = null;
    this.conflictResolver = null;
  }

  /**
   * Initialize connectors
   */
  async initialize() {
    this.sourceConnector = await registry.get(this.config.source_connector_id);
    this.targetConnector = await registry.get(this.config.target_connector_id);
    
    await this.sourceConnector.connect();
    await this.targetConnector.connect();
    
    this.conflictResolver = new ConflictResolver(
      this.config,
      this.sourceConnector,
      this.targetConnector
    );
  }

  /**
   * Execute synchronization
   */
  async execute(options = {}) {
    const {
      work_item_ids = null,
      dry_run = false,
      direction = 'source-to-target' // 'source-to-target', 'target-to-source', 'bidirectional'
    } = options;

    const executionId = await this._createExecution(dry_run);
    
    try {
      let results;
      
      if (this.config.bidirectional || direction === 'bidirectional') {
        // Bidirectional sync with conflict detection
        results = await this._executeBidirectionalSync(executionId, work_item_ids, dry_run);
      } else if (direction === 'target-to-source') {
        // Reverse sync
        results = await this._executeUnidirectionalSync(
          executionId,
          this.targetConnector,
          this.sourceConnector,
          this.config.target_connector_id,
          this.config.source_connector_id,
          work_item_ids,
          dry_run,
          true // reverse
        );
      } else {
        // Default source to target
        results = await this._executeUnidirectionalSync(
          executionId,
          this.sourceConnector,
          this.targetConnector,
          this.config.source_connector_id,
          this.config.target_connector_id,
          work_item_ids,
          dry_run,
          false
        );
      }

      await this._completeExecution(executionId, results, dry_run);
      
      return {
        success: true,
        execution_id: executionId,
        results
      };

    } catch (error) {
      await this._failExecution(executionId, error, dry_run);
      throw error;
    }
  }

  /**
   * Execute unidirectional sync (source → target)
   */
  async _executeUnidirectionalSync(
    executionId,
    fromConnector,
    toConnector,
    fromConnectorId,
    toConnectorId,
    workItemIds,
    dryRun,
    isReverse
  ) {
    // Query work items
    const sourceWorkItems = await this._queryWorkItems(fromConnector, workItemIds);
    
    // Load mappings
    const mappings = await mappingEngine.loadMappings(this.config.id);
    
    const results = {
      total: sourceWorkItems.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      conflicts_detected: 0,
      conflicts_resolved: 0,
      items: []
    };

    for (const sourceItem of sourceWorkItems) {
      try {
        const itemResult = await this._syncWorkItem(
          sourceItem,
          fromConnector,
          toConnector,
          fromConnectorId,
          toConnectorId,
          mappings,
          executionId,
          dryRun,
          isReverse
        );

        results[itemResult.action]++;
        results.items.push(itemResult);

        if (itemResult.conflict) {
          results.conflicts_detected++;
          if (itemResult.conflict_resolved) {
            results.conflicts_resolved++;
          }
        }

        // Capture version if version tracking enabled
        if (this.config.track_versions && !dryRun) {
          await this.conflictDetector.captureVersion(
            isReverse ? 'target' : 'source',
            fromConnectorId,
            sourceItem,
            executionId
          );
        }

      } catch (error) {
        console.error(`Error syncing work item ${sourceItem.id}:`, error);
        results.errors++;
        results.items.push({
          source_id: sourceItem.id,
          action: 'error',
          success: false,
          error: error.message
        });

        if (!dryRun) {
          await this._logError(executionId, sourceItem.id, error);
        }
      }
    }

    return results;
  }

  /**
   * Execute bidirectional sync with conflict detection
   */
  async _executeBidirectionalSync(executionId, workItemIds, dryRun) {
    const results = {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      conflicts_detected: 0,
      conflicts_resolved: 0,
      conflicts_manual: 0,
      items: []
    };

    // Get all synced item pairs
    const syncedPairs = await db('synced_items')
      .where({ sync_config_id: this.config.id });

    // Load mappings
    const mappings = await mappingEngine.loadMappings(this.config.id);

    for (const pair of syncedPairs) {
      try {
        // Fetch both work items
        const sourceItem = await this.sourceConnector.getWorkItem(pair.source_item_id);
        const targetItem = await this.targetConnector.getWorkItem(pair.target_item_id);

        results.total++;

        // Check for changes on both sides
        const sourceCheck = await this.conflictDetector.hasChanged(
          this.config.source_connector_id,
          pair.source_item_id,
          sourceItem.fields
        );
        const targetCheck = await this.conflictDetector.hasChanged(
          this.config.target_connector_id,
          pair.target_item_id,
          targetItem.fields
        );

        // Detect conflicts if both sides changed
        let conflicts = [];
        if (sourceCheck.changed && targetCheck.changed) {
          conflicts = await this.conflictDetector.detectConflicts(
            sourceItem,
            targetItem,
            mappings.mappings,
            executionId
          );

          if (conflicts.length > 0) {
            results.conflicts_detected += conflicts.length;
            
            if (!dryRun) {
              await this.conflictDetector.saveConflicts(conflicts);
            }

            // Attempt automatic resolution
            for (const conflict of conflicts) {
              try {
                const resolution = await this.conflictResolver.resolve(conflict);
                
                if (resolution.requiresManual) {
                  results.conflicts_manual++;
                } else {
                  if (!dryRun) {
                    await this.conflictResolver.applyResolution(conflict, resolution);
                  }
                  results.conflicts_resolved++;
                }
              } catch (resError) {
                console.error('Conflict resolution failed:', resError);
              }
            }
          }
        } else if (sourceCheck.changed) {
          // Only source changed - sync to target
          if (!dryRun) {
            const mapped = await mappingEngine.mapWorkItem(sourceItem, this.config.id);
            await this.targetConnector.updateWorkItem(pair.target_item_id, mapped.fields);
            results.updated++;
          }

          results.items.push({
            source_id: pair.source_item_id,
            target_id: pair.target_item_id,
            action: dryRun ? 'would_update' : 'updated',
            direction: 'source-to-target',
            success: true
          });

        } else if (targetCheck.changed) {
          // Only target changed - sync to source (reverse mapping)
          if (!dryRun) {
            const reverseMapped = await this._reverseMapWorkItem(targetItem, mappings);
            await this.sourceConnector.updateWorkItem(pair.source_item_id, reverseMapped.fields);
            results.updated++;
          }

          results.items.push({
            source_id: pair.source_item_id,
            target_id: pair.target_item_id,
            action: dryRun ? 'would_update' : 'updated',
            direction: 'target-to-source',
            success: true
          });

        } else {
          // No changes
          results.skipped++;
        }

        // Update version snapshots
        if (this.config.track_versions && !dryRun) {
          if (sourceCheck.changed) {
            await this.conflictDetector.captureVersion(
              'source',
              this.config.source_connector_id,
              sourceItem,
              executionId
            );
          }
          if (targetCheck.changed) {
            await this.conflictDetector.captureVersion(
              'target',
              this.config.target_connector_id,
              targetItem,
              executionId
            );
          }
        }

      } catch (error) {
        console.error('Bidirectional sync error:', error);
        results.errors++;
        results.items.push({
          source_id: pair.source_item_id,
          target_id: pair.target_item_id,
          action: 'error',
          success: false,
          error: error.message
        });

        if (!dryRun) {
          await this._logError(executionId, pair.source_item_id, error);
        }
      }
    }

    return results;
  }

  /**
   * Sync individual work item
   */
  async _syncWorkItem(
    sourceItem,
    fromConnector,
    toConnector,
    fromConnectorId,
    toConnectorId,
    mappings,
    executionId,
    dryRun,
    isReverse
  ) {
    // Map the work item
    const mapped = await mappingEngine.mapWorkItem(sourceItem, this.config.id, {
      sourceConnector: fromConnector.getName(),
      targetConnector: toConnector.getName()
    });

    // Check if already synced
    const existing = await db('synced_items')
      .where({
        sync_config_id: this.config.id,
        source_connector_id: fromConnectorId,
        source_item_id: sourceItem.id.toString()
      })
      .first();

    let targetId = existing ? existing.target_item_id : null;
    let action = 'skipped';

    if (dryRun) {
      action = existing ? 'would_update' : 'would_create';
    } else {
      if (existing) {
        // Update
        await toConnector.updateWorkItem(targetId, mapped.fields);
        action = 'updated';

        await db('synced_items')
          .where({ id: existing.id })
          .update({
            last_synced_at: new Date(),
            sync_count: existing.sync_count + 1,
            updated_at: new Date()
          });
      } else {
        // Create
        const created = await toConnector.createWorkItem(
          mapped.type || 'Task',
          mapped.fields
        );

        targetId = created.id;
        action = 'created';

        await db('synced_items').insert({
          sync_config_id: this.config.id,
          source_connector_id: fromConnectorId,
          target_connector_id: toConnectorId,
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

    return {
      source_id: sourceItem.id,
      target_id: targetId,
      action: action,
      success: true
    };
  }

  async _queryWorkItems(connector, workItemIds) {
    if (workItemIds && workItemIds.length > 0) {
      return await Promise.all(
        workItemIds.map(id => connector.getWorkItem(id))
      );
    }

    const query = this.config.sync_filter ? JSON.parse(this.config.sync_filter) : null;
    if (!query) {
      throw new Error('Must specify work_item_ids or configure sync_filter');
    }

    return await connector.queryWorkItems(query);
  }

  async _reverseMapWorkItem(targetItem, mappings) {
    // Simple reverse mapping - swap source and target fields
    const reverseMapped = { fields: {} };
    
    for (const mapping of mappings.mappings) {
      const targetValue = targetItem.fields[mapping.target_field];
      if (targetValue !== undefined) {
        reverseMapped.fields[mapping.source_field] = targetValue;
      }
    }

    return reverseMapped;
  }

  async _createExecution(dryRun) {
    if (dryRun) return null;

    const [id] = await db('sync_executions').insert({
      sync_config_id: this.config.id,
      source_connector_id: this.config.source_connector_id,
      target_connector_id: this.config.target_connector_id,
      status: 'running',
      started_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    });

    return id;
  }

  async _completeExecution(executionId, results, dryRun) {
    if (dryRun || !executionId) return;

    await db('sync_executions')
      .where({ id: executionId })
      .update({
        status: results.errors > 0 ? 'completed_with_errors' : 'completed',
        ended_at: new Date(),
        items_synced: results.created + results.updated,
        items_failed: results.errors,
        conflicts_detected: results.conflicts_detected || 0,
        conflicts_resolved: results.conflicts_resolved || 0,
        conflicts_unresolved: (results.conflicts_detected || 0) - (results.conflicts_resolved || 0),
        updated_at: new Date()
      });

    await db('sync_configs')
      .where({ id: this.config.id })
      .update({
        last_sync_at: new Date(),
        updated_at: new Date()
      });
  }

  async _failExecution(executionId, error, dryRun) {
    if (dryRun || !executionId) return;

    await db('sync_executions')
      .where({ id: executionId })
      .update({
        status: 'failed',
        ended_at: new Date(),
        updated_at: new Date()
      });

    await this._logError(executionId, null, error, 'execution_failed');
  }

  async _logError(executionId, workItemId, error, errorType = 'sync_failed') {
    await db('sync_errors').insert({
      sync_execution_id: executionId,
      sync_config_id: this.config.id,
      source_item_id: workItemId ? workItemId.toString() : null,
      error_type: errorType,
      error_message: error.message,
      stack_trace: error.stack,
      created_at: new Date()
    });
  }
}

module.exports = SyncEngine;
