const express = require('express');
const router = express.Router();
require('dotenv').config();

router.post('/addEvent', async function (req, res) {
    try {
        const db = req.tenantDB; // Get tenant-specific DB from middleware
        const userEventDone = req.body;
        const eventTime = Math.floor(Date.now() / 1000);
        userEventDone.eventTime = eventTime;

        const collection = db.collection('all_events_done');
        await collection.insertOne(userEventDone);

        console.log("Event added to tenant DB:", userEventDone);
        res.status(201).json({ message: "Event added successfully" });
    } catch (error) {
        console.error("Error adding event:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

router.get('/userEvents', async function (req, res) {
    try {
        const db = req.tenantDB; // Tenant-specific DB
        const MMID = req.query.mmid;

        if (!MMID) {
            return res.status(400).send({ error: "MMID is required" });
        }

        const data = await db.collection('all_events_done')
                            .find({ MMID: MMID })
                            .toArray();

        res.status(200).json({ data: data });
    } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Failed to get user events" });
    }
});

router.post('/getEvents', async function (req, res) {
    try {
        const db = req.tenantDB; // Tenant-specific DB
        const event = req.body.eName;
        
        const eventCollection = await db.collection('all_events_done')
                                      .find({ eventName: event })
                                      .toArray();

        res.status(200).json({ data: eventCollection });
    } catch (error) {
        console.log("Error getting events:", error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/saveSale', async function (req, res) {
    try {
      const db = req.tenantDB; // Tenant-specific DB
      const saleData = req.body;
  
      // Add the time at which the event was done
      saleData.eventTime = new Date(); // or saleData.createdAt = new Date();
  
      const result = await db.collection('Sale').insertOne(saleData);
      res.status(200).send({ 
        message: "Sale uploaded successfully", 
        insertedId: result.insertedId 
      });
    } catch (error) {
      console.error('Error saving sale:', error);
      res.status(500).send({ error: 'Failed to save sale' });
    }
  });
  

router.post('/getSale', async function (req, res) {
    try {
        const db = req.tenantDB; // Tenant-specific DB
        const durationInDays = req.body.durationInDays;
        const cutoffDate = new Date(Date.now() - durationInDays * 24 * 60 * 60 * 1000);
        const allSales = await db.collection('Sale').find({}).toArray(); // Fetch all sales

        res.status(200).send(allSales);
    } catch (error) {
        console.error('Error fetching sales:', error);
        res.status(500).send({ error: 'Failed to fetch sales' });
    }
});

// Add route to get recent sales/invoices
router.get('/recentSales', async (req, res) => {
  try {
    console.log('recentSales endpoint hit, request headers:', req.headers);
    
    if (!req.tenantDB) {
      console.error('Error: tenantDB is not available in request');
      return res.status(500).json({ success: false, error: 'tenantDB is not available' });
    }
    
    const db = req.tenantDB; // Tenant-specific DB
    console.log('tenantDB available:', db.databaseName);
    
    try {
      // Check if the Sale collection exists
      const collections = await db.listCollections({ name: 'Sale' }).toArray();
      console.log('Collections check result:', collections);
      
      if (collections.length === 0) {
        // Sale collection doesn't exist, return empty array
        console.log('Sale collection does not exist, returning empty array');
        return res.status(200).json({ success: true, data: [] });
      }
      
      console.log('Sale collection exists, proceeding with query');
      const recentSales = await db.collection('Sale')
        .find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();
      
      console.log(`Found ${recentSales.length} recent sales`);
      
      // Enrich with customer data
      const enrichedSales = await Promise.all(
        recentSales.map(async (sale) => {
          try {
            const customer = await db.collection('users').findOne({ MMID: sale.MMID });
            return {
              ...sale,
              customerName: customer ? customer.name : 'Unknown',
              customerPhone: customer ? customer.mobile_number : 'N/A',
              customerEmail: customer ? customer.email : 'N/A'
            };
          } catch (error) {
            console.error('Error fetching customer data:', error);
            return {
              ...sale,
              customerName: 'Unknown',
              customerPhone: 'N/A',
              customerEmail: 'N/A'
            };
          }
        })
      );
      
      console.log('Successfully enriched sales data');
      res.status(200).json({ success: true, data: enrichedSales });
    } catch (innerError) {
      console.error('Inner error in recentSales:', innerError);
      res.status(500).json({ success: false, error: 'Internal server error', details: innerError.message });
    }
  } catch (error) {
    console.error('Error fetching recent sales:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recent sales', details: error.message });
  }
});

module.exports = router;