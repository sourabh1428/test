module.exports = {
  apps: [
    {
      name: 'index',
      script: './index.js',
      instances: 'max',                // Auto-scale the number of instances
      watch: true,                     // Watch for file changes
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080
      }
    }
  ]
};
