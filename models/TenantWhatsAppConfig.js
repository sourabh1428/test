const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

const TenantWhatsAppConfigSchema = new mongoose.Schema({
  tenantId: { 
    type: String, 
    required: true, 
    index: true,
    unique: true
  },
  provider: {
    type: String,
    enum: ['gupshup', 'twilio', 'messagebird'],
    default: 'gupshup'
  },
  // Gupshup specific configuration
  gupshup: {
    apiKey: { 
      type: String
      // We're no longer using Mongoose's built-in getter/setter for encryption
      // as it causes issues with our encrypted format
    },
    appId: String,
    sourcePhoneNumber: String,
    enabled: {
      type: Boolean,
      default: true
    },
    webhookUrl: String,
    rateLimit: {
      messagesPerMinute: {
        type: Number,
        default: 60
      },
      enabled: {
        type: Boolean,
        default: false
      }
    }
  },
  // Template definitions specific to this tenant
  templates: [{
    id: String,
    name: String,
    description: String,
    parameters: [String],
    templateType: {
      type: String,
      enum: ['text', 'image', 'video', 'document'],
      default: 'text'
    }
  }],
  // Monitor integration health
  health: {
    lastSuccessfulSend: Date,
    errorCount: {
      type: Number,
      default: 0
    },
    lastError: String,
    lastErrorTime: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { getters: false, setters: false },
  toObject: { getters: false, setters: false }
});

// Update the updatedAt timestamp on save
TenantWhatsAppConfigSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Encrypt sensitive data before saving
TenantWhatsAppConfigSchema.pre('save', function(next) {
  if (this.gupshup && this.gupshup.apiKey) {
    this.gupshup.apiKey = encrypt(this.gupshup.apiKey);
  }
  next();
});

// Add a virtual getter to get the decrypted API key
TenantWhatsAppConfigSchema.virtual('gupshup.decryptedApiKey').get(function() {
  if (this.gupshup && this.gupshup.apiKey) {
    return decrypt(this.gupshup.apiKey);
  }
  return undefined;
});

// Create compound index for better query performance
TenantWhatsAppConfigSchema.index({ tenantId: 1, 'gupshup.enabled': 1 });

module.exports = mongoose.models.TenantWhatsAppConfig || 
  mongoose.model('TenantWhatsAppConfig', TenantWhatsAppConfigSchema); 