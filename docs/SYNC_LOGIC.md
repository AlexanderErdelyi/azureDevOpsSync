# Sync Logic Documentation

## Bidirectional Sync Logic

### Overview

The Azure DevOps Sync application supports bidirectional synchronization between work item systems. This document explains how the sync determines the direction and source of data.

### How Bidirectional Sync Works

When a sync configuration is set to `bidirectional: true`, the system performs the following logic:

1. **Load Synced Pairs**: Retrieves all previously synced work item pairs from the `synced_items` table
2. **Fetch Both Sides**: For each pair, fetches the current state from both source and target connectors
3. **Detect Changes**: Uses the `ConflictDetector` to determine if changes occurred on either or both sides
4. **Conflict Resolution**: Applies the configured resolution strategy when both sides have changed

### Determining Sync Direction

The sync direction is determined by several factors:

#### 1. **Explicit Direction Parameter**

When executing a sync via the API, you can specify the direction:

```javascript
POST /api/execute/sync/:configId
{
  "direction": "source-to-target" | "target-to-source" | "bidirectional"
}
```

- `source-to-target`: Only sync from source to target (one-way)
- `target-to-source`: Only sync from target to source (reverse one-way)
- `bidirectional`: Check both sides for changes and sync as needed

#### 2. **Configuration Direction**

The `sync_configs.direction` field determines the default behavior:

- `one-way`: Always syncs source → target only
- `bidirectional`: Checks both sides and syncs changes in either direction

#### 3. **Change Detection**

For bidirectional syncs, the system:

1. Compares the last known version (stored in version tracking) with current state
2. Determines which side(s) have changed since last sync
3. Applies changes based on the change pattern:
   - **Only source changed**: Sync source → target
   - **Only target changed**: Sync target → source  
   - **Both changed**: Conflict! Apply resolution strategy

### Conflict Resolution Strategies

When both sides have changed, the `conflict_resolution` setting determines how to proceed:

- `last-write-wins`: The item that was modified most recently wins
- `source-priority`: Source always wins conflicts
- `target-priority`: Target always wins conflicts
- `manual`: Save conflict for manual resolution via UI

### Version Tracking

The system maintains version information in the `synced_items` table:

- `source_last_modified`: Last modification timestamp from source
- `target_last_modified`: Last modification timestamp from target
- `last_sync_direction`: Which direction was used in the last sync

This data helps determine what changed since the last sync.

## Preview/Prepare Sync

### How Preview Works

The preview endpoint (`POST /api/execute/preview/:configId`) allows you to see what would be synchronized before executing:

1. **Query Source Items**: Fetches work items from the source connector based on filters
2. **Check Sync Status**: For each item, checks if it's already synced
3. **Determine Action**: 
   - `create`: Item doesn't exist in target, will be created
   - `update`: Item exists in target, will be updated
   - `error`: Item has mapping or validation errors
4. **Preview Mapping**: Shows how fields would be mapped (without actually syncing)

### Using Preview

```javascript
POST /api/execute/preview/:configId
{
  "direction": "source-to-target",
  "work_item_ids": [123, 456, 789] // Optional: preview specific items
}

Response:
{
  "success": true,
  "direction": "source-to-target",
  "total": 10,
  "items": [
    {
      "source_id": 123,
      "source_type": "User Story",
      "title": "Implement login feature",
      "state": "Active",
      "action": "create",
      "target_id": null,
      "mapped_fields": { /* field mappings */ }
    },
    ...
  ],
  "summary": {
    "to_create": 5,
    "to_update": 4,
    "errors": 1
  }
}
```

After reviewing the preview, you can execute the sync with specific item IDs:

```javascript
POST /api/execute/sync/:configId
{
  "work_item_ids": [123, 456], // Only sync selected items
  "dry_run": false
}
```

## Comments Sync

### Configuration

Comments sync is controlled by the `options` JSON field in `sync_configs`:

```json
{
  "sync_comments": true,
  "sync_links": true
}
```

### How Comments Are Synced

1. **Fetch Source Comments**: Gets all comments from source work item via connector's `getComments()` method
2. **Check Synced Comments**: Queries `synced_comments` table to avoid duplicates
3. **Sync New Comments**: For each new comment:
   - Adds comment to target work item with `[Synced from source]` prefix
   - Includes original author and timestamp
   - Records in `synced_comments` table

### Comments Table Schema

```sql
CREATE TABLE synced_comments (
  id INTEGER PRIMARY KEY,
  synced_item_id INTEGER,          -- Links to synced_items
  source_comment_id TEXT,          -- Original comment ID
  target_comment_id TEXT,          -- Synced comment ID
  comment_text TEXT,               -- Comment content
  author TEXT,                     -- Original author
  created_at DATETIME,             -- Original creation time
  synced_at DATETIME,              -- When sync occurred
  sync_status TEXT                 -- 'synced', 'pending', 'error'
);
```

## Work Item Links

### Configuration

Link sync is controlled by the `options` JSON field in `sync_configs`:

```json
{
  "sync_links": true
}
```

### How Links Are Synced

1. **Fetch Source Relations**: Gets work item relations via connector's `getWorkItemRelations()` method
2. **Check Synced Links**: Queries `synced_links` table to avoid duplicates
3. **Resolve Linked Items**: For each link:
   - Checks if the linked item is also synced (exists in `synced_items`)
   - If yes: Creates the relation in target system
   - If no: Marks link as `pending` for future sync

### Supported Link Types

Azure DevOps supports various relation types:

- `System.LinkTypes.Hierarchy-Forward`: Parent link
- `System.LinkTypes.Hierarchy-Reverse`: Child link
- `System.LinkTypes.Related`: Related work item
- `System.LinkTypes.Dependency-Forward`: Depends on
- `System.LinkTypes.Dependency-Reverse`: Dependency for

### Links Table Schema

```sql
CREATE TABLE synced_links (
  id INTEGER PRIMARY KEY,
  synced_item_id INTEGER,          -- Links to synced_items
  link_type TEXT,                  -- Relation type
  source_linked_item_id TEXT,      -- Source linked item ID
  target_linked_item_id TEXT,      -- Target linked item ID (null if not synced yet)
  synced_at DATETIME,
  sync_status TEXT                 -- 'synced', 'pending', 'error'
);
```

### Parent-Child Relationships

For parent-child hierarchies (e.g., User Story → Task):

1. Sync parent item first (e.g., User Story)
2. Sync child item (e.g., Task)
3. On child sync, create parent link using `addWorkItemRelation()`
4. Link uses `System.LinkTypes.Hierarchy-Reverse` to indicate child → parent relationship

Example:

```javascript
// After syncing both User Story and Task
await targetConnector.addWorkItemRelation(
  childTaskId,                                    // Child work item
  'System.LinkTypes.Hierarchy-Reverse',          // Link type (child to parent)
  parentUserStoryId                               // Parent work item
);
```

## Scheduler Health Monitoring

### Health Check Mechanism

The scheduler includes a heartbeat mechanism to monitor health:

1. **Heartbeat Interval**: Updates `lastHeartbeat` timestamp every 30 seconds
2. **Health Status**: Calculated based on heartbeat age:
   - `healthy`: Running and heartbeat < 2 minutes old
   - `degraded`: Running but heartbeat stale (> 2 minutes)
   - `stopped`: Not running

### Status Endpoint

```javascript
GET /api/scheduler/status

Response:
{
  "success": true,
  "scheduler": {
    "isRunning": true,
    "isHealthy": true,
    "status": "healthy",
    "lastHeartbeat": 1707749280000,
    "heartbeatAgeSeconds": 15,
    "jobCount": 3,
    "jobs": [
      {
        "configId": 1,
        "configName": "Azure to ServiceDesk",
        "cronExpression": "0 * * * *",
        "nextRun": "2026-02-12T16:00:00Z",
        "lastRun": "2026-02-12T15:00:00Z",
        "isRunning": true
      }
    ]
  }
}
```

### Monitoring in UI

The scheduler status should be displayed in the UI showing:

- **Status Badge**: Green (healthy), Yellow (degraded), Red (stopped)
- **Last Heartbeat**: Time since last heartbeat check
- **Next Scheduled Run**: When the next sync will execute
- **Job List**: All scheduled sync configurations with their cron schedules

## API Summary

### New Endpoints

1. **Preview Sync**
   ```
   POST /api/execute/preview/:configId
   ```

2. **Enhanced Scheduler Status**
   ```
   GET /api/scheduler/status
   ```

### Updated Behavior

1. **Sync Execution** - Now supports:
   - Comment sync (when `options.sync_comments = true`)
   - Link sync (when `options.sync_links = true`)

2. **Scheduler** - Now includes:
   - Heartbeat tracking
   - Health status
   - Detailed job information with next run times
