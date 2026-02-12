#!/usr/bin/env node

/**
 * MCP Server for Azure DevOps Work Item Sync
 * 
 * This server implements the Model Context Protocol (MCP) to provide
 * programmatic access to Azure DevOps work item synchronization.
 * 
 * Usage with GitHub Copilot CLI:
 *   gh copilot suggest "sync work items from ProjectA to ProjectB"
 * 
 * This is a simplified MCP implementation that communicates via JSON-RPC over stdio.
 */

const readline = require('readline');
const AzureDevOpsClient = require('../lib/azureDevOpsClient');

// MCP Protocol implementation
const MCP_VERSION = '2024-11-05';

// Environment configuration
const AZURE_DEVOPS_ORG_URL = process.env.AZURE_DEVOPS_ORG_URL;
const AZURE_DEVOPS_PAT = process.env.AZURE_DEVOPS_PAT;

// Initialize client
let client = null;
function getClient() {
  if (!client && AZURE_DEVOPS_ORG_URL && AZURE_DEVOPS_PAT) {
    client = new AzureDevOpsClient(AZURE_DEVOPS_ORG_URL, AZURE_DEVOPS_PAT);
  }
  return client;
}

// Tool definitions
const TOOLS = [
  {
    name: 'test_connection',
    description: 'Test connection to Azure DevOps',
    inputSchema: {
      type: 'object',
      properties: {
        orgUrl: {
          type: 'string',
          description: 'Azure DevOps organization URL (e.g., https://dev.azure.com/myorg)',
        },
        token: {
          type: 'string',
          description: 'Personal Access Token for authentication',
        },
      },
      required: ['orgUrl', 'token'],
    },
  },
  {
    name: 'get_work_items',
    description: 'Get work items from an Azure DevOps project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name',
        },
        wiql: {
          type: 'string',
          description: 'Optional WIQL query to filter work items',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'sync_work_items',
    description: 'Sync work items from source project to target project',
    inputSchema: {
      type: 'object',
      properties: {
        sourceProject: {
          type: 'string',
          description: 'Source project name',
        },
        targetProject: {
          type: 'string',
          description: 'Target project name',
        },
        workItemIds: {
          type: 'array',
          items: {
            type: 'number',
          },
          description: 'Optional array of specific work item IDs to sync',
        },
      },
      required: ['sourceProject', 'targetProject'],
    },
  },
  {
    name: 'get_work_item',
    description: 'Get details of a specific work item',
    inputSchema: {
      type: 'object',
      properties: {
        workItemId: {
          type: 'number',
          description: 'Work item ID',
        },
      },
      required: ['workItemId'],
    },
  },
];

// Tool execution handler
async function executeTool(name, args) {
  try {
    switch (name) {
      case 'test_connection': {
        const testClient = new AzureDevOpsClient(args.orgUrl, args.token);
        await testClient.connect();
        return {
          success: true,
          message: 'Connection to Azure DevOps successful',
        };
      }

      case 'get_work_items': {
        const syncClient = getClient();
        if (!syncClient) {
          throw new Error('Azure DevOps client not configured. Set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT environment variables.');
        }

        // Sanitize project name to prevent WIQL injection
        const sanitizedProject = args.project.replace(/'/g, "''");
        const wiql = args.wiql || `SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.TeamProject] = '${sanitizedProject}'`;
        const workItems = await syncClient.getWorkItems(args.project, wiql);

        return {
          success: true,
          count: workItems.length,
          workItems: workItems.map(wi => ({
            id: wi.id,
            title: wi.fields['System.Title'],
            state: wi.fields['System.State'],
            type: wi.fields['System.WorkItemType'],
          })),
        };
      }

      case 'sync_work_items': {
        const syncClient = getClient();
        if (!syncClient) {
          throw new Error('Azure DevOps client not configured. Set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT environment variables.');
        }

        const results = [];
        const errors = [];

        if (args.workItemIds && args.workItemIds.length > 0) {
          // Sync specific work items
          for (const id of args.workItemIds) {
            try {
              const sourceWorkItem = await syncClient.getWorkItem(id);
              const targetWorkItem = await syncClient.syncWorkItem(sourceWorkItem, args.targetProject);
              results.push({
                sourceId: id,
                targetId: targetWorkItem.id,
                title: sourceWorkItem.fields['System.Title'],
              });
            } catch (error) {
              errors.push({
                workItemId: id,
                error: error.message,
              });
            }
          }
        } else {
          // Sync all work items
          // Sanitize project name to prevent WIQL injection
          const sanitizedProject = args.sourceProject.replace(/'/g, "''");
          const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${sanitizedProject}'`;
          const sourceWorkItems = await syncClient.getWorkItems(args.sourceProject, wiql);

          for (const workItem of sourceWorkItems) {
            try {
              const targetWorkItem = await syncClient.syncWorkItem(workItem, args.targetProject);
              results.push({
                sourceId: workItem.id,
                targetId: targetWorkItem.id,
                title: workItem.fields['System.Title'],
              });
            } catch (error) {
              errors.push({
                workItemId: workItem.id,
                error: error.message,
              });
            }
          }
        }

        return {
          success: true,
          synced: results.length,
          results,
          errors: errors.length > 0 ? errors : undefined,
        };
      }

      case 'get_work_item': {
        const syncClient = getClient();
        if (!syncClient) {
          throw new Error('Azure DevOps client not configured. Set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT environment variables.');
        }

        const workItem = await syncClient.getWorkItem(args.workItemId);

        return {
          success: true,
          workItem: {
            id: workItem.id,
            title: workItem.fields['System.Title'],
            description: workItem.fields['System.Description'],
            state: workItem.fields['System.State'],
            type: workItem.fields['System.WorkItemType'],
            project: workItem.fields['System.TeamProject'],
            createdDate: workItem.fields['System.CreatedDate'],
            changedDate: workItem.fields['System.ChangedDate'],
          },
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// JSON-RPC message handler
async function handleMessage(message) {
  try {
    const request = JSON.parse(message);
    
    if (request.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: MCP_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'azure-devops-sync',
            version: '1.0.0',
          },
        },
      };
    }
    
    if (request.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: TOOLS,
        },
      };
    }
    
    if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;
      const result = await executeTool(name, args);
      
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      };
    }
    
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32601,
        message: `Method not found: ${request.method}`,
      },
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: `Parse error: ${error.message}`,
      },
    };
  }
}

// Start server
async function main() {
  console.error('Azure DevOps Sync MCP Server running on stdio');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  
  rl.on('line', async (line) => {
    if (line.trim()) {
      const response = await handleMessage(line);
      console.log(JSON.stringify(response));
    }
  });
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
