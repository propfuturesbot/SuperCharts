// Get access token from JSON file via backend API
let ACCESS_TOKEN = null;

// Webhook service for signal notifications (browser-compatible)
const sendPayload = async (action, ticker, strategyId) => {
  try {
    // First get strategy details to get webhook URL and payload
    const strategyResponse = await fetch(`http://localhost:8025/api/strategies`);
    if (!strategyResponse.ok) {
      throw new Error('Failed to fetch strategy details');
    }

    const strategyData = await strategyResponse.json();
    if (!strategyData.success || !strategyData.data) {
      throw new Error('Invalid strategy data response');
    }

    const strategy = strategyData.data.find(s => s.id === strategyId);
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    const webhookUrl = strategy.webhook_url;
    if (!webhookUrl) {
      console.warn(`⚠️ No webhook URL configured for strategy ${strategyId}`);
      return;
    }

    // Prepare the payload
    let finalPayload;
    if (strategy.webhook_payload) {
      try {
        // Parse the stored payload (it's stored as JSON string)
        const parsedPayload = typeof strategy.webhook_payload === 'string'
          ? JSON.parse(strategy.webhook_payload)
          : strategy.webhook_payload;

        // Replace the action in the payload with the actual signal action
        finalPayload = {
          ...parsedPayload,
          action: action, // Replace with actual signal action (buy/sell)
          symbol: ticker  // Also update symbol with current ticker
        };
      } catch (e) {
        console.error('Error parsing webhook payload, using default:', e);
        finalPayload = {
          action: action,
          symbol: ticker
        };
      }
    } else {
      // Default payload if none configured
      finalPayload = {
        action: action,
        symbol: ticker
      };
    }

    // Log the details BEFORE sending (so we see them even if webhook fails)
    console.log(`📤 Attempting webhook: ${action} signal for ${ticker}`);
    console.log(`📡 Webhook URL: ${webhookUrl}`);
    console.log(`📦 Webhook Payload:`, JSON.stringify(finalPayload, null, 2));

    // Send POST request directly to the webhook URL
    try {
      const webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PropFuturesBot/1.0'
        },
        body: JSON.stringify(finalPayload)
      });

      if (webhookResponse.ok) {
        console.log(`✅ Webhook sent successfully: ${webhookResponse.status} ${webhookResponse.statusText}`);
      } else {
        console.warn(`⚠️ Webhook returned error: ${webhookResponse.status} ${webhookResponse.statusText}`);
      }
    } catch (fetchError) {
      console.warn(`⚠️ Webhook failed to send: ${fetchError.message} (CORS/Network error)`);
    }

  } catch (error) {
    console.error('❌ Error sending webhook:', error.message);
  }
};

// Get provider configuration from the global ProviderConfig (loaded from providers-browser.js)
const getProviderConfig = (providerKey) => {
  // Check if ProviderConfig is available (loaded from providers-browser.js)
  if (window.ProviderConfig && window.ProviderConfig.getProviderConfig) {
    return window.ProviderConfig.getProviderConfig(providerKey);
  }

  // Fallback: define providers inline if ProviderConfig not loaded
  console.warn('ProviderConfig not loaded. Using fallback provider configuration.');

  const fallbackProviders = {
    topstepx: {
      name: 'TopStepX',
      api_endpoint: 'https://api.topstepx.com',
      userapi_endpoint: 'https://userapi.topstepx.com',
      websocket_endpoint: 'wss://api.topstepx.com/signalr',
      user_hub: 'https://rtc.topstepx.com/hubs/user',
      market_hub: 'https://rtc.topstepx.com/hubs/market',
      websocket_chartapi: 'wss://chartapi.topstepx.com/hubs',
      chartapi_endpoint: 'https://chartapi.topstepx.com'
    },
    alphaticks: {
      name: 'AlphaTicks',
      api_endpoint: 'https://api.alphaticks.projectx.com',
      userapi_endpoint: 'https://userapi.alphaticks.projectx.com',
      websocket_endpoint: 'wss://api.alphaticks.projectx.com/signalr',
      user_hub: 'https://rtc.alphaticks.projectx.com/hubs/user',
      market_hub: 'https://rtc.alphaticks.projectx.com/hubs/market',
      websocket_chartapi: 'wss://chartapi.alphaticks.projectx.com/hubs',
      chartapi_endpoint: 'https://chartapi.alphaticks.projectx.com'
    },
    blueguardian: {
      name: 'Blue Guardian',
      api_endpoint: 'https://api.blueguardianfutures.projectx.com',
      userapi_endpoint: 'https://userapi.blueguardianfutures.projectx.com',
      websocket_endpoint: 'wss://api.blueguardianfutures.projectx.com/signalr',
      user_hub: 'https://rtc.blueguardianfutures.projectx.com/hubs/user',
      market_hub: 'https://rtc.blueguardianfutures.projectx.com/hubs/market',
      websocket_chartapi: 'wss://chartapi.blueguardianfutures.projectx.com/hubs',
      chartapi_endpoint: 'https://chartapi.blueguardianfutures.projectx.com'
    },
    thefuturesdesk: {
      name: 'The Futures Desk',
      api_endpoint: 'https://api.thefuturesdesk.projectx.com',
      userapi_endpoint: 'https://userapi.thefuturesdesk.projectx.com',
      websocket_endpoint: 'wss://api.thefuturesdesk.projectx.com/signalr',
      user_hub: 'https://rtc.thefuturesdesk.projectx.com/hubs/user',
      market_hub: 'https://rtc.thefuturesdesk.projectx.com/hubs/market',
      websocket_chartapi: 'wss://chartapi.thefuturesdesk.projectx.com/hubs',
      chartapi_endpoint: 'https://chartapi.thefuturesdesk.projectx.com'
    }
  };

  return fallbackProviders[providerKey] || fallbackProviders.topstepx;
};

// Store provider information globally
let CURRENT_PROVIDER = null;
let PROVIDER_CONFIG = null;

// Function to get access token and provider from backend
const getAccessToken = async () => {
  if (!ACCESS_TOKEN) {
    try {
      const response = await fetch('http://localhost:8025/api/auth/token');
      if (response.ok) {
        const data = await response.json();
        ACCESS_TOKEN = data.data.token;
        CURRENT_PROVIDER = data.data.provider || 'topstepx';
        console.log(`✅ Token loaded from auth-token.json file for provider: ${CURRENT_PROVIDER}`);

        // Load provider configuration using the common getProviderConfig function
        PROVIDER_CONFIG = getProviderConfig(CURRENT_PROVIDER);
        console.log(`📊 Using provider config for ${CURRENT_PROVIDER}:`, PROVIDER_CONFIG.chartapi_endpoint);
      } else {
        throw new Error(`Failed to load token from backend: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error fetching token:', error);
      throw new Error('Unable to load authentication token from auth-token.json file. Please login first.');
    }
  }
  return ACCESS_TOKEN;
};

// Get contract from URL parameters or chart configuration or use default
const getContractFromURL = () => {
  // First check if we have a chart configuration from the strategy wizard
  if (window.CHART_CONFIG && window.CHART_CONFIG.contractSymbol) {
    const configContract = window.CHART_CONFIG.contractSymbol.replace(/^\//, '');
    console.log('📊 Using contract from chart config:', configContract);
    return configContract;
  }

  // Otherwise check URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const contract = urlParams.get('contract') || urlParams.get('symbol') || 'MNQ';
  console.log('📊 Using contract from URL/default:', contract);
  return contract;
};

// Convert contract symbol to API format (e.g., ES -> F.US.ES, /ES -> F.US.ES)
const formatContractSymbol = (symbol) => {
  // Remove leading slash if present
  const cleanSymbol = symbol.replace(/^\//, '');
  // Add F.US. prefix for API
  return `F.US.${cleanSymbol}`;
};

// Get current contract
const CURRENT_CONTRACT = getContractFromURL();
const API_CONTRACT_SYMBOL = formatContractSymbol(CURRENT_CONTRACT);

let chart = null;
let candleSeries = null;
let connection = null;
let currentResolution = '15';
let currentSubscription = null;
let historicalData = [];
let lastBarTime = null;
let currentBar = null;
let currentChartType = 'candlestick';
let heikenAshiData = [];
let renkoData = [];
let currentBrickSize = 10;
let renkoState = {
  lastBrickHigh: null,
  lastBrickLow: null,
  direction: 1, // 1 for up, -1 for down
  lastTimestamp: null // Track the last timestamp used
};

// Indicator variables
let activeIndicators = new Map();
let indicatorSeries = new Map();

// Trading signals variables
let signalMarkers = [];
let activeSignals = new Map();
let lastTouchLower = false;
let lastTouchUpper = false;
let lastSignalUpdate = 0;
let signalUpdateDebounceTime = 500; // 500ms debounce

// Tick chart accumulation variables
let tickAccumulator = null;
let tickCount = 0;
let currentTicksPerBar = 10; // Dynamic based on resolution
let lastTickTime = null;

// Function to get ticks per bar based on resolution
const getTicksPerBar = (resolution) => {
  if (!resolution.endsWith('T')) return 10;
  
  const tickValue = parseInt(resolution.replace('T', ''));
  
  // Scale the accumulation based on tick resolution
  // For smaller resolutions, accumulate fewer individual ticks
  // For larger resolutions, accumulate more individual ticks
  switch (tickValue) {
    case 100: return 5;   // 100T: accumulate 5 individual ticks per bar
    case 500: return 15;  // 500T: accumulate 15 individual ticks per bar
    case 1000: return 25; // 1000T: accumulate 25 individual ticks per bar
    case 5000: return 50; // 5000T: accumulate 50 individual ticks per bar
    default: return Math.max(5, Math.min(50, Math.floor(tickValue / 20))); // Dynamic scaling
  }
};

const resolutionConfig = {
  // Tick-based resolutions
  '100T': { countback: 50, displayName: '100 Ticks', symbol: API_CONTRACT_SYMBOL },
  '500T': { countback: 50, displayName: '500 Ticks', symbol: API_CONTRACT_SYMBOL },
  '1000T': { countback: 50, displayName: '1000 Ticks', symbol: API_CONTRACT_SYMBOL },
  '5000T': { countback: 50, displayName: '5000 Ticks', symbol: API_CONTRACT_SYMBOL },

  // Second-based resolutions
  '1S': { countback: 500, displayName: '1 Second', symbol: API_CONTRACT_SYMBOL },
  '5S': { countback: 500, displayName: '5 Seconds', symbol: API_CONTRACT_SYMBOL },
  '10S': { countback: 500, displayName: '10 Seconds', symbol: API_CONTRACT_SYMBOL },
  '15S': { countback: 500, displayName: '15 Seconds', symbol: API_CONTRACT_SYMBOL },
  '20S': { countback: 500, displayName: '20 Seconds', symbol: API_CONTRACT_SYMBOL },
  '30S': { countback: 500, displayName: '30 Seconds', symbol: API_CONTRACT_SYMBOL },

  // Minute-based resolutions
  '1': { countback: 500, displayName: '1 Minute', symbol: API_CONTRACT_SYMBOL },
  '2': { countback: 500, displayName: '2 Minutes', symbol: API_CONTRACT_SYMBOL },
  '3': { countback: 500, displayName: '3 Minutes', symbol: API_CONTRACT_SYMBOL },
  '4': { countback: 500, displayName: '4 Minutes', symbol: API_CONTRACT_SYMBOL },
  '5': { countback: 500, displayName: '5 Minutes', symbol: API_CONTRACT_SYMBOL },
  '10': { countback: 500, displayName: '10 Minutes', symbol: API_CONTRACT_SYMBOL },
  '15': { countback: 500, displayName: '15 Minutes', symbol: API_CONTRACT_SYMBOL },
  '20': { countback: 500, displayName: '20 Minutes', symbol: API_CONTRACT_SYMBOL },
  '30': { countback: 500, displayName: '30 Minutes', symbol: API_CONTRACT_SYMBOL },
  '45': { countback: 500, displayName: '45 Minutes', symbol: API_CONTRACT_SYMBOL },
  '60': { countback: 500, displayName: '1 Hour', symbol: API_CONTRACT_SYMBOL },
  '1D': { countback: 326, displayName: '1 Day', symbol: API_CONTRACT_SYMBOL },
  '1W': { countback: 500, displayName: '1 Week', symbol: API_CONTRACT_SYMBOL },
  '1M': { countback: 500, displayName: '1 Month', symbol: API_CONTRACT_SYMBOL }
};

const getHistoricalData = async (resolution, countback, symbol = null) => {
  // Use provided symbol or default to current contract
  if (!symbol) {
    symbol = `%2F${CURRENT_CONTRACT}`;
  }
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - (86400 * 7); // 7 days ago
    const to = now;

    // Ensure we have provider configuration
    if (!PROVIDER_CONFIG) {
      await getAccessToken(); // This will load provider config
    }

    const url = `${PROVIDER_CONFIG.chartapi_endpoint}/History/v2?Symbol=${symbol}&Resolution=${resolution}&Countback=${countback}&From=${from}&To=${to}&SessionId=extended&Live=false`;

    const token = await getAccessToken();
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`HTTP error! status: ${res.status}, response: ${errorText}`);
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
      return [];
    }
    
    // Handle both array and object with data property
    let bars = Array.isArray(data) ? data : (data.data || data.bars || []);
    
    if (!Array.isArray(bars)) {
      console.error('Unexpected data format:', data);
      return [];
    }
    
    if (bars.length === 0) {
      console.warn(`No data received for resolution ${resolution}`);
      return [];
    }
    
    // Sort bars by time and convert to chart format
    const chartData = bars
      .map(bar => {
        // Validate bar data
        if (!bar || typeof bar.t === 'undefined' || typeof bar.o === 'undefined') {
          console.warn('Invalid bar data:', bar);
          return null;
        }
        
        return {
          time: Math.floor(bar.t / 1000), // Convert milliseconds to seconds
          open: parseFloat(bar.o),
          high: parseFloat(bar.h),
          low: parseFloat(bar.l),
          close: parseFloat(bar.c),
          volume: parseInt(bar.v || bar.tv || 0)
        };
      })
      .filter(bar => {
        if (!bar) return false;
        // Ensure all required fields are valid numbers
        return !isNaN(bar.time) && !isNaN(bar.open) && !isNaN(bar.high) && 
               !isNaN(bar.low) && !isNaN(bar.close) && bar.time > 0;
      })
      .sort((a, b) => a.time - b.time);

    // Fix duplicate timestamps for tick charts by adding incremental seconds
    if (resolution.endsWith('T') && chartData.length > 0) {
      let duplicatesFixed = 0;
      
      for (let i = 1; i < chartData.length; i++) {
        if (chartData[i].time <= chartData[i - 1].time) {
          chartData[i].time = chartData[i - 1].time + 1;
          duplicatesFixed++;
        }
      }
}
    if (chartData.length > 0) {
      lastBarTime = chartData[chartData.length - 1].time;
      currentBar = { ...chartData[chartData.length - 1] };
    }
    
    return chartData;
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return [];
  }
};

const initializeChart = () => {
  const chartElement = document.getElementById('chart');
  
  // Check if LightweightCharts is available
  if (typeof LightweightCharts === 'undefined') {
    console.error('LightweightCharts library not loaded');
    return;
  }
  
  // Clear existing chart if any
  if (chart) {
    chart.remove();
  }
  
  chart = LightweightCharts.createChart(chartElement, {
    width: chartElement.offsetWidth,
    height: chartElement.offsetHeight,
    layout: {
      background: { color: '#222' },
      textColor: '#DDD',
    },
    grid: {
      vertLines: { color: '#444' },
      horzLines: { color: '#444' },
    },
    timeScale: {
      timeVisible: true,
      secondsVisible: true,
      borderVisible: false,
    },
    rightPriceScale: {
      borderVisible: false,
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
  });
  
  candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
  });
  
  // Handle window resize
  window.addEventListener('resize', () => {
    chart.applyOptions({ 
      width: chartElement.offsetWidth,
      height: chartElement.offsetHeight 
    });
  });
};

const setupRealTimeConnection = async () => {
  try {
    if (connection && connection.state === signalR.HubConnectionState.Connected) {
      await connection.stop();
    }

    const token = await getAccessToken();

    // Ensure we have provider configuration
    if (!PROVIDER_CONFIG) {
      await getAccessToken(); // This will load provider config
    }

    connection = new signalR.HubConnectionBuilder()
      .withUrl(`${PROVIDER_CONFIG.websocket_chartapi}/chart?access_token=${token}`, {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets
      })
      .configureLogging(signalR.LogLevel.Information)
      .withAutomaticReconnect()
      .build();
    
    connection.on("RealTimeBar", (receivedSymbol, receivedResolution, bar) => {
      // Check if this update is for our current resolution
      if (receivedResolution === currentResolution) {
        handleRealTimeBar(bar);
      }
    });
    
    connection.onreconnecting(() => {
      updateStatus('Reconnecting...', false);
    });
    
    connection.onreconnected(async () => {
      updateStatus('Connected', true);
      await subscribeToResolution(currentResolution);
      isRealTimeReady = true; // Ready for real-time signals
    });
    
    connection.onclose(() => {
      updateStatus('Disconnected', false);
    });
    
    await connection.start();
    updateStatus('Connected', true);

    // Subscribe to the current resolution
    await subscribeToResolution(currentResolution);

    // Mark system as ready for real-time signals
    isRealTimeReady = true;
    console.log('✅ Real-time connection established - webhooks enabled');
    
  } catch (error) {
    console.error('Failed to setup real-time connection:', error);
    updateStatus('Connection Failed', false);
  }
};

const handleRealTimeBar = (bar) => {
  if (!bar) {
    console.warn('Invalid bar received:', bar);
    return;
  }

  // Store the original bar data
  const originalBar = { ...bar };

  let timestamp;
  
  // Try timestampUnix first (if it's valid)
  if (bar.timestampUnix && bar.timestampUnix > 0) {
    timestamp = bar.timestampUnix * 1000; // Convert to milliseconds
  }
  // If timestampUnix is 0 or invalid, parse the ISO timestamp string
  else if (bar.timestamp && typeof bar.timestamp === 'string') {
    timestamp = new Date(bar.timestamp).getTime();
  }
  // Fallback to other timestamp fields
  else if (bar.t) {
    timestamp = bar.t;
  }
  else if (bar.time) {
    timestamp = bar.time;
  }
  else {
    console.warn('No valid timestamp found in bar:', bar);
    return;
  }
  
  // Ensure timestamp is a number
  if (isNaN(timestamp)) {
    console.warn('Invalid timestamp:', timestamp);
    return;
  }
  // Fix timestamp format - API might be returning microseconds or nanoseconds
  // Current timestamp should be around 1724000000000 (Aug 2024 in milliseconds)
  // Your timestamp 1755623700000000 is way too large
  
  if (timestamp > 10000000000000000) { // 17+ digits - likely nanoseconds or wrong format
    timestamp = Math.floor(timestamp / 1000000);
  } else if (timestamp > 100000000000000) { // 15+ digits - likely microseconds
    timestamp = Math.floor(timestamp / 1000);
  } else if (timestamp < 946684800000) { // Less than year 2000 in milliseconds
    if (timestamp > 946684800) { // Greater than year 2000 in seconds
      timestamp = timestamp * 1000;
    }
  }
  
  // Additional check - if still not in reasonable range, try more aggressive conversion
  if (timestamp > 2000000000000) { // If still larger than year 2033
    timestamp = Math.floor(timestamp / 1000);
  }
  
  const barTime = Math.floor(timestamp / 1000);
  const update = {
    time: barTime,
    open: parseFloat(bar.open),
    high: parseFloat(bar.high),
    low: parseFloat(bar.low),
    close: parseFloat(bar.close),
    volume: parseInt(bar.volume || bar.tickVolume || bar.v || bar.tv || 0)
  };
  
  // Validate the update data
  if (isNaN(update.time) || isNaN(update.open) || isNaN(update.high) || 
      isNaN(update.low) || isNaN(update.close)) {
    console.warn('Invalid bar data, skipping update:', update);
    return;
  }
  // Validate OHLC relationships
  if (update.high < update.low || 
      update.high < update.open || 
      update.high < update.close ||
      update.low > update.open ||
      update.low > update.close) {
    console.warn('Invalid OHLC relationships, skipping update:', update);
    return;
  }
  
  // Only update if the bar time is newer than or equal to the last bar time
  if (lastBarTime && barTime < lastBarTime) {
    console.warn('Received old bar data, skipping:', {
      receivedTime: new Date(barTime * 1000).toLocaleString(),
      lastTime: new Date(lastBarTime * 1000).toLocaleString()
    });
    return;
  }
  
  try {
    // For tick charts, use special handling
    if (currentResolution.endsWith('T')) {
      handleTickChartUpdate(update, bar);
    } else {
      // For time-based charts
      let displayUpdate = update;
      let isNewRenkoBrick = false;
      
      // If using Heiken Ashi, calculate the HA values for this update
      if (currentChartType === 'heikenashi' && historicalData.length > 0) {
        // Get the last Heiken Ashi candle for calculation
        const lastHACandle = heikenAshiData.length > 0 ? 
          heikenAshiData[heikenAshiData.length - 1] : null;
        
        // Calculate Heiken Ashi values for the current bar
        const haClose = (update.open + update.high + update.low + update.close) / 4;
        const haOpen = lastHACandle ? 
          (lastHACandle.open + lastHACandle.close) / 2 : 
          (update.open + update.close) / 2;
        const haHigh = Math.max(update.high, haOpen, haClose);
        const haLow = Math.min(update.low, haOpen, haClose);
        
        displayUpdate = {
          time: update.time,
          open: haOpen,
          high: haHigh,
          low: haLow,
          close: haClose,
          volume: update.volume
        };
      } else if (currentChartType === 'renko') {
        // Handle Renko brick updates
        try {
          const newBricks = updateRenkoWithNewBar(update, currentBrickSize);
          
          if (newBricks.length > 0) {
            // New Renko bricks were created
            isNewRenkoBrick = true;
            
            // Add new bricks to the chart
            newBricks.forEach(brick => {
              try {
                candleSeries.update(brick);
                renkoData.push(brick);
              } catch (brickError) {
                console.error('Error updating individual Renko brick:', brickError, brick);
              }
            });
            
            //console.log(`Added ${newBricks.length} new Renko brick(s)`);
          }
          
          // Don't update with regular displayUpdate for Renko
          displayUpdate = null;
        } catch (renkoError) {
          console.error('Error processing Renko update:', renkoError);
          // Fall back to not updating for this tick
          displayUpdate = null;
        }
      }
      
      // Only process regular candlestick/HA updates if not Renko or if no new Renko brick was created
      if (displayUpdate && !isNewRenkoBrick) {
        if (!lastBarTime || barTime > lastBarTime) {
          // New bar
          candleSeries.update(displayUpdate);
          
          if (bar.isClosed) {
            lastBarTime = barTime;
            currentBar = { ...update };
            
            // Update Heiken Ashi data if using HA
            if (currentChartType === 'heikenashi') {
              heikenAshiData.push(displayUpdate);
            }
          }
          
          // Update indicators with new data (use original data for indicators)
          updateIndicators(update, false);

          // Check for trading signals (use original data for signals)
          checkRealtimeSignal(update);
        } else if (barTime === lastBarTime) {
          // Update existing bar
          candleSeries.update(displayUpdate);
          currentBar = { ...update };

          // Update Heiken Ashi data if using HA
          if (currentChartType === 'heikenashi' && heikenAshiData.length > 0) {
            heikenAshiData[heikenAshiData.length - 1] = displayUpdate;
          }

          // Update indicators with updated bar data (use original data)
          updateIndicators(update, false);

          // Check for trading signals (use original data)
          checkRealtimeSignal(update);
        }
      } else if (currentChartType === 'renko' && isNewRenkoBrick) {
        // For Renko, only update indicators when a new brick is created
        updateIndicators(update, true);

        // For signals, use the latest Renko brick instead of raw market data
        const latestRenkoBrick = renkoData[renkoData.length - 1];
        if (latestRenkoBrick) {
          checkRealtimeSignal(latestRenkoBrick);
        }
      }
    }
  } catch (chartError) {
    console.error('Error updating chart:', chartError);
  }
};

const handleTickChartUpdate = (update, bar) => {
  //console.log('Tick chart: Received tick data - price:', update.close, 'volume:', update.volume);
  
  // Extract tick price (use close price as the tick price)
  const tickPrice = update.close;
  const tickVolume = update.volume || 1;
  const tickTime = update.time;
  
  // Determine if we should create a new bar
  // Create new bar if: no accumulator exists, enough ticks accumulated, or enough time passed
  let shouldCreateNewBar = false;
  
  if (!tickAccumulator) {
    shouldCreateNewBar = true;
    //console.log(`Tick chart: Starting first ${currentResolution} bar (${currentTicksPerBar} ticks per bar)`);
  } else {
    // Check if enough ticks have been accumulated
    if (tickCount >= currentTicksPerBar) {
      shouldCreateNewBar = true;
      //console.log(`Tick chart: ${currentTicksPerBar} ticks reached for ${currentResolution}, creating new bar`);
    }
    // Also create new bar if significant time has passed (more than 30 seconds for larger tick resolutions)
    else if (lastTickTime && (tickTime - lastTickTime) > 30) {
      shouldCreateNewBar = true;
      //console.log('Tick chart: Time gap detected, creating new bar');
    }
  }
  
  // If we need to create a new bar, finalize the current one first
  if (shouldCreateNewBar && tickAccumulator) {
    //console.log(`Tick chart: Finalizing current ${currentResolution} bar - ticks: ${tickCount}/${currentTicksPerBar}, OHLC: ${tickAccumulator.open}/${tickAccumulator.high}/${tickAccumulator.low}/${tickAccumulator.close}`);
    
    // Finalize current bar
    lastBarTime = tickAccumulator.time;
    currentBar = { ...tickAccumulator };
  }
  
  // Create new bar if needed
  if (shouldCreateNewBar) {
    let barTime = lastBarTime ? lastBarTime + 1 : tickTime;
    
    tickAccumulator = {
      open: tickPrice,
      high: tickPrice,
      low: tickPrice,
      close: tickPrice,
      volume: 0,
      time: barTime
    };
    tickCount = 0;
  }
  
  // Update the current accumulator with this tick
  tickAccumulator.high = Math.max(tickAccumulator.high, tickPrice);
  tickAccumulator.low = Math.min(tickAccumulator.low, tickPrice);
  tickAccumulator.close = tickPrice; // Last tick price becomes close
  tickAccumulator.volume += tickVolume;
  tickCount++;
  lastTickTime = tickTime;
  
  //console.log(`Tick chart: Updated ${currentResolution} bar ${tickCount}/${currentTicksPerBar} - Price: ${tickPrice}, Bar: O:${tickAccumulator.open} H:${tickAccumulator.high} L:${tickAccumulator.low} C:${tickAccumulator.close}`);
  
  // Create current bar data for chart update
  let currentBarData = {
    time: tickAccumulator.time,
    open: tickAccumulator.open,
    high: tickAccumulator.high,
    low: tickAccumulator.low,
    close: tickAccumulator.close,
    volume: tickAccumulator.volume
  };
  
  // If using Heiken Ashi, calculate HA values for tick data
  if (currentChartType === 'heikenashi') {
    const lastHACandle = heikenAshiData.length > 0 ? heikenAshiData[heikenAshiData.length - 1] : null;

    const haClose = (currentBarData.open + currentBarData.high + currentBarData.low + currentBarData.close) / 4;
    const haOpen = lastHACandle ?
      (lastHACandle.open + lastHACandle.close) / 2 :
      (currentBarData.open + currentBarData.close) / 2;
    const haHigh = Math.max(currentBarData.high, haOpen, haClose);
    const haLow = Math.min(currentBarData.low, haOpen, haClose);

    const haBar = {
      time: currentBarData.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: currentBarData.volume
    };

    // Update heikenAshiData array
    if (shouldCreateNewBar && heikenAshiData.length > 0) {
      // Add new HA bar when tick bar is completed
      heikenAshiData.push(haBar);
    } else if (heikenAshiData.length > 0) {
      // Update current HA bar
      heikenAshiData[heikenAshiData.length - 1] = haBar;
    } else {
      // First HA bar
      heikenAshiData.push(haBar);
    }

    currentBarData = haBar;
  } else if (currentChartType === 'renko') {
    // Handle Renko for tick data
    try {
      const newBricks = updateRenkoWithNewBar(currentBarData, currentBrickSize);
      
      if (newBricks.length > 0) {
        // Add new bricks to the chart
        newBricks.forEach(brick => {
          try {
            candleSeries.update(brick);
            renkoData.push(brick);
          } catch (brickError) {
            console.error('Error updating tick Renko brick:', brickError, brick);
          }
        });

        // Update indicators when new Renko bricks are formed
        updateIndicators(currentBarData, true);

        return; // Don't update with regular currentBarData
      }
      
      // If no new Renko bricks, don't update the chart
      return;
    } catch (renkoError) {
      console.error('Error processing tick Renko update:', renkoError);
      return;
    }
  }
  
  try {
    // Update the chart with current bar
    candleSeries.update(currentBarData);

    // Update historical data for indicator calculations
    if (shouldCreateNewBar && tickAccumulator) {
      // Add completed bar to historical data
      const completedBar = { ...currentBar };
      const existingIndex = historicalData.findIndex(bar => bar.time === completedBar.time);
      if (existingIndex !== -1) {
        historicalData[existingIndex] = completedBar;
      } else {
        historicalData.push(completedBar);
      }

      // Update indicators for completed tick bar
      updateIndicators(completedBar, false);
    } else {
      // Update indicators with current accumulating bar
      updateIndicators(currentBarData, false);
    }

  } catch (error) {
    console.error('Error updating tick chart:', error);
    console.error('Failed bar data:', currentBarData);
  }
};

const subscribeToResolution = async (resolution) => {
  try {
    const config = resolutionConfig[resolution];
    const symbol = config.symbol;
    
    // Unsubscribe from previous resolution if any
    if (currentSubscription && connection) {
      try {
        const prevConfig = resolutionConfig[currentSubscription];
        await connection.invoke("UnsubscribeBars", prevConfig.symbol, currentSubscription);
      } catch (unsubError) {
        console.warn('Error unsubscribing:', unsubError);
      }
    }
    
    // Subscribe to new resolution
    if (connection && connection.state === signalR.HubConnectionState.Connected) {
      await connection.invoke("SubscribeBars", symbol, resolution);
      currentSubscription = resolution;
    }
    
  } catch (error) {
    console.error('Failed to subscribe:', error);
  }
};

const updateStatus = (text, isConnected) => {
  const statusElement = document.getElementById('status');
  if (statusElement) {
    statusElement.textContent = text;
    if (isConnected) {
      statusElement.classList.add('connected');
    } else {
      statusElement.classList.remove('connected');
    }
  }
};

const changeResolution = async (resolution) => {
  currentResolution = resolution;
  lastBarTime = null;
  currentBar = null;
  
  // Reset tick accumulator when switching resolutions
  tickAccumulator = null;
  tickCount = 0;
  lastTickTime = null;
  
  // Set the appropriate ticks per bar for this resolution
  currentTicksPerBar = getTicksPerBar(resolution);
  // Clear chart data and indicators
  if (candleSeries) {
    candleSeries.setData([]);
  }
  
  // Clear Heiken Ashi and Renko data
  heikenAshiData = [];
  renkoData = [];
  
  // Reset Renko state
  renkoState = {
    lastBrickHigh: null,
    lastBrickLow: null,
    direction: 1,
    lastTimestamp: null
  };
  
  // Clear all indicators when changing resolution
  clearAllIndicators();
  
  // Clear trading signals
  signalMarkers = [];
  activeSignals.clear();
  lastTouchLower = false;
  lastTouchUpper = false;
  
  // Debug: Check chart container
  const chartElement = document.getElementById('chart');
  
  // Load historical data for new resolution
  const config = resolutionConfig[resolution];
  historicalData = await getHistoricalData(resolution, config.countback);
  
  if (historicalData && historicalData.length > 0) {
    // Ensure we have valid candlestick data
    const validData = historicalData.filter(d => {
      return d && 
             typeof d.time === 'number' && 
             typeof d.open === 'number' && 
             typeof d.high === 'number' && 
             typeof d.low === 'number' && 
             typeof d.close === 'number' &&
             !isNaN(d.time) && 
             !isNaN(d.open) && 
             !isNaN(d.high) && 
             !isNaN(d.low) && 
             !isNaN(d.close) &&
             d.time > 0 &&
             d.high >= d.low &&
             d.high >= d.open &&
             d.high >= d.close &&
             d.low <= d.open &&
             d.low <= d.close;
    });
    if (validData.length > 0) {
      try {
        // Sort by time to ensure proper order
        validData.sort((a, b) => a.time - b.time);
        
        // Store the valid data
        historicalData = validData;
        
        // Calculate Heiken Ashi data if that chart type is selected
        if (currentChartType === 'heikenashi') {
          heikenAshiData = calculateHeikenAshi(validData);
        } else if (currentChartType === 'renko') {
          renkoData = convertToRenko(validData, currentBrickSize, false);
        }
        
        // Determine which data to display
        let dataToDisplay = validData;
        if (currentChartType === 'heikenashi') {
          dataToDisplay = heikenAshiData;
        } else if (currentChartType === 'renko') {
          dataToDisplay = renkoData;
        }

        candleSeries.setData(dataToDisplay);
        
        // Update chart time scale to fit the data
        chart.timeScale().fitContent();
        
        // For tick charts, try to set a specific visible range to the last few hours
        if (currentResolution.endsWith('T') && dataToDisplay.length > 10) {
          const lastTime = dataToDisplay[dataToDisplay.length - 1].time;
          const firstTime = dataToDisplay[Math.max(0, dataToDisplay.length - 100)].time;
          chart.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
        }
      } catch (chartError) {
        console.error('Error setting chart data:', chartError);
      }
    } else {
      console.warn('No valid data after filtering');
      // Show empty chart message
      updateStatus('No data available', false);
    }
  } else {
    console.warn('No historical data received');
    updateStatus('No data available', false);
  }
  
  // Subscribe to new resolution if connected
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await subscribeToResolution(resolution);
  }
};

const main = async () => {
  // Check if required libraries are loaded
  if (typeof LightweightCharts === 'undefined') {
    console.error('LightweightCharts library not loaded!');
    return;
  }
  
  if (typeof signalR === 'undefined') {
    console.error('SignalR library not loaded!');
    return;
  }
  // Initialize the chart
  initializeChart();

  if (!chart) {
    console.error('Failed to initialize chart');
    return;
  }

  // Load current strategy
  await loadCurrentStrategy();
  // Load initial data
  const initialResolution = document.getElementById('resolution').value;
  currentResolution = initialResolution;
  
  // Set initial ticks per bar
  currentTicksPerBar = getTicksPerBar(initialResolution);

  const config = resolutionConfig[initialResolution];
  
  if (!config) {
    console.error(`No configuration found for resolution: ${initialResolution}`);
    return;
  }
  
  historicalData = await getHistoricalData(initialResolution, config.countback);
  
  if (historicalData && historicalData.length > 0) {
    // Ensure we have valid candlestick data
    const validData = historicalData.filter(d => {
      return d && 
             typeof d.time === 'number' && 
             typeof d.open === 'number' && 
             typeof d.high === 'number' && 
             typeof d.low === 'number' && 
             typeof d.close === 'number' &&
             !isNaN(d.time) && 
             !isNaN(d.open) && 
             !isNaN(d.high) && 
             !isNaN(d.low) && 
             !isNaN(d.close) &&
             d.time > 0 &&
             d.high >= d.low &&
             d.high >= d.open &&
             d.high >= d.close &&
             d.low <= d.open &&
             d.low <= d.close;
    });
    if (validData.length > 0) {
      try {
        // Sort by time to ensure proper order
        validData.sort((a, b) => a.time - b.time);
        
        // Store the valid data
        historicalData = validData;
        
        // Calculate Heiken Ashi data if that chart type is selected
        if (currentChartType === 'heikenashi') {
          heikenAshiData = calculateHeikenAshi(validData);
        } else if (currentChartType === 'renko') {
          renkoData = convertToRenko(validData, currentBrickSize, false);
        }
        
        // Determine which data to display
        let dataToDisplay = validData;
        if (currentChartType === 'heikenashi') {
          dataToDisplay = heikenAshiData;
        } else if (currentChartType === 'renko') {
          dataToDisplay = renkoData;
        }
        
        candleSeries.setData(dataToDisplay);
        
        chart.timeScale().fitContent();
      } catch (chartError) {
        console.error('Error setting initial chart data:', chartError);
      }
    }
  } else {
    console.warn('No initial data loaded');
    updateStatus('No data available', false);
  }
  
  // Setup real-time connection
  await setupRealTimeConnection();
};

// Indicator calculation functions
const calculateIndicator = (type, data, period = 14) => {
  if (!data || data.length === 0) return [];
  
  // Wait for indicators to be loaded
  if (!window.indicators) {
    console.warn('Indicators not loaded yet');
    return [];
  }
  
  const closePrices = data.map(bar => bar.close);
  const highPrices = data.map(bar => bar.high);
  const lowPrices = data.map(bar => bar.low);
  const openPrices = data.map(bar => bar.open);
  
  try {
    switch (type) {
      case 'SMA':
        return window.indicators.sma(closePrices, { period });
      case 'EMA':
        return window.indicators.ema(closePrices, { period });
      case 'RSI':
        return window.indicators.rsi(closePrices, { period });
      case 'BollingerBands':
        const bbResult = window.indicators.bollingerBands(closePrices, { period });
        return {
          upper: bbResult.upper,
          middle: bbResult.middle,
          lower: bbResult.lower
        };
      case 'DonchianChannel':
        const dcResult = window.indicators.donchianChannel(closePrices, { period });
        return {
          upper: dcResult.upper,
          middle: dcResult.middle,
          lower: dcResult.lower
        };
      default:
        console.warn('Indicator type not implemented yet:', type);
        alert(`${type} indicator is not implemented yet. Available indicators: SMA, EMA, RSI, Bollinger Bands, Donchian Channel`);
        return [];
    }
  } catch (error) {
    console.error('Error calculating indicator:', error);
    return [];
  }
};

// Global variable to store the selected indicator type
let pendingIndicatorType = null;

const showIndicatorModal = (indicatorType) => {
  pendingIndicatorType = indicatorType;
  const modal = document.getElementById('indicatorModal');
  const modalTitle = document.getElementById('modalTitle');
  const periodInput = document.getElementById('modalPeriodInput');

  // Format the indicator name for display
  const indicatorNames = {
    'SMA': 'Simple Moving Average (SMA)',
    'EMA': 'Exponential Moving Average (EMA)',
    'RSI': 'Relative Strength Index (RSI)',
    'BollingerBands': 'Bollinger Bands',
    'DonchianChannel': 'Donchian Channel'
  };

  // Set default periods - 200 for Bollinger Bands and Donchian Channel, 14 for others
  const defaultPeriod = (indicatorType === 'BollingerBands' || indicatorType === 'DonchianChannel') ? '200' : '14';

  modalTitle.textContent = `Configure ${indicatorNames[indicatorType] || indicatorType}`;
  periodInput.value = defaultPeriod;
  periodInput.focus();

  modal.classList.add('show');

  // Add enter key support
  periodInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      applyIndicator();
    } else if (e.key === 'Escape') {
      closeIndicatorModal();
    }
  };
};

const closeIndicatorModal = () => {
  const modal = document.getElementById('indicatorModal');
  modal.classList.remove('show');
  document.getElementById('indicators').value = '';
  pendingIndicatorType = null;
};

const applyIndicator = () => {
  if (!pendingIndicatorType) return;

  const periodInput = document.getElementById('modalPeriodInput');
  const periodNum = parseInt(periodInput.value) || 14;

  if (periodNum < 1 || periodNum > 500) {
    periodInput.style.borderColor = '#ff4444';
    setTimeout(() => {
      periodInput.style.borderColor = '#444';
    }, 2000);
    return;
  }

  try {
    // Use the appropriate data based on chart type
    let dataForIndicator = historicalData;
    if (currentChartType === 'renko' && renkoData && renkoData.length > 0) {
      dataForIndicator = renkoData;
    } else if (currentChartType === 'heikenashi' && heikenAshiData && heikenAshiData.length > 0) {
      dataForIndicator = heikenAshiData;
    }

    const indicatorValues = calculateIndicator(pendingIndicatorType, dataForIndicator, periodNum);

    if (!indicatorValues || indicatorValues.length === 0) {
      alert('Failed to calculate indicator values');
      closeIndicatorModal();
      return;
    }

    displayIndicator(pendingIndicatorType, indicatorValues, periodNum);
    activeIndicators.set(pendingIndicatorType, { period: periodNum, values: indicatorValues });

    // Update the active indicators display
    updateActiveIndicatorsDisplay();

    // If Donchian Channel was added, display signals
    if (pendingIndicatorType === 'DonchianChannel') {
      displaySignalsOnChart();
    }

    closeIndicatorModal();
  } catch (error) {
    console.error('Error adding indicator:', error);
    alert('Error adding indicator: ' + error.message);
    closeIndicatorModal();
  }
};

const addIndicator = (indicatorType) => {
  if (!indicatorType || activeIndicators.has(indicatorType)) {
    document.getElementById('indicators').value = '';
    return;
  }
  if (!historicalData || historicalData.length === 0) {
    alert('No data available to calculate indicators');
    document.getElementById('indicators').value = '';
    return;
  }

  showIndicatorModal(indicatorType);
};

const displayIndicator = (type, values, period) => {
  if (!chart) return;

  // Determine which data to use for time alignment
  let dataForDisplay = historicalData;
  if (currentChartType === 'renko' && renkoData && renkoData.length > 0) {
    dataForDisplay = renkoData;
  } else if (currentChartType === 'heikenashi' && heikenAshiData && heikenAshiData.length > 0) {
    dataForDisplay = heikenAshiData;
  }

  if (!dataForDisplay || dataForDisplay.length === 0) return;
  
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF'];
  const colorIndex = indicatorSeries.size % colors.length;
  const color = colors[colorIndex];
  
  try {
    if ((type === 'BollingerBands' || type === 'DonchianChannel') && values.upper && values.middle && values.lower) {
      // Handle multi-line indicators (Bollinger Bands, Donchian Channel)
      const prefix = type === 'BollingerBands' ? 'BB' : 'DC';
      
      const upperSeries = chart.addLineSeries({
        color: color,
        lineWidth: 1,
        title: `${prefix} Upper (${period})`
      });
      
      const middleSeries = chart.addLineSeries({
        color: color,
        lineWidth: 2,
        title: `${prefix} Middle (${period})`
      });
      
      const lowerSeries = chart.addLineSeries({
        color: color,
        lineWidth: 1,
        title: `${prefix} Lower (${period})`
      });
      
      const upperData = values.upper.map((value, index) => ({
        time: dataForDisplay[index + (dataForDisplay.length - values.upper.length)]?.time,
        value: value
      })).filter(item => item.time && !isNaN(item.value));

      const middleData = values.middle.map((value, index) => ({
        time: dataForDisplay[index + (dataForDisplay.length - values.middle.length)]?.time,
        value: value
      })).filter(item => item.time && !isNaN(item.value));

      const lowerData = values.lower.map((value, index) => ({
        time: dataForDisplay[index + (dataForDisplay.length - values.lower.length)]?.time,
        value: value
      })).filter(item => item.time && !isNaN(item.value));
      
      upperSeries.setData(upperData);
      middleSeries.setData(middleData);
      lowerSeries.setData(lowerData);
      
      indicatorSeries.set(`${type}_upper`, upperSeries);
      indicatorSeries.set(`${type}_middle`, middleSeries);
      indicatorSeries.set(`${type}_lower`, lowerSeries);
      
    } else if (Array.isArray(values)) {
      // Handle regular line indicators
      const lineSeries = chart.addLineSeries({
        color: color,
        lineWidth: 2,
        title: `${type} (${period})`
      });
      
      // Map indicator values to chart data
      const indicatorData = values.map((value, index) => ({
        time: dataForDisplay[index + (dataForDisplay.length - values.length)]?.time,
        value: value
      })).filter(item => item.time && !isNaN(item.value));
      
      lineSeries.setData(indicatorData);
      indicatorSeries.set(type, lineSeries);
    }
  } catch (error) {
    console.error('Error displaying indicator:', error);
  }
};

const updateIndicators = (newBarData, isNewRenkoBrick = false) => {
  if (activeIndicators.size === 0 || !historicalData) return;

  // Update historical data with the new bar for candlestick
  if (newBarData) {
    const existingIndex = historicalData.findIndex(bar => bar.time === newBarData.time);
    if (existingIndex !== -1) {
      historicalData[existingIndex] = newBarData;
    } else {
      historicalData.push(newBarData);
    }

    // Update Heiken Ashi data if needed
    if (currentChartType === 'heikenashi') {
      const haBar = calculateHeikenAshiBar(
        newBarData,
        heikenAshiData.length > 0 ? heikenAshiData[heikenAshiData.length - 1] : null
      );

      if (haBar) {
        const existingHAIndex = heikenAshiData.findIndex(bar => bar.time === haBar.time);
        if (existingHAIndex !== -1) {
          heikenAshiData[existingHAIndex] = haBar;
        } else {
          heikenAshiData.push(haBar);
        }
      }
    }
  }

  // Only update indicators if:
  // 1. For candlestick/heikenashi: always update
  // 2. For renko: only update when a new brick is formed (not on every tick)
  if (currentChartType === 'renko' && !isNewRenkoBrick) {
    return; // Skip indicator update for Renko if no new brick
  }

  // Use the appropriate data based on chart type
  let dataForIndicator = historicalData;
  if (currentChartType === 'renko' && renkoData && renkoData.length > 0) {
    dataForIndicator = renkoData;
  } else if (currentChartType === 'heikenashi' && heikenAshiData && heikenAshiData.length > 0) {
    dataForIndicator = heikenAshiData;
  }

  // Recalculate and update all active indicators
  activeIndicators.forEach((config, type) => {
    try {
      const newValues = calculateIndicator(type, dataForIndicator, config.period);
      if (newValues && (newValues.length > 0 || (newValues.upper && newValues.upper.length > 0))) {

        // Get the latest time from the appropriate data source
        const latestTime = dataForIndicator[dataForIndicator.length - 1]?.time;

        // Update the series data
        if ((type === 'BollingerBands' || type === 'DonchianChannel') && newValues.upper) {
          const upperSeries = indicatorSeries.get(`${type}_upper`);
          const middleSeries = indicatorSeries.get(`${type}_middle`);
          const lowerSeries = indicatorSeries.get(`${type}_lower`);

          if (upperSeries && middleSeries && lowerSeries && latestTime) {
            const latestIndex = newValues.upper.length - 1;

            // Update the latest point
            upperSeries.update({ time: latestTime, value: newValues.upper[latestIndex] });
            middleSeries.update({ time: latestTime, value: newValues.middle[latestIndex] });
            lowerSeries.update({ time: latestTime, value: newValues.lower[latestIndex] });
          }
        } else if (Array.isArray(newValues)) {
          const series = indicatorSeries.get(type);
          if (series && latestTime) {
            const latestValue = newValues[newValues.length - 1];

            if (!isNaN(latestValue)) {
              series.update({ time: latestTime, value: latestValue });
            }
          }
        }
        
        // Update stored values
        activeIndicators.set(type, { period: config.period, values: newValues });
        
        // Update signals if Donchian Channel was updated (only on new bars)
        if (type === 'DonchianChannel' && newBarData && isNewRenkoBrick !== false) {
          displaySignalsOnChart();
        }
      }
    } catch (error) {
      console.error(`Error updating ${type} indicator:`, error);
    }
  });
};

const removeIndicator = (indicatorType) => {
  // Remove from active indicators
  activeIndicators.delete(indicatorType);
  
  // Remove series from chart
  if (indicatorType === 'BollingerBands' || indicatorType === 'DonchianChannel') {
    // Remove multi-line indicators
    const upperSeries = indicatorSeries.get(`${indicatorType}_upper`);
    const middleSeries = indicatorSeries.get(`${indicatorType}_middle`);
    const lowerSeries = indicatorSeries.get(`${indicatorType}_lower`);
    
    if (upperSeries) {
      chart.removeSeries(upperSeries);
      indicatorSeries.delete(`${indicatorType}_upper`);
    }
    if (middleSeries) {
      chart.removeSeries(middleSeries);
      indicatorSeries.delete(`${indicatorType}_middle`);
    }
    if (lowerSeries) {
      chart.removeSeries(lowerSeries);
      indicatorSeries.delete(`${indicatorType}_lower`);
    }
  } else {
    // Remove single-line indicators
    const series = indicatorSeries.get(indicatorType);
    if (series) {
      chart.removeSeries(series);
      indicatorSeries.delete(indicatorType);
    }
  }
  
  // Update the active indicators display
  updateActiveIndicatorsDisplay();
  
  // Clear signals if Donchian Channel is removed
  if (indicatorType === 'DonchianChannel') {
    candleSeries.setMarkers([]);
    signalMarkers = [];
    activeSignals.clear();
    lastTouchLower = false;
    lastTouchUpper = false;
  }
};

const updateActiveIndicatorsDisplay = () => {
  const container = document.getElementById('activeIndicators');
  if (!container) return;
  
  // Clear existing display
  container.innerHTML = '';
  
  // Add each active indicator
  activeIndicators.forEach((config, type) => {
    const indicatorTag = document.createElement('div');
    indicatorTag.className = 'indicator-tag';
    
    const label = document.createElement('span');
    label.textContent = `${type} (${config.period})`;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'indicator-remove';
    removeBtn.textContent = '×';
    removeBtn.title = `Remove ${type}`;
    removeBtn.onclick = () => removeIndicator(type);
    
    indicatorTag.appendChild(label);
    indicatorTag.appendChild(removeBtn);
    container.appendChild(indicatorTag);
  });
};

const clearAllIndicators = () => {
  indicatorSeries.forEach((series) => {
    try {
      chart.removeSeries(series);
    } catch (error) {
      console.error('Error removing indicator series:', error);
    }
  });
  
  indicatorSeries.clear();
  activeIndicators.clear();
  updateActiveIndicatorsDisplay();
};

// Trading signals functions
const detectDonchianSignals = (data) => {
  if (!data || data.length < 2) return [];
  
  const donchianConfig = activeIndicators.get('DonchianChannel');
  if (!donchianConfig || !donchianConfig.values) return [];
  
  const { upper, lower } = donchianConfig.values;
  if (!upper || !lower || upper.length === 0) return [];
  
  const signals = [];
  const startIndex = data.length - upper.length;
  
  for (let i = 1; i < upper.length; i++) {
    const dataIndex = startIndex + i;
    const prevDataIndex = dataIndex - 1;
    
    if (dataIndex >= data.length || prevDataIndex < 0) continue;
    
    const currentBar = data[dataIndex];
    const prevBar = data[prevDataIndex];
    
    const currentUpper = upper[i];
    const currentLower = lower[i];
    const prevUpper = upper[i - 1];
    const prevLower = lower[i - 1];
    
    // Buy Signal Detection
    // Check if previous candle touched or went below lower channel
    const prevTouchedLower = prevBar.low <= prevLower;
    // Check if current candle is green (close > open)
    const currentIsGreen = currentBar.close > currentBar.open;
    
    if (prevTouchedLower && currentIsGreen) {
      signals.push({
        time: currentBar.time,
        type: 'buy',
        price: currentBar.close,
        reason: 'Donchian Lower Touch + Green Candle'
      });

      // DON'T send webhook for historical signals - only visual markers
      // Webhooks are only sent in checkRealtimeSignal() for real-time data
    }
    
    // Sell Signal Detection
    // Check if previous candle touched or went above upper channel
    const prevTouchedUpper = prevBar.high >= prevUpper;
    // Check if current candle is red (close < open)
    const currentIsRed = currentBar.close < currentBar.open;
    
    if (prevTouchedUpper && currentIsRed) {
      signals.push({
        time: currentBar.time,
        type: 'sell',
        price: currentBar.close,
        reason: 'Donchian Upper Touch + Red Candle'
      });

      // DON'T send webhook for historical signals - only visual markers
      // Webhooks are only sent in checkRealtimeSignal() for real-time data
    }
  }
  
  return signals;
};

const displaySignalsOnChart = () => {
  if (!candleSeries) return;

  // Debounce signal updates to prevent excessive recalculation
  const now = Date.now();
  if (now - lastSignalUpdate < signalUpdateDebounceTime) {
    return;
  }
  lastSignalUpdate = now;

  // Use the appropriate data source based on chart type
  let dataForSignals = historicalData;
  if (currentChartType === 'renko' && renkoData && renkoData.length > 0) {
    dataForSignals = renkoData;
  } else if (currentChartType === 'heikenashi' && heikenAshiData && heikenAshiData.length > 0) {
    dataForSignals = heikenAshiData;
  }

  if (!dataForSignals) return;

  // Clear existing markers
  candleSeries.setMarkers([]);

  const signals = detectDonchianSignals(dataForSignals);
  if (signals.length === 0) return;
  
  // Create markers for signals
  const markers = signals.map(signal => ({
    time: signal.time,
    position: signal.type === 'buy' ? 'belowBar' : 'aboveBar',
    color: signal.type === 'buy' ? '#26a69a' : '#ef5350',
    shape: signal.type === 'buy' ? 'arrowUp' : 'arrowDown',
    text: signal.type === 'buy' ? 'BUY' : 'SELL'
  }));
  
  candleSeries.setMarkers(markers);
  signalMarkers = markers;

  // Update active signals
  activeSignals.clear();
  signals.forEach(signal => {
    activeSignals.set(signal.time, signal);
  });
};

const checkRealtimeSignal = (newBar) => {
  // Use the appropriate data source based on chart type
  let dataForSignals = historicalData;
  if (currentChartType === 'renko' && renkoData && renkoData.length > 0) {
    dataForSignals = renkoData;
  } else if (currentChartType === 'heikenashi' && heikenAshiData && heikenAshiData.length > 0) {
    dataForSignals = heikenAshiData;
  }

  if (!newBar || !dataForSignals || dataForSignals.length < 2) return;

  const donchianConfig = activeIndicators.get('DonchianChannel');
  if (!donchianConfig || !donchianConfig.values) return;

  const { upper, lower } = donchianConfig.values;
  if (!upper || !lower || upper.length === 0) return;

  // Get the latest Donchian values
  const latestUpper = upper[upper.length - 1];
  const latestLower = lower[lower.length - 1];

  // Get previous bar from the appropriate data source
  const prevBar = dataForSignals[dataForSignals.length - 2];
  if (!prevBar) return;
  
  // Check for buy signal
  const prevTouchedLower = prevBar.low <= latestLower;
  const currentIsGreen = newBar.close > newBar.open;
  
  if (prevTouchedLower && currentIsGreen && !lastTouchLower) {
    // Generate buy signal
    // Add marker to chart
    const currentMarkers = signalMarkers || [];
    currentMarkers.push({
      time: newBar.time,
      position: 'belowBar',
      color: '#26a69a',
      shape: 'arrowUp',
      text: 'BUY'
    });
    candleSeries.setMarkers(currentMarkers);
    signalMarkers = currentMarkers;

    // Send webhook only if real-time is ready (not during initial load)
    if (currentStrategyId && isRealTimeReady) {
      sendPayload("buy", currentTicker, currentStrategyId);
    }

    lastTouchLower = true;
  } else if (!prevTouchedLower) {
    lastTouchLower = false;
  }
  
  // Check for sell signal
  const prevTouchedUpper = prevBar.high >= latestUpper;
  const currentIsRed = newBar.close < newBar.open;
  
  if (prevTouchedUpper && currentIsRed && !lastTouchUpper) {
    // Generate sell signal
    // Add marker to chart
    const currentMarkers = signalMarkers || [];
    currentMarkers.push({
      time: newBar.time,
      position: 'aboveBar',
      color: '#ef5350',
      shape: 'arrowDown',
      text: 'SELL'
    });
    candleSeries.setMarkers(currentMarkers);
    signalMarkers = currentMarkers;

    // Send webhook only if real-time is ready (not during initial load)
    if (currentStrategyId && isRealTimeReady) {
      sendPayload("sell", currentTicker, currentStrategyId);
    }

    lastTouchUpper = true;
  } else if (!prevTouchedUpper) {
    lastTouchUpper = false;
  }
};

// ATR calculation for Renko
const calculateATR = (data, period = 14) => {
  if (!data || data.length < period) return 50; // Default to 50 if can't calculate
  
  const trueRanges = [];
  
  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];
    
    const highLow = current.high - current.low;
    const highClose = Math.abs(current.high - previous.close);
    const lowClose = Math.abs(current.low - previous.close);
    
    const trueRange = Math.max(highLow, Math.max(highClose, lowClose));
    trueRanges.push(trueRange);
  }
  
  // Calculate Simple Moving Average of True Range
  if (trueRanges.length < period) return 50;
  
  let sum = 0;
  for (let i = trueRanges.length - period; i < trueRanges.length; i++) {
    sum += trueRanges[i];
  }
  
  return sum / period;
};

// Renko brick calculation functions
const convertToRenko = (data, brickSize = null, useATR = true) => {
  if (!data || data.length === 0) return [];
  
  // Calculate brick size using ATR if not provided
  if (brickSize === null || useATR) {
    const atrValue = calculateATR(data);
    brickSize = Math.max(1, Math.round(atrValue * 0.5));
  }
  
  // Ensure brick size is valid
  if (!brickSize || brickSize <= 0 || isNaN(brickSize)) {
    brickSize = 10; // Default fallback
  }
  
  const renkoBricks = [];
  let brickIndex = 0; // Counter for unique timestamps
  
  // Initialize with first candle
  const firstPrice = data[0].close;
  const firstTime = data[0].time;
  
  let lastBrickHigh = firstPrice;
  let lastBrickLow = firstPrice;
  let direction = 1; // 1 for up, -1 for down
  
  for (let i = 1; i < data.length; i++) {
    const price = data[i].close;
    const baseTime = data[i].time;
    
    // Validate price data
    if (!price || isNaN(price)) continue;
    
    // Check for upward movement
    while (price >= lastBrickHigh + brickSize) {
      // Create green (up) brick
      const brickOpen = lastBrickHigh;
      const brickClose = lastBrickHigh + brickSize;
      
      // Ensure unique timestamp by adding brick index
      const brickTime = baseTime + brickIndex;
      brickIndex++;
      
      renkoBricks.push({
        time: brickTime,
        open: parseFloat(brickOpen.toFixed(2)),
        high: parseFloat(brickClose.toFixed(2)),
        low: parseFloat(brickOpen.toFixed(2)),
        close: parseFloat(brickClose.toFixed(2)),
        volume: data[i].volume || 0,
        color: 'green',
        direction: 1
      });
      
      lastBrickHigh = brickClose;
      lastBrickLow = brickOpen;
      direction = 1;
    }
    
    // Check for downward movement
    while (price <= lastBrickLow - brickSize) {
      // Create red (down) brick
      const brickOpen = lastBrickLow;
      const brickClose = lastBrickLow - brickSize;
      
      // Ensure unique timestamp by adding brick index
      const brickTime = baseTime + brickIndex;
      brickIndex++;
      
      renkoBricks.push({
        time: brickTime,
        open: parseFloat(brickOpen.toFixed(2)),
        high: parseFloat(brickOpen.toFixed(2)),
        low: parseFloat(brickClose.toFixed(2)),
        close: parseFloat(brickClose.toFixed(2)),
        volume: data[i].volume || 0,
        color: 'red',
        direction: -1
      });
      
      lastBrickLow = brickClose;
      lastBrickHigh = brickOpen;
      direction = -1;
    }
  }
  
  // Validate and clean up the bricks
  const validBricks = renkoBricks.filter(brick => {
    return brick &&
           typeof brick.time === 'number' &&
           typeof brick.open === 'number' &&
           typeof brick.high === 'number' &&
           typeof brick.low === 'number' &&
           typeof brick.close === 'number' &&
           !isNaN(brick.time) &&
           !isNaN(brick.open) &&
           !isNaN(brick.high) &&
           !isNaN(brick.low) &&
           !isNaN(brick.close) &&
           brick.time > 0 &&
           brick.high >= brick.low &&
           (brick.direction === 1 ? (brick.high === brick.close && brick.low === brick.open) : 
                                   (brick.low === brick.close && brick.high === brick.open));
  });
  
  // Ensure timestamps are sequential and unique
  if (validBricks.length > 1) {
    for (let i = 1; i < validBricks.length; i++) {
      if (validBricks[i].time <= validBricks[i-1].time) {
        validBricks[i].time = validBricks[i-1].time + 1;
      }
    }
  }
  
  // Update global Renko state
  if (validBricks.length > 0) {
    const lastBrick = validBricks[validBricks.length - 1];
    renkoState.lastBrickHigh = lastBrick.direction === 1 ? lastBrick.close : lastBrick.open;
    renkoState.lastBrickLow = lastBrick.direction === -1 ? lastBrick.close : lastBrick.open;
    renkoState.direction = lastBrick.direction;
    renkoState.lastTimestamp = lastBrick.time;
  }

  return validBricks;
};

const updateRenkoWithNewBar = (newBar, brickSize) => {
  if (!newBar || !renkoState.lastBrickHigh || !renkoState.lastBrickLow || !brickSize || brickSize <= 0) {
    return [];
  }
  
  const price = newBar.close;
  const baseTime = newBar.time;
  const newBricks = [];
  
  // Validate price
  if (!price || isNaN(price)) return [];
  
  let lastBrickHigh = renkoState.lastBrickHigh;
  let lastBrickLow = renkoState.lastBrickLow;
  
  // Start timestamp calculation from the last known timestamp
  let nextTimestamp = renkoState.lastTimestamp ? Math.max(renkoState.lastTimestamp + 1, baseTime) : baseTime;
  
  // Check for upward movement
  while (price >= lastBrickHigh + brickSize) {
    // Create green (up) brick
    const brickOpen = lastBrickHigh;
    const brickClose = lastBrickHigh + brickSize;
    
    newBricks.push({
      time: nextTimestamp,
      open: parseFloat(brickOpen.toFixed(2)),
      high: parseFloat(brickClose.toFixed(2)),
      low: parseFloat(brickOpen.toFixed(2)),
      close: parseFloat(brickClose.toFixed(2)),
      volume: newBar.volume || 0,
      color: 'green',
      direction: 1
    });
    
    lastBrickHigh = brickClose;
    lastBrickLow = brickOpen;
    renkoState.direction = 1;
    nextTimestamp++; // Ensure next brick has a later timestamp
  }
  
  // Check for downward movement
  while (price <= lastBrickLow - brickSize) {
    // Create red (down) brick
    const brickOpen = lastBrickLow;
    const brickClose = lastBrickLow - brickSize;
    
    newBricks.push({
      time: nextTimestamp,
      open: parseFloat(brickOpen.toFixed(2)),
      high: parseFloat(brickOpen.toFixed(2)),
      low: parseFloat(brickClose.toFixed(2)),
      close: parseFloat(brickClose.toFixed(2)),
      volume: newBar.volume || 0,
      color: 'red',
      direction: -1
    });
    
    lastBrickLow = brickClose;
    lastBrickHigh = brickOpen;
    renkoState.direction = -1;
    nextTimestamp++; // Ensure next brick has a later timestamp
  }
  
  // Update global state
  renkoState.lastBrickHigh = lastBrickHigh;
  renkoState.lastBrickLow = lastBrickLow;
  
  // Update last timestamp if we created new bricks
  if (newBricks.length > 0) {
    renkoState.lastTimestamp = newBricks[newBricks.length - 1].time;
  }
  
  // Validate bricks before returning
  const validBricks = newBricks.filter(brick => {
    return brick &&
           typeof brick.time === 'number' &&
           !isNaN(brick.time) &&
           typeof brick.open === 'number' &&
           !isNaN(brick.open) &&
           typeof brick.high === 'number' &&
           !isNaN(brick.high) &&
           typeof brick.low === 'number' &&
           !isNaN(brick.low) &&
           typeof brick.close === 'number' &&
           !isNaN(brick.close) &&
           brick.high >= brick.low;
  });

  return validBricks;
};

// Heiken Ashi calculation functions
const calculateHeikenAshi = (data) => {
  if (!data || data.length === 0) return [];

  const haData = [];
  let prevHACandle = null;

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    let haCandle = {};

    // Calculate Heiken Ashi values
    // HA-Close = (Open + High + Low + Close) / 4
    haCandle.close = (candle.open + candle.high + candle.low + candle.close) / 4;

    // For the first candle
    if (i === 0 || !prevHACandle) {
      // HA-Open = (Open + Close) / 2
      haCandle.open = (candle.open + candle.close) / 2;
    } else {
      // HA-Open = (Previous HA-Open + Previous HA-Close) / 2
      haCandle.open = (prevHACandle.open + prevHACandle.close) / 2;
    }

    // HA-High = Max(High, HA-Open, HA-Close)
    haCandle.high = Math.max(candle.high, haCandle.open, haCandle.close);

    // HA-Low = Min(Low, HA-Open, HA-Close)
    haCandle.low = Math.min(candle.low, haCandle.open, haCandle.close);

    // Copy time and volume from original candle
    haCandle.time = candle.time;
    haCandle.volume = candle.volume;
    
    haData.push(haCandle);
    prevHACandle = haCandle;
  }
  
  return haData;
};

// Calculate a single Heiken Ashi bar for realtime updates
const calculateHeikenAshiBar = (candle, prevHACandle) => {
  if (!candle) return null;

  let haCandle = {};

  // HA-Close = (Open + High + Low + Close) / 4
  haCandle.close = (candle.open + candle.high + candle.low + candle.close) / 4;

  if (!prevHACandle) {
    // HA-Open = (Open + Close) / 2
    haCandle.open = (candle.open + candle.close) / 2;
  } else {
    // HA-Open = (Previous HA-Open + Previous HA-Close) / 2
    haCandle.open = (prevHACandle.open + prevHACandle.close) / 2;
  }

  // HA-High = Max(High, HA-Open, HA-Close)
  haCandle.high = Math.max(candle.high, haCandle.open, haCandle.close);

  // HA-Low = Min(Low, HA-Open, HA-Close)
  haCandle.low = Math.min(candle.low, haCandle.open, haCandle.close);

  // Copy time and volume from original candle
  haCandle.time = candle.time;
  haCandle.volume = candle.volume;

  return haCandle;
};

const updateChartData = () => {
  if (!candleSeries || !historicalData || historicalData.length === 0) {
    console.warn('Cannot update chart: missing data or chart series');
    return;
  }
  
  try {
    let dataToDisplay = historicalData;
    
    if (currentChartType === 'heikenashi') {
      // Calculate Heiken Ashi data
      heikenAshiData = calculateHeikenAshi(historicalData);
      dataToDisplay = heikenAshiData;
    } else if (currentChartType === 'renko') {
      // Calculate Renko data
      renkoData = convertToRenko(historicalData, currentBrickSize, false);
      dataToDisplay = renkoData;
      
      // Validate Renko data
      if (dataToDisplay.length === 0) {
        console.warn('No Renko bricks generated. Check brick size and data.');
        updateStatus('No Renko bricks generated', false);
        return;
      }
    }
    
    // Validate data before setting
    if (!dataToDisplay || dataToDisplay.length === 0) {
      console.warn('No data to display on chart');
      return;
    }
    
    // Update the chart with the appropriate data
    candleSeries.setData(dataToDisplay);
    
    // Fit content to show all data
    chart.timeScale().fitContent();
    
    // For tick charts, set visible range
    if (currentResolution.endsWith('T') && dataToDisplay.length > 10) {
      const lastTime = dataToDisplay[dataToDisplay.length - 1].time;
      const firstTime = dataToDisplay[Math.max(0, dataToDisplay.length - 100)].time;
      chart.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
    }
  } catch (error) {
    console.error('Error updating chart data:', error);
    updateStatus('Chart update error', false);
  }
};

const changeChartType = (chartType) => {
  currentChartType = chartType;

  // Temporarily disable real-time signals during chart type change
  const wasRealTimeReady = isRealTimeReady;
  isRealTimeReady = false;
  
  // Show/hide Renko brick size controls
  const renkoBrickSizeDiv = document.getElementById('renkoBrickSize');
  if (chartType === 'renko') {
    renkoBrickSizeDiv.style.display = 'flex';
    renkoBrickSizeDiv.style.alignItems = 'center';
  } else {
    renkoBrickSizeDiv.style.display = 'none';
  }
  
  // Update the chart title based on type
  let title = `/${CURRENT_CONTRACT} Real-Time Chart`;
  if (chartType === 'heikenashi') {
    title = `/${CURRENT_CONTRACT} Heiken Ashi Chart`;
  } else if (chartType === 'renko') {
    title = `/${CURRENT_CONTRACT} Renko Chart (${currentBrickSize})`;
  }
  document.querySelector('h1').textContent = title;
  
  // Update the chart with the new type
  updateChartData();
  
  // Re-display indicators if any are active
  if (activeIndicators.size > 0) {
    // Clear and redraw all indicators
    const tempIndicators = new Map(activeIndicators);
    clearAllIndicators();

    tempIndicators.forEach((config, type) => {
      // Use the appropriate data based on chart type
      let dataToUse = historicalData;
      if (chartType === 'renko' && renkoData && renkoData.length > 0) {
        dataToUse = renkoData;
      } else if (chartType === 'heikenashi' && heikenAshiData && heikenAshiData.length > 0) {
        dataToUse = heikenAshiData;
      }

      const indicatorValues = calculateIndicator(type, dataToUse, config.period);
      if (indicatorValues && indicatorValues.length > 0) {
        displayIndicator(type, indicatorValues, config.period);
        activeIndicators.set(type, { period: config.period, values: indicatorValues });
      }
    });

    updateActiveIndicatorsDisplay();

    // Re-display Donchian Channel signals if active
    if (activeIndicators.has('DonchianChannel')) {
      displaySignalsOnChart();
    }
  }

  // Re-enable real-time signals after chart type change
  if (wasRealTimeReady) {
    setTimeout(() => {
      isRealTimeReady = true;
      console.log('✅ Real-time ready after chart type change');
    }, 500); // Wait 500ms to ensure we're past any historical processing
  }
};

const updateRenkoBrickSize = () => {
  try {
    const brickSizeInput = document.getElementById('brickSizeInput');
    const newBrickSize = parseFloat(brickSizeInput.value);
    
    if (isNaN(newBrickSize) || newBrickSize <= 0) {
      alert('Please enter a valid brick size greater than 0');
      brickSizeInput.value = currentBrickSize; // Reset to current value
      return;
    }
    
    // Validate reasonable range
    if (newBrickSize > 1000) {
      alert('Brick size too large. Please enter a value less than 1000');
      brickSizeInput.value = currentBrickSize;
      return;
    }

    currentBrickSize = newBrickSize;
    // Update chart title
    document.querySelector('h1').textContent = `/${CURRENT_CONTRACT} Renko Chart (${currentBrickSize})`;
    
    // Reset Renko state when changing brick size
    renkoState = {
      lastBrickHigh: null,
      lastBrickLow: null,
      direction: 1,
      lastTimestamp: null
    };
    
    // Recalculate and update Renko data if currently showing Renko
    if (currentChartType === 'renko') {
      try {
        updateChartData();

        // Recalculate indicators with new Renko data
        if (activeIndicators.size > 0 && renkoData && renkoData.length > 0) {
          const tempIndicators = new Map(activeIndicators);

          // Clear existing indicator series
          indicatorSeries.forEach((series, key) => {
            if (chart) {
              chart.removeSeries(series);
            }
          });
          indicatorSeries.clear();

          // Recalculate and redisplay indicators
          tempIndicators.forEach((config, type) => {
            const indicatorValues = calculateIndicator(type, renkoData, config.period);
            if (indicatorValues && indicatorValues.length > 0) {
              displayIndicator(type, indicatorValues, config.period);
              activeIndicators.set(type, { period: config.period, values: indicatorValues });
            }
          });

          // Re-display Donchian Channel signals if active
          if (activeIndicators.has('DonchianChannel')) {
            displaySignalsOnChart();
          }
        }
      } catch (error) {
        console.error('Error updating Renko chart:', error);
        alert('Error updating chart. Please try a different brick size.');
      }
    }
  } catch (error) {
    console.error('Error updating brick size:', error);
    alert('Error updating brick size. Please try again.');
  }
};

// Strategy management variables
let currentStrategy = null;
let strategyTimer = null;
let currentStrategyId = null;
let currentTicker = CURRENT_CONTRACT; // Use the current contract as ticker

// Load the current strategy from URL parameters or default
const loadCurrentStrategy = async () => {
  try {
    // Try to get strategy ID from URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const strategyId = urlParams.get('strategyId');

    if (strategyId) {
      await loadStrategy(strategyId);
    } else {
      // If no strategy ID in URL, try to load from launch configuration
      if (window.CHART_CONFIG && window.CHART_CONFIG.strategyId) {
        await loadStrategy(window.CHART_CONFIG.strategyId);
      }
    }
  } catch (error) {
    console.error('Error loading current strategy:', error);
  }
};

// Load a specific strategy
const loadStrategy = async (strategyId) => {
  if (!strategyId) {
    currentStrategy = null;
    currentStrategyId = null;
    updateStrategyUI();
    return;
  }

  try {
    const response = await fetch(`http://localhost:8025/api/strategies`);
    const data = await response.json();

    if (data.success && data.data) {
      const strategy = data.data.find(s => s.id === strategyId);
      if (strategy) {
        currentStrategy = strategy;
        currentStrategyId = strategy.id;
        updateStrategyUI();

        // Apply strategy configuration to chart if needed
        if (strategy.strategy_type !== currentChartType) {
          changeChartType(strategy.strategy_type);
        }

        // Load indicators from strategy
        if (strategy.indicators) {
          loadStrategyIndicators(strategy.indicators);
        }
      }
    }
  } catch (error) {
    console.error('Error loading strategy:', error);
    console.log('Error loading strategy: ' + error.message);
  }
};

// Load indicators from strategy configuration
const loadStrategyIndicators = (indicators) => {
  // Clear existing indicators first
  clearAllIndicators();

  // Add each indicator from the strategy
  Object.entries(indicators).forEach(([type, config]) => {
    try {
      let dataForIndicator = historicalData;
      if (currentChartType === 'renko' && renkoData && renkoData.length > 0) {
        dataForIndicator = renkoData;
      } else if (currentChartType === 'heikenashi' && heikenAshiData && heikenAshiData.length > 0) {
        dataForIndicator = heikenAshiData;
      }

      const indicatorValues = calculateIndicator(type, dataForIndicator, config.period || 14);
      if (indicatorValues && indicatorValues.length > 0) {
        displayIndicator(type, indicatorValues, config.period || 14);
        activeIndicators.set(type, { period: config.period || 14, values: indicatorValues });
      }
    } catch (error) {
      console.error(`Error loading indicator ${type}:`, error);
    }
  });

  updateActiveIndicatorsDisplay();
};

// Toggle strategy (start/stop)
const toggleStrategy = async () => {
  if (!currentStrategy) {
    alert('No strategy loaded');
    return;
  }

  const isActive = currentStrategy.status === 'active';
  const newStatus = isActive ? 'inactive' : 'active';

  try {
    const response = await fetch(`http://localhost:8025/api/strategies/${currentStrategy.id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await response.json();

    if (data.success) {
      currentStrategy.status = newStatus;
      updateStrategyUI();

      if (newStatus === 'active') {
        // Start monitoring strategy status
        strategyTimer = setInterval(checkStrategyStatus, 5000);
        console.log('✅ Strategy started successfully');
      } else {
        // Stop monitoring strategy status
        if (strategyTimer) {
          clearInterval(strategyTimer);
          strategyTimer = null;
        }
        console.log('⏹️ Strategy stopped successfully');
      }
    } else {
      throw new Error(data.error || `Failed to ${isActive ? 'stop' : 'start'} strategy`);
    }
  } catch (error) {
    console.error(`Error ${isActive ? 'stopping' : 'starting'} strategy:`, error);
    alert(`Error ${isActive ? 'stopping' : 'starting'} strategy: ` + error.message);
  }
};

// Check strategy status periodically
const checkStrategyStatus = async () => {
  if (!currentStrategy) return;

  try {
    const response = await fetch(`http://localhost:8025/api/strategies`);
    const data = await response.json();

    if (data.success && data.data) {
      const strategy = data.data.find(s => s.id === currentStrategy.id);
      if (strategy && strategy.status !== currentStrategy.status) {
        currentStrategy.status = strategy.status;
        updateStrategyUI();
      }
    }
  } catch (error) {
    console.error('Error checking strategy status:', error);
  }
};

// Update strategy UI based on current state
const updateStrategyUI = () => {
  const toggleBtn = document.getElementById('strategyToggleBtn');
  const nameSpan = document.getElementById('strategyName');

  if (!currentStrategy) {
    toggleBtn.disabled = true;
    toggleBtn.textContent = 'Start Strategy';
    toggleBtn.className = 'strategy-toggle-btn';
    nameSpan.textContent = 'No Strategy Loaded';
    return;
  }

  const status = currentStrategy.status || 'inactive';
  const isActive = status === 'active';

  toggleBtn.disabled = false;
  toggleBtn.textContent = isActive ? 'Stop Strategy' : 'Start Strategy';
  toggleBtn.className = `strategy-toggle-btn ${isActive ? 'stop' : 'start'}`;

  nameSpan.textContent = currentStrategy.name;
};

// Make functions and variables available globally
window.addIndicator = addIndicator;
window.showIndicatorModal = showIndicatorModal;
window.closeIndicatorModal = closeIndicatorModal;
window.applyIndicator = applyIndicator;
window.toggleStrategy = toggleStrategy;
window.changeResolution = changeResolution;
window.changeChartType = changeChartType;
window.updateRenkoBrickSize = updateRenkoBrickSize;
window.activeIndicators = activeIndicators;
window.indicatorSeries = indicatorSeries;

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}