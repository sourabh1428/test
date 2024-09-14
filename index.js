// index.js

const express = require('express');
const app = express();

require('dotenv').config();
// Middleware to parse JSON request body
app.use(express.json());
const port = process.env.PORT || 3000;
// Simple GET route
app.get('/', (req, res) => {
  res.send(`made by ${process.env.NAME} , !!!!`)
});

app.get('/khushi', (req, res) => {
  res.send('kucchhhiiiiiiiiiiiiiiiiiiiii');
});

app.get('/pue', (req, res) => {
  res.send('puep222uepuepuepuepuepuep123uepuepuep1213123213');
});
app.get('/jue', (req, res) => {
  res.send('123');
});

// Sample POST route
app.post('/data', (req, res) => {
  const { name, age } = req.body;
  res.send(`Received name: ${name}, age: ${age}`);
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
