const {Resend}=require('resend');
const express = require('express');
const router = express.Router();





router.post('/email-status', (req, res) => {
    const event = req.body;
  
    if (event.type === 'opened') {
      const messageId = event.data.id;  // Use message_id to identify the email
      const recipient = event.data.email; // Get the recipient's email
    
      // Now you can track which email was opened by matching the messageId
      console.log(`Email with message_id ${messageId} was opened by ${recipient}`);
    }
    console.log(event.data);
    res.sendStatus(200);
    return;
  });
  


  const resend = new Resend('re_PiBtapnz_9noZZ3PifbaxYT8dfVkkDDF5');

  // Function to send the email
  async function sendBulkEmails() {
    const recipients = [
      'sppathak1428@gmail.com',
      // 'khushnimabanchhor@gmail.com',
      // Add more recipients here
    ];
  
    // HTML content with images and text for MarketMe
    const htmlContent = `
     <!doctype html>
<html>
  <body>
    <div
      style='background-color:#F5F5F5;color:#262626;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-size:16px;font-weight:400;letter-spacing:0.15008px;line-height:1.5;margin:0;padding:32px 0;min-height:100%;width:100%'
    >
      <table
        align="center"
        width="100%"
        style="margin:0 auto;max-width:600px;background-color:#FFFFFF"
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
      >
        <tbody>
          <tr style="width:100%">
            <td>
              <div style="padding:16px 24px 16px 24px"></div>
              <h2
                style="font-weight:bold;margin:0;font-size:24px;padding:16px 24px 16px 24px"
              >
                Hello Sourabh
              </h2>
              <div style="padding:16px 24px 16px 24px">
                <img
                  alt="Sample product"
                  src="https://assets.usewaypoint.com/sample-image.jpg"
                  style="outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%"
                />
              </div>
              <div style="padding:16px 24px 16px 24px">
                <img
                  alt=""
                  src="https://ui-avatars.com/api/?size=128"
                  height="64"
                  width="64"
                  style="outline:none;border:none;text-decoration:none;object-fit:cover;height:64px;width:64px;max-width:100%;display:inline-block;vertical-align:middle;text-align:center;border-radius:64px"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
</html>
    `;
  
    for (let recipient of recipients) {
      const { data, error } = await resend.emails.send({
        from: 'FOUNDER OFFICE <marketing@comms.marketme.site>',
        to: [recipient],
        subject: 'Welcome to MarketMe!',
        html: htmlContent,
      });
  
      if (error) {
        console.error(`Error sending email to ${recipient}:`, error);
      } else {
        console.log(`Email sent successfully to ${recipient}:`, data);
      }
    }
  }
  
  sendBulkEmails();
  



module.exports = router;