/**
 * Debug script for WhatsApp configuration
 * 
 * Run with: node debug-whatsapp.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');

async function debugWhatsAppConfig() {
  try {
    // Print environment variables first
    console.log('Environment variables:');
    console.log('- GUPSHUP_API_KEY:', process.env.GUPSHUP_API_KEY);
    console.log('- GUPSHUP_APP_ID:', process.env.GUPSHUP_APP_ID);
    console.log('- GUPSHUP_sourcePhoneNumber:', process.env.GUPSHUP_sourcePhoneNumber);
    console.log('- ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? process.env.ENCRYPTION_KEY.substring(0, 10) + '...' : 'undefined');
    
    // Connect to MongoDB
    console.log('\nConnecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/emailTracker', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected successfully');
    
    // Define tenant ID
    const tenantId = 'test_db';
    
    // Get raw WhatsApp config from database
    console.log(`\nRaw WhatsApp config for tenant ${tenantId}:`);
    const rawConfig = await mongoose.connection.db.collection('tenantwhatsappconfigs').findOne({ tenantId });
    console.log(JSON.stringify(rawConfig, null, 2));
    
    // Try to decrypt the API key manually
    if (rawConfig && rawConfig.gupshup && rawConfig.gupshup.apiKey) {
      console.log('\nAttempting to decrypt API key manually:');
      try {
        const encryptedApiKey = rawConfig.gupshup.apiKey;
        console.log('- Encrypted API key:', encryptedApiKey);
        
        // Skip if the API key doesn't have the expected format
        if (!encryptedApiKey.includes(':')) {
          console.log('- API key is not in encrypted format (no : character)');
        } else {
          // Decrypt the API key manually
          const [ivBase64, authTagBase64, encryptedData] = encryptedApiKey.split(':');
          console.log('- IV (base64):', ivBase64);
          console.log('- Auth tag (base64):', authTagBase64);
          console.log('- Encrypted data (base64):', encryptedData);
          
          // Get encryption key
          const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
          
          if (!ENCRYPTION_KEY) {
            console.log('- ERROR: ENCRYPTION_KEY is missing in environment variables');
          } else {
            // Create decipher
            const iv = Buffer.from(ivBase64, 'base64');
            const authTag = Buffer.from(authTagBase64, 'base64');
            
            const decipher = crypto.createDecipheriv(
              'aes-256-gcm', 
              Buffer.from(ENCRYPTION_KEY, 'hex'), 
              iv
            );
            
            // Set auth tag
            decipher.setAuthTag(authTag);
            
            // Decrypt the data
            let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            
            console.log('- Decrypted API key:', decrypted);
          }
        }
      } catch (error) {
        console.log('- Decryption error:', error.message);
      }
    }
    
    // Test API key with Gupshup
    console.log('\nTesting API keys with Gupshup:');
    
    // Test with API key from environment
    const envApiKey = process.env.GUPSHUP_API_KEY;
    if (envApiKey) {
      console.log('\nTesting with API key from .env file:');
      await testGupshupApiKey(envApiKey);
    }
    
    // Create a fresh tenant config in the database with the latest environment variables
    console.log('\nUpdating tenant configuration with latest .env values...');
    await updateTenantConfig(tenantId);
    
    console.log('\nConfig update completed. Please run test-tenant-whatsapp.js again to see if it works.');
    
  } catch (error) {
    console.error('Error debugging WhatsApp configuration:', error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

async function testGupshupApiKey(apiKey) {
  try {
    // Make a simple GET request to Gupshup API to check if the API key is valid
    const response = await axios.get('https://api.gupshup.io/sm/api/v1/users/me', {
      headers: {
        'apikey': apiKey
      }
    });
    
    console.log('- API key test success!');
    console.log('- Response status:', response.status);
    console.log('- Response data:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log('- API key test failed!');
    console.log('- Error:', error.message);
    if (error.response) {
      console.log('- Response status:', error.response.status);
      console.log('- Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function updateTenantConfig(tenantId) {
  try {
    // Get the Gupshup credentials from env variables
    const gupshupApiKey = process.env.GUPSHUP_API_KEY;
    const gupshupAppId = process.env.GUPSHUP_APP_ID;
    const gupshupSourcePhoneNumber = process.env.GUPSHUP_sourcePhoneNumber;
    
    if (!gupshupApiKey || !gupshupAppId || !gupshupSourcePhoneNumber) {
      throw new Error('Missing required Gupshup environment variables');
    }
    
    console.log('Using Gupshup credentials:');
    console.log(`- App ID: ${gupshupAppId}`);
    console.log(`- Source Phone: ${gupshupSourcePhoneNumber}`);
    console.log(`- API Key (first 5 chars): ${gupshupApiKey.substring(0, 5)}...`);
    
    // Update directly in the database without encryption
    // This is a temporary solution to bypass encryption issues
    const result = await mongoose.connection.db.collection('tenantwhatsappconfigs').updateOne(
      { tenantId },
      {
        $set: {
          tenantId,
          provider: 'gupshup',
          'gupshup.apiKey': gupshupApiKey, // Store unencrypted for testing
          'gupshup.appId': gupshupAppId,
          'gupshup.sourcePhoneNumber': gupshupSourcePhoneNumber,
          'gupshup.enabled': true,
          'gupshup.webhookUrl': process.env.GUPSHUP_WEBHOOK_URL || 'https://gupshup.sppathak1428.workers.dev'
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    
    console.log('Configuration updated successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Add a template for testing
    const template = {
      id: '5e1f4ce8-7ff8-485a-a964-b9f9915e0e3a',
      name: 'Testing Template',
      description: 'Template for testing WhatsApp integration',
      parameters: ['User Name', 'Message'],
      templateType: 'text'
    };
    
    // Update templates
    const templateResult = await mongoose.connection.db.collection('tenantwhatsappconfigs').updateOne(
      { tenantId },
      {
        $set: {
          templates: [template],
          updatedAt: new Date()
        }
      }
    );
    
    console.log('Template updated successfully');
    console.log('Result:', JSON.stringify(templateResult, null, 2));
    
    return true;
  } catch (error) {
    console.error('Error updating tenant configuration:', error);
    return false;
  }
}

debugWhatsAppConfig().catch(console.error); 