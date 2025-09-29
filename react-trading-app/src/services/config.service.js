/**
 * Configuration Service
 * Manages user configuration including credentials, provider settings, and app preferences
 */

class ConfigService {
  constructor() {
    this.configKey = 'user_config';
    this.defaultConfig = {
      provider: 'thefuturesdesk',
      username: '',
      authType: 'apikey', // 'apikey' or 'password'
      rememberCredentials: false,
      savedAt: null,
      preferences: {
        theme: 'dark',
        autoRefreshInterval: 30000, // 30 seconds
        cacheTimeout: 300000, // 5 minutes
        notifications: true
      }
    };
  }

  /**
   * Get the current user configuration
   */
  getConfig() {
    try {
      const stored = localStorage.getItem(this.configKey);
      if (stored) {
        const config = JSON.parse(stored);
        // Merge with defaults to ensure all properties exist
        return { ...this.defaultConfig, ...config };
      }
    } catch (error) {
      console.warn('Failed to parse stored config:', error);
    }
    return { ...this.defaultConfig };
  }

  /**
   * Save user configuration
   */
  saveConfig(config) {
    try {
      const currentConfig = this.getConfig();
      const updatedConfig = {
        ...currentConfig,
        ...config,
        savedAt: Date.now()
      };
      localStorage.setItem(this.configKey, JSON.stringify(updatedConfig));
      return true;
    } catch (error) {
      console.error('Failed to save config:', error);
      return false;
    }
  }

  /**
   * Update specific configuration values
   */
  updateConfig(updates) {
    const currentConfig = this.getConfig();
    return this.saveConfig({ ...currentConfig, ...updates });
  }

  /**
   * Update user preferences
   */
  updatePreferences(preferences) {
    const currentConfig = this.getConfig();
    return this.saveConfig({
      ...currentConfig,
      preferences: { ...currentConfig.preferences, ...preferences }
    });
  }

  /**
   * Save user credentials for the current session
   * These are stored securely and cleared on logout
   */
  saveUserSession(username, provider, authType = 'apikey') {
    return this.updateConfig({
      username,
      provider,
      authType,
      lastLogin: Date.now()
    });
  }

  /**
   * Get saved credentials for auto-fill (if remember me was enabled)
   */
  getSavedCredentials() {
    const config = this.getConfig();
    
    // Check if credentials are not too old (30 days max)
    if (config.savedAt && Date.now() - config.savedAt > 30 * 24 * 60 * 60 * 1000) {
      this.clearSavedCredentials();
      return null;
    }

    if (config.rememberCredentials && config.username && config.provider) {
      // Get encoded credentials from localStorage (managed by auth service)
      const authType = localStorage.getItem('saved_auth_type') || 'apikey';
      const encodedApiKey = localStorage.getItem('saved_api_key');
      const encodedPassword = localStorage.getItem('saved_password');

      try {
        if (authType === 'password' && encodedPassword) {
          return {
            username: config.username,
            provider: config.provider,
            password: atob(encodedPassword),
            usePassword: true,
            hasCredential: true
          };
        } else if (authType === 'apikey' && encodedApiKey) {
          return {
            username: config.username,
            provider: config.provider,
            apiKey: atob(encodedApiKey),
            usePassword: false,
            hasCredential: true
          };
        }
      } catch (error) {
        console.warn('Failed to decode saved credentials');
        this.clearSavedCredentials();
        return null;
      }
    }

    return null;
  }

  /**
   * Check if user has saved credentials
   */
  hasSavedCredentials() {
    return this.getSavedCredentials() !== null;
  }

  /**
   * Clear saved credentials
   */
  clearSavedCredentials() {
    // Clear from config
    this.updateConfig({
      rememberCredentials: false,
      savedAt: null
    });
    
    // Clear encoded credentials from localStorage
    localStorage.removeItem('saved_username');
    localStorage.removeItem('saved_provider');
    localStorage.removeItem('saved_api_key');
    localStorage.removeItem('saved_password');
    localStorage.removeItem('saved_auth_type');
    localStorage.removeItem('credentials_saved_at');
  }

  /**
   * Get current user info from config
   */
  getCurrentUser() {
    const config = this.getConfig();
    return {
      username: config.username,
      provider: config.provider,
      authType: config.authType,
      lastLogin: config.lastLogin
    };
  }

  /**
   * Get current provider
   */
  getCurrentProvider() {
    const config = this.getConfig();
    return config.provider || 'thefuturesdesk';
  }

  /**
   * Get user preferences
   */
  getPreferences() {
    const config = this.getConfig();
    return config.preferences || this.defaultConfig.preferences;
  }

  /**
   * Check if configuration is fresh (not too old)
   */
  isConfigFresh(maxAgeMinutes = 1440) { // 24 hours default
    const config = this.getConfig();
    if (!config.savedAt) return false;
    
    const ageMinutes = (Date.now() - config.savedAt) / (1000 * 60);
    return ageMinutes <= maxAgeMinutes;
  }

  /**
   * Clear all configuration data
   */
  clearConfig() {
    localStorage.removeItem(this.configKey);
    this.clearSavedCredentials();
  }

  /**
   * Export configuration for backup
   */
  exportConfig() {
    const config = this.getConfig();
    // Remove sensitive data from export
    const exportConfig = { ...config };
    delete exportConfig.credentials;
    return JSON.stringify(exportConfig, null, 2);
  }

  /**
   * Import configuration from backup
   */
  importConfig(configJson) {
    try {
      const config = JSON.parse(configJson);
      // Validate required fields
      if (config && typeof config === 'object') {
        return this.saveConfig(config);
      }
      return false;
    } catch (error) {
      console.error('Failed to import config:', error);
      return false;
    }
  }

  /**
   * Get configuration for API requests
   */
  getApiConfig() {
    const config = this.getConfig();
    const preferences = this.getPreferences();
    
    return {
      provider: config.provider,
      username: config.username,
      authType: config.authType,
      cacheTimeout: preferences.cacheTimeout,
      autoRefreshInterval: preferences.autoRefreshInterval
    };
  }
}

export default new ConfigService();
