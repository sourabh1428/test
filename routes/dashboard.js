const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const mongoose = require('mongoose');
const router = express.Router();

// Database connections
const adminDbClient = new MongoClient(process.env.ADMIN_DB_URI);
const adminDb = adminDbClient.db('adminEB');

router.use((req, res, next) => {
  if (!req.tenantDB) {
    return res.status(500).json({
      success: false,
      error: 'Tenant database connection not established'
    });
  }
  next();
});

// Connect to databases on startup
(async () => {
  try {
    await adminDbClient.connect();
    console.log('Connected to both databases');
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
})();

// Unified settings handler with adminEB integration
const handleSettings = async (req, res, type) => {
  try {
    const db = req.tenantDB;
    const data = req.body;
    
    console.log(`Handling ${type} settings update:`, JSON.stringify(data).substring(0, 200));
    
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        error: `${type} data is required`
      });
    }

    // Update tenant settings
    const updateData = {
      type: 'tenant_settings',
      [type]: data,
      updatedAt: new Date()
    };

    console.log(`Updating database for ${type} settings`);
    const result = await req.tenantDB.collection("Settings").updateOne(
      { type: 'tenant_settings' },
      { $set: updateData },
      { upsert: true }
    );

    // Special handling for profile updates - update corresponding team member if exists
    if (type === 'profile' && data.email) {
      try {
        // Find team settings
        const teamSettings = await req.tenantDB.collection("Settings").findOne(
          { type: 'tenant_settings' },
          { projection: { team: 1 } }
        );
        
        // If team exists and has members
        if (teamSettings?.team?.members && teamSettings.team.members.length > 0) {
          // Find team member by email
          const memberIndex = teamSettings.team.members.findIndex(
            m => m.email && m.email.toLowerCase() === data.email.toLowerCase()
          );
          
          // If this profile belongs to a team member, update the team member data
          if (memberIndex !== -1) {
            console.log(`Updating team member at index ${memberIndex} with profile data`);
            
            const updatedMembers = [...teamSettings.team.members];
            updatedMembers[memberIndex] = {
              ...updatedMembers[memberIndex],
              firstName: data.firstName,
              lastName: data.lastName,
              name: `${data.firstName} ${data.lastName}`,
              phone: data.phone,
              company: data.company,
              jobTitle: data.jobTitle,
              avatar: data.avatarUrl
            };
            
            // Update team settings with updated member data
            await req.tenantDB.collection("Settings").updateOne(
              { type: 'tenant_settings' },
              { $set: { 'team.members': updatedMembers } }
            );
            console.log(`Updated team member with profile data`);
          }
        }
      } catch (error) {
        console.error('Error syncing profile data to team member:', error);
        // Continue with the response - this is just additional syncing
      }
    }

    // Handle team member updates in adminEB
    if (type === 'team' && data.members) {
      console.log(`Processing team members. Count: ${data.members.length}`);
      
      // Attempt to sync team member updates with Users collection
      try {
        for (const member of data.members) {
          if (member.email) {
            // Check if user exists in Users collection
            const existingUser = await req.tenantDB.collection("Users").findOne({
              email: member.email
            });
            
            if (existingUser) {
              // Update user with team member data if available
              const updateData = {};
              
              if (member.firstName) updateData.firstName = member.firstName;
              if (member.lastName) updateData.lastName = member.lastName;
              if (member.name) updateData.name = member.name;
              if (member.phone) updateData.phone = member.phone;
              if (member.company) updateData.company = member.company;
              if (member.jobTitle) updateData.jobTitle = member.jobTitle;
              if (member.avatar) updateData.avatar = member.avatar;
              
              if (Object.keys(updateData).length > 0) {
                await req.tenantDB.collection("Users").updateOne(
                  { email: member.email },
                  { $set: updateData }
                );
                console.log(`Updated user data for ${member.email}`);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error syncing team data to users:', error);
        // Continue with the response - this is just additional syncing
      }
      
      // Get tenant info from adminEB
      const tenantInfo = await adminDb.collection("tenants").findOne(
        { dbName: req.tenantDB.databaseName }
      );

      if (!tenantInfo) {
        throw new Error('Tenant not found in adminEB');
      }

      // First, get all current emails to identify which ones to remove
      const currentEmails = new Set(data.members.map(m => m.email));
      console.log(`Current team member emails: ${Array.from(currentEmails).join(', ')}`);
      
      // Remove users that are no longer in the team
      const removeResult = await adminDb.collection("tenants").updateOne(
        { _id: tenantInfo._id },
        { 
          $pull: { 
            Users: { 
              user_email: { 
                $nin: Array.from(currentEmails) 
              } 
            } 
          }
        }
      );
      console.log(`Removed ${removeResult.modifiedCount} users from adminEB`);

      // Process each team member with bulk operations
      const bulkOps = data.members.map(member => ({
        updateOne: {
          filter: {
            _id: tenantInfo._id,
            'Users.user_email': { $ne: member.email }
          },
          update: {
            $addToSet: {
              Users: {
                user_email: member.email,
                user_name: member.name,
                password: member.password,
                role: member.role || 'user',
                isVerified: true
              }
            }
          }
        }
      }));

      // Execute bulk operations if there are any
      if (bulkOps.length > 0) {
        const bulkResult = await adminDb.collection("tenants").bulkWrite(bulkOps);
        console.log(`Bulk updated ${bulkResult.nModified || 0} users in adminEB`);
      }
    }

    res.json({
      success: true,
      updated: result.modifiedCount > 0,
      upserted: !!result.upsertedId
    });

  } catch (error) {
    console.error(`Error updating ${type} settings:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete team member with adminEB sync
router.delete('/team/:index', async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);

    if (isNaN(index)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid index'
      });
    }

    // Get tenant info from adminEB
    const tenantInfo = await adminDb.collection("tenants").findOne(
      { dbName: req.tenantDB.databaseName }
    );

    if (!tenantInfo) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found in adminEB'
      });
    }

    // Get current team members
    const settings = await req.tenantDB.collection("Settings").findOne(
      { type: 'tenant_settings' },
      { projection: { _id: 0, team: 1 } }
    );

    if (!settings?.team?.members || index >= settings.team.members.length) {
      return res.status(404).json({
        success: false,
        error: 'Team member not found'
      });
    }

    // Remove from tenant settings
    const deletedMember = settings.team.members[index];
    const newMembers = settings.team.members.filter((_, i) => i !== index);
    
    const updateResult = await req.tenantDB.collection("Settings").updateOne(
      { type: 'tenant_settings' },
      { $set: { 'team.members': newMembers } }
    );

    // Remove from adminEB tenant Users array using atomic operation
    await adminDb.collection("tenants").updateOne(
      { _id: tenantInfo._id },
      { $pull: { Users: { user_email: deletedMember.email } } }
    );

    res.json({
      success: true,
      updated: updateResult.modifiedCount > 0
    });

  } catch (error) {
    console.error('Error deleting team member:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete team member'
    });
  }
});

// Get settings route
router.get('/', async (req, res) => {
  try {
    const settings = await req.tenantDB.collection("Settings").findOne(
      { type: 'tenant_settings' },
      { projection: { _id: 0, email: 1, whatsapp: 1, team: 1, dashboard: 1, profile: 1, security: 1, notifications: 1, billing: 1 } }
    );

    // Enrich team members with user profile data if available
    if (settings?.team?.members && settings.team.members.length > 0) {
      console.log(`Enriching ${settings.team.members.length} team members with profile data`);
      
      // Get all users from the Users collection
      const users = await req.tenantDB.collection("Users").find({}).toArray();
      const usersMap = new Map();
      
      // Create a map of email to user data
      users.forEach(user => {
        if (user.email) {
          usersMap.set(user.email.toLowerCase(), user);
        }
      });
      
      // Enrich each team member with profile data
      settings.team.members = settings.team.members.map(member => {
        if (member.email) {
          const userProfile = usersMap.get(member.email.toLowerCase());
          if (userProfile) {
            console.log(`Found profile data for team member: ${member.email}`);
            return {
              ...member,
              // Add profile data, but don't overwrite existing member data
              firstName: member.firstName || userProfile.firstName,
              lastName: member.lastName || userProfile.lastName,
              phone: member.phone || userProfile.phone || userProfile.mobile_number,
              company: member.company || userProfile.company,
              jobTitle: member.jobTitle || userProfile.jobTitle,
              avatar: member.avatar || userProfile.avatar || userProfile.avatarUrl
            };
          }
        }
        return member;
      });
    }

    const responseData = {
      email: settings?.email || {},
      whatsapp: settings?.whatsapp || {},
      team: settings?.team || { members: [] },
      dashboard: settings?.dashboard || {},
      profile: settings?.profile || {},
      security: settings?.security || {},
      notifications: settings?.notifications || {},
      billing: settings?.billing || {}
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve settings'
    });
  }
});

// Add a dedicated team endpoint for diagnostic purposes
router.get('/team', async (req, res) => {
  try {
    const settings = await req.tenantDB.collection("Settings").findOne(
      { type: 'tenant_settings' },
      { projection: { _id: 0, team: 1 } }
    );
    
    // Enrich team members with user profile data if available
    if (settings?.team?.members && settings.team.members.length > 0) {
      console.log(`Enriching ${settings.team.members.length} team members with profile data`);
      
      // Get all users from the Users collection
      const users = await req.tenantDB.collection("Users").find({}).toArray();
      const usersMap = new Map();
      
      // Create a map of email to user data
      users.forEach(user => {
        if (user.email) {
          usersMap.set(user.email.toLowerCase(), user);
        }
      });
      
      // Enrich each team member with profile data
      settings.team.members = settings.team.members.map(member => {
        if (member.email) {
          const userProfile = usersMap.get(member.email.toLowerCase());
          if (userProfile) {
            console.log(`Found profile data for team member: ${member.email}`);
            return {
              ...member,
              // Add profile data, but don't overwrite existing member data
              firstName: member.firstName || userProfile.firstName,
              lastName: member.lastName || userProfile.lastName,
              phone: member.phone || userProfile.phone || userProfile.mobile_number,
              company: member.company || userProfile.company,
              jobTitle: member.jobTitle || userProfile.jobTitle,
              avatar: member.avatar || userProfile.avatar || userProfile.avatarUrl
            };
          }
        }
        return member;
      });
    }

    res.json({
      success: true,
      data: settings?.team || { members: [] }
    });
  } catch (error) {
    console.error('Error fetching team settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve team settings'
    });
  }
});

// Route handlers
router.post('/whatsapp', (req, res) => handleSettings(req, res, 'whatsapp'));
router.post('/email', (req, res) => handleSettings(req, res, 'email'));
router.post('/sms', (req, res) => handleSettings(req, res, 'sms'));
router.post('/team', (req, res) => handleSettings(req, res, 'team'));
router.post('/dashboard', (req, res) => handleSettings(req, res, 'dashboard'));

// Add the new route for user profile
router.post('/user/profile', (req, res) => handleSettings(req, res, 'profile'));

// Add WhatsApp message status stats endpoint
router.get('/whatsapp/messages/stats', async (req, res) => {
  try {
    const WhatsAppMessage = mongoose.model('WhatsAppMessage');
    
    // Get time range from query params
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get message counts by status
    const statusCounts = await WhatsAppMessage.aggregate([
      { 
        $match: { 
          tenantId: req.tenantId,
          sentAt: { $gte: startDate } 
        } 
      },
      { 
        $group: { 
          _id: "$status", 
          count: { $sum: 1 } 
        } 
      }
    ]);
    
    // Get message counts by day
    const dailyCounts = await WhatsAppMessage.aggregate([
      { 
        $match: { 
          tenantId: req.tenantId,
          sentAt: { $gte: startDate } 
        } 
      },
      {
        $group: {
          _id: { 
            $dateToString: { format: "%Y-%m-%d", date: "$sentAt" } 
          },
          sent: { 
            $sum: 1 
          },
          delivered: { 
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } 
          },
          read: { 
            $sum: { $cond: [{ $eq: ["$status", "read"] }, 1, 0] } 
          },
          failed: { 
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } 
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Get delivery performance metrics
    const deliveryMetrics = await WhatsAppMessage.aggregate([
      {
        $match: {
          tenantId: req.tenantId,
          sentAt: { $gte: startDate },
          deliveredAt: { $exists: true }
        }
      },
      {
        $project: {
          deliveryTimeSeconds: {
            $divide: [
              { $subtract: ["$deliveredAt", "$sentAt"] },
              1000
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgDeliveryTime: { $avg: "$deliveryTimeSeconds" },
          minDeliveryTime: { $min: "$deliveryTimeSeconds" },
          maxDeliveryTime: { $max: "$deliveryTimeSeconds" }
        }
      }
    ]);
    
    // Format response
    const stats = {
      statusCounts: statusCounts.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      dailyCounts,
      deliveryMetrics: deliveryMetrics[0] || {
        avgDeliveryTime: 0,
        minDeliveryTime: 0,
        maxDeliveryTime: 0
      }
    };
    
    res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching WhatsApp message stats:', error);
    res.status(500).json({ error: 'Failed to fetch WhatsApp message stats' });
  }
});

// Add endpoint to get recent messages with their status
router.get('/whatsapp/messages/recent', async (req, res) => {
  try {
    const WhatsAppMessage = mongoose.model('WhatsAppMessage');
    const { limit = 20, page = 1 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const messages = await WhatsAppMessage.find({ tenantId: req.tenantId })
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    const total = await WhatsAppMessage.countDocuments({ tenantId: req.tenantId });
    
    res.status(200).json({
      messages,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching recent WhatsApp messages:', error);
    res.status(500).json({ error: 'Failed to fetch recent WhatsApp messages' });
  }
});

module.exports = router;