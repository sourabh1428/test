const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config()
const qs = require('qs');
// creating the campaigns and sending to the users



const { URLSearchParams } = require('url');
const { json } = require('body-parser');



router.post('/sendWhatsappTemplateMessage', async (req, res) => {
    let { templateID:templateID, destinationPhone, params,type, fileLink,cta_url,ctaUrlText,ctaUrl } = req.body;
    templateID+="";
    const allParams=JSON.stringify(params);
    

            let data = qs.stringify({
            'channel': 'whatsapp',
            'source': `${process.env.GUPSHUP_sourcePhoneNumber}`,
            'destination': `${destinationPhone}`,
            'src.name': `${process.env.GUPSHUP_APP_ID}`,
            'template': `{"id":"${templateID}","params":${allParams}}`,
            'type':'cta_url','display_text':`${ctaUrlText}`,"url":`${ctaUrl}`,
            'message': JSON.stringify({
                type: `${type}`,
                [type]: {
                    link: fileLink || '', // Use imageLink if provided, otherwise default to empty string or a static URL
                },
            }),
            
            });
            console.log(cta_url);
            
            if (cta_url) {
                data['cta'] = JSON.stringify({
                    type: 'cta_url',
                    display_text: ctaUrlText,
                    url: ctaUrl,
                });
            }
        

            let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://api.gupshup.io/wa/api/v1/template/msg',
            headers: { 
                'Cache-Control': 'no-cache', 
                'Content-Type': 'application/x-www-form-urlencoded', 
                'apikey': `${process.env.GUPSHUP_API_KEY}`, 
     
            },
            data : data
            };

            axios.request(config)
            .then((response) => {
            console.log(JSON.stringify(response.data));
            res.send(response.data);
            })
            .catch((error) => {
                res.send(error.message);
            console.log(error);
            });



  });
  
  



module.exports = router;