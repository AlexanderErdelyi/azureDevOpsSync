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
const ExecutionLogger = require('./ExecutionLogger');

class SyncEngine {
  constructor(syncConfig) {
    this.config = syncConfig;
    this.conflictDetector = new ConflictDetector(syncConfig);
    this.sourceConnector = null;
    this.targetConnector = null;
    this.conflictResolver = null;
    this.logger = new ExecutionLogger();
  }

  /**
   * Initialize connectors
   */
  async initialize() {
    this.logger.info('Initializing sync engine', { config_id: this.config.id, config_name: this.config.name });
    
    this.sourceConnector = await registry.get(this.config.source_connector_id);
    this.targetConnector = await registry.get(this.config.target_connector_id);
    
    this.logger.info('Connecting to source connector', { 
      connector_id: this.config.source_connector_id,
      type: this.sourceConnector.type 
    });
    await this.sourceConnector.connect();
    
    this.logger.info('Connecting to target connector', { 
      connector_id: this.config.target_connector_id,
      type: this.targetConnector.type 
    });
    await this.targetConnector.connect();
    
    this.conflictResolver = new ConflictResolver(
      this.config,
      this.sourceConnector,
      this.targetConnector
    );
    
    this.logger.success('Sync engine initialized successfully');
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
    this.logger.info('Starting unidirectional sync', { 
      direction: isReverse ? 'target-to-source' : 'source-to-target',
      dry_run: dryRun 
    });
    
    // Query work items
    this.logger.info('Querying source work items');
    const sourceWorkItems = await this._queryWorkItems(fromConnector, workItemIds);
    this.logger.info(`Found ${sourceWorkItems.length} work items to sync`);
    
    // Load mappings
    this.logger.info('Loading field and status mappings');
    const mappings = await mappingEngine.loadMappings(this.config.id);
    this.logger.info(`Loaded ${mappings.types?.length || 0} type mappings with ${mappings.fields?.length || 0} field mappings`);
    
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
        this.logger.error(`Failed to sync work item ${sourceItem.id}`, error, {
          work_item_id: sourceItem.id,
          work_item_type: sourceItem.fields?.['System.WorkItemType'],
          title: sourceItem.fields?.['System.Title']
        });
        
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
            sync_count: existing.sync_count + 1
          });
      } else {
        // Create
        const created = await toConnector.createWorkItem(
          mapped.type || 'Task',
          mapped.fields
        );

        targetId = created.id;
        action = 'created';

        // Get source type from sourceItem.type or fields['System.WorkItemType']
        const sourceType = sourceItem.type || sourceItem.fields?.['System.WorkItemType'] || 'unknown';
        
        await db('synced_items').insert({
          sync_config_id: this.config.id,
          source_connector_id: fromConnectorId,
          target_connector_id: toConnectorId,
          source_item_id: sourceItem.id.toString(),
          target_item_id: targetId.toString(),
          source_item_type: sourceType,
          target_item_type: mapped.type || 'Task',
          first_synced_at: new Date(),
          last_synced_at: new Date(),
          sync_count: 1,
          sync_status: 'synced'
        });
      }

      // Sync comments if enabled
      const syncOptions = this.config.options ? JSON.parse(this.config.options) : {};
      if (syncOptions.sync_comments && existing) {
        await this._syncComments(sourceItem.id, targetId, fromConnector, toConnector, existing.id);
      }

      // Sync links if enabled
      if (syncOptions.sync_links && existing) {
        await this._syncLinks(sourceItem.id, targetId, fromConnector, toConnector, existing.id);
      }
    }

    return {
      source_id: sourceItem.id,
      target_id: targetId,
      action: action,
      success: true
    };
  }

  /**
   * Sync comments between work items
   */
  async _syncComments(sourceItemId, targetItemId, fromConnector, toConnector, syncedItemId) {
    try {
      // Check if connectors support comments
      if (!fromConnector.getComments || !toConnector.addComment) {
        this.logger.info('Comments not supported by one or both connectors');
        return;
      }

      // Get source comments
      const sourceComments = await fromConnector.getComments(sourceItemId);
      
      // Get already synced comments
      const syncedComments = await db('synced_comments')
        .where({ synced_item_id: syncedItemId })
        .select('source_comment_id');
      
      const syncedCommentIds = new Set(syncedComments.map(c => c.source_comment_id));

      // Sync new comments
      for (const comment of sourceComments) {
        if (!syncedCommentIds.has(comment.id.toString())) {
          try {
            const targetComment = await toConnector.addComment(
              targetItemId,
              `[Synced from source]\n${comment.text}\n\n--- ${comment.createdBy} (${comment.createdDate})`
            );

            await db('synced_comments').insert({
              synced_item_id: syncedItemId,
              source_comment_id: comment.id.toString(),
              target_comment_id: targetComment.id ? targetComment.id.toString() : null,
              comment_text: comment.text,
              author: comment.createdBy,
              created_at: comment.createdDate,
              synced_at: new Date(),
              sync_status: 'synced'
            });

            this.logger.info(`Synced comment ${comment.id} to work item ${targetItemId}`);
          } catch (error) {
            this.logger.error(`Failed to sync comment ${comment.id}`, error);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to sync comments', error);
    }
  }

  /**
   * Sync work item links/relations
   */
  async _syncLinks(sourceItemId, targetItemId, fromConnector, toConnector, syncedItemId) {
    try {
      // Check if connectors support links
      if (!fromConnector.getWorkItemRelations || !toConnector.addWorkItemRelation) {
        this.logger.info('Work item links not supported by one or both connectors');
        return;
      }

      // Get source relations
      const sourceRelations = await fromConnector.getWorkItemRelations(sourceItemId);
      
      // Get already synced links
      const syncedLinks = await db('synced_links')
        .where({ synced_item_id: syncedItemId })
        .select('link_type', 'source_linked_item_id');
      
      const syncedLinkKeys = new Set(
        syncedLinks.map(l => `${l.link_type}:${l.source_linked_item_id}`)
      );

      // Sync new links
      for (const relation of sourceRelations) {
        const linkKey = `${relation.rel}:${relation.linkedWorkItemId}`;
        
        if (!syncedLinkKeys.has(linkKey) && relation.linkedWorkItemId) {
          try {
            // Check if linked item is also synced
            const linkedItemSync = await db('synced_items')
              .where({
                sync_config_id: this.config.id,
                source_item_id: relation.linkedWorkItemId.toString()
              })
              .first();

            if (linkedItemSync) {
              // Link exists on target side, create the relation
              await toConnector.addWorkItemRelation(
                targetItemId,
                relation.rel,
                linkedItemSync.target_item_id
              );

              await db('synced_links').insert({
                synced_item_id: syncedItemId,
                link_type: relation.rel,
                source_linked_item_id: relation.linkedWorkItemId.toString(),
                target_linked_item_id: linkedItemSync.target_item_id,
                synced_at: new Date(),
                sync_status: 'synced'
              });

              this.logger.info(`Synced link ${relation.rel} to work item ${targetItemId}`);
            } else {
              // Linked item not synced yet, mark as pending
              await db('synced_links').insert({
                synced_item_id: syncedItemId,
                link_type: relation.rel,
                source_linked_item_id: relation.linkedWorkItemId.toString(),
                target_linked_item_id: null,
                synced_at: new Date(),
                sync_status: 'pending'
              });

              this.logger.info(`Link to ${relation.linkedWorkItemId} marked as pending (target not synced yet)`);
            }
          } catch (error) {
            this.logger.error(`Failed to sync link ${relation.rel}`, error);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to sync links', error);
    }
  }

  async _queryWorkItems(connector, workItemIds) {
    if (workItemIds && workItemIds.length > 0) {
      return await Promise.all(
        workItemIds.map(id => connector.getWorkItem(id))
      );
    }

    // If no work item IDs specified, use sync filter or query all work items
    let query;
    if (this.config.sync_filter) {
      query = JSON.parse(this.config.sync_filter);
    } else {
      // Default query: get all work items for enabled types
      const typeMappings = await db('sync_type_mappings')
        .where({ sync_config_id: this.config.id, is_active: true });
      
      if (typeMappings.length === 0) {
        return []; // No type mappings, nothing to sync
      }
      
      // Build a simple query for the enabled work item types
      const sourceTypes = await db('connector_work_item_types')
        .whereIn('id', typeMappings.map(m => m.source_type_id))
        .select('type_name');
      
      // Create a WIQL query for Azure DevOps
      const typeNames = sourceTypes.map(t => t.type_name);
      
      // Build WIQL with project filter if connector has a project property
      let wiqlWhere = `[System.WorkItemType] IN ('${typeNames.join("','")}')`;
      if (connector.project) {
        wiqlWhere += ` AND [System.TeamProject] = '${connector.project}'`;
        this.logger.info('Filtering work items by project', { project: connector.project });
      }
      
      query = {
        wiql: `SELECT [System.Id] FROM WorkItems WHERE ${wiqlWhere}`
      };
    }

    return await connector.queryWorkItems(query);
  }

  /**
   * Preview synchronization - get items that would be synced without executing
   * @param {Object} options - Preview options
   * @returns {Object} Preview results with items to be synced
   */
  async preview(options = {}) {
    const {
      direction = 'source-to-target',
      work_item_ids = null
    } = options;

    try {
      this.logger.info('Starting sync preview', { direction });
      
      let fromConnector, toConnector, fromConnectorId, toConnectorId;
      
      if (direction === 'target-to-source') {
        fromConnector = this.targetConnector;
        toConnector = this.sourceConnector;
        fromConnectorId = this.config.target_connector_id;
        toConnectorId = this.config.source_connector_id;
      } else {
        fromConnector = this.sourceConnector;
        toConnector = this.targetConnector;
        fromConnectorId = this.config.source_connector_id;
        toConnectorId = this.config.target_connector_id;
      }
      
      // Query work items
      const sourceWorkItems = await this._queryWorkItems(fromConnector, work_item_ids);
      this.logger.info(`Found ${sourceWorkItems.length} work items for preview`);
      
      // Load mappings to show what would be mapped
      const mappings = await mappingEngine.loadMappings(this.config.id);
      
      const previewItems = [];
      
      for (const sourceItem of sourceWorkItems) {
        try {
          // Check if this item already has a sync record
          const existingSync = await db('synced_items')
            .where({
              sync_config_id: this.config.id,
              source_connector_id: fromConnectorId,
              source_item_id: sourceItem.id.toString()
            })
            .first();
          
          // Try to map the item to see what would be created/updated
          let mappedFields = {};
          try {
            const mapped = await mappingEngine.mapWorkItem(sourceItem, this.config.id, { test: true });
            mappedFields = mapped.fields || {};
          } catch (mapError) {
            this.logger.warn(`Could not map item ${sourceItem.id}`, { error: mapError.message });
          }
          
          previewItems.push({
            source_id: sourceItem.id,
            source_type: sourceItem.fields?.['System.WorkItemType'],
            title: sourceItem.fields?.['System.Title'],
            state: sourceItem.fields?.['System.State'],
            assigned_to: sourceItem.fields?.['System.AssignedTo']?.displayName,
            action: existingSync ? 'update' : 'create',
            target_id: existingSync ? existingSync.target_item_id : null,
            last_synced_at: existingSync ? existingSync.last_synced_at : null,
            sync_count: existingSync ? existingSync.sync_count : 0,
            mapped_fields: mappedFields
          });
        } catch (error) {
          this.logger.error(`Error previewing item ${sourceItem.id}`, error);
          previewItems.push({
            source_id: sourceItem.id,
            source_type: sourceItem.fields?.['System.WorkItemType'],
            title: sourceItem.fields?.['System.Title'],
            action: 'error',
            error: error.message
          });
        }
      }
      
      return {
        success: true,
        direction,
        total: sourceWorkItems.length,
        items: previewItems,
        summary: {
          to_create: previewItems.filter(i => i.action === 'create').length,
          to_update: previewItems.filter(i => i.action === 'update').length,
          errors: previewItems.filter(i => i.action === 'error').length
        }
      };
      
    } catch (error) {
      this.logger.error('Preview failed', error);
      throw error;
    }
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
      direction: 'source-to-target',
      trigger: 'manual',
      status: 'running',
      started_at: new Date()
    });

    return id;
  }

  async _completeExecution(executionId, results, dryRun) {
    if (dryRun || !executionId) return;

    this.logger.success('Sync execution completed', {
      created: results.created,
      updated: results.updated,
      skipped: results.skipped,
      errors: results.errors
    });

    await db('sync_executions')
      .where({ id: executionId })
      .update({
        status: results.errors > 0 ? 'completed_with_errors' : 'completed',
        completed_at: new Date(),
        items_created: results.created || 0,
        items_updated: results.updated || 0,
        items_synced: (results.created || 0) + (results.updated || 0),
        items_failed: results.errors || 0,
        items_processed: (results.created || 0) + (results.updated || 0) + (results.errors || 0),
        conflicts_detected: results.conflicts_detected || 0,
        execution_logs: this.logger.getLogsJSON()
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

    this.logger.error('Sync execution failed', error);

    await db('sync_executions')
      .where({ id: executionId })
      .update({
        status: 'failed',
        completed_at: new Date(),
        error_message: error.message,
        execution_logs: this.logger.getLogsJSON()
      });

    await this._logError(executionId, null, error, 'execution_failed');
  }

  async _logError(executionId, workItemId, error, errorType = 'sync_failed') {
    await db('sync_errors').insert({
      sync_execution_id: executionId,
      item_id: workItemId ? workItemId.toString() : null,
      error_type: errorType,
      error_message: error.message,
      stack_trace: error.stack,
      created_at: new Date()
    });
  }
}

module.exports = SyncEngine;
