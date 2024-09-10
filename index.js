

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
const mailOptions = {
  from: 'sppathak1428@gmail.com',
  to: 'sppathak14288@gmail.com',
  subject: 'Email with tracking pixel',
  html: `
    <h1>Hello,</h1>
    <p>This email contains a tracking pixel!</p>
    <img src=http://your-server.com/track?email=${to}" alt="." width="1" height="1" style="display:none;" />
  `
};

// Send the email
transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.log('Error occurred: ', error);
  } else {
    console.log('Email sent: ', info.response);
  }
});
