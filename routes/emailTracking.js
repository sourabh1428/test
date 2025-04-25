const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createEmailTrackingQueue } = require('../services/bullQueue');
require('dotenv').config();

// Email model schema
const Email = mongoose.model('Email', new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, index: true },
  subject: String,
  sender: String,
  recipient: String,
  sentAt: { type: Date, default: Date.now },
  openCount: { type: Number, default: 0 },
  clickCount: { type: Number, default: 0 },
  bounceCount: { type: Number, default: 0 },
  lastOpenedAt: Date,
  lastClickedAt: Date,
  lastBouncedAt: Date,
  bounceReason: String,
  trackingId: { type: String, index: true },
  metadata: {},
  clicks: [{
    url: String,
    timestamp: Date,
    userId: String
  }]
}));

// Create compound indexes for performance
Email.collection.createIndex({ tenantId: 1, campaignId: 1 });
Email.collection.createIndex({ tenantId: 1, sentAt: -1 });
Email.collection.createIndex({ trackingId: 1 });

// Event model schema
const Event = mongoose.model('Event', new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  type: { type: String, index: true },
  emailId: { type: mongoose.Schema.Types.ObjectId, ref: 'Email', index: true },
  userId: String,
  metadata: {},
  timestamp: { type: Date, default: Date.now }
}));

// Create compound indexes for performance
Event.collection.createIndex({ tenantId: 1, type: 1, timestamp: -1 });
Event.collection.createIndex({ tenantId: 1, emailId: 1 });

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.userId = decoded.id;
    req.tenantId = decoded.tenantId || decoded.dbName; // Support both formats
    next();
  });
};

// Get stats for a campaign
router.get('/campaigns/:id/stats', verifyToken, async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // Get email stats from database
    const emailStats = await Email.aggregate([
      { 
        $match: { 
          campaignId: new mongoose.Types.ObjectId(campaignId),
          tenantId: req.tenantId
        } 
      },
      {
        $group: {
          _id: null,
          totalSent: { $sum: 1 },
          totalOpens: { $sum: '$openCount' },
          totalClicks: { $sum: '$clickCount' },
          totalBounces: { $sum: '$bounceCount' },
          uniqueOpens: { 
            $sum: { 
              $cond: [{ $gt: ['$openCount', 0] }, 1, 0] 
            } 
          },
          uniqueClicks: { 
            $sum: { 
              $cond: [{ $gt: ['$clickCount', 0] }, 1, 0] 
            } 
          }
        }
      }
    ]);
    
    // Get click breakdown by URL
    const clicksByUrl = await Email.aggregate([
      { 
        $match: { 
          campaignId: new mongoose.Types.ObjectId(campaignId),
          tenantId: req.tenantId,
          clicks: { $exists: true, $ne: [] }
        } 
      },
      { $unwind: '$clicks' },
      {
        $group: {
          _id: '$clicks.url',
          count: { $sum: 1 },
          lastClicked: { $max: '$clicks.timestamp' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Get timeline of opens and clicks
    const eventsTimeline = await Event.aggregate([
      {
        $match: {
          emailId: { $in: await getEmailIdsForCampaign(campaignId, req.tenantId) },
          tenantId: req.tenantId,
          type: { $in: ['email_opened', 'email_clicked'] }
        }
      },
      {
        $group: {
          _id: {
            type: '$type',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.day': 1 } },
      {
        $project: {
          _id: 0,
          type: '$_id.type',
          day: '$_id.day',
          count: 1
        }
      }
    ]);
    
    // Format the response
    const stats = emailStats.length > 0 ? emailStats[0] : {
      totalSent: 0,
      totalOpens: 0,
      totalClicks: 0,
      totalBounces: 0,
      uniqueOpens: 0,
      uniqueClicks: 0
    };
    
    // Remove the _id field
    delete stats._id;
    
    // Calculate open rate and click rate
    if (stats.totalSent > 0) {
      stats.openRate = stats.uniqueOpens / stats.totalSent;
      stats.clickRate = stats.uniqueClicks / stats.totalSent;
      stats.bounceRate = stats.totalBounces / stats.totalSent;
    } else {
      stats.openRate = 0;
      stats.clickRate = 0;
      stats.bounceRate = 0;
    }
    
    res.status(200).json({
      ...stats,
      clicksByUrl,
      timeline: eventsTimeline
    });
  } catch (error) {
    console.error('Get campaign stats error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign stats' });
  }
});

// Get all emails for a campaign
router.get('/campaigns/:id/emails', verifyToken, async (req, res) => {
  try {
    const campaignId = req.params.id;
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '20');
    const skip = (page - 1) * limit;
    
    // Get emails from database
    const emails = await Email.find({ 
      campaignId,
      tenantId: req.tenantId
    })
    .sort({ sentAt: -1 })
    .skip(skip)
    .limit(limit);
    
    // Get total email count
    const totalEmails = await Email.countDocuments({ 
      campaignId,
      tenantId: req.tenantId
    });
    
    res.status(200).json({
      emails,
      pagination: {
        page,
        limit,
        totalEmails,
        totalPages: Math.ceil(totalEmails / limit)
      }
    });
  } catch (error) {
    console.error('Get campaign emails error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign emails' });
  }
});

// Tracking pixel endpoint - no auth required
router.get('/pixel/:trackingId', async (req, res) => {
  try {
    const trackingId = req.params.trackingId;
    
    // Format of trackingId: tenantId:emailId
    const [tenantId, emailId] = trackingId.split(':');
    
    if (!tenantId || !emailId) {
      // Return a transparent 1x1 gif even if the tracking ID is invalid
      return sendTrackingPixel(res);
    }
    
    // Find the email using the tracking ID
    const email = await Email.findById(emailId);
    
    if (!email || email.tenantId !== tenantId) {
      // Return a transparent 1x1 gif even if the email is not found
      return sendTrackingPixel(res);
    }
    
    // Queue the open event for processing
    const queue = createEmailTrackingQueue(tenantId);
    await queue.add('track_open', {
      type: 'email_opened',
      payload: {
        emailId,
        userId: email.userId,
        email: email.recipient,
        timestamp: new Date()
      }
    });
    
    // Return a transparent 1x1 gif
    sendTrackingPixel(res);
  } catch (error) {
    console.error('Tracking pixel error:', error);
    // Still return a tracking pixel even if there's an error
    sendTrackingPixel(res);
  }
});

// Link tracking endpoint - no auth required
router.get('/link/:trackingId', async (req, res) => {
  try {
    const trackingId = req.params.trackingId;
    const url = req.query.url;
    
    if (!url) {
      return res.status(400).json({ error: 'Missing URL parameter' });
    }
    
    // Format of trackingId: tenantId:emailId
    const [tenantId, emailId] = trackingId.split(':');
    
    if (!tenantId || !emailId) {
      // Redirect to the URL even if the tracking ID is invalid
      return res.redirect(url);
    }
    
    // Find the email using the tracking ID
    const email = await Email.findById(emailId);
    
    if (!email || email.tenantId !== tenantId) {
      // Redirect to the URL even if the email is not found
      return res.redirect(url);
    }
    
    // Queue the click event for processing
    const queue = createEmailTrackingQueue(tenantId);
    await queue.add('track_click', {
      type: 'email_clicked',
      payload: {
        emailId,
        userId: email.userId,
        email: email.recipient,
        linkUrl: url,
        timestamp: new Date()
      }
    });
    
    // Redirect to the URL
    res.redirect(url);
  } catch (error) {
    console.error('Link tracking error:', error);
    // Redirect to the URL even if there's an error
    res.redirect(req.query.url || '/');
  }
});

// Helper function to send a transparent 1x1 GIF
function sendTrackingPixel(res) {
  // 1x1 transparent GIF
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(pixel);
}

// Helper function to get all email IDs for a campaign
async function getEmailIdsForCampaign(campaignId, tenantId) {
  const emails = await Email.find(
    { campaignId, tenantId },
    { _id: 1 }
  );
  
  return emails.map(email => email._id);
}

// Webhook for bounce notifications
router.post('/webhook/bounces', async (req, res) => {
  try {
    const { tenantId, emailId, reason } = req.body;
    
    if (!tenantId || !emailId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Queue the bounce event for processing
    const queue = createEmailTrackingQueue(tenantId);
    await queue.add('track_bounce', {
      type: 'email_bounced',
      payload: {
        emailId,
        reason: reason || 'Unknown reason',
        timestamp: new Date()
      }
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Bounce webhook error:', error);
    res.status(500).json({ error: 'Failed to process bounce notification' });
  }
});

module.exports = router; 