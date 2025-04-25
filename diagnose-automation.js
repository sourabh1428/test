/**
 * Comprehensive Automation Diagnostic Script
 * 
 * This script performs a detailed analysis of the automation system
 * specifically focused on WhatsApp message delivery.
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Configuration from env file
const PORT = process.env.PORT || 8080;
const FRONTEND_PORT = 5174; // The port your frontend is running on
const API_KEY = '123';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2N2FlNjFjMmZlODZmZGUyMDk3NWRhYTgiLCJlbWFpbCI6InNwcGF0aGFrMTQyOEBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4iLCJhcGlLZXkiOiIxMjMiLCJkYk5hbWUiOiJ0ZXN0X2RiIiwic3RvcmVOYW1lIjoiRWFzaWJpbGwiLCJpYXQiOjE3NDUzMjExNjgsImV4cCI6MTc0NTMyNDc2OH0.-TIUByP1omeR-JSnliHp7gyZLUOvhY7z4WR5fVAcTaI';
const PHONE_NUMBER = '+918839143395';
const AUTOMATION_ID = '680772c61cdb6553c56a5f6f';

// Diagnostic steps
async function main() {
  console.log('🔍 Starting comprehensive automation diagnostic\n');
  
  // Step 1: Verify environment configuration
  console.log('Step 1: Verifying environment configuration');
  console.log(`Backend port: ${PORT}`);
  console.log(`Frontend port: ${FRONTEND_PORT}`);
  console.log(`API key: ${API_KEY}`);
  console.log(`Phone number: ${PHONE_NUMBER}`);
  console.log(`Automation ID: ${AUTOMATION_ID}`);
  
  // Check if required environment variables are set
  const requiredVars = [
    'GUPSHUP_API_KEY',
    'GUPSHUP_APP_ID',
    'GUPSHUP_sourcePhoneNumber',
    'API_BASE_URL',
    'PORT'
  ];
  
  const missingVars = requiredVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
  }
  
  console.log('✅ Environment configuration looks good\n');
  
  // Step 2: Test direct WhatsApp message sending (Backend Port)
  console.log('Step 2: Testing direct WhatsApp message sending via Backend port');
  try {
    const directResponse = await sendDirectWhatsAppMessage(PORT);
    console.log('✅ Direct message API call successful via Backend port');
  } catch (error) {
    console.error('❌ Direct message API call failed via Backend port:', error.message);
    if (error.response) logErrorResponse(error.response);
  }
  
  // Step 3: Test direct WhatsApp message sending (Frontend Port)
  console.log('\nStep 3: Testing direct WhatsApp message sending via Frontend port');
  try {
    const directFrontendResponse = await sendDirectWhatsAppMessage(FRONTEND_PORT);
    console.log('✅ Direct message API call successful via Frontend port');
  } catch (error) {
    console.error('❌ Direct message API call failed via Frontend port:', error.message);
    if (error.response) logErrorResponse(error.response);
  }
  
  // Step 4: Test automation execution (Backend Port)
  console.log('\nStep 4: Testing automation execution via Backend port');
  try {
    const automationResponse = await executeAutomation(PORT);
    console.log('✅ Automation execution successful via Backend port');
  } catch (error) {
    console.error('❌ Automation execution failed via Backend port:', error.message);
    if (error.response) logErrorResponse(error.response);
  }
  
  // Step 5: Test automation execution (Frontend Port)
  console.log('\nStep 5: Testing automation execution via Frontend port');
  try {
    const automationFrontendResponse = await executeAutomation(FRONTEND_PORT);
    console.log('✅ Automation execution successful via Frontend port');
  } catch (error) {
    console.error('❌ Automation execution failed via Frontend port:', error.message);
    if (error.response) logErrorResponse(error.response);
  }
  
  // Step 6: Check automation in database
  console.log('\nStep 6: Checking automation in database');
  try {
    await checkAutomationInDatabase();
    console.log('✅ Database check completed');
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  }
  
  console.log('\n🎯 Diagnostic complete. Please check your WhatsApp for messages.');
}

// Helper function to send direct WhatsApp message
async function sendDirectWhatsAppMessage(port) {
  const url = `http://localhost:${port}/whatsapp/sendWhatsappTemplateMessage`;
  console.log(`Calling WhatsApp API at: ${url}`);
  
  const payload = {
    templateID: "27c036bd-2390-4b7c-ab5f-436db569ca8c",
    destinationPhone: PHONE_NUMBER,
    params: ["Sourabh Pathak", 26.314, "Mens Casual Premium Slim Fit T-Shirts ", "Marketme"],
    type: "text",
    fileLink: "",
    cta_url: true,
    ctaUrlText: "View Receipt",
    ctaUrl: "http://localhost:5174/receipts/receipt-1745321807615"
  };
  
  const response = await axios.post(
    url,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      }
    }
  );
  
  console.log('Response:', JSON.stringify(response.data, null, 2));
  return response.data;
}

// Helper function to execute automation
async function executeAutomation(port) {
  const url = `http://localhost:${port}/automation/${AUTOMATION_ID}/execute`;
  console.log(`Calling automation API at: ${url}`);
  
  const payload = {
    skipActualSend: false,
    phoneNumber: PHONE_NUMBER
  };
  
  const response = await axios.post(
    url,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
        'x-api-key': API_KEY
      }
    }
  );
  
  console.log('Response:', JSON.stringify(response.data, null, 2));
  return response.data;
}

// Helper function to check automation in database
async function checkAutomationInDatabase() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error('MongoDB URI not found in environment variables');
  }
  
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  
  console.log('Looking up automation in database...');
  const Automation = mongoose.model('Automation', new mongoose.Schema({}, { strict: false }));
  const automation = await Automation.findById(AUTOMATION_ID);
  
  if (!automation) {
    throw new Error(`Automation with ID ${AUTOMATION_ID} not found in database`);
  }
  
  console.log('Automation found:');
  console.log('- Name:', automation.name);
  console.log('- Active:', automation.active);
  console.log('- Actions:', automation.actions.length);
  
  // Check WhatsApp actions
  const whatsappActions = automation.actions.filter(a => a.type === 'send_whatsapp');
  console.log('- WhatsApp actions:', whatsappActions.length);
  
  if (whatsappActions.length > 0) {
    console.log('  Details of first WhatsApp action:');
    console.log('  - Template ID:', whatsappActions[0].templateId);
    console.log('  - Params:', JSON.stringify(whatsappActions[0].params || {}));
  }
  
  // Check execution history
  const ExecutionHistory = mongoose.model('ExecutionHistory', new mongoose.Schema({}, { strict: false }));
  const executions = await ExecutionHistory.find({ automationId: AUTOMATION_ID }).sort({ timestamp: -1 }).limit(5);
  
  console.log('Recent execution history:');
  executions.forEach((exec, i) => {
    console.log(`Execution ${i+1}:`);
    console.log('- Status:', exec.status);
    console.log('- Timestamp:', exec.timestamp);
    if (exec.error) console.log('- Error:', exec.error);
  });
  
  await mongoose.connection.close();
}

// Helper function to log error responses
function logErrorResponse(response) {
  console.error('Status:', response.status);
  console.error('Headers:', JSON.stringify(response.headers, null, 2));
  console.error('Data:', JSON.stringify(response.data, null, 2));
}

// Run the main function
main()
  .then(() => {
    console.log('Diagnostic completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  }); 