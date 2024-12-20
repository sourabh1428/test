const express = require('express');
const router = express.Router();

const { MongoClient, ServerApiVersion , ObjectId } = require('mongodb');
// MongoDB connectionssssds1ss
require('dotenv').config()


const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

// Ensure the MongoDB client connects before starting the serverdeq
async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

connectToMongoDB();


router.get('/getAllCampaign',async (req,res)=>{
   try{
    let allcampaigns=await client.db('test_db').collection("campaigns");

    let data=await allcampaigns.find({}).toArray();

    res.send(data)
   }catch(error){
    console.log(error);
   }
})
router.post('/getParticularCampaign',async (req,res)=>{
    try{
        let cid=req.body.cid;
     let allcampaigns=await client.db('test_db').collection("campaigns");
    const cdata=await allcampaigns.findOne({segment_id: cid});
    
     
     console.log(cdata);
     res.send(cdata)
    }catch(error){
     console.log(error);
    }
 })

 
 

 router.post('/postCampaign', async (req, res) => {
    try {
        //  channel , type ,  event || attribute , value ,  channel


        const campaignData = req.body;

        // Generate a new ObjectId for _id and segment_id
        const objId = new ObjectId();
        campaignData._id = objId;

        campaignData.segment_id = objId.toString(); // Convert ObjectId to string for segment_id
       
        // Add creation timestamp in epoch format
        campaignData.createdAt = Date.now(); // Epoch time in milliseconds

        // Check if the campaign already exists
        const campaign = await client.db('test_db').collection("campaigns").findOne({ _id: campaignData._id });
        if (campaign) {
            res.status(400).send("Campaign is already registered");
            return;
        }

        const campaignType = campaignData.type;

        // Insert the new campaign
        await client.db('test_db').collection("campaigns").insertOne(campaignData);

        // Insert the segment with a reference to the campaign
        if (campaignType === "Event") {
            await client.db('test_db').collection("segments").insertOne({
                segment_id: campaignData.segment_id,
                event: campaignData.event, 
                value:    campaignData.value,
                channel: campaignData.channel,
                createdAt: campaignData.createdAt // Optional: Include creation time in the segment
            });
        }else{
            await client.db('test_db').collection("segments").insertOne({
                segment_id: campaignData.segment_id,
                attribute: campaignData.attribute,
                value: campaignData.value,
                channel: campaignData.channel,
                createdAt: campaignData.createdAt // Optional: Include creation time in the segment
            });
        }

        res.json(campaignData.segment_id);
    } catch (e) {
        console.log("Error:", e);
        res.status(500).json({ "message": "Error adding campaign" });
    }
});
router.post('/UIS/:segment_id', async (req, res) => {
    try {
        const segment_id = req.params.segment_id;

        // Search for segment info
        const segment_info = await client.db('test_db').collection("campaigns").findOne({ segment_id: segment_id });

        if (!segment_info) {
            return res.status(404).json({ message: "Segment not found" });
        }

        let users = [];

        // Check if the segment is event-based or attribute-based
        if (segment_info.event) {
            // Fetch all user events
            const audience = await client.db('test_db').collection("userEvent").find({}).toArray();

            // Iterate through each user's events and match with segment's event
            for (const user of audience) {
                const events = user.events;

                // Check if any event matches the segment event
                if (events.some(event => event.eventName === segment_info.value)) {
                    users.push(user.MMID);  // Add user to the users array if event matches
                }
            }

        } else {
            // Segment is attribute-based
            const typeOfAttribute = segment_info.attribute;
            const valueOfAttribute = segment_info.value;

            // Use MongoDB query to directly find users based on attribute type and value
            users = await client.db('test_db').collection("Users")
                .find({ [typeOfAttribute]: valueOfAttribute })
                .map(user => user.MMID)  // Directly extract MMID
                .toArray();
        }

        // Update the segment with the list of matched users
        try {
            const updateResult = await client.db('test_db').collection("segments").updateOne(
                { segment_id: segment_info.segment_id },  // Match the segment by ID
                { $set: { users: users } }               // Set the users field with the matched users
            );

            if (updateResult.acknowledged) {
                res.send(users);  // Send back the list of users
            } else {
                res.status(500).json({ message: "Failed to update segment info with users." });
            }

        } catch (e) {
            console.error(e);
            res.status(500).json({ message: "Error updating segment with users." });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching UIS" });
    }
});


router.get('/getCampaignsForUser', async function(req, res) {
    //http://localhost:3000/campaigns//getCampaignsForUser?MMID=1223
    
    try {
        const userId = req.query.MMID;
        console.log(userId);

        // Fetch all segments
        const segments = await client.db('test_db').collection("segments").find({}).toArray();
        
        let campaignsForUserIds = [];

        // Iterate over each segment
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            
            // Check if userId exists in the segment's users array
            if (segment.users && segment.users.length>0 && segment.users.includes(userId)) {
                campaignsForUserIds.push(segment.segment_id);
            }
        }

        console.log(campaignsForUserIds);
        res.send(campaignsForUserIds);

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Failed to get campaigns for user." });
    }
});



router.post('/updateAnalytics', async function(req, res) {
    const cid = req.body.cid;

    try {
        // Find the campaign by segment_id
        const campaign = await client.db('test_db').collection("campaigns").findOne({ segment_id: cid });

        if (campaign) {
            // Check if the analytics object exists
            if (!campaign.analytics) {
                // If analytics doesn't exist, create it with impression set to 1
                campaign.analytics = { impression: 1 };
            } else {
                // If analytics exists, increase the impression count by 1
                if (campaign.analytics.impression) {
                    campaign.analytics.impression += 1;
                } else {
                    // If impression doesn't exist, initialize it to 1
                    campaign.analytics.impression = 1;
                }
            }

            // Update the campaign with the new analytics data
            await client.db('test_db').collection("campaigns").updateOne(
                { segment_id: cid },
                { $set: { analytics: campaign.analytics } }
            );

            // Send the updated campaign data as a response
            return res.status(200).json({ message: "Campaign updated", campaign });
        } else {
            // If the campaign is not found, return a 404 status code
            return res.status(404).json({ message: "Campaign not found" });
        }
    } catch (err) {
        // If there's an error, return a 500 status code with the error message
        return res.status(500).json({ message: "Couldn't update the analytics" });
    }
});


router.delete('/deleteCampaign', async function(req, res) {
    const cid = req.body.cid;

    try {
        // Connect to the database
        await client.connect();
        const db = client.db('test_db');

        // Delete the campaign from the "campaigns" collection
        const campaignDeleteResult = await db.collection("campaigns").deleteOne({ segment_id: cid });

        // Delete the campaign from the "segments" collection
        const segmentDeleteResult = await db.collection("segments").deleteOne({ segment_id: cid });

        // Check if any documents were deleted
        if (campaignDeleteResult.deletedCount === 0 && segmentDeleteResult.deletedCount === 0) {
            return res.status(404).json({ message: "No campaign or segment found with the given ID" });
        }

        // Respond with success if the deletion was successful
        return res.status(200).json({ message: "Campaign and segment deleted successfully" });
    } catch (err) {
        // Handle errors and respond with a 500 status code
        console.error("Error deleting campaign and segment:", err);
        return res.status(500).json({ message: "An error occurred while deleting the campaign and segment" });
    } 
});





module.exports=router;