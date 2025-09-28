// Browser-compatible authentication and provider management
class BrowserAuthManager {
  constructor() {
    this.token = null;
    this.username = null;
    this.provider = null;
  }

  // Provider configurations from global ProviderConfig
  getProviders() {
    if (window.ProviderConfig && window.ProviderConfig.getProviders) {
      return window.ProviderConfig.getProviders();
    }
    console.error('ProviderConfig not loaded. Make sure providers-browser.js is included.');
    return {};
  }

  getProviderConfig(providerKey) {
    if (window.ProviderConfig && window.ProviderConfig.getProviderConfig) {
      return window.ProviderConfig.getProviderConfig(providerKey);
    }
    console.error('ProviderConfig not loaded. Make sure providers-browser.js is included.');
    return null;
  }

  // Get current provider from localStorage or URL params
  getCurrentProvider() {
    // Check URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const urlProvider = urlParams.get('provider');
    if (urlProvider && this.getProviders()[urlProvider]) {
      return urlProvider;
    }

    // Fall back to localStorage
    return localStorage.getItem('provider') || 'topstepx';
  }

  // Get authentication token from various sources
  async getAuthToken() {
    try {
      // First, try to get token from localStorage (main auth system)
      const storedToken = localStorage.getItem('auth_token');
      if (storedToken) {
        this.token = storedToken;
        this.username = localStorage.getItem('username');
        this.provider = localStorage.getItem('provider') || 'topstepx';
        return storedToken;
      }

      // Try to get token from URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      if (urlToken) {
        this.token = urlToken;
        this.provider = urlParams.get('provider') || 'topstepx';
        return urlToken;
      }

      // Try to get saved credentials and login
      const savedCreds = this.getSavedCredentials();
      if (savedCreds) {
        const token = await this.loginWithStoredCredentials(savedCreds);
        if (token) {
          return token;
        }
      }

      // If no token available, show error
      console.error('❌ No authentication token available');
      this.showAuthError();
      return null;

    } catch (error) {
      console.error('Authentication error:', error);
      this.showAuthError();
      return null;
    }
  }

  // Get stored credentials from localStorage
  getSavedCredentials() {
    try {
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
    } catch (error) {
      console.warn('Error reading saved credentials:', error);
    }
    
    return null;
  }

  // Login with stored credentials
  async loginWithStoredCredentials(credentials) {
    try {
      const config = this.getProviderConfig(credentials.provider);
      let response;

      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (credentials.usePassword) {
        // Use password authentication
        requestOptions.body = JSON.stringify({
          userName: credentials.username,
          password: credentials.password
        });
        response = await fetch(`${config.userapi_endpoint}/Login`, requestOptions);
      } else {
        // Use API key authentication
        requestOptions.headers['accept'] = 'text/plain';
        requestOptions.body = JSON.stringify({
          userName: credentials.username,
          apiKey: credentials.apiKey
        });
        response = await fetch(`${config.api_endpoint}/api/Auth/loginKey`, requestOptions);
      }

      if (response.ok) {
        const data = await response.json();
        if (data.success || data.token) {
          this.token = data.token;
          this.username = credentials.username;
          this.provider = credentials.provider;
          
          // Update localStorage with fresh token
          localStorage.setItem('auth_token', this.token);
          localStorage.setItem('username', this.username);
          localStorage.setItem('provider', this.provider);
          
          return this.token;
        }
      }
      
      throw new Error('Authentication failed');
    } catch (error) {
      console.error('Login error:', error);
      return null;
    }
  }

  // Show authentication error to user
  showAuthError() {
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = 'Authentication Required';
      statusElement.classList.remove('connected');
    }

    // Create error overlay
    this.createAuthErrorOverlay();
  }

  // Create authentication error overlay
  createAuthErrorOverlay() {
    // Remove existing overlay if any
    const existingOverlay = document.getElementById('auth-error-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'auth-error-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: 'Rajdhani', sans-serif;
    `;

    const errorBox = document.createElement('div');
    errorBox.style.cssText = `
      background: linear-gradient(145deg, #1a1a1a, #2a2a2a);
      padding: 40px;
      border-radius: 10px;
      border: 2px solid #00d4ff;
      color: #ddd;
      text-align: center;
      max-width: 500px;
      box-shadow: 0 0 30px rgba(0, 212, 255, 0.3);
    `;

    errorBox.innerHTML = `
      <h2 style="color: #00d4ff; margin-bottom: 20px;">🔐 Authentication Required</h2>
      <p style="margin-bottom: 20px; line-height: 1.6;">
        No valid authentication token found. To use this charting application, you need to:
      </p>
      <ul style="text-align: left; margin-bottom: 20px; line-height: 1.8;">
        <li>Log in to the main trading application first</li>
        <li>Or provide a token via URL: <code>?token=your_token</code></li>
        <li>Or ensure your credentials are saved in the browser</li>
      </ul>
      <div style="margin-top: 30px;">
        <button id="login-redirect-btn" style="
          background: linear-gradient(135deg, #00d4ff, #0099cc);
          border: none;
          color: #000;
          padding: 12px 24px;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
          margin-right: 10px;
          font-family: inherit;
        ">Go to Login</button>
        <button id="retry-auth-btn" style="
          background: transparent;
          border: 2px solid #00d4ff;
          color: #00d4ff;
          padding: 10px 22px;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
        ">Retry</button>
      </div>
    `;

    overlay.appendChild(errorBox);
    document.body.appendChild(overlay);

    // Add event listeners
    document.getElementById('login-redirect-btn').addEventListener('click', () => {
      window.location.href = '/'; // Redirect to main login page
    });

    document.getElementById('retry-auth-btn').addEventListener('click', () => {
      overlay.remove();
      window.location.reload(); // Reload the page to retry
    });
  }

  // Get current token
  getCurrentToken() {
    return this.token;
  }

  // Get current username
  getCurrentUsername() {
    return this.username;
  }
}

// Global instance
window.browserAuth = new BrowserAuthManager();














