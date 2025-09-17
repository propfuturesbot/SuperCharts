// Data processing utilities for chart data

import { CHART_TYPES } from './chartConfig';
import { processCandlestickData, validateCandlestickData, fixDuplicateTimestamps } from '../chartTypes/candlestick';
import { calculateHeikenAshi, validateHeikenAshiData } from '../chartTypes/heikenAshi';
import { convertToRenko, validateRenkoBricks } from '../chartTypes/renko';

/**
 * Process raw API data into chart-ready format
 * @param {Array} rawData - Raw data from API
 * @param {string} resolution - Current resolution
 * @returns {Array} Processed data
 */
export const processRawData = (rawData, resolution) => {
  if (!rawData || !Array.isArray(rawData)) return [];
  
  // Convert raw data to standard format
  const processedData = rawData
    .map(bar => {
      // Handle different data formats
      if (!bar) return null;
      
      return {
        time: Math.floor((bar.t || bar.time || bar.timestamp) / 1000), // Convert to seconds
        open: parseFloat(bar.o || bar.open),
        high: parseFloat(bar.h || bar.high),
        low: parseFloat(bar.l || bar.low),
        close: parseFloat(bar.c || bar.close),
        volume: parseInt(bar.v || bar.tv || bar.volume || 0)
      };
    })
    .filter(bar => bar && !isNaN(bar.time) && !isNaN(bar.open))
    .sort((a, b) => a.time - b.time);
  
  // Fix duplicate timestamps for tick charts
  if (resolution && resolution.endsWith('T')) {
    return fixDuplicateTimestamps(processedData);
  }
  
  return processedData;
};

/**
 * Transform data based on chart type
 * @param {Array} data - Processed OHLC data
 * @param {string} chartType - Chart type
 * @param {Object} options - Additional options (e.g., brick size for Renko)
 * @returns {Array} Transformed data
 */
export const transformDataForChartType = (data, chartType, options = {}) => {
  if (!data || data.length === 0) return [];
  
  switch (chartType) {
    case CHART_TYPES.CANDLESTICK:
      return validateCandlestickData(processCandlestickData(data));
    
    case CHART_TYPES.HEIKEN_ASHI:
      return validateHeikenAshiData(calculateHeikenAshi(data));
    
    case CHART_TYPES.RENKO:
      const { brickSize = 10, useATR = false } = options;
      return validateRenkoBricks(convertToRenko(data, brickSize, useATR));
    
    default:
      return validateCandlestickData(data);
  }
};

/**
 * Handle tick chart accumulation
 * Enhanced version from working code with better validation and timestamp handling
 * @param {Object} tickData - Incoming tick data
 * @param {Object} accumulator - Current accumulator state
 * @param {number} ticksPerBar - Ticks required per bar
 * @returns {Object} Updated accumulator and completed bar if any
 */
export const accumulateTickData = (tickData, accumulator, ticksPerBar) => {
  // Validate input data
  if (!tickData) {
    console.warn('accumulateTickData: no tick data provided');
    return { accumulator: accumulator || null, completedBar: null };
  }

  const tickPrice = tickData.close || tickData.price;
  const tickVolume = tickData.volume || 1;
  const tickTime = tickData.time;

  // Validate tick data
  if (typeof tickPrice !== 'number' || isNaN(tickPrice) ||
      typeof tickTime !== 'number' || isNaN(tickTime)) {
    console.warn('accumulateTickData: invalid tick data', tickData);
    return { accumulator: accumulator || null, completedBar: null };
  }

  let newAccumulator = accumulator ? { ...accumulator } : null;
  let completedBar = null;

  // Determine if we should create a new bar
  let shouldCreateNewBar = false;

  if (!newAccumulator || !newAccumulator.open) {
    shouldCreateNewBar = true;
    console.log(`Tick chart: Starting first bar (${ticksPerBar} ticks per bar)`);
  } else {
    // Check if enough ticks have been accumulated
    if (newAccumulator.tickCount >= ticksPerBar) {
      shouldCreateNewBar = true;
      console.log(`Tick chart: ${ticksPerBar} ticks reached, creating new bar`);
    }
    // Also create new bar if significant time has passed (more than 30 seconds)
    else if (newAccumulator.lastTickTime && (tickTime - newAccumulator.lastTickTime) > 30) {
      shouldCreateNewBar = true;
      console.log('Tick chart: Time gap detected, creating new bar');
    }
  }

  // If we need to create a new bar, finalize the current one first
  if (shouldCreateNewBar && newAccumulator && newAccumulator.open) {
    console.log(`Tick chart: Finalizing current bar - ticks: ${newAccumulator.tickCount}/${ticksPerBar}, OHLC: ${newAccumulator.open}/${newAccumulator.high}/${newAccumulator.low}/${newAccumulator.close}`);

    // Finalize current bar as completed
    completedBar = {
      time: newAccumulator.time,
      open: newAccumulator.open,
      high: newAccumulator.high,
      low: newAccumulator.low,
      close: newAccumulator.close,
      volume: newAccumulator.volume
    };
  }

  // Create new accumulator if needed
  if (shouldCreateNewBar) {
    let barTime = newAccumulator && newAccumulator.time ?
      newAccumulator.time + 1 : tickTime;

    newAccumulator = {
      open: tickPrice,
      high: tickPrice,
      low: tickPrice,
      close: tickPrice,
      volume: 0,
      time: barTime,
      tickCount: 0,
      lastTickTime: null
    };
    console.log(`Tick chart: Started new bar at time ${new Date(barTime * 1000).toLocaleString()}`);
  }

  // Update the current accumulator with this tick
  newAccumulator.high = Math.max(newAccumulator.high, tickPrice);
  newAccumulator.low = Math.min(newAccumulator.low, tickPrice);
  newAccumulator.close = tickPrice; // Last tick price becomes close
  newAccumulator.volume += tickVolume;
  newAccumulator.tickCount++;
  newAccumulator.lastTickTime = tickTime;

  console.log(`Tick chart: Updated bar ${newAccumulator.tickCount}/${ticksPerBar} - Price: ${tickPrice}, Bar: O:${newAccumulator.open} H:${newAccumulator.high} L:${newAccumulator.low} C:${newAccumulator.close}`);

  return {
    accumulator: newAccumulator,
    completedBar
  };
};

/**
 * Process real-time bar update
 * Enhanced version from working code with robust timestamp handling
 * @param {Object} realtimeBar - Real-time bar data
 * @returns {Object} Processed bar update
 */
export const processRealtimeBar = (realtimeBar) => {
  if (!realtimeBar) {
    console.warn('processRealtimeBar: no bar data provided');
    return null;
  }

  // Store the original bar data for debugging
  const originalBar = { ...realtimeBar };
  console.log('Raw bar data:', realtimeBar);

  // Handle timestamp conversion with enhanced logic from working code
  let timestamp;

  // Try timestampUnix first (if it's valid)
  if (realtimeBar.timestampUnix && realtimeBar.timestampUnix > 0) {
    timestamp = realtimeBar.timestampUnix * 1000; // Convert to milliseconds
  }
  // If timestampUnix is 0 or invalid, parse the ISO timestamp string
  else if (realtimeBar.timestamp && typeof realtimeBar.timestamp === 'string') {
    timestamp = new Date(realtimeBar.timestamp).getTime();
  }
  // Fallback to other timestamp fields
  else if (realtimeBar.t) {
    timestamp = realtimeBar.t;
  }
  else if (realtimeBar.time) {
    timestamp = realtimeBar.time;
  }
  else {
    console.warn('No valid timestamp found in bar:', realtimeBar);
    return null;
  }

  // Ensure timestamp is a number
  if (isNaN(timestamp)) {
    console.warn('Invalid timestamp:', timestamp);
    return null;
  }

  // Debug the timestamp conversion
  console.log('Timestamp conversion debug:', {
    original: realtimeBar.timestamp,
    timestampUnix: realtimeBar.timestampUnix,
    parsed: timestamp,
    asDate: new Date(timestamp).toLocaleString()
  });

  // Fix timestamp format - API might be returning microseconds or nanoseconds
  // Current timestamp should be around 1724000000000 (Aug 2024 in milliseconds)

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

  const processedBar = {
    time: barTime,
    open: parseFloat(realtimeBar.open || realtimeBar.o),
    high: parseFloat(realtimeBar.high || realtimeBar.h),
    low: parseFloat(realtimeBar.low || realtimeBar.l),
    close: parseFloat(realtimeBar.close || realtimeBar.c),
    volume: parseInt(realtimeBar.volume || realtimeBar.v || realtimeBar.tv || 0),
    isClosed: realtimeBar.isClosed || false
  };

  // Validate the processed bar data
  if (isNaN(processedBar.time) || isNaN(processedBar.open) || isNaN(processedBar.high) ||
      isNaN(processedBar.low) || isNaN(processedBar.close)) {
    console.warn('Invalid bar data after processing, skipping update:', processedBar);
    return null;
  }

  // Validate OHLC relationships
  if (processedBar.high < processedBar.low ||
      processedBar.high < processedBar.open ||
      processedBar.high < processedBar.close ||
      processedBar.low > processedBar.open ||
      processedBar.low > processedBar.close) {
    console.warn('Invalid OHLC relationships, skipping update:', processedBar);
    return null;
  }

  return processedBar;
};

/**
 * Merge real-time update with existing data
 * Enhanced version with better validation and timestamp handling
 * @param {Array} existingData - Existing chart data
 * @param {Object} newBar - New bar to merge
 * @returns {Array} Updated data array
 */
export const mergeRealtimeUpdate = (existingData, newBar) => {
  if (!Array.isArray(existingData)) {
    console.warn('mergeRealtimeUpdate: existingData is not an array');
    return [];
  }

  if (!newBar || typeof newBar.time !== 'number' || isNaN(newBar.time)) {
    console.warn('mergeRealtimeUpdate: invalid newBar data');
    return existingData;
  }

  const lastIndex = existingData.length - 1;
  const lastBar = existingData[lastIndex];

  if (!lastBar) {
    console.log('Adding first bar to empty dataset');
    return [newBar];
  }

  // Only update if the bar time is newer than or equal to the last bar time
  if (newBar.time < lastBar.time) {
    console.warn('Received old bar data, skipping:', {
      receivedTime: new Date(newBar.time * 1000).toLocaleString(),
      lastTime: new Date(lastBar.time * 1000).toLocaleString()
    });
    return existingData;
  }

  // If same time, update existing bar
  if (lastBar.time === newBar.time) {
    console.log('Updating existing bar at time:', new Date(newBar.time * 1000).toLocaleString());
    const updatedData = [...existingData];
    updatedData[lastIndex] = newBar;
    return updatedData;
  }

  // If new time, add new bar
  if (newBar.time > lastBar.time) {
    console.log('Adding new bar at time:', new Date(newBar.time * 1000).toLocaleString());
    return [...existingData, newBar];
  }

  // Fallback
  return existingData;
};

/**
 * Validate chart data to ensure proper format for LightweightCharts
 * Enhanced validation function from working code
 * @param {Object} data - Chart data to validate
 * @returns {Object|null} Validated data or null if invalid
 */
export const validateChartData = (data) => {
  if (!data || typeof data !== 'object') {
    console.warn('Invalid chart data: not an object', data);
    return null;
  }

  // Ensure time is a number (not an object)
  let time = data.time;
  if (typeof time === 'object' && time !== null) {
    // If time is an object, try to extract a numeric value
    time = time.valueOf ? time.valueOf() : Date.now() / 1000;
  }
  time = Math.floor(Number(time));

  // Validate OHLC values
  const open = Number(data.open);
  const high = Number(data.high);
  const low = Number(data.low);
  const close = Number(data.close);
  const volume = Number(data.volume || 0);

  // Check for valid numbers
  if (isNaN(time) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
    console.warn('Invalid chart data: NaN values', { time, open, high, low, close });
    return null;
  }

  // Check OHLC relationships
  if (high < low || high < open || high < close || low > open || low > close) {
    console.warn('Invalid OHLC relationships', { open, high, low, close });
    return null;
  }

  return {
    time,
    open,
    high,
    low,
    close,
    volume
  };
};

/**
 * Get ticks per bar based on resolution
 * Function from working code for tick chart handling
 * @param {string} resolution - Chart resolution
 * @returns {number} Number of ticks per bar
 */
export const getTicksPerBar = (resolution) => {
  if (!resolution || !resolution.endsWith('T')) return 10;

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