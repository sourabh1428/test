const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../Modal.js');
const { MongoClient, ObjectId } = require('mongodb');

let uri =process.env.MONGODB_URI;



const client = new MongoClient(uri);
const JWT_SECRET = process.env.JWT_SECRET || '123';

// Connect to MongoDB once when the application starts
async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1); // Exit the application if MongoDB connection fails
  }
}

connectToMongoDB();

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  console.log('Sign-Up Request:', { username, email });

  try {
    const db = client.db('test_db');

    // Check if user already exists
    let existingUser = await db.collection('Authentication').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user with additional fields
    const newUser = {
      username,
      email,
      password: hashedPassword,
      isVerified: false, // Set default value
      role: 'member' // Set default role
    };

    // Insert new user into the database
    const result = await db.collection('Authentication').insertOne(newUser);

    // Generate JWT token
    const token = jwt.sign({ id: result.insertedId }, JWT_SECRET, { expiresIn: '1h' });
    console.log('Token generated:', token);

    // Send response with token
    res.status(201).json({ success: true, token });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  console.log('Sign-In Request:', { email });

  try {
    const db = client.db('test_db');

    // Find the user
    const user = await db.collection('Authentication').findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'User does not exist' });
    }

    // Check if user is verified, unless the role is admin
    if (user.role !== 'admin' && !user.isVerified) {
      return res.status(400).json({ msg: 'User is not verified' });
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
    console.log('Token generated:', token);

    res.json({ token });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Clean up on application exitSsss
process.on('SIGINT', async () => {
  await client.close();
  console.log('Database connection closed');
  process.exit(0);
});

module.exports = router;
