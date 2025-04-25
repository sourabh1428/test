const { MongoClient } = require('mongodb');
const redis = require('redis');
require('dotenv').config();

// Initialize Redis client
const redisClient = redis.createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

// Admin database configuration
const adminDbClient = new MongoClient(process.env.ADMIN_DB_URI);
const adminDb = adminDbClient.db('adminEB'); // Using your adminEB database

const validateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // 1. Check Redis cache first
    const cachedConfig = await redisClient.get(`tenant:${apiKey}`);
    if (cachedConfig) {
      req.tenantConfig = JSON.parse(cachedConfig);
      return next();
    }

    // 2. Query adminEB database
    const tenantConfig = await adminDb.collection('tenants').findOne({ 
      apiKey: apiKey,
      status: 'active' // Add any additional filters
    });

    if (!tenantConfig) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    // 3. Cache in Redis for 5 minutes
    await redisClient.setEx(
      `tenant:${apiKey}`,
      300,
      JSON.stringify(tenantConfig)
    );

    // 4. Attach tenant config to request
    req.tenantConfig = tenantConfig;
    
    next();
    
  } catch (error) {
    console.error('API Key validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  await Promise.all([
    adminDbClient.close(),
    redisClient.quit()
  ]);
});

module.exports = validateApiKey;