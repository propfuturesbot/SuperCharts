const axios = require('axios');

// Provider configuration mapping
const PROVIDER_ENDPOINTS = {
  topstepx: {
    userapi_endpoint: 'https://userapi.topstepx.com'
  },
  alphaticks: {
    userapi_endpoint: 'https://userapi.alphaticks.projectx.com'
  },
  blueguardian: {
    userapi_endpoint: 'https://userapi.blueguardianfutures.projectx.com'
  },
  thefuturesdesk: {
    userapi_endpoint: 'https://userapi.thefuturesdesk.projectx.com'
  }
};

// Order types
const ORDER_TYPE_MARKET = 2;
const ORDER_TYPE_LIMIT = 1;
const ORDER_TYPE_STOP = 4;
const ORDER_TYPE_TRAIL_STOP = 5;

/**
 * Backend Order Manager - Thin wrapper around existing OrderManager logic
 * Exposes trading operations as REST endpoints
 */
class BackendOrderManager {
  constructor() {
    // Use the existing contract lookup we already have
    this.lookupContractProductId = require('./simple-backend').lookupContractProductId || this.fallbackLookup;
  }

  /**
   * Get provider API endpoint
   */
  getBaseUrl(provider) {
    const config = PROVIDER_ENDPOINTS[provider];
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return config.userapi_endpoint;
  }

  /**
   * Get authorization headers
   */
  getHeaders(token) {
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
   * Convert points to ticks using contract information
   */
  async convertPointsToTicks(symbol, points) {
    try {
      const lookupUrl = `http://localhost:8025/api/contracts/lookup/${encodeURIComponent(symbol)}`;
      const response = await axios.get(lookupUrl);

      if (response.status === 200 && response.data.success) {
        const contractData = response.data.contract_info;
        const tickSize = contractData?.tick_size;

        if (!tickSize) {
          throw new Error(`No tick_size found for symbol ${symbol}`);
        }

        const ticks = points / tickSize;
        console.log(`[DEBUG] Converted ${points} points to ${ticks} ticks for ${symbol} (tick_size: ${tickSize})`);

        return Math.round(ticks);
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
   * Get user ID from token
   */
  async getUserID(provider, token) {
    const url = `${this.getBaseUrl(provider)}/User`;
    const headers = this.getHeaders(token);

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
   * Get symbol ID for trading using existing backend contract lookup
   */
  async getSymbolForTrade(searchSymbol) {
    try {
      const lookupUrl = `http://localhost:8025/api/contracts/lookup/${encodeURIComponent(searchSymbol)}`;
      const response = await axios.get(lookupUrl);

      if (response.status === 200 && response.data.success) {
        const symbolId = response.data.product_id;
        console.log(`[DEBUG] Extracted symbolId from backend: ${symbolId}`);
        return symbolId;
      } else {
        throw new Error(`Backend lookup failed: ${response.data?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`[ERROR] Failed to lookup symbol via backend: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get account info from cached accounts file
   */
  async getAccountIDAndUserID(accountName) {
    try {
      const accountsUrl = `http://localhost:8025/api/accounts/file`;
      const response = await axios.get(accountsUrl);

      if (response.status === 200 && response.data.success) {
        const accountsData = response.data.data;
        const account = accountsData.accounts.find(acc => acc.name === accountName);

        if (account) {
          return {
            accountId: account.id,
            userId: null // Will get from token if needed
          };
        } else {
          throw new Error(`Account ${accountName} not found in cached accounts`);
        }
      } else {
        throw new Error('Failed to load accounts from cache');
      }
    } catch (error) {
      console.error(`[ERROR] Failed to get account info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Place a market order
   */
  async placeMarketOrder(provider, token, accountName, symbol, orderType, quantity = 1) {
    orderType = orderType.toUpperCase();
    let positionSize = Math.abs(quantity);

    if (['SELL', 'SHORT'].includes(orderType)) {
      positionSize = -positionSize;
    } else if (!['BUY', 'LONG'].includes(orderType)) {
      throw new Error(`Invalid order type: ${orderType}. Must be 'Buy' or 'Sell'.`);
    }

    console.log(`[INFO] Placing market order: provider=${provider}, accountName=${accountName}, symbol=${symbol}, orderType=${orderType}, quantity=${quantity}`);

    // Get account ID
    const { accountId } = await this.getAccountIDAndUserID(accountName);

    // Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol);
    if (!symbolId) {
      throw new Error(`Failed to get symbolId for symbol ${symbol}`);
    }

    // Generate unique tag
    const customTag = this.generateCustomTag();

    // Create order payload
    const url = `${this.getBaseUrl(provider)}/Order`;
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

    const headers = this.getHeaders(token);

    console.log(`[INFO] Sending order request to ${url} with payload:`, payload);

    try {
      const response = await axios.post(url, payload, { headers });

      if (response.status === 200) {
        const data = response.data;

        if (data.result === 0 || data.errorMessage == null) {
          const orderId = data.orderId;
          console.log(`[INFO] Market order placed successfully: orderId=${orderId}`);
          return { success: true, orderId, orderData: data };
        } else {
          throw new Error(data.errorMessage || 'Unknown error');
        }
      } else {
        throw new Error(`API returned status ${response.status}: ${response.data}`);
      }
    } catch (error) {
      console.error(`[ERROR] Exception while placing market order: ${error.message}`);
      throw error;
    }
  }

  /**
   * Place a limit order
   */
  async placeLimitOrder(provider, token, accountName, symbol, orderType, limitPrice, qty = 1) {
    orderType = orderType.toUpperCase();
    let positionSize = Math.abs(qty);

    if (['SELL', 'SHORT'].includes(orderType)) {
      positionSize = -positionSize;
    } else if (!['BUY', 'LONG'].includes(orderType)) {
      throw new Error(`Invalid order type: ${orderType}. Must be 'Buy' or 'Sell'.`);
    }

    console.log(`[INFO] Placing limit order: provider=${provider}, accountName=${accountName}, symbol=${symbol}, orderType=${orderType}, limitPrice=${limitPrice}, qty=${qty}`);

    // Get account ID
    const { accountId } = await this.getAccountIDAndUserID(accountName);

    // Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol);
    if (!symbolId) {
      throw new Error(`Failed to get symbolId for symbol ${symbol}`);
    }

    // Generate unique tag
    const customTag = this.generateCustomTag();

    // Create order payload
    const url = `${this.getBaseUrl(provider)}/Order`;
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

    const headers = this.getHeaders(token);

    try {
      const response = await axios.post(url, payload, { headers });

      if (response.status === 200) {
        const data = response.data;

        if (data.errorMessage == null) {
          const orderId = data.orderId;
          console.log(`[INFO] Limit order placed successfully: orderId=${orderId}`);
          return { success: true, orderId, orderData: data };
        } else {
          throw new Error(data.errorMessage || 'Unknown error');
        }
      } else {
        throw new Error(`API returned status ${response.status}: ${response.data}`);
      }
    } catch (error) {
      console.error(`[ERROR] Exception while placing limit order: ${error.message}`);
      throw error;
    }
  }

  /**
   * Place a trailing stop order
   */
  async placeTrailStopOrder(provider, token, accountName, orderType, symbol, quantity, trailDistancePoints) {
    console.log(`[INFO] Placing trailing stop order: provider=${provider}, accountName=${accountName}, orderType=${orderType}, symbol=${symbol}, quantity=${quantity}, trailDistancePoints=${trailDistancePoints}`);

    // Convert trail distance from points to ticks
    const trailDistanceTicks = await this.convertPointsToTicks(symbol, trailDistancePoints);

    // Place the market order first
    const marketOrderResult = await this.placeMarketOrder(provider, token, accountName, symbol, orderType, quantity);

    // Get account ID and symbol ID
    const { accountId } = await this.getAccountIDAndUserID(accountName);
    const symbolId = await this.getSymbolForTrade(symbol);

    // Validate order type
    orderType = orderType.toUpperCase();
    if (!['BUY', 'LONG', 'SELL', 'SHORT'].includes(orderType)) {
      throw new Error(`Invalid order type: ${orderType}. Must be 'Buy' or 'Sell'.`);
    }

    // Place trailing stop order to exit the position
    const url = `${this.getBaseUrl(provider)}/Order`;
    const customTag = this.generateCustomTag();

    // For exiting the position, we need opposite direction
    let exitPositionSize;
    if (['BUY', 'LONG'].includes(orderType)) {
      exitPositionSize = -Math.abs(quantity);
    } else {
      exitPositionSize = Math.abs(quantity);
    }

    const payload = {
      accountId,
      symbolId,
      type: ORDER_TYPE_TRAIL_STOP,
      limitPrice: null,
      stopPrice: null,
      trailDistance: trailDistanceTicks,
      positionSize: exitPositionSize,
      customTag
    };

    const headers = this.getHeaders(token);

    try {
      const response = await axios.post(url, payload, { headers });

      if (response.status === 200) {
        const data = response.data;

        if (data.errorMessage == null) {
          const trailStopOrderId = data.orderId;
          console.log(`[INFO] Trailing stop order placed successfully: orderId=${trailStopOrderId}`);
          return {
            success: true,
            marketOrderId: marketOrderResult.orderId,
            trailStopOrderId,
            orderData: data
          };
        } else {
          throw new Error(data.errorMessage || 'Unknown error');
        }
      } else {
        throw new Error(`API returned status ${response.status}: ${response.data}`);
      }
    } catch (error) {
      console.error(`[ERROR] Exception while placing trailing stop order: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close all positions for a symbol
   */
  async closeAllPositionsForASymbol(provider, token, accountName, symbol) {
    console.log(`[INFO] Closing all positions: provider=${provider}, accountName=${accountName}, symbol=${symbol}`);

    // Get account ID and symbol ID
    const { accountId } = await this.getAccountIDAndUserID(accountName);
    const symbolId = await this.getSymbolForTrade(symbol);

    // Create URL for the close positions endpoint
    const url = `${this.getBaseUrl(provider)}/Position/close/${accountId}/symbol/${symbolId}`;
    const headers = this.getHeaders(token);

    try {
      const response = await axios.delete(url, { headers });

      if (response.status === 200) {
        console.log(`[INFO] Close positions successful`);
        return { success: true, data: response.data };
      } else {
        throw new Error(`API returned status ${response.status}: ${response.data}`);
      }
    } catch (error) {
      console.error(`[ERROR] Exception while closing positions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Flatten all positions for account
   */
  async flattenAllPositionsForAccount(provider, token, accountName) {
    console.log(`[INFO] Flattening all positions: provider=${provider}, accountName=${accountName}`);

    // Get account ID
    const { accountId } = await this.getAccountIDAndUserID(accountName);

    // Create URL for the close all positions endpoint
    const url = `${this.getBaseUrl(provider)}/Position/close/${accountId}`;
    const headers = this.getHeaders(token);

    try {
      const response = await axios.delete(url, { headers });

      if (response.status === 200) {
        console.log(`[INFO] Flatten all positions successful`);
        return { success: true, data: response.data };
      } else {
        throw new Error(`API returned status ${response.status}: ${response.data}`);
      }
    } catch (error) {
      console.error(`[ERROR] Exception while flattening all positions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get filled price and position ID for an account/symbol combination
   */
  async getFilledPriceAndPositionIdForAccountId(provider, token, accountId, symbolId) {
    const userId = await this.getUserID(provider, token);
    if (!userId) {
      throw new Error('Failed to retrieve user ID for token.');
    }

    const url = `${this.getBaseUrl(provider)}/Position/all/user/${userId}`;
    const headers = this.getHeaders(token);

    console.log(`[DEBUG] Requesting positions from URL: ${url}`);

    try {
      const response = await axios.get(url, { headers });
      console.log(`[DEBUG] Response status code for positions: ${response.status}`);

      if (response.status === 200) {
        const positions = response.data;
        console.log(`[DEBUG] Received ${positions.length} positions`);

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
   * Poll for position fill after market order
   */
  async pollForFill(provider, token, accountId, symbolId, maxWaitMs = 5000, pollIntervalMs = 20) {
    console.log("[INFO] Polling for position fill...");

    const maxAttempts = Math.floor(maxWaitMs / pollIntervalMs);
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const { averagePrice, positionId } = await this.getFilledPriceAndPositionIdForAccountId(provider, token, accountId, symbolId);
        console.log(`[INFO] Position filled at price: ${averagePrice}, position ID: ${positionId}`);
        return { averagePrice, positionId };
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          console.error(`[ERROR] Timed out waiting for position fill after ${maxWaitMs/1000} seconds.`);
          throw new Error(`Timed out waiting for position fill: ${error.message}`);
        }

        console.log(`[INFO] Fill not found yet, polling attempt ${attempts}/${maxAttempts}...`);
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }
  }

  /**
   * Place a market order with stop-loss (complete implementation from frontend)
   */
  async placeMarketWithStopLossOrder(provider, token, accountName, orderType, symbol, quantity, stopLossPoints) {
    console.log(`[INFO] Placing market order with stop loss: accountName=${accountName}, orderType=${orderType}, symbol=${symbol}, quantity=${quantity}, stopLossPoints=${stopLossPoints}`);

    // 1. Place the market order first
    const marketOrderResult = await this.placeMarketOrder(provider, token, accountName, symbol, orderType, quantity);
    const marketOrderId = marketOrderResult.orderId;
    console.log(`[INFO] Market order placed successfully, order ID: ${marketOrderId}`);

    // 2. Get account ID
    const { accountId } = await this.getAccountIDAndUserID(accountName);
    console.log(`[INFO] Retrieved accountId=${accountId}`);

    // 3. Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol);
    if (!symbolId) {
      throw new Error(`Failed to get symbolId for symbol ${symbol}`);
    }

    // 4. Poll for the filled price and position ID
    const { averagePrice, positionId } = await this.pollForFill(provider, token, accountId, symbolId);
    console.log(`[INFO] Order filled at price ${averagePrice}, positionId=${positionId}`);

    // 5. Calculate stop loss price based on order type
    let stopLossPrice;
    orderType = orderType.toUpperCase();

    if (['BUY', 'LONG'].includes(orderType)) {
      // For buy orders, stop loss is below entry price
      stopLossPrice = averagePrice - stopLossPoints;
    } else if (['SELL', 'SHORT'].includes(orderType)) {
      // For sell orders, stop loss is above entry price
      stopLossPrice = averagePrice + stopLossPoints;
    } else {
      throw new Error(`Invalid order type: ${orderType}. Must be 'BUY' or 'SELL'.`);
    }

    console.log(`[INFO] Calculated stop loss price: ${stopLossPrice}`);

    // 6. Set stop loss using editStopLossAccount endpoint
    const url = `${this.getBaseUrl(provider)}/Order/editStopLossAccount`;
    const payload = {
      positionId,
      stopLoss: stopLossPrice,
      takeProfit: null // No take profit for this method
    };

    const headers = this.getHeaders(token);
    console.log(`[INFO] Sending editStopLoss request to ${url}`);

    try {
      const response = await axios.post(url, payload, { headers });

      if (response.status === 200 && response.data.success === true) {
        console.log(`[INFO] Stop loss set successfully for position ID: ${positionId}`);
        return {
          success: true,
          marketOrderId,
          stopOrderId: response.data.orderId,
          marketOrderData: marketOrderResult.orderData
        };
      } else {
        throw new Error(`Failed to set stop loss: ${response.data.errorMessage || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`[ERROR] Exception while setting stop loss: ${error.message}`);
      throw error;
    }
  }

  /**
   * Place a bracket order (complete implementation from frontend)
   */
  async placeBracketOrderWithTPAndSL(provider, token, accountName, symbol, orderType, quantity, stopLossPoints, takeProfitPoints) {
    console.log(`[INFO] Placing bracket order: accountName=${accountName}, symbol=${symbol}, orderType=${orderType}, quantity=${quantity}, stopLossPoints=${stopLossPoints}, takeProfitPoints=${takeProfitPoints}`);

    // 1. Place the market order first
    const marketOrderResult = await this.placeMarketOrder(provider, token, accountName, symbol, orderType, quantity);
    const marketOrderId = marketOrderResult.orderId;
    console.log(`[INFO] Market order placed successfully, order ID: ${marketOrderId}`);

    // 2. Get account ID
    const { accountId } = await this.getAccountIDAndUserID(accountName);
    console.log(`[INFO] Retrieved accountId=${accountId}`);

    // 3. Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol);
    if (!symbolId) {
      throw new Error(`Failed to get symbolId for symbol ${symbol}`);
    }

    // 4. Poll for the filled price and position ID
    const { averagePrice, positionId } = await this.pollForFill(provider, token, accountId, symbolId);
    console.log(`[INFO] Order filled at price ${averagePrice}, positionId=${positionId}`);

    // 5. Calculate stop loss and take profit prices based on order type
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
      throw new Error(`Invalid order type: ${orderType}. Must be 'BUY' or 'SELL'.`);
    }

    console.log(`[INFO] Calculated stop loss price: ${stopLossPrice}, take profit price: ${takeProfitPrice}`);

    // 6. Set stop loss and take profit using editStopLossAccount endpoint
    const url = `${this.getBaseUrl(provider)}/Order/editStopLossAccount`;
    const payload = {
      positionId,
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice
    };

    const headers = this.getHeaders(token);
    console.log(`[INFO] Sending editStopLoss request to ${url}`);

    try {
      const response = await axios.post(url, payload, { headers });

      if (response.status === 200 && response.data.success === true) {
        console.log(`[INFO] Stop loss and take profit set successfully for position ID: ${positionId}`);
        return {
          success: true,
          marketOrderId,
          stopOrderId: response.data.stopOrderId,
          takeProfitOrderId: response.data.takeProfitOrderId,
          marketOrderData: marketOrderResult.orderData
        };
      } else {
        throw new Error(`Failed to set bracket orders: ${response.data.errorMessage || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`[ERROR] Exception while setting bracket orders: ${error.message}`);
      throw error;
    }
  }

  /**
   * Place a stop-loss order
   */
  async placeStopOrder(provider, token, accountName, symbol, orderType, stopPrice, quantity = 1) {
    orderType = orderType.toUpperCase();
    let positionSize = Math.abs(quantity);

    if (['SELL', 'SHORT'].includes(orderType)) {
      positionSize = -positionSize;
    } else if (!['BUY', 'LONG'].includes(orderType)) {
      throw new Error(`Invalid order type: ${orderType}. Must be 'Buy' or 'Sell'.`);
    }

    console.log(`[INFO] Placing stop order: provider=${provider}, accountName=${accountName}, symbol=${symbol}, orderType=${orderType}, stopPrice=${stopPrice}, quantity=${quantity}`);

    // Get account ID
    const { accountId } = await this.getAccountIDAndUserID(accountName);

    // Get symbol ID
    const symbolId = await this.getSymbolForTrade(symbol);
    if (!symbolId) {
      throw new Error(`Failed to get symbolId for symbol ${symbol}`);
    }

    // Generate unique tag
    const customTag = this.generateCustomTag();

    // Create order payload
    const url = `${this.getBaseUrl(provider)}/Order`;
    const payload = {
      accountId,
      symbolId,
      type: ORDER_TYPE_STOP,
      limitPrice: null,
      stopPrice,
      trailDistance: null,
      positionSize,
      customTag
    };

    const headers = this.getHeaders(token);

    try {
      const response = await axios.post(url, payload, { headers });

      if (response.status === 200) {
        const data = response.data;

        if (data.errorMessage == null) {
          const orderId = data.orderId;
          console.log(`[INFO] Stop order placed successfully: orderId=${orderId}`);
          return { success: true, orderId, orderData: data };
        } else {
          throw new Error(data.errorMessage || 'Unknown error');
        }
      } else {
        throw new Error(`API returned status ${response.status}: ${response.data}`);
      }
    } catch (error) {
      console.error(`[ERROR] Exception while placing stop order: ${error.message}`);
      throw error;
    }
  }

  /**
   * Place a bracket order (entry + profit target + stop loss)
   */
  async placeBracketOrder(provider, token, accountName, symbol, orderType, entryPrice, profitTarget, stopLoss, quantity = 1) {
    console.log(`[INFO] Placing bracket order: provider=${provider}, accountName=${accountName}, symbol=${symbol}, orderType=${orderType}, entry=${entryPrice}, target=${profitTarget}, stop=${stopLoss}, quantity=${quantity}`);

    // Place the entry order first (limit order)
    const entryOrderResult = await this.placeLimitOrder(provider, token, accountName, symbol, orderType, entryPrice, quantity);

    // For bracket orders, we would typically place contingent orders
    // For now, we'll return the entry order and note that profit/stop orders would be conditional
    console.log(`[INFO] Bracket order entry placed: orderId=${entryOrderResult.orderId}`);
    console.log(`[INFO] Note: Profit target (${profitTarget}) and stop loss (${stopLoss}) would be placed as conditional orders`);

    return {
      success: true,
      entryOrderId: entryOrderResult.orderId,
      entryOrderData: entryOrderResult.orderData,
      note: 'Entry order placed. Profit target and stop loss orders would be placed as conditional orders based on entry fill.'
    };
  }

  /**
   * Reverse an existing position
   */
  async reverseOrder(provider, token, accountName, symbol) {
    console.log(`[INFO] Reversing position: provider=${provider}, accountName=${accountName}, symbol=${symbol}`);

    // Get account ID and symbol ID
    const { accountId } = await this.getAccountIDAndUserID(accountName);
    const symbolId = await this.getSymbolForTrade(symbol);

    // Create URL for the reverse position endpoint
    const url = `${this.getBaseUrl(provider)}/Position/reverse`;
    const params = { accountId, symbol: symbolId };
    const headers = this.getHeaders(token);

    try {
      const response = await axios.get(url, { headers, params });

      if (response.status === 200) {
        console.log(`[INFO] Reverse position successful:`, response.data);
        return { success: true, data: response.data };
      } else {
        throw new Error(`API returned status ${response.status}: ${response.data}`);
      }
    } catch (error) {
      console.error(`[ERROR] Exception while reversing position: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fallback contract lookup if main function not available
   */
  fallbackLookup(contractName) {
    console.warn(`[WARN] Using fallback contract lookup for ${contractName}`);
    return {
      success: false,
      error: 'Contract lookup not available'
    };
  }
}

module.exports = new BackendOrderManager();