import authService from './auth.service';
import { getProviderApiEndpoint } from '../config/providers';

class AccountService {
  constructor() {
    this.accounts = [];
    this.lastFetch = null;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    this.accountsFilePath = 'tradingAccounts.json'; // Local file for account lookup
    this.accountsLookup = new Map(); // In-memory lookup cache
    this.isFileInitialized = false;
  }

  /**
   * Get authentication headers with current token
   */
  getAuthHeaders() {
    const token = authService.getToken();
    return {
      'Content-Type': 'application/json',
      'accept': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  /**
   * Get the API endpoint for the current provider
   */
  getApiEndpoint() {
    const provider = authService.getProvider();
    return getProviderApiEndpoint(provider);
  }

  /**
   * Check if cache is still valid
   */
  isCacheValid() {
    return this.lastFetch && 
           this.accounts.length > 0 && 
           (Date.now() - this.lastFetch) < this.cacheTimeout;
  }

  /**
   * Search for accounts with optional filtering
   */
  async searchAccounts(onlyActiveAccounts = true, useCache = true) {
    try {
      // Return cached data if valid and requested
      if (useCache && this.isCacheValid()) {
        console.log('Returning cached accounts');
        return {
          accounts: this.accounts,
          success: true,
          fromCache: true
        };
      }

      // Check authentication
      if (!authService.isAuthenticated()) {
        throw new Error('User not authenticated');
      }

      const apiEndpoint = this.getApiEndpoint();
      const headers = this.getAuthHeaders();

      // Make API call to search accounts
      const response = await fetch(`${apiEndpoint}/api/Account/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          onlyActiveAccounts
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed - token may be expired');
        }
        throw new Error(`Failed to fetch accounts: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // Update cache
        this.accounts = data.accounts || [];
        this.lastFetch = Date.now();
        
        console.log(`Successfully fetched ${this.accounts.length} accounts from ${authService.getProvider()}`);
        
        return {
          accounts: this.accounts,
          success: true,
          fromCache: false,
          total_count: this.accounts.length
        };
      } else {
        throw new Error(data.errorMessage || 'Failed to search accounts');
      }

    } catch (error) {
      console.error('Error searching accounts:', error);
      throw error;
    }
  }

  /**
   * Get all account names
   */
  async getAccountNames(onlyActiveAccounts = true, onlyTradable = true) {
    try {
      const result = await this.searchAccounts(onlyActiveAccounts);
      let accounts = result.accounts;

      // Filter tradable accounts if requested
      if (onlyTradable) {
        accounts = accounts.filter(account => account.canTrade);
      }

      // Exclude specific account ID (8734161) as per backend logic
      accounts = accounts.filter(account => String(account.id) !== "8734161");

      return {
        account_names: accounts.map(account => account.name),
        success: true
      };
    } catch (error) {
      console.error('Error getting account names:', error);
      return {
        account_names: [],
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get total balance across all accounts
   */
  async getTotalBalance(onlyActiveAccounts = true) {
    try {
      const result = await this.searchAccounts(onlyActiveAccounts);
      const totalBalance = result.accounts.reduce((sum, account) => sum + (account.balance || 0), 0);
      
      return {
        total_balance: totalBalance,
        success: true
      };
    } catch (error) {
      console.error('Error calculating total balance:', error);
      return {
        total_balance: 0,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get tradable accounts
   */
  async getTradableAccounts() {
    try {
      const result = await this.searchAccounts();
      let tradableAccounts = result.accounts.filter(account => account.canTrade);
      
      // Exclude specific account ID (8734161)
      tradableAccounts = tradableAccounts.filter(account => String(account.id) !== "8734161");
      
      return {
        accounts: tradableAccounts,
        success: true,
        total_count: tradableAccounts.length
      };
    } catch (error) {
      console.error('Error getting tradable accounts:', error);
      return {
        accounts: [],
        success: false,
        error: error.message,
        total_count: 0
      };
    }
  }

  /**
   * Get account by ID
   */
  async getAccountById(accountId) {
    try {
      const result = await this.searchAccounts();
      const account = result.accounts.find(acc => acc.id === accountId);
      
      if (!account) {
        throw new Error(`Account with ID ${accountId} not found`);
      }
      
      return {
        account,
        success: true
      };
    } catch (error) {
      console.error(`Error getting account by ID ${accountId}:`, error);
      return {
        account: null,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get account ID by name
   */
  async getAccountIdByName(accountName) {
    try {
      const result = await this.searchAccounts();
      const account = result.accounts.find(acc => acc.name === accountName);
      
      return {
        account_id: account ? account.id : null,
        success: true,
        message: account ? `Account found with ID: ${account.id}` : `No account found with name: ${accountName}`
      };
    } catch (error) {
      console.error(`Error getting account ID by name ${accountName}:`, error);
      return {
        account_id: null,
        success: false,
        error: error.message,
        message: `Error searching for account: ${error.message}`
      };
    }
  }

  /**
   * Get accounts by name prefix
   */
  async getAccountsByPrefix(namePrefix, onlyActiveAccounts = true) {
    try {
      const result = await this.searchAccounts(onlyActiveAccounts);
      const matchingAccounts = result.accounts.filter(account => 
        account.name.toLowerCase().startsWith(namePrefix.toLowerCase())
      );
      
      return {
        accounts: matchingAccounts,
        success: true,
        total_count: matchingAccounts.length
      };
    } catch (error) {
      console.error(`Error getting accounts by prefix ${namePrefix}:`, error);
      return {
        accounts: [],
        success: false,
        error: error.message,
        total_count: 0
      };
    }
  }

  /**
   * Initialize file-based account lookup
   */
  async initializeAccountsFile() {
    try {
      console.log('Initializing accounts file lookup...');

      // Check if file actually exists, not just the flag
      const existingData = await this.loadAccountsFromFile();
      console.log('Existing data check:', existingData ? 'Found' : 'Not found');
      console.log('isFileInitialized flag:', this.isFileInitialized);

      if (this.isFileInitialized && existingData) {
        console.log('Accounts file already initialized and file exists');
        return;
      }

      // Reset flag since we're going to try to initialize
      this.isFileInitialized = false;

      if (existingData && existingData.accounts && existingData.accounts.length > 0) {
        // Check if data is not too old (24 hours)
        const fileAge = Date.now() - new Date(existingData.lastUpdated).getTime();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        if (fileAge < maxAge) {
          // Use existing data
          this.populateAccountsLookup(existingData.accounts);
          console.log(`Loaded ${existingData.accounts.length} accounts from file (${Math.round(fileAge/1000/60)} minutes old)`);
          this.isFileInitialized = true;
          return;
        } else {
          console.log(`Accounts file is ${Math.round(fileAge/1000/60/60)} hours old, refreshing...`);
        }
      }

      // File doesn't exist or is too old, fetch from API
      console.log('File does not exist or is too old, fetching accounts from API...');
      await this.refreshAccountsFile();

      this.isFileInitialized = true;
    } catch (error) {
      console.error('Error initializing accounts file:', error);
      // Continue without file lookup - will use normal API calls
    }
  }

  /**
   * Refresh accounts from API and save to file
   */
  async refreshAccountsFile() {
    try {
      console.log('Starting refreshAccountsFile - calling searchAccounts...');
      const result = await this.searchAccounts(true, false); // Get fresh data
      console.log('searchAccounts result:', result);

      if (result.success && result.accounts) {
        // Create accounts data with metadata
        const accountsData = {
          lastUpdated: new Date().toISOString(),
          provider: authService.getProvider(),
          username: authService.getUsername(),
          totalCount: result.accounts.length,
          accounts: result.accounts.map(account => ({
            name: account.name,
            id: account.id || account.accountId,
            userId: account.userId,
            canTrade: account.canTrade || false,
            balance: account.balance || 0,
            isVisible: account.isVisible !== false
          }))
        };

        // Save to file
        await this.saveAccountsToFile(accountsData);

        // Populate in-memory lookup
        this.populateAccountsLookup(accountsData.accounts);

        console.log(`Refreshed and saved ${accountsData.accounts.length} accounts to file`);
      } else {
        throw new Error('Failed to fetch accounts from API: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error refreshing accounts file:', error);
      throw error;
    }
  }

  /**
   * Load accounts data from backend file
   */
  async loadAccountsFromFile() {
    try {
      console.log('Loading accounts from backend file...');
      const response = await fetch('http://localhost:8025/api/accounts/file', {
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log('Successfully loaded accounts from backend file');
          return result.data;
        }
      }

      console.log('No accounts file found on backend');
      return null;
    } catch (error) {
      console.error('Error loading accounts from backend file:', error);
      return null;
    }
  }

  /**
   * Save accounts data to backend file
   */
  async saveAccountsToFile(accountsData) {
    try {
      console.log('Attempting to save accounts data to backend file...');
      console.log('Data to save:', accountsData);

      const response = await fetch('http://localhost:8025/api/accounts/file', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ accountsData })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log('Accounts data saved successfully to backend file');
          return;
        } else {
          throw new Error(result.error || 'Failed to save accounts file');
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error saving accounts to backend file:', error);
      throw error;
    }
  }

  /**
   * Populate in-memory accounts lookup from accounts array
   */
  populateAccountsLookup(accounts) {
    this.accountsLookup.clear();

    accounts.forEach(account => {
      // Use account name as key for quick lookup
      this.accountsLookup.set(account.name, {
        accountId: account.id,
        userId: account.userId,
        canTrade: account.canTrade,
        balance: account.balance,
        isVisible: account.isVisible
      });
    });

    console.log(`Populated accounts lookup with ${this.accountsLookup.size} accounts`);
  }

  /**
   * Lookup account info from file/memory, with API fallback
   */
  async lookupAccountByName(accountName) {
    // Ensure file is initialized
    if (!this.isFileInitialized) {
      await this.initializeAccountsFile();
    }

    // First check in-memory lookup
    if (this.accountsLookup.has(accountName)) {
      const accountInfo = this.accountsLookup.get(accountName);
      console.log(`Found account ${accountName} in lookup cache`);
      return {
        success: true,
        accountInfo
      };
    }

    console.log(`Account ${accountName} not found in lookup, refreshing accounts...`);

    // Account not found, refresh from API and try again
    try {
      await this.refreshAccountsFile();

      // Try lookup again after refresh
      if (this.accountsLookup.has(accountName)) {
        const accountInfo = this.accountsLookup.get(accountName);
        console.log(`Found account ${accountName} after refresh`);
        return {
          success: true,
          accountInfo
        };
      } else {
        return {
          success: false,
          error: `Account ${accountName} not found even after refresh`
        };
      }
    } catch (error) {
      console.error(`Failed to refresh accounts for lookup: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get account ID and user ID by account name (for OrderManager)
   */
  async getAccountIDAndUserID(accountName) {
    try {
      const lookupResult = await this.lookupAccountByName(accountName);

      if (lookupResult.success) {
        return {
          success: true,
          accountId: lookupResult.accountInfo.accountId,
          userId: lookupResult.accountInfo.userId
        };
      } else {
        return {
          success: false,
          error: lookupResult.error
        };
      }
    } catch (error) {
      console.error(`Error getting account ID and user ID for ${accountName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Force refresh accounts file (utility method)
   */
  async forceRefreshAccounts() {
    try {
      await this.refreshAccountsFile();
      return true;
    } catch (error) {
      console.error('Failed to force refresh accounts:', error);
      return false;
    }
  }

  /**
   * Clear accounts file and cache (utility method)
   */
  async clearAccountsFile() {
    try {
      // Clear backend file
      const response = await fetch('http://localhost:8025/api/accounts/file', {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      this.accountsLookup.clear();
      this.isFileInitialized = false;
      console.log('Accounts file data cleared');
      return true;
    } catch (error) {
      console.error('Failed to clear accounts file:', error);
      return false;
    }
  }

  /**
   * Clear cache - useful when switching providers or after logout
   */
  clearCache() {
    this.accounts = [];
    this.lastFetch = null;
    this.accountsLookup.clear();
    this.isFileInitialized = false;
    console.log('Account cache cleared');
  }

  /**
   * Refresh accounts - force fetch from API
   */
  async refreshAccounts(onlyActiveAccounts = true) {
    this.clearCache();
    return await this.searchAccounts(onlyActiveAccounts, false);
  }
}

export default new AccountService();
