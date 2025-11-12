const express = require('express');
const path = require('path');
const app = express();
const cors = require('cors');
const helmet = require('helmet').default;
const { router } = require('./router');
require('dotenv').config();

// Trust proxy for rate limiting (if behind reverse proxy)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
    },
  },
}));
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve dashboard static files
app.use('/dashboard', express.static(path.join(__dirname, '../public/dashboard')));

// Routes
app.use(router);

// Vercel serverless function handler
module.exports = app;

// Start server only if not in Vercel environment
if (process.env.VERCEL !== '1' && !process.env.VERCEL_ENV) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
