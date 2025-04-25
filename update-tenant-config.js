/**
 * Script to update tenant WhatsApp configuration
 * 
 * Run with: node update-tenant-config.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function updateTenantConfig() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/emailTracker', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected successfully');
    
    // Define tenant ID - this should match the tenant in your JWT
    const tenantId = 'test_db';
    
    // Skip the automatic encryption by updating the document directly
    console.log('Updating tenant configuration...');
    
    // Get the Gupshup credentials from env variables
    const gupshupApiKey = process.env.GUPSHUP_API_KEY;
    const gupshupAppId = process.env.GUPSHUP_APP_ID;
    const gupshupSourcePhoneNumber = process.env.GUPSHUP_sourcePhoneNumber;
    
    if (!gupshupApiKey || !gupshupAppId || !gupshupSourcePhoneNumber) {
      throw new Error('Missing required Gupshup environment variables');
    }
    
    console.log('Using Gupshup credentials:');
    console.log(`App ID: ${gupshupAppId}`);
    console.log(`Source Phone: ${gupshupSourcePhoneNumber}`);
    console.log(`API Key (first 5 chars): ${gupshupApiKey.substring(0, 5)}...`);
    
    // Update directly in the database
    const result = await mongoose.connection.db.collection('tenantwhatsappconfigs').updateOne(
      { tenantId },
      {
        $set: {
          tenantId,
          provider: 'gupshup',
          'gupshup.apiKey': gupshupApiKey,
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
    
    console.log('Configuration updated successfully');
    console.log(result);
    
    // Add a template for testing
    console.log('Adding test template...');
    
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
    console.log(templateResult);
    
  } catch (error) {
    console.error('Error updating tenant configuration:', error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

updateTenantConfig().catch(console.error); 