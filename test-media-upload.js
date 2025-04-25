/**
 * Test script for Supabase image uploads
 * 
 * This script tests uploading images to Supabase storage
 * directly from a local file or buffer.
 */

const fs = require('fs');
const path = require('path');
const { uploadImageToSupabase, uploadImageFromUrlToSupabase } = require('./services/gupshupWhatsAppService');
require('dotenv').config();

// Create a test image if one doesn't exist
function createTestImage() {
  const testDir = path.join(__dirname, 'test-files');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  const testImagePath = path.join(testDir, 'test-image.jpg');
  
  // If the test image doesn't exist, create a simple one
  if (!fs.existsSync(testImagePath)) {
    console.log('Creating a test image...');
    // Create a simple colored rectangle as a JPG
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext('2d');
    
    // Draw a blue rectangle
    ctx.fillStyle = 'blue';
    ctx.fillRect(0, 0, 200, 200);
    
    // Add some text
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText('Test Image', 50, 100);
    
    // Save to file
    const buffer = canvas.toBuffer('image/jpeg');
    fs.writeFileSync(testImagePath, buffer);
    console.log(`Created test image at ${testImagePath}`);
  }
  
  return testImagePath;
}

async function testUpload() {
  try {
    // Log environment variables (without sensitive info)
    console.log('Supabase URL:', process.env.SUPABASE_URL);
    console.log('Supabase key available:', !!process.env.SUPABASE_ANON_KEY);
    
    // Test uploading a buffer
    const testImagePath = createTestImage();
    const imageBuffer = fs.readFileSync(testImagePath);
    console.log(`Read test image: ${testImagePath} (${imageBuffer.length} bytes)`);
    
    // Try uploading
    console.log('Testing upload to Supabase...');
    try {
      const result = await uploadImageToSupabase(
        imageBuffer,
        'test-supabase-upload.jpg',
        'image/jpeg'
      );
      
      console.log('Upload result:', result);
      
      // Check if the result contains our fallback URL
      if (result.includes('unsplash.com')) {
        console.log('WARNING: The upload may have failed, returned fallback image URL');
      } else {
        console.log('SUCCESS: Image was uploaded to Supabase');
      }
    } catch (err) {
      console.error('Upload error:', err);
    }
    
    // Test URL upload
    console.log('\nTesting upload from URL...');
    try {
      const urlResult = await uploadImageFromUrlToSupabase(
        'https://images.unsplash.com/photo-1575936123452-b67c3203c357?q=80&w=1000',
        'test-from-url.jpg'
      );
      
      console.log('URL upload result:', urlResult);
    } catch (urlErr) {
      console.error('URL upload error:', urlErr);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
console.log('Starting Supabase upload test...');
testUpload().then(() => {
  console.log('Test complete');
}).catch(err => {
  console.error('Test failed with error:', err);
}); 