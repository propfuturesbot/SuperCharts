const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjE5NDY5OSIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL3NpZCI6IjcxZTBhY2EwLWMxYzgtNGRiZC1iNjBhLWU0YjY0MTRkNTgzOSIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWUiOiJzdW1vbmV5MSIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6InVzZXIiLCJtc2QiOiJDTUVHUk9VUF9UT0IiLCJtZmEiOiJ2ZXJpZmllZCIsImV4cCI6MTc1ODcyMzkxN30.CSfE9e-soJNxLU_4UyXS2KUWw-Dy6tyNW7u8vUByBfI";

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
  '100T': { countback: 50, displayName: '100 Ticks', symbol: 'F.US.MNQ' },
  '500T': { countback: 50, displayName: '500 Ticks', symbol: 'F.US.MNQ' },
  '1000T': { countback: 50, displayName: '1000 Ticks', symbol: 'F.US.MNQ' },
  '5000T': { countback: 50, displayName: '5000 Ticks', symbol: 'F.US.MNQ' },
  
  // Second-based resolutions
  '1S': { countback: 500, displayName: '1 Second', symbol: 'F.US.MNQ' },
  '5S': { countback: 500, displayName: '5 Seconds', symbol: 'F.US.MNQ' },
  '10S': { countback: 500, displayName: '10 Seconds', symbol: 'F.US.MNQ' },
  '15S': { countback: 500, displayName: '15 Seconds', symbol: 'F.US.MNQ' },
  '20S': { countback: 500, displayName: '20 Seconds', symbol: 'F.US.MNQ' },
  '30S': { countback: 500, displayName: '30 Seconds', symbol: 'F.US.MNQ' },
  
  // Minute-based resolutions
  '1': { countback: 500, displayName: '1 Minute', symbol: 'F.US.MNQ' },
  '2': { countback: 500, displayName: '2 Minutes', symbol: 'F.US.MNQ' },
  '3': { countback: 500, displayName: '3 Minutes', symbol: 'F.US.MNQ' },
  '4': { countback: 500, displayName: '4 Minutes', symbol: 'F.US.MNQ' },
  '5': { countback: 500, displayName: '5 Minutes', symbol: 'F.US.MNQ' },
  '10': { countback: 500, displayName: '10 Minutes', symbol: 'F.US.MNQ' },
  '15': { countback: 500, displayName: '15 Minutes', symbol: 'F.US.MNQ' },
  '20': { countback: 500, displayName: '20 Minutes', symbol: 'F.US.MNQ' },
  '30': { countback: 500, displayName: '30 Minutes', symbol: 'F.US.MNQ' },
  '45': { countback: 500, displayName: '45 Minutes', symbol: 'F.US.MNQ' },
  '60': { countback: 500, displayName: '1 Hour', symbol: 'F.US.MNQ' },
  '1D': { countback: 326, displayName: '1 Day', symbol: 'F.US.MNQ' },
  '1W': { countback: 500, displayName: '1 Week', symbol: 'F.US.MNQ' },
  '1M': { countback: 500, displayName: '1 Month', symbol: 'F.US.MNQ' }
};

const getHistoricalData = async (resolution, countback, symbol = "%2FMNQ") => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - (86400 * 7); // 7 days ago
    const to = now;
    
    const url = `https://chartapi.topstepx.com/History/v2?Symbol=${symbol}&Resolution=${resolution}&Countback=${countback}&From=${from}&To=${to}&SessionId=extended&Live=false`;
    
    console.log('Fetching historical data:', url);
    
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`HTTP error! status: ${res.status}, response: ${errorText}`);
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    const text = await res.text();
    console.log('Raw response (first 500 chars):', text.substring(0, 500));
    
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
    
    console.log(`Received ${bars.length} bars for resolution ${resolution}`);
    
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
      console.log('Fixing duplicate timestamps for tick chart...');
      let duplicatesFixed = 0;
      
      for (let i = 1; i < chartData.length; i++) {
        if (chartData[i].time <= chartData[i - 1].time) {
          chartData[i].time = chartData[i - 1].time + 1;
          duplicatesFixed++;
        }
      }
      
      console.log(`Fixed ${duplicatesFixed} duplicate timestamps in tick chart historical data`);
    }
    
    console.log(`Processed ${chartData.length} valid bars`);
    
    if (chartData.length > 0) {
      lastBarTime = chartData[chartData.length - 1].time;
      currentBar = { ...chartData[chartData.length - 1] };
      console.log('Last bar time:', new Date(lastBarTime * 1000).toLocaleString());
      console.log('Last bar:', currentBar);
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
    
    connection = new signalR.HubConnectionBuilder()
      .withUrl(`https://chartapi.topstepx.com/hubs/chart?access_token=${ACCESS_TOKEN}`, {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets
      })
      .configureLogging(signalR.LogLevel.Information)
      .withAutomaticReconnect()
      .build();
    
    connection.on("RealTimeBar", (receivedSymbol, receivedResolution, bar) => {
      console.log('RealTimeBar received:', {
        symbol: receivedSymbol,
        resolution: receivedResolution,
        bar: bar,
        currentResolution: currentResolution
      });
      
      // Check if this update is for our current resolution
      if (receivedResolution === currentResolution) {
        handleRealTimeBar(bar);
      }
    });
    
    connection.onreconnecting(() => {
      console.log('Reconnecting to SignalR...');
      updateStatus('Reconnecting...', false);
    });
    
    connection.onreconnected(async () => {
      console.log('Reconnected to SignalR');
      updateStatus('Connected', true);
      await subscribeToResolution(currentResolution);
    });
    
    connection.onclose(() => {
      console.log('SignalR connection closed');
      updateStatus('Disconnected', false);
    });
    
    await connection.start();
    console.log('Connected to SignalR hub successfully');
    updateStatus('Connected', true);
    
    // Subscribe to the current resolution
    await subscribeToResolution(currentResolution);
    
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
  
  console.log('Raw bar data:', bar);
  
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
  
  // Debug the timestamp conversion
  console.log('Timestamp conversion debug:', {
    original: bar.timestamp,
    timestampUnix: bar.timestampUnix,
    parsed: timestamp,
    asDate: new Date(timestamp).toLocaleString()
  });
  
  // Fix timestamp format - API might be returning microseconds or nanoseconds
  // Current timestamp should be around 1724000000000 (Aug 2024 in milliseconds)
  // Your timestamp 1755623700000000 is way too large
  
  if (timestamp > 10000000000000000) { // 17+ digits - likely nanoseconds or wrong format
    console.log('Timestamp too large, trying division by 1000000 (nanoseconds to milliseconds)');
    timestamp = Math.floor(timestamp / 1000000);
  } else if (timestamp > 100000000000000) { // 15+ digits - likely microseconds
    console.log('Converting from microseconds to milliseconds');
    timestamp = Math.floor(timestamp / 1000);
  } else if (timestamp < 946684800000) { // Less than year 2000 in milliseconds
    if (timestamp > 946684800) { // Greater than year 2000 in seconds
      console.log('Converting from seconds to milliseconds');
      timestamp = timestamp * 1000;
    }
  }
  
  // Additional check - if still not in reasonable range, try more aggressive conversion
  if (timestamp > 2000000000000) { // If still larger than year 2033
    console.log('Timestamp still too large, trying additional division by 1000');
    timestamp = Math.floor(timestamp / 1000);
  }
  
  console.log('Final timestamp:', timestamp, 'as date:', new Date(timestamp).toLocaleString());
  
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
  
  console.log('Processing bar update:', {
    barTime: new Date(barTime * 1000).toLocaleString(),
    lastBarTime: lastBarTime ? new Date(lastBarTime * 1000).toLocaleString() : 'none',
    isClosed: bar.isClosed,
    update
  });
  
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
            
            console.log(`Added ${newBricks.length} new Renko brick(s)`);
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
        checkRealtimeSignal(update);
      }
    }
  } catch (chartError) {
    console.error('Error updating chart:', chartError);
  }
};

const handleTickChartUpdate = (update, bar) => {
  console.log('Tick chart: Received tick data - price:', update.close, 'volume:', update.volume);
  
  // Extract tick price (use close price as the tick price)
  const tickPrice = update.close;
  const tickVolume = update.volume || 1;
  const tickTime = update.time;
  
  // Determine if we should create a new bar
  // Create new bar if: no accumulator exists, enough ticks accumulated, or enough time passed
  let shouldCreateNewBar = false;
  
  if (!tickAccumulator) {
    shouldCreateNewBar = true;
    console.log(`Tick chart: Starting first ${currentResolution} bar (${currentTicksPerBar} ticks per bar)`);
  } else {
    // Check if enough ticks have been accumulated
    if (tickCount >= currentTicksPerBar) {
      shouldCreateNewBar = true;
      console.log(`Tick chart: ${currentTicksPerBar} ticks reached for ${currentResolution}, creating new bar`);
    }
    // Also create new bar if significant time has passed (more than 30 seconds for larger tick resolutions)
    else if (lastTickTime && (tickTime - lastTickTime) > 30) {
      shouldCreateNewBar = true;
      console.log('Tick chart: Time gap detected, creating new bar');
    }
  }
  
  // If we need to create a new bar, finalize the current one first
  if (shouldCreateNewBar && tickAccumulator) {
    console.log(`Tick chart: Finalizing current ${currentResolution} bar - ticks: ${tickCount}/${currentTicksPerBar}, OHLC: ${tickAccumulator.open}/${tickAccumulator.high}/${tickAccumulator.low}/${tickAccumulator.close}`);
    
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
    console.log(`Tick chart: Started new ${currentResolution} bar at time ${new Date(barTime * 1000).toLocaleString()}`);
  }
  
  // Update the current accumulator with this tick
  tickAccumulator.high = Math.max(tickAccumulator.high, tickPrice);
  tickAccumulator.low = Math.min(tickAccumulator.low, tickPrice);
  tickAccumulator.close = tickPrice; // Last tick price becomes close
  tickAccumulator.volume += tickVolume;
  tickCount++;
  lastTickTime = tickTime;
  
  console.log(`Tick chart: Updated ${currentResolution} bar ${tickCount}/${currentTicksPerBar} - Price: ${tickPrice}, Bar: O:${tickAccumulator.open} H:${tickAccumulator.high} L:${tickAccumulator.low} C:${tickAccumulator.close}`);
  
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

        console.log(`Tick chart: Added ${newBricks.length} new Renko brick(s)`);
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
        console.log(`Unsubscribed from ${prevConfig.symbol} ${currentSubscription}`);
      } catch (unsubError) {
        console.warn('Error unsubscribing:', unsubError);
      }
    }
    
    // Subscribe to new resolution
    if (connection && connection.state === signalR.HubConnectionState.Connected) {
      await connection.invoke("SubscribeBars", symbol, resolution);
      console.log(`Subscribed to ${symbol} ${resolution}`);
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
  console.log(`=== Changing resolution to "${resolution}" ===`);
  console.log('Resolution config:', resolutionConfig[resolution]);
  currentResolution = resolution;
  lastBarTime = null;
  currentBar = null;
  
  // Reset tick accumulator when switching resolutions
  tickAccumulator = null;
  tickCount = 0;
  lastTickTime = null;
  
  // Set the appropriate ticks per bar for this resolution
  currentTicksPerBar = getTicksPerBar(resolution);
  console.log(`Setting ticks per bar for ${resolution}: ${currentTicksPerBar}`);
  
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
  console.log('Chart container dimensions:', {
    width: chartElement.offsetWidth,
    height: chartElement.offsetHeight,
    display: getComputedStyle(chartElement).display,
    visibility: getComputedStyle(chartElement).visibility
  });
  
  // Load historical data for new resolution
  const config = resolutionConfig[resolution];
  console.log(`Loading data for resolution "${resolution}" with config:`, config);
  historicalData = await getHistoricalData(resolution, config.countback);
  
  if (historicalData && historicalData.length > 0) {
    console.log(`Setting ${historicalData.length} bars on chart`);
    
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
    
    console.log(`Filtered data: ${validData.length} valid bars out of ${historicalData.length}`);
    
    if (validData.length > 0) {
      try {
        // Sort by time to ensure proper order
        validData.sort((a, b) => a.time - b.time);
        
        // Store the valid data
        historicalData = validData;
        
        // Calculate Heiken Ashi data if that chart type is selected
        if (currentChartType === 'heikenashi') {
          heikenAshiData = calculateHeikenAshi(validData);
          console.log('Calculated Heiken Ashi data with', heikenAshiData.length, 'bars');
        } else if (currentChartType === 'renko') {
          renkoData = convertToRenko(validData, currentBrickSize, false);
          console.log('Calculated Renko data with', renkoData.length, 'bricks');
        }
        
        // Determine which data to display
        let dataToDisplay = validData;
        if (currentChartType === 'heikenashi') {
          dataToDisplay = heikenAshiData;
        } else if (currentChartType === 'renko') {
          dataToDisplay = renkoData;
        }
        
        // Debug: Show sample of data being set
        console.log('Sample data being set on chart:');
        console.log('First 3 bars:', JSON.stringify(dataToDisplay.slice(0, 3), null, 2));
        console.log('Last 3 bars:', JSON.stringify(dataToDisplay.slice(-3), null, 2));
        console.log('Time range:', {
          first: new Date(dataToDisplay[0].time * 1000).toLocaleString(),
          last: new Date(dataToDisplay[dataToDisplay.length - 1].time * 1000).toLocaleString(),
          totalBars: dataToDisplay.length
        });
        
        candleSeries.setData(dataToDisplay);
        
        // Update chart time scale to fit the data
        chart.timeScale().fitContent();
        
        // For tick charts, try to set a specific visible range to the last few hours
        if (currentResolution.endsWith('T') && dataToDisplay.length > 10) {
          const lastTime = dataToDisplay[dataToDisplay.length - 1].time;
          const firstTime = dataToDisplay[Math.max(0, dataToDisplay.length - 100)].time;
          console.log('Setting tick chart visible range:', {
            from: new Date(firstTime * 1000).toLocaleString(),
            to: new Date(lastTime * 1000).toLocaleString()
          });
          chart.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
        }
        
        console.log('Chart data set successfully, visible range:', chart.timeScale().getVisibleRange());
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
  console.log('=== Initializing application ===');
  
  // Check if required libraries are loaded
  if (typeof LightweightCharts === 'undefined') {
    console.error('LightweightCharts library not loaded!');
    return;
  }
  
  if (typeof signalR === 'undefined') {
    console.error('SignalR library not loaded!');
    return;
  }
  
  console.log('All required libraries loaded successfully');
  
  // Initialize the chart
  console.log('Initializing chart...');
  initializeChart();
  
  if (!chart) {
    console.error('Failed to initialize chart');
    return;
  }
  
  console.log('Chart initialized successfully');
  
  // Load initial data
  const initialResolution = document.getElementById('resolution').value;
  currentResolution = initialResolution;
  
  // Set initial ticks per bar
  currentTicksPerBar = getTicksPerBar(initialResolution);
  
  console.log(`Loading initial data for resolution: "${initialResolution}"`);
  console.log('Initial resolution config:', resolutionConfig[initialResolution]);
  const config = resolutionConfig[initialResolution];
  
  if (!config) {
    console.error(`No configuration found for resolution: ${initialResolution}`);
    return;
  }
  
  historicalData = await getHistoricalData(initialResolution, config.countback);
  
  if (historicalData && historicalData.length > 0) {
    console.log(`Setting ${historicalData.length} initial bars on chart`);
    
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
    
    console.log(`Filtered data: ${validData.length} valid bars out of ${historicalData.length}`);
    
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
  console.log('Setting up real-time connection...');
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
        const bbResult = window.indicators.bollingerBands(closePrices, { period, multiplier: 2 });
        return {
          upper: bbResult.upperBand,
          middle: bbResult.middleBand,
          lower: bbResult.lowerBand
        };
      case 'DonchianChannel':
        const dcResult = window.indicators.donchianChannel(highPrices, lowPrices, { period });
        return {
          upper: dcResult.upperChannel,
          middle: dcResult.middleChannel,
          lower: dcResult.lowerChannel
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

const addIndicator = (indicatorType) => {
  if (!indicatorType || activeIndicators.has(indicatorType)) {
    document.getElementById('indicators').value = '';
    return;
  }
  
  console.log('Adding indicator:', indicatorType);
  
  if (!historicalData || historicalData.length === 0) {
    alert('No data available to calculate indicators');
    document.getElementById('indicators').value = '';
    return;
  }
  
  const period = prompt(`Enter period for ${indicatorType} (default: 14):`, '14');
  if (period === null) {
    document.getElementById('indicators').value = '';
    return;
  }
  
  const periodNum = parseInt(period) || 14;
  
  try {
    // Use the appropriate data based on chart type
    let dataForIndicator = historicalData;
    if (currentChartType === 'renko' && renkoData && renkoData.length > 0) {
      dataForIndicator = renkoData;
      console.log('Using Renko data for indicator calculation');
    } else if (currentChartType === 'heikenashi' && heikenAshiData && heikenAshiData.length > 0) {
      dataForIndicator = heikenAshiData;
      console.log('Using Heiken Ashi data for indicator calculation');
    }

    const indicatorValues = calculateIndicator(indicatorType, dataForIndicator, periodNum);
    
    if (!indicatorValues || indicatorValues.length === 0) {
      alert('Failed to calculate indicator values');
      document.getElementById('indicators').value = '';
      return;
    }
    
    displayIndicator(indicatorType, indicatorValues, periodNum);
    activeIndicators.set(indicatorType, { period: periodNum, values: indicatorValues });
    
    // Update the active indicators display
    updateActiveIndicatorsDisplay();
    
    // If Donchian Channel was added, display signals
    if (indicatorType === 'DonchianChannel') {
      displaySignalsOnChart();
    }
    
    console.log(`${indicatorType} indicator added successfully`);
  } catch (error) {
    console.error('Error adding indicator:', error);
    alert('Error adding indicator: ' + error.message);
  }
  
  document.getElementById('indicators').value = '';
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
    
    console.log(`Displayed ${type} indicator with ${Array.isArray(values) ? values.length : 'multiple'} data points`);
    
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
      if (newValues && newValues.length > 0) {

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

            console.log(`Updated ${type} indicator - time: ${latestTime}, upper: ${newValues.upper[latestIndex]}`);
          }
        } else if (Array.isArray(newValues)) {
          const series = indicatorSeries.get(type);
          if (series && latestTime) {
            const latestValue = newValues[newValues.length - 1];

            if (!isNaN(latestValue)) {
              series.update({ time: latestTime, value: latestValue });
              console.log(`Updated ${type} indicator - time: ${latestTime}, value: ${latestValue}`);
            }
          }
        }
        
        // Update stored values
        activeIndicators.set(type, { period: config.period, values: newValues });
        
        // Update signals if Donchian Channel was updated
        if (type === 'DonchianChannel') {
          displaySignalsOnChart();
        }
      }
    } catch (error) {
      console.error(`Error updating ${type} indicator:`, error);
    }
  });
};

const removeIndicator = (indicatorType) => {
  console.log('Removing indicator:', indicatorType);
  
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
    console.log('Trading signals cleared');
  }
  
  console.log(`${indicatorType} indicator removed successfully`);
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
    }
  }
  
  return signals;
};

const displaySignalsOnChart = () => {
  if (!candleSeries || !historicalData) return;
  
  // Clear existing markers
  candleSeries.setMarkers([]);
  
  const signals = detectDonchianSignals(historicalData);
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
  
  console.log(`Displayed ${signals.length} trading signals on chart`);
  
  // Show latest signals in console for debugging
  const latestSignals = signals.slice(-5);
  if (latestSignals.length > 0) {
    console.log('Latest signals:', latestSignals);
  }
};

const checkRealtimeSignal = (newBar) => {
  if (!newBar || !historicalData || historicalData.length < 2) return;
  
  const donchianConfig = activeIndicators.get('DonchianChannel');
  if (!donchianConfig || !donchianConfig.values) return;
  
  const { upper, lower } = donchianConfig.values;
  if (!upper || !lower || upper.length === 0) return;
  
  // Get the latest Donchian values
  const latestUpper = upper[upper.length - 1];
  const latestLower = lower[lower.length - 1];
  
  // Get previous bar
  const prevBar = historicalData[historicalData.length - 2];
  if (!prevBar) return;
  
  // Check for buy signal
  const prevTouchedLower = prevBar.low <= latestLower;
  const currentIsGreen = newBar.close > newBar.open;
  
  if (prevTouchedLower && currentIsGreen && !lastTouchLower) {
    // Generate buy signal
    console.log('🟢 BUY SIGNAL DETECTED!', {
      time: new Date(newBar.time * 1000).toLocaleString(),
      price: newBar.close,
      reason: 'Price touched Donchian lower + Green candle'
    });
    
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
    
    lastTouchLower = true;
  } else if (!prevTouchedLower) {
    lastTouchLower = false;
  }
  
  // Check for sell signal
  const prevTouchedUpper = prevBar.high >= latestUpper;
  const currentIsRed = newBar.close < newBar.open;
  
  if (prevTouchedUpper && currentIsRed && !lastTouchUpper) {
    // Generate sell signal
    console.log('🔴 SELL SIGNAL DETECTED!', {
      time: new Date(newBar.time * 1000).toLocaleString(),
      price: newBar.close,
      reason: 'Price touched Donchian upper + Red candle'
    });
    
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
    console.log('Calculated ATR brick size:', brickSize);
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
  
  console.log(`Generated ${validBricks.length} valid Renko bricks with size ${brickSize}`);
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
  
  console.log(`Real-time: Generated ${validBricks.length} new Renko bricks, last timestamp: ${renkoState.lastTimestamp}`);
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
      console.log('Displaying Heiken Ashi data with', dataToDisplay.length, 'bars');
    } else if (currentChartType === 'renko') {
      // Calculate Renko data
      renkoData = convertToRenko(historicalData, currentBrickSize, false);
      dataToDisplay = renkoData;
      console.log('Displaying Renko data with', dataToDisplay.length, 'bricks');
      
      // Validate Renko data
      if (dataToDisplay.length === 0) {
        console.warn('No Renko bricks generated. Check brick size and data.');
        updateStatus('No Renko bricks generated', false);
        return;
      }
    } else {
      console.log('Displaying Candlestick data with', dataToDisplay.length, 'bars');
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
    
    console.log('Chart updated successfully with', dataToDisplay.length, 'data points');
    
  } catch (error) {
    console.error('Error updating chart data:', error);
    updateStatus('Chart update error', false);
  }
};

const changeChartType = (chartType) => {
  console.log('Changing chart type to:', chartType);
  currentChartType = chartType;
  
  // Show/hide Renko brick size controls
  const renkoBrickSizeDiv = document.getElementById('renkoBrickSize');
  if (chartType === 'renko') {
    renkoBrickSizeDiv.style.display = 'flex';
    renkoBrickSizeDiv.style.alignItems = 'center';
  } else {
    renkoBrickSizeDiv.style.display = 'none';
  }
  
  // Update the chart title based on type
  let title = '/MNQ Real-Time Chart';
  if (chartType === 'heikenashi') {
    title = '/MNQ Heiken Ashi Chart';
  } else if (chartType === 'renko') {
    title = `/MNQ Renko Chart (${currentBrickSize})`;
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
        console.log('Recalculating indicators for Renko data');
      } else if (chartType === 'heikenashi' && heikenAshiData && heikenAshiData.length > 0) {
        dataToUse = heikenAshiData;
        console.log('Recalculating indicators for Heiken Ashi data');
      }

      const indicatorValues = calculateIndicator(type, dataToUse, config.period);
      if (indicatorValues && indicatorValues.length > 0) {
        displayIndicator(type, indicatorValues, config.period);
        activeIndicators.set(type, { period: config.period, values: indicatorValues });
      }
    });

    updateActiveIndicatorsDisplay();
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
    console.log('Updated brick size to:', currentBrickSize);
    
    // Update chart title
    document.querySelector('h1').textContent = `/MNQ Renko Chart (${currentBrickSize})`;
    
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

// Make functions available globally
window.addIndicator = addIndicator;
window.changeResolution = changeResolution;
window.changeChartType = changeChartType;
window.updateRenkoBrickSize = updateRenkoBrickSize;

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}