const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config()
const qs = require('qs');
const multer = require('multer');
const { URLSearchParams } = require('url');
const { json } = require('body-parser');
const mongoose = require('mongoose');
const { 
  buildAndSendTemplateMessage, 
  uploadImageToSupabase,
  uploadImageFromUrlToSupabase
} = require('../services/gupshupWhatsAppService');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// creating the campaigns and sending to the users

router.post('/sendWhatsappTemplateMessage', async (req, res) => {
    let { templateID: templateId, destinationPhone, params, type, fileLink, cta_url, ctaUrlText, ctaUrl, tenantId = "default" } = req.body;
    
    console.log('\n========== WHATSAPP REQUEST FROM AUTOMATION ==========');
    console.log('Endpoint: /whatsapp/sendWhatsappTemplateMessage');
    console.log('Request Headers:', JSON.stringify({
        authorization: req.headers.authorization ? '[PRESENT]' : '[NOT PRESENT]',
        'x-api-key': req.headers['x-api-key'] ? '[PRESENT]' : '[NOT PRESENT]',
        'content-type': req.headers['content-type']
    }, null, 2));
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('=====================================================\n');
    
    try {
        // Validate that we have the required parameters
        if (!templateId || !destinationPhone) {
            console.error('Missing required parameters:', {templateId, destinationPhone});
            return res.status(400).json({
                success: false,
                error: 'Template ID and destination phone are required'
            });
        }
        
        // Use the buildAndSendTemplateMessage service
        const response = await buildAndSendTemplateMessage({
            source: process.env.GUPSHUP_sourcePhoneNumber,
            destination: destinationPhone,
            srcName: process.env.GUPSHUP_APP_ID,
            templateId: templateId,
            params: params,
            templateType: type || 'text',
            mediaUrl: fileLink,
            mediaFilename: type === 'document' ? 'document.pdf' : undefined,
            postbackTexts: ctaUrl && ctaUrlText ? [
                { index: 0, text: ctaUrlText }
            ] : undefined,
            apiKey: process.env.GUPSHUP_API_KEY,
            callbackUrl: "https://gupshup.sppathak1428.workers.dev",
            tenantId: tenantId
        });
        
        console.log('Gupshup API Response:', JSON.stringify(response, null, 2));
        res.status(200).json(response);
    } catch (error) {
        console.error('Gupshup API Error:', error.message);
        if (error.response) {
            console.error('API Response Status:', error.response.status);
            console.error('API Response Data:', JSON.stringify(error.response.data));
        }
        res.status(500).json({
            success: false,
            error: error.message,
            response: error.gupshupError || error.response?.data
        });
    }
});

// New endpoint to handle file uploads for WhatsApp templates
router.post('/upload-template-media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    const tenantId = req.body.tenantId || 'default';
    const templateId = req.body.templateId;
    const fileName = req.body.fileName || `template-${templateId || 'image'}-${Date.now()}`;
    
    console.log('\n========== WHATSAPP MEDIA UPLOAD ==========');
    console.log('Endpoint: /whatsapp/upload-template-media');
    console.log('Request Headers:', JSON.stringify({
      authorization: req.headers.authorization ? '[PRESENT]' : '[NOT PRESENT]',
      'x-api-key': req.headers['x-api-key'] ? '[PRESENT]' : '[NOT PRESENT]'
    }, null, 2));
    console.log('File Info:', {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: `${(req.file.size / 1024).toFixed(2)} KB`
    });
    console.log('Request Body:', JSON.stringify({
      templateId,
      tenantId,
      fileName
    }, null, 2));
    console.log('==========================================\n');
    
    // Upload to Supabase
    const imageBuffer = req.file.buffer;
    const contentType = req.file.mimetype;
    
    const publicUrl = await uploadImageToSupabase(
      imageBuffer, 
      fileName, 
      contentType, 
      'Campaign images'
    );
    
    res.status(200).json({
      success: true,
      mediaUrl: publicUrl,
      fileName: fileName
    });
  } catch (error) {
    console.error('Media Upload Error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint to handle URL-based media uploads
router.post('/save-template-media-url', async (req, res) => {
  try {
    const { mediaUrl, fileName, tenantId = 'default', templateId } = req.body;
    
    if (!mediaUrl) {
      return res.status(400).json({
        success: false,
        error: 'Media URL is required'
      });
    }
    
    console.log('\n========== WHATSAPP MEDIA URL SAVE ==========');
    console.log('Endpoint: /whatsapp/save-template-media-url');
    console.log('Request Headers:', JSON.stringify({
      authorization: req.headers.authorization ? '[PRESENT]' : '[NOT PRESENT]',
      'x-api-key': req.headers['x-api-key'] ? '[PRESENT]' : '[NOT PRESENT]'
    }, null, 2));
    console.log('Request Body:', JSON.stringify({
      mediaUrl,
      templateId,
      tenantId,
      fileName
    }, null, 2));
    console.log('==========================================\n');
    
    // Download and re-upload to Supabase for persistence
    const actualFileName = fileName || `template-${templateId || 'image'}-${Date.now()}`;
    const publicUrl = await uploadImageFromUrlToSupabase(
      mediaUrl,
      actualFileName,
      'Campaign images'
    );
    
    res.status(200).json({
      success: true,
      mediaUrl: publicUrl,
      fileName: actualFileName
    });
  } catch (error) {
    console.error('Media URL Save Error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add a route to get WhatsApp templates
router.get('/templates', async (req, res) => {
    try {
        // This is a mock implementation - in production, you would fetch from Gupshup or your template storage
        const mockTemplates = [
            {
                id: 'welcome_template',
                name: 'Welcome Message',
                text: 'Hello {{1}}, welcome to our platform! We\'re excited to have you on board.',
                previewText: 'Hello [Name], welcome to our platform! We\'re excited to have you on board.',
                variables: ['1'], // Variable placeholders
                hasMedia: false,
                hasCta: false
            },
            {
                id: 'order_confirmation',
                name: 'Order Confirmation',
                text: 'Thank you for your order, {{1}}! Your order #{{2}} has been confirmed and will be processed soon.',
                previewText: 'Thank you for your order, [Name]! Your order #[OrderID] has been confirmed and will be processed soon.',
                variables: ['1', '2'],
                hasMedia: false,
                hasCta: true
            },
            {
                id: 'appointment_reminder',
                name: 'Appointment Reminder',
                text: 'Hello {{1}}, this is a reminder for your appointment on {{2}} at {{3}}. Please reply YES to confirm.',
                previewText: 'Hello [Name], this is a reminder for your appointment on [Date] at [Time]. Please reply YES to confirm.',
                variables: ['1', '2', '3'],
                hasMedia: false,
                hasCta: false
            },
            {
                id: 'product_promotion',
                name: 'Product Promotion',
                text: 'Hi {{1}}! Check out our latest product: {{2}}. Use code {{3}} for a {{4}}% discount!',
                previewText: 'Hi [Name]! Check out our latest product: [Product]. Use code [Code] for a [Discount]% discount!',
                variables: ['1', '2', '3', '4'],
                hasMedia: true,
                hasCta: true
            }
        ];

        res.status(200).json(mockTemplates);
    } catch (error) {
        console.error('Error fetching WhatsApp templates:', error);
        res.status(500).json({ error: 'Failed to fetch WhatsApp templates' });
    }
});

// Add a route to handle the createWhatsapp/templates endpoint for automation
router.get('/createWhatsapp/templates', async (req, res) => {
    try {
        // This endpoint should return templates in a format compatible with the automation system
        const mockTemplates = [
            {
                id: 'welcome_template',
                name: 'Welcome Message',
                text: 'Hello {{1}}, welcome to our platform! We\'re excited to have you on board.',
                previewText: 'Hello [Name], welcome to our platform! We\'re excited to have you on board.',
                variables: ['1'], // Variable placeholders
                hasMedia: false,
                hasCta: false
            },
            {
                id: 'order_confirmation',
                name: 'Order Confirmation',
                text: 'Thank you for your order, {{1}}! Your order #{{2}} has been confirmed and will be processed soon.',
                previewText: 'Thank you for your order, [Name]! Your order #[OrderID] has been confirmed and will be processed soon.',
                variables: ['1', '2'],
                hasMedia: false,
                hasCta: true
            },
            {
                id: 'appointment_reminder',
                name: 'Appointment Reminder',
                text: 'Hello {{1}}, this is a reminder for your appointment on {{2}} at {{3}}. Please reply YES to confirm.',
                previewText: 'Hello [Name], this is a reminder for your appointment on [Date] at [Time]. Please reply YES to confirm.',
                variables: ['1', '2', '3'],
                hasMedia: false,
                hasCta: false
            },
            {
                id: 'product_promotion',
                name: 'Product Promotion',
                text: 'Hi {{1}}! Check out our latest product: {{2}}. Use code {{3}} for a {{4}}% discount!',
                previewText: 'Hi [Name]! Check out our latest product: [Product]. Use code [Code] for a [Discount]% discount!',
                variables: ['1', '2', '3', '4'],
                hasMedia: true,
                hasCta: true
            }
        ];

        res.status(200).json(mockTemplates);
    } catch (error) {
        console.error('Error fetching WhatsApp templates:', error);
        res.status(500).json({ error: 'Failed to fetch WhatsApp templates' });
    }
});

// Add a route for sending WhatsApp messages from automation
router.post('/createWhatsapp/send', async (req, res) => {
    try {
        const { templateID, destinationPhone, params, type, fileLink, ctaUrl, ctaUrlText, tenantId } = req.body;
        
        console.log('\n========== WHATSAPP REQUEST FROM CREATEWHATSAPP/SEND ==========');
        console.log('Endpoint: /whatsapp/createWhatsapp/send');
        console.log('Request Headers:', JSON.stringify({
            authorization: req.headers.authorization ? '[PRESENT]' : '[NOT PRESENT]',
            'x-api-key': req.headers['x-api-key'] ? '[PRESENT]' : '[NOT PRESENT]',
            'content-type': req.headers['content-type']
        }, null, 2));
        console.log('Request Body:', JSON.stringify(req.body, null, 2));
        console.log('=============================================================\n');
        
        if (!templateID || !destinationPhone) {
            return res.status(400).json({
                success: false,
                error: 'Template ID and destination phone are required'
            });
        }
        
        // Use the buildAndSendTemplateMessage service for consistency
        const response = await buildAndSendTemplateMessage({
            source: process.env.GUPSHUP_sourcePhoneNumber,
            destination: destinationPhone,
            srcName: process.env.GUPSHUP_APP_ID,
            templateId: templateID,
            params: params,
            templateType: type || 'text',
            mediaUrl: fileLink,
            mediaFilename: type === 'document' ? 'document.pdf' : undefined,
            postbackTexts: ctaUrl && ctaUrlText ? [
                { index: 0, text: ctaUrlText }
            ] : undefined,
            apiKey: process.env.GUPSHUP_API_KEY,
            callbackUrl: "https://gupshup.sppathak1428.workers.dev",
            tenantId: tenantId
        });
        
        console.log('Gupshup API Response:', JSON.stringify(response, null, 2));
        
        res.status(200).json({
            success: true,
            messageId: response.messageId,
            status: 'sent',
            message: 'WhatsApp message sent successfully'
        });
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send WhatsApp message',
            details: error.gupshupError
        });
    }
});

// Add webhook endpoint to receive status updates from Gupshup
router.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        console.log('Received webhook from Gupshup:', JSON.stringify(payload, null, 2));
        
        // Check if payload is empty or invalid
        if (!payload || typeof payload !== 'object') {
            console.error('Invalid webhook payload received:', payload);
            return res.status(200).json({ success: false, error: 'Invalid payload' });
        }
        
        // Handle different types of webhook events
        if (payload.type === 'message-event') {
            const messageEvent = payload.payload;
            if (!messageEvent) {
                console.error('Missing payload in message-event webhook');
                return res.status(200).json({ success: false, error: 'Missing payload in message-event' });
            }
            
            const messageId = messageEvent.id;
            const status = messageEvent.type?.toLowerCase();
            
            console.log(`Processing message event: ${status} for message ${messageId}`);
            console.log('Full message event data:', JSON.stringify(messageEvent, null, 2));
            
            if (messageId && status) {
                // Get model definition and create if necessary
                const WhatsAppMessageSchema = new mongoose.Schema({
                    messageId: { type: String, required: true, index: true },
                    tenantId: { type: String, required: true, index: true },
                    templateId: String,
                    recipient: String,
                    status: { type: String, default: 'sent' },
                    sentAt: { type: Date, default: Date.now },
                    deliveredAt: Date,
                    readAt: Date,
                    failedReason: String,
                    params: [],
                    metadata: {}
                }, { timestamps: true });
                
                // Only register the model if it doesn't exist
                const WhatsAppMessage = mongoose.models.WhatsAppMessage || 
                    mongoose.model('WhatsAppMessage', WhatsAppMessageSchema);
                
                try {
                    // Find the message to determine which tenant it belongs to
                    const message = await WhatsAppMessage.findOne({ messageId });
                    
                    // If message not found, log a warning but don't fail
                    if (!message) {
                        console.warn(`Message ${messageId} not found in database, might be from another system or test`);
                        return res.status(200).json({ success: true, message: 'Message not found but webhook processed' });
                    }
                    
                    // Extract the tenant ID
                    const tenantId = message.tenantId;
                    
                    // Update message with new status
                    const updateData = { status };
                    
                    // Update delivery timestamps based on status
                    if (status === 'delivered') {
                        updateData.deliveredAt = new Date();
                        console.log(`Message ${messageId} for tenant ${tenantId} delivered at ${new Date().toISOString()}`);
                    } else if (status === 'read') {
                        updateData.readAt = new Date();
                        console.log(`Message ${messageId} for tenant ${tenantId} read at ${new Date().toISOString()}`);
                    } else if (status === 'failed') {
                        updateData.failedReason = messageEvent.reason || 'Unknown error';
                        console.error(`Message ${messageId} for tenant ${tenantId} failed: ${messageEvent.reason || 'Unknown error'}`);
                        
                        // Also update tenant configuration health
                        const TenantConfigService = require('../services/TenantConfigService');
                        try {
                            // Get current config
                            const config = await TenantConfigService.getWhatsAppConfig(tenantId);
                            const currentErrorCount = config.health?.errorCount || 0;
                            
                            await TenantConfigService.updateIntegrationHealth(tenantId, {
                                errorCount: currentErrorCount + 1,
                                lastError: `Message delivery failed: ${messageEvent.reason || 'Unknown error'}`,
                                lastErrorTime: new Date()
                            });
                        } catch (configError) {
                            console.error(`Error updating health for tenant ${tenantId}:`, configError);
                        }
                    }
                    
                    // Update the message
                    const updatedMessage = await WhatsAppMessage.findOneAndUpdate(
                        { messageId },
                        { $set: updateData },
                        { new: true }
                    );
                    
                    console.log(`Updated message ${messageId} status to ${status} for tenant ${tenantId}`);
                } catch (dbError) {
                    console.error(`Error updating message ${messageId}:`, dbError.message);
                }
            } else {
                console.error('Missing required fields in message event:', { messageId, status });
            }
        } else if (payload.type === 'message') {
            // Incoming message from a user
            console.log('Received incoming message from user');
            
            // For incoming messages, we need to identify the tenant based on the destination (your business number)
            // This requires having a lookup table that maps business numbers to tenants
            const sourceNumber = payload.payload?.source;
            const destinationNumber = payload.payload?.destination;
            
            if (sourceNumber && destinationNumber) {
                try {
                    // Find the tenant based on the destination number
                    // This is a simplified approach - in a real system, you'd have a more robust tenant lookup
                    const TenantWhatsAppConfig = require('../models/TenantWhatsAppConfig');
                    const tenantConfig = await TenantWhatsAppConfig.findOne({
                        'gupshup.sourcePhoneNumber': destinationNumber
                    });
                    
                    if (tenantConfig) {
                        const tenantId = tenantConfig.tenantId;
                        console.log(`Incoming message for tenant ${tenantId}`);
                        
                        // Process the incoming message (you can add your business logic here)
                        // For example, store it in a database, trigger an automation, etc.
                    } else {
                        console.warn(`Cannot identify tenant for destination number ${destinationNumber}`);
                    }
                } catch (lookupError) {
                    console.error('Error looking up tenant for incoming message:', lookupError);
                }
            }
        } else {
            console.log(`Received webhook event of type: ${payload.type || 'unknown'}`);
        }
        
        // Always return success to acknowledge receipt
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        // Still return 200 to prevent retries
        res.status(200).json({ success: false, error: error.message });
    }
});

// Separate handler function for the webhook that can be called directly
const handleWebhook = async (req, res) => {
    try {
        const payload = req.body;
        console.log('Received webhook from Gupshup:', JSON.stringify(payload, null, 2));
        
        // Handle different types of webhook events
        if (payload.type === 'message-event') {
            const messageEvent = payload.payload;
            const messageId = messageEvent.id;
            const status = messageEvent.type?.toLowerCase();
            
            console.log(`Processing webhook message event: ${status} for message ${messageId}`);
            console.log('Full webhook message event data:', JSON.stringify(messageEvent, null, 2));
            
            if (messageId && status) {
                // Get model definition and create if necessary
                const WhatsAppMessageSchema = new mongoose.Schema({
                    messageId: { type: String, required: true, index: true },
                    tenantId: { type: String, required: true, index: true },
                    templateId: String,
                    recipient: String,
                    status: { type: String, default: 'sent' },
                    sentAt: { type: Date, default: Date.now },
                    deliveredAt: Date,
                    readAt: Date,
                    failedReason: String,
                    params: [],
                    metadata: {}
                }, { timestamps: true });
                
                // Only register the model if it doesn't exist
                const WhatsAppMessage = mongoose.models.WhatsAppMessage || 
                    mongoose.model('WhatsAppMessage', WhatsAppMessageSchema);
                
                const updateData = { status };
                
                // Update delivery timestamps based on status
                if (status === 'delivered') {
                    updateData.deliveredAt = new Date();
                    console.log(`Webhook: Message ${messageId} delivered at ${new Date().toISOString()}`);
                } else if (status === 'read') {
                    updateData.readAt = new Date();
                    console.log(`Webhook: Message ${messageId} read at ${new Date().toISOString()}`);
                } else if (status === 'failed') {
                    updateData.failedReason = messageEvent.reason || 'Unknown error';
                    console.error(`Webhook: Message ${messageId} failed: ${messageEvent.reason || 'Unknown error'}`);
                }
                
                try {
                    const updatedMessage = await WhatsAppMessage.findOneAndUpdate(
                        { messageId },
                        { $set: updateData },
                        { new: true }
                    );
                    
                    if (updatedMessage) {
                        console.log(`Webhook: Updated message ${messageId} status to ${status}`);
                    } else {
                        console.warn(`Webhook: Message ${messageId} not found in database`);
                    }
                } catch (dbError) {
                    console.error(`Webhook: Error updating message ${messageId}:`, dbError.message);
                }
            }
        } else {
            console.log(`Webhook: Received event of type: ${payload.type || 'unknown'}`);
        }
        
        // Always return success to acknowledge receipt
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Webhook: Error processing:', error);
        // Still return 200 to prevent retries
        res.status(200).json({ success: false, error: error.message });
    }
};

module.exports = router;
module.exports.handleWebhook = handleWebhook;