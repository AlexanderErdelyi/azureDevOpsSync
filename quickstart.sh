# 1. Setup database
node database/setup.js

# 2. Add connector
node scripts/add-connector.js

# 3. Test connection
node scripts/test-connectors.js

# 4. Discover metadata
node scripts/discover-metadata.js 1

# 5. Start server
npm start