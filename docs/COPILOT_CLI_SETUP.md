# GitHub Copilot CLI Integration Guide

This guide shows how to integrate the Azure DevOps Sync MCP server with GitHub Copilot CLI.

## Prerequisites

1. **GitHub Copilot CLI** installed
   ```bash
   # Install via npm
   npm install -g @github/copilot-cli
   ```

2. **Azure DevOps Personal Access Token** with work items read/write permissions
   - Create at: https://dev.azure.com/{your-organization}/_usersSettings/tokens

3. **Node.js** (v14 or higher)

## Installation Steps

### Step 1: Set Up Environment Variable

Store your Azure DevOps PAT securely as an environment variable.

**Windows (PowerShell):**
```powershell
# Temporary (current session only)
$env:AZURE_DEVOPS_PAT = "your-personal-access-token"

# Permanent (user profile)
[System.Environment]::SetEnvironmentVariable('AZURE_DEVOPS_PAT', 'your-personal-access-token', 'User')
```

**macOS/Linux:**
```bash
# Add to ~/.bashrc or ~/.zshrc
export AZURE_DEVOPS_PAT="your-personal-access-token"

# Reload profile
source ~/.bashrc  # or source ~/.zshrc
```

### Step 2: Configure MCP Server

Create or edit the Copilot CLI MCP configuration file:

**File Location:**
- Windows: `%USERPROFILE%\.copilot\mcp-config.json`
- macOS/Linux: `~/.copilot/mcp-config.json`

**Configuration:**
```json
{
  "mcpServers": {
    "azure-devops-sync": {
      "command": "node",
      "args": ["C:/VSCodeProjects/GitHub/azureDevOpsSync/mcp/server.js"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/your-organization",
        "AZURE_DEVOPS_PAT": "${AZURE_DEVOPS_PAT}"
      }
    }
  }
}
```

> **Important**: Replace the path in `args` with the **absolute path** to your `mcp/server.js` file.

### Step 3: Verify Installation

1. **Restart Copilot CLI** (if already running)

2. **List configured servers:**
   ```bash
   copilot
   ```
   Then in the Copilot CLI session:
   ```
   /mcp show
   ```

3. **Test the connection:**
   Ask Copilot: "Show me the available Azure DevOps sync tools"

## Usage Examples

### Example 1: Sync Specific Work Items

Start Copilot CLI:
```bash
copilot
```

Then ask:
```
Sync work items 123, 456, and 789 from ProjectA to ProjectB in Azure DevOps
```

### Example 2: Sync All Work Items

```
Sync all work items from ProjectA to ProjectB
```

### Example 3: Sync with Field Exclusions

```
Sync work items from ProjectA to ProjectB, but exclude the History and Tags fields
```

### Example 4: Get Work Items

```
Show me all active bugs in MyProject
```

### Example 5: Test Connection

```
Test my Azure DevOps connection
```

## Available Tools

The MCP server exposes these tools to Copilot CLI:

| Tool | Description |
|------|-------------|
| `test_connection` | Verify Azure DevOps credentials |
| `get_work_items` | Query work items with WIQL |
| `sync_work_items` | Sync work items with full field support |
| `get_work_item` | Get details of a specific work item |

## Advanced Configuration

### Multiple Organizations

You can configure multiple Azure DevOps organizations:

```json
{
  "mcpServers": {
    "azure-devops-org1": {
      "command": "node",
      "args": ["C:/path/to/azureDevOpsSync/mcp/server.js"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/organization1",
        "AZURE_DEVOPS_PAT": "${AZURE_DEVOPS_PAT_ORG1}"
      }
    },
    "azure-devops-org2": {
      "command": "node",
      "args": ["C:/path/to/azureDevOpsSync/mcp/server.js"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/organization2",
        "AZURE_DEVOPS_PAT": "${AZURE_DEVOPS_PAT_ORG2}"
      }
    }
  }
}
```

### Sync Options

When syncing, you can specify advanced options:

```json
{
  "syncOptions": {
    "excludedFields": ["System.History", "System.Tags"],
    "customMappings": {
      "System.AssignedTo": null
    },
    "verbose": true
  }
}
```

**Options:**
- `excludedFields` - Array of field names to skip during sync
- `customMappings` - Override field values (e.g., clear assignments)
- `verbose` - Get detailed sync results with field-level information

## Troubleshooting

### Issue: MCP server not showing up

**Solution:**
1. Verify the path in `mcp-config.json` is absolute and correct
2. Check that Node.js is in your PATH
3. Restart Copilot CLI

### Issue: Authentication failed

**Solution:**
1. Verify `AZURE_DEVOPS_PAT` environment variable is set:
   ```powershell
   # Windows
   $env:AZURE_DEVOPS_PAT
   
   # macOS/Linux
   echo $AZURE_DEVOPS_PAT
   ```
2. Check PAT has correct permissions (Work Items: Read, Write)
3. Verify PAT hasn't expired

### Issue: Cannot find work items

**Solution:**
1. Verify project name is correct (case-sensitive)
2. Check you have access to the project
3. Use the web UI to test connection first

### Issue: Fields not syncing

**Solution:**
- Some fields may not exist in target project
- Add them to `excludedFields` in `syncOptions`
- Check the verbose output for details

## Testing the Setup

### Quick Test

1. **Start Copilot CLI:**
   ```bash
   copilot
   ```

2. **Check MCP servers:**
   ```
   /mcp show
   ```
   
   You should see `azure-devops-sync` listed.

3. **Test connection:**
   Ask: "Test my Azure DevOps connection"

4. **Try a simple query:**
   Ask: "Show me work items in [YourProject]"

### Full Integration Test

Create a test script to verify all functionality:

```bash
# In Copilot CLI session
/mcp show azure-devops-sync
```

Then test each tool:
1. "Test Azure DevOps connection"
2. "Get work items from TestProject"
3. "Show details for work item 123"
4. "Sync work item 123 from ProjectA to ProjectB"

## Interactive Setup (Optional)

From Copilot CLI, you can also use the interactive setup:

```
/mcp add
```

Follow the prompts to configure the Azure DevOps sync server.

## Next Steps

- Read [ENHANCED_SYNC.md](../docs/ENHANCED_SYNC.md) for field synchronization details
- Check [USAGE.md](../USAGE.md) for web interface usage
- See [README.md](../README.md) for API usage

## References

- [GitHub Copilot CLI Documentation](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Azure DevOps REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/)
