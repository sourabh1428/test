module.exports = {
    apps: [
      {
        name: 'index',               // The name of your app (as it will appear in PM2)
        script: './index.js',        // The path to the main entry point of your application
        instances: 1,                // Number of instances to run (use 'max' for auto-scaling)
        autorestart: true,           // Automatically restart if the app crashes
        watch: false,                // Watch for file changes (use true or specify directories)
        max_memory_restart: '1G',    // Restart the app if it exceeds 1GB memory usage
        env: {                       // Environment variables for default mode
          NODE_ENV: 'development',
          NAME: process.env.name,
          PORT: 3000
        },
        env_production: {            // Environment variables for production mode
          NODE_ENV: 'production',
          PORT: 8080
        }
      }
    ]
  };
  