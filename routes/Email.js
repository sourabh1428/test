const {Resend}=require('resend');
const express = require('express');
const router = express.Router();

  const resend = new Resend('re_PiBtapnz_9noZZ3PifbaxYT8dfVkkDDF5');

  // Function to send the email
 
  

  
  // POST /sendEmails endpoint
  router.post("/sendEmails", async (req, res) => {
      const {
          campaignId,
          emailSubject,
          emailHtmlContent,
          senderName,
          recipients, // Assuming this is an array of metadata objects
          fromAddress,
          headers, // Pass the headers from the request
      } = req.body;
  
      // Log the entire request body
      console.log(req.body);
  
      try {
          // Validate recipients
          if (!Array.isArray(recipients) || recipients.length === 0) {
              console.error("Recipients list is invalid or empty.");
              return res.status(400).send("Invalid recipients list");
          }
  
          // Send emails
          await sendBulkEmails(fromAddress, campaignId, emailSubject, emailHtmlContent, senderName, recipients, headers); // Pass headers here
          console.log("Sent emails to all users for campaign " + campaignId);
          res.status(200).send("Emails sent successfully");
      } catch (e) {
          console.log(e);
          res.status(500).send("Internal Server Error");
      }
  });
  
  // Function to send bulk emails
  async function sendBulkEmails(fromAddress, campaignId, emailSubject, emailHtmlContent, senderName, recipients, headers) {
      // Create an array of promises for sending emails
      const emailPromises = recipients.map(async (recipient) => {
          const recipientEmail = recipient.email; // Extract email from recipient metadata
          const mmid = recipient.mmid; // Extract MMID from recipient metadata
          const cid = recipient.cid; // Extract CID from recipient metadata
  
          if (!recipientEmail || !mmid || !cid) {
              console.error(`Recipient metadata does not contain a valid email, MMID, or CID:`, recipient);
              return; // Skip this recipient if email, MMID, or CID is invalid
          }
  
          try {
              const { data, error } = await resend.emails.send({
                  from: `${senderName} <${fromAddress}>`, // Correctly formatted from address
                  to: [recipientEmail], // Use the extracted email
                  subject: emailSubject, // Use the provided subject
                  html: emailHtmlContent, // Use the provided HTML content
                  headers: {
                      'MMID': mmid, // Attach custom MMID header
                      'CID': cid, // Attach custom CID header
                      ...headers, // Include any additional custom headers from the request body
                  },
              });
  
              // Log the response
              if (error) {
                  console.error(`Error sending email to ${recipientEmail}:`, error);
              } else {
                  console.log(`Email sent successfully to ${recipientEmail} with MMID ${mmid}:`, data);
              }
          } catch (err) {
              console.error(`An unexpected error occurred while sending email to ${recipientEmail}:`, err);
          }
      });
  
      // Wait for all email promises to resolve
      await Promise.all(emailPromises);
  }
  
  module.exports = router;
  