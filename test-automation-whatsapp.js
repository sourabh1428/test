/**
 * WhatsApp Automation Test Script
 * 
 * This script bypasses the automation layer and directly tests WhatsApp message sending
 * with the exact same payload that would be used in automation.
 * 
 * Run with: node test-automation-whatsapp.js
 */

const axios = require('axios');
require('dotenv').config();

// Configuration
const PORT = process.env.PORT || 8080;
const PHONE_NUMBER = '+918839143395'; // Replace with your test phone number
const API_KEY = '123'; // The API key from your curl command
const TEMPLATE_ID = '27c036bd-2390-4b7c-ab5f-436db569ca8c'; // From your curl command

async function main() {
  try {
    console.log('🔍 Testing WhatsApp message sending via direct API call');
    console.log(`Using template ID: ${TEMPLATE_ID}`);
    console.log(`Sending to: ${PHONE_NUMBER}`);
    
    // Prepare the payload - matching exactly what's in your curl command
    const payload = {
      templateID: TEMPLATE_ID,
      destinationPhone: PHONE_NUMBER,
      params: ["Sourabh Pathak", 26.314, "Mens Casual Premium Slim Fit T-Shirts ", "Marketme"],
      type: "text",
      fileLink: "",
      cta_url: true,
      ctaUrlText: "View Receipt",
      ctaUrl: "http://localhost:5174/receipts/receipt-1745321807615"
    };
    
    console.log('\nSending payload:', JSON.stringify(payload, null, 2));
    
    // Make the direct API call to the WhatsApp endpoint
    const url = `http://localhost:${PORT}/whatsapp/sendWhatsappTemplateMessage`;
    console.log(`\nCalling API at: ${url}`);
    
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
    
    console.log('\n✅ API call successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    // Now try to execute the actual automation
    console.log('\n\n🔍 Testing automation execution');
    
    const automationId = '680772c61cdb6553c56a5f6f'; // From your curl command
    const automationPayload = {
      skipActualSend: false,
      phoneNumber: PHONE_NUMBER
    };
    
    console.log(`Executing automation: ${automationId}`);
    console.log('Automation payload:', JSON.stringify(automationPayload, null, 2));
    
    // Get token from .env or use the one from the curl command
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2N2FlNjFjMmZlODZmZGUyMDk3NWRhYTgiLCJlbWFpbCI6InNwcGF0aGFrMTQyOEBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4iLCJhcGlLZXkiOiIxMjMiLCJkYk5hbWUiOiJ0ZXN0X2RiIiwic3RvcmVOYW1lIjoiRWFzaWJpbGwiLCJpYXQiOjE3NDUzMjExNjgsImV4cCI6MTc0NTMyNDc2OH0.-TIUByP1omeR-JSnliHp7gyZLUOvhY7z4WR5fVAcTaI';
    
    const automationResponse = await axios.post(
      `http://localhost:${PORT}/automation/${automationId}/execute`,
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
    
    console.log('\n🎉 Both tests completed successfully! Check your WhatsApp for messages.');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

main().catch(console.error); 