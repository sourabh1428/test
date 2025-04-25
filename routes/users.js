const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getRedisConnection } = require('../Worker/SegmentProcess');
const { MongoClient } = require('mongodb');
require('dotenv').config();



const adminDbClient = new MongoClient(process.env.ADMIN_DB_URI);
// Middleware for error handling (keep this first)
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// All routes will use the tenantDB from middleware

// User routes
router.get('/', asyncHandler(async (req, res) => {
  console.log('GET /users route hit');
  console.log('Request headers:', req.headers);
  console.log('Tenant DB:', req.tenantDB?.databaseName || 'No tenantDB found');
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const collection = req.tenantDB.collection('Users');
  const [users, totalUsers] = await Promise.all([
    collection.find({}).skip(skip).limit(limit).toArray(),
    collection.countDocuments()
  ]);

  res.json({
    users,
    total: totalUsers,
    page,
    limit,
    totalPages: Math.ceil(totalUsers / limit)
  });
}));

// Export route for bulk users
router.get('/bulk-users', asyncHandler(async (req, res) => {
  console.log('GET /bulk-users route hit');
  console.log('Request headers:', req.headers);
  console.log('Tenant DB:', req.tenantDB?.databaseName || 'No tenantDB found');
  
  const collection = req.tenantDB.collection('Users');
  const [users, totalUsers] = await Promise.all([
    collection.find({}).toArray(),
    collection.countDocuments()
  ]);

  res.json({ users, total: totalUsers });
}));

// Fixed Redis caching routes with tenant isolation
router.post('/users/cache', asyncHandler(async (req, res) => {
  try {
    console.log('POST /users/cache route hit');
    
    const { key, users } = req.body;
    if (!key || !users) {
      return res.status(400).json({ 
        error: 'Key and users data are required' 
      });
    }
    
    const dbName = req.tenantDB.databaseName;
    const tenantKey = `tenant:${dbName}:userChunk:${key}`;
    
    // Stringify once to avoid multiple conversions
    const userData = typeof users === 'string' ? users : JSON.stringify(users);
    
    // Get Redis connection
    const redisClient = await getRedisConnection();
    
    // Store with expiration (1 hour)
    await redisClient.set(tenantKey, userData, { EX: 3600 });
    
    res.status(200).json({ 
      message: 'Users cached successfully',
      key: tenantKey,
      size: userData.length
    });
  } catch (error) {
    console.error('Error caching users:', error);
    res.status(500).json({ 
      error: 'Failed to cache user data',
      details: error.message 
    });
  }
}));

// Also keep the /cache endpoint for consistency
router.post('/cache', asyncHandler(async (req, res) => {
  try {
    console.log('POST /cache route hit');
    
    const { key, users } = req.body;
    if (!key || !users) {
      return res.status(400).json({ 
        error: 'Key and users data are required' 
      });
    }
    
    const dbName = req.tenantDB.databaseName;
    const tenantKey = `tenant:${dbName}:userChunk:${key}`;
    
    // Stringify once to avoid multiple conversions
    const userData = typeof users === 'string' ? users : JSON.stringify(users);
    
    // Get Redis connection
    const redisClient = await getRedisConnection();
    
    // Store with expiration (1 hour)
    await redisClient.set(tenantKey, userData, { EX: 3600 });
    
    res.status(200).json({ 
      message: 'Users cached successfully',
      key: tenantKey,
      size: userData.length
    });
  } catch (error) {
    console.error('Error caching users:', error);
    res.status(500).json({ 
      error: 'Failed to cache user data',
      details: error.message 
    });
  }
}));

router.get('/cache', asyncHandler(async (req, res) => {
  const { key } = req.query;
  const apiKey = req.headers['x-api-key'];
  const dbName = req.tenantDB.databaseName;
  
  if (!key) {
    return res.status(400).json({ 
      error: 'Search key is required' 
    });
  }

  try {
    const redisClient = await getRedisConnection();
    
    // Get all keys matching the pattern
    const pattern = `tenant:${dbName}:userChunk:*`;
    const keys = await redisClient.keys(pattern);

    
    // Fetch all user chunks in parallel
    const userChunksPromises = keys.map(async (redisKey) => {
      const chunk = await redisClient.get(redisKey);
      try {

        
        return chunk ? JSON.parse(chunk) : [];
      } catch (e) {
        console.error(`Error parsing chunk for key ${redisKey}:`, e);
        return [];
      }
    });

    const userChunks = await Promise.all(userChunksPromises);



    res.status(200).json(
     userChunks
    );
    
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ 
      error: 'Error searching user data',
      details: error.message 
    });
  }
}));

// Also keep the /users/cache GET endpoint for backward compatibility
router.get('/users/cache', asyncHandler(async (req, res) => {
  const { key } = req.query;
  const apiKey = req.headers['x-api-key'];
  const dbName = req.tenantDB.databaseName;
  
  if (!key) {
    return res.status(400).json({ 
      error: 'Search key is required' 
    });
  }

  try {
    const redisClient = await getRedisConnection();
    
    // Get all keys matching the pattern
    const pattern = `tenant:${dbName}:userChunk:*`;
    const keys = await redisClient.keys(pattern);

    
    // Fetch all user chunks in parallel
    const userChunksPromises = keys.map(async (redisKey) => {
      const chunk = await redisClient.get(redisKey);
      try {

        
        return chunk ? JSON.parse(chunk) : [];
      } catch (e) {
        console.error(`Error parsing chunk for key ${redisKey}:`, e);
        return [];
      }
    });

    const userChunks = await Promise.all(userChunksPromises);



    res.status(200).json(
     userChunks
    );
    
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ 
      error: 'Error searching user data',
      details: error.message 
    });
  }
}));

// Bunch routes
router.get('/bunch/:bunchId', asyncHandler(async (req, res) => {
  const data = await req.tenantDB.collection('bunch')
    .findOne({ bunchID: req.params.bunchId });
  
  res.json({ data });
}));

router.get('/bunches', asyncHandler(async (req, res) => {
  const data = await req.tenantDB.collection('bunch').find({}).toArray();
  res.json(data);
}));

router.post('/bunch', asyncHandler(async (req, res) => {
  const { bunchID } = req.body;
  
  if (!bunchID) {
    return res.status(400).json({ error: 'bunchID is required' });
  }

  await req.tenantDB.collection('bunch').insertOne({ 
    bunchID,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  
  res.status(201).json({ 
    message: "Bunch created successfully", 
    bunchID 
  });
}));

router.get('/bunch/:bunchId/users', asyncHandler(async (req, res) => {
  const users = await req.tenantDB.collection('Users')
    .find({ bunchID: req.params.bunchId }).toArray();
  res.json(users);
}));

// User management routes
router.get('/user/:MMID', asyncHandler(async (req, res) => {
  const user = await req.tenantDB.collection('Users')
    .findOne({ mmid: req.params.MMID });

  
  user ? res.json(user) : res.status(404).json({ message: "User not found" });
}));

router.post("/user", asyncHandler(async (req, res) => {
  const { name, mobile_number, email, force } = req.body;
  
  const collection = req.tenantDB.collection("Users");
  const existingUser = await collection.findOne({
    $or: [
      { mobile_number },
      { email }
    ]
  });

  if (existingUser && !force) {
    return res.status(409).json({ 
      message: "User already exists", 
      userId: existingUser._id.toString() 
    });
  }

  const userData = {
    _id: new ObjectId(),
    mmid: new ObjectId().toString(),
    name,
    mobile_number,
    email,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  };

  const result = await collection.insertOne(userData);
  res.status(201).json({ 
    message: "User added successfully", 
    userId: result.insertedId.toString()
  });
}));

router.post('/user/attribute', asyncHandler(async (req, res) => {
  const { mmid, attributeName, attributeValue } = req.body;

  const result = await req.tenantDB.collection('Users').updateOne(
    { mmid },
    { 
      $set: { 
        [attributeName]: attributeValue,
        updatedAt: Math.floor(Date.now() / 1000)
      } 
    }
  );

  result.matchedCount 
    ? res.json({ message: "User attribute updated successfully" })
    : res.status(404).json({ error: "User not found" });
}));

// Error handling middleware
router.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: "An unexpected error occurred",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;