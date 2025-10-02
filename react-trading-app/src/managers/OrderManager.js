import axios from 'axios';
import authService from '../services/auth.service';
import configService from '../services/config.service';
import accountService from '../services/account.service';
import { getProviderUserApiEndpoint } from '../config/providers';
import { logFrontendTrade } from '../utils/trafficLogger';

// Order types
const ORDER_TYPE_MARKET = 2;
const ORDER_TYPE_LIMIT = 1;
const ORDER_TYPE_STOP = 4;
const ORDER_TYPE_TRAIL_STOP = 5;

/**
 * OrderManager - High-level manager for order operations
 * Based on the Python reference files from tm/ directory
 * Integrates with existing authentication system and uses provider configuration
 */
class OrderManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.eventListeners = new Map();
  }

  /**
   * Initialize the order manager
   * Should be called after user authentication
   */
  async initialize() {
    try {
      if (!authService.isAuthenticated()) {
        throw new Error('User must be authenticated before initializing OrderManager');
      }

      const username = authService.getUsername();
      const provider = authService.getProvider();

      console.log(`OrderManager initialized for ${username}@${provider}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize OrderManager:', error);
      throw error;
    }
  }


  /**
   * Get the base URL for API requests
   */
  getBaseUrl() {
    const provider = authService.getProvider() || configService.getCurrentProvider();
    return getProviderUserApiEndpoint(provider);
  }

  /**
   * Get authorization headers
   */
  getHeaders() {
    const token = authService.getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Generate unique custom tag for orders
   */
  generateCustomTag() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  /**
   * Resolve instrument ticker to normalized format
   * Based on resolve_instrument from utils.py
   */
  resolveInstrument(ticker) {
    console.log(`[DEBUG] Original ticker: ${ticker}`);

    // Remove exclamation marks and normalize
    let result = ticker.replace(/!/g, '');

    // Remove version numbers like .1
    result = result.replace(/\.\d+/g, '');

    // Remove trailing numbers
    result = result.replace(/\d+$/, '');

    result = result.toUpperCase();

    // Ensure it starts with /
    if (!result.startsWith('/')) {
      result = '/' + result;
    }

    console.log(`[DEBUG] Resolved instrument: ${result}`);
    return result;
  }

  /**
   * Get user ID from token
   * Based on getUserID from utils.py
   */
  async getUserID(token) {
    const url = `${this.getBaseUrl()}/User`;
    const headers = { 'Authorization': `Bearer ${token}` };

    console.log(`[DEBUG] Getting user ID from URL: ${url}`);

    try {
      const response = await axios.get(url, { headers });
      console.log(`[DEBUG] Response status code: ${response.status}`);

      if (response.status === 200) {
        const data = response.data;
        console.log(`[DEBUG] User data received:`, data);
        const userId = data.userID || data.userId;
        console.log(`[DEBUG] Extracted user ID: ${userId}`);
        return userId;
      } else {
        console.error(`[ERROR] Failed to get user ID: ${response.data}`);
      }
    } catch (error) {
      console.error(`[ERROR] Failed to get user ID: ${error.message}`);
    }

    return null;
  }

  /**
   * Get account ID and user ID for account name
   * Uses AccountService file-based lookup
   */
  async getAccountIDAndUserID(accountName, token) {
    console.log(`[DEBUG] Looking up account info for accountName: ${accountName}`);

    try {
      // Use AccountService file-based lookup
      const result = await accountService.getAccountIDAndUserID(accountName);

      if (result.success) {
        const accountId = result.accountId;
        const userId = result.userId || await this.getUserID(token);

        console.log(`[DEBUG] Found account via AccountService: accountName=${accountName}, accountId=${accountId}, userId=${userId}`);
        return { accountId, userId };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error(`[ERROR] Failed to get account info via AccountService: ${error.message}`);

      // Final fallback to direct API call if AccountService fails
      console.log(`[DEBUG] Falling back to direct API call for account: ${accountName}`);
      return await this.getAccountIDAndUserIDFromAPI(accountName, token);
    }
  }

  /**
   * Fallback method - Get account ID and user ID directly from API
   * This is the original implementation, kept as fallback
   */
  async getAccountIDAndUserIDFromAPI(accountName, token) {
    const url = `${this.getBaseUrl()}/TradingAccount`;
    const headers = { 'Authorization': `Bearer ${token}` };

    console.log(`[DEBUG] Requesting TradingAccount info from API: ${url} for accountName: ${accountName}`);

    try {
      const response = await axios.get(url, { headers });
      console.log(`[DEBUG] API response status code for TradingAccount: ${response.status}`);

      if (response.status === 200) {
        const accounts = response.data;
        console.log(`[DEBUG] Received TradingAccount data from API:`, accounts);

        for (const account of accounts) {
          if (account.accountName === accountName || account.name === accountName) {
            const accountId = account.accountId || account.id;
            const userId = account.userId;
            console.log(`[DEBUG] Found account from API: accountName=${accountName}, accountId=${accountId}, userId=${userId}`);
            return { accountId, userId };
          }
        }

        console.error(`[ERROR] Account with name ${accountName} not found in API response.`);
        throw new Error(`Account with name ${accountName} not found.`);
      } else {
        console.error(`[ERROR] Failed to retrieve TradingAccount info from API: ${response.data}`);
        throw new Error('Failed to retrieve TradingAccount info');
      }
    } catch (error) {
      console.error(`[ERROR] Failed to retrieve TradingAccount info from API: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convert points to ticks using contract information
   * Uses backend tradableContracts.json to get tick_size
   */
  async convertPointsToTicks(symbol, points) {
    try {
      // Call backend contract lookup API to get contract details
      const lookupUrl = `http://localhost:8025/api/contracts/lookup/${encodeURIComponent(symbol)}`;
      console.log(`[DEBUG] Looking up contract for tick conversion: ${lookupUrl}`);

      const response = await axios.get(lookupUrl);

      if (response.status === 200 && response.data.success) {
        const contractData = response.data.contract_info; // Access nested contract_info
        const tickSize = contractData?.tick_size;

        if (!tickSize) {
          throw new Error(`No tick_size found for symbol ${symbol}`);
        }

        const ticks = points / tickSize;
        console.log(`[DEBUG] Converted ${points} points to ${ticks} ticks for ${symbol} (tick_size: ${tickSize})`);

        return Math.round(ticks); // Round to nearest whole tick
      } else {
        throw new Error(`Failed to lookup contract: ${response.data?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`[ERROR] Failed to convert points to ticks: ${error.message}`);
      // Fallback: assume 1 point = 4 ticks (common for many futures)
      const fallbackTicks = points * 4;
      console.log(`[DEBUG] Using fallback conversion: ${points} points = ${fallbackTicks} ticks`);
      return fallbackTicks;
    }
  }

  /**
   * Get symbol ID for trading
   * Uses backend lookupContractProductId method instead of direct Chart API calls
   */
  async getSymbolForTrade(searchSymbol, token) {
    console.log(`[DEBUG] Looking up symbol for trade: ${searchSymbol}`);

    try {
      // Call backend contract lookup API
      const lookupUrl = `http://localhost:8025/api/contracts/lookup/${encodeURIComponent(searchSymbol)}`;
      console.log(`[DEBUG] Calling backend lookup: ${lookupUrl}`);

      const response = await axios.get(lookupUrl, {
        headers: {
          'Content-Type': 'application/json',
          // Include auth token in case backend needs it in future
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });

      console.log(`[DEBUG] Backend lookup response status: ${response.status}`);

      if (response.status === 200 && response.data.success) {
        const data = response.data;
        console.log(`[DEBUG] Backend lookup response:`, data);

        // Extract product_id which is the symbolId we need for trading
        const symbolId = data.product_id;
        console.log(`[DEBUG] Extracted symbolId from backend: ${symbolId}`);
        console.log(`[DEBUG] Matched field: ${data.matched_field}, Matched value: ${data.matched_value}`);

        return symbolId;
      } else {
        const errorMsg = response.data?.error || 'Unknown error from backend lookup';
        console.error(`[ERROR] Backend lookup failed: ${errorMsg}`);
        return '';
      }
    } catch (error) {
      console.error(`[ERROR] Failed to lookup symbol via backend: ${error.message}`);

      // If backend is unavailable, fall back to the original Chart API method
      console.log(`[DEBUG] Falling back to Chart API lookup for: ${searchSymbol}`);
      return await this.getSymbolForTradeFromChartAPI(searchSymbol, token);
    }
  }

  /**
   * Fallback method - Get symbol ID directly from Chart API
   * This is the original implementation, kept as fallback
   */
  async getSymbolForTradeFromChartAPI(searchSymbol, token) {
    const normalizedSymbol = this.resolveInstrument(searchSymbol);
    console.log(`[DEBUG] Normalized symbol for Chart API: ${normalizedSymbol}`);

    // Get chart API endpoint from provider config
    const provider = authService.getProvider() || configService.getCurrentProvider();
    const chartApiEndpoint = `https://chartapi.${provider}.projectx.com`;

    const url = `${chartApiEndpoint}/Symbols?symbol=${normalizedSymbol}`;
    const headers = { 'Authorization': `Bearer ${token}` };

    console.log(`[DEBUG] Querying Chart API with URL: ${url}`);

    try {
      const response = await axios.get(url, { headers });
      console.log(`[DEBUG] Chart API response status: ${response.status}`);

      if (response.status === 200) {
        const data = response.data;
        console.log(`[DEBUG] Chart API response data:`, data);
        const symbolId = data.symbolId || '';
        console.log(`[DEBUG] Extracted symbolId from Chart API: ${symbolId}`);
        return symbolId;
      } else {
        console.error(`[ERROR] Chart API failed: ${response.data}`);
        return '';
      }
    } catch (error) {
      console.error(`[ERROR] Chart API error: ${error.message}`);
      return '';
    }
  }

  /**
   * Get filled price and position ID for account
   * Based on getFilledPriceAndPositionIdForAccountId from utils.py
   */
  async getFilledPriceAndPositionIdForAccountId(accountId, symbolId, token) {
    const userId = await this.getUserID(token);
    if (!userId) {
      throw new Error('Failed to retrieve user ID for token.');
    }

    const url = `${this.getBaseUrl()}/Position/all/user/${userId}`;
    const headers = { 'Authorization': `Bearer ${token}` };

    console.log(`[DEBUG] Requesting positions from URL: ${url}`);

    try {
      const response = await axios.get(url, { headers });
      console.log(`[DEBUG] Response status code for positions: ${response.status}`);

      if (response.status === 200) {
        const positions = response.data;
        console.log(`[DEBUG] Received positions:`, positions);

        for (const pos of positions) {
          if (String(pos.accountId) === String(accountId) && pos.symbolId === symbolId) {
            const averagePrice = pos.averagePrice;
            const positionId = pos.id;
            console.log(`[DEBUG] Found position: accountId=${accountId}, symbolId=${symbolId}, averagePrice=${averagePrice}, positionId=${positionId}`);
            return { averagePrice, positionId };
          }
        }

        console.error(`[ERROR] No position found for accountId ${accountId} and symbolId ${symbolId}`);
        throw new Error(`No position found for accountId ${accountId} and symbolId ${symbolId}`);
      } else {
        console.error(`[ERROR] Failed to retrieve positions: ${response.data}`);
        throw new Error('Failed to retrieve positions');
      }
    } catch (error) {
      console.error(`[ERROR] Failed to retrieve positions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log info messages
   */
  logInfo(message) {
    console.log(`[INFO] ${message}`);
  }

  /**
   * Log error messages
   */
  logError(message) {
    console.error(`[ERROR] ${message}`);
  }

  /**
   * Place a market order
   * Based on placeMarketOrder from order_manager.py
   */
  async placeMarketOrder(accountName, symbol, orderType, quantity = 1) {
    // Determine position size based on order type
    orderType = orderType.toUpperCase();
    let positionSize = Math.abs(quantity);

    if (['SELL', 'SHORT'].includes(orderType)) {
      positionSize = -positionSize;
    } else if (['BUY', 'LONG'].includes(orderType)) {
      // Position size is already positive
    } else {
      const errorMsg = `Invalid order type: ${orderType}. Must be 'Buy' or 'Sell'.`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }

    this.logInfo(`Placing market order: accountName=${accountName}, symbol=${symbol}, orderType=${orderType}, quantity=${quantity}, positionSize=${positionSize}`);

    // Get JWT token
    const token = authService.getToken();

    // Get account ID
    const { accountId, userId } = await this.getAccountIDAndUserID(accountName, token);
    this.logInfo(`Retrieved accountId=${accountId}, userId=${userId}`);

    // Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol, token);
    if (!symbolId) {
      const errorMsg = `Failed to get symbolId for symbol ${symbol}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }
    this.logInfo(`Retrieved symbolId=${symbolId}`);

    // Generate a unique tag for the order
    const customTag = this.generateCustomTag();

    // Create order payload
    const url = `${this.getBaseUrl()}/Order`;

    const payload = {
      accountId,
      symbolId,
      type: ORDER_TYPE_MARKET,
      limitPrice: null,
      stopPrice: null,
      trailDistance: null,
      positionSize,
      customTag
    };

    const headers = this.getHeaders();

    this.logInfo(`Sending order request to ${url} with payload: ${JSON.stringify(payload)}`);

    const startTime = Date.now();
    try {
      const response = await axios.post(url, payload, { headers });
      const latency = Date.now() - startTime;
      this.logInfo(`Order API response status: ${response.status}`);

      if (response.status === 200) {
        const data = response.data;
        this.logInfo(`Order response data: ${JSON.stringify(data)}`);

        if (data.result === 0) { // Success
          const orderId = data.orderId;
          this.logInfo(`Market order placed successfully: orderId=${orderId}`);

          // Log to traffic monitoring
          logFrontendTrade({
            accountName,
            symbol,
            action: orderType,
            quantity: Math.abs(quantity),
            orderType: 'MARKET',
            price: null,
            success: true,
            latency,
            orderId
          });

          return orderId;
        } else {
          const errorMsg = `Failed to place order: ${data.errorMessage || 'Unknown error'}`;
          this.logError(errorMsg);

          // Log failed trade
          logFrontendTrade({
            accountName,
            symbol,
            action: orderType,
            quantity: Math.abs(quantity),
            orderType: 'MARKET',
            price: null,
            success: false,
            latency: Date.now() - startTime,
            errorMessage: data.errorMessage || 'Unknown error'
          });

          throw new Error(errorMsg);
        }
      } else {
        const errorMsg = `Order API returned status ${response.status}: ${response.data}`;
        this.logError(errorMsg);

        // Log failed trade
        logFrontendTrade({
          accountName,
          symbol,
          action: orderType,
          quantity: Math.abs(quantity),
          orderType: 'MARKET',
          price: null,
          success: false,
          latency: Date.now() - startTime,
          errorMessage: errorMsg
        });

        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Exception while placing market order: ${error.message}`;
      this.logError(errorMsg);

      // Log failed trade
      logFrontendTrade({
        accountName,
        symbol,
        action: orderType,
        quantity: Math.abs(quantity),
        orderType: 'MARKET',
        price: null,
        success: false,
        latency: Date.now() - startTime,
        errorMessage: error.message
      });

      throw new Error(errorMsg);
    }
  }

  /**
   * Place a limit order
   * Based on placeLimitOrder from order_manager.py
   */
  async placeLimitOrder(accountName, symbol, orderType, limitPrice, qty = 1) {
    // Determine position size based on order type
    orderType = orderType.toUpperCase();
    let positionSize = Math.abs(qty);

    if (['SELL', 'SHORT'].includes(orderType)) {
      positionSize = -positionSize;
    } else if (['BUY', 'LONG'].includes(orderType)) {
      // Position size is already positive
    } else {
      const errorMsg = `Invalid order type: ${orderType}. Must be 'Buy' or 'Sell'.`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }

    this.logInfo(`Placing limit order: accountName=${accountName}, symbol=${symbol}, orderType=${orderType}, limitPrice=${limitPrice}, qty=${qty}, positionSize=${positionSize}`);

    // Get JWT token
    const token = authService.getToken();

    // Get account ID
    const { accountId, userId } = await this.getAccountIDAndUserID(accountName, token);
    this.logInfo(`Retrieved accountId=${accountId}, userId=${userId}`);

    // Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol, token);
    if (!symbolId) {
      const errorMsg = `Failed to get symbolId for symbol ${symbol}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }
    this.logInfo(`Retrieved symbolId=${symbolId}`);

    // Generate a unique tag for the order
    const customTag = this.generateCustomTag();

    // Create order payload
    const url = `${this.getBaseUrl()}/Order`;

    const payload = {
      accountId,
      symbolId,
      type: ORDER_TYPE_LIMIT,
      limitPrice,
      stopPrice: null,
      trailDistance: null,
      positionSize,
      customTag
    };

    const headers = this.getHeaders();

    this.logInfo(`Sending limit order request to ${url} with payload: ${JSON.stringify(payload)}`);

    try {
      const response = await axios.post(url, payload, { headers });
      this.logInfo(`Limit order API response status: ${response.status}`);

      if (response.status === 200) {
        const data = response.data;
        this.logInfo(`Limit order response data: ${JSON.stringify(data)}`);

        if (data.errorMessage == null) { // Success
          const orderId = data.orderId;
          this.logInfo(`Limit order placed successfully: orderId=${orderId}`);
          return orderId;
        } else {
          const errorMsg = `Failed to place limit order: ${data.errorMessage || 'Unknown error'}`;
          this.logError(errorMsg);
          throw new Error(errorMsg);
        }
      } else {
        const errorMsg = `Limit order API returned status ${response.status}: ${response.data}`;
        this.logError(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Exception while placing limit order: ${error.message}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Place a trailing stop order
   * Places market order first, then sets trailing stop with proper tick distance
   */
  async placeTrailStopOrder(accountName, orderType, symbol, quantity, trailDistancePoints) {
    this.logInfo(`Placing market order with trailing stop: accountName=${accountName}, orderType=${orderType}, symbol=${symbol}, quantity=${quantity}, trailDistancePoints=${trailDistancePoints}`);

    // 1. Convert trail distance from points to ticks
    const trailDistanceTicks = await this.convertPointsToTicks(symbol, trailDistancePoints);
    this.logInfo(`Converted trail distance: ${trailDistancePoints} points = ${trailDistanceTicks} ticks`);

    // 2. Place the market order first
    const marketOrderId = await this.placeMarketOrder(accountName, symbol, orderType, quantity);
    this.logInfo(`Market order placed successfully, order ID: ${marketOrderId}`);

    // 3. Get JWT token and necessary IDs
    const token = authService.getToken();

    // Get account ID
    const { accountId, userId } = await this.getAccountIDAndUserID(accountName, token);
    this.logInfo(`Retrieved accountId=${accountId}, userId=${userId}`);

    // Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol, token);
    if (!symbolId) {
      const errorMsg = `Failed to get symbolId for symbol ${symbol}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }

    // 4. Validate order type
    orderType = orderType.toUpperCase();
    if (!['BUY', 'LONG', 'SELL', 'SHORT'].includes(orderType)) {
      const errorMsg = `Invalid order type: ${orderType}. Must be 'Buy' or 'Sell'.`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }

    // 5. Place trailing stop order to exit the position
    const url = `${this.getBaseUrl()}/Order`;
    const customTag = this.generateCustomTag();

    // For exiting the position, we need opposite direction
    let exitPositionSize;
    if (['BUY', 'LONG'].includes(orderType)) {
      // Exit long position with sell order (negative quantity)
      exitPositionSize = -Math.abs(quantity);
    } else {
      // Exit short position with buy order (positive quantity)
      exitPositionSize = Math.abs(quantity);
    }

    const payload = {
      accountId,
      symbolId,
      type: ORDER_TYPE_TRAIL_STOP,
      limitPrice: null,
      stopPrice: null,
      trailDistance: trailDistanceTicks, // Use ticks for trail distance
      positionSize: exitPositionSize,
      customTag
    };

    const headers = this.getHeaders();

    this.logInfo(`Sending trailing stop order request to ${url} with payload: ${JSON.stringify(payload)}`);

    try {
      const response = await axios.post(url, payload, { headers });
      this.logInfo(`Trailing stop order API response status: ${response.status}`);

      if (response.status === 200) {
        const data = response.data;
        this.logInfo(`Trailing stop order response data: ${JSON.stringify(data)}`);

        if (data.errorMessage == null) { // Success
          const trailStopOrderId = data.orderId;
          this.logInfo(`Trailing stop order placed successfully: orderId=${trailStopOrderId}`);
          return {
            marketOrderId,
            trailStopOrderId
          };
        } else {
          const errorMsg = `Failed to place trailing stop order: ${data.errorMessage || 'Unknown error'}`;
          this.logError(errorMsg);
          throw new Error(errorMsg);
        }
      } else {
        const errorMsg = `Trailing stop order API returned status ${response.status}: ${response.data}`;
        this.logError(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Exception while placing trailing stop order: ${error.message}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Poll for position fill (utility for bracket orders)
   */
  async pollForFill(accountId, symbolId, token, maxWaitMs = 5000, pollIntervalMs = 20) {
    this.logInfo("Polling for position fill...");

    const maxAttempts = Math.floor(maxWaitMs / pollIntervalMs);
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const { averagePrice, positionId } = await this.getFilledPriceAndPositionIdForAccountId(accountId, symbolId, token);
        this.logInfo(`Position filled at price: ${averagePrice}, position ID: ${positionId}`);
        return { averagePrice, positionId };
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          this.logError(`Timed out waiting for position fill after ${maxWaitMs/1000} seconds.`);
          throw new Error(`Timed out waiting for position fill: ${error.message}`);
        }

        this.logInfo(`Fill not found yet, polling attempt ${attempts}/${maxAttempts}...`);
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }
  }

  /**
   * Place a market order with stop loss
   * Uses the same logic as placeBracketOrderWithTPAndSL but only with stop loss
   */
  async placeMarketWithStopLossOrder(accountName, orderType, symbol, quantity, stopLossPoints) {
    this.logInfo(`Placing market order with stop loss: accountName=${accountName}, orderType=${orderType}, symbol=${symbol}, quantity=${quantity}, stopLossPoints=${stopLossPoints}`);

    // 1. Place the market order first
    const marketOrderId = await this.placeMarketOrder(accountName, symbol, orderType, quantity);
    this.logInfo(`Market order placed successfully, order ID: ${marketOrderId}`);

    // 2. Get JWT token and necessary IDs
    const token = authService.getToken();

    // Get account ID
    const { accountId, userId } = await this.getAccountIDAndUserID(accountName, token);
    this.logInfo(`Retrieved accountId=${accountId}, userId=${userId}`);

    // Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol, token);
    if (!symbolId) {
      const errorMsg = `Failed to get symbolId for symbol ${symbol}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }

    // 3. Poll for the filled price and position ID
    const { averagePrice, positionId } = await this.pollForFill(accountId, symbolId, token);

    // 4. Calculate stop loss price based on order type
    let stopLossPrice;

    orderType = orderType.toUpperCase();
    if (['BUY', 'LONG'].includes(orderType)) {
      // For buy orders, stop loss is below entry price
      stopLossPrice = averagePrice - stopLossPoints;
    } else if (['SELL', 'SHORT'].includes(orderType)) {
      // For sell orders, stop loss is above entry price
      stopLossPrice = averagePrice + stopLossPoints;
    } else {
      const errorMsg = `Invalid order type: ${orderType}. Must be 'Buy' or 'Sell'.`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }

    this.logInfo(`Calculated stop loss price: ${stopLossPrice}`);

    // 5. Set stop loss using editStopLossAccount endpoint (same as bracket order)
    const url = `${this.getBaseUrl()}/Order/editStopLossAccount`;

    const payload = {
      positionId,
      stopLoss: stopLossPrice,
      takeProfit: null // No take profit for this method
    };

    const headers = this.getHeaders();

    this.logInfo(`Sending editStopLoss request to ${url} with payload: ${JSON.stringify(payload)}`);

    try {
      const response = await axios.post(url, payload, { headers });
      this.logInfo(`editStopLoss API response status: ${response.status}`);

      if (response.status === 200) {
        const data = response.data;
        this.logInfo(`editStopLoss response data: ${JSON.stringify(data)}`);

        if (data.success === true) { // Success
          this.logInfo(`Stop loss set successfully for position ID: ${positionId}`);
          return {
            marketOrderId
          };
        } else {
          const errorMsg = `Failed to set stop loss: ${data.errorMessage || 'Unknown error'}`;
          this.logError(errorMsg);
          throw new Error(errorMsg);
        }
      } else {
        const errorMsg = `editStopLoss API returned status ${response.status}: ${response.data}`;
        this.logError(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Exception while setting stop loss: ${error.message}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Place a bracket order with take profit and stop loss
   * Based on placeBracketOrderWithTPAndSL from order_manager.py
   */
  async placeBracketOrderWithTPAndSL(accountName, symbol, orderType, quantity, stopLossPoints, takeProfitPoints) {
    this.logInfo(`Placing bracket order: accountName=${accountName}, symbol=${symbol}, orderType=${orderType}, quantity=${quantity}, stopLossPoints=${stopLossPoints}, takeProfitPoints=${takeProfitPoints}`);

    // 1. Place the market order first
    const marketOrderId = await this.placeMarketOrder(accountName, symbol, orderType, quantity);
    this.logInfo(`Market order placed successfully, order ID: ${marketOrderId}`);

    // 2. Get JWT token and necessary IDs
    const token = authService.getToken();

    // Get account ID
    const { accountId, userId } = await this.getAccountIDAndUserID(accountName, token);
    this.logInfo(`Retrieved accountId=${accountId}, userId=${userId}`);

    // Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol, token);
    if (!symbolId) {
      const errorMsg = `Failed to get symbolId for symbol ${symbol}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }

    // 3. Poll for the filled price and position ID
    const { averagePrice, positionId } = await this.pollForFill(accountId, symbolId, token);

    // 4. Calculate stop loss and take profit prices based on order type
    let stopLossPrice, takeProfitPrice;

    orderType = orderType.toUpperCase();
    if (['BUY', 'LONG'].includes(orderType)) {
      // For buy orders, stop loss is below entry, take profit is above
      stopLossPrice = averagePrice - stopLossPoints;
      takeProfitPrice = averagePrice + takeProfitPoints;
    } else if (['SELL', 'SHORT'].includes(orderType)) {
      // For sell orders, stop loss is above entry, take profit is below
      stopLossPrice = averagePrice + stopLossPoints;
      takeProfitPrice = averagePrice - takeProfitPoints;
    } else {
      const errorMsg = `Invalid order type: ${orderType}. Must be 'Buy' or 'Sell'.`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }

    this.logInfo(`Calculated stop loss price: ${stopLossPrice}, take profit price: ${takeProfitPrice}`);

    // 5. Set stop loss and take profit levels
    const url = `${this.getBaseUrl()}/Order/editStopLossAccount`;

    const payload = {
      positionId,
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice
    };

    const headers = this.getHeaders();

    this.logInfo(`Sending editStopLoss request to ${url} with payload: ${JSON.stringify(payload)}`);

    try {
      const response = await axios.post(url, payload, { headers });
      this.logInfo(`editStopLoss API response status: ${response.status}`);

      if (response.status === 200) {
        const data = response.data;
        this.logInfo(`editStopLoss response data: ${JSON.stringify(data)}`);

        if (data.success === true) { // Success
          this.logInfo(`Stop loss and take profit set successfully for position ID: ${positionId}`);
          return {
            marketOrderId
          };
        } else {
          const errorMsg = `Failed to set stop loss and take profit: ${data.errorMessage || 'Unknown error'}`;
          this.logError(errorMsg);
          throw new Error(errorMsg);
        }
      } else {
        const errorMsg = `editStopLoss API returned status ${response.status}: ${response.data}`;
        this.logError(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Exception while setting stop loss and take profit: ${error.message}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Reverse an existing position
   * Based on reverseOrder from order_manager.py
   */
  async reverseOrder(accountName, symbol) {
    this.logInfo(`Reversing position for accountName=${accountName}, symbol=${symbol}`);

    // Get JWT token
    const token = authService.getToken();

    // Get account ID
    const { accountId, userId } = await this.getAccountIDAndUserID(accountName, token);
    this.logInfo(`Retrieved accountId=${accountId}, userId=${userId}`);

    // Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol, token);
    if (!symbolId) {
      const errorMsg = `Failed to get symbolId for symbol ${symbol}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }
    this.logInfo(`Retrieved symbolId=${symbolId}`);

    // Create URL for the reverse position endpoint
    const url = `${this.getBaseUrl()}/Position/reverse`;

    // Add the accountId and symbol as query parameters
    const params = {
      accountId,
      symbol: symbolId
    };

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    };

    this.logInfo(`Sending reverse position request to ${url} with params: ${JSON.stringify(params)}`);

    const startTime = Date.now();
    try {
      const response = await axios.get(url, { headers, params });
      const latency = Date.now() - startTime;
      this.logInfo(`Reverse position API response status: ${response.status}`);

      if (response.status === 200) {
        // The API returns a boolean value directly
        const result = response.data;
        this.logInfo(`Reverse position response: ${result}`);

        // Log to traffic monitoring
        logFrontendTrade({
          accountName,
          symbol,
          action: 'REVERSE',
          quantity: 0,
          orderType: 'REVERSE',
          price: null,
          success: true,
          latency
        });

        return result;
      } else {
        const errorMsg = `Reverse position API returned status ${response.status}: ${response.data}`;
        this.logError(errorMsg);

        // Log failed operation
        logFrontendTrade({
          accountName,
          symbol,
          action: 'REVERSE',
          quantity: 0,
          orderType: 'REVERSE',
          price: null,
          success: false,
          latency: Date.now() - startTime,
          errorMessage: errorMsg
        });

        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Exception while reversing position: ${error.message}`;
      this.logError(errorMsg);

      // Log failed operation
      logFrontendTrade({
        accountName,
        symbol,
        action: 'REVERSE',
        quantity: 0,
        orderType: 'REVERSE',
        price: null,
        success: false,
        latency: Date.now() - startTime,
        errorMessage: error.message
      });

      throw new Error(errorMsg);
    }
  }

  /**
   * Close all positions for a symbol
   * Based on closeAllPositionsForASymbol from order_manager.py
   */
  async closeAllPositionsForASymbol(accountName, symbol) {
    this.logInfo(`Closing all positions for accountName=${accountName}, symbol=${symbol}`);

    // Get JWT token
    const token = authService.getToken();

    // Get account ID
    const { accountId, userId } = await this.getAccountIDAndUserID(accountName, token);
    this.logInfo(`Retrieved accountId=${accountId}, userId=${userId}`);

    // Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol, token);
    if (!symbolId) {
      const errorMsg = `Failed to get symbolId for symbol ${symbol}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }
    this.logInfo(`Retrieved symbolId=${symbolId}`);

    // Create URL for the close positions endpoint
    const url = `${this.getBaseUrl()}/Position/close/${accountId}/symbol/${symbolId}`;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json, text/plain, */*'
    };

    this.logInfo(`Sending close positions request to ${url}`);

    const startTime = Date.now();
    try {
      // The API uses DELETE method for closing positions
      const response = await axios.delete(url, { headers });
      const latency = Date.now() - startTime;
      this.logInfo(`Close positions API response status: ${response.status}`);

      if (response.status === 200) {
        // Check if there's any response content
        let success = false;
        if (response.data) {
          const result = response.data;
          this.logInfo(`Close positions response: ${JSON.stringify(result)}`);
          success = !!result;
        } else {
          // If no content but status 200, consider it successful
          this.logInfo("Close positions successful (no content in response)");
          success = true;
        }

        // Log to traffic monitoring
        logFrontendTrade({
          accountName,
          symbol,
          action: 'CLOSE',
          quantity: 0,
          orderType: 'CLOSE',
          price: null,
          success: true,
          latency
        });

        return success;
      } else {
        const errorMsg = `Close positions API returned status ${response.status}: ${response.data}`;
        this.logError(errorMsg);

        // Log failed operation
        logFrontendTrade({
          accountName,
          symbol,
          action: 'CLOSE',
          quantity: 0,
          orderType: 'CLOSE',
          price: null,
          success: false,
          latency: Date.now() - startTime,
          errorMessage: errorMsg
        });

        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Exception while closing positions: ${error.message}`;
      this.logError(errorMsg);

      // Log failed operation
      logFrontendTrade({
        accountName,
        symbol,
        action: 'CLOSE',
        quantity: 0,
        orderType: 'CLOSE',
        price: null,
        success: false,
        latency: Date.now() - startTime,
        errorMessage: error.message
      });

      throw new Error(errorMsg);
    }
  }

  /**
   * Flatten all positions for account
   * Based on flattenAllPositionsForAccount from order_manager.py
   */
  async flattenAllPositionsForAccount(accountName) {
    this.logInfo(`Flattening all positions for accountName=${accountName}`);

    // Get JWT token
    const token = authService.getToken();

    // Get account ID
    const { accountId, userId } = await this.getAccountIDAndUserID(accountName, token);
    this.logInfo(`Retrieved accountId=${accountId}, userId=${userId}`);

    // Create URL for the close all positions endpoint
    const url = `${this.getBaseUrl()}/Position/close/${accountId}`;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json, text/plain, */*'
    };

    this.logInfo(`Sending flatten all positions request to ${url}`);

    const startTime = Date.now();
    try {
      // The API uses DELETE method for closing positions
      const response = await axios.delete(url, { headers });
      const latency = Date.now() - startTime;
      this.logInfo(`Flatten all positions API response status: ${response.status}`);

      if (response.status === 200) {
        // Check if there's any response content
        if (response.data) {
          const result = response.data;
          this.logInfo(`Flatten all positions response: ${JSON.stringify(result)}`);

          // Log to traffic monitoring
          logFrontendTrade({
            accountName,
            symbol: 'ALL',
            action: 'FLATTEN',
            quantity: 0,
            orderType: 'FLATTEN',
            price: null,
            success: true,
            latency
          });

          return !!result;
        } else {
          // If no content but status 200, consider it successful
          this.logInfo("Flatten all positions successful (no content in response)");

          // Log to traffic monitoring
          logFrontendTrade({
            accountName,
            symbol: 'ALL',
            action: 'FLATTEN',
            quantity: 0,
            orderType: 'FLATTEN',
            price: null,
            success: true,
            latency
          });

          return true;
        }
      } else {
        const errorMsg = `Flatten all positions API returned status ${response.status}: ${response.data}`;
        this.logError(errorMsg);

        // Log failed flatten to traffic monitoring
        logFrontendTrade({
          accountName,
          symbol: 'ALL',
          action: 'FLATTEN',
          quantity: 0,
          orderType: 'FLATTEN',
          price: null,
          success: false,
          latency,
          errorMessage: errorMsg
        });

        throw new Error(errorMsg);
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMsg = `Exception while flattening all positions: ${error.message}`;
      this.logError(errorMsg);

      // Log failed flatten to traffic monitoring
      logFrontendTrade({
        accountName,
        symbol: 'ALL',
        action: 'FLATTEN',
        quantity: 0,
        orderType: 'FLATTEN',
        price: null,
        success: false,
        latency,
        errorMessage: errorMsg
      });

      throw new Error(errorMsg);
    }
  }

  /**
   * Event listener management
   */
  addEventListener(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  removeEventListener(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

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
    this.cache.clear();
    console.log('OrderManager cleaned up');
  }

  /**
   * Check if manager is ready (user authenticated and initialized)
   */
  isReady() {
    return authService.isAuthenticated() && configService.getCurrentUser().username;
  }

  /**
   * Cache management
   */
  isCacheValid(key) {
    const cached = this.cache.get(key);
    if (!cached) return false;

    return (Date.now() - cached.timestamp) < this.cacheTimeout;
  }

  updateCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
    console.log('OrderManager cache cleared');
  }
}

export default new OrderManager();