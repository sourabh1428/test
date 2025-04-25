/**
 * Simple Proxy Server
 * 
 * This script creates a proxy server that forwards requests from the frontend port (5174)
 * to the backend port (8080). This solves the port mismatch issue without requiring changes
 * to either the frontend or backend code.
 * 
 * Run with: node proxy.js
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
require('dotenv').config();

// Configuration
const FRONTEND_PORT = 5174; // The port your frontend is expecting
const BACKEND_PORT = process.env.PORT || 8080; // The port your backend is running on

// Create a new express server
const app = express();

// Enable CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Create a proxy for all requests
app.use('/', createProxyMiddleware({
  target: `http://localhost:${BACKEND_PORT}`,
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    // Log the request body if it's a POST request
    if (req.method === 'POST' && req.body) {
      console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`[${new Date().toISOString()}] Response: ${proxyRes.statusCode}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error', message: err.message });
  }
}));

// Start the server
app.listen(FRONTEND_PORT, () => {
  console.log(`
🚀 Proxy server is running!

Forwarding requests from:
  http://localhost:${FRONTEND_PORT} (Frontend)
To:
  http://localhost:${BACKEND_PORT} (Backend)

Your curl commands to port ${FRONTEND_PORT} will now be proxied to port ${BACKEND_PORT}
  `);
});

// Handle errors
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
}); 