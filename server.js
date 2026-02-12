const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Database and connectors
const { testConnection } = require('./database/db');
const { initializeConnectors } = require('./lib/connectors');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Multi-Connector API routes
const connectorsRoutes = require('./routes/connectors');
const metadataRoutes = require('./routes/metadata');
const syncConfigsRoutes = require('./routes/sync-configs');
const executeRoutes = require('./routes/execute');

app.use('/api/connectors', connectorsRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/sync-configs', syncConfigsRoutes);
app.use('/api/execute', executeRoutes);

// Legacy Azure DevOps sync routes (deprecated, maintained for backward compatibility)
const syncRoutes = require('./routes/sync');
app.use('/api', syncRoutes);

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

    // Start server
    app.listen(PORT, () => {
      console.log('');
      console.log('='.repeat(60));
      console.log(`Multi-Connector Sync Server running on http://localhost:${PORT}`);
      console.log(`Access the web interface at http://localhost:${PORT}`);
      console.log('='.repeat(60));
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
