const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Database connections
const adminDbClient = new MongoClient(process.env.ADMIN_DB_URI);
const adminDb = adminDbClient.db('adminEB');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_secure_jwt_secret';

// Helper to generate API keys
function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

// Handle ObjectId conversion safely
function safeObjectId(id) {
  try {
    return new ObjectId(id);
  } catch (err) {
    console.error('Invalid ObjectId:', id, err);
    return null;
  }
}

// Authenticate super admin middleware
const superAdminAuth = async (req, res, next) => {
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
    
    // Get super admin details
    let superAdmin;
    try {
      const id = safeObjectId(decodedToken.userId);
      if (!id) {
        throw new Error('Invalid user ID format');
      }
      superAdmin = await adminDb.collection('superAdmins').findOne({ _id: id });
    } catch (err) {
      console.log('Error finding super admin:', err);
      // If there is an error with the ObjectId, try finding by email instead
      superAdmin = await adminDb.collection('superAdmins').findOne({ email: decodedToken.email });
    }
    
    if (!superAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Super admin not found'
      });
    }
    
    // Attach admin details to request
    req.superAdmin = {
      id: superAdmin._id,
      email: superAdmin.email,
      name: superAdmin.name
    };
    
    next();
  } catch (err) {
    console.error('Super admin authentication error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Protect all routes with superAdminAuth middleware
router.use(superAdminAuth);

// Get all tenants
router.get('/tenants', async (req, res) => {
  try {
    const tenants = await adminDb.collection('tenants')
      .find({}, { 
        projection: { 
          storeName: 1, 
          dbName: 1, 
          apiKey: 1, 
          status: 1, 
          createdAt: 1,
          "Users.user_email": 1,
          "Users.user_name": 1,
          "Users.role": 1
        }
      })
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

// Get tenant by ID
router.get('/tenants/:id', async (req, res) => {
  try {
    const id = safeObjectId(req.params.id);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant ID format'
      });
    }
    
    const tenant = await adminDb.collection('tenants').findOne({ _id: id });
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }
    
    res.json({
      success: true,
      tenant
    });
  } catch (err) {
    console.error('Get tenant error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Create new tenant
router.post('/tenants', async (req, res) => {
  try {
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
      createdBy: req.superAdmin.id,
      Users: [
        {
          user_email: adminEmail,
          user_name: adminName || 'Admin',
          password: hashedPassword,
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

// Update tenant status
router.patch('/tenants/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const id = safeObjectId(req.params.id);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant ID format'
      });
    }
    
    if (!status || !['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status value'
      });
    }
    
    const result = await adminDb.collection('tenants').updateOne(
      { _id: id },
      { 
        $set: { 
          status,
          updatedAt: new Date() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }
    
    res.json({
      success: true,
      message: `Tenant status updated to ${status}`
    });
  } catch (err) {
    console.error('Update tenant status error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Generate new API key for tenant
router.post('/tenants/:id/regenerate-api-key', async (req, res) => {
  try {
    const id = safeObjectId(req.params.id);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant ID format'
      });
    }
    
    const newApiKey = generateApiKey();
    
    const result = await adminDb.collection('tenants').updateOne(
      { _id: id },
      { 
        $set: { 
          apiKey: newApiKey,
          updatedAt: new Date() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }
    
    res.json({
      success: true,
      apiKey: newApiKey
    });
  } catch (err) {
    console.error('Regenerate API key error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get tenant usage statistics
router.get('/tenants/:id/stats', async (req, res) => {
  try {
    const id = safeObjectId(req.params.id);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant ID format'
      });
    }
    
    const tenant = await adminDb.collection('tenants').findOne(
      { _id: id },
      { projection: { dbName: 1 } }
    );
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }
    
    // Connect to tenant DB to fetch stats
    const tenantClient = new MongoClient(process.env.TENANT_DB_URI);
    await tenantClient.connect();
    const tenantDb = tenantClient.db(tenant.dbName);
    
    // Get collection stats
    const [
      usersCount,
      campaignsCount,
      eventsCount
    ] = await Promise.all([
      tenantDb.collection('Users').countDocuments(),
      tenantDb.collection('campaigns').countDocuments(),
      tenantDb.collection('events').countDocuments()
    ]);
    
    await tenantClient.close();
    
    res.json({
      success: true,
      stats: {
        usersCount,
        campaignsCount,
        eventsCount
      }
    });
  } catch (err) {
    console.error('Tenant stats error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get all super admins (for super admin management)
router.get('/super-admins', async (req, res) => {
  try {
    const superAdmins = await adminDb.collection('superAdmins')
      .find({}, { 
        projection: { 
          password: 0 
        } 
      })
      .toArray();
    
    res.json({
      success: true,
      superAdmins
    });
  } catch (err) {
    console.error('List super admins error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Create new super admin
router.post('/super-admins', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password and name are required'
      });
    }
    
    // Check if super admin with the same email already exists
    const existingSuperAdmin = await adminDb.collection('superAdmins').findOne({ email });
    
    if (existingSuperAdmin) {
      return res.status(409).json({
        success: false,
        error: 'Super admin with this email already exists'
      });
    }
    
    // Create new super admin
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await adminDb.collection('superAdmins').insertOne({
      email,
      password: hashedPassword,
      name,
      role: 'superAdmin',
      createdAt: new Date(),
      createdBy: req.superAdmin.id
    });
    
    res.status(201).json({
      success: true,
      superAdmin: {
        id: result.insertedId,
        email,
        name
      }
    });
  } catch (err) {
    console.error('Create super admin error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Update current super admin password
router.put('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }
    
    const superAdminId = safeObjectId(req.superAdmin.id);
    
    if (!superAdminId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid superadmin ID format'
      });
    }
    
    const superAdmin = await adminDb.collection('superAdmins').findOne({ 
      _id: superAdminId
    });
    
    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, superAdmin.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await adminDb.collection('superAdmins').updateOne(
      { _id: superAdminId },
      { $set: { password: hashedPassword } }
    );
    
    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get system overview
router.get('/dashboard', async (req, res) => {
  try {
    // Gather system statistics
    const [
      tenantCount,
      activeTenantsCount,
      superAdminCount
    ] = await Promise.all([
      adminDb.collection('tenants').countDocuments(),
      adminDb.collection('tenants').countDocuments({ status: 'active' }),
      adminDb.collection('superAdmins').countDocuments()
    ]);
    
    // Get recent tenants
    const recentTenants = await adminDb.collection('tenants')
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ 
        storeName: 1, 
        dbName: 1, 
        createdAt: 1, 
        status: 1,
        "Users.user_email": 1 
      })
      .toArray();
    
    res.json({
      success: true,
      stats: {
        tenantCount,
        activeTenantsCount,
        superAdminCount
      },
      recentTenants
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get database collections for a tenant
router.get('/tenants/:id/db/collections', async (req, res) => {
  try {
    const id = safeObjectId(req.params.id);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant ID format'
      });
    }
    
    const tenant = await adminDb.collection('tenants').findOne(
      { _id: id },
      { projection: { dbName: 1 } }
    );
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }
    
    // Connect to tenant DB
    const tenantClient = new MongoClient(process.env.TENANT_DB_URI);
    await tenantClient.connect();
    const tenantDb = tenantClient.db(tenant.dbName);
    
    // Get all collections
    const collections = await tenantDb.listCollections().toArray();
    const collectionsInfo = [];
    
    // Get stats for each collection
    for (const collection of collections) {
      const count = await tenantDb.collection(collection.name).countDocuments();
      const stats = await tenantDb.command({ collStats: collection.name });
      
      collectionsInfo.push({
        name: collection.name,
        count,
        size: stats.size,
        avgObjSize: stats.avgObjSize || 0,
        storageSize: stats.storageSize
      });
    }
    
    await tenantClient.close();
    
    res.json({
      success: true,
      dbName: tenant.dbName,
      collections: collectionsInfo
    });
  } catch (err) {
    console.error('Get collections error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get documents from a specific collection (with pagination)
router.get('/tenants/:id/db/collections/:collection', async (req, res) => {
  try {
    const id = safeObjectId(req.params.id);
    const collectionName = req.params.collection;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant ID format'
      });
    }
    
    const tenant = await adminDb.collection('tenants').findOne(
      { _id: id },
      { projection: { dbName: 1 } }
    );
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }
    
    // Connect to tenant DB
    const tenantClient = new MongoClient(process.env.TENANT_DB_URI);
    await tenantClient.connect();
    const tenantDb = tenantClient.db(tenant.dbName);
    
    // Check if collection exists
    const collections = await tenantDb.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      await tenantClient.close();
      return res.status(404).json({
        success: false,
        error: `Collection '${collectionName}' not found`
      });
    }
    
    // Get documents with pagination
    const total = await tenantDb.collection(collectionName).countDocuments();
    const documents = await tenantDb.collection(collectionName)
      .find({})
      .skip(skip)
      .limit(limit)
      .toArray();
    
    await tenantClient.close();
    
    res.json({
      success: true,
      dbName: tenant.dbName,
      collection: collectionName,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      documents
    });
  } catch (err) {
    console.error('Get collection documents error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get users for a tenant with ability to change passwords
router.get('/tenants/:id/users', async (req, res) => {
  try {
    const id = safeObjectId(req.params.id);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant ID format'
      });
    }
    
    const tenant = await adminDb.collection('tenants').findOne(
      { _id: id },
      { projection: { dbName: 1, Users: 1 } }
    );
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }
    
    // Connect to tenant DB to get additional user info if available
    const tenantClient = new MongoClient(process.env.TENANT_DB_URI);
    await tenantClient.connect();
    const tenantDb = tenantClient.db(tenant.dbName);
    
    let dbUsers = [];
    try {
      dbUsers = await tenantDb.collection('Users').find({}, {
        projection: {
          user_email: 1, 
          user_name: 1, 
          role: 1, 
          lastLogin: 1,
          isVerified: 1
        }
      }).toArray();
    } catch (err) {
      console.warn(`Could not retrieve Users collection from ${tenant.dbName}:`, err);
    }
    
    await tenantClient.close();
    
    // Merge tenant.Users with dbUsers if available
    const tenantUsers = tenant.Users || [];
    const users = tenantUsers.map(user => {
      // Strip password
      const { password, ...userWithoutPassword } = user;
      
      // Find matching user in dbUsers
      const dbUser = dbUsers.find(u => u.user_email === user.user_email);
      
      // Merge tenant user with dbUser data if found
      return dbUser ? { ...userWithoutPassword, ...dbUser } : userWithoutPassword;
    });
    
    res.json({
      success: true,
      users
    });
  } catch (err) {
    console.error('Get tenant users error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Reset a user's password
router.put('/tenants/:id/users/:email/reset-password', async (req, res) => {
  try {
    const id = safeObjectId(req.params.id);
    const { email } = req.params;
    const { newPassword } = req.body;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant ID format'
      });
    }
    
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password is required'
      });
    }
    
    const tenant = await adminDb.collection('tenants').findOne({ _id: id });
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }
    
    // Check if user exists in tenant.Users
    const userIndex = tenant.Users?.findIndex(u => u.user_email === email);
    
    if (userIndex === -1 || userIndex === undefined) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password in tenant.Users
    await adminDb.collection('tenants').updateOne(
      { _id: id, "Users.user_email": email },
      { 
        $set: { 
          "Users.$.password": hashedPassword,
          updatedAt: new Date()
        } 
      }
    );
    
    // Connect to tenant DB to update Users collection if it exists
    const tenantClient = new MongoClient(process.env.TENANT_DB_URI);
    await tenantClient.connect();
    const tenantDb = tenantClient.db(tenant.dbName);
    
    try {
      // Update user password in tenant's Users collection if exists
      await tenantDb.collection('Users').updateOne(
        { user_email: email },
        { 
          $set: { 
            password: hashedPassword,
            updatedAt: new Date()
          } 
        }
      );
    } catch (err) {
      console.warn(`Could not update password in ${tenant.dbName} Users collection:`, err);
      // We continue even if this fails; the critical update in tenant.Users was already done
    }
    
    await tenantClient.close();
    
    res.json({
      success: true,
      message: `Password reset successful for ${email}`
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Delete a tenant's database
router.delete('/tenants/:id/db', async (req, res) => {
  try {
    const id = safeObjectId(req.params.id);
    const { confirmDelete } = req.body;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant ID format'
      });
    }
    
    // Require confirmation for this dangerous operation
    if (!confirmDelete || confirmDelete !== 'DELETE') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required. Please set confirmDelete to "DELETE" to confirm.'
      });
    }
    
    const tenant = await adminDb.collection('tenants').findOne(
      { _id: id },
      { projection: { dbName: 1 } }
    );
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }
    
    // Connect and drop the database
    const tenantClient = new MongoClient(process.env.TENANT_DB_URI);
    await tenantClient.connect();
    
    await tenantClient.db(tenant.dbName).dropDatabase();
    
    // Update tenant status to indicate DB deleted
    await adminDb.collection('tenants').updateOne(
      { _id: id },
      { 
        $set: { 
          status: 'deleted',
          dbDeleted: true,
          dbDeletedAt: new Date(),
          dbDeletedBy: req.superAdmin.id,
          updatedAt: new Date()
        } 
      }
    );
    
    await tenantClient.close();
    
    res.json({
      success: true,
      message: `Database ${tenant.dbName} has been deleted`
    });
  } catch (err) {
    console.error('Delete database error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router; 