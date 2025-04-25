const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkUser() {
  try {
    const client = new MongoClient(process.env.ADMIN_DB_URI);
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('adminEB');
    console.log('Looking for user with email: sppathak1428@gmail.com');
    
    // First check in tenants collection
    const tenants = await db.collection('tenants').find({
      "Users.user_email": "sppathak1428@gmail.com"
    }).toArray();
    
    console.log('Found in tenants collection:', tenants.length > 0);
    
    if (tenants.length > 0) {
      // Print all users in the tenant
      console.log('Users in tenant:');
      tenants.forEach(tenant => {
        console.log(JSON.stringify(tenant.Users, null, 2));
      });
    }
    
    // Check in superAdmins collection
    const superAdmins = await db.collection('superAdmins').find({
      email: "sppathak1428@gmail.com"
    }).toArray();
    
    console.log('Found in superAdmins collection:', superAdmins.length > 0);
    
    if (superAdmins.length > 0) {
      console.log('SuperAdmin details:', JSON.stringify(superAdmins, null, 2));
    }
    
    await client.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkUser(); 