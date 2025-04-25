/**
 * Encryption Utility
 * 
 * Provides methods for encrypting and decrypting sensitive data like API keys
 * Uses Node.js crypto module with AES-256-GCM, a strong authenticated encryption algorithm
 */

const crypto = require('crypto');
require('dotenv').config();

// Get the encryption key from environment variables
// This key should be a 32-byte (256-bit) key, stored securely
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 
                       crypto.randomBytes(32).toString('hex'); // Fallback for dev

if (!process.env.ENCRYPTION_KEY) {
  console.warn('WARNING: No ENCRYPTION_KEY found in environment variables! Using an insecure random key.');
  console.warn('For production, please set a persistent ENCRYPTION_KEY in your environment.');
}

// IV length for AES-256-GCM
const IV_LENGTH = 16;

// To help identify encrypted strings
const ENCRYPTION_PREFIX = 'ENC:';

/**
 * Encrypts sensitive data
 * 
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted data in format: ENC:iv:authTag:encryptedData (all base64 encoded)
 */
function encrypt(text) {
  if (!text) return text;
  
  // If already encrypted (has our prefix), return as is
  if (typeof text === 'string' && text.startsWith(ENCRYPTION_PREFIX)) {
    return text;
  }
  
  try {
    // Generate a random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher using AES-256-GCM
    const cipher = crypto.createCipheriv(
      'aes-256-gcm', 
      Buffer.from(ENCRYPTION_KEY, 'hex'), 
      iv
    );
    
    // Encrypt the data
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag().toString('base64');
    
    // Return IV, auth tag and encrypted data concatenated and encoded with a prefix
    return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error.message);
    // Return original text with a prefix to indicate it's not encrypted properly
    return `ERROR_ENCRYPTING:${text}`;
  }
}

/**
 * Decrypts sensitive data
 * 
 * @param {string} encryptedText - Encrypted text in format: ENC:iv:authTag:encryptedData
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
  if (!encryptedText) return encryptedText;
  
  // Error while encrypting, return the original text
  if (typeof encryptedText === 'string' && encryptedText.startsWith('ERROR_ENCRYPTING:')) {
    return encryptedText.substring('ERROR_ENCRYPTING:'.length);
  }
  
  // Not encrypted with our method
  if (typeof encryptedText !== 'string' || !encryptedText.startsWith(ENCRYPTION_PREFIX)) {
    return encryptedText;
  }
  
  try {
    // Remove the prefix
    const encryptedData = encryptedText.substring(ENCRYPTION_PREFIX.length);
    
    // Split the encrypted text into components
    const [ivBase64, authTagBase64, ciphertext] = encryptedData.split(':');
    
    // Decode components from base64
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    
    // Create decipher
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', 
      Buffer.from(ENCRYPTION_KEY, 'hex'), 
      iv
    );
    
    // Set auth tag
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    // Return original text if decryption fails
    return encryptedText;
  }
}

/**
 * Re-encrypts all sensitive data in a database collection
 * 
 * @param {Object} mongoose - Mongoose instance
 * @param {string} collectionName - Name of the collection to update
 * @param {Object} query - MongoDB query to find documents to update
 * @param {Array<string>} paths - Array of dot-notation paths to sensitive fields (e.g., 'gupshup.apiKey')
 * @returns {Promise<{success: boolean, count: number}>} - Result of the operation
 */
async function reEncryptCollection(mongoose, collectionName, query, paths) {
  try {
    const collection = mongoose.connection.db.collection(collectionName);
    const documents = await collection.find(query).toArray();
    let updatedCount = 0;
    
    for (const doc of documents) {
      let needsUpdate = false;
      const updates = {};
      
      for (const path of paths) {
        // Split the path to navigate the document
        const parts = path.split('.');
        let current = doc;
        let exists = true;
        
        // Navigate to the parent object
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current || typeof current !== 'object' || !(parts[i] in current)) {
            exists = false;
            break;
          }
          current = current[parts[i]];
        }
        
        // If we successfully navigated to the parent object
        if (exists && current) {
          const lastPart = parts[parts.length - 1];
          
          // If the field exists and is not already properly encrypted
          if (lastPart in current && 
              typeof current[lastPart] === 'string' && 
              !current[lastPart].startsWith(ENCRYPTION_PREFIX)) {
            
            // Encrypt the value
            const encrypted = encrypt(current[lastPart]);
            
            // Add to updates
            if (!updates[parts[0]]) {
              updates[parts[0]] = {};
            }
            
            let updatePath = updates[parts[0]];
            for (let i = 1; i < parts.length - 1; i++) {
              if (!updatePath[parts[i]]) {
                updatePath[parts[i]] = {};
              }
              updatePath = updatePath[parts[i]];
            }
            
            updatePath[lastPart] = encrypted;
            needsUpdate = true;
          }
        }
      }
      
      // Update the document if needed
      if (needsUpdate) {
        await collection.updateOne(
          { _id: doc._id }, 
          { $set: updates }
        );
        updatedCount++;
      }
    }
    
    return { success: true, count: updatedCount };
  } catch (error) {
    console.error('Error re-encrypting collection:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  encrypt,
  decrypt,
  reEncryptCollection
}; 