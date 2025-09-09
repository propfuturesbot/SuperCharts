import axios from 'axios';
import { getProviderConfig } from '../config/providers';

class AuthService {
  constructor() {
    this.token = localStorage.getItem('auth_token');
    this.username = localStorage.getItem('username');
    this.provider = localStorage.getItem('provider') || 'topstepx';
    this.apiKey = null; // Never store API key in localStorage for security
    this.rememberCredentials = localStorage.getItem('remember_credentials') === 'true';
  }

  async login(username, apiKey, provider = 'topstepx', rememberMe = false) {
    try {
      const config = getProviderConfig(provider);
      const response = await axios.post(
        `${config.api_endpoint}/api/Auth/loginKey`,
        {
          userName: username,
          apiKey: apiKey
        },
        {
          headers: {
            'accept': 'text/plain',
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        this.token = response.data.token;
        this.username = username;
        this.provider = provider;
        this.rememberCredentials = rememberMe;
        
        // Store in localStorage
        localStorage.setItem('auth_token', this.token);
        localStorage.setItem('username', username);
        localStorage.setItem('provider', provider);
        localStorage.setItem('token_expiry', response.data.expiry || Date.now() + 86400000);
        localStorage.setItem('remember_credentials', rememberMe.toString());
        
        // Store credentials for auto-fill if remember me is checked
        if (rememberMe) {
          localStorage.setItem('saved_username', username);
          localStorage.setItem('saved_provider', provider);
          // Encode API key for basic obfuscation (not security, just visual)
          localStorage.setItem('saved_api_key', btoa(apiKey));
          localStorage.setItem('credentials_saved_at', Date.now().toString());
        } else {
          // Clear saved credentials if remember me is unchecked
          this.clearSavedCredentials();
        }
        
        // Set default auth header for axios
        this.setAuthHeader();
        
        return {
          success: true,
          token: this.token,
          username: username,
          provider: provider
        };
      } else {
        throw new Error(response.data.errorMessage || 'Authentication failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw new Error(error.response?.data?.errorMessage || error.message || 'Login failed');
    }
  }

  logout(clearSavedCredentials = false) {
    this.token = null;
    this.username = null;
    this.provider = null;
    
    // Remove session data
    localStorage.removeItem('auth_token');
    localStorage.removeItem('username');
    localStorage.removeItem('provider');
    localStorage.removeItem('token_expiry');
    localStorage.removeItem('remember_credentials');
    
    // Optionally clear saved credentials (for "Forget Me" functionality)
    if (clearSavedCredentials) {
      this.clearSavedCredentials();
    }
    
    delete axios.defaults.headers.common['Authorization'];
  }

  isAuthenticated() {
    if (!this.token) return false;
    
    const expiry = localStorage.getItem('token_expiry');
    if (expiry && Date.now() > parseInt(expiry)) {
      this.logout();
      return false;
    }
    
    return true;
  }

  setAuthHeader() {
    if (this.token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    }
  }

  getToken() {
    return this.token;
  }

  getUsername() {
    return this.username;
  }

  getProvider() {
    return this.provider;
  }

  async refreshToken() {
    // Implement token refresh logic if needed
    // For now, return the existing token
    return this.token;
  }

  // Get saved credentials for auto-fill
  getSavedCredentials() {
    const savedAt = localStorage.getItem('credentials_saved_at');
    
    // Check if credentials are not too old (30 days max)
    if (savedAt && Date.now() - parseInt(savedAt) > 30 * 24 * 60 * 60 * 1000) {
      this.clearSavedCredentials();
      return null;
    }

    const username = localStorage.getItem('saved_username');
    const provider = localStorage.getItem('saved_provider');
    const encodedApiKey = localStorage.getItem('saved_api_key');

    if (username && provider && encodedApiKey) {
      try {
        return {
          username,
          provider,
          apiKey: atob(encodedApiKey), // Decode the API key
          hasApiKey: true
        };
      } catch (error) {
        console.warn('Failed to decode saved API key');
        this.clearSavedCredentials();
        return null;
      }
    }

    return null;
  }

  // Clear saved credentials
  clearSavedCredentials() {
    localStorage.removeItem('saved_username');
    localStorage.removeItem('saved_provider');
    localStorage.removeItem('saved_api_key');
    localStorage.removeItem('credentials_saved_at');
  }

  // Check if user has saved credentials
  hasSavedCredentials() {
    return this.getSavedCredentials() !== null;
  }

  // Get remember me preference
  getRememberCredentials() {
    return this.rememberCredentials;
  }
}

export default new AuthService();