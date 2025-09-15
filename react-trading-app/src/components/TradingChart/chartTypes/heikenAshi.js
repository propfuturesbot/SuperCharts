// Heiken Ashi calculation functions

/**
 * Calculate Heiken Ashi data from regular OHLC data
 * @param {Array} data - Array of OHLC bars
 * @returns {Array} Array of Heiken Ashi bars
 */
export const calculateHeikenAshi = (data) => {
  if (!data || data.length === 0) return [];
  
  const haData = [];
  let prevHACandle = null;
  
  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    
    // Validate candle data
    if (!candle || typeof candle.open === 'undefined') continue;
    
    const haCandle = {};
    
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

/**
 * Update Heiken Ashi with new real-time bar
 * @param {Object} newBar - New OHLC bar
 * @param {Array} existingHAData - Existing Heiken Ashi data
 * @param {Array} originalData - Original OHLC data
 * @returns {Object} Updated HA bar
 */
export const updateHeikenAshiRealtime = (newBar, existingHAData, originalData) => {
  if (!newBar || !existingHAData || existingHAData.length === 0) {
    return null;
  }
  
  const lastHACandle = existingHAData[existingHAData.length - 1];
  
  // Calculate HA values for the new bar
  const haClose = (newBar.open + newBar.high + newBar.low + newBar.close) / 4;
  const haOpen = (lastHACandle.open + lastHACandle.close) / 2;
  const haHigh = Math.max(newBar.high, haOpen, haClose);
  const haLow = Math.min(newBar.low, haOpen, haClose);
  
  return {
    time: newBar.time,
    open: haOpen,
    high: haHigh,
    low: haLow,
    close: haClose,
    volume: newBar.volume
  };
};

/**
 * Validate Heiken Ashi data
 * @param {Array} haData - Heiken Ashi data to validate
 * @returns {Array} Valid Heiken Ashi data
 */
export const validateHeikenAshiData = (haData) => {
  return haData.filter(bar => {
    return bar &&
           typeof bar.time === 'number' &&
           typeof bar.open === 'number' &&
           typeof bar.high === 'number' &&
           typeof bar.low === 'number' &&
           typeof bar.close === 'number' &&
           !isNaN(bar.time) &&
           !isNaN(bar.open) &&
           !isNaN(bar.high) &&
           !isNaN(bar.low) &&
           !isNaN(bar.close) &&
           bar.time > 0 &&
           bar.high >= bar.low &&
           bar.high >= bar.open &&
           bar.high >= bar.close &&
           bar.low <= bar.open &&
           bar.low <= bar.close;
  });
};