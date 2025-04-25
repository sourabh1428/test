const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const axios = require('axios');
const redis = require('redis');
require('dotenv').config();

const CONFIG = {
  MONGODB: {
    ADMIN_DB: 'adminEB',
    COLLECTIONS: {
      CAMPAIGNS: 'campaigns',
      SEGMENTS: 'segments',
      USERS: 'Users',
      EVENTS: 'userEvent'
    }
  },
  API: {
    WHATSAPP: {
      BASE_URL: 'http://localhost:8080/whatsapp',
      ENDPOINT: '/sendWhatsappTemplateMessage',
      HEADERS: {
        'Content-Type': 'application/json'
      },
      CONCURRENCY: 10
    }
  },
  REDIS: {
    URL: process.env.REDIS_URL || 'redis://localhost:6379',
    SEGMENT_TTL: 60 * 60 * 24 * 30
  }
};

let mongoClient;
let adminDbClient;
let redisClient;
let isShuttingDown = false;
async function getAdminConnection() {
  try {
    if (adminDbClient?.topology?.isConnected()) return adminDbClient;
    
    adminDbClient = new MongoClient(process.env.ADMIN_DB_URI, {
      serverApi: ServerApiVersion.v1,
      maxPoolSize: 5,
      connectTimeoutMS: 30000
    });
    
    await adminDbClient.connect();
    console.log('Admin DB connection established');
    return adminDbClient;
  } catch (error) {
    console.error('Admin DB connection error:', error);
    throw error;
  }
}

async function getMongoConnection(tenantDbName) {
  if (!tenantDbName) {
    throw new Error('Tenant database name is required');
  }

  try {
    if (mongoClient?.topology?.isConnected()) {
      const db = mongoClient.db(tenantDbName);
      // Verify connection is working
      await db.command({ ping: 1 });
      return db;
    }

    mongoClient = new MongoClient(process.env.TENANT_DB_URI, {
      serverApi: ServerApiVersion.v1,
      maxPoolSize: 20,
      minPoolSize: 5,
      connectTimeoutMS: 30000
    });
    
    await mongoClient.connect();
    console.log(`Mongo connection established for ${tenantDbName}`);
    return mongoClient.db(tenantDbName);
  } catch (error) {
    console.error(`Tenant DB connection error for ${tenantDbName}:`, error);
    throw error;
  }
}

async function getRedisConnection() {
  try {
    if (redisClient?.isOpen) return redisClient;
    
    redisClient = redis.createClient({ url: CONFIG.REDIS.URL });
    redisClient.on('error', (err) => console.error('Redis Error:', err));
    await redisClient.connect();
    console.log('Redis connection established');
    return redisClient;
  } catch (error) {
    console.error('Redis connection error:', error);
    throw error;
  }
}
async function buildRedisKey(tenantKey, segmentId, userPhone) {
  return `campaign:${tenantKey}:segment:${segmentId}:user:${userPhone}`;
}

async function checkMessageHistory(redisClient, tenantKey, segmentId, userPhone) {
  try {
    // Check if user has received this campaign
    const campaignKey = await buildRedisKey(tenantKey, segmentId, userPhone);
    const hasReceived = await redisClient.get(campaignKey);
    
    if (hasReceived) {
      console.log(`User ${userPhone} already received campaign ${segmentId}`);
      return true;
    }
    
    // Also check if user has received from this segment recently
    const segmentKey = `segment:${tenantKey}:${segmentId}:user:${userPhone}`;
    const segmentReceived = await redisClient.get(segmentKey);
    
    if (segmentReceived) {
      console.log(`User ${userPhone} recently received from segment ${segmentId}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Redis check error:', error);
    // In case of Redis error, default to allowing the message
    return false;
  }
}

async function recordMessageDelivery(redisClient, tenantKey, segmentId, userPhone) {
  try {
    const campaignKey = await buildRedisKey(tenantKey, segmentId, userPhone);
    const segmentKey = `segment:${tenantKey}:${segmentId}:user:${userPhone}`;
    
    await Promise.all([
      redisClient.set(campaignKey, '1', { EX: CONFIG.REDIS.SEGMENT_TTL }),
      redisClient.set(segmentKey, '1', { EX: CONFIG.REDIS.SEGMENT_TTL })
    ]);
    
    return true;
  } catch (error) {
    console.error('Redis record error:', error);
    return false;
  }
}

async function sendWhatsappMessage(tenantKey, user, segmentData, segmentId,) {
  if (!tenantKey || !user?.mobile_number || !segmentData?.templateID || !segmentId) {
    console.error('Missing required parameters for WhatsApp message');
    if (!tenantKey) console.error('Missing: tenantKey');
    if (!user?.mobile_number) console.error('Missing: user.mobile_number');
    if (!segmentData?.templateID) console.error('Missing: segmentData.templateID');
    if (!segmentId) console.error('Missing: segmentId');

    
    return { success: false, error: 'Invalid parameters' };
  }

  try {
    const redisConn = await getRedisConnection();
    
    // Check if user has already received this campaign or segment
    const hasReceived = await checkMessageHistory(
      redisConn, 
      tenantKey, 
      segmentId, 
      user.mobile_number
    );
    
    if (hasReceived) {
      return { success: false, error: 'Duplicate message prevented' };
    }

    const payload = {
      templateID: segmentData.templateID,
      destinationPhone: user.mobile_number,
      params: segmentData.params || [],
      type: segmentData.type,
      fileLink: segmentData.fileLink,
      url: segmentData.cta_url,
      display_text: segmentData.ctaUrlText,
      ctaUrl: segmentData.ctaUrl,
      headerImageId: segmentData.headerImageId || ''
    };

    const response = await axios({
      method: 'post',
      url: `${CONFIG.API.WHATSAPP.BASE_URL}${CONFIG.API.WHATSAPP.ENDPOINT}`,
      headers: { ...CONFIG.API.WHATSAPP.HEADERS, 'x-api-key': tenantKey },
      data: payload,
      timeout: 5000
    });

    // Record successful delivery in Redis
    await recordMessageDelivery(
      redisConn, 
      tenantKey, 
      segmentId, 
    
      user.mobile_number
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error('WhatsApp Error:', error);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function processAttributeSegment(tenantKey, db, segmentId) {
  try {
    const segment = await db.collection(CONFIG.MONGODB.COLLECTIONS.SEGMENTS)
      .findOne({ _id: new ObjectId(segmentId) });

    if (!segment) {
      console.error(`Segment ${segmentId} not found`);
      return [];
    }

    // Get the associated campaign ID
    const campaign = await db.collection(CONFIG.MONGODB.COLLECTIONS.CAMPAIGNS)
      .findOne({ segment_id: segment._id });
      
    if (!campaign) {
      console.error(`Campaign not found for segment ${segmentId}`);
      return [];
    }

    const query = buildQuery(segment);
    if (!query) {
      console.error('Invalid segment query configuration');
      return [];
    }

    const users = await db.collection(CONFIG.MONGODB.COLLECTIONS.USERS)
      .find(query)
      .project({ mmid: 1, mobile_number: 1 })
      .toArray();

    console.log(`Found ${users.length} users for segment ${segmentId}`);
    return processUsers(tenantKey, users, segment, campaign._id.toString());
  } catch (error) {
    console.error('Attribute segment error:', error);
    return [];
  }
}

async function processUsers(tenantKey, users, segment, campaignId) {
  if (!Array.isArray(users) || !segment?.data) {
    console.error('Invalid users array or segment data');
    return [];
  }

  const results = [];
  const processedMobileNumbers = new Set();  // To track unique mobile numbers
  const batchSize = CONFIG.API.WHATSAPP.CONCURRENCY;

  for (let i = 0; i < users.length; i += batchSize) {
    if (isShuttingDown) break;

    const batch = users.slice(i, i + batchSize).filter(user => {
      if (user.mobile_number && !processedMobileNumbers.has(user.mobile_number)) {
        processedMobileNumbers.add(user.mobile_number);
        return true;
      }
      return false;
    });

    const promises = batch.map(user => 
      sendWhatsappMessage(tenantKey, user, segment.data, segment._id, campaignId)
        .then(result => result.success ? user.mmid : null)
        .catch(error => {
          console.error('Error processing user:', error);
          return null;
        })
    );

    const batchResults = await Promise.all(promises);
    results.push(...batchResults.filter(Boolean));

    console.log(`Processed batch of ${batch.length} users, successful: ${batchResults.filter(Boolean).length}`);

    // Add small delay between batches to prevent rate limiting
    if (i + batchSize < users.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

function buildQuery(segment) {
  if (!segment?.value || !Array.isArray(segment.value)) {
    console.error('Invalid segment format:', segment);
    return null;
  }

  if (!segment.attribute) {
    console.error('Segment attribute is required');
    return null;
  }

  const isComplexQuery = segment.value.some(item => 
    item && typeof item === 'object' && item.type
  );

  if (isComplexQuery) {
    const conditions = segment.value
      .filter(item => item && item.type && item.value)
      .map(item => ({
        [item.type]: typeof item.value === 'string' ? 
          item.value.trim() : item.value
      }));

    return conditions.length > 0 ? { $or: conditions } : null;
  }

  const values = segment.value
    .map(item => typeof item === 'object' ? item?.value : item)
    .filter(Boolean);

  return values.length > 0 ? { [segment.attribute]: { $in: values } } : null;
}





async function processSegment(tenant, segmentId) {
  if (!tenant?.dbName || !tenant?.apiKey || !segmentId) {
    throw new Error('Invalid tenant or segment data');
  }

  try {
    const db = await getMongoConnection(tenant.dbName);
    console.log(`Processing segment ${segmentId} for database: ${tenant.dbName}`);
    
    const users = await processAttributeSegment(tenant.apiKey, db, segmentId);
    
    // Update processedUsers and lastProcessed regardless of users length
    await db.collection(CONFIG.MONGODB.COLLECTIONS.SEGMENTS)
      .updateOne(
        { _id: new ObjectId(segmentId) },
        { 
          $addToSet: { processedUsers: { $each: users } }, // Add to processedUsers array
          $set: { lastProcessed: new Date() } // Update timestamp
          
        }
      );
    
    console.log(`Updated segment ${segmentId} with ${users.length} users`);
    return users;
  } catch (error) {
    console.error(`Error processing tenant ${tenant.apiKey}:`, error);
    throw error;
  }
}

async function processAttributeSegment(tenantKey, db, segmentId) {
  try {
    const segment = await db.collection(CONFIG.MONGODB.COLLECTIONS.SEGMENTS)
      .findOne({ _id: new ObjectId(segmentId) });

    if (!segment) {
      console.error(`Segment ${segmentId} not found`);
      return [];
    }

    const query = buildQuery(segment);
    if (!query) {
      console.error('Invalid segment query configuration');
      return [];
    }

    const users = await db.collection(CONFIG.MONGODB.COLLECTIONS.USERS)
      .find(query)
      .project({ mmid: 1, mobile_number: 1 })
      .toArray();

    console.log(`Found ${users.length} users for segment ${segmentId}`);
    return processUsers(tenantKey, users, segment);
  } catch (error) {
    console.error('Attribute segment error:', error);
    return [];
  }
}



async function processCampaigns() {
  try {
    const adminClient = await getAdminConnection();
    const tenants = await adminClient.db(CONFIG.MONGODB.ADMIN_DB)
      .collection('tenants')
      .find({ status: 'active' })
      .toArray();

    console.log(`Found ${tenants.length} active tenants`);

    for (const tenant of tenants) {
      if (isShuttingDown) break;

      try {
        const db = await getMongoConnection(tenant.dbName);
        const segments = await db.collection(CONFIG.MONGODB.COLLECTIONS.SEGMENTS)
          .find({ status: 'active' })
          .toArray();

        console.log(`Processing ${segments.length} segments for tenant ${tenant.dbName}`);

        for (const segment of segments) {
          if (isShuttingDown) break;
          await processSegment(tenant, segment._id.toString());
        }
      } catch (error) {
        console.error(`Error processing tenant ${tenant.dbName}:`, error);
        continue;
      }
    }
  } catch (error) {
    console.error('Campaign processing failed:', error);
    throw error;
  }
}

async function gracefulShutdown() {
  isShuttingDown = true;
  console.log('Initiating graceful shutdown...');
  
  try {
    await Promise.all([
      mongoClient?.close(),
      adminDbClient?.close(),
      redisClient?.quit()
    ]);
    console.log('All connections closed successfully');
  } catch (error) {
    console.error('Error during shutdown:', error);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Only start processing if this file is run directly
if (require.main === module) {
  (async () => {
    try {
      await getAdminConnection();
      await processCampaigns();
    } catch (error) {
      console.error('Initialization failed:', error);
      await gracefulShutdown();
    }
  })();
}

module.exports = {
  processCampaigns,
  processSegment,
  getRedisConnection,
  gracefulShutdown
};