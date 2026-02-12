/**
 * CronScheduler - Manages scheduled sync execution
 * 
 * Handles:
 * - Loading scheduled sync configs from database
 * - Setting up cron jobs based on schedule_cron field
 * - Executing syncs at scheduled times
 * - Updating next_sync_at timestamp
 * - Automatic rescheduling after execution
 */

const cron = require('node-cron');
const { db } = require('../../database/db');
const { registry } = require('../connectors');
const MappingEngine = require('../mapping/MappingEngine');

class CronScheduler {
  constructor() {
    this.jobs = new Map(); // Map<configId, ScheduledTask>
    this.isRunning = false;
    this.lastHeartbeat = null;
    this.heartbeatInterval = null;
  }

  /**
   * Start the scheduler - load all scheduled configs and set up cron jobs
   */
  async start() {
    if (this.isRunning) {
      console.log('CronScheduler: Already running');
      return;
    }

    console.log('CronScheduler: Starting scheduler...');
    this.isRunning = true;
    this.lastHeartbeat = Date.now();

    // Start heartbeat timer
    this.heartbeatInterval = setInterval(() => {
      this.lastHeartbeat = Date.now();
    }, 30000); // Update every 30 seconds

    try {
      // Load all active scheduled sync configs
      const configs = await db('sync_configs')
        .where({ is_active: 1, trigger_type: 'scheduled' })
        .whereNotNull('schedule_cron');

      console.log(`CronScheduler: Found ${configs.length} scheduled sync config(s)`);

      for (const config of configs) {
        await this.scheduleSync(config.id, config.schedule_cron, config.name);
      }

      console.log(`CronScheduler: ${this.jobs.size} job(s) scheduled`);
    } catch (error) {
      console.error('CronScheduler: Error starting scheduler:', error);
      this.isRunning = false;
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      throw error;
    }
  }

  /**
   * Stop the scheduler - cancel all cron jobs
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('CronScheduler: Stopping scheduler...');

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const [configId, task] of this.jobs) {
      task.stop();
      console.log(`CronScheduler: Stopped job for sync config ${configId}`);
    }

    this.jobs.clear();
    this.isRunning = false;
    console.log('CronScheduler: Scheduler stopped');
  }

  /**
   * Schedule a sync configuration
   * @param {number} configId - Sync configuration ID
   * @param {string} cronExpression - Cron expression (e.g., "0 * * * *" for hourly)
   * @param {string} name - Config name for logging
   */
  async scheduleSync(configId, cronExpression, name) {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      console.error(`CronScheduler: Invalid cron expression for config ${configId}: ${cronExpression}`);
      return;
    }

    // Cancel existing job if present
    if (this.jobs.has(configId)) {
      this.jobs.get(configId).stop();
      this.jobs.delete(configId);
    }

    // Create new cron job
    const task = cron.schedule(cronExpression, async () => {
      console.log(`CronScheduler: Executing scheduled sync for config ${configId} (${name})`);
      
      try {
        await this.executeSync(configId);
        
        // Update next_sync_at and last_sync_at
        const nextRun = this.getNextRunTime(cronExpression);
        await db('sync_configs')
          .where({ id: configId })
          .update({
            last_sync_at: new Date().toISOString(),
            next_sync_at: new Date(nextRun).toISOString()
          });

        console.log(`CronScheduler: Sync completed for config ${configId}. Next run: ${new Date(nextRun)}`);
      } catch (error) {
        console.error(`CronScheduler: Error executing sync for config ${configId}:`, error);
      }
    });

    this.jobs.set(configId, task);

    // Calculate and update next_sync_at immediately
    const nextRun = this.getNextRunTime(cronExpression);
    await db('sync_configs')
      .where({ id: configId })
      .update({ next_sync_at: new Date(nextRun).toISOString() });

    console.log(`CronScheduler: Scheduled sync config ${configId} (${name}) - Next run: ${new Date(nextRun)}`);
  }

  /**
   * Unschedule a sync configuration
   * @param {number} configId - Sync configuration ID
   */
  unscheduleSync(configId) {
    if (this.jobs.has(configId)) {
      this.jobs.get(configId).stop();
      this.jobs.delete(configId);
      console.log(`CronScheduler: Unscheduled sync config ${configId}`);
      
      // Clear next_sync_at
      db('sync_configs')
        .where({ id: configId })
        .update({ next_sync_at: null })
        .catch(err => console.error('Error clearing next_sync_at:', err));
    }
  }

  /**
   * Reschedule a sync configuration (used when cron expression changes)
   * @param {number} configId - Sync configuration ID
   * @param {string} cronExpression - New cron expression
   * @param {string} name - Config name
   */
  async rescheduleSync(configId, cronExpression, name) {
    this.unscheduleSync(configId);
    await this.scheduleSync(configId, cronExpression, name);
  }

  /**
   * Execute a sync configuration
   * @param {number} configId - Sync configuration ID
   */
  async executeSync(configId) {
    // Load sync config
    const config = await db('sync_configs')
      .where({ id: configId })
      .first();

    if (!config) {
      throw new Error(`Sync config ${configId} not found`);
    }

    if (!config.is_active) {
      console.log(`CronScheduler: Skipping inactive config ${configId}`);
      return;
    }

    // Create execution record
    const [executionId] = await db('sync_executions').insert({
      sync_config_id: configId,
      direction: 'source-to-target',
      trigger: 'scheduled',
      status: 'running',
      started_at: new Date().toISOString(),
      items_synced: 0,
      items_failed: 0
    });

    let itemsSynced = 0;
    let itemsFailed = 0;

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

      // Query source work items
      const sourceItems = await sourceConnector.queryWorkItems(syncFilter);
      console.log(`CronScheduler: Found ${sourceItems.length} items to sync`);

      // Process each item
      for (const sourceItem of sourceItems) {
        try {
          // Map work item
          const mappedItem = await mappingEngine.mapWorkItem(sourceItem);

          // Check if already synced
          const existingSync = await db('synced_items')
            .where({
              sync_config_id: configId,
              source_item_id: sourceItem.id.toString()
            })
            .first();

          let targetItemId;

          if (existingSync) {
            // Update existing item
            await targetConnector.updateWorkItem(existingSync.target_item_id, mappedItem.fields);
            targetItemId = existingSync.target_item_id;

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

            // Record in synced_items
            await db('synced_items').insert({
              sync_config_id: configId,
              source_connector_id: config.source_connector_id,
              target_connector_id: config.target_connector_id,
              source_item_id: sourceItem.id.toString(),
              target_item_id: targetItemId.toString(),
              source_item_type: sourceItem.type,
              target_item_type: mappedItem.type,
              last_synced_at: new Date().toISOString(),
              sync_count: 1
            });
          }

          itemsSynced++;
        } catch (itemError) {
          itemsFailed++;
          console.error(`CronScheduler: Error syncing item ${sourceItem.id}:`, itemError);

          // Log error
          await db('sync_errors').insert({
            sync_execution_id: executionId,
            item_id: sourceItem.id.toString(),
            error_type: itemError.name || 'Error',
            error_message: itemError.message,
            stack_trace: itemError.stack,
            created_at: new Date().toISOString()
          });
        }
      }

      // Update execution record - success
      await db('sync_executions')
        .where({ id: executionId })
        .update({
          status: itemsFailed > 0 ? 'completed_with_errors' : 'completed',
          completed_at: new Date().toISOString(),
          items_synced: itemsSynced,
          items_failed: itemsFailed,
          items_processed: itemsSynced + itemsFailed
        });

      console.log(`CronScheduler: Execution ${executionId} completed - ${itemsSynced} synced, ${itemsFailed} failed`);

    } catch (error) {
      // Update execution record - failed
      await db('sync_executions')
        .where({ id: executionId })
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          items_synced: itemsSynced,
          items_failed: itemsFailed,
          items_processed: itemsSynced + itemsFailed,
          error_message: error.message
        });

      throw error;
    }
  }

  /**
   * Calculate next run time for a cron expression
   * @param {string} cronExpression - Cron expression
   * @returns {number} Timestamp of next run
   */
  getNextRunTime(cronExpression) {
    // Parse cron expression and calculate next run
    // This is a simplified version - for production use a proper cron parser
    const now = new Date();
    const parts = cronExpression.split(' ');

    if (parts.length !== 5) {
      // Default to 1 hour from now if invalid
      return now.getTime() + 3600000;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Simple calculation for common patterns
    if (cronExpression === '0 * * * *') {
      // Every hour
      now.setHours(now.getHours() + 1, 0, 0, 0);
      return now.getTime();
    } else if (cronExpression === '0 0 * * *') {
      // Daily at midnight
      now.setDate(now.getDate() + 1);
      now.setHours(0, 0, 0, 0);
      return now.getTime();
    } else if (cronExpression.startsWith('*/')) {
      // Every N minutes
      const interval = parseInt(cronExpression.split(' ')[0].substring(2));
      return now.getTime() + (interval * 60000);
    }

    // Default: 1 hour from now
    return now.getTime() + 3600000;
  }

  /**
   * Get list of scheduled jobs
   * @returns {Array} Array of scheduled job info
   */
  async getScheduledJobs() {
    const jobs = [];
    for (const [configId, task] of this.jobs) {
      // Get config details from database
      const config = await db('sync_configs')
        .where({ id: configId })
        .select('name', 'schedule_cron', 'next_sync_at', 'last_sync_at')
        .first();
      
      jobs.push({
        configId,
        configName: config?.name || 'Unknown',
        cronExpression: config?.schedule_cron,
        nextRun: config?.next_sync_at,
        lastRun: config?.last_sync_at,
        isRunning: task.getStatus() === 'scheduled'
      });
    }
    return jobs;
  }

  /**
   * Get scheduler status
   * @returns {Object} Scheduler status
   */
  async getStatus() {
    const now = Date.now();
    const heartbeatAge = this.lastHeartbeat ? now - this.lastHeartbeat : null;
    
    // Scheduler is healthy if running and heartbeat is recent (< 2 minutes)
    const isHealthy = this.isRunning && heartbeatAge !== null && heartbeatAge < 120000;
    
    return {
      isRunning: this.isRunning,
      isHealthy: isHealthy,
      status: this.isRunning ? (isHealthy ? 'healthy' : 'degraded') : 'stopped',
      lastHeartbeat: this.lastHeartbeat,
      heartbeatAgeSeconds: heartbeatAge ? Math.floor(heartbeatAge / 1000) : null,
      jobCount: this.jobs.size,
      jobs: await this.getScheduledJobs()
    };
  }
}

// Singleton instance
const scheduler = new CronScheduler();

module.exports = scheduler;
