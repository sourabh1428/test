const express = require('express');
const router = express.Router();
const { MongoClient, ServerApiVersion } = require('mongodb');
const { createClient } = require('redis'); // Import from redis package
require('dotenv').config();

// Redis connection
const redisClient = createClient({
    password: process.env.redis_password,
    socket: {
        host: 'redis-16608.c273.us-east-1-2.ec2.redns.redis-cloud.com',
        port: 16608
    }
});

// MongoDB connection
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

// Ensure Redis client connects
async function connectToRedis() {
  try {
    await redisClient.connect();
    console.log("Successfully connected to Redis!");
  } catch (error) {
    console.error("Error connecting to Redis:", error);
  }
}

connectToMongoDB();
connectToRedis();
router.post('/addEvent', async function (req, res) {
    try {
       
        let userEventDone = req.body;
        const eventTime = Math.floor(Date.now() / 1000); // Add creation time in epoch format
        userEventDone.EventTime = eventTime; // Add event time to the userEventDone object
        let id = userEventDone.MMID;

        const eventName = userEventDone.eventName; // Assuming eventName is part of the request body
        const eventEntry = { eventTime, eventName }; // Create an event entry object

        // Fetch existing events from Redis
        let existingEvents = await redisClient.hGet(`userEvents`, id);
        existingEvents = existingEvents ? JSON.parse(existingEvents) : [];

        // Add new event to the existing events array
        existingEvents.push(eventEntry);

        // Store the updated events array in Redis
        await redisClient.hSet(`userEvents`, id, JSON.stringify(existingEvents));

        console.log("Event cached in Redis", eventEntry);

        res.status(201).json({ message: "Event added successfully to redis" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});




router.get('/userEvents', async function (req, res) {
    try {
        const db = client.db('test_db');
        const userEvent = db.collection('userEvent');
        const MMID = req.query.MMID; // Get the MMID from the query parameters
       
        if (!MMID) {
            return res.status(400).send({ error: "MMID is required" });
        }

        const users = await userEvent.find({}).toArray();

        for(let i=0;i<users.length;i++){
            if(users[i].MMID==`${MMID}`){
                console.log(users[i]);
               return  res.status(200).json(users[i].events);
            }
        }

        
       
            return res.status(404).send({ error: "User not found" });
        


    } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Failed to get user events" });
    }
});



router.post('/getEvents', async function (req, res) {
    const event = req.body.eName;
    console.log(event);
    
    const db = client.db('test_db');
    const eventCollection = await db.collection('all_events_done').find({}).toArray();
    

    try {
        // Use filter to get the matching events
        const data = eventCollection.filter(e => e.eventName === event);


        // Send the response with the filtered data
        return res.status(200).json({ data:data});
    } catch (error) {
        console.log("Error in getting events from collection:", error);

        return res.status(500).json({ error: error.message });
    }
});


module.exports = router;