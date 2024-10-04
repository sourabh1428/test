module.exports = {
    apps: [
      {
        name: 'marketme',
        script: './index.js',
        env: {
          JWT_SECRET: process.env.JWT_SECRET || 'default_jwt_secret',
          MONGODB_URI: "mongodb+srv://sppathak1428:1vmAkV1LIypO4bVQ@cluster0.hldmans.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0" || 'mongodb://localhost:27017/mydatabase',
          NAME: process.env.NAME || 'default_name',
          PORT: process.env.PORT || 3000,
          REDIS_PASSWORD: process.env.REDIS_PASSWORD || 'default_redis_password',
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
  