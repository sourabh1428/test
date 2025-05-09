# test

# Backend Server

This is the backend server for the email tracking application.

## WhatsApp Integration

The system supports sending WhatsApp template messages through the Gupshup API. Each tenant can have its own WhatsApp configuration with different API keys, source phone numbers, and app IDs.

### Recent Fixes

We've made several improvements to the WhatsApp integration:

1. **Enhanced Encryption**: The encryption system has been improved to handle API keys and other sensitive data more reliably. We now use a prefix-based approach to identify encrypted values and provide better error handling.

2. **Decryption Reliability**: Changed how encrypted values are stored and retrieved, avoiding Mongoose's getter/setter methods which were causing issues with the encryption format.

3. **Proper Tenant Configuration**: Updated how tenant-specific configurations are managed, ensuring that API keys and other credentials are correctly retrieved.

4. **Debugging Support**: Added detailed logging to help diagnose issues with WhatsApp message sending and configuration.

### Testing WhatsApp Integration

To test the WhatsApp integration, you can use the following scripts:

1. **debug-whatsapp.js**: Diagnoses issues with WhatsApp configuration and updates the tenant configuration with values from the environment.

2. **fix-encryption.js**: Updates the encryption format for sensitive fields in the database.

3. **test-tenant-whatsapp.js**: Sends a test WhatsApp template message using the tenant configuration.

Example:
```bash
node debug-whatsapp.js    # Fix configuration
node fix-encryption.js    # Update encryption format
node test-tenant-whatsapp.js  # Send a test message
```

### Troubleshooting

If you encounter issues with the WhatsApp integration:

1. Check that the environment variables are set correctly in `.env`:
   - `GUPSHUP_API_KEY`
   - `GUPSHUP_APP_ID`
   - `GUPSHUP_sourcePhoneNumber`
   - `ENCRYPTION_KEY`

2. Ensure the templates exist in the tenant configuration in the `tenantwhatsappconfigs` collection.

3. Verify that the API key is valid by testing it with the Gupshup API.

4. Check the database records for any encryption issues and run `fix-encryption.js` if needed.
