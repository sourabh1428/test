const axios = require('axios');
require('dotenv').config();

// Configuration - UPDATED WITH NEW AUTOMATION ID
const PORT = process.env.PORT || 8080;
const PHONE_NUMBER = '+918839143395';
const API_KEY = '123';
const AUTOMATION_ID = '6807875b347ae30575e94038'; // The new automation ID from curl

async function main() {
  try {
    console.log('🔍 Testing automation execution with explicit parameters');
    console.log(`Using automation ID: ${AUTOMATION_ID}`);
    console.log(`Sending to: ${PHONE_NUMBER}`);
    
    // Add explicit parameters to match template requirements
    const automationPayload = {
      skipActualSend: false,
      phoneNumber: PHONE_NUMBER,
      // Explicitly format parameters as strings in the exact format expected
      params: {
        "1": "Value for parameter 1", 
        "2": "Value for parameter 2"
      }
    };
    
    console.log('Automation payload:', JSON.stringify(automationPayload, null, 2));
    
    // Your token from the curl command
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2N2FlNjFjMmZlODZmZGUyMDk3NWRhYTgiLCJlbWFpbCI6InNwcGF0aGFrMTQyOEBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4iLCJhcGlLZXkiOiIxMjMiLCJkYk5hbWUiOiJ0ZXN0X2RiIiwic3RvcmVOYW1lIjoiRWFzaWJpbGwiLCJpYXQiOjE3NDUzMzYwNDYsImV4cCI6MTc0NTMzOTY0Nn0.ohemLkYPmcg8TBAI6iPiiY3SEi-ePG4APhjx2T_BIJM';
    
    console.log(`Making request to: http://localhost:${PORT}/automation/${AUTOMATION_ID}/execute`);

    try {
      const automationResponse = await axios.post(
        `http://localhost:${PORT}/automation/${AUTOMATION_ID}/execute`,
        automationPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-api-key': API_KEY
          }
        }
      );
      
      console.log('\n✅ Automation execution successful!');
      console.log('Response:', JSON.stringify(automationResponse.data, null, 2));
    } catch (error) {
      console.error('\n❌ Error with automation endpoint:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.error('No response received. Is the server running?');
      } else {
        console.error('Error details:', error);
      }
      throw error;
    }
    
    // Also try the frontend endpoint
    console.log('\n🔍 Trying frontend endpoint as a backup');
    
    try {
      const frontendResponse = await axios.post(
        `http://localhost:8080/automation/${AUTOMATION_ID}/execute`,
        automationPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-api-key': API_KEY
          }
        }
      );
      
      console.log('\n✅ Frontend execution successful!');
      console.log('Response:', JSON.stringify(frontendResponse.data, null, 2));
    } catch (error) {
      console.error('\n❌ Error with frontend endpoint:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.error('No response received. Is the frontend running?');
      } else {
        console.error('Error details:', error);
      }
    }
    
    console.log('\n🎉 Test completed!');
    
  } catch (error) {
    console.error('\n❌ Main error:', error.message);
  }
}

console.log('Starting test...');
main().then(() => console.log('Test completed.')).catch(e => console.error('Fatal error:', e)); 