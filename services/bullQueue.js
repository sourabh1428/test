const { Queue, Worker, QueueEvents } = require('bullmq');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const axios = require('axios');
require('dotenv').config();

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  maxRetriesPerRequest: null
};

// Create a Redis connection for shared use
const createRedisConnection = (options = {}) => {
  return new Redis({
    ...redisConfig,
    ...options,
    maxRetriesPerRequest: null // Ensure this is set even if overridden in options
  });
};

// Factory function to create tenant-specific queue 
const createEmailTrackingQueue = (tenantId) => {
  const queueName = `emailTracking_${tenantId}`;
  const connection = createRedisConnection();
  
  const queue = new Queue(queueName, {
    connection,
    prefix: `tenant:${tenantId}`,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    }
  });
  
  return queue;
};

// Factory function to create tenant-specific email sending queue
const createEmailSendQueue = (tenantId) => {
  const queueName = `emailSend_${tenantId}`;
  const connection = createRedisConnection();
  
  const queue = new Queue(queueName, {
    connection,
    prefix: `tenant:${tenantId}`,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    }
  });
  
  return queue;
};

// Create a queue for event processing (shared across all tenants)
const eventQueue = new Queue('eventProcessing', {
  connection: createRedisConnection(),
  prefix: 'events',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});

// Create workers for email tracking - returns a worker instance for a specific tenant
const createEmailTrackingWorker = (tenantId) => {
  const connection = createRedisConnection();
  
  const worker = new Worker(`emailTracking_${tenantId}`, async (job) => {
    const { type, payload } = job.data;
    
    try {
      console.log(`Processing ${type} job for tenant ${tenantId}`, payload);
      
      // Store tracking event in database
      const Event = mongoose.model('Event');
      await Event.create({
        tenantId,
        type,
        emailId: payload.emailId,
        userId: payload.userId,
        metadata: payload,
        timestamp: new Date()
      });
      
      // Process different types of tracking events
      switch(type) {
        case 'email_opened':
          await processEmailOpenEvent(tenantId, payload);
          break;
        case 'email_clicked':
          await processEmailClickEvent(tenantId, payload);
          break;
        case 'email_bounced':
          await processEmailBounceEvent(tenantId, payload);
          break;
        default:
          console.log(`Unknown event type: ${type}`);
      }
      
      return { processed: true };
    } catch (error) {
      console.error(`Error processing ${type} job:`, error);
      throw error; // Let BullMQ handle retries
    }
  }, { 
    connection,
    prefix: `tenant:${tenantId}`
  });
  
  return worker;
};

// Create workers for email sending
const createEmailSendWorker = (tenantId) => {
  const connection = createRedisConnection();
  
  const worker = new Worker(`emailSend_${tenantId}`, async (job) => {
    const { email, templateId, params, delaySeconds } = job.data;
    
    try {
      console.log(`Sending email to ${email} for tenant ${tenantId}`);
      
      // If we have a delay, we don't need to do anything here
      // The job will be processed after the delay expires
      if (delaySeconds && job.attemptsMade === 0) {
        return { status: 'delayed' };
      }
      
      // Call email service to send the email
      const response = await axios.post('http://localhost:5174/email/send', {
        to: email,
        templateId,
        params,
        tenantId,
        trackingKey: `${tenantId}:${job.id}`
      });
      
      return { 
        status: 'sent',
        messageId: response.data.messageId
      };
    } catch (error) {
      console.error(`Error sending email to ${email}:`, error);
      throw error; // Let BullMQ handle retries
    }
  }, { 
    connection,
    prefix: `tenant:${tenantId}`
  });
  
  return worker;
};

// Create a worker for processing events (shared across all tenants)
const eventWorker = new Worker('eventProcessing', async (job) => {
  const { eventType, tenantId, data } = job.data;
  
  try {
    console.log(`Processing ${eventType} event for tenant ${tenantId}`);
    
    // Look up automation rules in MongoDB that match this event
    const Automation = mongoose.model('Automation');
    const automations = await Automation.find({
      tenantId,
      active: true,
      'trigger.type': 'event',
      'trigger.event': eventType
    });
    
    console.log(`Found ${automations.length} matching automations`);
    
    // Process each automation
    for (const automation of automations) {
      // For each action in the automation
      for (const action of automation.actions) {
        if (action.type === 'send_email' && action.waitSeconds) {
          // Create a delayed email job
          const emailQueue = createEmailSendQueue(tenantId);
          await emailQueue.add('delayed_email', {
            email: data.email,
            templateId: action.templateId,
            params: { ...data, ...action.params },
            delaySeconds: action.waitSeconds
          }, {
            delay: action.waitSeconds * 1000,
            attempts: 3
          });
        } else if (action.type === 'send_whatsapp' && action.waitSeconds) {
          // Schedule a WhatsApp message
          const emailQueue = createEmailSendQueue(tenantId);
          await emailQueue.add('delayed_whatsapp', {
            phone: data.phone,
            templateId: action.templateId,
            params: { ...data, ...action.params },
            delaySeconds: action.waitSeconds
          }, {
            delay: action.waitSeconds * 1000,
            attempts: 3
          });
        }
      }
    }
    
    return { processed: true, automationsTriggered: automations.length };
  } catch (error) {
    console.error(`Error processing event ${eventType}:`, error);
    throw error;
  }
}, { 
  connection: createRedisConnection(),
  prefix: 'events'
  // Using the createRedisConnection function ensures maxRetriesPerRequest is set to null
});

// Helper functions for processing different types of events
async function processEmailOpenEvent(tenantId, payload) {
  // Add to event queue for potential automated follow-ups
  await eventQueue.add('email_event', {
    eventType: 'email_opened',
    tenantId,
    data: {
      email: payload.email,
      userId: payload.userId,
      emailId: payload.emailId,
      timestamp: new Date()
    }
  });
  
  // Update email stats in database
  const Email = mongoose.model('Email');
  await Email.findOneAndUpdate(
    { _id: payload.emailId, tenantId },
    { 
      $inc: { openCount: 1 },
      $set: { lastOpenedAt: new Date() }
    }
  );
}

async function processEmailClickEvent(tenantId, payload) {
  // Add to event queue for potential automated follow-ups
  await eventQueue.add('email_event', {
    eventType: 'email_clicked',
    tenantId,
    data: {
      email: payload.email,
      userId: payload.userId,
      emailId: payload.emailId,
      linkUrl: payload.linkUrl,
      timestamp: new Date()
    }
  });
  
  // Update email stats in database
  const Email = mongoose.model('Email');
  await Email.findOneAndUpdate(
    { _id: payload.emailId, tenantId },
    { 
      $inc: { clickCount: 1 },
      $set: { lastClickedAt: new Date() },
      $push: { 
        clicks: {
          url: payload.linkUrl,
          timestamp: new Date(),
          userId: payload.userId
        }
      }
    }
  );
}

async function processEmailBounceEvent(tenantId, payload) {
  // Add to event queue for potential automated follow-ups
  await eventQueue.add('email_event', {
    eventType: 'email_bounced',
    tenantId,
    data: {
      email: payload.email,
      userId: payload.userId,
      emailId: payload.emailId,
      reason: payload.reason,
      timestamp: new Date()
    }
  });
  
  // Update email stats and user status in database
  const Email = mongoose.model('Email');
  await Email.findOneAndUpdate(
    { _id: payload.emailId, tenantId },
    { 
      $inc: { bounceCount: 1 },
      $set: { 
        lastBouncedAt: new Date(),
        bounceReason: payload.reason
      }
    }
  );
  
  // Update user status if needed
  const User = mongoose.model('User');
  await User.findOneAndUpdate(
    { email: payload.email, tenantId },
    { $set: { emailStatus: 'bounced' } }
  );
}

// Handle Redis connection errors
eventWorker.on('error', (err) => {
  console.error('Event worker error:', err);
});

// Listen for worker completion events
eventWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

// Export the queue creation functions
module.exports = {
  createEmailTrackingQueue,
  createEmailSendQueue,
  createEmailTrackingWorker,
  createEmailSendWorker,
  eventQueue,
  redisConfig
}; 