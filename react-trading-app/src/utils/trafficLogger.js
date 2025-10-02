import axios from 'axios';

/**
 * Log a frontend trade to the traffic monitoring system
 * @param {Object} tradeData - The trade data to log
 * @param {string} tradeData.accountName - Account name
 * @param {string} tradeData.symbol - Symbol/ticker
 * @param {string} tradeData.action - BUY/SELL/CLOSE
 * @param {number} tradeData.quantity - Quantity
 * @param {string} tradeData.orderType - Order type
 * @param {number} [tradeData.price] - Optional price
 * @param {boolean} tradeData.success - Whether the trade was successful
 * @param {number} tradeData.latency - Latency in ms
 * @param {number} [tradeData.orderId] - Optional order ID
 * @param {string} [tradeData.errorMessage] - Optional error message
 */
export const logFrontendTrade = async (tradeData) => {
  try {
    await axios.post('/api/traffic/log-frontend', tradeData);
  } catch (error) {
    // Silently fail - logging shouldn't break the app
    console.error('[Traffic Logger] Failed to log trade:', error.message);
  }
};

export default {
  logFrontendTrade
};
