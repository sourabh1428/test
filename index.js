// index.js

const express = require('express');
const app = express();
const port = 3000;

// Middleware to parse JSON request body
app.use(express.json());

// Simple GET route
app.get('/', (req, res) => {
  res.send('Hello, this is a simple API!');
});

app.get('/hue', (req, res) => {
  res.send('hueheuehuehuheuheuheuhuh');
});

app.get('/pue', (req, res) => {
  res.send('piduuuu!!!!!!!!!!');
});
app.get('/jue', (req, res) => {
  res.send('chummmii--------------cahtti----------lauuuaa-------------lathi');
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
