// index.js

const express = require('express');
const app = express();

require('dotenv').config();
// Middleware to parse JSON request body
app.use(express.json());
const port = process.env.PORT || 3000;
// Simple GET route
app.get('/', (req, res) => {
  res.send(`Hello, this is a simple API! by ${process.env.NAME} , !!!!`)
});

app.get('/hue', (req, res) => {
  res.send('123hueheuehuehuheuheuheuhuh');
});

app.get('/pue', (req, res) => {
  res.send('puepuepuepuepuepuepuepuepuepuep1');
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
