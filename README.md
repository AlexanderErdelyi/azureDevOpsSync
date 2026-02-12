# Azure DevOps Work Item Sync

A web application to sync work items between Azure DevOps projects with MCP (Model Context Protocol) support and GitHub Copilot CLI integration.

## Features

- 🔄 **Comprehensive field synchronization** - Syncs ALL work item fields (not just a subset)
- 🎯 **Smart field mapping** - Automatically handles Area Path, Iteration Path, and project-specific fields
- 🔍 **Dynamic field metadata** - Retrieves field definitions from Azure DevOps to validate compatibility
- ⚙️ **Configurable sync options** - Exclude fields, apply custom mappings, and control sync behavior
- 🌐 Modern web interface for easy configuration
- 🔌 MCP (Model Context Protocol) server for programmatic access
- 💬 GitHub Copilot CLI integration for natural language commands
- 🔐 Secure authentication with Personal Access Tokens
- 📊 Real-time sync status and detailed results

**📖 Documentation:**
- [Enhanced Sync](docs/ENHANCED_SYNC.md) - Field synchronization details
- [Dynamic Field Metadata](docs/DYNAMIC_FIELD_METADATA.md) - Intelligent field validation

## Prerequisites

- Node.js (v14 or higher)
- Azure DevOps Personal Access Token (PAT) with work item read/write permissions
- Azure DevOps organization and projects

## Installation

1. Clone the repository:
```bash
git clone https://github.com/AlexanderErdelyi/azureDevOpsSync.git
cd azureDevOpsSync
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (optional, for default configuration):
```bash
cp .env.example .env
# Edit .env and add your Azure DevOps credentials
```

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

