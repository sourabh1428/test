/**
 * WhatsApp Message Model
 * 
 * Stores information about sent WhatsApp messages with tenant isolation.
 */

const mongoose = require('mongoose');

const WhatsAppMessageSchema = new mongoose.Schema({
  // Message identification
  messageId: { 
    type: String, 
    required: true, 
    index: true 
  },
  
  // Tenant isolation
  tenantId: { 
    type: String, 
    required: true, 
    index: true 
  },
  
  // Message details
  templateId: String,
  recipient: String,
  status: { 
    type: String, 
    default: 'sent',
    enum: ['sent', 'delivered', 'read', 'failed'] 
  },
  
  // Message content
  templateType: {
    type: String,
    enum: ['text', 'image', 'video', 'document', 'location'],
    default: 'text'
  },
  params: [String],
  mediaUrl: String,
  
  // Tracking info
  sentAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  deliveredAt: Date,
  readAt: Date,
  failedReason: String,
  
  // Additional metadata
  metadata: {
    type: Object,
    default: {}
  },
  
  // Campaign or automation tracking
  campaignId: String,
  automationId: String,
  
  // Contact info
  contactId: String,
  contactPhone: String,
  
  // Message thread tracking
  conversationId: String,
  replyToMessageId: String
}, { 
  timestamps: true 
});

// Create compound indices for common query patterns
WhatsAppMessageSchema.index({ tenantId: 1, status: 1 });
WhatsAppMessageSchema.index({ tenantId: 1, sentAt: -1 });
WhatsAppMessageSchema.index({ tenantId: 1, contactId: 1, sentAt: -1 });
WhatsAppMessageSchema.index({ tenantId: 1, campaignId: 1 });
WhatsAppMessageSchema.index({ tenantId: 1, automationId: 1 });
WhatsAppMessageSchema.index({ tenantId: 1, conversationId: 1, sentAt: 1 });

/**
 * Static method to record a sent message
 * 
 * @param {Object} messageData - The message data
 * @returns {Promise<Object>} The created message document
 */
WhatsAppMessageSchema.statics.recordSentMessage = async function(messageData) {
  const { messageId, tenantId, recipient, templateId, params, templateType, mediaUrl, metadata } = messageData;
  
  if (!messageId || !tenantId || !recipient) {
    throw new Error('Missing required fields for WhatsApp message: messageId, tenantId, recipient');
  }
  
  const message = new this({
    messageId,
    tenantId,
    recipient,
    templateId,
    params: params || [],
    templateType: templateType || 'text',
    mediaUrl,
    metadata: metadata || {},
    sentAt: new Date(),
    status: 'sent'
  });
  
  await message.save();
  return message;
};

/**
 * Update message status
 * 
 * @param {string} messageId - The message ID
 * @param {string} status - The new status
 * @param {Object} [options] - Additional options like reason, timestamp
 * @returns {Promise<Object>} The updated message
 */
WhatsAppMessageSchema.statics.updateMessageStatus = async function(messageId, status, options = {}) {
  const updateData = { status };
  
  if (status === 'delivered') {
    updateData.deliveredAt = options.timestamp || new Date();
  } else if (status === 'read') {
    updateData.readAt = options.timestamp || new Date();
  } else if (status === 'failed') {
    updateData.failedReason = options.reason || 'Unknown error';
  }
  
  return this.findOneAndUpdate(
    { messageId },
    { $set: updateData },
    { new: true }
  );
};

/**
 * Get messages for a specific tenant
 * 
 * @param {string} tenantId - The tenant ID
 * @param {Object} [filters] - Optional filters (status, timeRange, etc.)
 * @param {Object} [options] - Options like pagination, sorting
 * @returns {Promise<Array>} Array of messages
 */
WhatsAppMessageSchema.statics.getMessagesForTenant = async function(tenantId, filters = {}, options = {}) {
  const query = { tenantId };
  
  // Apply filters
  if (filters.status) {
    query.status = filters.status;
  }
  
  if (filters.contactId) {
    query.contactId = filters.contactId;
  }
  
  if (filters.campaignId) {
    query.campaignId = filters.campaignId;
  }
  
  if (filters.automationId) {
    query.automationId = filters.automationId;
  }
  
  // Apply time range filters
  if (filters.startDate || filters.endDate) {
    query.sentAt = {};
    
    if (filters.startDate) {
      query.sentAt.$gte = new Date(filters.startDate);
    }
    
    if (filters.endDate) {
      query.sentAt.$lte = new Date(filters.endDate);
    }
  }
  
  // Set default options
  const limit = options.limit || 50;
  const skip = options.skip || 0;
  const sort = options.sort || { sentAt: -1 };
  
  return this.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Define the model (only if it doesn't exist)
module.exports = mongoose.models.WhatsAppMessage || 
  mongoose.model('WhatsAppMessage', WhatsAppMessageSchema); 