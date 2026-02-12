const express = require('express');
const router = express.Router();
const AzureDevOpsClient = require('../lib/azureDevOpsClient');
const { sanitizeProjectName } = require('../lib/sanitize');

// Initialize Azure DevOps client
let client = null;

function getClient() {
  if (!client && process.env.AZURE_DEVOPS_ORG_URL && process.env.AZURE_DEVOPS_PAT) {
    client = new AzureDevOpsClient(
      process.env.AZURE_DEVOPS_ORG_URL,
      process.env.AZURE_DEVOPS_PAT
    );
  }
  return client;
}

// Test connection endpoint
router.post('/test-connection', async (req, res) => {
  try {
    const { orgUrl, token } = req.body;
    const testClient = new AzureDevOpsClient(orgUrl, token);
    await testClient.connect();
    res.json({ success: true, message: 'Connection successful' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get work items from a project
router.post('/work-items', async (req, res) => {
  try {
    const { orgUrl, token, project, wiql } = req.body;
    const syncClient = new AzureDevOpsClient(orgUrl, token);
    
    // Sanitize project name to prevent WIQL injection
    const sanitizedProject = sanitizeProjectName(project);
    const query = wiql || `SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.TeamProject] = '${sanitizedProject}'`;
    const workItems = await syncClient.getWorkItems(project, query);
    
    res.json({ success: true, workItems });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get field definitions for a work item type
router.post('/work-item-type-fields', async (req, res) => {
  try {
    const { orgUrl, token, project, workItemType } = req.body;
    
    if (!orgUrl || !token || !project || !workItemType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: orgUrl, token, project, workItemType' 
      });
    }

    const syncClient = new AzureDevOpsClient(orgUrl, token);
    const fieldMetadata = await syncClient.getWorkItemTypeFieldsWithReferences(project, workItemType);
    
    res.json({ 
      success: true, 
      project,
      workItemType,
      fieldCount: Object.keys(fieldMetadata).length,
      fields: fieldMetadata
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync work items between projects
router.post('/sync', async (req, res) => {
  try {
    const { 
      orgUrl, 
      token, 
      sourceProject, 
      targetProject, 
      workItemIds,
      syncOptions = {}
    } = req.body;
    
    if (!orgUrl || !token || !sourceProject || !targetProject) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: orgUrl, token, sourceProject, targetProject' 
      });
    }

    const syncClient = new AzureDevOpsClient(orgUrl, token);
    const results = [];
    const errors = [];

    // If specific work item IDs are provided, sync those
    if (workItemIds && workItemIds.length > 0) {
      for (const id of workItemIds) {
        try {
          const sourceWorkItem = await syncClient.getWorkItem(id);
          const syncResult = await syncClient.syncWorkItemWithDetails(sourceWorkItem, targetProject, syncOptions);
          results.push(syncResult);
        } catch (error) {
          errors.push({
            workItemId: id,
            error: error.message
          });
        }
      }
    } else {
      // Sync all work items from source project
      // Sanitize project name to prevent WIQL injection
      const sanitizedProject = sanitizeProjectName(sourceProject);
      const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${sanitizedProject}'`;
      const sourceWorkItems = await syncClient.getWorkItems(sourceProject, wiql);
      
      for (const workItem of sourceWorkItems) {
        try {
          const syncResult = await syncClient.syncWorkItemWithDetails(workItem, targetProject, syncOptions);
          results.push(syncResult);
        } catch (error) {
          errors.push({
            workItemId: workItem.id,
            error: error.message
          });
        }
      }
    }

    res.json({ 
      success: true, 
      synced: results.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
