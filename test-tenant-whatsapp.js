/**
 * Test script for sending WhatsApp messages using tenant-specific configuration
 * 
 * Run with: node test-tenant-whatsapp.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { buildAndSendTemplateMessage } = require('./services/gupshupWhatsAppService');

// Test phone number to send the message to
const TEST_PHONE_NUMBER = '+918839143395'; // Update this with your test number
const TENANT_ID = 'test_db';

async function testTenantWhatsApp() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/emailTracker', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected successfully');
    
    console.log(`Testing WhatsApp message with tenant ID: ${TENANT_ID}`);
    console.log(`Sending to: ${TEST_PHONE_NUMBER}`);
    
    // Send a test message using the tenant-specific configuration
    const result = await buildAndSendTemplateMessage({
      destination: TEST_PHONE_NUMBER,
      templateId: '5e1f4ce8-7ff8-485a-a964-b9f9915e0e3a', // This should match a template in your tenant config
      params: ['Test User', 'This is a test message from tenant: ' + TENANT_ID],
      templateType: 'text',
      tenantId: TENANT_ID
    });
    
    console.log('Message sent successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.message);
    if (error.gupshupError) {
      console.error('Gupshup API error:', error.gupshupError);
    }
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

testTenantWhatsApp().catch(console.error); 