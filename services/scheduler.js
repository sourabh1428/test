const cron = require('node-cron');
const { MongoClient } = require('mongodb');
const automationExecutor = require('./automationExecutor');
require('dotenv').config();

class AutomationScheduler {
  constructor() {
    this.mongoClient = new MongoClient(process.env.ADMIN_DB_URI);
    this.schedules = new Map();
    this.initialized = false;
  }

  async initialize() {
    try {
      await this.mongoClient.connect();
      console.log('AutomationScheduler connected to MongoDB');
      
      // Start the daily schedule that checks for tenant automation schedules
      this.startDailyScheduleRefresh();
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize AutomationScheduler:', error);
      throw error;
    }
  }

  startDailyScheduleRefresh() {
    // Run once daily at midnight to refresh all schedules
    cron.schedule('0 0 * * *', async () => {
      console.log('Running daily schedule refresh');
      await this.refreshAllSchedules();
    });
    
    // Also run immediately on startup
    this.refreshAllSchedules();
  }

  async refreshAllSchedules() {
    try {
      console.log('Refreshing all automation schedules');
      
      // Stop all existing schedules
      this.clearAllSchedules();
      
      // Get all tenants
      const adminDb = this.mongoClient.db('adminEB');
      const tenants = await adminDb.collection('tenants')
        .find({ status: 'active' })
        .toArray();
      
      console.log(`Found ${tenants.length} active tenants`);
      
      // For each tenant, set up their scheduled automations
      for (const tenant of tenants) {
        await this.setupTenantSchedules(tenant);
      }
    } catch (error) {
      console.error('Error refreshing schedules:', error);
    }
  }

  clearAllSchedules() {
    // Stop all existing scheduled tasks
    for (const [scheduleId, schedule] of this.schedules.entries()) {
      schedule.stop();
      console.log(`Stopped schedule: ${scheduleId}`);
    }
    
    // Clear the map
    this.schedules.clear();
  }

  async setupTenantSchedules(tenant) {
    try {
      const tenantClient = new MongoClient(process.env.TENANT_DB_URI);
      await tenantClient.connect();
      
      const tenantDb = tenantClient.db(tenant.dbName);
      
      // Find all automations with schedule triggers
      const scheduledAutomations = await tenantDb.collection('automations')
        .find({
          status: true, // Only active automations
          'trigger.type': 'schedule'
        })
        .toArray();
      
      console.log(`Found ${scheduledAutomations.length} scheduled automations for tenant ${tenant.storeName}`);
      
      // Set up a cron job for each automation
      for (const automation of scheduledAutomations) {
        this.scheduleAutomation(automation, tenant);
      }
      
      await tenantClient.close();
    } catch (error) {
      console.error(`Error setting up schedules for tenant ${tenant.storeName}:`, error);
    }
  }

  scheduleAutomation(automation, tenant) {
    try {
      const { schedule } = automation.trigger;
      
      if (!schedule || !this.isValidCronExpression(schedule)) {
        console.error(`Invalid schedule for automation ${automation._id} in tenant ${tenant.dbName}`);
        return;
      }
      
      const scheduleId = `${tenant.dbName}:${automation._id}`;
      
      // Create and store the scheduled task
      const scheduledTask = cron.schedule(schedule, async () => {
        console.log(`Running scheduled automation: ${automation.name} (${automation._id}) for ${tenant.dbName}`);
        
        // Create an event object for the automation executor
        const event = {
          _id: automation._id,
          type: 'schedule',
          data: {
            scheduledTime: new Date().toISOString(),
            automationId: automation._id.toString(),
            tenantId: tenant._id.toString()
          }
        };
        
        // Execute the automation
        await automationExecutor.handleEvent(event, tenant.dbName);
      });
      
      // Store the scheduled task for later reference
      this.schedules.set(scheduleId, scheduledTask);
      
      console.log(`Scheduled automation ${automation.name} (${automation._id}) for tenant ${tenant.dbName} with schedule: ${schedule}`);
    } catch (error) {
      console.error(`Error scheduling automation ${automation._id} for tenant ${tenant.dbName}:`, error);
    }
  }

  isValidCronExpression(cronExpression) {
    try {
      // Validate the cron expression using node-cron
      return cron.validate(cronExpression);
    } catch (error) {
      return false;
    }
  }

  // Method to manually trigger a refresh of schedules for a specific tenant
  async refreshTenantSchedules(tenantId) {
    try {
      const adminDb = this.mongoClient.db('adminEB');
      const tenant = await adminDb.collection('tenants').findOne({ _id: new ObjectId(tenantId) });
      
      if (!tenant) {
        console.error(`Tenant ${tenantId} not found`);
        return false;
      }
      
      // Remove existing schedules for this tenant
      const tenantPrefix = `${tenant.dbName}:`;
      for (const [scheduleId, schedule] of this.schedules.entries()) {
        if (scheduleId.startsWith(tenantPrefix)) {
          schedule.stop();
          this.schedules.delete(scheduleId);
          console.log(`Stopped schedule: ${scheduleId}`);
        }
      }
      
      // Set up new schedules
      await this.setupTenantSchedules(tenant);
      return true;
    } catch (error) {
      console.error(`Error refreshing schedules for tenant ${tenantId}:`, error);
      return false;
    }
  }
}

module.exports = new AutomationScheduler(); 