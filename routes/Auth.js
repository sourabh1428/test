const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const redis = require('redis');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_secure_jwt_secret';

// Initialize Redis client
const redisClient = redis.createClient({ url: process.env.REDIS_URL });
(async () => {
  await redisClient.connect();
})();

// Initialize MongoDB connection
const adminDbClient = new MongoClient(process.env.ADMIN_DB_URI);
const adminDb = adminDbClient.db('adminEB');

// Helper function to safely convert string to ObjectId
function safeObjectId(id) {
  try {
    return new ObjectId(id);
  } catch (err) {
    console.error('Invalid ObjectId:', id, err);
    return null;
  }
}

// Connect to MongoDB on startup
(async () => {
  try {
    await adminDbClient.connect();
    console.log('Connected to AdminDB');
    
    // Initialize super admin if not exists
    await initializeSuperAdmin();
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
})();

// Initialize super admin account if it doesn't exist
async function initializeSuperAdmin() {
  try {
    const superAdminExists = await adminDb.collection('superAdmins').findOne({ email: process.env.SUPER_ADMIN_EMAIL || 'admin@easibill.com' });
    
    if (!superAdminExists) {
      const defaultPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      
      await adminDb.collection('superAdmins').insertOne({
        email: process.env.SUPER_ADMIN_EMAIL || 'admin@easibill.com',
        password: hashedPassword,
        name: 'Super Admin',
        role: 'superAdmin',
        createdAt: new Date()
      });
      
      console.log('Super admin account created');
    }
  } catch (error) {
    console.error('Error initializing super admin:', error);
  }
}

// Generate a secure API key
function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

// Skip tenant middleware for super admin routes
router.post('/super/signin', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }
    
    const superAdmin = await adminDb.collection('superAdmins').findOne({ email });
    
    if (!superAdmin) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, superAdmin.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Generate JWT token for super admin
    const token = jwt.sign(
      {
        userId: superAdmin._id.toString(),  // Convert ObjectId to string
        email: superAdmin.email,
        role: 'superAdmin'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Store token in Redis
    await redisClient.set(
      `SUPER_ADMIN:${superAdmin._id}`,
      token,
      'EX',
      86400 // 24 hours expiry
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: superAdmin._id,
        email: superAdmin.email,
        name: superAdmin.name,
        role: 'superAdmin'
      }
    });
  } catch (err) {
    console.error('Super admin signin error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Create new tenant (requires super admin token)
router.post('/tenant/create', async (req, res) => {
  try {
    // Verify super admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const token = authHeader.split(' ')[1];
    let decodedToken;
    
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
    
    // Verify that the token belongs to a super admin
    if (decodedToken.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        error: 'Only super admins can create tenants'
      });
    }
    
    // Extract tenant information from request
    const {
      storeName,
      dbName,
      adminEmail,
      adminPassword,
      adminName
    } = req.body;
    
    // Validate required fields
    if (!storeName || !dbName || !adminEmail || !adminPassword) {
      return res.status(400).json({
        success: false,
        error: 'Missing required tenant information'
      });
    }
    
    // Check if tenant with the same dbName or storeName already exists
    const existingTenant = await adminDb.collection('tenants').findOne({
      $or: [
        { dbName },
        { storeName }
      ]
    });
    
    if (existingTenant) {
      return res.status(409).json({
        success: false,
        error: 'A tenant with this name or database already exists'
      });
    }
    
    // Create new tenant record
    const apiKey = generateApiKey();
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    const tenantDocument = {
      storeName,
      dbName,
      apiKey,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      Users: [
        {
          user_email: adminEmail,
          user_name: adminName || 'Admin',
          password: hashedPassword, // Store hashed password
          role: 'admin',
          isVerified: true
        }
      ]
    };
    
    // Insert tenant document
    const result = await adminDb.collection('tenants').insertOne(tenantDocument);
    
    // Initialize tenant database with required collections
    const tenantClient = new MongoClient(process.env.TENANT_DB_URI);
    await tenantClient.connect();
    
    const tenantDb = tenantClient.db(dbName);
    await Promise.all([
      tenantDb.createCollection('Users'),
      tenantDb.createCollection('campaigns'),
      tenantDb.createCollection('segments'),
      tenantDb.createCollection('Settings'),
      tenantDb.createCollection('events')
    ]);
    
    await tenantClient.close();
    
    // Return success response
    res.status(201).json({
      success: true,
      tenant: {
        id: result.insertedId,
        storeName,
        dbName,
        apiKey,
        adminEmail
      }
    });
  } catch (err) {
    console.error('Create tenant error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// List all tenants (requires super admin token)
router.get('/tenants', async (req, res) => {
  try {
    // Verify super admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const token = authHeader.split(' ')[1];
    let decodedToken;
    
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
    
    // Verify that the token belongs to a super admin
    if (decodedToken.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Fetch all tenants
    const tenants = await adminDb.collection('tenants')
      .find({}, { projection: { 
        storeName: 1, 
        dbName: 1, 
        apiKey: 1, 
        status: 1, 
        createdAt: 1,
        "Users.user_email": 1,
        "Users.user_name": 1,
        "Users.role": 1
      }})
      .toArray();
    
    res.json({
      success: true,
      tenants
    });
  } catch (err) {
    console.error('List tenants error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Regular tenant signup route
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  
  try {
    const db = req.tenantDB; // Use tenant-specific database

    // Check if user already exists
    const existingUser = await db.collection('Authentication').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'User already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = {
      username,
      email,
      password: hashedPassword,
      isVerified: false,
      role: 'member',
      createdAt: new Date(),
      tenantId: req.tenantConfig._id // Store tenant reference
    };

    // Insert user
    const result = await db.collection('Authentication').insertOne(newUser);

    // Generate JWT with tenant context
    const token = jwt.sign({ 
      userId: result.insertedId,
      tenantId: req.tenantConfig._id,
      role: 'member'
    }, JWT_SECRET, { expiresIn: '1h' });

    res.status(201).json({ 
      success: true,
      token,
      user: {
        id: result.insertedId,
        username,
        email,
        role: 'member'
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

router.post('/signin', async (req, res) => {
  const { email, password, token } = req.body;
  console.log("Signin attempt for email:", email);
  
  // Token-based authentication
  if (token) {
    try {
      const decodedToken = jwt.verify(token, JWT_SECRET);
      if (decodedToken) {
        // Validate token against Redis
        const storedToken = await redisClient.get(`SIGNIN:${decodedToken.apiKey}`);
        if (storedToken === token) {
          return res.json({
            success: true,
            token,
            user: {
              id: decodedToken.userId,
              email: decodedToken.email,
              role: decodedToken.role,
              apiKey: decodedToken.apiKey,
              dbName: decodedToken.dbName,
              storeName: decodedToken.storeName
            }
          });
        }
      }
    } catch (err) {
      console.error('Invalid JWT token:', err);
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
  }
  
  // Email/Password authentication
  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }
    
    // Query tenants collection
    const tenants = await adminDb
      .collection('tenants')
      .find(
        { "Users.user_email": email }
      )
      .toArray();
    
    if (!tenants || tenants.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Find the tenant and user that matches the email
    let matchedTenant = null;
    let matchedUser = null;
    
    for (const tenant of tenants) {
      const user = tenant.Users.find(u => u.user_email === email);
      if (user) {
        // Verify password - check if it's a bcrypt hash
        if (user.password.startsWith('$2')) {
          // It's already hashed with bcrypt
          const isValidPassword = await bcrypt.compare(password, user.password);
          if (!isValidPassword) {
            return res.status(401).json({
              success: false,
              error: 'Invalid credentials'
            });
          }
        } else {
          // It's a plain text password (legacy)
          if (user.password !== password) {
            return res.status(401).json({
              success: false,
              error: 'Invalid credentials'
            });
          }
          
          // Update to bcrypt hash for security
          const hashedPassword = await bcrypt.hash(password, 10);
          await adminDb.collection('tenants').updateOne(
            { _id: tenant._id, "Users.user_email": email },
            { $set: { "Users.$.password": hashedPassword } }
          );
        }
        
        // Check verification status for non-admin users
        if (user.role !== 'admin' && !user.isVerified) {
          return res.status(403).json({
            success: false,
            error: 'Account not verified'
          });
        }
        
        matchedTenant = tenant;
        matchedUser = user;
        break;
      }
    }
    
    if (!matchedTenant || !matchedUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Generate JWT token
    const newToken = jwt.sign(
      {
        userId: matchedTenant._id,
        email: matchedUser.user_email,
        role: matchedUser.role,
        apiKey: matchedTenant.apiKey,
        dbName: matchedTenant.dbName,
        storeName: matchedTenant.storeName
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // Store token in Redis
    await redisClient.set(
      `SIGNIN:${matchedTenant.apiKey}`,
      newToken,
      'EX',
      3600 // 1 hour expiry
    );
    
    // Send response
    res.json({
      success: true,
      token: newToken,
      user: {
        id: matchedTenant._id,
        email: matchedUser.user_email,
        name: matchedUser.user_name,
        role: matchedUser.role,
        apiKey: matchedTenant.apiKey,
        dbName: matchedTenant.dbName,
        storeName: matchedTenant.storeName
      }
    });
    
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;