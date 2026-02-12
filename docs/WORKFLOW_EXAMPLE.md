# Complete Sync Workflow Example

This document shows a complete end-to-end workflow for setting up and executing a sync between two systems.

## Prerequisites

```bash
# 1. Initialize database
node database/setup.js

# 2. Start server
npm start
```

## Step 1: Add Connectors

### Add Azure DevOps Connector

```bash
POST http://localhost:3000/api/connectors
Content-Type: application/json

{
  "name": "Production Azure DevOps",
  "connector_type": "azuredevops",
  "base_url": "https://dev.azure.com/myorg",
  "endpoint": "MyProject",
  "auth_type": "pat",
  "credentials": {
    "token": "your-pat-token-here"
  },
  "metadata": {
    "description": "Production Azure DevOps project"
  }
}
```

Response: `{"success": true, "connector_id": 1}`

### Add ServiceDesk Plus Connector

```bash
POST http://localhost:3000/api/connectors
Content-Type: application/json

{
  "name": "ServiceDesk Plus",
  "connector_type": "servicedeskplus",
  "base_url": "https://sdpondemand.manageengine.com",
  "endpoint": "mysite",
  "auth_type": "apikey",
  "credentials": {
    "apiKey": "your-api-key-here"
  }
}
```

Response: `{"success": true, "connector_id": 2}`

## Step 2: Test Connections

```bash
POST http://localhost:3000/api/connectors/1/test
# Should return: {"success": true, "message": "Connection successful"}

POST http://localhost:3000/api/connectors/2/test
# Should return: {"success": true, "message": "Connection successful"}
```

## Step 3: Discover Metadata

```bash
POST http://localhost:3000/api/connectors/1/discover
# Discovers work item types, fields, and statuses from Azure DevOps

POST http://localhost:3000/api/connectors/2/discover
# Discovers request types, fields, and statuses from ServiceDesk Plus
```

## Step 4: Query Available Fields

```bash
# Get work item types for Azure DevOps
GET http://localhost:3000/api/metadata/work-item-types?connector_id=1

# Get fields for Bug type (assuming type_id=1)
GET http://localhost:3000/api/metadata/fields?connector_id=1&type_id=1

# Get statuses for Bug type
GET http://localhost:3000/api/metadata/statuses?connector_id=1&type_id=1
```

## Step 5: Create Sync Configuration

```bash
POST http://localhost:3000/api/sync-configs
Content-Type: application/json

{
  "name": "Azure Bugs to ServiceDesk Requests",
  "description": "Sync Azure DevOps bugs to ServiceDesk Plus as requests",
  "source_connector_id": 1,
  "target_connector_id": 2,
  "direction": "one-way",
  "trigger_type": "manual",
  "sync_filter": {
    "wiql": "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug' AND [System.State] = 'Active'"
  },
  "options": {
    "create_only": false,
    "update_existing": true
  }
}
```

Response: `{"success": true, "sync_config_id": 1}`

## Step 6: Get Mapping Suggestions

```bash
# Get AI-suggested field mappings
GET http://localhost:3000/api/metadata/suggest-mappings?
  source_connector_id=1&
  source_type_id=1&
  target_connector_id=2&
  target_type_id=1

# Returns confidence scores for suggested mappings
```

## Step 7: Configure Field Mappings

### Map Title Field (Direct)

```bash
POST http://localhost:3000/api/sync-configs/1/field-mappings
Content-Type: application/json

{
  "source_field_id": 10,
  "target_field_id": 25,
  "mapping_type": "direct"
}
```

### Map Description with HTML Stripping

```bash
POST http://localhost:3000/api/sync-configs/1/field-mappings
Content-Type: application/json

{
  "source_field_id": 11,
  "target_field_id": 26,
  "mapping_type": "transformation",
  "transformation": "stripHtml"
}
```

### Map Priority with Transformation

```bash
POST http://localhost:3000/api/sync-configs/1/field-mappings
Content-Type: application/json

{
  "source_field_id": 12,
  "target_field_id": 27,
  "mapping_type": "transformation",
  "transformation": {
    "name": "azureToServiceDeskPriority"
  }
}
```

### Map Area Path with Project Replacement

```bash
POST http://localhost:3000/api/sync-configs/1/field-mappings
Content-Type: application/json

{
  "source_field_id": 13,
  "target_field_id": 28,
  "mapping_type": "transformation",
  "transformation": {
    "name": "replaceProjectInPath",
    "args": ["NewProject"]
  }
}
```

### Set Constant Value

```bash
POST http://localhost:3000/api/sync-configs/1/field-mappings
Content-Type: application/json

{
  "source_field_id": 14,
  "mapping_type": "constant",
  "constant_value": "Imported from Azure DevOps"
}
```

## Step 8: Configure Status Mappings

```bash
POST http://localhost:3000/api/sync-configs/1/status-mappings
Content-Type: application/json

{
  "source_status_id": 5,
  "target_status_id": 12
}

# Repeat for all status mappings:
# Azure "Active" -> ServiceDesk "Open"
# Azure "Resolved" -> ServiceDesk "Resolved"
# Azure "Closed" -> ServiceDesk "Closed"
```

## Step 9: Validate Configuration

```bash
POST http://localhost:3000/api/execute/validate/1

# Returns validation results:
# - Configuration validity
# - Connector connection tests
# - Mapping validation (type mismatches, invalid transformations)
# - Any warnings or errors
```

## Step 10: Test Mapping (Dry Run)

```bash
POST http://localhost:3000/api/execute/test-mapping
Content-Type: application/json

{
  "sync_config_id": 1,
  "sample_source_item": {
    "id": 123,
    "type": "Bug",
    "fields": {
      "System.Title": "Sample Bug",
      "System.Description": "<p>Bug description with <strong>HTML</strong></p>",
      "Microsoft.VSTS.Common.Priority": 2,
      "System.State": "Active",
      "System.AreaPath": "OldProject\\Area1"
    }
  }
}

# Returns how the item would be mapped without actually syncing
```

## Step 11: Execute Sync (Dry Run First)

```bash
POST http://localhost:3000/api/execute/sync/1
Content-Type: application/json

{
  "dry_run": true,
  "work_item_ids": [101, 102, 103]
}

# Returns what would happen without actually creating/updating items:
# - would_create: 2
# - would_update: 1
```

## Step 12: Execute Actual Sync

```bash
POST http://localhost:3000/api/execute/sync/1
Content-Type: application/json

{
  "dry_run": false
}

# Executes the full sync based on sync_filter
# Returns:
# {
#   "success": true,
#   "execution_id": 1,
#   "results": {
#     "total": 15,
#     "created": 10,
#     "updated": 4,
#     "errors": 1,
#     "items": [...]
#   }
# }
```

## Step 13: Monitor Execution

```bash
# Get specific execution status
GET http://localhost:3000/api/execute/status/1

# Get execution history
GET http://localhost:3000/api/execute/history/1

# Get synced items
GET http://localhost:3000/api/execute/synced-items/1?limit=50
```

## Advanced: Transformation Chains

Apply multiple transformations in sequence:

```bash
POST http://localhost:3000/api/sync-configs/1/field-mappings
Content-Type: application/json

{
  "source_field_id": 15,
  "target_field_id": 29,
  "mapping_type": "transformation",
  "transformation": {
    "chain": [
      "stripHtml",
      "trim",
      {"name": "truncate", "args": [500]},
      "toLowerCase"
    ]
  }
}
```

## Advanced: Context-Based Transformations

Use context variables in transformations:

```bash
{
  "transformation": {
    "name": "replaceProjectInPath",
    "args": ["$context.targetProject"]
  }
}
```

## Troubleshooting

### Check Connector Status
```bash
GET http://localhost:3000/api/connectors/1
GET http://localhost:3000/api/connectors/2
```

### View Sync Errors
```bash
GET http://localhost:3000/api/execute/status/{execution_id}
# Shows all errors that occurred during sync
```

### Update Mappings
```bash
# Delete old mapping
DELETE http://localhost:3000/api/sync-configs/1/field-mappings/5

# Add new mapping
POST http://localhost:3000/api/sync-configs/1/field-mappings
```

### Clear Mapping Cache
If mappings aren't updating:
1. Save new mappings
2. Restart server or wait 5 minutes for cache expiry
3. Cache automatically refreshes when mappings change

## Scheduled Syncs

```bash
# Update config to run every hour
PUT http://localhost:3000/api/sync-configs/1
Content-Type: application/json

{
  "trigger_type": "scheduled",
  "schedule_cron": "0 * * * *"
}
```

Note: Scheduled execution requires additional cron scheduler setup (Phase 5).

## Bidirectional Sync

```bash
# Update config for bidirectional sync
PUT http://localhost:3000/api/sync-configs/1
Content-Type: application/json

{
  "direction": "bidirectional"
}
```

Note: Bidirectional sync requires conflict resolution strategy configuration.

## Best Practices

1. **Always validate** before first sync: `POST /api/execute/validate/{id}`
2. **Test with dry_run**: Verify mappings work correctly
3. **Start small**: Sync a few items first with `work_item_ids`
4. **Monitor execution**: Check status and errors after each sync
5. **Handle errors**: Review error logs and adjust mappings
6. **Update mappings**: Iteratively improve field transformations
7. **Use transformations**: Don't rely solely on direct mappings
8. **Set up filters**: Use sync_filter to limit what gets synced
9. **Test connections**: Regularly verify connector health
10. **Cache aware**: Remember 5-minute mapping cache

## Common Transformation Patterns

### HTML Content
```json
{
  "transformation": {
    "chain": ["stripHtml", "trim"]
  }
}
```

### Priority Mapping
```json
{
  "transformation": "azureToServiceDeskPriority"
}
```

### Date Formatting
```json
{
  "transformation": "formatDateISO"
}
```

### Project-Specific Paths
```json
{
  "transformation": {
    "name": "replaceProjectInPath",
    "args": ["TargetProject"]
  }
}
```

### Text Cleanup
```json
{
  "transformation": {
    "chain": ["trim", "toLowerCase"]
  }
}
```
