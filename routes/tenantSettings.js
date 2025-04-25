/**
 * Tenant Settings API Routes
 * 
 * Endpoints for managing tenant-specific settings and integrations
 */

const express = require('express');
const router = express.Router();
const TenantConfigService = require('../services/TenantConfigService');
const { isValidE164 } = require('../services/gupshupWhatsAppService');
const logger = require('../utils/logger');

// Middleware to verify tenant admin access
const verifyTenantAdmin = (req, res, next) => {
  // You can implement more sophisticated permission checks here
  // For now, we just check if the user is authenticated and has a tenantId
  if (!req.userId || !req.tenantId) {
    return res.status(403).json({
      success: false,
      error: 'Unauthorized. Only tenant administrators can access these settings.'
    });
  }
  
  next();
};

// Get WhatsApp configuration for the current tenant
router.get('/whatsapp/config', verifyTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const config = await TenantConfigService.getWhatsAppConfig(tenantId);
    
    // Mask sensitive information
    if (config.gupshup?.apiKey) {
      // Show only first 5 characters of API key
      config.gupshup.apiKey = config.gupshup.apiKey.substring(0, 5) + '...[masked]';
    }
    
    res.status(200).json({
      success: true,
      config
    });
  } catch (error) {
    logger.error(`Error fetching WhatsApp config for tenant ${req.tenantId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve WhatsApp configuration'
    });
  }
});

// Update WhatsApp configuration for the current tenant
router.put('/whatsapp/config', verifyTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const configUpdate = req.body;
    
    // Validate required fields
    if (configUpdate.gupshup) {
      // Validate phone number if provided
      if (configUpdate.gupshup.sourcePhoneNumber && !isValidE164(configUpdate.gupshup.sourcePhoneNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Source phone number must be in E.164 format (e.g., +919876543210)'
        });
      }
      
      // Validate API key if provided (basic validation)
      if (configUpdate.gupshup.apiKey && configUpdate.gupshup.apiKey.length < 10) {
        return res.status(400).json({
          success: false,
          error: 'Invalid API key format'
        });
      }
    }
    
    // Update the configuration
    const updatedConfig = await TenantConfigService.updateWhatsAppConfig(tenantId, configUpdate);
    
    // Mask sensitive information in response
    if (updatedConfig.gupshup?.apiKey) {
      updatedConfig.gupshup.apiKey = updatedConfig.gupshup.apiKey.substring(0, 5) + '...[masked]';
    }
    
    // Clear the cache to ensure fresh configuration is used
    TenantConfigService.clearCache(tenantId);
    
    res.status(200).json({
      success: true,
      message: 'WhatsApp configuration updated successfully',
      config: updatedConfig
    });
  } catch (error) {
    logger.error(`Error updating WhatsApp config for tenant ${req.tenantId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update WhatsApp configuration'
    });
  }
});

// Get WhatsApp integration health status
router.get('/whatsapp/health', verifyTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const config = await TenantConfigService.getWhatsAppConfig(tenantId);
    
    const health = config.health || {
      lastSuccessfulSend: null,
      errorCount: 0,
      lastError: null,
      lastErrorTime: null
    };
    
    res.status(200).json({
      success: true,
      health,
      status: health.errorCount > 3 ? 'degraded' : 'healthy'
    });
  } catch (error) {
    logger.error(`Error fetching WhatsApp health for tenant ${req.tenantId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve WhatsApp integration health'
    });
  }
});

// Test WhatsApp configuration
router.post('/whatsapp/test', verifyTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { phoneNumber, templateId } = req.body;
    
    if (!phoneNumber || !templateId) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and template ID are required'
      });
    }
    
    // Get the WhatsApp service
    const { buildAndSendTemplateMessage } = require('../services/gupshupWhatsAppService');
    
    // Send a test message
    const result = await buildAndSendTemplateMessage({
      destination: phoneNumber,
      templateId: templateId,
      params: ["Test User", new Date().toLocaleString()],
      templateType: "text",
      tenantId: tenantId
    });
    
    res.status(200).json({
      success: true,
      message: 'Test message sent successfully',
      messageId: result.messageId
    });
  } catch (error) {
    logger.error(`Error sending test WhatsApp message for tenant ${req.tenantId}:`, error);
    res.status(500).json({
      success: false,
      error: `Failed to send test message: ${error.message}`,
      details: error.gupshupError
    });
  }
});

// Get WhatsApp templates
router.get('/whatsapp/templates', verifyTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const config = await TenantConfigService.getWhatsAppConfig(tenantId);
    
    // Return templates defined for this tenant
    const templates = config.templates || [];
    
    res.status(200).json({
      success: true,
      templates
    });
  } catch (error) {
    logger.error(`Error fetching WhatsApp templates for tenant ${req.tenantId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve WhatsApp templates'
    });
  }
});

// Add/Update a WhatsApp template
router.post('/whatsapp/templates', verifyTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const templateData = req.body;
    
    if (!templateData.id || !templateData.name) {
      return res.status(400).json({
        success: false,
        error: 'Template ID and name are required'
      });
    }
    
    // Get current config
    const config = await TenantConfigService.getWhatsAppConfig(tenantId);
    
    // Find if template exists
    const templates = config.templates || [];
    const existingIndex = templates.findIndex(t => t.id === templateData.id);
    
    if (existingIndex >= 0) {
      // Update existing template
      templates[existingIndex] = {
        ...templates[existingIndex],
        ...templateData
      };
    } else {
      // Add new template
      templates.push(templateData);
    }
    
    // Update config
    const updatedConfig = await TenantConfigService.updateWhatsAppConfig(tenantId, {
      templates
    });
    
    res.status(200).json({
      success: true,
      message: existingIndex >= 0 ? 'Template updated successfully' : 'Template added successfully',
      template: templateData
    });
  } catch (error) {
    logger.error(`Error updating WhatsApp template for tenant ${req.tenantId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update WhatsApp template'
    });
  }
});

// Delete a WhatsApp template
router.delete('/whatsapp/templates/:id', verifyTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const templateId = req.params.id;
    
    // Get current config
    const config = await TenantConfigService.getWhatsAppConfig(tenantId);
    
    // Filter out the template to delete
    const templates = (config.templates || []).filter(t => t.id !== templateId);
    
    // Update config
    const updatedConfig = await TenantConfigService.updateWhatsAppConfig(tenantId, {
      templates
    });
    
    res.status(200).json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting WhatsApp template for tenant ${req.tenantId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete WhatsApp template'
    });
  }
});

module.exports = router; 