// apiKeyMiddleware.js
const { MongoClient } = require('mongodb');
require('dotenv').config()
// Replace with your MongoDB connection URI

const uri = process.env.MONGODB_URI;
// Connect to MongoDB

const client = new MongoClient(uri);
client.connect();

const db = client.db('test_db');
const apiKeysCollection = db.collection('KEYS');

const validateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) return res.status(401).send('API key missing');

  const key = await apiKeysCollection.findOne({ key: apiKey });

  if (!key) return res.status(403).send('Forbidden');

  next();
};

module.exports = validateApiKey;
