// Renko brick calculation functions

/**
 * Calculate ATR (Average True Range) for dynamic brick size
 * @param {Array} data - OHLC data
 * @param {number} period - ATR period (default 14)
 * @returns {number} ATR value
 */
export const calculateATR = (data, period = 14) => {
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

/**
 * Convert OHLC data to Renko bricks
 * @param {Array} data - OHLC data
 * @param {number} brickSize - Size of each brick
 * @param {boolean} useATR - Whether to use ATR for brick size
 * @returns {Array} Array of Renko bricks
 */
export const convertToRenko = (data, brickSize = null, useATR = false) => {
  if (!data || data.length === 0) return [];
  
  // Calculate brick size using ATR if requested
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
  const validBricks = validateRenkoBricks(renkoBricks);
  
  // Ensure timestamps are sequential and unique
  if (validBricks.length > 1) {
    for (let i = 1; i < validBricks.length; i++) {
      if (validBricks[i].time <= validBricks[i-1].time) {
        validBricks[i].time = validBricks[i-1].time + 1;
      }
    }
  }
  
  return validBricks;
};

/**
 * Update Renko with new real-time bar
 * @param {Object} newBar - New OHLC bar
 * @param {Object} renkoState - Current Renko state
 * @param {number} brickSize - Brick size
 * @returns {Object} Object with new bricks and updated state
 */
export const updateRenkoRealtime = (newBar, renkoState, brickSize) => {
  if (!newBar || !renkoState || !brickSize || brickSize <= 0) {
    return { newBricks: [], updatedState: renkoState };
  }
  
  const price = newBar.close;
  const baseTime = newBar.time;
  const newBricks = [];
  
  // Validate price
  if (!price || isNaN(price)) return { newBricks: [], updatedState: renkoState };
  
  let { lastBrickHigh, lastBrickLow, lastTimestamp } = renkoState;
  
  // Initialize if first brick
  if (!lastBrickHigh || !lastBrickLow) {
    lastBrickHigh = price;
    lastBrickLow = price;
    return {
      newBricks: [],
      updatedState: { ...renkoState, lastBrickHigh, lastBrickLow }
    };
  }
  
  // Start timestamp calculation from the last known timestamp
  let nextTimestamp = lastTimestamp ? Math.max(lastTimestamp + 1, baseTime) : baseTime;
  
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
    nextTimestamp++; // Ensure next brick has a later timestamp
  }
  
  // Update last timestamp if we created new bricks
  if (newBricks.length > 0) {
    lastTimestamp = newBricks[newBricks.length - 1].time;
  }
  
  return {
    newBricks: validateRenkoBricks(newBricks),
    updatedState: {
      ...renkoState,
      lastBrickHigh,
      lastBrickLow,
      lastTimestamp,
      direction: newBricks.length > 0 ? newBricks[newBricks.length - 1].direction : renkoState.direction
    }
  };
};

/**
 * Validate Renko bricks
 * @param {Array} bricks - Renko bricks to validate
 * @returns {Array} Valid Renko bricks
 */
export const validateRenkoBricks = (bricks) => {
  return bricks.filter(brick => {
    const isValid = brick &&
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
           brick.high >= brick.low;
    
    if (!isValid) return false;
    
    // Additional Renko-specific validation
    if (brick.direction === 1) {
      // For up bricks: high should equal close, low should equal open
      return Math.abs(brick.high - brick.close) < 0.01 && 
             Math.abs(brick.low - brick.open) < 0.01;
    } else if (brick.direction === -1) {
      // For down bricks: low should equal close, high should equal open
      return Math.abs(brick.low - brick.close) < 0.01 && 
             Math.abs(brick.high - brick.open) < 0.01;
    }
    
    return true;
  });
};

/**
 * Initialize Renko state
 * @param {Array} data - Initial OHLC data
 * @returns {Object} Initial Renko state
 */
export const initializeRenkoState = (data) => {
  if (!data || data.length === 0) {
    return {
      lastBrickHigh: null,
      lastBrickLow: null,
      direction: 1,
      lastTimestamp: null
    };
  }
  
  const lastPrice = data[data.length - 1].close;
  return {
    lastBrickHigh: lastPrice,
    lastBrickLow: lastPrice,
    direction: 1,
    lastTimestamp: data[data.length - 1].time
  };
};