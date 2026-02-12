# Multi-Connector Sync Platform - API Reference

Complete API documentation for the Multi-Connector Sync Platform.

## Base URL

```
http://localhost:3000
```

## Authentication

Currently uses connector-specific authentication stored encrypted in the database.

---

## Connectors API

### List Connectors

```http
GET /api/connectors
```

**Query Parameters:**
- `active` (boolean, optional) - Filter by active status

**Response:**
```json
{
  "success": true,
  "count": 2,
  "connectors": [
    {
      "id": 1,
      "name": "Production Azure DevOps",
      "connector_type": "azuredevops",
      "base_url": "https://dev.azure.com/myorg",
      "endpoint": "MyProject",
      "auth_type": "pat",
      "is_active": 1,
      "metadata": "{}",
      "created_at": 1770882765771,
      "updated_at": 1770882765771
    }
  ]
}
```

### Get Connector

```http
GET /api/connectors/:id
```

**Response:**
```json
{
  "success": true,
  "connector": {
    "id": 1,
    "name": "Production Azure DevOps",
    "connector_type": "azuredevops",
    "base_url": "https://dev.azure.com/myorg",
    "endpoint": "MyProject",
    "auth_type": "pat",
    "is_active": 1,
    "metadata": "{}",
    "created_at": 1770882765771,
    "updated_at": 1770882765771
  }
}
```

### Create Connector

```http
POST /api/connectors
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Azure DevOps",
  "connector_type": "azuredevops",
  "base_url": "https://dev.azure.com/myorg",
  "endpoint": "MyProject",
  "auth_type": "pat",
  "credentials": {
    "token": "your-pat-token"
  },
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "message": "Connector created successfully",
  "connector_id": 1
}
```

### Update Connector

```http
PUT /api/connectors/:id
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "is_active": true,
  "credentials": {
    "token": "new-token"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Connector updated successfully"
}
```

### Delete Connector

```http
DELETE /api/connectors/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Connector and all related data deleted successfully"
}
```

### Test Connection

```http
POST /api/connectors/:id/test
```

**Response:**
```json
{
  "success": true,
  "message": "Connection successful",
  "details": {
    "project": "MyProject",
    "organization": "myorg"
  }
}
```

### Discover Metadata

```http
POST /api/connectors/:id/discover
```

**Response:**
```json
{
  "success": true,
  "message": "Metadata discovered and saved successfully",
  "summary": {
    "work_item_types": 5,
    "fields": 87,
    "statuses": 15
  },
  "metadata": {
    "work_item_types": [
      {
        "type_name": "Bug",
        "field_count": 45,
        "status_count": 7
      }
    ]
  }
}
```

### List Connector Types

```http
GET /api/connectors/types/available
```

**Response:**
```json
{
  "success": true,
  "connector_types": ["azuredevops", "servicedeskplus"]
}
```

---

## Metadata API

### Get Work Item Types

```http
GET /api/metadata/work-item-types?connector_id=1&enabled_only=true
```

**Query Parameters:**
- `connector_id` (required) - Connector ID
- `enabled_only` (optional) - Filter by enabled status

**Response:**
```json
{
  "success": true,
  "connector_id": 1,
  "count": 5,
  "work_item_types": [
    {
      "id": 1,
      "connector_id": 1,
      "type_name": "Bug",
      "type_id": "Bug",
      "enabled_for_sync": 1,
      "metadata": "{}",
      "created_at": "2026-02-12T07:00:00.000Z"
    }
  ]
}
```

### Get Fields

```http
GET /api/metadata/fields?connector_id=1&type_id=1&required_only=false
```

**Query Parameters:**
- `connector_id` (required) - Connector ID
- `type_id` (required) - Work item type ID
- `required_only` (optional) - Filter by required fields

**Response:**
```json
{
  "success": true,
  "connector_id": 1,
  "work_item_type_id": 1,
  "count": 45,
  "fields": [
    {
      "id": 10,
      "work_item_type_id": 1,
      "field_name": "Title",
      "field_reference": "System.Title",
      "field_type": "string",
      "is_required": 1,
      "is_readonly": 0,
      "enabled_for_sync": 1,
      "suggestion_score": 100
    }
  ]
}
```

### Get Statuses

```http
GET /api/metadata/statuses?connector_id=1&type_id=1
```

**Response:**
```json
{
  "success": true,
  "connector_id": 1,
  "work_item_type_id": 1,
  "count": 7,
  "statuses": [
    {
      "id": 5,
      "work_item_type_id": 1,
      "status_name": "Active",
      "status_value": "Active",
      "status_category": "in_progress",
      "enabled_for_sync": 1,
      "sort_order": 2
    }
  ]
}
```

### Suggest Mappings

```http
GET /api/metadata/suggest-mappings?source_connector_id=1&source_type_id=1&target_connector_id=2&target_type_id=1
```

**Response:**
```json
{
  "success": true,
  "source": {
    "connector_id": 1,
    "type_id": 1
  },
  "target": {
    "connector_id": 2,
    "type_id": 1
  },
  "suggestions": {
    "field_mappings": [
      {
        "source_field": {
          "field_name": "Title",
          "field_type": "string"
        },
        "suggested_target_field": {
          "field_name": "subject",
          "field_type": "string"
        },
        "confidence": 1.0,
        "requires_transformation": false
      }
    ],
    "status_mappings": [
      {
        "source_status": {
          "status_name": "Active",
          "category": "in_progress"
        },
        "suggested_target_status": {
          "status_name": "Open",
          "category": "in_progress"
        },
        "confidence": 0.8
      }
    ]
  },
  "summary": {
    "total_source_fields": 45,
    "mapped_fields": 38,
    "high_confidence_fields": 30,
    "total_source_statuses": 7,
    "mapped_statuses": 6,
    "high_confidence_statuses": 5
  }
}
```

### Update Work Item Type

```http
PUT /api/metadata/work-item-types/:id
Content-Type: application/json
```

**Request Body:**
```json
{
  "is_enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Work item type updated successfully"
}
```

---

## Sync Configuration API

### List Sync Configs

```http
GET /api/sync-configs?active=true
```

**Query Parameters:**
- `active` (optional) - Filter by active status
- `source_connector_id` (optional) - Filter by source connector
- `target_connector_id` (optional) - Filter by target connector

**Response:**
```json
{
  "success": true,
  "count": 1,
  "sync_configs": [
    {
      "id": 1,
      "name": "Azure Bugs to ServiceDesk",
      "description": "Sync bugs to ServiceDesk Plus",
      "source_connector_id": 1,
      "target_connector_id": 2,
      "direction": "one-way",
      "trigger_type": "manual",
      "schedule_cron": null,
      "conflict_resolution": "last-write-wins",
      "is_active": 1,
      "last_sync_at": null,
      "next_sync_at": null,
      "sync_filter": "{\"wiql\":\"SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug'\"}",
      "options": "{}",
      "source_connector_name": "Azure DevOps",
      "target_connector_name": "ServiceDesk"
    }
  ]
}
```

### Get Sync Config

```http
GET /api/sync-configs/:id
```

**Response:**
```json
{
  "success": true,
  "sync_config": {
    "id": 1,
    "name": "Azure Bugs to ServiceDesk",
    "source_connector_id": 1,
    "target_connector_id": 2,
    "direction": "one-way",
    "field_mappings": [],
    "status_mappings": [],
    "type_mappings": []
  }
}
```

### Create Sync Config

```http
POST /api/sync-configs
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Azure to ServiceDesk Sync",
  "description": "Sync bugs to ServiceDesk",
  "source_connector_id": 1,
  "target_connector_id": 2,
  "direction": "one-way",
  "trigger_type": "manual",
  "schedule_cron": null,
  "conflict_resolution": "last-write-wins",
  "sync_filter": {
    "wiql": "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug'"
  },
  "options": {}
}
```

**Response:**
```json
{
  "success": true,
  "message": "Sync configuration created successfully",
  "sync_config_id": 1
}
```

### Update Sync Config

```http
PUT /api/sync-configs/:id
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "is_active": true,
  "trigger_type": "scheduled",
  "schedule_cron": "0 * * * *"
}
```

### Delete Sync Config

```http
DELETE /api/sync-configs/:id
```

### Add Field Mapping

```http
POST /api/sync-configs/:id/field-mappings
Content-Type: application/json
```

**Request Body (Direct):**
```json
{
  "source_field_id": 10,
  "target_field_id": 25,
  "mapping_type": "direct"
}
```

**Request Body (Transformation):**
```json
{
  "source_field_id": 11,
  "target_field_id": 26,
  "mapping_type": "transformation",
  "transformation": "stripHtml"
}
```

**Request Body (Constant):**
```json
{
  "source_field_id": 12,
  "mapping_type": "constant",
  "constant_value": "Imported from Azure"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Field mapping created successfully",
  "field_mapping_id": 1
}
```

### Add Status Mapping

```http
POST /api/sync-configs/:id/status-mappings
Content-Type: application/json
```

**Request Body:**
```json
{
  "source_status_id": 5,
  "target_status_id": 12
}
```

### Delete Field Mapping

```http
DELETE /api/sync-configs/:id/field-mappings/:mappingId
```

### Delete Status Mapping

```http
DELETE /api/sync-configs/:id/status-mappings/:mappingId
```

---

## Execution API

### Execute Sync

```http
POST /api/execute/sync/:configId
Content-Type: application/json
```

**Request Body:**
```json
{
  "work_item_ids": [101, 102, 103],
  "dry_run": false
}
```

**Response:**
```json
{
  "success": true,
  "dry_run": false,
  "execution_id": 1,
  "results": {
    "total": 3,
    "created": 2,
    "updated": 1,
    "skipped": 0,
    "errors": 0,
    "items": [
      {
        "source_id": 101,
        "target_id": "REQ-001",
        "action": "created",
        "success": true
      },
      {
        "source_id": 102,
        "target_id": "REQ-002",
        "action": "updated",
        "success": true
      },
      {
        "source_id": 103,
        "target_id": "REQ-003",
        "action": "created",
        "success": true
      }
    ]
  }
}
```

### Get Execution History

```http
GET /api/execute/history/:configId?limit=50
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "executions": [
    {
      "id": 1,
      "sync_config_id": 1,
      "source_connector_id": 1,
      "target_connector_id": 2,
      "status": "completed",
      "started_at": "2026-02-12T08:00:00.000Z",
      "ended_at": "2026-02-12T08:01:30.000Z",
      "items_synced": 15,
      "items_failed": 0
    }
  ]
}
```

### Get Execution Status

```http
GET /api/execute/status/:executionId
```

**Response:**
```json
{
  "success": true,
  "execution": {
    "id": 1,
    "status": "completed",
    "started_at": "2026-02-12T08:00:00.000Z",
    "ended_at": "2026-02-12T08:01:30.000Z",
    "items_synced": 15,
    "items_failed": 0
  },
  "errors": []
}
```

### Get Synced Items

```http
GET /api/execute/synced-items/:configId?limit=100&offset=0
```

**Response:**
```json
{
  "success": true,
  "total": 150,
  "count": 100,
  "items": [
    {
      "id": 1,
      "sync_config_id": 1,
      "source_connector_id": 1,
      "target_connector_id": 2,
      "source_item_id": "101",
      "target_item_id": "REQ-001",
      "source_type": "Bug",
      "target_type": "Request",
      "last_synced_at": "2026-02-12T08:00:00.000Z",
      "sync_count": 3
    }
  ]
}
```

### Validate Config

```http
POST /api/execute/validate/:configId
```

**Response:**
```json
{
  "success": true,
  "validation": {
    "config_valid": true,
    "issues": [
      {
        "type": "warning",
        "field": "field_mapping_5",
        "message": "Type mismatch: string -> int. Consider adding a transformation."
      }
    ]
  }
}
```

### Test Mapping

```http
POST /api/execute/test-mapping
Content-Type: application/json
```

**Request Body:**
```json
{
  "sync_config_id": 1,
  "sample_source_item": {
    "id": 123,
    "type": "Bug",
    "fields": {
      "System.Title": "Sample Bug",
      "System.Description": "<p>Bug description</p>",
      "Microsoft.VSTS.Common.Priority": 2,
      "System.State": "Active"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "source": {
    "id": 123,
    "type": "Bug",
    "fields": {}
  },
  "mapped": {
    "fields": {
      "subject": "Sample Bug",
      "description": "Bug description",
      "priority": "High"
    },
    "type": "Request",
    "status": "Open"
  }
}
```

---

## Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-12T08:00:00.000Z"
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

---

## Transformation Functions

Available transformation functions for field mappings:

### String
- `toUpperCase` - Convert to uppercase
- `toLowerCase` - Convert to lowercase
- `trim` - Remove whitespace
- `truncate(length)` - Truncate to length

### Type Conversion
- `toNumber` - Convert to number
- `toString` - Convert to string
- `toBoolean` - Convert to boolean

### Date
- `formatDateISO` - Format as ISO 8601
- `formatDateShort` - Format as YYYY-MM-DD

### Priority
- `azurePriorityToText` - 1-4 → Critical/High/Medium/Low
- `textToAzurePriority` - Text → 1-4
- `azureToServiceDeskPriority` - 1-4 → Urgent/High/Normal/Low
- `serviceDeskToAzurePriority` - Text → 1-4

### Content
- `stripHtml` - Remove HTML tags
- `textToHtml` - Convert text to HTML
- `markdownToText` - Convert markdown to plain text

### Path
- `extractProjectFromPath` - Get project from path
- `replaceProjectInPath(newProject)` - Change project in path

### Advanced
- `replace(search, replacement)` - Find and replace
- `concat(values, separator)` - Concatenate values
- `split(delimiter)` - Split string
- `emailToUsername` - Extract username from email

### Chains

Apply multiple transformations:

```json
{
  "transformation": {
    "chain": ["stripHtml", "trim", "toLowerCase"]
  }
}
```

With arguments:

```json
{
  "transformation": {
    "chain": [
      "stripHtml",
      {"name": "truncate", "args": [500]},
      "trim"
    ]
  }
}
```

---

## Rate Limiting

API endpoints are rate-limited to **100 requests per 15 minutes** per IP address.

---

## Support

For issues, feature requests, or questions:
- GitHub Issues: [azureDevOpsSync/issues](https://github.com/AlexanderErdelyi/azureDevOpsSync/issues)
- Documentation: [docs/](./docs/)
