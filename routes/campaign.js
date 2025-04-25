const express = require('express');
const router = express.Router();
const {MongoDBNamespace } = require('mongodb');
const { processSegment } = require('../Worker/SegmentProcess');
const { ObjectId } = require('mongodb');
router.get('/getAllCampaign', async (req, res) => {
    try {
        const campaigns = await req.tenantDB.collection("campaigns").find({}).toArray();
        res.json(campaigns);
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        res.status(500).json({ error: 'Failed to retrieve campaigns' });
    }
});

router.post('/getParticularCampaignSegment', async (req, res) => {
    try {
      const { segment_id } = req.body;
      if (!segment_id) {
        return res.status(400).json({ error: 'Segment ID required' });
      }
  
      let segmentObjectId;
      try {
        segmentObjectId = new ObjectId(segment_id);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid segment ID format' });
      }
  
      const data = await req.tenantDB.collection("segments").findOne({ _id: segmentObjectId });
      if (data) {
        res.json(data);
      } else {
        res.status(404).json({ error: 'Segment not found' });
      }
    } catch (error) {
      console.error('Error fetching segment:', error);
      res.status(500).json({ error: 'Failed to retrieve segment' });
    }
  });
  router.post('/getParticularCampaign', async (req, res) => {
    try {
      const { cid } = req.body;
      if (!cid) return res.status(400).json({ error: 'Campaign ID required' });
  
      // Convert cid to an ObjectId
      let campaignId;
      try {
        campaignId = new ObjectId(cid);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid Campaign ID format' });
      }
  
      const campaign = await req.tenantDB.collection("campaigns").findOne({ _id: campaignId });
      if (campaign) {
        res.json(campaign);
      } else {
        res.status(404).json({ error: 'Campaign not found' });
      }
    } catch (error) {
      console.error('Error fetching campaign:', error);
      res.status(500).json({ error: 'Failed to retrieve campaign' });
    }
  });

router.post('/postCampaign', async (req, res) => {
    let session;
    
    try {
        // Input validation
        const campaignData = validateCampaignData(req.body);
        if (!campaignData.success) {
            return res.status(400).json({ 
                error: 'Invalid campaign data', 
                details: campaignData.errors 
            });
        }

        // Ensure tenant DB connection exists
        if (!req.tenantDB?.client) {
            throw new Error('Tenant database connection not available');
        }

        session = req.tenantDB.client.startSession();
        const campaignId = new ObjectId();
        const segmentId = new ObjectId();

        const campaignDoc = {
            _id: campaignId,
            ...campaignData.data,
            segment_id: segmentId,
            createdAt: new Date(),
            status: 'active',
            analytics: { 
                impression: 0,
                delivered: 0,
                failed: 0,
                lastProcessed: null
            }
        };

        const segmentDoc = {
            _id: segmentId,
            type: campaignData.data.type,
            [campaignData.data.type]: campaignData.data[campaignData.data.type],
            value: campaignData.data.value,
            channel: campaignData.data.channel,
            data: campaignData.data.data,
            status: 'active',
            createdAt: new Date(),
            processedUsers: [],
            lastProcessed: null
        };

        // Execute transaction
        await session.withTransaction(async () => {
            const campaignsCollection = req.tenantDB.collection("campaigns");
            const segmentsCollection = req.tenantDB.collection("segments");

            await Promise.all([
                campaignsCollection.insertOne(campaignDoc, { session }),
                segmentsCollection.insertOne(segmentDoc, { session })
            ]);
        });

        // Process one-time campaigns
        if (campaignData.data.oneTime) {
            const tenant = {
                dbName: req.tenantDB.databaseName,
                apiKey: req.headers['x-api-key']
            };

            if (!tenant.apiKey) {
                throw new Error('API key not found in request headers');
            }

            try {
                await processSegment(tenant, segmentId.toString());
                
                // Update campaign status after processing
                await req.tenantDB.collection("campaigns").updateOne(
                    { _id: campaignId },
                    { 
                        $set: { 
                            status: 'completed',
                            'analytics.lastProcessed': new Date()
                        }
                    }
                );
            } catch (processError) {
                console.error('Segment processing error:', processError);
                // Don't fail the request, but include warning in response
                return res.status(201).json({
                    message: "Campaign created successfully, but segment processing failed",
                    campaignId: campaignId.toString(),
                    segmentId: segmentId.toString(),
                    warning: "Initial segment processing failed. Will retry automatically."
                });
            }
        }

        res.status(201).json({
            message: "Campaign created successfully",
            campaignId: campaignId.toString(),
            segmentId: segmentId.toString()
        });

    } catch (error) {
        console.error('Campaign creation error:', error);
        res.status(500).json({ 
            error: 'Campaign creation failed',
            details: error.message,
            code: error.code
        });
    } finally {
        if (session) {
            await session.endSession().catch(err => 
                console.error('Error ending session:', err)
            );
        }
    }
});

// Campaign data validation
function validateCampaignData(data) {
    const errors = [];
    
    if (!data.type) errors.push('Campaign type is required');
    if (!data.channel) errors.push('Channel is required');
    if (!data.value || !Array.isArray(data.value)) errors.push('Valid segment value array is required');
    
    // Validate template data for WhatsApp channel
    if (data.channel === 'whatsapp') {
        if (!data.data?.templateID) errors.push('Template ID is required for WhatsApp campaigns');
        if (!data.data?.type) errors.push('Message type is required for WhatsApp campaigns');
    }

    return {
        success: errors.length === 0,
        errors,
        data: errors.length === 0 ? data : null
    };}
router.post('/UIS/:segment_id', async (req, res) => {
    try {
        const { segment_id } = req.params;
        const segment = await req.tenantDB.collection("campaigns").findOne({ segment_id });
        if (!segment) return res.status(404).json({ error: 'Segment not found' });

        let users = [];
        if (segment.event) {
            users = await req.tenantDB.collection("userEvent")
                .aggregate([
                    { $match: { 'events.eventName': segment.value } },
                    { $group: { _id: "$MMID" } },
                    { $project: { _id: 0, MMID: "$_id" } }
                ]).toArray();
        } else {
            users = await req.tenantDB.collection("Users")
                .find({ [segment.attribute]: segment.value })
                .project({ MMID: 1, _id: 0 })
                .toArray();
        }

        const mmids = users.map(u => u.MMID);
        await req.tenantDB.collection("segments").updateOne(
            { segment_id },
            { $set: { users: mmids } }
        );

        res.json(mmids);
    } catch (error) {
        console.error('Error updating segment:', error);
        res.status(500).json({ error: 'Failed to update segment' });
    }
});

router.get('/getCampaignsForUser', async (req, res) => {
    try {
        const MMID = req.query.MMID;
        if (!MMID) return res.status(400).json({ error: 'MMID required' });

        const segments = await req.tenantDB.collection("segments")
            .find({ users: MMID })
            .project({ segment_id: 1 })
            .toArray();

        res.json(segments.map(s => s.segment_id));
    } catch (error) {
        console.error('Error fetching user campaigns:', error);
        res.status(500).json({ error: 'Failed to retrieve campaigns' });
    }
});

router.post('/updateAnalytics', async (req, res) => {
    try {
        const { cid } = req.body;
        const result = await req.tenantDB.collection("campaigns").updateOne(
            { segment_id: cid },
            { $inc: { 'analytics.impression': 1 } }
        );
        
        result.modifiedCount === 1 
            ? res.json({ message: 'Analytics updated' })
            : res.status(404).json({ error: 'Campaign not found' });
    } catch (error) {
        console.error('Error updating analytics:', error);
        res.status(500).json({ error: 'Failed to update analytics' });
    }
});

router.delete('/deleteCampaign', async (req, res) => {
    try {
        const { segment_id } = req.body;
        const session = req.tenantDB.client.startSession();
        if(!segment_id){
            res.status(400).json({message: 'Segment ID is required'});
        }
        let segmentObjectId;
        try {
          segmentObjectId = new ObjectId(segment_id);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid segment ID format' });
        }
    
        
        try {
            await session.withTransaction(async () => {
                const cd=await req.tenantDB.collection("campaigns").deleteOne({ segment_id: segment_id });
                await req.tenantDB.collection("segments").deleteOne({ _id: segmentObjectId });
                console.log(cd);
                
            });
            res.json({ message: 'Campaign deleted successfully' });
        } finally {
            await session.endSession();
        }
    } catch (error) {
        console.error('Error deleting campaign:', error);
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
});

module.exports = router;