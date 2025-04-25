/**
 * Test script for WhatsApp template messages
 * 
 * Tests the WhatsApp template message sending functionality
 * with different template types, including image templates.
 * 
 * Usage: node test-template-message.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { buildAndSendTemplateMessage } = require('./services/gupshupWhatsAppService');

const TENANT_ID = process.env.TEST_TENANT_ID || 'test_db';
const TEST_PHONE = process.env.TEST_PHONE_NUMBER || '+1234567890';
const TEXT_TEMPLATE_ID = process.env.TEST_TEXT_TEMPLATE_ID;
const IMAGE_TEMPLATE_ID = process.env.TEST_IMAGE_TEMPLATE_ID;

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

async function testTextTemplate() {
  try {
    console.log('\n=== Testing Text Template ===');
    console.log(`Sending text template ${TEXT_TEMPLATE_ID} to ${TEST_PHONE}`);
    
    const result = await buildAndSendTemplateMessage({
      destination: TEST_PHONE,
      templateId: TEXT_TEMPLATE_ID,
      params: ['Welcome', 'User', 'Thank you for testing!'],
      templateType: 'text',
      tenantId: TENANT_ID
    });
    
    console.log('Text template result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error sending text template:', error.message);
    if (error.gupshupError) {
      console.error('Gupshup error details:', error.gupshupError);
    }
  }
}

async function testImageTemplate() {
  try {
    console.log('\n=== Testing Image Template ===');
    console.log(`Sending image template ${IMAGE_TEMPLATE_ID} to ${TEST_PHONE}`);
    
    // Note: We don't need to supply mediaUrl or mediaId as the service will
    // fetch them from the template definition automatically
    const result = await buildAndSendTemplateMessage({
      destination: TEST_PHONE,
      templateId: IMAGE_TEMPLATE_ID,
      params: ['Special Offer', 'Product Description', '25% OFF'],
      templateType: 'image', // The service will verify this from the template
      tenantId: TENANT_ID
    });
    
    console.log('Image template result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error sending image template:', error.message);
    if (error.gupshupError) {
      console.error('Gupshup error details:', error.gupshupError);
    }
  }
}

async function testImageTemplateWithCustomMedia() {
  try {
    console.log('\n=== Testing Image Template With Custom Media ===');
    console.log(`Sending image template ${IMAGE_TEMPLATE_ID} with custom media to ${TEST_PHONE}`);
    
    const result = await buildAndSendTemplateMessage({
      destination: TEST_PHONE,
      templateId: IMAGE_TEMPLATE_ID,
      params: ['Custom Media Test', 'Using custom image URL', 'TEST'],
      templateType: 'image',
      mediaUrl: 'https://example.com/custom-image.jpg', // Custom media URL
      caption: 'Custom image caption',
      tenantId: TENANT_ID
    });
    
    console.log('Custom media template result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error sending custom media template:', error.message);
    if (error.gupshupError) {
      console.error('Gupshup error details:', error.gupshupError);
    }
  }
}

async function main() {
  try {
    await connectToDatabase();
    
    // Test both template types
    await testTextTemplate();
    await testImageTemplate();
    await testImageTemplateWithCustomMedia();
    
    console.log('\n=== All tests completed ===');
  } catch (error) {
    console.error('Error in main execution:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

// Run the main function
main().catch(console.error); 