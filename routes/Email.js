const {Resend}=require('resend');
const express = require('express');
const router = express.Router();

const resend = new Resend('re_PiBtapnz_9noZZ3PifbaxYT8dfVkkDDF5');

//   Function to send the email
  const { MongoClient, ServerApiVersion , ObjectId } = require('mongodb');
  // MongoDB connection
  require('dotenv').config()
  
  
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  
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
  
  

  
  // POST /sendEmails endpoint
  router.post("/sendEmails", async (req, res) => {
      const {
          campaignId,
          emailSubject,
          emailHtmlContent,
          senderName,
          recipients, // Assuming this is an array of metadata objects
          fromAddress,
          headers, // Pass the headers from the request
      } = req.body;
  
      // Log the entire request body
      console.log(req.body);
  
      try {
          // Validate recipients
          if (!Array.isArray(recipients) || recipients.length === 0) {
              console.error("Recipients list is invalid or empty.");
              return res.status(400).send("Invalid recipients list");
          }
  
          // Send emails
          await sendBulkEmails(fromAddress, campaignId, emailSubject, emailHtmlContent, senderName, recipients, headers); // Pass headers here
          console.log("Sent emails to all users for campaign " + campaignId);
          res.status(200).send("Emails sent successfully");
      } catch (e) {
          console.log(e);
          res.status(500).send("Internal Server Error");
      }
  });
  
  // Function to send bulk emails
  async function sendBulkEmails(fromAddress, cid, emailSubject, emailHtmlContent, senderName, recipients, headers,mmid) {
      // Create an array of promises for sending emails
    //fromAddress, campaignResponse.id, emailSubject, emailHtmlContent, senderName, recipients, headers

    
      const emailPromises = recipients.map(async (recipient) => {
          const recipientEmail = recipient; // Extract email from recipient metadata // Extract MMID from recipient metadata
          // Extract CID from recipient metadata
            console.log(recipient);
            
          if (!recipientEmail  || !cid) {
              console.error(`Recipient metadata does not contain a valid email, MMID, or CID:`, recipient);
              return; // Skip this recipient if email, MMID, or CID is invalid
          }
  
          try {
              const { data, error } = await resend.emails.send({
                  from: `${senderName}" " <${fromAddress}>`, // Correctly formatted from address
                  to: [recipientEmail], // Use the extracted email
                  subject: `${emailSubject}`, // Use the provided subject
                  html: `${emailHtmlContent}`, // Use the provided HTML content
                  headers: {
                      'MMID': `${mmid}`, // Attach custom MMID header
                      'CID': `${cid}`, // Attach custom CID headerw1
                  },
              });

           


  
              // Log the response
              if (error) {
                  console.error(`Error sending email to ${recipientEmail}:`, error);
              } else {
                  console.log(`Email sent successfully to ${recipientEmail} with MMID ${mmid}:`, data);
              }
          } catch (err) {
              console.error(`An unexpected error occurred while sending email to ${recipientEmail}:`, err);
          }
      });
  
      // Wait for all email promises to resolve
      await Promise.all(emailPromises);
      ;
      
  }
  

  router.post("/analytics",async (cid)=>{

    try{
        let allcampaigns=await client.db('test_db').collection("Campaign_analytics");
    
        let data=await allcampaigns.find({}).toArray();
    
        res.send(data)
       }catch(error){
        console.log(error);
       }


  })

  async function postCampaign(campaignData){

    console.log(campaignData);
    //type
// "Event"
// event
// "viewedPage"
// description
// "123"
// name
// "dsa"

        try {
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
                    createdAt: campaignData.createdAt // Optional: Include creation time in the segment
                });
            }
    
            return campaignData.segment_id;
        } catch (e) {
            console.log("Error:", e);
            res.status(500).json({ "message": "Error adding campaign" });
        }

  }

  router.post("/createAndSendEmail", async (req, res) => {
    const {
        campaignData,
        emailSubject,
        emailHtmlContent,
        senderName,
        recipients,
        fromAddress,
        headers,
        name,
        description
    } = req.body;
 
    try {
        const campaignResponse = await postCampaign(req.body); // Ensure this function handles creation correctly
        console.log("Campaign created successfully:", campaignResponse);
        console.log(campaignResponse);
        
        await sendBulkEmails(fromAddress, campaignResponse, emailSubject, emailHtmlContent, senderName, recipients, headers,1223);
        console.log("Emails sent successfully for campaign " + campaignResponse);

        res.status(200).json({
            message: 'Campaign created and emails sent successfully.',
            campaign: campaignResponse,
        });
    } catch (error) {
        console.error("Error in createAndSendEmail:", error);
        res.status(500).json({ message: 'Failed to create campaign and send emails.', error: error.message });
    }
});



// async function test()
// {
//     const mmid=123;
//    try{ const { data, error } = await resend.emails.send({
//         from: `hue <comms@comms.marketme.site>`, // Correctly formatted from address
//         to: ["rahul.dsu@gmail.com"], // Use the extracted email
//         subject: "emailSubject", // Use the provided subject
//         html: "<h1>hello<h1>", // Use the provided HTML content
//         headers: {
//             'MMID': `${mmid}`, // Attach custom MMID header
//             'CID': "123", // Attach custom CID header
//         },
//     });
//     console.log(data);
//     if(error){
//         console.log(error);
        
//     }
// }
// catch(err){
//     console.log(err);
    
// }
// }

// test();

  module.exports = router;
  