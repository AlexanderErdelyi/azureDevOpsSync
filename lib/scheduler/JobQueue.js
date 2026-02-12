/**
 * JobQueue - Simple in-memory job queue for background processing
 * 
 * Handles:
 * - Queuing sync jobs for async execution
 * - Processing jobs in background
 * - Job status tracking
 * - Concurrent job limit
 */

const EventEmitter = require('events');
const { db } = require('../../database/db');
const { registry } = require('../connectors');
const MappingEngine = require('../mapping/MappingEngine');

class JobQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.queue = []; // Pending jobs
    this.activeJobs = new Map(); // Currently processing jobs
    this.completedJobs = new Map(); // Recently completed jobs (last 100)
    this.maxConcurrent = options.maxConcurrent || 3;
    this.maxCompletedHistory = options.maxCompletedHistory || 100;
    this.isProcessing = false;
  }

  /**
   * Add a sync job to the queue
   * @param {Object} jobData - Job data
   * @returns {string} Job ID
   */
  async addJob(jobData) {
    const jobId = this.generateJobId();
    
    const job = {
      id: jobId,
      type: jobData.type || 'sync',
      configId: jobData.configId,
      options: jobData.options || {},
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    };

    this.queue.push(job);
    this.emit('job:queued', job);

    console.log(`JobQueue: Job ${jobId} queued for sync config ${jobData.configId}`);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return jobId;
  }

  /**
   * Process jobs in the queue
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0 || this.activeJobs.size > 0) {
      // Check if we can start more jobs
      while (this.queue.length > 0 && this.activeJobs.size < this.maxConcurrent) {
        const job = this.queue.shift();
        this.startJob(job);
      }

      // Wait a bit before checking again
      await this.sleep(1000);
    }

    this.isProcessing = false;
    console.log('JobQueue: Queue empty, processing stopped');
  }

  /**
   * Start processing a job
   * @param {Object} job - Job to process
   */
  async startJob(job) {
    job.status = 'running';
    job.startedAt = Date.now();
    this.activeJobs.set(job.id, job);
    this.emit('job:started', job);

    console.log(`JobQueue: Starting job ${job.id} (${this.activeJobs.size}/${this.maxConcurrent} active)`);

    try {
      let result;
      
      switch (job.type) {
        case 'sync':
          result = await this.executeSyncJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      job.status = 'completed';
      job.result = result;
      job.completedAt = Date.now();
      
      this.emit('job:completed', job);
      console.log(`JobQueue: Job ${job.id} completed successfully`);

    } catch (error) {
      job.status = 'failed';
      job.error = {
        message: error.message,
        stack: error.stack
      };
      job.completedAt = Date.now();

      this.emit('job:failed', job);
      console.error(`JobQueue: Job ${job.id} failed:`, error);
    } finally {
      // Move to completed jobs
      this.activeJobs.delete(job.id);
      this.addToCompletedHistory(job);
    }
  }

  /**
   * Execute a sync job
   * @param {Object} job - Job to execute
   * @returns {Object} Sync result
   */
  async executeSyncJob(job) {
    const { configId, options } = job;
    const { workItemIds, dryRun } = options;

    // Load sync config
    const config = await db('sync_configs')
      .where({ id: configId })
      .first();

    if (!config) {
      throw new Error(`Sync config ${configId} not found`);
    }

    if (!config.is_active) {
      throw new Error(`Sync config ${configId} is not active`);
    }

    // Create execution record (unless dry run)
    let executionId = null;
    if (!dryRun) {
      [executionId] = await db('sync_executions').insert({
        sync_config_id: configId,
        source_connector_id: config.source_connector_id,
        target_connector_id: config.target_connector_id,
        status: 'running',
        started_at: new Date().toISOString(),
        items_synced: 0,
        items_failed: 0
      });
    }

    const results = {
      executionId,
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      items: []
    };

    try {
      // Get connectors
      const sourceConnector = await registry.getConnector(config.source_connector_id);
      const targetConnector = await registry.getConnector(config.target_connector_id);

      // Initialize mapping engine
      const mappingEngine = new MappingEngine();
      await mappingEngine.loadMappings(configId);

      // Parse sync filter
      const syncFilter = typeof config.sync_filter === 'string' 
        ? JSON.parse(config.sync_filter) 
        : config.sync_filter;

      // Add work item ID filter if specified
      if (workItemIds && workItemIds.length > 0) {
        syncFilter.workItemIds = workItemIds;
      }

      // Query source work items
      const sourceItems = await sourceConnector.queryWorkItems(syncFilter);
      results.total = sourceItems.length;

      console.log(`JobQueue: Processing ${sourceItems.length} items for sync config ${configId}`);

      // Process each item
      for (const sourceItem of sourceItems) {
        try {
          // Map work item
          const mappedItem = await mappingEngine.mapWorkItem(sourceItem);

          let action = 'skipped';
          let targetItemId = null;

          if (!dryRun) {
            // Check if already synced
            const existingSync = await db('synced_items')
              .where({
                sync_config_id: configId,
                source_item_id: sourceItem.id.toString()
              })
              .first();

            if (existingSync) {
              // Update existing item
              await targetConnector.updateWorkItem(existingSync.target_item_id, mappedItem.fields);
              targetItemId = existingSync.target_item_id;
              action = 'updated';
              results.updated++;

              // Update synced_items record
              await db('synced_items')
                .where({ id: existingSync.id })
                .update({
                  last_synced_at: new Date().toISOString(),
                  sync_count: existingSync.sync_count + 1
                });
            } else {
              // Create new item
              const created = await targetConnector.createWorkItem(mappedItem.type, mappedItem.fields);
              targetItemId = created.id;
              action = 'created';
              results.created++;

              // Record in synced_items
              await db('synced_items').insert({
                sync_config_id: configId,
                source_connector_id: config.source_connector_id,
                target_connector_id: config.target_connector_id,
                source_item_id: sourceItem.id.toString(),
                target_item_id: targetItemId.toString(),
                source_type: sourceItem.type,
                target_type: mappedItem.type,
                last_synced_at: new Date().toISOString(),
                sync_count: 1
              });
            }
          } else {
            // Dry run - just check if it exists
            const existingSync = await db('synced_items')
              .where({
                sync_config_id: configId,
                source_item_id: sourceItem.id.toString()
              })
              .first();

            action = existingSync ? 'would-update' : 'would-create';
            targetItemId = existingSync ? existingSync.target_item_id : null;
          }

          results.items.push({
            sourceId: sourceItem.id,
            targetId: targetItemId,
            action,
            success: true
          });

        } catch (itemError) {
          results.errors++;
          console.error(`JobQueue: Error syncing item ${sourceItem.id}:`, itemError);

          results.items.push({
            sourceId: sourceItem.id,
            targetId: null,
            action: 'error',
            success: false,
            error: itemError.message
          });

          // Log error (unless dry run)
          if (!dryRun && executionId) {
            await db('sync_errors').insert({
              execution_id: executionId,
              source_item_id: sourceItem.id.toString(),
              error_type: itemError.name || 'Error',
              error_message: itemError.message,
              stack_trace: itemError.stack,
              occurred_at: new Date().toISOString()
            });
          }
        }
      }

      // Update execution record (unless dry run)
      if (!dryRun && executionId) {
        await db('sync_executions')
          .where({ id: executionId })
          .update({
            status: results.errors === results.total ? 'failed' : 'completed',
            ended_at: new Date().toISOString(),
            items_synced: results.created + results.updated,
            items_failed: results.errors
          });

        // Update last_sync_at on config
        await db('sync_configs')
          .where({ id: configId })
          .update({ last_sync_at: Date.now() });
      }

      return results;

    } catch (error) {
      // Update execution record - failed (unless dry run)
      if (!dryRun && executionId) {
        await db('sync_executions')
          .where({ id: executionId })
          .update({
            status: 'failed',
            ended_at: new Date().toISOString(),
            items_synced: results.created + results.updated,
            items_failed: results.errors,
            error_message: error.message
          });
      }

      throw error;
    }
  }

  /**
   * Get job status
   * @param {string} jobId - Job ID
   * @returns {Object|null} Job status or null if not found
   */
  getJobStatus(jobId) {
    // Check active jobs
    if (this.activeJobs.has(jobId)) {
      return this.activeJobs.get(jobId);
    }

    // Check completed jobs
    if (this.completedJobs.has(jobId)) {
      return this.completedJobs.get(jobId);
    }

    // Check queued jobs
    const queuedJob = this.queue.find(j => j.id === jobId);
    if (queuedJob) {
      return queuedJob;
    }

    return null;
  }

  /**
   * Get queue status
   * @returns {Object} Queue status
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      queuedJobs: this.queue.length,
      activeJobs: this.activeJobs.size,
      maxConcurrent: this.maxConcurrent,
      completedJobs: this.completedJobs.size
    };
  }

  /**
   * Add job to completed history
   * @param {Object} job - Completed job
   */
  addToCompletedHistory(job) {
    this.completedJobs.set(job.id, job);

    // Limit history size
    if (this.completedJobs.size > this.maxCompletedHistory) {
      const firstKey = this.completedJobs.keys().next().value;
      this.completedJobs.delete(firstKey);
    }
  }

  /**
   * Generate unique job ID
   * @returns {string} Job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear completed job history
   */
  clearHistory() {
    this.completedJobs.clear();
    console.log('JobQueue: Cleared completed job history');
  }
}

// Singleton instance
const jobQueue = new JobQueue({ maxConcurrent: 3, maxCompletedHistory: 100 });

module.exports = jobQueue;
