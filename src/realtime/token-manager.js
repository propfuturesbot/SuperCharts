const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { getProviderConfig } = require('./providers');

class TokenManager {
  constructor(tokenFilePath = './auth-token.json') {
    this.tokenFilePath = path.resolve(tokenFilePath);
    this.tokenData = null;
  }

  /**
   * Save token data to JSON file
   * @param {Object} tokenData - Token data object
   * @param {string} tokenData.token - Authentication token
   * @param {string} tokenData.username - Username
   * @param {string} tokenData.provider - Provider name
   * @param {number} tokenData.expiresAt - Token expiration timestamp
   * @param {Object} tokenData.credentials - Stored credentials for refresh
   */
  async saveToken(tokenData) {
    try {
      const dataToSave = {
        token: tokenData.token,
        username: tokenData.username,
        provider: tokenData.provider,
        expiresAt: tokenData.expiresAt || (Date.now() + 24 * 60 * 60 * 1000), // Default 24 hours
        savedAt: Date.now(),
        credentials: tokenData.credentials || null
      };

      await fs.writeFile(this.tokenFilePath, JSON.stringify(dataToSave, null, 2));
      this.tokenData = dataToSave;
      console.log(`✅ Token saved to ${this.tokenFilePath}`);
    } catch (error) {
      console.error('❌ Failed to save token:', error.message);
      throw error;
    }
  }

  /**
   * Load token data from JSON file
   * @returns {Object|null} Token data or null if not found/invalid
   */
  async loadToken() {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf8');
      this.tokenData = JSON.parse(data);
      return this.tokenData;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📄 No token file found');
      } else {
        console.error('❌ Failed to load token:', error.message);
      }
      this.tokenData = null;
      return null;
    }
  }

  /**
   * Check if current token is valid (exists and not expired)
   * @returns {boolean} True if token is valid
   */
  async isTokenValid() {
    if (!this.tokenData) {
      await this.loadToken();
    }

    if (!this.tokenData || !this.tokenData.token) {
      return false;
    }

    // Check if token has expired
    if (Date.now() >= this.tokenData.expiresAt) {
      console.log('⏰ Token has expired');
      return false;
    }

    return true;
  }

  /**
   * Refresh token using stored credentials
   * @returns {string|null} New token or null if refresh failed
   */
  async refreshToken() {
    if (!this.tokenData || !this.tokenData.credentials) {
      console.log('❌ No stored credentials available for token refresh');
      return null;
    }

    try {
      const credentials = this.tokenData.credentials;
      const config = getProviderConfig(credentials.provider || 'topstepx');
      let response;

      console.log('🔄 Refreshing token...');

      if (credentials.usePassword) {
        // Use password authentication
        response = await axios.post(
          `${config.userapi_endpoint}/Login`,
          {
            userName: credentials.username,
            password: credentials.password
          },
          {
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      } else {
        // Use API key authentication
        response = await axios.post(
          `${config.api_endpoint}/api/Auth/loginKey`,
          {
            userName: credentials.username,
            apiKey: credentials.apiKey
          },
          {
            headers: {
              'accept': 'text/plain',
              'Content-Type': 'application/json'
            }
          }
        );
      }

      if (response.data.success || response.data.token) {
        const newTokenData = {
          token: response.data.token,
          username: credentials.username,
          provider: credentials.provider || 'topstepx',
          expiresAt: response.data.expiry || (Date.now() + 24 * 60 * 60 * 1000),
          credentials: credentials
        };

        await this.saveToken(newTokenData);
        console.log('✅ Token refreshed successfully');
        return response.data.token;
      } else {
        throw new Error(response.data.errorMessage || 'Token refresh failed');
      }
    } catch (error) {
      console.error('❌ Token refresh failed:', error.message);
      return null;
    }
  }

  /**
   * Get current valid token - returns existing token or refreshes if expired
   * @returns {string|null} Valid authentication token or null if unable to get one
   */
  async getValidToken() {
    // Check if current token is valid
    if (await this.isTokenValid()) {
      console.log('✅ Using existing valid token');
      return this.tokenData.token;
    }

    // Try to refresh token
    const newToken = await this.refreshToken();
    if (newToken) {
      return newToken;
    }

    console.log('❌ Unable to get valid token');
    return null;
  }

  /**
   * Login and store token with credentials for future refresh
   * @param {string} username - Username
   * @param {string} credential - Password or API key
   * @param {string} provider - Provider name (default: 'topstepx')
   * @param {boolean} usePassword - Use password auth instead of API key (default: false)
   * @returns {string} Authentication token
   */
  async login(username, credential, provider = 'topstepx', usePassword = false) {
    try {
      const config = getProviderConfig(provider);
      let response;

      console.log(`🔐 Logging in as ${username} with ${provider}...`);

      if (usePassword) {
        response = await axios.post(
          `${config.userapi_endpoint}/Login`,
          {
            userName: username,
            password: credential
          },
          {
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      } else {
        response = await axios.post(
          `${config.api_endpoint}/api/Auth/loginKey`,
          {
            userName: username,
            apiKey: credential
          },
          {
            headers: {
              'accept': 'text/plain',
              'Content-Type': 'application/json'
            }
          }
        );
      }

      if (response.data.success || response.data.token) {
        const tokenData = {
          token: response.data.token,
          username: username,
          provider: provider,
          expiresAt: response.data.expiry || (Date.now() + 24 * 60 * 60 * 1000),
          credentials: {
            username: username,
            [usePassword ? 'password' : 'apiKey']: credential,
            provider: provider,
            usePassword: usePassword
          }
        };

        await this.saveToken(tokenData);
        console.log(`✅ Successfully authenticated and token saved`);
        return response.data.token;
      } else {
        throw new Error(response.data.errorMessage || 'Authentication failed');
      }
    } catch (error) {
      console.error('❌ Login failed:', error.message);
      throw error;
    }
  }

  /**
   * Clear stored token and credentials
   */
  async clearToken() {
    try {
      await fs.unlink(this.tokenFilePath);
      this.tokenData = null;
      console.log('✅ Token file cleared');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Failed to clear token file:', error.message);
      }
    }
  }

  /**
   * Get current token data
   * @returns {Object|null} Current token data
   */
  getCurrentTokenData() {
    return this.tokenData;
  }
}

module.exports = TokenManager;