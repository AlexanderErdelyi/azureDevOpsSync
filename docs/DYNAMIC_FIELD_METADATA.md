# Dynamic Field Metadata Integration

## Overview

The Azure DevOps Sync now **dynamically retrieves field metadata** from Azure DevOps to intelligently determine which fields to sync. This enhancement ensures that:

✅ Only **valid fields** that exist in the target project are synced  
✅ **Read-only fields** are automatically excluded based on target project metadata  
✅ **Field validation** happens before attempting to create work items  
✅ **Detailed sync results** show which fields were skipped and why

## How It Works

### 1. Field Metadata Retrieval

Before syncing, the system can query Azure DevOps for field definitions:

```javascript
// Get field metadata for a work item type
const fieldMetadata = await client.getWorkItemTypeFieldsWithReferences(
  'MyProject', 
  'Task'
);

// Returns metadata like:
{
  "System.Title": {
    "name": "Title",
    "referenceName": "System.Title",
    "readOnly": false,
    "type": "String",
    "required": true
  },
  "System.CreatedDate": {
    "name": "Created Date",
    "referenceName": "System.CreatedDate",
    "readOnly": true,  // ← Automatically excluded from sync
    "type": "DateTime",
    "required": false
  }
  // ... more fields
}
```

### 2. Intelligent Field Filtering

During sync, the system uses three layers of filtering:

**Layer 1: Hardcoded Read-Only Fields**
- System fields that are always read-only (ID, Rev, Created Date, etc.)

**Layer 2: Custom Exclusions**
- Fields you explicitly exclude via `syncOptions.excludedFields`

**Layer 3: Dynamic Metadata Validation** (NEW!)
- Fields that don't exist in the target project
- Fields marked as read-only in the target project

### 3. Detailed Sync Results

The sync now reports which fields were skipped and why:

```json
{
  "success": true,
  "sourceId": 123,
  "targetId": 456,
  "fieldsSynced": 18,
  "syncedFields": ["System.Title", "System.Description", ...],
  "fieldsSkipped": [
    {
      "field": "Custom.LegacyField",
      "reason": "field does not exist in target"
    },
    {
      "field": "System.CreatedDate",
      "reason": "read-only system field"
    }
  ]
}
```

## Using Field Metadata

### Via Web API

**Get field metadata for a work item type:**
```powershell
$body = @{
  orgUrl = "https://dev.azure.com/aerdelyi12185"
  token = $env:AZURE_DEVOPS_PAT
  project = "MyProject"
  workItemType = "Task"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/work-item-type-fields" `
  -Method POST `
  -Body $body `
  -ContentType "application/json"
```

**Response:**
```json
{
  "success": true,
  "project": "MyProject",
  "workItemType": "Task",
  "fieldCount": 45,
  "fields": {
    "System.Title": {
      "name": "Title",
      "referenceName": "System.Title",
      "readOnly": false,
      "type": "String",
      "required": true
    }
    // ... more fields
  }
}
```

### Via MCP / Copilot CLI

**Ask naturally:**
```
Show me the fields for Task work items in MyProject
```

**Or call the tool directly:**
```json
{
  "name": "get_work_item_type_fields",
  "arguments": {
    "project": "MyProject",
    "workItemType": "Task"
  }
}
```

### Automatic Validation During Sync

Field metadata is automatically retrieved and used during sync (no extra configuration needed):

```javascript
// Sync automatically validates fields against target project
const result = await client.syncWorkItemWithDetails(
  sourceWorkItem, 
  targetProject, 
  { validateFields: true }  // Enable field validation
);

// Result includes skipped fields with reasons
console.log(result.fieldsSkipped);
```

## Benefits

### 1. **Prevents Sync Errors**

**Before:**
```
Error: TF401320: Rule violation. Field 'Custom.OldField' does not exist.
```

**After:**
```json
{
  "fieldsSkipped": [
    {
      "field": "Custom.OldField",
      "reason": "field does not exist in target"
    }
  ]
}
```
Sync succeeds by automatically skipping invalid fields.

### 2. **Cross-Project Compatibility**

Different Azure DevOps projects may have:
- Different custom fields
- Different process templates (Agile, Scrum, CMMI)
- Different field configurations

Dynamic metadata retrieval handles these differences automatically.

### 3. **Reduced Manual Configuration**

**Old approach:**
- Manually list every field to exclude
- Trial and error to find incompatible fields
- Update configuration after every sync error

**New approach:**
- System automatically detects incompatible fields
- No manual field listing needed
- Works across different projects automatically

## Implementation Details

### New Methods in AzureDevOpsClient

```javascript
// Get all fields in a project
await client.getWorkItemFields(project);

// Get work item type definition
await client.getWorkItemType(project, type);

// Get field metadata with references
await client.getWorkItemTypeFieldsWithReferences(project, type);
```

### Enhanced Field Configuration

The `shouldSyncField` function now returns detailed information:

```javascript
const result = shouldSyncField(
  'System.CreatedDate',
  [],  // custom exclusions
  targetFieldMetadata  // field metadata from target
);

// Returns:
{
  shouldSync: false,
  reason: "read-only system field"
}
```

### Sync Options

Control field validation behavior:

```javascript
{
  syncOptions: {
    validateFields: true,      // Enable metadata validation (default: true)
    excludedFields: [...],     // Additional fields to exclude
    customMappings: {...},     // Field value mappings
    verbose: true,             // Include detailed results
    onFieldSkipped: (field, reason) => {
      console.log(`Skipped ${field}: ${reason}`);
    }
  }
}
```

## Testing

### Test Field Metadata Retrieval

```powershell
# Set up environment
$env:AZURE_DEVOPS_PAT = "your-pat"

# Test endpoint
$body = @{
  orgUrl = "https://dev.azure.com/yourorg"
  token = $env:AZURE_DEVOPS_PAT
  project = "YourProject"
  workItemType = "Bug"
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/work-item-type-fields" `
  -Method POST `
  -Body $body `
  -ContentType "application/json"

Write-Host "Retrieved $($response.fieldCount) fields"
$response.fields.PSObject.Properties | ForEach-Object {
    $field = $_.Value
    Write-Host "$($field.name) - ReadOnly: $($field.readOnly)"
}
```

### Test Field-Aware Sync

1. **Create test work items** with custom fields in source project
2. **Sync to target project** (with different custom fields)
3. **Review results** to see which fields were skipped

```javascript
// In web interface or via API
{
  "sourceProject": "ProjectWithCustomFields",
  "targetProject": "StandardProject",
  "workItemIds": [123],
  "syncOptions": {
    "verbose": true
  }
}

// Check response for fieldsSkipped
```

## Troubleshooting

### Field Metadata Not Retrieved

**Issue:** `fieldsSkipped` is undefined in results

**Solution:**
- Ensure `validateFields` option is enabled (default for `syncWorkItemWithDetails`)
- Check that work item type exists in target project
- Verify PAT has permissions to read work item types

### Too Many Fields Skipped

**Issue:** More fields skipped than expected

**Possible causes:**
1. Target project uses different process template
2. Custom fields not added to target project
3. Fields configured as read-only in target

**Solution:**
- Review `fieldsSkipped` array for specific reasons
- Add missing custom fields to target project
- Use `customMappings` to handle specific fields differently

### Fields Still Causing Errors

**Issue:** Sync fails despite field validation

**Solution:**
- Some field rules are enforced at creation time, not in metadata
- Add problematic fields to `excludedFields`
- Check field dependencies (some fields require others to be set)

## Future Enhancements

Potential improvements for field metadata integration:

1. **Field Type Conversion**
   - Automatically convert compatible field types
   - Map picklist values between projects

2. **Required Field Detection**
   - Warn if required fields are missing
   - Suggest default values for required fields

3. **Field Dependency Analysis**
   - Detect field dependencies
   - Ensure dependent fields are synced together

4. **Cross-Organization Sync**
   - Handle field differences across organizations
   - Map fields with different reference names but same purpose

## Related Documentation

- [Enhanced Sync](ENHANCED_SYNC.md) - Comprehensive field synchronization
- [Copilot CLI Setup](COPILOT_CLI_SETUP.md) - GitHub Copilot CLI integration
- [README](../README.md) - Project overview

## API Reference

### GET /api/work-item-type-fields

Retrieve field definitions for a work item type.

**Request:**
```json
{
  "orgUrl": "https://dev.azure.com/org",
  "token": "pat",
  "project": "ProjectName",
  "workItemType": "Bug"
}
```

**Response:**
```json
{
  "success": true,
  "project": "ProjectName",
  "workItemType": "Bug",
  "fieldCount": 42,
  "fields": { /* field metadata */ }
}
```

### MCP Tool: get_work_item_type_fields

**Input:**
```json
{
  "project": "ProjectName",
  "workItemType": "Task"
}
```

**Output:**
```json
{
  "success": true,
  "fieldCount": 38,
  "fields": { /* field metadata */ }
}
```
