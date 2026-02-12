# Multi-Connector Sync Platform

A flexible platform for synchronizing work items between multiple project management systems (Azure DevOps, ServiceDesk Plus, and more) with MCP (Model Context Protocol) support and GitHub Copilot CLI integration.

## Features

### Core Capabilities
- 🔌 **Multi-Connector Architecture** - Support for Azure DevOps, ManageEngine ServiceDesk Plus, and extensible plugin system
- 💾 **SQLite Database** - Persistent storage for connectors, sync configurations, and field mappings
- 🔒 **Encrypted Credentials** - AES-256-GCM encryption for secure credential storage
- 🔄 **Bidirectional Sync** - Create, update, and query work items across systems
- 📊 **Metadata Discovery** - Automatic detection of work item types, fields, and statuses

### Sync Features
- 🔄 **Comprehensive field synchronization** - Syncs ALL work item fields (not just a subset)
- 🎯 **Smart field mapping** - Configurable field transformations between systems
- 🔍 **Dynamic field metadata** - Retrieves field definitions to validate compatibility
- ⚙️ **Configurable sync options** - Exclude fields, apply custom mappings, and control sync behavior
- 🔌 MCP (Model Context Protocol) server for programmatic access
- 💬 GitHub Copilot CLI integration for natural language commands
- 📊 Real-time sync status and detailed results

**📖 Documentation:**
- [Enhanced Sync](docs/ENHANCED_SYNC.md) - Field synchronization details
- [Dynamic Field Metadata](docs/DYNAMIC_FIELD_METADATA.md) - Intelligent field validation
- [Architecture](docs/ARCHITECTURE.md) - System design and connector architecture

## Prerequisites

- Node.js (v14 or higher)
- Connector credentials:
  - **Azure DevOps**: Personal Access Token (PAT) with work item read/write permissions
  - **ServiceDesk Plus**: API Key/Auth Token from administrator

## Quick Start

### 1. Installation

```bash
git clone https://github.com/AlexanderErdelyi/azureDevOpsSync.git
cd azureDevOpsSync
npm install
```

### 2. Database Setup

Initialize the SQLite database with required tables:

```bash
node database/setup.js
```

This creates 13 tables for connectors, sync configurations, field mappings, and execution history.

### 3. Add Your First Connector

Use the interactive script to add a connector:

```bash
node scripts/add-connector.js
```

**Example for Azure DevOps:**
```
Select connector type (1-2): 1
Connector name: My Azure DevOps
Organization URL: https://dev.azure.com/myorg
Project name: MyProject
Personal Access Token (PAT): ****
```

**Example for ServiceDesk Plus:**
```
Select connector type (1-2): 2
Connector name: My ServiceDesk
Server URL: https://sdpondemand.manageengine.com
Site/Portal name: mysite
API Key/Auth Token: ****
```

### 4. Test Connection

Verify your connector works:

```bash
node scripts/test-connectors.js
```

Expected output:
```
✓ Loaded: My Azure DevOps (azuredevops)
✓ Connection successful
```

### 5. Discover Metadata

Query your connector for available work item types, fields, and statuses:

```bash
node scripts/discover-metadata.js <connector-id>
```

Example:
```bash
node scripts/discover-metadata.js 1
```

This saves the metadata to the database for use in sync configurations.

### 6. Start the Server

```bash
npm start
```

Server will be available at `http://localhost:3000`

## Usage

### Starting the Web Server

```bash
npm start
```

The application will be available at `http://localhost:3000`

For development with auto-reload:
```bash
npm run dev
```

### Web Interface

1. Open your browser to `http://localhost:3000`
2. Enter your Azure DevOps organization URL and Personal Access Token
3. Click "Test Connection" to verify your credentials
4. Configure source and target projects
5. Optionally specify work item IDs (leave empty to sync all)
6. Click "Start Sync" to begin synchronization

### Using the MCP Server with GitHub Copilot CLI

The MCP server allows programmatic access to Azure DevOps sync functionality through GitHub Copilot CLI.

#### Configuration

Create or edit your Copilot CLI MCP configuration file at `~/.copilot/mcp-config.json`:

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

> **Note**: Replace the path with the actual absolute path to your `mcp/server.js` file.

#### Setting Up Environment Variables

**Windows (PowerShell):**
```powershell
$env:AZURE_DEVOPS_PAT = "your-personal-access-token"
```

**macOS/Linux:**
```bash
export AZURE_DEVOPS_PAT="your-personal-access-token"
```

For permanent setup, add to your profile (`~/.bashrc`, `~/.zshrc`, or PowerShell profile).

#### Available MCP Tools

1. **test_connection** - Test Azure DevOps connection
   ```json
   {
     "orgUrl": "https://dev.azure.com/myorg",
     "token": "your-pat"
   }
   ```

2. **get_work_items** - Get work items from a project
   ```json
   {
     "project": "MyProject",
     "wiql": "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'"
   }
   ```

3. **sync_work_items** - Sync work items between projects (with all fields)
   ```json
   {
     "sourceProject": "ProjectA",
     "targetProject": "ProjectB",
     "workItemIds": [123, 456, 789],
     "syncOptions": {
       "excludedFields": ["System.History"],
       "customMappings": {},
       "verbose": true
     }
   }
   ```

4. **get_work_item** - Get details of a specific work item
   ```json
   {
     "workItemId": 123
   }
   ```

### Using with GitHub Copilot CLI

Once the MCP server is configured in `~/.copilot/mcp-config.json`, you can use GitHub Copilot CLI to interact with Azure DevOps:

```bash
# Start Copilot CLI
copilot

# Then ask questions naturally:
# - "Test my Azure DevOps connection"
# - "Get all work items from ProjectA"
# - "Sync work items from ProjectA to ProjectB"
# - "Show details for work item 123"
# - "Sync work item 456 excluding History and Tags fields"
```

**📖 For detailed setup instructions, see [Copilot CLI Setup Guide](docs/COPILOT_CLI_SETUP.md)**

### API Endpoints

The web server exposes the following REST API endpoints:

- `POST /api/test-connection` - Test Azure DevOps connection
- `POST /api/work-items` - Get work items from a project
- `POST /api/sync` - Sync work items between projects
- `GET /health` - Health check endpoint

Example API usage:
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

## Project Structure

```
azureDevOpsSync/
├── server.js              # Main Express server
├── package.json           # Node.js dependencies
├── .env.example          # Environment variables template
├── lib/
│   └── azureDevOpsClient.js  # Azure DevOps API client
├── routes/
│   └── sync.js           # API routes
├── public/
│   ├── index.html        # Web interface
│   ├── styles.css        # Styles
│   └── app.js            # Frontend JavaScript
└── mcp/
    └── server.js         # MCP server implementation
```

## Configuration

### Environment Variables

- `AZURE_DEVOPS_ORG_URL` - Your Azure DevOps organization URL
- `AZURE_DEVOPS_PAT` - Your Personal Access Token
- `PORT` - Server port (default: 3000)

### Azure DevOps Permissions

Your Personal Access Token needs the following permissions:
- Work Items: Read & Write
- Project and Team: Read

## Security Notes

- Never commit your Personal Access Token to version control
- Use environment variables or secure vaults for credentials
- The `.env` file is ignored by git
- Tokens are transmitted securely over HTTPS in production

## Troubleshooting

### Connection Issues
- Verify your organization URL format: `https://dev.azure.com/your-organization`
- Ensure your PAT has the correct permissions
- Check if your PAT has expired

### Sync Issues
- Verify both source and target projects exist
- Ensure work item IDs are valid
- Check that you have write permissions to the target project

### MCP Server Issues
- Ensure Node.js is in your PATH
- Verify the MCP configuration file path is correct
- Check that environment variables are properly set

## Development

To contribute to this project:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Support

For issues and questions:
- Open an issue on GitHub
- Check Azure DevOps API documentation: https://docs.microsoft.com/en-us/rest/api/azure/devops/

## Acknowledgments

- Built with Express.js
- Uses Azure DevOps Node API
- Implements Model Context Protocol (MCP)
- Integrates with GitHub Copilot CLI

