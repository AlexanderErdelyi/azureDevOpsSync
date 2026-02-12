# Multi-Connector Sync Platform

A powerful, extensible platform for synchronizing work items between multiple project management systems. Currently supports Azure DevOps and ServiceDesk Plus with a plugin architecture for easy connector additions.

## 🎯 Overview

Transform your work item management with automated synchronization between different project management platforms. This platform provides a complete solution with:
- **Connector Management** - Add, configure, and test multiple system connectors
- **Metadata Discovery** - Automatically detect work item types, fields, and statuses
- **Field Mapping Engine** - Visual mapping with 27+ transformation functions
- **Sync Execution** - Manual or scheduled synchronization with dry-run support
- **Complete API** - RESTful API with 21+ endpoints
- **Database Persistence** - SQLite with AES-256-GCM encrypted credentials

## ✨ Key Features

### Core Platform
- 🔌 **Multi-Connector Architecture** - Support for Azure DevOps, ServiceDesk Plus, and extensible plugin system
- 💾 **SQLite Database** - 13-table schema for connectors, sync configurations, field mappings, and execution history
- 🔒 **Military-Grade Security** - AES-256-GCM encryption for credential storage
- 🔄 **Bidirectional Sync Ready** - Infrastructure for two-way synchronization (Phase 7)
- 📊 **Metadata Discovery** - Automatic detection of work item types, fields, statuses, and relationships

### Field Mapping & Transformations
- 🎯 **Smart Field Mapping** - Direct, constant, transformation, and computed mapping types
- 🔧 **27 Transformation Functions** - String, type conversion, date formatting, priority mapping, HTML/markdown conversion
- 🔗 **Transformation Chains** - Apply multiple transformations sequentially
- 📋 **Context Variables** - Dynamic field references and computed values
- ✅ **Mapping Validation** - Pre-execution validation with type checking and error detection

### Sync & Execution
- 🚀 **Flexible Execution** - Manual triggers, dry-run testing, selective work item sync
- 📊 **Real-Time Monitoring** - Execution status, progress tracking, detailed error logging
- 📜 **Complete History** - Full audit trail of all sync operations
- 🎭 **Dry-Run Mode** - Preview changes without committing to target systems
- ⚡ **Performance** - 5-minute mapping cache, efficient batch processing

### API & Integration
- 🌐 **Comprehensive REST API** - 21 endpoints for complete platform control
- 🔌 **MCP Server** - Model Context Protocol for GitHub Copilot CLI integration
- 📖 **Complete Documentation** - API reference, workflow examples, integration guides
- 💬 **Natural Language Commands** - Control via GitHub Copilot CLI

**📖 Comprehensive Documentation:**
- [**API Reference**](docs/API_REFERENCE.md) - Complete API documentation with examples
- [**Workflow Guide**](docs/WORKFLOW_EXAMPLE.md) - End-to-end setup and usage examples
- [**Architecture**](docs/ARCHITECTURE.md) - System design and connector architecture
- [Enhanced Sync](docs/ENHANCED_SYNC.md) - Field synchronization details
- [Dynamic Field Metadata](docs/DYNAMIC_FIELD_METADATA.md) - Intelligent field validation
- [Copilot CLI Setup](docs/COPILOT_CLI_SETUP.md) - GitHub Copilot integration

## 📋 Prerequisites

- **Node.js** v14 or higher
- **NPM** (comes with Node.js)
- **Connector Credentials:**
  - **Azure DevOps**: Personal Access Token (PAT) with Work Items (Read & Write) permissions
  - **ServiceDesk Plus**: API Key/Auth Token (get from admin)

## 🚀 Quick Start (5 Minutes)

### 1. Clone & Install

```bash
git clone https://github.com/AlexanderErdelyi/azureDevOpsSync.git
cd azureDevOpsSync
npm install
```

### 2. Initialize Database

```bash
node database/setup.js
```

Creates 13 tables: connectors, sync_configs, sync_field_mappings, sync_status_mappings, sync_executions, synced_items, and more.

### 3. Add Your First Connector

**Interactive Setup:**
```bash
node scripts/add-connector.js
```

**Azure DevOps Example:**
```
Select connector type (1-2): 1
Connector name: Production Azure DevOps
Organization URL: https://dev.azure.com/myorg
Project name: MyProject
Personal Access Token: ****************************
```

**ServiceDesk Plus Example:**
```
Select connector type (1-2): 2
Connector name: ServiceDesk Production
Server URL: https://sdpondemand.manageengine.com
Site/Portal name: mycompany
API Key: ****************************
```

### 4. Test Connection

```bash
node scripts/test-connectors.js
```

**Expected Output:**
```
Testing connector: Production Azure DevOps
✓ Connection successful
  - Project: MyProject
  - Organization: myorg
```

### 5. Discover Metadata

Scan your connector for work item types, fields, and statuses:

```bash
node scripts/discover-metadata.js 1
```

**What This Does:**
- Queries all work item types (Bug, Task, User Story, etc.)
- Retrieves field definitions (name, type, required, readonly)
- Discovers status workflows
- Saves everything to the database for mapping

### 6. Run Integration Test

Verify everything is working:

```bash
node scripts/integration-test.js
```

### 7. Start Server

```bash
npm start
```

🌐 Server running at **http://localhost:3000**  
📖 API Reference: **http://localhost:3000/docs/API_REFERENCE.md**  
💻 Web Interface: **http://localhost:3000**

---

## 📚 Complete Workflow Example

Here's a typical end-to-end workflow for setting up synchronization:

### 1. Add Two Connectors

```bash
# Add Azure DevOps connector
node scripts/add-connector.js
# Add ServiceDesk Plus connector
node scripts/add-connector.js
```

### 2. Discover Metadata from Both

```bash
node scripts/discover-metadata.js 1  # Azure DevOps
node scripts/discover-metadata.js 2  # ServiceDesk Plus
```

### 3. Create Sync Configuration via API

```bash
curl -X POST http://localhost:3000/api/sync-configs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Azure Bugs to ServiceDesk",
    "source_connector_id": 1,
    "target_connector_id": 2,
    "direction": "one-way",
    "trigger_type": "manual",
    "sync_filter": {
      "wiql": "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = '\''Bug'\''"
    }
  }'
```

### 4. Get Suggested Field Mappings

```bash
curl "http://localhost:3000/api/metadata/suggest-mappings?source_connector_id=1&source_type_id=1&target_connector_id=2&target_type_id=1"
```

### 5. Create Field Mappings

```bash
# Direct mapping: Title → Subject
curl -X POST http://localhost:3000/api/sync-configs/1/field-mappings \
  -H "Content-Type: application/json" \
  -d '{
    "source_field_id": 10,
    "target_field_id": 25,
    "mapping_type": "direct"
  }'

# Transformation: Description (HTML → Plain Text)
curl -X POST http://localhost:3000/api/sync-configs/1/field-mappings \
  -H "Content-Type: application/json" \
  -d '{
    "source_field_id": 11,
    "target_field_id": 26,
    "mapping_type": "transformation",
    "transformation": "stripHtml"
  }'

# Priority with transformation chain
curl -X POST http://localhost:3000/api/sync-configs/1/field-mappings \
  -H "Content-Type: application/json" \
  -d '{
    "source_field_id": 12,
    "target_field_id": 27,
    "mapping_type": "transformation",
    "transformation": {
      "chain": ["azurePriorityToText", "toLowerCase"]
    }
  }'
```

### 6. Create Status Mappings

```bash
curl -X POST http://localhost:3000/api/sync-configs/1/status-mappings \
  -H "Content-Type: application/json" \
  -d '{
    "source_status_id": 5,
    "target_status_id": 12
  }'
```

### 7. Validate Configuration

```bash
curl -X POST http://localhost:3000/api/execute/validate/1
```

### 8. Test with Dry Run

```bash
curl -X POST http://localhost:3000/api/execute/sync/1 \
  -H "Content-Type: application/json" \
  -d '{
    "dry_run": true,
    "work_item_ids": [123]
  }'
```

### 9. Execute Real Sync

```bash
curl -X POST http://localhost:3000/api/execute/sync/1 \
  -H "Content-Type: application/json" \
  -d '{
    "work_item_ids": [123, 124, 125]
  }'
```

### 10. Monitor Execution

```bash
# Get execution status
curl http://localhost:3000/api/execute/status/1

# View history
curl http://localhost:3000/api/execute/history/1

# List synced items
curl http://localhost:3000/api/execute/synced-items/1
```

**📖 For more examples and advanced scenarios, see [WORKFLOW_EXAMPLE.md](docs/WORKFLOW_EXAMPLE.md)**

---

## 🌐 API Endpoints Overview

The platform exposes a comprehensive REST API:

### Connector Management (`/api/connectors`)
- `GET /api/connectors` - List all connectors
- `GET /api/connectors/:id` - Get connector details
- `POST /api/connectors` - Create new connector
- `PUT /api/connectors/:id` - Update connector
- `DELETE /api/connectors/:id` - Delete connector
- `POST /api/connectors/:id/test` - Test connection
- `POST /api/connectors/:id/discover` - Discover metadata
- `GET /api/connectors/types/available` - List connector types

### Metadata Queries (`/api/metadata`)
- `GET /api/metadata/work-item-types` - Get work item types
- `GET /api/metadata/fields` - Get fields for type
- `GET /api/metadata/statuses` - Get statuses for type
- `GET /api/metadata/suggest-mappings` - AI-powered mapping suggestions

### Sync Configuration (`/api/sync-configs`)
- `GET /api/sync-configs` - List sync configurations
- `GET /api/sync-configs/:id` - Get configuration details
- `POST /api/sync-configs` - Create sync configuration
- `PUT /api/sync-configs/:id` - Update configuration
- `DELETE /api/sync-configs/:id` - Delete configuration
- `POST /api/sync-configs/:id/field-mappings` - Add field mapping
- `POST /api/sync-configs/:id/status-mappings` - Add status mapping
- `DELETE /api/sync-configs/:id/field-mappings/:mappingId` - Remove mapping
- `DELETE /api/sync-configs/:id/status-mappings/:mappingId` - Remove mapping

### Execution & Monitoring (`/api/execute`)
- `POST /api/execute/sync/:configId` - Execute synchronization
- `GET /api/execute/history/:configId` - View execution history
- `GET /api/execute/status/:executionId` - Get execution status
- `GET /api/execute/synced-items/:configId` - List synced items
- `POST /api/execute/validate/:configId` - Validate configuration
- `POST /api/execute/test-mapping` - Test field mappings

### System
- `GET /health` - Health check

**📖 Complete API documentation with examples: [API_REFERENCE.md](docs/API_REFERENCE.md)**

---

## 🔧 Transformation Functions

The mapping engine includes 27 built-in transformation functions:

### String Transformations
- `toUpperCase`, `toLowerCase`, `trim`, `truncate(length)`
- `replace(search, replacement)`, `emailToUsername`
- `concat(values, separator)`, `split(delimiter)`

### Type Conversions
- `toNumber`, `toString`, `toBoolean`

### Date & Time
- `formatDateISO`, `formatDateShort`

### Priority Mapping
- `azurePriorityToText` - 1-4 → Critical/High/Medium/Low
- `textToAzurePriority` - Text → 1-4
- `azureToServiceDeskPriority` - Azure → ServiceDesk format
- `serviceDeskToAzurePriority` - ServiceDesk → Azure format

### Content Processing
- `stripHtml` - Remove HTML tags
- `textToHtml` - Convert plain text to HTML
- `markdownToText` - Convert markdown to plain text

### Path Utilities
- `extractProjectFromPath` - Extract project from area/iteration path
- `replaceProjectInPath(newProject)` - Replace project in path

### Advanced
- **Transformation Chains** - Apply multiple transformations sequentially
- **Context Variables** - Reference other field values with `{field.name}`

**Example Chain:**
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

---

## 📁 Project Structure

```
azureDevOpsSync/
├── server.js                      # Main Express server with route mounting
├── package.json                   # Node.js dependencies
├──.env.example                   # Environment variables template
│
├── database/
│   ├── db.js                      # Knex database connection
│   ├── schema.sql                 # SQLite schema (13 tables)
│   ├── setup.js                   # Database initialization script
│   └── list-tables.js             # List database tables
│
├── lib/
│   ├── crypto.js                  # AES-256-GCM encryption for credentials
│   ├── azureDevOpsClient.js       # Legacy client (being phased out)
│   ├── sanitize.js                # Input sanitization utilities
│   │
│   ├── connectors/
│   │   ├── BaseConnector.js       # Abstract connector base class
│   │   ├── AzureDevOpsConnector.js  # Azure DevOps implementation
│   │   ├── ServiceDeskPlusConnector.js  # ServiceDesk Plus implementation
│   │   ├── ConnectorRegistry.js   # Singleton connector factory
│   │   └── index.js               # Connector exports
│   │
│   └── mapping/
│       ├── transformations.js     # 27 transformation functions
│       └── MappingEngine.js       # Field mapping with caching
│
├── routes/
│   ├── sync.js                    # Legacy sync routes (/api)
│   ├── connectors.js              # Connector management (/api/connectors)
│   ├── metadata.js                # Metadata queries (/api/metadata)
│   ├── sync-configs.js            # Sync configuration (/api/sync-configs)
│   └── execute.js                 # Execution & monitoring (/api/execute)
│
├── scripts/
│   ├── add-connector.js           # Interactive connector setup
│   ├── test-connectors.js         # Test connector connections
│   ├── discover-metadata.js       # Discover work item types/fields
│   └── integration-test.js        # Full platform integration test
│
├── docs/
│   ├── API_REFERENCE.md           # Complete API documentation
│   ├── WORKFLOW_EXAMPLE.md        # End-to-end workflow guide
│   ├── ARCHITECTURE.md            # System architecture
│   ├── ENHANCED_SYNC.md           # Field synchronization details
│   ├── DYNAMIC_FIELD_METADATA.md  # Field metadata handling
│   └── COPILOT_CLI_SETUP.md       # GitHub Copilot CLI setup
│
├── public/
│   ├── index.html                 # Web interface (legacy)
│   ├── styles.css                 # Styles
│   └── app.js                     # Frontend JavaScript
│
└── mcp/
    └── server.js                  # MCP server for Copilot CLI
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Database
DATABASE_PATH=./database/sync.db

# Server
PORT=3000
NODE_ENV=production

# Encryption (auto-generated if not set)
ENCRYPTION_KEY=<auto-generated-32-byte-key>

# Optional: For MCP server
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/yourorg
AZURE_DEVOPS_PAT=your-pat-token
```

### Connector Permissions

**Azure DevOps PAT Requirements:**
- Work Items: **Read & Write**
- Project and Team: **Read**

**ServiceDesk Plus API Key:**
- Requester: **Read & Write**
- Request: **Read & Write**

---

## 🛠️ Development

### Running in Development Mode

```bash
npm run dev
```

Uses `nodemon` for auto-reload on file changes.

### Running Tests

```bash
# Integration test
node scripts/integration-test.js

# Test specific connector
node scripts/test-connectors.js

# Discover metadata
node scripts/discover-metadata.js 1
```

### Database Exploration

```bash
# List tables
node database/list-tables.js

# Query with SQLite CLI
sqlite3 database/sync.db "SELECT * FROM connectors;"
```

---

## 🔒 Security Best Practices

- ✅ **Never commit credentials** - Use environment variables or secure vaults
- ✅ **Credentials encrypted at rest** - AES-256-GCM encryption in database
- ✅ **HTTPS in production** - Use reverse proxy (nginx, Apache) with SSL
- ✅ **API rate limiting** - Built-in: 100 requests per 15 minutes per IP
- ✅ **Input sanitization** - All user inputs sanitized before database insertion
- ✅ **SQL injection protection** - Parameterized queries via Knex.js
- ✅ **Credential exposure** - API responses never include credentials

---

## 🚧 Roadmap

### Phase 5: Automation & Webhooks ⏳
- [ ] Scheduled sync execution (cron-based)
- [ ] Webhook receivers for real-time sync triggers
- [ ] Background job queue
- [ ] Email notifications

### Phase 6: React UI ⏳
- [ ] Modern React frontend
- [ ] Visual field mapping interface (drag-drop)
- [ ] Real-time sync monitoring dashboard
- [ ] Configuration wizards

### Phase 7: Conflict Resolution ⏳
- [ ] Bidirectional sync with conflict detection
- [ ] Resolution strategies (last-write-wins, manual, priority)
- [ ] Change tracking and versioning
- [ ] Conflict resolution UI

### Future Connectors
- [ ] Jira
- [ ] GitHub Issues
- [ ] Asana
- [ ] Trello
- [ ] Monday.com

---

---

## 🐛 Troubleshooting

### Database Issues

**Problem:** `SQLITE_ERROR: no such table`  
**Solution:** Run database setup:
```bash
node database/setup.js
```

**Problem:** Database locked  
**Solution:** Close other connections and restart:
```bash
# Kill any running servers
# Delete sync.db-journal if present
rm database/sync.db-journal
```

### Connector Issues

**Problem:** Connection failed  
**Solution:**
1. Verify credentials are correct
2. Check PAT/API key hasn't expired
3. Test endpoint accessibility:
   ```bash
   # Azure DevOps
   curl https://dev.azure.com/yourorg/_apis/projects
   
   # ServiceDesk Plus
   curl https://yoursite.sdpondemand.com/api/v3/requests
   ```

**Problem:** Metadata discovery fails  
**Solution:**
1. Ensure connector is active (`is_active=1`)
2. Verify project/site name is correct
3. Check API permissions

### Sync Execution Issues

**Problem:** Sync fails with validation errors  
**Solution:**
1. Run validation endpoint: `POST /api/execute/validate/:configId`
2. Check field mapping types match
3. Verify required fields are mapped

**Problem:** Some items skipped  
**Solution:**
1. Check sync filter (WIQL query)
2. Review execution errors: `GET /api/execute/status/:executionId`
3. Verify target connector permissions

### MCP Server Issues

**Problem:** Copilot CLI can't connect  
**Solution:**
1. Verify `mcp-config.json` path: `~/.copilot/mcp-config.json`
2. Check Node.js is in PATH: `node --version`
3. Test MCP server manually: `node mcp/server.js`

**Problem:** Environment variables not loaded  
**Solution:**
```powershell
# Windows
$env:AZURE_DEVOPS_PAT = "your-token"
[System.Environment]::SetEnvironmentVariable('AZURE_DEVOPS_PAT', 'your-token', 'User')

# Linux/macOS
export AZURE_DEVOPS_PAT="your-token"
echo 'export AZURE_DEVOPS_PAT="your-token"' >> ~/.bashrc
```

### API Issues

**Problem:** 429 Too Many Requests  
**Solution:** Rate limit hit (100 req/15min). Wait or reduce request frequency.

**Problem:** 404 Not Found  
**Solution:** Check endpoint path and ensure server is running on correct port.

**Problem:** 500 Internal Server Error  
**Solution:** Check server logs for stack trace, verify database integrity.

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Setup

```bash
# Fork and clone
git clone https://github.com/yourusername/azureDevOpsSync.git
cd azureDevOpsSync

# Install dependencies
npm install

# Set up database
node database/setup.js

# Run in dev mode
npm run dev
```

### Contribution Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow existing code style
   - Add comments for complex logic
   - Update documentation if needed

3. **Test thoroughly**
   ```bash
   node scripts/integration-test.js
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: add Jira connector support"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

### Adding a New Connector

1. Create `lib/connectors/YourConnector.js` extending `BaseConnector`
2. Implement all abstract methods
3. Register in `ConnectorRegistry.js`
4. Add to `getRegisteredTypes()` and factory in `createConnector()`
5. Test with `scripts/test-connectors.js`
6. Update documentation

**See [lib/connectors/ServiceDeskPlusConnector.js](lib/connectors/ServiceDeskPlusConnector.js) for reference.**

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

Free to use, modify, and distribute. Attribution appreciated but not required.

---

## 📞 Support & Resources

### Documentation
- 📖 [API Reference](docs/API_REFERENCE.md) - Complete API documentation
- 📖 [Workflow Guide](docs/WORKFLOW_EXAMPLE.md) - Step-by-step examples
- 📖 [Architecture](docs/ARCHITECTURE.md) - System design
- 📖 [Copilot CLI Setup](docs/COPILOT_CLI_SETUP.md) - GitHub Copilot integration

### External Resources
- [Azure DevOps REST API](https://docs.microsoft.com/en-us/rest/api/azure/devops/)
- [ServiceDesk Plus API](https://www.manageengine.com/products/service-desk/sdpod-v3-api/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [GitHub Copilot CLI](https://githubnext.com/projects/copilot-cli)

### Get Help
- 🐛 [Report Issues](https://github.com/AlexanderErdelyi/azureDevOpsSync/issues)
- 💬 [Discussions](https://github.com/AlexanderErdelyi/azureDevOpsSync/discussions)
- 📧 Email: your-email@example.com

---

## 🎯 Key Benefits

✅ **Save Time** - Automate manual work item copying  
✅ **Reduce Errors** - Consistent field mappings and transformations  
✅ **Stay Synced** - Keep multiple systems in sync effortlessly  
✅ **Extensible** - Add new connectors with minimal code  
✅ **Auditable** - Complete history of all sync operations  
✅ **Secure** - Encrypted credentials, rate limiting, input sanitization  

---

## 🌟 Acknowledgments

Built with:
- [Express.js](https://expressjs.com/) - Web framework
- [Knex.js](https://knexjs.org/) - SQL query builder
- [SQLite](https://www.sqlite.org/) - Embedded database
- [Azure DevOps Node API](https://github.com/microsoft/azure-devops-node-api) - Azure DevOps client
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP integration

Special thanks to the open-source community!

---

<div align="center">

**⭐ If this project helps you, consider giving it a star on GitHub! ⭐**

Made with ❤️ by [Alexander Erdelyi](https://github.com/AlexanderErdelyi)

</div>


