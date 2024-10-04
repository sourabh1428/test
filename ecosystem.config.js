module.exports = {
    apps: [
      {
        name: 'marketme',
        script: './index.js',
        env: {
          JWT_SECRET: 'eyJhbGciOiJIUzI1NiJ9.eyJSb2xlIjoiQWRtaW4iLCJJc3N1ZXIiOiJJc3N1ZXIiLCJVc2VybmFtZSI6IkphdmFJblVzZSIsImV4cCI6MTcyMzM3MTY1NywiaWF0IjoxNzIzMzcxNjU3fQ.AIKV8QSfQQkCELxyHv-9yUexPtrpMHjp4Jnw3KvK0Kc',
          MONGODB_URI: "mongodb+srv://sppathak1428:1vmAkV1LIypO4bVQ@cluster0.hldmans.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
          NAME: process.env.NAME || 'default_name',
          PORT: process.env.PORT || 3000,
          REDIS_PASSWORD: '1cMKw4NGx2tBQC69VMWJBqrVgP6ZaBWB',
        },
        env_production: {
          JWT_SECRET: process.env.JWT_SECRET,
          MONGODB_URI: process.env.MONGODB_URI,
          NAME: process.env.NAME,
          PORT: process.env.PORT,
          REDIS_PASSWORD: process.env.REDIS_PASSWORD,
        }
      }
    ]
  };
  