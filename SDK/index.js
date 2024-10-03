const axios = require("axios");



// require('dotenv').config();

const RequestQueue = require("./requestHandler");

const requestQueue = new RequestQueue(); // Set interval to 2000ms







function getAuthToken() {
    // Replace this with your actual method to retrieve the token
    return '123'; // For example purposes
}




function wrapWithQueue(func) {
    return async function(...args) {
        return new Promise((resolve, reject) => {
            requestQueue.add(async () => {
                try {
                    const result = await func(...args);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
        });
    };
}

// Configure Bottleneck
async function getAllUsers() {
    try {
        const response = await fetch("http://backend.marketme.site/users", {
            headers: {
               'x-api-key': `${getAuthToken()}`
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const users = await response.json();
        console.log(users);
        return users;
    } catch (error) {
        console.error("Error fetching users:", error);
    }
}

async function postUsers(name, email, ID) {
    try {
        const response = await axios.post("http://backend.marketme.site/postUser", {
            name: name,
            email: email,
            ID: ID
        }, {
            headers: {
               'x-api-key': `${getAuthToken()}`
            }
        });

        console.log("User added successfully:", response.data);
    } catch (error) {
        console.error("Error posting user:", error);
    }
}

async function addEventByUser(MMID, eventName) {
    try {
        const response = await axios.post("http://backend.marketme.site/events/addEvent", {
            MMID: MMID,
            eventName: eventName
        }, {
            headers: {
         'x-api-key': `${getAuthToken()}`
            }});
        // let campaignData=await smartTrigger(MMID,eventName); // Trigger OSM after event is created

        // if(campaignData)await ShowOSM(campaignData);
        
        return campaignData;
    } catch (error) {
        console.log(error);
    }
}

async function getUserEvents(MMID) {
    try {
        const response = await axios.get(`http://backend.marketme.site/events/userEvents?MMID=${MMID}`, {
            headers: {
             'x-api-key': `${getAuthToken()}`
            }});
        console.log(response.data);
        return response.data;
    } catch (error) {
        console.log(error);
    }
}


async function getAllCampaigns(){
    try{

        const response = await axios.get("http://backend.marketme.site/campaigns/getAllCampaign", {
            headers: {
              'x-api-key': `${getAuthToken()}`
            }});
    
        let allCampaignsData = await response.data;
        localStorage.setItem('campaigns', JSON.stringify(allCampaignsData)); // Store as JSON string
    }catch(error){
        console.log(error);
    }
}

async function getParticularCampaign(data) {
    try {
      const response = await axios.post("http://backend.marketme.site/campaigns/getParticularCampaign", {
        cid: data
      }, {
        headers: {
          'x-api-key': `${getAuthToken()}`
        }});
      return response.data; // Return the actual data
    } catch (error) {
      console.error("Error fetching campaign:", error); // Log the error
      throw error; // Optionally, rethrow the error if you want to handle it further up the chain
    }
  }
  
async function postCampaign(type,event,description,name,imageURL){
  
    try{


        const response = await axios.post("http://backend.marketme.site/campaigns/postCampaign",{
            type:type,
            event:event,
            description:description,
            name:name,
            imageURL:imageURL
        }, {
            headers: {
               'x-api-key': `${getAuthToken()}`
            }});
       

        let users=await UIS(response.data);
        const campaigns = await response.data;
        if(users && campaigns){
        console.log("Campaign created successfully",users);
    }
        return campaigns;


    }catch(error){
        console.log(error);
    }



}


//              /UIS/:segment_id

async function UIS(segment_id){
    console.log("UIS----------------------------------------------------------------");
    console.log(segment_id , "--------------------------------");
    try{
        
       

              let allUser=  fetch(`http://backend.marketme.site/campaigns/UIS/${segment_id}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': `${getAuthToken()}`

                    },
                    body: JSON.stringify({ some: 'data' })
                })
                .then(response => response.json())
                .then(data =>data)
                .catch(error => console.error('Error:', error));


                return allUser;

    }catch(error){

            console.log("UIS FAILURE");

    }



}

async function updateAnalytics(cid){

    try{
        const response=await axios.post(`http://backend.marketme.site/campaigns/updateAnalytics`,{
            cid:cid
        }, {
            headers: {
                'x-api-key': `${getAuthToken()}`
            }});
        console.log("Analytics updated successfully",response.data);
        return response.data;
    }catch(error){
        console.log(error);
    }


}





async function getCampaignsForUser(MMID){
    try{
    const response=await axios.get(`http://backend.marketme.site/campaigns/getCampaignsForUser?MMID=${MMID}`, {
        headers: {
            'x-api-key': `${getAuthToken()}`
        }})
    return response.data;    
}catch(error){
        
    console.log("Error while getting campaigns for "," ", MMID);
    }

}





async function smartTrigger(MMID, eventName) {
    try {
        const userCampaignList = await getCampaignsForUser(MMID);
        
        
        // Ensure userCampaignList is not empty
        if (userCampaignList && userCampaignList.length > 0) {
            for (let i = 0; i < userCampaignList.length; i++) {
                let campaign = await getParticularCampaign(userCampaignList[i]);


                if (campaign.imageURL && campaign.event === eventName) {
                    console.log("Matched Campaign:", campaign.segment_id);
                    updateAnalytics(campaign.segment_id);
                    ShowOSM(campaign.imageURL)
                    return campaign.imageURL; // Directly return the imageURL
                }
            }
            console.log("No matching campaign found");
            return null; // Return null if no matching campaign is found
        } else {
            console.log("User campaign list is empty or undefined");
            return null;
        }
    } catch (error) {
        console.log("Error fetching the campaign:", error);
        return undefined; // Explicitly return undefined in case of an error
    }
}

async function ShowOSM(eventName) {
    let cdata=JSON.parse(localStorage.getItem("campaigns"));
    let req=cdata.filter((e)=>e.event===eventName);
    
    let redirectUrl="www.google.com"
    let pdata=req[0].imageURL;
    if(pdata){
    // Ensure redirectUrl is absolute by adding protocol if missing
    if (!/^https?:\/\//i.test(redirectUrl)) {
        redirectUrl = `https://${redirectUrl}`;
    }

    
    // Create and style the overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Darker semi-transparent background
    overlay.style.backdropFilter = 'blur(8px)'; // Apply a smooth blur effect
    overlay.style.zIndex = '9998'; // Just below the image
    overlay.style.transition = 'opacity 0.3s ease'; // Smooth fade-in transition
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.opacity = '1'; }, 0); // Trigger transition

    // Create and style the image
    const imgElement = document.createElement('img');
    imgElement.src = pdata;
    imgElement.style.position = 'fixed';
    imgElement.style.top = '40%'; // Adjusted to make space for the button
    imgElement.style.left = '50%';
    imgElement.style.transform = 'translate(-50%, -50%) scale(0)';
    imgElement.style.zIndex = '9999'; // Higher z-index for the image
    imgElement.style.width = '200px'; // Slightly larger width for better visibility
    imgElement.style.height = 'auto'; // Maintain aspect ratio
    imgElement.style.borderRadius = '15px'; // Rounded corners for a modern look
    imgElement.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)'; // Subtle shadow for depth
    imgElement.style.transition = 'transform 0.3s ease'; // Smooth scale transition
    setTimeout(() => { imgElement.style.transform = 'translate(-50%, -50%) scale(1)'; }, 0); // Trigger scale animation

    // Create and style the close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;'; // Unicode for 'X'
    closeButton.style.position = 'fixed';
    closeButton.style.top = '15px';
    closeButton.style.right = '15px';
    closeButton.style.zIndex = '10000'; // Ensure it's above everything else
    closeButton.style.background = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = 'white';
    closeButton.style.fontSize = '30px';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.cursor = 'pointer';
    closeButton.style.transition = 'color 0.3s ease';
    closeButton.addEventListener('mouseover', function() {
        closeButton.style.color = '#ff4c4c'; // Change color on hover for interactivity
    });
    closeButton.addEventListener('mouseout', function() {
        closeButton.style.color = 'white'; // Revert color after hover
    });

    // Add click event to close the OSM
    closeButton.addEventListener('click', function() {
        // Fade out the overlay and image before removing
        overlay.style.opacity = '0';
        imgElement.style.transform = 'translate(-50%, -50%) scale(0)';
        setTimeout(() => {
            const osmElement = document.getElementById('MarketMeShowOsm');
            osmElement.innerHTML = ''; // Clear the OSM content
        }, 300); // Match the transition duration
    });

    // Create and style the "Click Here" button
    const clickButton = document.createElement('button');
    clickButton.innerHTML = 'Click Here';
    clickButton.style.position = 'fixed';
    clickButton.style.top = '60%'; // Below the image
    clickButton.style.left = '50%';
    clickButton.style.transform = 'translate(-50%, -50%)';
    clickButton.style.zIndex = '9999';
    clickButton.style.background = '#ff4c4c';
    clickButton.style.border = 'none';
    clickButton.style.color = 'white';
    clickButton.style.padding = '10px 20px';
    clickButton.style.borderRadius = '25px';
    clickButton.style.cursor = 'pointer';
    clickButton.style.fontSize = '16px';
    clickButton.style.fontWeight = 'bold';
    clickButton.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.2)';
    clickButton.style.transition = 'background 0.3s ease';
    clickButton.addEventListener('mouseover', function() {
        clickButton.style.background = '#e04343'; // Slightly darker on hover
    });
    clickButton.addEventListener('mouseout', function() {
        clickButton.style.background = '#ff4c4c'; // Revert color after hover
    });

    // Add click event to redirect to the specified URL
    clickButton.addEventListener('click', function() {
        window.location.href = redirectUrl;
    });

    // Get the target element and clear previous content
    const osmElement = document.getElementById('MarketMeShowOsm');
    osmElement.innerHTML = '';

    // Append the overlay, image, close button, and "Click Here" button to the target element
    osmElement.appendChild(overlay);
    osmElement.appendChild(imgElement);
    osmElement.appendChild(closeButton);
    osmElement.appendChild(clickButton);
    await updateAnalytics(req[0].segment_id);
}
}


// setgmentation refresh in every 10 seconds



    

    // UIS()







// initialize click tracking











  





// Wrap each function with the rate limiter and queue

module.exports = { 
    getCampaignsForUser:wrapWithQueue(getCampaignsForUser),
    getAllUsers: wrapWithQueue(getAllUsers), 
    postUsers: wrapWithQueue(postUsers), 
    addEventByUser: wrapWithQueue(addEventByUser), 
    getUserEvents: wrapWithQueue(getUserEvents),
   
    getAllCampaigns: wrapWithQueue(getAllCampaigns),
    UIS: wrapWithQueue(UIS),
    getParticularCampaign:wrapWithQueue(getParticularCampaign),
    smartTrigger:wrapWithQueue(smartTrigger),
    ShowOSM: wrapWithQueue(ShowOSM),
    updateAnalytics:wrapWithQueue(updateAnalytics),

    getQueueSize: () => requestQueue.getQueueSize()
};