const { Resend } = require('resend');
const express = require('express');
const router = express.Router();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const resend = new Resend('re_PiBtapnz_9noZZ3PifbaxYT8dfVkkDDF5');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

// Async helper function to send a single email
async function sendSingleEmail(params) {
    try {
        const { email, fromAddress, senderName, emailSubject, emailHtmlContent, cid, headers ,toAddress} = params;
   
        
        const { data, error } = await resend.emails.send({
            from: `${senderName} <${fromAddress}>`,
            to: [email],
            subject: emailSubject,
            html: emailHtmlContent,
            headers: {
                'CID': cid,
                ...headers
            },
            replyTo:"sppathak1428@gmail.com"
        });

        if (error) {
            console.error(`Error sending email to ${email}:`, error);
            return { email, success: false, error };
        }

        return { email, success: true, data };
    } catch (err) {
        console.error(`Unexpected error sending email to ${params.email}:`, err);
        return { email: params.email, success: false, error: err };
    }
}

// Optimized bulk email sending with concurrency
async function sendBulkEmails(fromAddress, cid, emailSubject, emailHtmlContent, senderName, recipients, headers, recipientType, recipientData, toAddress) {
    console.log("-----------sending bulk emails-----------------");

    try {
        await client.connect();

        let emailList = recipients;

        // If recipient type is 'bunch', fetch emails from the database
        if (recipientType === "bunch") {
            const result = await client.db("test_db").collection("Users")
                .find({ bunchID: recipientData.bunchID })
                .toArray();

            emailList = [...new Set(result.filter(user => user.email).map(user => user.email))];
        }

        // Remove already sent emails
        const alreadySentEmails = await client.db("test_db").collection("AlreadySent")
            .find({ email: { $in: emailList } })
            .toArray();
        const alreadySentSet = new Set(alreadySentEmails.map(item => item.email));

        const filteredEmails = emailList.filter(email => !alreadySentSet.has(email));

        console.log(`Preparing to send emails to ${filteredEmails.length} recipients`);

        // Concurrent email sending with rate limiting
        const emailParams = filteredEmails.map(email => ({
            email,
            fromAddress,
            senderName,
            emailSubject,
            emailHtmlContent,
            cid,
            headers,
            toAddress,
        }));

        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        const results = [];
        for (let i = 0; i < emailParams.length; i++) {
            const emailParam = emailParams[i];

            try {
                const result = await sendSingleEmail(emailParam);

                // Record successful sends in AlreadySent collection
                if (result.success) {
                    await client.db("test_db").collection("AlreadySent")
                        .insertOne({ email: emailParam.email });
                }

                results.push(result);

            } catch (error) {
                console.error(`Error sending email to ${emailParam.email}:`, error);
                results.push({ email: emailParam.email, success: false, error });
            }

            // Enforce rate limit (2 requests per second)
            if ((i + 1) % 2 === 0) {
                await delay(1000); // Wait 1 second after every 2 emails
            }
        }

        // Log summary
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        console.log(`Bulk email process completed.
            Total attempts: ${results.length},
            Successful: ${successCount},
            Failed: ${failureCount}`);

        return results;
    } catch (err) {
        console.error("Error in bulk email sending:", err);
        throw err;
    }
}

// Existing route handlers with minor modifications
router.post("/sendEmails", async (req, res) => {
    const {
        campaignId,
        emailSubject,
        emailHtmlContent,
        senderName,
        recipientType,
        recipientData,
        recipients,
        fromAddress,
        headers,
        toAddress
    } = req.body;

    try {
        await sendBulkEmails(
            fromAddress,
            campaignId,
            emailSubject,
            emailHtmlContent,
            senderName,
            recipients || [],
            headers,
            recipientType,
            recipientData || {},
            toAddress
        );

        res.status(200).send("Emails sent successfully");
    } catch (error) {
        console.error("Email sending error:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post("/createAndSendEmail", async (req, res) => {
    const {
        campaignData,
        emailSubject,
        emailHtmlContent,
        senderName,
        recipientType,
        recipientData,
        recipients,
        fromAddress,
        headers,
        toAddress
    } = req.body;

    try {
        const campaignResponse = await postCampaign(req.body);
        
        await sendBulkEmails(
            fromAddress, 
            campaignResponse, 
            emailSubject, 
            emailHtmlContent, 
            senderName, 
            recipients || [], 
            headers, 
            recipientType, 
            recipientData || {},
            toAddress
        );

        res.status(200).json({
            message: 'Campaign created and emails sent successfully.',
            campaign: campaignResponse,
        });
    } catch (error) {
        console.error("Error in createAndSendEmail:", error);
        res.status(500).json({ 
            message: 'Failed to create campaign and send emails.', 
            error: error.message 
        });
    }
});

// Existing postCampaign function (unchanged)
async function postCampaign(campaignData) {
    try {
        const objId = new ObjectId();
        campaignData._id = objId;
        campaignData.segment_id = objId.toString();
        campaignData.createdAt = Date.now();

        const campaign = await client.db('test_db').collection("campaigns").findOne({ _id: campaignData._id });
        if (campaign) {
            throw new Error("Campaign is already registered");
        }

        const campaignType = campaignData.type;

        await client.db('test_db').collection("campaigns").insertOne(campaignData);

        if (campaignType === "Event") {
            await client.db('test_db').collection("segments").insertOne({
                segment_id: campaignData.segment_id,
                event: campaignData.event,
                createdAt: campaignData.createdAt
            });
        }

        return campaignData.segment_id;
    } catch (e) {
        console.error("Error in postCampaign:", e);
        throw e;
    }
}

module.exports = router;