// Candlestick chart type functions

/**
 * Process candlestick data (standard processing, no transformation needed)
 * @param {Array} data - Raw OHLC data
 * @returns {Array} Processed candlestick data
 */
export const processCandlestickData = (data) => {
  if (!data || data.length === 0) return [];
  
  return data.map(bar => ({
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume || 0
  }));
};

/**
 * Validate candlestick data
 * @param {Array} data - Candlestick data to validate
 * @returns {Array} Valid candlestick data
 */
export const validateCandlestickData = (data) => {
  return data.filter(bar => {
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

/**
 * Fix duplicate timestamps (especially for tick charts)
 * @param {Array} data - Candlestick data
 * @returns {Array} Data with unique timestamps
 */
export const fixDuplicateTimestamps = (data) => {
  if (!data || data.length <= 1) return data;
  
  const fixed = [...data];
  let duplicatesFixed = 0;
  
  for (let i = 1; i < fixed.length; i++) {
    if (fixed[i].time <= fixed[i - 1].time) {
      fixed[i].time = fixed[i - 1].time + 1;
      duplicatesFixed++;
    }
  }
  
  if (duplicatesFixed > 0) {
    console.log(`Fixed ${duplicatesFixed} duplicate timestamps`);
  }
  
  return fixed;
};