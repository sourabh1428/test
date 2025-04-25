/**
 * Tenant Configuration Service
 * 
 * A service for managing tenant-specific configurations for the WhatsApp integration.
 * Handles caching, retrieval, and updates of tenant configurations.
 */

const TenantWhatsAppConfig = require('../models/TenantWhatsAppConfig');
const logger = require('../utils/logger');
const { RateLimiter } = require('./RateLimiterService');
const { decrypt } = require('../utils/encryption');

// In-memory cache for tenant configurations to reduce database load
const configCache = new Map();
const rateLimiters = new Map();

// Cache expiration time in milliseconds (15 minutes)
const CACHE_TTL = 15 * 60 * 1000;

class TenantConfigService {
  /**
   * Get WhatsApp configuration for a specific tenant
   * 
   * @param {string} tenantId - The tenant ID
   * @param {boolean} [forceRefresh=false] - Force refresh from database
   * @returns {Promise<Object>} The tenant configuration
   */
  static async getWhatsAppConfig(tenantId, forceRefresh = false) {
    const cacheKey = `whatsapp:${tenantId}`;
    
    // Return from cache if available and not a forced refresh
    if (!forceRefresh && configCache.has(cacheKey)) {
      const cached = configCache.get(cacheKey);
      // Check if cache is still valid
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.config;
      }
    }
    
    try {
      // Get configuration from database
      let config = await TenantWhatsAppConfig.findOne({ tenantId });
      
      // If no tenant-specific config exists, create a default one
      if (!config) {
        config = await TenantConfigService.createDefaultWhatsAppConfig(tenantId);
      }
      
      // Convert to plain object and handle decryption manually
      const configObj = config.toObject();
      
      // Decrypt API key if it exists
      if (configObj.gupshup && configObj.gupshup.apiKey) {
        configObj.gupshup.apiKey = decrypt(configObj.gupshup.apiKey);
      }
      
      // Update cache
      configCache.set(cacheKey, {
        config: configObj,
        timestamp: Date.now()
      });
      
      return configObj;
    } catch (error) {
      logger.error(`Error getting WhatsApp config for tenant ${tenantId}:`, error);
      throw new Error(`Failed to retrieve WhatsApp configuration: ${error.message}`);
    }
  }
  
  /**
   * Create default WhatsApp configuration for a tenant
   * 
   * @param {string} tenantId - The tenant ID
   * @returns {Promise<Object>} The created configuration
   */
  static async createDefaultWhatsAppConfig(tenantId) {
    try {
      // For new tenants, create a default configuration
      // This uses the system defaults from environment variables
      const defaultConfig = new TenantWhatsAppConfig({
        tenantId,
        provider: 'gupshup',
        gupshup: {
          apiKey: process.env.GUPSHUP_API_KEY || '',
          appId: process.env.GUPSHUP_APP_ID || '',
          sourcePhoneNumber: process.env.GUPSHUP_sourcePhoneNumber || '',
          enabled: !!process.env.GUPSHUP_API_KEY,
          webhookUrl: process.env.GUPSHUP_WEBHOOK_URL || 'https://gupshup.sppathak1428.workers.dev'
        }
      });
      
      await defaultConfig.save();
      logger.info(`Created default WhatsApp configuration for tenant ${tenantId}`);
      return defaultConfig;
    } catch (error) {
      logger.error(`Error creating default WhatsApp config for tenant ${tenantId}:`, error);
      throw new Error(`Failed to create default WhatsApp configuration: ${error.message}`);
    }
  }
  
  /**
   * Update WhatsApp configuration for a tenant
   * 
   * @param {string} tenantId - The tenant ID
   * @param {Object} configUpdate - The configuration updates
   * @returns {Promise<Object>} The updated configuration
   */
  static async updateWhatsAppConfig(tenantId, configUpdate) {
    try {
      // Update or create configuration
      const config = await TenantWhatsAppConfig.findOneAndUpdate(
        { tenantId },
        { $set: configUpdate },
        { new: true, upsert: true }
      );
      
      // Invalidate cache
      const cacheKey = `whatsapp:${tenantId}`;
      configCache.delete(cacheKey);
      
      // If rate limiter exists, reset it
      if (rateLimiters.has(tenantId)) {
        rateLimiters.delete(tenantId);
      }
      
      logger.info(`Updated WhatsApp configuration for tenant ${tenantId}`);

      // Convert to plain object and handle decryption manually
      const configObj = config.toObject();
      
      // Decrypt API key if it exists
      if (configObj.gupshup && configObj.gupshup.apiKey) {
        configObj.gupshup.apiKey = decrypt(configObj.gupshup.apiKey);
      }
      
      return configObj;
    } catch (error) {
      logger.error(`Error updating WhatsApp config for tenant ${tenantId}:`, error);
      throw new Error(`Failed to update WhatsApp configuration: ${error.message}`);
    }
  }
  
  /**
   * Update integration health status
   * 
   * @param {string} tenantId - The tenant ID
   * @param {Object} healthUpdate - Health status update
   * @returns {Promise<void>}
   */
  static async updateIntegrationHealth(tenantId, healthUpdate) {
    try {
      await TenantWhatsAppConfig.findOneAndUpdate(
        { tenantId },
        { $set: { health: healthUpdate } }
      );
      
      // Update cache if exists
      const cacheKey = `whatsapp:${tenantId}`;
      if (configCache.has(cacheKey)) {
        const cached = configCache.get(cacheKey);
        cached.config.health = healthUpdate;
      }
    } catch (error) {
      logger.error(`Error updating integration health for tenant ${tenantId}:`, error);
    }
  }
  
  /**
   * Get rate limiter for a tenant
   * 
   * @param {string} tenantId - The tenant ID
   * @returns {Promise<RateLimiter>} The rate limiter instance
   */
  static async getRateLimiter(tenantId) {
    // Return from cache if available
    if (rateLimiters.has(tenantId)) {
      return rateLimiters.get(tenantId);
    }
    
    // Get tenant configuration
    const config = await TenantConfigService.getWhatsAppConfig(tenantId);
    
    // Create rate limiter with tenant-specific limits
    const limit = config.gupshup.rateLimit && config.gupshup.rateLimit.messagesPerMinute || 60;
    const enabled = config.gupshup.rateLimit && config.gupshup.rateLimit.enabled || false;
    
    const limiter = new RateLimiter({
      tokensPerInterval: limit,
      interval: 60 * 1000, // 1 minute
      enabled: enabled
    });
    
    // Cache the rate limiter
    rateLimiters.set(tenantId, limiter);
    
    return limiter;
  }
  
  /**
   * Clear cache for a tenant
   * 
   * @param {string} tenantId - The tenant ID, if not provided, clears all cache
   */
  static clearCache(tenantId) {
    if (tenantId) {
      const cacheKey = `whatsapp:${tenantId}`;
      configCache.delete(cacheKey);
      rateLimiters.delete(tenantId);
      logger.info(`Cleared configuration cache for tenant ${tenantId}`);
    } else {
      configCache.clear();
      rateLimiters.clear();
      logger.info('Cleared all tenant configuration cache');
    }
  }
}

module.exports = TenantConfigService; 