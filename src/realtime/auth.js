const axios = require('axios');
const { getProviderConfig } = require('./providers');

class AuthManager {
  constructor() {
    this.token = null;
    this.username = null;
    this.provider = null;
  }

  // Get authentication token from various sources
  async getAuthToken() {
    // Try to get token from command line arguments first
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
      const config = getProviderConfig(credentials.provider);
      let response;

      if (credentials.usePassword) {
        // Use password authentication
        response = await axios.post(
          'https://userapi.topstepx.com/Login',
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
        this.token = response.data.token;
        this.username = credentials.username;
        this.provider = credentials.provider;
        return this.token;
      } else {
        throw new Error(response.data.errorMessage || 'Authentication failed');
      }
    } catch (error) {
      console.error('Authentication error:', error.message);
      return null;
    }
  }

  // Login with explicit credentials
  async login(username, credential, provider = 'topstepx', usePassword = false) {
    try {
      const config = getProviderConfig(provider);
      let response;

      if (usePassword) {
        response = await axios.post(
          'https://userapi.topstepx.com/Login',
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
        this.token = response.data.token;
        this.username = username;
        this.provider = provider;
        console.log(`✅ Successfully authenticated as ${username} with ${provider}`);
        return this.token;
      } else {
        throw new Error(response.data.errorMessage || 'Authentication failed');
      }
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

