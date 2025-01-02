const rateLimit = require('express-rate-limit')

// General rate limiter for all routes
const generalLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,  // 2 minutes
  max: 120,                 // Limit each IP to 120 requests per window
  standardHeaders: true,    // Return rate limit info in headers
  legacyHeaders: false      // Disable X-RateLimit headers
})

module.exports = { generalLimiter }
