// index.js
require('dotenv').config()
const express = require('express');

const cors = require('cors'); // Import cors package
const router = express.Router();


const {authenticateJWT}= require('./middleware');
const rateLimit = require('express-rate-limit');
const app = express();
app.use(express.json());
const authRoute = require('./routes/Auth.js');
const validateApiKey = require('./routes/DBauth.js');

require('dotenv').config()

const { MongoClient } = require('mongodb');

// Use process.env to access environment variables
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
    console.error('MONGODB_URI is not defined');
    process.exit(1); // Exit the application if the variable is not set
}


console.log(process.env.MONGODB_URI);

const port = 8080 || process.env.PORT ;



app.use(cors());
app.use(express.json());
// Import routes

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes"
});

// Apply rate limiter to all requests
router.use(apiLimiter);


const routes = require('./routes/users.js');
const email = require('./routes/Email.js');
const eventRoutes=require('./routes/events.js');

const campaignRoutes = require('./routes/campaign.js');
const { validate } = require('./Modal.js');


// Use routes1


app.use('/auth', validateApiKey,authRoute);
app.use('/',validateApiKey,routes);
app.use('/events',validateApiKey, eventRoutes);
app.use('/campaigns',validateApiKey ,campaignRoutes);
app.use('/auth',validateApiKey,authRoute );
app.use('/email',validateApiKey, email);

app.use('/keep-alive',(req,res)=>{
  res.json({"data":"Main server is Alive"});
})
app.post('/api/compile-mjml', (req, res) => {
  const { mjml } = req.body;
  const { html, errors } = mjml2html(mjml);
  if (errors.length) {
    return res.status(400).json({ errors });
  }
  res.json({ html });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});



//segment refresh every 10 segments

// async function hue(){
//   let ans=[];
//   ans=await getAllCampaigns();

//       for(let i=0;i<ans.length;i++){
//           let x=UIS(ans[i].segment_id);
//           console.log("segment refreshed it's segment id: "+ans[i].segment_id);
       
//       }

// }

// setInterval(() => {
//   hue();
// }, 10000);





// redis


