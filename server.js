const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Database and connectors
const { testConnection } = require('./database/db');
const { initializeConnectors } = require('./lib/connectors');
const scheduler = require('./lib/scheduler/CronScheduler');
const jobQueue = require('./lib/scheduler/JobQueue');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs (increased from 100)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for certain endpoints that need higher limits
  skip: (req) => {
    // Allow unlimited requests to scheduler/job queue status endpoints for monitoring
    return req.path === '/api/scheduler/status' || 
           req.path === '/api/jobs/queue' ||
           req.path === '/api/jobs/status';
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public/dist')));

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Multi-Connector API routes
const connectorsRoutes = require('./routes/connectors');
const metadataRoutes = require('./routes/metadata');
const syncConfigsRoutes = require('./routes/sync-configs');
const executeRoutes = require('./routes/execute');
const webhookRoutes = require('./routes/webhooks');
const schedulerRoutes = require('./routes/scheduler');
const conflictsRoutes = require('./routes/conflicts');
const settingsRoutes = require('./routes/settings');

app.use('/api/connectors', connectorsRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/sync-configs', syncConfigsRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/conflicts', conflictsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', schedulerRoutes);

// Legacy Azure DevOps sync routes (deprecated, maintained for backward compatibility)
const syncRoutes = require('./routes/sync');
app.use('/api', syncRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React app for all non-API routes (must be after API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dist/index.html'));
});

// Initialize database and connectors, then start server
async function startServer() {
  try {
    console.log('Initializing server...');
    
    // Test database connection
    const dbOk = await testConnection();
    if (dbOk) {
      console.log('✓ Database connection successful');
    } else {
      console.error('✗ Database connection failed');
      console.error('Run `node database/setup.js` to initialize the database');
      process.exit(1);
    }

    // Initialize connectors
    await initializeConnectors();
    console.log('✓ Connector registry initialized');

    // Start scheduler for scheduled syncs
    try {
      await scheduler.start();
      console.log('✓ Scheduler started');
    } catch (error) {
      console.error('⚠ Scheduler failed to start:', error.message);
      console.error('  Scheduled syncs will not run automatically');
    }

    // Set up job queue event listeners
    const notificationSystem = require('./lib/scheduler/NotificationSystem');
    
    jobQueue.on('job:completed', async (job) => {
      console.log(`Job ${job.id} completed - notifying...`);
      
      // Get sync config name
      const { db } = require('./database/db');
      const config = await db('sync_configs').where({ id: job.configId }).first();
      
      if (config && job.result) {
        await notificationSystem.sendNotifications('sync_completed', {
          syncConfigId: job.configId,
          syncConfigName: config.name,
          executionId: job.result.executionId,
          itemsSynced: job.result.created + job.result.updated,
          itemsFailed: job.result.errors,
          startedAt: job.startedAt,
          endedAt: job.completedAt
        });
      }
    });

    jobQueue.on('job:failed', async (job) => {
      console.log(`Job ${job.id} failed - notifying...`);
      
      // Get sync config name
      const { db } = require('./database/db');
      const config = await db('sync_configs').where({ id: job.configId }).first();
      
      if (config) {
        await notificationSystem.sendNotifications('sync_failed', {
          syncConfigId: job.configId,
          syncConfigName: config.name,
          executionId: job.result ? job.result.executionId : null,
          itemsSynced: job.result ? (job.result.created + job.result.updated) : 0,
          itemsFailed: job.result ? job.result.errors : 0,
          startedAt: job.startedAt,
          endedAt: job.completedAt,
          errorMessage: job.error ? job.error.message : 'Unknown error'
        });
      }
    });

    console.log('✓ Job queue event listeners configured');

    // Start server
    app.listen(PORT, () => {
      console.log('');
      console.log('='.repeat(60));
      console.log(`Multi-Connector Sync Server running on http://localhost:${PORT}`);
      console.log(`Access the web interface at http://localhost:${PORT}`);
      console.log('');
      console.log('Phase 5 Features Active:');
      console.log('  ✓ Scheduled Sync (Cron-based)');
      console.log('  ✓ Webhook Receivers');
      console.log('  ✓ Background Job Queue'); 
      console.log('  ✓ Email Notifications');
      console.log('='.repeat(60));
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('Shutting down gracefully...');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  console.log('Shutting down gracefully...');
  scheduler.stop();
  process.exit(0);
});

startServer();
