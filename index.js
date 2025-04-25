require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { MongoClient, ObjectId } = require('mongodb');
const redis = require('redis');
const mjml2html = require('mjml');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const winston = require('winston');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const automationExecutor = require('./services/automationExecutor');
const automationScheduler = require('./services/scheduler');
const bullQueue = require('./services/bullQueue');
const mongoose = require('mongoose');

// Configure Winston logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Swagger configuration
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Email Tracking API',
            version: '1.0.0',
            description: 'API for email tracking and campaign management'
        },
        servers: [
            {
                url: process.env.API_URL || 'http://localhost:8080'
            }
        ]
    },
    apis: ['./routes/*.js']
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Connect to MongoDB with mongoose
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/emailTracker', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connected successfully');
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Initialize tenant map for storing active tenant connections
const tenantMap = new Map();

// Tenant middleware - extracts tenant info from API key
async function tenantMiddleware(req, res, next) {
    try {
        const apiKey = req.headers['x-api-key'];
        
        if (!apiKey) {
            console.error('API key is missing in request headers');
            return res.status(401).json({
                success: false,
                error: 'API key is required'
            });
        }
        
        // Development mode special case - allow testing with a known API key
        if (process.env.NODE_ENV === 'development' && apiKey === 'dev-default-key-123') {
            console.log('Using development mode with default API key');
            // Connect to a default tenant for development
            const defaultTenantId = process.env.DEFAULT_TENANT_ID || 'default';
            
            // If we already have this tenant in the map, use it
            if (tenantMap.has('dev-default-key-123')) {
                const tenantInfo = tenantMap.get('dev-default-key-123');
                req.tenantConfig = tenantInfo;
                req.tenantDB = tenantInfo.db;
                req.tenantId = defaultTenantId;
                return next();
            }
            
            // Otherwise create a new connection to a default database
            try {
                const devClient = new MongoClient(process.env.TENANT_DB_URI || process.env.MONGODB_URI);
                await devClient.connect();
                
                const devDb = devClient.db(process.env.DEFAULT_DB_NAME || 'defaultTenant');
                
                // Create a minimal tenant info object
                const devTenantInfo = {
                    _id: new ObjectId(defaultTenantId),
                    storeName: 'Development Store',
                    dbName: process.env.DEFAULT_DB_NAME || 'defaultTenant',
                    db: devDb,
                    client: devClient
                };
                
                tenantMap.set('dev-default-key-123', devTenantInfo);
                
                req.tenantConfig = devTenantInfo;
                req.tenantDB = devDb;
                req.tenantId = defaultTenantId;
                
                return next();
            } catch (devError) {
                console.error('Error setting up development tenant:', devError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to set up development environment',
                    details: process.env.NODE_ENV === 'development' ? devError.message : undefined
                });
            }
        }
        
        // Check if tenant is already in the map
        if (tenantMap.has(apiKey)) {
            const tenantInfo = tenantMap.get(apiKey);
            req.tenantConfig = tenantInfo;
            req.tenantDB = tenantInfo.db;
            req.tenantId = tenantInfo._id.toString();
            return next();
        }
        
        // Connect to admin database to find tenant
        const adminClient = new MongoClient(process.env.ADMIN_DB_URI);
        await adminClient.connect();
        
        const adminDb = adminClient.db(process.env.ADMIN_DB_NAME || 'adminEB');
        const tenantInfo = await adminDb.collection('tenants').findOne({ apiKey });
        
        if (!tenantInfo) {
            await adminClient.close();
            console.error(`Invalid API key: ${apiKey}`);
            return res.status(401).json({
                success: false,
                error: 'Invalid API key'
            });
        }
        
        // Connect to tenant database
        const tenantClient = new MongoClient(process.env.TENANT_DB_URI);
        await tenantClient.connect();
        
        const tenantDb = tenantClient.db(tenantInfo.dbName);
        
        // Store tenant info in map
        tenantInfo.db = tenantDb;
        tenantInfo.client = tenantClient;
        tenantMap.set(apiKey, tenantInfo);
        
        // Store tenant info in request
        req.tenantConfig = tenantInfo;
        req.tenantDB = tenantDb;
        req.tenantId = tenantInfo._id.toString();
        
        // Close admin client
        await adminClient.close();
        
        next();
    } catch (error) {
        console.error('Tenant middleware error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// For bearer token-based auth
async function authTokenMiddleware(req, res, next) {
    try {
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
            decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }
        
        // Store user and tenant info in request
        req.user = decodedToken;
        req.tenantId = decodedToken.tenantId || decodedToken.dbName;
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// 5. Rate Limiter Configuration
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests, please try again later",
    keyGenerator: (req) => req.headers['x-api-key']
});

// 6. Public routes (no tenant middleware)
// These must come BEFORE the tenant middleware to avoid tenantDB requirement

// Auth routes (public endpoints for auth)
const authRoute = require('./routes/Auth.js');
app.use('/auth', authRoute);

// Super admin route - maintain and manage tenants
const adminRoute = require('./routes/admin.js');
app.use('/admin', adminRoute);

// Public email tracking endpoints (pixel tracking, link tracking)
const emailTrackingRoutes = require('./routes/emailTracking.js');
app.use('/track', emailTrackingRoutes);

// Public WhatsApp webhook endpoint for receiving callbacks from Gupshup
const whatsapp = require('./routes/Whatsapp.js');
app.post('/whatsapp/webhook', async (req, res) => {
  console.log('Webhook received at absolute path');
  try {
    if (typeof whatsapp.handleWebhook === 'function') {
      return await whatsapp.handleWebhook(req, res);
    } else {
      // Fall back to using the webhook route directly
      const payload = req.body;
      console.log('Webhook payload (from absolute path):', JSON.stringify(payload, null, 2));
      res.status(200).json({ success: true });
    }
  } catch (error) {
    console.error('Error processing webhook at absolute path:', error);
    res.status(200).json({ success: false, error: error.message });
  }
});

// 7. Tenant-specific routes
// All routes below this will require a valid tenant API key

// Import routes
const routes = require('./routes/users.js');
const eventRoutes = require('./routes/events.js');
const campaignRoutes = require('./routes/campaign.js');
const whatsappRoutes = require('./routes/Whatsapp.js');
const dbroute = require('./routes/dashboard.js');
const googleDoc = require('./routes/GoogleDoc.js');
const users = require('./routes/users.js');
const automationRoutes = require('./routes/automation.js');

// Protect legacy routes with tenant middleware
const tenantRouter = express.Router();
tenantRouter.use(tenantMiddleware);
tenantRouter.use('/whatsapp', whatsappRoutes);
tenantRouter.use('/campaign', campaignRoutes);
tenantRouter.use('/automation', automationRoutes);
tenantRouter.use('/events', eventRoutes);
tenantRouter.use('/users', users);

// Middleware to attach tenant ID to the request object
tenantRouter.use((req, res, next) => {
  // Extract tenant ID from token
  const token = req.headers.authorization?.split(' ')[1];
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      req.tenantId = decoded.tenantId || decoded.dbName; // Support both formats
      req.userEmail = decoded.email;
    } catch (err) {
      console.error('Token verification error:', err.message);
    }
  }
  
  next();
});

// Register tenant-specific routes
const tenantSettingsRoutes = require('./routes/tenantSettings');
tenantRouter.use('/settings', tenantSettingsRoutes);

// Apply to Express app
app.use(tenantRouter);  // careful with root routes

// New routes under /api prefix
const apiRouter = express.Router();
apiRouter.use(tenantMiddleware);
apiRouter.use(apiLimiter);

app.use('/api/dbroute', apiRouter, dbroute);
app.use('/api/google', apiRouter, googleDoc);
app.use('/api/events', apiRouter, eventRoutes);
app.use('/api', apiRouter, routes);

// Protected email tracking endpoints that require authentication
app.use('/api/email-tracking', apiRouter, emailTrackingRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Add debug logging middleware for automation execution
app.use((req, res, next) => {
    // Log detailed information about automation execution requests
    if (req.path.includes('/automation/') && req.path.includes('/execute')) {
        console.log('\n================ AUTOMATION EXECUTION REQUEST ================');
        console.log(`Path: ${req.path}`);
        console.log(`Method: ${req.method}`);
        console.log('Headers:');
        console.log(JSON.stringify(req.headers, null, 2));
        console.log('Body:');
        console.log(JSON.stringify(req.body, null, 2));
        console.log('================================================================\n');
    }
    
    // Continue processing the request
    next();
});

// Initialize workers for active tenants
async function initializeWorkers() {
    try {
        // Get all active tenants
        const adminClient = new MongoClient(process.env.ADMIN_DB_URI);
        await adminClient.connect();
        
        const adminDb = adminClient.db(process.env.ADMIN_DB_NAME || 'adminEB');
        const tenants = await adminDb.collection('tenants').find({ status: 'active' }).toArray();
        
        console.log(`Initializing workers for ${tenants.length} active tenants`);
        
        // Create workers for each tenant
        for (const tenant of tenants) {
            const tenantId = tenant._id.toString();
            
            // Create email tracking worker
            const trackingWorker = bullQueue.createEmailTrackingWorker(tenantId);
            console.log(`Started email tracking worker for tenant ${tenant.storeName}`);
            
            // Create email sending worker
            const sendWorker = bullQueue.createEmailSendWorker(tenantId);
            console.log(`Started email sending worker for tenant ${tenant.storeName}`);
        }
        
        await adminClient.close();
        console.log('All workers initialized successfully');
    } catch (error) {
        console.error('Error initializing workers:', error);
    }
}

// Start the server
const PORT = process.env.PORT || 5174;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    
    // Initialize workers for active tenants
    await initializeWorkers();
    
    // Initialize automation scheduler
    if (automationScheduler) {
        await automationScheduler.initialize();
    }
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    
    // Close all tenant connections
    for (const [key, tenant] of tenantMap.entries()) {
        if (tenant.client) {
            await tenant.client.close();
        }
    }
    
    // Close mongoose connection
    await mongoose.connection.close();
    
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process in production
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
});

module.exports = app;