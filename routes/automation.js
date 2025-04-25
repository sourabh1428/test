const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

// Automation model (assuming it exists)
const Automation = mongoose.model('Automation', new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  category: String,
  tenantId: { type: String, required: true, index: true },
  trigger: {
    type: { type: String, enum: ['event', 'schedule'] },
    event: String,
    schedule: String
  },
  actions: [{}],
  conditions: [{}],
  active: { type: Boolean, default: true },
  runCount: { type: Number, default: 0 },
  lastRunAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}));

// Create compound index for performance
Automation.collection.createIndex({ tenantId: 1, 'trigger.type': 1 });
Automation.collection.createIndex({ tenantId: 1, createdAt: -1 });

// Execution History model
const ExecutionHistory = mongoose.model('ExecutionHistory', new mongoose.Schema({
  automationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation' },
  tenantId: { type: String, required: true, index: true },
  status: { type: String, enum: ['completed', 'failed', 'running'], default: 'running' },
  results: [{}],
  timestamp: { type: Date, default: Date.now },
  error: String
}));

// Create compound index for performance
ExecutionHistory.collection.createIndex({ tenantId: 1, automationId: 1, timestamp: -1 });

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.userId = decoded.id;
    req.tenantId = decoded.tenantId || decoded.dbName; // Support both formats
    next();
  });
};

// CRUD operations for automations

// Create automation
router.post('/', verifyToken, async (req, res) => {
  try {
    const automation = new Automation({
      ...req.body,
      tenantId: req.tenantId,
      active: true
    });
    
    await automation.save();
    res.status(201).json({ success: true, automation });
  } catch (error) {
    console.error('Create automation error:', error);
    res.status(500).json({ error: 'Failed to create automation' });
  }
});

// Get all automations
router.get('/', verifyToken, async (req, res) => {
  try {
    const automations = await Automation.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    res.status(200).json(automations);
  } catch (error) {
    console.error('Get automations error:', error);
    res.status(500).json({ error: 'Failed to fetch automations' });
  }
});

// Get single automation
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOne({ 
      _id: req.params.id,
      tenantId: req.tenantId 
    });
    
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    res.status(200).json(automation);
  } catch (error) {
    console.error('Get automation error:', error);
    res.status(500).json({ error: 'Failed to fetch automation' });
  }
});

// Update automation status
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    const { active } = req.body;
    
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Active status must be a boolean' });
    }
    
    const automation = await Automation.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { active },
      { new: true }
    );
    
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    res.status(200).json(automation);
  } catch (error) {
    console.error('Update automation status error:', error);
    res.status(500).json({ error: 'Failed to update automation status' });
  }
});

// Update automation
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );
    
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    res.status(200).json(automation);
  } catch (error) {
    console.error('Update automation error:', error);
    res.status(500).json({ error: 'Failed to update automation' });
  }
});

// Delete automation
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOneAndDelete({ 
      _id: req.params.id, 
      tenantId: req.tenantId 
    });
    
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete automation error:', error);
    res.status(500).json({ error: 'Failed to delete automation' });
  }
});

// Get execution history for an automation
router.get('/:id/executions', verifyToken, async (req, res) => {
  try {
    const history = await ExecutionHistory.find({ 
      automationId: req.params.id,
      tenantId: req.tenantId
    }).sort({ timestamp: -1 }).limit(20);
    
    res.status(200).json(history);
  } catch (error) {
    console.error('Get execution history error:', error);
    res.status(500).json({ error: 'Failed to fetch execution history' });
  }
});

// Trigger manual execution of an automation
router.post('/:id/execute', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOne({ 
      _id: req.params.id,
      tenantId: req.tenantId
    });
    
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    if (!automation.active) {
      return res.status(400).json({ error: 'Cannot execute inactive automation' });
    }
    
    // Get test parameters if provided
    const testParams = req.body || {};
    
    // Create execution history record
    const execution = new ExecutionHistory({
      automationId: automation._id,
      tenantId: req.tenantId,
      status: 'running',
      testExecution: true
    });
    
    await execution.save();
    
    // Execute automation in the background with test parameters
    executeAutomation(
      automation, 
      execution, 
      req.headers.authorization, 
      req.headers['x-api-key'],
      testParams
    );
    
    res.status(202).json({ 
      success: true, 
      message: 'Automation execution started',
      executionId: execution._id
    });
  } catch (error) {
    console.error('Execute automation error:', error);
    res.status(500).json({ error: 'Failed to execute automation' });
  }
});

// Add a handler for WhatsApp actions
const executeWhatsAppAction = async (action, context) => {
  try {
    const { templateId, params, _numberedParams, mediaUrl, imageFile, ctaText, ctaUrl } = action;
    
    console.log('WhatsApp action payload:', JSON.stringify({
      ...action,
      imageFile: imageFile ? '[PRESENT]' : '[NOT PRESENT]'  // Don't log the full image data
    }, null, 2));
    
    if (!templateId) {
      throw new Error('WhatsApp template ID is required');
    }
    
    // Get tenant-specific template information if available
    let templateType = 'text';
    let templateParams = [];
    
    try {
      const TenantConfigService = require('../services/TenantConfigService');
      const tenantConfig = await TenantConfigService.getWhatsAppConfig(context.tenantId);
      
      // Find the template in tenant config
      const template = tenantConfig.templates?.find(t => t.id === templateId);
      if (template) {
        templateType = template.templateType || 'text';
        templateParams = template.parameters || [];
        console.log(`Found tenant-specific template: ${templateId}, type: ${templateType}, params: ${templateParams.length}`);
      } else {
        console.log(`Template ${templateId} not found in tenant config, using defaults`);
      }
    } catch (configError) {
      console.warn(`Error getting tenant template configuration: ${configError.message}`);
      // Continue with defaults
    }
    
    // Get the contact's phone number from the context
    let phoneNumber = context.contact?.mobile_number || context.testParams?.phoneNumber;
    
    if (!phoneNumber) {
      throw new Error('No phone number available for contact. For test executions, please provide a phoneNumber in the request body.');
    }

    console.log(`Original phone number: ${phoneNumber}`);

    // Validate phone number format (should start with + and country code)
    if (!phoneNumber.startsWith('+')) {
      // Check if it has country code but no + (e.g. 91xxxxxxxxxx)
      if (/^\d{10,14}$/.test(phoneNumber)) {
        // Add + sign - Gupshup requires it
        phoneNumber = '+' + phoneNumber;
      } else {
        // If it's just a local number, prepend India country code (as default)
        phoneNumber = '+91' + phoneNumber;
      }
      console.log(`Formatted phone number to: ${phoneNumber}`);
    }
    
    // Use the numbered params format if available, otherwise use the original params
    let finalParams = _numberedParams || params || {};
    
    // Convert to array if it's an object
    if (!Array.isArray(finalParams) && typeof finalParams === 'object') {
      console.log('Converting params object to array...');
      finalParams = Object.values(finalParams);
    }
    
    // Ensure finalParams is an array
    if (!Array.isArray(finalParams)) {
      console.log('Creating default empty params array');
      finalParams = [];
    }
    
    // Ensure all parameters are strings
    finalParams = finalParams.map(param => String(param));
    
    // Validate parameter count against template if available
    if (templateParams.length > 0 && finalParams.length !== templateParams.length) {
      console.warn(`Parameter count mismatch: template expects ${templateParams.length}, got ${finalParams.length}`);
      
      // Pad with empty strings if needed
      if (finalParams.length < templateParams.length) {
        finalParams = [...finalParams, ...Array(templateParams.length - finalParams.length).fill('')];
        console.log(`Padded parameters to match template requirements: ${finalParams.length}`);
      }
    }
    
    console.log(`Template parameters (${finalParams.length})`, finalParams);

    // Determine if this is a media template and the right template type
    const hasMediaUrl = !!mediaUrl;
    const actualTemplateType = hasMediaUrl ? (mediaUrl.includes('.pdf') ? 'document' : 'image') : templateType;
    
    // Log test execution
    if (context.testMode) {
      console.log(`TEST EXECUTION: Would send WhatsApp template ${templateId} to ${phoneNumber}`);
      console.log('Template params:', finalParams);
      console.log('Media URL:', mediaUrl || 'None');
      
      // For test mode, we can return success without actually sending
      if (context.skipActualSend) {
        return {
          success: true,
          test: true,
          message: `Test mode: Would send WhatsApp template ${templateId} to ${phoneNumber}`,
          params: finalParams,
          mediaUrl: mediaUrl
        };
      }
    }
    
    // Use the tenant-specific WhatsApp service instead of direct API calls
    const { buildAndSendTemplateMessage } = require('../services/gupshupWhatsAppService');
    
    try {
      // Use the service with tenant context
      const response = await buildAndSendTemplateMessage({
        destination: phoneNumber,
        templateId: templateId,
        params: finalParams,
        templateType: actualTemplateType,
        mediaUrl: mediaUrl,
        tenantId: context.tenantId
      });
      
      console.log('WhatsApp API response:', JSON.stringify(response, null, 2));
      
      return {
        success: true,
        messageId: response.messageId,
        recipient: phoneNumber,
        mediaUrl: mediaUrl
      };
    } catch (apiError) {
      console.error('WhatsApp API error:', apiError.message);
      if (apiError.response) {
        console.error('API response status:', apiError.response.status);
        console.error('API response data:', JSON.stringify(apiError.response.data, null, 2));
      }
      throw new Error(`WhatsApp API error: ${apiError.message}`);
    }
  } catch (error) {
    console.error('WhatsApp action error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send WhatsApp message'
    };
  }
};

// Email action handler
const executeEmailAction = async (action, context) => {
  try {
    const { templateId, subject, body, to, cc, bcc } = action;
    
    // Get recipient email from context if not specified in action
    const recipientEmail = to || context.contact?.email || context.user?.email;
    
    if (!recipientEmail) {
      throw new Error('No recipient email available');
    }
    
    // Redis key for tracking - include tenantId for isolation
    const trackingKey = `email:${context.tenantId}:${context.automationId}:${Date.now()}`;
    
    // Prepare payload
    const payload = {
      to: recipientEmail,
      subject: subject,
      body: body,
      cc: cc || [],
      bcc: bcc || [],
      templateId: templateId,
      trackingKey: trackingKey,
      tenantId: context.tenantId
    };
    
    console.log('Sending Email with payload:', payload);
    
    // Call email service
    const response = await axios.post(
      'http://localhost:5174/email/send',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${context.token}`,
          'x-api-key': context.apiKey
        }
      }
    );
    
    return {
      success: true,
      data: response.data,
      trackingKey
    };
  } catch (error) {
    console.error('Error executing email action:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email'
    };
  }
};

// Task action handler
const executeTaskAction = async (action, context) => {
  // Implementation of task action (placeholder)
  return { success: true, message: 'Task action not implemented yet' };
};

// Tag action handler
const executeTagAction = async (action, context) => {
  // Implementation of tag action (placeholder)
  return { success: true, message: 'Tag action not implemented yet' };
};

// Wait action handler
const executeWaitAction = async (action, context) => {
  const { duration, unit } = action;
  const durationMs = calculateDurationMs(duration, unit);
  
  // For simplicity, we're not actually waiting in this implementation
  return { 
    success: true, 
    message: `Would wait for ${duration} ${unit} (${durationMs}ms)` 
  };
};

function calculateDurationMs(duration, unit) {
  const msPerUnit = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000
  };
  
  return duration * (msPerUnit[unit] || 0);
}

// Update the executeAction function to handle WhatsApp actions
const executeAction = async (action, context) => {
  switch (action.type) {
    case 'send_email':
      return await executeEmailAction(action, context);
    case 'send_whatsapp':
      return await executeWhatsAppAction(action, context);
    case 'create_task':
      return await executeTaskAction(action, context);
    case 'tag_contact':
      return await executeTagAction(action, context);
    case 'wait':
      return await executeWaitAction(action, context);
    default:
      return {
        success: false,
        error: `Unknown action type: ${action.type}`
      };
  }
};

// Execute automation function
async function executeAutomation(automation, execution, authToken, apiKey, testParams = {}) {
  try {
    // Ensure token is correctly extracted
    const token = authToken?.split(' ')[1] || null;
    
    // Context contains data needed by action handlers
    const context = {
      automation,
      token: token,
      apiKey,
      tenantId: automation.tenantId,
      automationId: automation._id.toString(),
      // Use test contact data if provided, otherwise use mock data
      contact: { 
        mobile_number: testParams.phoneNumber || '1234567890',
        email: testParams.email || 'test@example.com',
        name: testParams.name || 'Test User'
      },
      testMode: true, // Always consider automation executions from API as test mode
      skipActualSend: Boolean(testParams.skipActualSend),
      testParams: testParams // Pass the full test params object
    };
    
    // Log execution parameters
    console.log('Executing automation with test params:', JSON.stringify(testParams));
    
    const results = [];
    let hasError = false;
    
    // Execute each action in sequence
    for (const action of automation.actions) {
      try {
        const result = await executeAction(action, context);
        results.push(result);
        
        if (!result.success) {
          hasError = true;
          break;
        }
      } catch (error) {
        console.error('Action execution error:', error);
        results.push({
          success: false,
          error: error.message || 'Unknown error during action execution'
        });
        hasError = true;
        break;
      }
    }
    
    // Update execution history
    execution.results = results;
    execution.status = hasError ? 'failed' : 'completed';
    if (hasError) {
      const lastError = results.find(r => !r.success)?.error;
      execution.error = lastError || 'Execution failed';
    }
    
    await execution.save();
    
    // Update automation stats
    await Automation.findByIdAndUpdate(automation._id, {
      runCount: (automation.runCount || 0) + 1,
      lastRunAt: new Date()
    });
  } catch (error) {
    console.error('Automation execution error:', error);
    
    // Update execution with error
    await ExecutionHistory.findByIdAndUpdate(execution._id, {
      status: 'failed',
      error: error.message || 'Unknown error during automation execution'
    });
  }
}

module.exports = router; 