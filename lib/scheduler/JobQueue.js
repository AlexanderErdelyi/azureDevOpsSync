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
const SyncEngine = require('../SyncEngine');

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

    // Use SyncEngine for proper execution and logging
    const syncEngine = new SyncEngine(config);
    await syncEngine.initialize();

    try {
      // Execute sync with SyncEngine
      const results = await syncEngine.execute({
        work_item_ids: workItemIds,
        dry_run: dryRun
      });

      console.log(`JobQueue: Sync completed for config ${configId} - ${results.created} created, ${results.updated} updated, ${results.errors} errors`);

      return results;

    } catch (error) {
      console.error(`JobQueue: Sync failed for config ${configId}:`, error);
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
