import accountService from '../services/account.service';
import configService from '../services/config.service';
import authService from '../services/auth.service';

/**
 * AccountManager - High-level manager for account operations
 * Integrates with the existing authentication system and provides
 * a centralized interface for account-related operations
 */
class AccountManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.eventListeners = new Map();
  }

  /**
   * Initialize the account manager
   * Should be called after user authentication
   */
  async initialize() {
    try {
      if (!authService.isAuthenticated()) {
        throw new Error('User must be authenticated before initializing AccountManager');
      }

      // Save user session info to config
      const username = authService.getUsername();
      const provider = authService.getProvider();

      configService.saveUserSession(username, provider);

      // Initialize file-based account lookup
      console.log('Initializing accounts file lookup...');
      await accountService.initializeAccountsFile();

      console.log(`AccountManager initialized for ${username}@${provider}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize AccountManager:', error);
      throw error;
    }
  }

  /**
   * Get all accounts with caching
   */
  async getAccounts(onlyActive = true, useCache = true) {
    const cacheKey = `accounts_${onlyActive}`;
    
    // Check cache first
    if (useCache && this.isCacheValid(cacheKey)) {
      console.log('Returning cached accounts');
      return this.cache.get(cacheKey).data;
    }

    try {
      const result = await accountService.searchAccounts(onlyActive, false);
      
      if (result.success) {
        // Update cache
        this.updateCache(cacheKey, result);
        
        // Emit event for listeners
        this.emit('accountsLoaded', result);
        
        return result;
      } else {
        throw new Error(result.error || 'Failed to load accounts');
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      this.emit('accountsError', error);
      throw error;
    }
  }

  /**
   * Get account names for dropdowns
   */
  async getAccountNames(onlyActive = true, onlyTradable = true) {
    try {
      const result = await accountService.getAccountNames(onlyActive, onlyTradable);
      
      if (result.success) {
        return result.account_names;
      } else {
        console.warn('Failed to get account names:', result.error);
        return [];
      }
    } catch (error) {
      console.error('Error getting account names:', error);
      return [];
    }
  }

  /**
   * Get tradable accounts
   */
  async getTradableAccounts(useCache = true) {
    const cacheKey = 'tradable_accounts';
    
    if (useCache && this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey).data;
    }

    try {
      const result = await accountService.getTradableAccounts();
      
      if (result.success) {
        this.updateCache(cacheKey, result);
        return result;
      } else {
        throw new Error(result.error || 'Failed to load tradable accounts');
      }
    } catch (error) {
      console.error('Error loading tradable accounts:', error);
      throw error;
    }
  }

  /**
   * Get account by ID
   */
  async getAccountById(accountId) {
    try {
      const result = await accountService.getAccountById(accountId);
      
      if (result.success) {
        return result.account;
      } else {
        throw new Error(result.error || 'Account not found');
      }
    } catch (error) {
      console.error(`Error getting account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Get account ID by name
   */
  async getAccountIdByName(accountName) {
    try {
      const result = await accountService.getAccountIdByName(accountName);
      return result.account_id;
    } catch (error) {
      console.error(`Error getting account ID for ${accountName}:`, error);
      return null;
    }
  }

  /**
   * Get total balance across all accounts
   */
  async getTotalBalance(onlyActive = true) {
    try {
      const result = await accountService.getTotalBalance(onlyActive);
      
      if (result.success) {
        return result.total_balance;
      } else {
        console.warn('Failed to get total balance:', result.error);
        return 0;
      }
    } catch (error) {
      console.error('Error getting total balance:', error);
      return 0;
    }
  }

  /**
   * Search accounts by name prefix
   */
  async searchAccountsByPrefix(prefix, onlyActive = true) {
    try {
      const result = await accountService.getAccountsByPrefix(prefix, onlyActive);
      
      if (result.success) {
        return result.accounts;
      } else {
        console.warn(`Failed to search accounts by prefix ${prefix}:`, result.error);
        return [];
      }
    } catch (error) {
      console.error(`Error searching accounts by prefix ${prefix}:`, error);
      return [];
    }
  }

  /**
   * Refresh accounts from server
   */
  async refreshAccounts(onlyActive = true) {
    try {
      // Clear relevant cache entries
      this.clearCache();
      
      const result = await this.getAccounts(onlyActive, false);
      
      this.emit('accountsRefreshed', result);
      
      return result;
    } catch (error) {
      console.error('Error refreshing accounts:', error);
      this.emit('accountsError', error);
      throw error;
    }
  }

  /**
   * Get account statistics
   */
  async getAccountStats() {
    try {
      const accounts = await this.getAccounts();
      
      if (!accounts.success) {
        return {
          total: 0,
          tradable: 0,
          active: 0,
          totalBalance: 0
        };
      }

      const accountList = accounts.accounts;
      const tradableCount = accountList.filter(acc => acc.canTrade).length;
      const activeCount = accountList.filter(acc => acc.isVisible).length;
      const totalBalance = accountList.reduce((sum, acc) => sum + (acc.balance || 0), 0);

      return {
        total: accountList.length,
        tradable: tradableCount,
        active: activeCount,
        totalBalance
      };
    } catch (error) {
      console.error('Error getting account stats:', error);
      return {
        total: 0,
        tradable: 0,
        active: 0,
        totalBalance: 0
      };
    }
  }

  /**
   * Check if cache is valid for a specific key
   */
  isCacheValid(key) {
    const cached = this.cache.get(key);
    if (!cached) return false;
    
    return (Date.now() - cached.timestamp) < this.cacheTimeout;
  }

  /**
   * Update cache for a specific key
   */
  updateCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear all cache
   */
  clearCache() {
    this.cache.clear();
    accountService.clearCache();
    console.log('AccountManager cache cleared');
  }

  /**
   * Add event listener
   */
  addEventListener(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Cleanup - remove listeners and clear cache
   */
  cleanup() {
    this.eventListeners.clear();
    this.clearCache();
    console.log('AccountManager cleaned up');
  }

  /**
   * Check if manager is ready (user authenticated and initialized)
   */
  isReady() {
    return authService.isAuthenticated() && configService.getCurrentUser().username;
  }

  /**
   * Get current user info
   */
  getCurrentUser() {
    return configService.getCurrentUser();
  }

  /**
   * Get current provider
   */
  getCurrentProvider() {
    return configService.getCurrentProvider();
  }
}

export default new AccountManager();
