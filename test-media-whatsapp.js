/**
 * Test script for sending WhatsApp media template messages using tenant-specific configuration
 * 
 * Run with: node test-media-whatsapp.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { buildAndSendTemplateMessage } = require('./services/gupshupWhatsAppService');

// Test phone number to send the message to
const TEST_PHONE_NUMBER = '+918839143395'; // Update this with your test number
const TENANT_ID = 'test_db';

async function testMediaWhatsApp() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/emailTracker', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected successfully');
    
    console.log(`Testing WhatsApp media template message with tenant ID: ${TENANT_ID}`);
    console.log(`Sending to: ${TEST_PHONE_NUMBER}`);
    
    // Sample image URL for testing
    const imageUrl = 'https://www.buildquickbots.com/whatsapp/media/sample/jpg/sample01.jpg';
    
    // Send a test image message using the tenant-specific configuration
    const result = await buildAndSendTemplateMessage({
      destination: TEST_PHONE_NUMBER,
      templateId: '5e1f4ce8-7ff8-485a-a964-b9f9915e0e3a', // This should match a template in your tenant config
      params: ['Test User', 'This is a test message from tenant: ' + TENANT_ID],
      templateType: 'image',
      mediaUrl: imageUrl,
      caption: 'Sample Image Caption', // Optional caption for the image
      tenantId: TENANT_ID
    });
    
    console.log('Image Message sent successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Test document template
    const documentUrl = 'https://www.buildquickbots.com/whatsapp/media/sample/pdf/sample01.pdf';
    
    // Send a test document message
    const docResult = await buildAndSendTemplateMessage({
      destination: TEST_PHONE_NUMBER,
      templateId: '5e1f4ce8-7ff8-485a-a964-b9f9915e0e3a', // This should match a template in your tenant config
      params: ['Test User', 'This is a document test message'],
      templateType: 'document',
      mediaUrl: documentUrl,
      filename: 'Sample Document.pdf', // Required for document templates
      tenantId: TENANT_ID
    });
    
    console.log('Document Message sent successfully!');
    console.log('Result:', JSON.stringify(docResult, null, 2));
    
    // Test video template
    const videoUrl = 'https://www.buildquickbots.com/whatsapp/media/sample/video/sample01.mp4';
    
    // Send a test video message
    const videoResult = await buildAndSendTemplateMessage({
      destination: TEST_PHONE_NUMBER,
      templateId: '5e1f4ce8-7ff8-485a-a964-b9f9915e0e3a', // This should match a template in your tenant config
      params: ['Test User', 'This is a video test message'],
      templateType: 'video',
      mediaUrl: videoUrl,
      caption: 'Sample Video Caption', // Optional caption for the video
      tenantId: TENANT_ID
    });
    
    console.log('Video Message sent successfully!');
    console.log('Result:', JSON.stringify(videoResult, null, 2));
    
    // NOTE: Location templates are not fully implemented in the service yet
    /*
    // Test location template
    const locationData = {
      longitude: "72.877655",
      latitude: "19.076090",
      name: "Gupshup Headquarters",
      address: "Mumbai, India"
    };
    
    // Send a test location message
    const locationResult = await buildAndSendTemplateMessage({
      destination: TEST_PHONE_NUMBER,
      templateId: '5e1f4ce8-7ff8-485a-a964-b9f9915e0e3a', // This should match a template in your tenant config
      params: ['Test User', 'This is a location test message'],
      templateType: 'location',
      mediaUrl: locationData,
      tenantId: TENANT_ID
    });
    
    console.log('Location Message sent successfully!');
    console.log('Result:', JSON.stringify(locationResult, null, 2));
    */
    
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

testMediaWhatsApp().catch(console.error); 