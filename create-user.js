const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createUser() {
  try {
    const client = new MongoClient(process.env.ADMIN_DB_URI);
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('adminEB');
    
    // Check if the user already exists
    const existingUser = await db.collection('superAdmins').findOne({ email: 'sppathak1428@gmail.com' });
    
    if (existingUser) {
      console.log('User already exists in superAdmins collection');
    } else {
      // Create a new superadmin user
      const hashedPassword = await bcrypt.hash('123', 10); // Use the password from your login request
      
      const result = await db.collection('superAdmins').insertOne({
        email: 'sppathak1428@gmail.com',
        password: hashedPassword,
        name: 'Sudhir Pathak',
        role: 'superAdmin',
        createdAt: new Date()
      });
      
      console.log('SuperAdmin user created successfully:', result.insertedId);
    }
    
    await client.close();
    console.log('Done');
  } catch (err) {
    console.error('Error:', err);
  }
}

createUser(); 