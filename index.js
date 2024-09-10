

const nodemailer = require('nodemailer');

// Setup nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'sppathak1428@gmail.com',
    pass: 'wnql xkyh vbeh epag'
  }
});

// Create email options

//<img src="https://email-tracker-x6i3.onrender.com/track?email=${encodeURIComponent(toEmail)}" alt="." width="1" height="1" style="display:none;" />

function sendEmail(toEmail) {
    // Create email options with dynamic 'to' email
    const mailOptions = {
      from: 'sppathak1428@gmail.com',  // Your email
      to: toEmail,  // Recipient's email passed as a parameter
      subject: 'Email with tracking pixel',
      html: `
        <h1>Hello,</h1>
        <p>This email contains a tracking pixel!</p>
        <img src="http://localhost:3000/track?email=${encodeURIComponent(toEmail)}" alt="." width="1" height="1" style="display:none;" />
      `
    };
  
    // Send the email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Error occurred: ', error);
      } else {
        console.log(`Email sent to ${toEmail}:`, info.response);
      }
    });
  }
  
  // Example usage: Sending to a dynamic email address
  const recipientEmail = 'spsourabh1428@gmail.com';
  sendEmail(recipientEmail);