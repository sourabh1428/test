const express = require('express');
const fs = require('fs');
const app = express();

// Route for tracking pixel
app.get('/track', (req, res) => {
  const email = req.query.email;
  console.log("TRACKING");
  
  // Log the email open
  console.log(`Email opened by: ${email} at ${new Date().toISOString()}`);

  // Return a 1x1 transparent GIF
  const pixel = fs.readFileSync('transparent.gif');
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': pixel.length
  });
  res.end(pixel, 'binary');
});

// Start the server
app.listen(3000, () => {
  console.log('Tracking server is running on port 3000');
});
