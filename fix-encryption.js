/**
 * Fix Encryption Script
 * 
 * This script fixes the encryption for sensitive fields in the database
 * due to changes in the encryption format.
 * 
 * Run with: node fix-encryption.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { reEncryptCollection } = require('./utils/encryption');

async function fixEncryption() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/emailTracker', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected successfully');
    
    // Define collections and paths that need re-encryption
    const collectionsToFix = [
      {
        name: 'tenantwhatsappconfigs',
        query: {}, // All documents
        paths: ['gupshup.apiKey']
      }
      // Add more collections and sensitive fields as needed
    ];
    
    // Process each collection
    for (const collection of collectionsToFix) {
      console.log(`\nFixing encryption in collection: ${collection.name}`);
      console.log(`Fields to fix: ${collection.paths.join(', ')}`);
      
      const result = await reEncryptCollection(
        mongoose,
        collection.name,
        collection.query,
        collection.paths
      );
      
      if (result.success) {
        console.log(`Successfully updated ${result.count} documents`);
      } else {
        console.error(`Failed to update collection: ${result.error}`);
      }
    }
    
    console.log('\nEncryption fix completed');
  } catch (error) {
    console.error('Error fixing encryption:', error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

fixEncryption().catch(console.error); 