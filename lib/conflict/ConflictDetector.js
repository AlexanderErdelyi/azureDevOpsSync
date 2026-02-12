/**
 * ConflictDetector - Detects changes and conflicts in bidirectional sync
 * 
 * Responsibilities:
 * - Track work item versions and changes
 * - Detect concurrent modifications
 * - Identify field-level conflicts
 * - Create conflict records
 */

const crypto = require('crypto');
const { db } = require('../../database/db');

class ConflictDetector {
  constructor(syncConfig) {
    this.syncConfig = syncConfig;
  }

  /**
   * Capture a snapshot of a work item's current state
   */
  async captureVersion(connectorType, connectorId, workItem, executionId = null) {
    const fieldsSnapshot = JSON.stringify(workItem.fields);
    const hash = this._generateHash(fieldsSnapshot);

    const version = {
      sync_config_id: this.syncConfig.id,
      connector_type: connectorType,
      connector_id: connectorId,
      work_item_id: workItem.id.toString(),
      work_item_type: workItem.fields['System.WorkItemType'],
      version: 1, // Will be incremented
      revision: workItem.rev?.toString() || null,
      changed_date: workItem.fields['System.ChangedDate'] || new Date().toISOString(),
      changed_by: workItem.fields['System.ChangedBy']?.displayName || null,
      fields_snapshot: fieldsSnapshot,
      hash: hash,
      execution_id: executionId,
      captured_at: new Date().toISOString()
    };

    // Get previous version to increment version number
    const previousVersion = await db('work_item_versions')
      .where({
        sync_config_id: this.syncConfig.id,
        connector_id: connectorId,
        work_item_id: workItem.id.toString()
      })
      .orderBy('version', 'desc')
      .first();

    if (previousVersion) {
      version.version = previousVersion.version + 1;
    }

    const [versionId] = await db('work_item_versions').insert(version);
    return { ...version, id: versionId };
  }

  /**
   * Detect if a work item has changed since last sync
   */
  async hasChanged(connectorId, workItemId, currentFields) {
    const latestVersion = await this._getLatestVersion(connectorId, workItemId);
    
    if (!latestVersion) {
      return { changed: true, isNew: true };
    }

    const currentHash = this._generateHash(JSON.stringify(currentFields));
    
    return {
      changed: currentHash !== latestVersion.hash,
      isNew: false,
      previousVersion: latestVersion
    };
  }

  /**
   * Detect conflicts between source and target work items
   */
  async detectConflicts(sourceWorkItem, targetWorkItem, fieldMappings, executionId = null) {
    const conflicts = [];

    // Get last known versions of both items
    const sourceLastVersion = await this._getLatestVersion(
      this.syncConfig.source_connector_id,
      sourceWorkItem.id.toString()
    );
    const targetLastVersion = await this._getLatestVersion(
      this.syncConfig.target_connector_id,
      targetWorkItem.id.toString()
    );

    // Both items changed since last sync - potential conflict
    if (sourceLastVersion && targetLastVersion) {
      const sourceChanged = this._hasChangedSinceVersion(sourceWorkItem, sourceLastVersion);
      const targetChanged = this._hasChangedSinceVersion(targetWorkItem, targetLastVersion);

      if (sourceChanged && targetChanged) {
        // Field-level conflict detection
        for (const mapping of fieldMappings) {
          const sourceField = mapping.source_field;
          const targetField = mapping.target_field;

          const sourceValue = sourceWorkItem.fields[sourceField];
          const targetValue = targetWorkItem.fields[targetField];
          const sourceBaseValue = JSON.parse(sourceLastVersion.fields_snapshot)[sourceField];
          const targetBaseValue = JSON.parse(targetLastVersion.fields_snapshot)[targetField];

          // Check if both sides changed the same field differently
          if (this._valuesChanged(sourceValue, sourceBaseValue) && 
              this._valuesChanged(targetValue, targetBaseValue) &&
              !this._valuesEqual(sourceValue, targetValue)) {
            
            conflicts.push({
              sync_config_id: this.syncConfig.id,
              execution_id: executionId,
              source_work_item_id: sourceWorkItem.id.toString(),
              target_work_item_id: targetWorkItem.id.toString(),
              work_item_type: sourceWorkItem.fields['System.WorkItemType'],
              conflict_type: 'field_conflict',
              field_name: targetField,
              source_value: this._serializeValue(sourceValue),
              target_value: this._serializeValue(targetValue),
              base_value: this._serializeValue(sourceBaseValue),
              status: 'unresolved',
              metadata: JSON.stringify({
                source_changed_date: sourceWorkItem.fields['System.ChangedDate'],
                target_changed_date: targetWorkItem.fields['System.ChangedDate'],
                source_changed_by: sourceWorkItem.fields['System.ChangedBy']?.displayName,
                target_changed_by: targetWorkItem.fields['System.ChangedBy']?.displayName,
                mapping: mapping
              }),
              detected_at: new Date().toISOString()
            });
          }
        }
      }
    }

    // Version conflict - detect out-of-order updates
    if (sourceLastVersion && targetLastVersion) {
      const sourceDate = new Date(sourceWorkItem.fields['System.ChangedDate']);
      const targetDate = new Date(targetWorkItem.fields['System.ChangedDate']);
      const sourceBaseDate = new Date(sourceLastVersion.changed_date);
      const targetBaseDate = new Date(targetLastVersion.changed_date);

      // If both have newer timestamps than last sync, version conflict
      if (sourceDate > sourceBaseDate && targetDate > targetBaseDate) {
        const existingConflict = conflicts.find(c => c.conflict_type === 'field_conflict');
        if (!existingConflict) {
          conflicts.push({
            sync_config_id: this.syncConfig.id,
            execution_id: executionId,
            source_work_item_id: sourceWorkItem.id.toString(),
            target_work_item_id: targetWorkItem.id.toString(),
            work_item_type: sourceWorkItem.fields['System.WorkItemType'],
            conflict_type: 'version_conflict',
            field_name: null,
            source_value: sourceDate.toISOString(),
            target_value: targetDate.toISOString(),
            base_value: sourceBaseDate.toISOString(),
            status: 'unresolved',
            metadata: JSON.stringify({
              source_revision: sourceWorkItem.rev,
              target_revision: targetWorkItem.rev,
              source_changed_by: sourceWorkItem.fields['System.ChangedBy']?.displayName,
              target_changed_by: targetWorkItem.fields['System.ChangedBy']?.displayName
            }),
            detected_at: new Date().toISOString()
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Save detected conflicts to database
   */
  async saveConflicts(conflicts) {
    if (conflicts.length === 0) {
      return [];
    }

    const conflictIds = await db('sync_conflicts').insert(conflicts);
    return conflictIds;
  }

  /**
   * Get all unresolved conflicts for a sync config
   */
  async getUnresolvedConflicts(syncConfigId) {
    return await db('sync_conflicts')
      .where({
        sync_config_id: syncConfigId,
        status: 'unresolved'
      })
      .orderBy('detected_at', 'desc');
  }

  /**
   * Check if work item has been deleted in one system
   */
  async detectDeletion(connectorId, workItemId) {
    const lastVersion = await this._getLatestVersion(connectorId, workItemId);
    
    if (!lastVersion) {
      return null; // Never synced
    }

    // If we have a version but item no longer exists, it was deleted
    return {
      conflict_type: 'deletion_conflict',
      deleted_at: new Date().toISOString(),
      last_known_version: lastVersion
    };
  }

  // Private helper methods

  _generateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async _getLatestVersion(connectorId, workItemId) {
    return await db('work_item_versions')
      .where({
        sync_config_id: this.syncConfig.id,
        connector_id: connectorId,
        work_item_id: workItemId.toString()
      })
      .orderBy('version', 'desc')
      .first();
  }

  _hasChangedSinceVersion(workItem, version) {
    const currentHash = this._generateHash(JSON.stringify(workItem.fields));
    return currentHash !== version.hash;
  }

  _valuesChanged(current, previous) {
    return !this._valuesEqual(current, previous);
  }

  _valuesEqual(val1, val2) {
    // Handle null/undefined
    if (val1 == null && val2 == null) return true;
    if (val1 == null || val2 == null) return false;

    // Handle objects (like identity fields)
    if (typeof val1 === 'object' && typeof val2 === 'object') {
      return JSON.stringify(val1) === JSON.stringify(val2);
    }

    // Handle arrays
    if (Array.isArray(val1) && Array.isArray(val2)) {
      return JSON.stringify(val1) === JSON.stringify(val2);
    }

    // Simple comparison
    return val1 === val2;
  }

  _serializeValue(value) {
    if (value == null) return null;
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }
}

module.exports = ConflictDetector;
