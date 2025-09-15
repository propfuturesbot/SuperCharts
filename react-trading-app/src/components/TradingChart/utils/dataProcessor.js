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
 * @param {Object} tickData - Incoming tick data
 * @param {Object} accumulator - Current accumulator state
 * @param {number} ticksPerBar - Ticks required per bar
 * @returns {Object} Updated accumulator and completed bar if any
 */
export const accumulateTickData = (tickData, accumulator, ticksPerBar) => {
  const tickPrice = tickData.close || tickData.price;
  const tickVolume = tickData.volume || 1;
  const tickTime = tickData.time;
  
  let newAccumulator = { ...accumulator };
  let completedBar = null;
  
  // Initialize accumulator if needed
  if (!newAccumulator.open) {
    newAccumulator = {
      open: tickPrice,
      high: tickPrice,
      low: tickPrice,
      close: tickPrice,
      volume: 0,
      time: tickTime,
      tickCount: 0
    };
  }
  
  // Update accumulator
  newAccumulator.high = Math.max(newAccumulator.high, tickPrice);
  newAccumulator.low = Math.min(newAccumulator.low, tickPrice);
  newAccumulator.close = tickPrice;
  newAccumulator.volume += tickVolume;
  newAccumulator.tickCount++;
  
  // Check if bar is complete
  if (newAccumulator.tickCount >= ticksPerBar) {
    completedBar = {
      time: newAccumulator.time,
      open: newAccumulator.open,
      high: newAccumulator.high,
      low: newAccumulator.low,
      close: newAccumulator.close,
      volume: newAccumulator.volume
    };
    
    // Reset accumulator for next bar
    newAccumulator = {
      open: tickPrice,
      high: tickPrice,
      low: tickPrice,
      close: tickPrice,
      volume: 0,
      time: tickTime + 1, // Ensure unique timestamp
      tickCount: 0
    };
  }
  
  return {
    accumulator: newAccumulator,
    completedBar
  };
};

/**
 * Process real-time bar update
 * @param {Object} realtimeBar - Real-time bar data
 * @param {Object} lastBar - Last bar in the chart
 * @returns {Object} Processed bar update
 */
export const processRealtimeBar = (realtimeBar) => {
  if (!realtimeBar) return null;
  
  // Handle timestamp conversion
  let timestamp = realtimeBar.time || realtimeBar.t;
  
  // Handle different timestamp formats
  if (realtimeBar.timestampUnix && realtimeBar.timestampUnix > 0) {
    timestamp = realtimeBar.timestampUnix * 1000; // Convert to milliseconds
  } else if (realtimeBar.timestamp && typeof realtimeBar.timestamp === 'string') {
    timestamp = new Date(realtimeBar.timestamp).getTime();
  }
  
  // Fix overly large timestamps (nanoseconds/microseconds)
  if (timestamp > 10000000000000000) { // Nanoseconds
    timestamp = Math.floor(timestamp / 1000000);
  } else if (timestamp > 100000000000000) { // Microseconds
    timestamp = Math.floor(timestamp / 1000);
  } else if (timestamp < 946684800000 && timestamp > 946684800) { // Seconds
    timestamp = timestamp * 1000;
  }
  
  // Additional check for unreasonable timestamps
  if (timestamp > 2000000000000) { // Year 2033+
    timestamp = Math.floor(timestamp / 1000);
  }
  
  const barTime = Math.floor(timestamp / 1000);
  
  return {
    time: barTime,
    open: parseFloat(realtimeBar.open || realtimeBar.o),
    high: parseFloat(realtimeBar.high || realtimeBar.h),
    low: parseFloat(realtimeBar.low || realtimeBar.l),
    close: parseFloat(realtimeBar.close || realtimeBar.c),
    volume: parseInt(realtimeBar.volume || realtimeBar.v || realtimeBar.tv || 0),
    isClosed: realtimeBar.isClosed || false
  };
};

/**
 * Merge real-time update with existing data
 * @param {Array} existingData - Existing chart data
 * @param {Object} newBar - New bar to merge
 * @returns {Array} Updated data array
 */
export const mergeRealtimeUpdate = (existingData, newBar) => {
  if (!existingData || !newBar) return existingData || [];
  
  const lastIndex = existingData.length - 1;
  const lastBar = existingData[lastIndex];
  
  if (!lastBar) {
    return [...existingData, newBar];
  }
  
  // If same time, update existing bar
  if (lastBar.time === newBar.time) {
    const updatedData = [...existingData];
    updatedData[lastIndex] = newBar;
    return updatedData;
  }
  
  // If new time, add new bar
  if (newBar.time > lastBar.time) {
    return [...existingData, newBar];
  }
  
  // If old time, ignore
  return existingData;
};