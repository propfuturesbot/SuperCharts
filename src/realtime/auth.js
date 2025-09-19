const axios = require('axios');
const { getProviderConfig } = require('./providers');
const TokenManager = require('./token-manager');

class AuthManager {
  constructor() {
    this.token = null;
    this.username = null;
    this.provider = null;
    this.tokenManager = new TokenManager();
  }

  // Get authentication token from various sources
  async getAuthToken() {
    // First try to get valid token from token manager (checks existing + refresh)
    const validToken = await this.tokenManager.getValidToken();
    if (validToken) {
      console.log('✅ Using valid token from token manager');
      this.token = validToken;
      return validToken;
    }

    // Try to get token from command line arguments
    const tokenFromArgs = this.getTokenFromArgs();
    if (tokenFromArgs) {
      console.log('✅ Using token from command line arguments');
      return tokenFromArgs;
    }

    // Try to get token from environment variables
    const tokenFromEnv = process.env.AUTH_TOKEN || process.env.ACCESS_TOKEN;
    if (tokenFromEnv) {
      console.log('✅ Using token from environment variables');
      return tokenFromEnv;
    }

    // Try to get stored credentials and login
    const storedCreds = this.getStoredCredentials();
    if (storedCreds) {
      console.log('🔄 Found stored credentials, attempting login...');
      const token = await this.loginWithStoredCredentials(storedCreds);
      if (token) {
        console.log('✅ Successfully authenticated with stored credentials');
        return token;
      }
    }

    // If no token available, throw error
    throw new Error('No authentication token available. Please provide token via:\n' +
      '  - Command line: --token <token>\n' +
      '  - Environment: AUTH_TOKEN=<token>\n' +
      '  - Or ensure you have valid stored credentials');
  }

  // Get token from command line arguments
  getTokenFromArgs() {
    const args = process.argv;
    const tokenIndex = args.findIndex(arg => arg === '--token' || arg === '-t');
    if (tokenIndex !== -1 && tokenIndex + 1 < args.length) {
      return args[tokenIndex + 1];
    }
    return null;
  }

  // Get provider from command line arguments or default
  getProviderFromArgs() {
    const args = process.argv;
    const providerIndex = args.findIndex(arg => arg === '--provider' || arg === '-p');
    if (providerIndex !== -1 && providerIndex + 1 < args.length) {
      return args[providerIndex + 1];
    }
    return process.env.PROVIDER || 'topstepx';
  }

  // Get stored credentials (this would work in browser environment)
  getStoredCredentials() {
    // In a Node.js environment, we could read from a config file
    // For now, return null - this would be enhanced later
    try {
      // Check if we're in a browser-like environment with localStorage
      if (typeof localStorage !== 'undefined') {
        const username = localStorage.getItem('username');
        const authType = localStorage.getItem('saved_auth_type') || 'apikey';
        const provider = localStorage.getItem('provider') || 'topstepx';
        
        if (username) {
          if (authType === 'password') {
            const password = localStorage.getItem('saved_password');
            if (password) {
              return {
                username,
                password: atob(password),
                provider,
                usePassword: true
              };
            }
          } else {
            const apiKey = localStorage.getItem('saved_api_key');
            if (apiKey) {
              return {
                username,
                apiKey: atob(apiKey),
                provider,
                usePassword: false
              };
            }
          }
        }
      }
    } catch (error) {
      // localStorage not available in Node.js environment
    }
    
    return null;
  }

  // Login with stored credentials
  async loginWithStoredCredentials(credentials) {
    try {
      const credential = credentials.usePassword ? credentials.password : credentials.apiKey;
      const token = await this.tokenManager.login(
        credentials.username,
        credential,
        credentials.provider,
        credentials.usePassword
      );

      // Update local properties
      this.token = token;
      this.username = credentials.username;
      this.provider = credentials.provider;

      return token;
    } catch (error) {
      console.error('Authentication error:', error.message);
      return null;
    }
  }

  // Login with explicit credentials
  async login(username, credential, provider = 'topstepx', usePassword = false) {
    try {
      // Use token manager's login method which handles JSON file storage
      const token = await this.tokenManager.login(username, credential, provider, usePassword);

      // Update local properties
      this.token = token;
      this.username = username;
      this.provider = provider;

      console.log(`✅ Successfully authenticated as ${username} with ${provider} and saved to token file`);
      return token;
    } catch (error) {
      console.error('Login error:', error.message);
      throw error;
    }
  }

  // Get current token
  getCurrentToken() {
    return this.token;
  }

  // Get current provider
  getCurrentProvider() {
    return this.provider || this.getProviderFromArgs();
  }
}

module.exports = new AuthManager();

