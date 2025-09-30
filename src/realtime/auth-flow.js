const TokenManager = require('./token-manager');

class AuthFlow {
  constructor(tokenFilePath = './auth-token.json') {
    this.tokenManager = new TokenManager(tokenFilePath);
  }

  /**
   * Main authentication function that always returns a valid token
   * This function will:
   * 1. Check if there's a valid token in storage
   * 2. If token is expired, refresh it automatically
   * 3. If no token or refresh fails, throw an error
   *
   * @returns {Promise<string>} Valid authentication token
   * @throws {Error} If unable to get a valid token
   */
  async getValidAuthToken() {
    try {
      const token = await this.tokenManager.getValidToken();

      if (!token) {
        throw new Error(
          'No valid authentication token available. Please login first using:\n' +
          '  authFlow.login(username, credential, provider, usePassword)\n' +
          'or provide credentials via environment variables/command line.'
        );
      }

      return token;
    } catch (error) {
      console.error('❌ Failed to get valid auth token:', error.message);
      throw error;
    }
  }

  /**
   * Login and store credentials for automatic token refresh
   * @param {string} username - Username
   * @param {string} credential - Password or API key
   * @param {string} provider - Provider name (default: 'topstepx')
   * @param {boolean} usePassword - Use password auth instead of API key (default: false)
   * @returns {Promise<string>} Authentication token
   */
  async login(username, credential, provider = 'topstepx', usePassword = false) {
    return await this.tokenManager.login(username, credential, provider, usePassword);
  }

  /**
   * Check if user is currently authenticated
   * @returns {Promise<boolean>} True if authenticated with valid token
   */
  async isAuthenticated() {
    return await this.tokenManager.isTokenValid();
  }

  /**
   * Logout and clear stored credentials
   */
  async logout() {
    await this.tokenManager.clearToken();
    console.log('✅ Logged out successfully');
  }

  /**
   * Get current token information
   * @returns {Object|null} Token data or null if not available
   */
  getCurrentTokenInfo() {
    const tokenData = this.tokenManager.getCurrentTokenData();
    if (!tokenData) return null;

    return {
      username: tokenData.username,
      provider: tokenData.provider,
      expiresAt: new Date(tokenData.expiresAt).toISOString(),
      isExpired: Date.now() >= tokenData.expiresAt
    };
  }

  /**
   * Force refresh token (useful for testing or manual refresh)
   * @returns {Promise<string|null>} New token or null if refresh failed
   */
  async forceRefreshToken() {
    return await this.tokenManager.refreshToken();
  }
}

// Export a singleton instance for easy use
const authFlow = new AuthFlow();

module.exports = {
  AuthFlow,
  authFlow
};

// Usage examples:
/*
const { authFlow } = require('./auth-flow');

// Login once
await authFlow.login('your-username', 'your-api-key-or-password', 'topstepx', false);

// Then anywhere in your app, just call this to get a valid token:
const token = await authFlow.getValidAuthToken();

// The function will automatically:
// - Return existing token if valid
// - Refresh token if expired
// - Throw error if unable to get valid token
*/