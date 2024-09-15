const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../Modal.js');

const { MongoClient, ServerApiVersion , ObjectId } = require('mongodb');



require('dotenv').config()


const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
const JWT_SECRET = process.env.JWT_SECRET || '123';

// Ensure the MongoDB client connects before starting the server
async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB! + auth");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

connectToMongoDB();

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  console.log('Sign-Up Request:', { username, email });

  try {
    // Connect to the database
    await client.connect();
    const db = client.db('test_db');
    console.log('Connected to database');

    // Check if user already exists
    let existingUser = await db.collection('Authentication').findOne({ email });
    console.log('Existing User:', existingUser);

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
    res.status(201).json({  success: true,token });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  } finally {
    // Close the database connection
    await client.close();
    console.log('Database connection closed');
  }
});
  
 

  router.post('/signin', async (req, res) => {
    const { email, password } = req.body;
    console.log('Sign-In Request:', { email });
  
    try {
      // Connect to the database
      await client.connect();
      const db = client.db('test_db');
      console.log('Connected to database');
  
      // Find the user
      const user = await db.collection('Authentication').findOne({ email });
      console.log('User found:', user);
  
      // Check if user exists
      if (!user) {
        console.log('User does not exist');
        return res.status(400).json({ msg: 'User does not exist' });
      }
  
      // Check if user is verified, unless the role is admin
      if (user.role !== 'admin' && !user.isVerified) {
        console.log('User is not verified');
        return res.status(400).json({ msg: 'User is not verified' });
      }
  
      // Check if password matches
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.log('Invalid credentials');
        return res.status(400).json({ msg: 'Invalid credentials' });
      }
  
      // Generate JWT token
      const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
      console.log('Token generated:', token);
  
      res.json({ token });
    } catch (err) {
      console.error('Error:', err);
      res.status(500).json({ error: 'Something went wrong' });
    } finally {
      // Close the database connection
      await client.close();
      console.log('Database connection closed');
    }
  });

  module.exports = router;
