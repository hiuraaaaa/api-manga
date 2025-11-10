const express = require('express');
const app = express();
const cors = require('cors');
const helmet = require('helmet').default;
const { router } = require('./router');
require('dotenv').config();

// Trust proxy for rate limiting (if behind reverse proxy)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Routes
app.use(router);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
