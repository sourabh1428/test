/**
 * Rate Limiter Service
 * 
 * A token bucket implementation of rate limiting for API requests.
 * Can be used to enforce rate limits per tenant for external API calls.
 */

class RateLimiter {
  /**
   * Constructor for RateLimiter
   * 
   * @param {Object} options - Configuration options
   * @param {number} options.tokensPerInterval - Number of tokens added per interval
   * @param {number} options.interval - Interval in milliseconds
   * @param {number} [options.maxTokens] - Maximum number of tokens that can be accumulated
   * @param {boolean} [options.enabled=true] - Whether rate limiting is enabled
   */
  constructor(options) {
    this.tokensPerInterval = options.tokensPerInterval || 60; // Default: 60 req/minute
    this.interval = options.interval || 60 * 1000; // Default: 1 minute
    this.maxTokens = options.maxTokens || this.tokensPerInterval;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    
    this.tokens = this.maxTokens; // Start with full tokens
    this.lastRefill = Date.now();
  }
  
  /**
   * Refill tokens based on elapsed time since last refill
   * 
   * @private
   */
  _refillTokens() {
    const now = Date.now();
    const elapsedTime = now - this.lastRefill;
    
    if (elapsedTime >= this.interval) {
      // If more than one interval has passed, refill entirely
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    } else {
      // Partial refill based on elapsed time
      const newTokens = elapsedTime * (this.tokensPerInterval / this.interval);
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }
  
  /**
   * Try to consume tokens for a request
   * 
   * @param {number} [tokensToConsume=1] - Number of tokens to consume
   * @returns {boolean} - Whether the request can proceed
   */
  tryConsume(tokensToConsume = 1) {
    // Skip rate limiting if disabled
    if (!this.enabled) return true;
    
    this._refillTokens();
    
    if (this.tokens >= tokensToConsume) {
      this.tokens -= tokensToConsume;
      return true;
    }
    
    return false;
  }
  
  /**
   * Get the wait time in ms until tokens will be available
   * 
   * @param {number} [tokensNeeded=1] - Number of tokens needed
   * @returns {number} - Time in milliseconds to wait, 0 if tokens are available now
   */
  getWaitTime(tokensNeeded = 1) {
    // Skip rate limiting if disabled
    if (!this.enabled) return 0;
    
    this._refillTokens();
    
    if (this.tokens >= tokensNeeded) return 0;
    
    const tokensRequired = tokensNeeded - this.tokens;
    return Math.ceil(tokensRequired * (this.interval / this.tokensPerInterval));
  }
  
  /**
   * Enable or disable rate limiting
   * 
   * @param {boolean} enabled - Whether to enable rate limiting
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  
  /**
   * Update rate limiter configuration
   * 
   * @param {Object} options - New configuration options
   */
  updateConfig(options) {
    if (options.tokensPerInterval) {
      this.tokensPerInterval = options.tokensPerInterval;
    }
    
    if (options.interval) {
      this.interval = options.interval;
    }
    
    if (options.maxTokens) {
      this.maxTokens = options.maxTokens;
    }
    
    if (options.enabled !== undefined) {
      this.enabled = options.enabled;
    }
    
    // Reset tokens to max after configuration change
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

module.exports = {
  RateLimiter
}; 