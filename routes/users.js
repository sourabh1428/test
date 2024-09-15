const express = require('express');
const router = express.Router();
const { generateToken, hashPassword, comparePassword } = require('../auth/jwtutils');
const { MongoClient, ServerApiVersion , ObjectId } = require('mongodb');
// MongoDB connection
require('dotenv').config()


const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Ensure the MongoDB client connects before starting the server
async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

connectToMongoDB();

// Example route to fetch users
router.get('/users', async (req, res) => {
  try {
    const db = client.db('test_db');
    
    const collection = db.collection('Users');
    const result = await collection.find({}).limit(100).toArray();
    let ans=[];
    for(let i=0;i<result.length;i++){
        ans.push(result[i]);
    }
    console.log("Got it!");
    res.json(ans);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});


router.post('/postUser', async (req, res) => {
    try {
             const userData = req.body;
            userData.createdAt = Math.floor(Date.now() / 1000); // Add creation time in epoch format

             const objectId = new ObjectId(); // Create a new ObjectId

            userData._id = objectId; // Set the ObjectId to the _id field
            userData.Mid = objectId.toString(); // Set the ObjectId to the id field as a string
        const db = client.db('test_db');
        const collection = db.collection('Users');
        console.log(userData);

        const result = await collection.insertOne(userData);
        console.log("User inserted:", result.insertedId);
        res.status(201).json({ message: "User added successfully", userId: result.insertedId });
    
      } catch (error) {
        console.error("Error posting user:", error);
        res.status(500).json({ error: "Failed to post user" });
      }
});


router.post('/setUserAttribute',async function(req, res) {
  const { MMID, attributeName, attributeValue }=req.params;

  try{

    const db = client.db('test_db');
    const collection = db.collection('Users');
    collection.findOne({MMID:MMID});
    await collection.updateOne(
      { MMID: MMID },
      { $set: { [attributeName]: attributeValue } }
    );

  }catch(error){
    console.log("Error posting user:", error);
    res.status(500).json({ error: "Failed to post user" });
  }


})





module.exports = router;
