# Enhanced Field Synchronization

## Overview

The Azure DevOps Sync project now supports **comprehensive field synchronization** that:

✅ Syncs **ALL work item fields** (not just a hardcoded subset)  
✅ Intelligently **excludes read-only system fields**  
✅ Supports **custom field mappings** between projects  
✅ Allows **field exclusion configuration**  
✅ Provides **detailed sync results** with field-level metrics

## How It Works

### 1. Automatic Field Detection

The sync process now automatically:
- Retrieves all fields from the source work item
- Filters out read-only system fields (Created Date, Changed Date, etc.)
- Maps fields appropriately for the target project
- Syncs all remaining fields

### 2. Excluded Fields

The following system fields are **automatically excluded** from sync:
- `System.Id` - Work item ID (auto-generated)
- `System.Rev` - Revision number
- `System.CreatedDate` / `System.CreatedBy`
- `System.ChangedDate` / `System.ChangedBy`
- `System.Watermark`, `System.CommentCount`, etc.

See [lib/fieldConfig.js](../lib/fieldConfig.js) for the complete list.

### 3. Special Field Handling

Certain fields require transformation:

#### Area Path & Iteration Path
Automatically mapped from source to target project:
```
Source: MySourceProject\Area1
Target: MyTargetProject\Area1
```

## Usage

### Basic Sync (All Fields)

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat",
    "sourceProject": "ProjectA",
    "targetProject": "ProjectB"
  }'
```

### Sync with Field Exclusions

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat",
    "sourceProject": "ProjectA",
    "targetProject": "ProjectB",
    "syncOptions": {
      "excludedFields": ["System.History", "System.Tags"]
    }
  }'
```

### Sync with Custom Field Mappings

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat",
    "sourceProject": "ProjectA",
    "targetProject": "ProjectB",
    "syncOptions": {
      "customMappings": {
        "System.AssignedTo": null,
        "Microsoft.VSTS.Common.Priority": "2"
      }
    }
  }'
```

### Verbose Sync Results

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat",
    "sourceProject": "ProjectA",
    "targetProject": "ProjectB",
    "syncOptions": {
      "verbose": true
    }
  }'
```

## Enhanced Response Format

The sync endpoint now returns detailed information:

```json
{
  "success": true,
  "synced": 5,
  "results": [
    {
      "success": true,
      "sourceId": 123,
      "targetId": 456,
      "workItemType": "Bug",
      "title": "Fix login issue",
      "fieldsSynced": 25,
      "syncedFields": [
        "System.Title",
        "System.Description",
        "System.State",
        "System.AssignedTo",
        "Microsoft.VSTS.Common.Priority",
        "..."
      ]
    }
  ]
}
```

## MCP Integration

### Using with GitHub Copilot CLI

Configure your MCP settings with sync options:

```json
{
  "mcpServers": {
    "azure-devops-sync": {
      "command": "node",
      "args": ["/path/to/azureDevOpsSync/mcp/server.js"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/myorg",
        "AZURE_DEVOPS_PAT": "your-pat"
      }
    }
  }
}
```

### MCP Tool Call Example

```json
{
  "method": "tools/call",
  "params": {
    "name": "sync_work_items",
    "arguments": {
      "sourceProject": "ProjectA",
      "targetProject": "ProjectB",
      "workItemIds": [123, 456],
      "syncOptions": {
        "excludedFields": ["System.History"],
        "customMappings": {
          "System.AssignedTo": null
        },
        "verbose": true
      }
    }
  }
}
```

## Configuration Files

### Default Configuration
See [config/syncConfig.default.json](../config/syncConfig.default.json) for examples.

### Field Configuration
See [lib/fieldConfig.js](../lib/fieldConfig.js) for field handling logic.

## Common Use Cases

### 1. Migrate Work Items (Preserve All Data)
Use default settings - all fields are synced automatically.

### 2. Clone Work Items (Reset Assignments)
Exclude `System.AssignedTo`:
```json
{
  "syncOptions": {
    "excludedFields": ["System.AssignedTo"]
  }
}
```

### 3. Sync Active Work Items Only
Filter with WIQL in `get_work_items` first, then sync specific IDs.

### 4. Cross-Organization Sync
Provide different credentials for source and target (coming soon).

## Troubleshooting

### Error: "TF401320: Field does not exist"
Some fields may not exist in the target project. Add them to `excludedFields`:
```json
{
  "syncOptions": {
    "excludedFields": ["Custom.FieldName"]
  }
}
```

### Error: "TF401349: Field cannot be set"
Some fields are read-only. They should be auto-excluded, but if you encounter this, add the field to the exclusion list.

## Next Steps

- **Test the sync** with a few work items first
- **Review results** to verify all needed fields are synced
- **Configure exclusions** for your specific use case
- **Set up MCP** for programmatic access
