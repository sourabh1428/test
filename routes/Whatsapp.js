const axios = require('axios');

// Your Gupshup API credentials
const API_KEY = 'ypc2olcnujf1nvss6slt7fyexe9cwpkb';
const WHATSAPP_SOURCE_NUMBER = '917834811114'; // Your registered WhatsApp number
const CUSTOMER_WHATSAPP_NUMBER = '918839143395'; // Customer's WhatsApp number






const data = {
    channel: 'whatsapp',
    source: WHATSAPP_SOURCE_NUMBER,
    destination: CUSTOMER_WHATSAPP_NUMBER,
    message: {
      type: 'text',
      text: 'Hello! Your order has been confirmed.'
    }
  };
  
  // Send the POST request using JSON payload
  axios.post('https://api.gupshup.io/sm/api/v1/msg', data, {
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY
    }
  })
    .then(response => {
      console.log('Message sent successfully:', response.data);
    })
    .catch(error => {
      console.error('Error sending message:', error.response.data);
    });