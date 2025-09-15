// Historical data fetching service

import authService from '../../../services/auth.service';
import { getProviderConfig } from '../../../config/providers';
import { convertProductIdToSymbol } from '../utils/symbolConverter';
import { processRawData } from '../utils/dataProcessor';
import { resolutionConfig } from '../utils/resolutionConfig';

/**
 * Fetch historical data from the provider's API
 * @param {string} productId - Product ID or symbol
 * @param {string} resolution - Resolution/timeframe
 * @param {number} countback - Number of bars to fetch
 * @returns {Promise<Array>} Processed historical data
 */
export const fetchHistoricalData = async (productId, resolution, countback = null) => {
  try {
    // Get authentication token
    const accessToken = authService.getToken();
    if (!accessToken) {
      console.warn('No authentication token available - using demo data');
      // Return demo data for testing when not authenticated
      return generateDemoData();
    }
    
    // Get provider configuration
    const provider = authService.getProvider();
    const providerConfig = getProviderConfig(provider);
    if (!providerConfig) {
      console.warn('No provider configuration available - using demo data');
      return generateDemoData();
    }
    
    // Get resolution config
    const resConfig = resolutionConfig[resolution];
    if (!resConfig) {
      throw new Error(`Invalid resolution: ${resolution}`);
    }
    
    // Use provided countback or default from config
    const barsToFetch = countback || resConfig.countback;
    
    // Convert product ID to API symbol format
    const symbol = convertProductIdToSymbol(productId);
    
    // Calculate time range - 2 months of data
    const now = Math.floor(Date.now() / 1000);
    const from = now - (86400 * 60); // 60 days ago (2 months)
    const to = now;
    
    // Build API URL
    const url = `${providerConfig.chartapi_endpoint}/History/v2?` +
      `Symbol=${symbol}&` +
      `Resolution=${resolution}&` +
      `Countback=${barsToFetch}&` +
      `From=${from}&` +
      `To=${to}&` +
      `SessionId=extended&` +
      `Live=false`;
    
    console.log('Fetching historical data:', {
      provider: providerConfig.name,
      symbol,
      resolution,
      countback: barsToFetch,
      url
    });
    
    // Fetch data
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP error! status: ${response.status}, response: ${errorText}`);
      throw new Error(`Failed to fetch historical data: ${response.status}`);
    }
    
    const rawData = await response.json();
    
    // Handle different response formats
    let bars = Array.isArray(rawData) ? rawData : (rawData.data || rawData.bars || []);
    
    if (!Array.isArray(bars)) {
      console.error('Unexpected data format:', rawData);
      throw new Error('Invalid data format received from API');
    }
    
    console.log(`Received ${bars.length} bars for resolution ${resolution}`);
    
    if (bars.length === 0) {
      console.warn(`No data received for resolution ${resolution}`);
      return [];
    }
    
    // Process and return the data
    const processedData = processRawData(bars, resolution);
    console.log(`Processed ${processedData.length} valid bars`);
    
    return processedData;
    
  } catch (error) {
    console.error('Error fetching historical data:', error);
    throw error;
  }
};

/**
 * Retry fetch with exponential backoff
 * @param {Function} fetchFn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in ms
 * @returns {Promise} Result of the fetch function
 */
export const fetchWithRetry = async (fetchFn, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;
      console.warn(`Fetch attempt ${i + 1} failed:`, error.message);
      
      if (i < maxRetries - 1) {
        const waitTime = delay * Math.pow(2, i);
        console.log(`Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError;
};

/**
 * Check if authentication is valid
 * @returns {boolean} True if authenticated
 */
export const isAuthenticated = () => {
  return authService.isAuthenticated();
};

/**
 * Get current provider info
 * @returns {Object} Provider configuration
 */
export const getCurrentProvider = () => {
  const provider = authService.getProvider();
  return getProviderConfig(provider);
};

/**
 * Generate demo data for testing when authentication is not available
 * @returns {Array} Demo OHLC data
 */
const generateDemoData = () => {
  const data = [];
  const baseTime = Math.floor(Date.now() / 1000) - (86400 * 60); // 60 days ago
  let price = 20000; // Starting price for demo
  
  // Generate 2 months of hourly data (60 days * 24 hours = 1440 bars)
  for (let i = 0; i < 1440; i++) {
    const time = baseTime + (i * 3600); // 1 hour intervals
    
    // Generate realistic OHLC data
    const volatility = 0.002; // 0.2% volatility
    const change = (Math.random() - 0.5) * volatility * price;
    
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 0.001 * price;
    const low = Math.min(open, close) - Math.random() * 0.001 * price;
    const volume = Math.floor(Math.random() * 1000) + 100;
    
    data.push({
      time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume
    });
    
    price = close; // Update price for next bar
  }
  
  console.log('Generated demo data with', data.length, 'bars for 2 months');
  return data;
};