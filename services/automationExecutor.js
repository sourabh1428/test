const nodemailer = require('nodemailer');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// Initialize email transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

class AutomationExecutor {
  constructor() {
    this.mongoClient = new MongoClient(process.env.TENANT_DB_URI);
  }

  async initialize() {
    await this.mongoClient.connect();
    console.log('AutomationExecutor connected to MongoDB');
  }

  async executeAction(action, context, tenantDb) {
    switch (action.type) {
      case 'send_email':
        return await this.sendEmail(action, context);
      
      case 'create_task':
        return await this.createTask(action, context, tenantDb);
      
      case 'update_contact':
        return await this.updateContact(action, context, tenantDb);
      
      case 'tag_contact':
        return await this.tagContact(action, context, tenantDb);
      
      case 'wait':
        return { success: true, message: `Waiting for ${action.duration} ${action.unit}` };
      
      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  }

  async sendEmail(action, context) {
    try {
      // Replace variables in template
      let emailContent = action.template;
      let emailSubject = action.subject;
      
      // Replace variables with context data
      Object.keys(context).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        emailContent = emailContent.replace(regex, context[key]);
        emailSubject = emailSubject.replace(regex, context[key]);
      });
      
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: context.email,
        subject: emailSubject,
        html: emailContent
      };
      
      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      console.error('Email send error:', error);
      return { success: false, error: error.message };
    }
  }

  async createTask(action, context, tenantDb) {
    try {
      const task = {
        title: this.replaceVariables(action.title, context),
        description: this.replaceVariables(action.description, context),
        dueDate: action.dueDateDays ? new Date(Date.now() + (action.dueDateDays * 24 * 60 * 60 * 1000)) : null,
        assignedTo: action.assignedTo,
        status: 'pending',
        priority: action.priority || 'normal',
        createdAt: new Date(),
        createdBy: 'automation',
        contactId: context.contactId,
        automationId: context.automationId
      };
      
      const result = await tenantDb.collection('tasks').insertOne(task);
      return { success: true, taskId: result.insertedId };
    } catch (error) {
      console.error('Create task error:', error);
      return { success: false, error: error.message };
    }
  }

  async updateContact(action, context, tenantDb) {
    try {
      const contactId = context.contactId;
      if (!contactId) {
        return { success: false, error: 'No contact ID in context' };
      }
      
      const updateData = {};
      
      // Prepare update data
      if (action.fields && Object.keys(action.fields).length > 0) {
        Object.keys(action.fields).forEach(field => {
          updateData[field] = this.replaceVariables(action.fields[field], context);
        });
      }
      
      const result = await tenantDb.collection('contacts').updateOne(
        { _id: new ObjectId(contactId) },
        { $set: updateData }
      );
      
      return { 
        success: true, 
        updated: result.modifiedCount > 0 
      };
    } catch (error) {
      console.error('Update contact error:', error);
      return { success: false, error: error.message };
    }
  }

  async tagContact(action, context, tenantDb) {
    try {
      const contactId = context.contactId;
      if (!contactId) {
        return { success: false, error: 'No contact ID in context' };
      }
      
      const result = await tenantDb.collection('contacts').updateOne(
        { _id: new ObjectId(contactId) },
        { $addToSet: { tags: action.tag } }
      );
      
      return { 
        success: true, 
        updated: result.modifiedCount > 0 
      };
    } catch (error) {
      console.error('Tag contact error:', error);
      return { success: false, error: error.message };
    }
  }

  replaceVariables(template, context) {
    if (!template) return '';
    
    let result = template;
    Object.keys(context).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, context[key] || '');
    });
    
    return result;
  }

  async evaluateCondition(condition, context) {
    const { field, operator, value } = condition;
    
    // Get the actual field value from context
    const fieldValue = context[field];
    
    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'not_equals':
        return fieldValue !== value;
      case 'contains':
        return String(fieldValue).includes(value);
      case 'not_contains':
        return !String(fieldValue).includes(value);
      case 'greater_than':
        return Number(fieldValue) > Number(value);
      case 'less_than':
        return Number(fieldValue) < Number(value);
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      case 'not_exists':
        return fieldValue === undefined || fieldValue === null;
      default:
        console.error(`Unknown operator: ${operator}`);
        return false;
    }
  }

  async processWorkflow(automation, context, tenantDb) {
    try {
      console.log(`Executing automation: ${automation.name}`);
      
      // Check if all conditions are met
      if (automation.conditions && automation.conditions.length > 0) {
        for (const condition of automation.conditions) {
          const conditionMet = await this.evaluateCondition(condition, context);
          if (!conditionMet) {
            console.log(`Condition not met for automation ${automation._id}`);
            return { success: true, executed: false, reason: 'conditions_not_met' };
          }
        }
      }
      
      // Execute all actions in sequence
      const results = [];
      for (const action of automation.actions) {
        const actionResult = await this.executeAction(action, context, tenantDb);
        results.push(actionResult);
        
        // If an action fails, stop the workflow
        if (!actionResult.success) {
          console.error(`Action failed: ${action.type}`, actionResult.error);
          return { 
            success: false, 
            error: `Action ${action.type} failed: ${actionResult.error}`,
            partialResults: results
          };
        }
      }
      
      // Update automation run count
      await tenantDb.collection('automations').updateOne(
        { _id: automation._id },
        { 
          $inc: { runCount: 1 },
          $set: { lastRunAt: new Date() }
        }
      );
      
      return { success: true, executed: true, results };
    } catch (error) {
      console.error(`Workflow execution error for automation ${automation._id}:`, error);
      return { success: false, error: error.message };
    }
  }

  async handleEvent(event, tenantDbName) {
    try {
      const tenantDb = this.mongoClient.db(tenantDbName);
      
      // Find automations that match this event trigger
      const automations = await tenantDb.collection('automations').find({
        status: true, // Only active automations
        'trigger.type': event.type
      }).toArray();
      
      console.log(`Found ${automations.length} automations for event type ${event.type}`);
      
      // Process each automation
      const results = [];
      for (const automation of automations) {
        // Check if the trigger conditions match
        const triggerMatches = this.checkTriggerConditions(automation.trigger, event);
        
        if (triggerMatches) {
          // Prepare context for execution
          const context = {
            ...event.data,
            eventType: event.type,
            eventId: event._id.toString(),
            automationId: automation._id.toString(),
            timestamp: new Date().toISOString()
          };
          
          // Execute the workflow
          const result = await this.processWorkflow(automation, context, tenantDb);
          results.push({
            automationId: automation._id,
            name: automation.name,
            result
          });
        }
      }
      
      return { success: true, results };
    } catch (error) {
      console.error('Event handling error:', error);
      return { success: false, error: error.message };
    }
  }

  checkTriggerConditions(trigger, event) {
    // Basic type matching is already done in the query
    if (trigger.type !== event.type) {
      return false;
    }
    
    // Match specific trigger conditions
    if (trigger.conditions) {
      for (const condition of trigger.conditions) {
        const eventValue = event.data[condition.field];
        
        switch (condition.operator) {
          case 'equals':
            if (eventValue !== condition.value) return false;
            break;
          case 'not_equals':
            if (eventValue === condition.value) return false;
            break;
          case 'contains':
            if (!String(eventValue).includes(condition.value)) return false;
            break;
          case 'not_contains':
            if (String(eventValue).includes(condition.value)) return false;
            break;
          case 'in':
            if (!Array.isArray(condition.value) || !condition.value.includes(eventValue)) return false;
            break;
          // Add more operators as needed
        }
      }
    }
    
    return true;
  }
}

module.exports = new AutomationExecutor(); 