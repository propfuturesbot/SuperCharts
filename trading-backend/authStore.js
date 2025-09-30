/**
 * Authentication Store
 * Manages provider credentials and tokens internally
 * Similar to how the frontend auth service works
 */

class AuthStore {
  constructor() {
    // In-memory store for current session
    // In production, this could be Redis or a database
    this.currentAuth = {
      provider: null,
      token: null,
      username: null,
      expiresAt: null
    };
  }

  /**
   * Set authentication credentials
   * This would be called after user logs in via frontend
   */
  setAuth(provider, token, username, expiresIn = 3600000) { // Default 1 hour
    this.currentAuth = {
      provider,
      token,
      username,
      expiresAt: Date.now() + expiresIn
    };
    console.log(`[AUTH] Stored credentials for ${username}@${provider}`);
    return true;
  }

  /**
   * Get current provider
   */
  getProvider() {
    if (this.isExpired()) {
      throw new Error('Authentication expired');
    }
    return this.currentAuth.provider;
  }

  /**
   * Get current token
   */
  getToken() {
    if (this.isExpired()) {
      throw new Error('Authentication expired');
    }
    return this.currentAuth.token;
  }

  /**
   * Get current username
   */
  getUsername() {
    return this.currentAuth.username;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!(this.currentAuth.provider && this.currentAuth.token && !this.isExpired());
  }

  /**
   * Check if token expired
   */
  isExpired() {
    if (!this.currentAuth.expiresAt) return true;
    return Date.now() > this.currentAuth.expiresAt;
  }

  /**
   * Clear authentication
   */
  clearAuth() {
    this.currentAuth = {
      provider: null,
      token: null,
      username: null,
      expiresAt: null
    };
    console.log('[AUTH] Cleared authentication');
  }

  /**
   * Get auth status
   */
  getStatus() {
    return {
      authenticated: this.isAuthenticated(),
      provider: this.currentAuth.provider,
      username: this.currentAuth.username,
      expiresAt: this.currentAuth.expiresAt,
      expired: this.isExpired()
    };
  }
}

// Export singleton instance
module.exports = new AuthStore();