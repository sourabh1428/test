/**
 * WhatsApp Message Test Script
 * 
 * This script tests your WhatsApp messaging setup by:
 * 1. Verifying environment variables
 * 2. Testing template API access
 * 3. Sending a test message
 * 4. Setting up a temporary webhook listener
 * 
 * Run with: node test-whatsapp.js <phone_number>
 */

const axios = require('axios');
const qs = require('qs');
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

// Get phone number from command line arguments
const phoneNumber = process.argv[2] || '';

if (!phoneNumber) {
  console.error('Please provide a phone number: node test-whatsapp.js <phone_number>');
  process.exit(1);
}

// Format phone number to E.164 format if needed
let formattedPhone = phoneNumber;
if (!formattedPhone.startsWith('+')) {
  if (/^\d{10,14}$/.test(formattedPhone)) {
    formattedPhone = '+' + formattedPhone;
  } else {
    formattedPhone = '+91' + formattedPhone; // Default to India code
  }
}

console.log(`🔍 Starting WhatsApp diagnostic test with phone number: ${formattedPhone}`);

// Step 1: Check environment variables
function checkEnvironment() {
  console.log('\n📋 Checking environment variables...');
  
  const requiredVars = [
    'GUPSHUP_API_KEY',
    'GUPSHUP_APP_ID',
    'GUPSHUP_sourcePhoneNumber',
    'API_BASE_URL'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  console.log('✅ All required environment variables are set');
  console.log(`   API Key: ${process.env.GUPSHUP_API_KEY.substring(0, 5)}...`);
  console.log(`   App ID: ${process.env.GUPSHUP_APP_ID}`);
  console.log(`   Source Phone: ${process.env.GUPSHUP_sourcePhoneNumber}`);
  console.log(`   Base URL: ${process.env.API_BASE_URL}`);
  
  return true;
}

// Step 2: Test template API access
async function testTemplateAccess() {
  console.log('\n📝 Testing template API access...');
  
  try {
    const response = await axios.get(
      'https://api.gupshup.io/wa/api/v1/template/list',
      {
        headers: {
          'apikey': process.env.GUPSHUP_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.status === 'success') {
      const templates = response.data.templates || [];
      console.log(`✅ Successfully retrieved ${templates.length} templates`);
      
      // Print first few templates for reference
      if (templates.length > 0) {
        console.log('\n   Available templates:');
        templates.slice(0, 3).forEach(template => {
          console.log(`   - ${template.elementName} (${template.status})`);
        });
        
        if (templates.length > 3) {
          console.log(`   ... and ${templates.length - 3} more`);
        }
        
        // Return the first approved template for testing
        const approvedTemplate = templates.find(t => t.status === 'APPROVED');
        if (approvedTemplate) {
          return approvedTemplate.elementName;
        }
      }
      
      return null;
    } else {
      console.error(`❌ API returned error: ${response.data.message || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error accessing template API:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }
    return null;
  }
}

// Step 3: Send test message
async function sendTestMessage(templateId) {
  console.log(`\n📱 Sending test message using template: ${templateId || 'welcome_template'}`);
  
  // If no template ID provided, use default
  const useTemplateId = templateId || 'welcome_template';
  
  try {
    const params = [formattedPhone.replace('+', '')]; // User name param
    const allParams = JSON.stringify(params);
    
    const data = qs.stringify({
      'channel': 'whatsapp',
      'source': process.env.GUPSHUP_sourcePhoneNumber,
      'destination': formattedPhone,
      'src.name': process.env.GUPSHUP_APP_ID,
      'template': `{"id":"${useTemplateId}","params":${allParams}}`,
      'callback': "https://gupshup.sppathak1428.workers.dev/"||`${process.env.API_BASE_URL}/whatsapp/webhook`
    });
    
    const config = {
      method: 'post',
      url: 'https://api.gupshup.io/wa/api/v1/template/msg',
      headers: { 
        'Cache-Control': 'no-cache', 
        'Content-Type': 'application/x-www-form-urlencoded', 
        'apikey': process.env.GUPSHUP_API_KEY
      },
      data: data
    };
    
    // Log the curl command for manual testing
    const curlCommand = [
      'curl -X POST',
      `'${config.url}'`,
      ...Object.entries(config.headers).map(([key, value]) => `-H '${key}: ${value}'`),
      `--data-raw '${config.data}'`
    ].join(' \\\n  ');
    
    console.log('\n   Equivalent curl command for manual testing:');
    console.log(curlCommand);
    
    const response = await axios.request(config);
    
    if (response.data && response.data.status === 'submitted') {
      console.log('✅ Message submitted successfully');
      console.log(`   Message ID: ${response.data.messageId}`);
      return response.data.messageId;
    } else {
      console.error('❌ Error submitting message:', response.data);
      return null;
    }
  } catch (error) {
    console.error('❌ Error sending test message:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }
    return null;
  }
}

// Step 4: Setup temporary webhook listener
function setupWebhookListener() {
  console.log('\n👂 Setting up temporary webhook listener...');
  
  const app = express();
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  
  app.post('/whatsapp/webhook', (req, res) => {
    console.log('\n📨 Received webhook event:');
    console.log(JSON.stringify(req.body, null, 2));
    
    // Extract important information
    if (req.body.type === 'message-event') {
      const messageEvent = req.body.payload;
      console.log(`   Event type: ${messageEvent.type}`);
      console.log(`   Message ID: ${messageEvent.id}`);
      console.log(`   Timestamp: ${new Date().toISOString()}`);
    }
    
    res.status(200).json({ success: true });
  });
  
  const port = 9090;
  app.listen(port, () => {
    console.log(`✅ Webhook listener started on port ${port}`);
    console.log('   You will need to use ngrok to expose this port to the internet');
    console.log('   Run: ngrok http 9090');
    console.log('   Then update your API_BASE_URL in .env with the ngrok URL');
  });
  
  return app;
}

// Run the tests
async function runTests() {
  if (!checkEnvironment()) {
    return;
  }
  
  // Test template access
  const templateId = await testTemplateAccess();
  
  // Send test message
  const messageId = await sendTestMessage(templateId);
  
  if (messageId) {
    // Setup webhook listener
    const app = setupWebhookListener();
    
    console.log('\n🔍 Diagnostics complete!');
    console.log('   1. Message has been sent successfully');
    console.log('   2. Check your WhatsApp to see if the message is delivered');
    console.log('   3. Once delivered, webhook events should appear in the console');
    console.log('   4. If no webhook events are received, check your API_BASE_URL setting');
    console.log('\n   Press Ctrl+C to exit when done testing');
  } else {
    console.log('\n❌ Test failed. Please check the logs above for details.');
  }
}

runTests().catch(error => {
  console.error('Unexpected error:', error);
}); 