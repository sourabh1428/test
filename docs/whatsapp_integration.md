# WhatsApp Integration

This document outlines the WhatsApp integration in our application and the recent changes made to align with Gupshup's API specifications.

## Overview

Our application integrates with WhatsApp through Gupshup's API to send template messages to users. Templates are pre-approved message formats that can include variables/parameters and media attachments.

## Key Components

1. **TenantConfigService**: Manages tenant-specific WhatsApp configurations
2. **TenantWhatsAppConfig Model**: Stores WhatsApp configuration in MongoDB
3. **gupshupWhatsAppService**: Handles the communication with Gupshup's API
4. **Encryption Utilities**: Securely stores sensitive API keys

## Recent Changes

The WhatsApp integration has been updated to align with Gupshup's official API documentation at [https://docs.gupshup.io/docs/template-messages](https://docs.gupshup.io/docs/template-messages) and [https://docs.gupshup.io/reference/post_wa-api-v1-msg-3](https://docs.gupshup.io/reference/post_wa-api-v1-msg-3). Key changes include:

### 1. Template Format

Updated the template JSON format to match Gupshup's requirements:

```json
{
  "id": "template-id-here",
  "params": ["Parameter 1", "Parameter 2"]
}
```

### 2. Media Handling

Implemented proper media handling for different template types according to latest Gupshup API specifications:

- **Text Templates**: Only require the template object
- **Image Templates**:
  ```json
  {
    "type": "image",
    "originalUrl": "https://example.com/image.jpg",
    "previewUrl": "https://example.com/image.jpg",
    "caption": "Optional caption text"
  }
  ```

  The image template must be sent with both the template parameter AND the message parameter in the API request:
  ```
  template={"id":"template-id-here","params":["Param1","Param2"]}
  message={"type":"image","originalUrl":"https://example.com/image.jpg","previewUrl":"https://example.com/image.jpg","caption":"Optional caption text"}
  ```

- **Document Templates**:
  ```json
  {
    "type": "document",
    "url": "https://example.com/document.pdf",
    "filename": "Document Name.pdf"
  }
  ```

  The document template must be sent with both the template parameter AND the message parameter in the API request:
  ```
  template={"id":"template-id-here","params":["Param1","Param2"]}
  message={"type":"document","url":"https://example.com/document.pdf","filename":"Document Name.pdf"}
  ```

- **Video Templates**:
  ```json
  {
    "type": "video",
    "url": "https://example.com/video.mp4",
    "caption": "Optional caption text"
  }
  ```
- **Location Templates**:
  ```json
  {
    "type": "location",
    "longitude": "72.877655",
    "latitude": "19.076090",
    "name": "Location Name",
    "address": "Location Address"
  }
  ```

### 3. HTTP Headers

Required HTTP headers for all API requests:
- `Content-Type: application/x-www-form-urlencoded`
- `apikey: your-api-key`
- `Cache-Control: no-cache`

### 4. API Request Format

For media templates, both the `template` parameter AND the `message` parameter must be included in the API request. This is a critical change from previous implementations where only one or the other was used.

### 5. CURL Command Format

Updated the generated CURL commands to match the format in Gupshup's documentation:

```bash
curl --location 'https://api.gupshup.io/wa/api/v1/template/msg' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --header 'apikey: your-api-key' \
  --header 'Cache-Control: no-cache' \
  --data-urlencode 'source=918929874278' \
  --data-urlencode 'destination=9190000000000' \
  --data-urlencode 'src.name=your-app-name' \
  --data-urlencode 'template={"id":"template-id-here","params":["Param1","Param2"]}' \
  --data-urlencode 'message={"type":"image","originalUrl":"https://example.com/image.jpg","previewUrl":"https://example.com/image.jpg"}'
```

## Testing

We've created several test scripts to validate the WhatsApp integration:

1. **test-tenant-whatsapp.js**: Tests sending a basic text template
2. **test-media-whatsapp.js**: Tests sending templates with various media types
3. **debug-whatsapp.js**: Helps diagnose configuration issues

## Implementation Notes

When using the `buildAndSendTemplateMessage` function in the `gupshupWhatsAppService.js` file, be sure to include the following parameters for media templates:

- For image templates: `templateType: 'image'`, `mediaUrl`, and optionally `caption`
- For document templates: `templateType: 'document'`, `mediaUrl`, and `filename` (required)
- For video templates: `templateType: 'video'`, `mediaUrl`, and optionally `caption`

Example usage:
```javascript
const result = await buildAndSendTemplateMessage({
  source: '+1234567890',
  destination: '+0987654321',
  srcName: 'YourAppName',
  templateId: 'your_template_id',
  params: ['Param1', 'Param2'],
  templateType: 'document',
  mediaUrl: 'https://example.com/document.pdf',
  filename: 'Important Document.pdf',
  apiKey: 'your-gupshup-api-key'
});
```

## Troubleshooting

If you encounter issues with WhatsApp message sending:

1. Check that the API key is valid
2. Verify that the template ID exists and is approved
3. Ensure the template parameters match the expected format
4. For media templates, ensure both the `template` and `message` parameters are correctly formatted
5. Run `debug-whatsapp.js` to update the tenant configuration
6. Check the Gupshup response for detailed error messages

## References

- [Gupshup Template Messages Documentation](https://docs.gupshup.io/docs/template-messages)
- [Gupshup Image Messages API Reference](https://docs.gupshup.io/reference/post_wa-api-v1-msg-3)
- [Gupshup Document Messages API Reference](https://docs.gupshup.io/reference/post_wa-api-v1-msg-5)
- [WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp/api/messages/message-templates) 