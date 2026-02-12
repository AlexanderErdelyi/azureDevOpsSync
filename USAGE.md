# Usage Guide

## Quick Start

### 1. Install and Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

The application will be available at http://localhost:3000

### 2. Configure Azure DevOps

You need:
- Azure DevOps Organization URL (e.g., `https://dev.azure.com/your-organization`)
- Personal Access Token (PAT) with work items read/write permissions

### 3. Sync Work Items

#### Via Web Interface

1. Open http://localhost:3000 in your browser
2. Enter your organization URL and PAT
3. Click "Test Connection" to verify
4. Enter source and target project names
5. Optionally specify work item IDs to sync
6. Click "Start Sync"

#### Via API

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat",
    "sourceProject": "ProjectA",
    "targetProject": "ProjectB",
    "workItemIds": [123, 456]
  }'
```

#### Via MCP and GitHub Copilot CLI

1. Configure MCP settings:

```json
{
  "mcpServers": {
    "azure-devops-sync": {
      "command": "node",
      "args": ["/absolute/path/to/azureDevOpsSync/mcp/server.js"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/your-organization",
        "AZURE_DEVOPS_PAT": "your-personal-access-token"
      }
    }
  }
}
```

2. Use with GitHub Copilot CLI:

```bash
# Sync work items
gh copilot suggest "sync work items from ProjectA to ProjectB"

# Get work items
gh copilot suggest "get all active work items from MyProject"

# Get specific work item
gh copilot suggest "get details for work item 123"
```

## Advanced Usage

### Custom WIQL Queries

Use WIQL (Work Item Query Language) to filter work items:

```bash
curl -X POST http://localhost:3000/api/work-items \
  -H "Content-Type: application/json" \
  -d '{
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat",
    "project": "MyProject",
    "wiql": "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.State] = '\''Active'\'' AND [System.WorkItemType] = '\''Bug'\''"
  }'
```

### Selective Sync

Sync only specific work items by providing their IDs:

```bash
# Sync work items 123, 456, and 789
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat",
    "sourceProject": "ProjectA",
    "targetProject": "ProjectB",
    "workItemIds": [123, 456, 789]
  }'
```

### Bulk Sync

To sync all work items from a project, leave `workItemIds` empty:

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat",
    "sourceProject": "ProjectA",
    "targetProject": "ProjectB",
    "workItemIds": []
  }'
```

## MCP Tools Reference

### test_connection

Test connection to Azure DevOps.

**Parameters:**
- `orgUrl` (string, required): Azure DevOps organization URL
- `token` (string, required): Personal Access Token

**Example:**
```json
{
  "name": "test_connection",
  "arguments": {
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat"
  }
}
```

### get_work_items

Get work items from a project.

**Parameters:**
- `project` (string, required): Project name
- `wiql` (string, optional): WIQL query to filter work items

**Example:**
```json
{
  "name": "get_work_items",
  "arguments": {
    "project": "MyProject",
    "wiql": "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'"
  }
}
```

### sync_work_items

Sync work items between projects.

**Parameters:**
- `sourceProject` (string, required): Source project name
- `targetProject` (string, required): Target project name
- `workItemIds` (array, optional): Specific work item IDs to sync

**Example:**
```json
{
  "name": "sync_work_items",
  "arguments": {
    "sourceProject": "ProjectA",
    "targetProject": "ProjectB",
    "workItemIds": [123, 456]
  }
}
```

### get_work_item

Get details of a specific work item.

**Parameters:**
- `workItemId` (number, required): Work item ID

**Example:**
```json
{
  "name": "get_work_item",
  "arguments": {
    "workItemId": 123
  }
}
```

## Troubleshooting

### "Connection failed" error

- Verify your organization URL is correct
- Check that your PAT hasn't expired
- Ensure your PAT has the required permissions

### "Project not found" error

- Verify the project name is spelled correctly
- Check that you have access to both projects
- Project names are case-sensitive

### "Work item not found" error

- Verify the work item ID exists in the source project
- Check that you have permission to access the work item

### MCP server not responding

- Verify Node.js is installed and in your PATH
- Check that the MCP configuration file path is correct
- Ensure environment variables are properly set

## Best Practices

1. **Security**: Never commit PATs to version control
2. **Testing**: Always test connection before syncing
3. **Selective Sync**: Use work item IDs for small, controlled syncs
4. **Monitoring**: Check sync results for errors
5. **Permissions**: Ensure your PAT has appropriate permissions

## Examples

### Example 1: Sync all bugs from Project A to Project B

```bash
# First, get all bugs from Project A
curl -X POST http://localhost:3000/api/work-items \
  -H "Content-Type: application/json" \
  -d '{
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat",
    "project": "ProjectA",
    "wiql": "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = '\''Bug'\''"
  }'

# Then sync them to Project B
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "orgUrl": "https://dev.azure.com/myorg",
    "token": "your-pat",
    "sourceProject": "ProjectA",
    "targetProject": "ProjectB",
    "workItemIds": [/* IDs from previous query */]
  }'
```

### Example 2: Using with GitHub Copilot CLI

```bash
# Natural language commands
gh copilot suggest "test my Azure DevOps connection"
gh copilot suggest "show me all work items in ProjectA"
gh copilot suggest "sync work items 100, 200, 300 from ProjectA to ProjectB"
```

### Example 3: Automated sync script

```bash
#!/bin/bash

ORG_URL="https://dev.azure.com/myorg"
PAT="your-pat"
SOURCE="ProjectA"
TARGET="ProjectB"

# Get all work items
ITEMS=$(curl -s -X POST http://localhost:3000/api/work-items \
  -H "Content-Type: application/json" \
  -d "{
    \"orgUrl\": \"$ORG_URL\",
    \"token\": \"$PAT\",
    \"project\": \"$SOURCE\"
  }")

# Sync to target
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d "{
    \"orgUrl\": \"$ORG_URL\",
    \"token\": \"$PAT\",
    \"sourceProject\": \"$SOURCE\",
    \"targetProject\": \"$TARGET\"
  }"
```
