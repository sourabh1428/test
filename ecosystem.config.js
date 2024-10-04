module.exports = {
    apps: [{
      name: 'marketme',
      script: 'index.js',
      env: {
        JWT_SECRET: process.env.JWT_SECRET,
        MONGODB_URI: process.env.MONGODB_URI,
        NAME: process.env.NAME,
        PORT: process.env.PORT,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      },
      env_production: {
        NODE_ENV: 'production',
      },
    }],
  };
  