// Renko brick calculation functions

/**
 * Calculate ATR (Average True Range) for dynamic brick size
 * Enhanced version from working code with better validation
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

    // Validate data points
    if (!current || !previous ||
        typeof current.high !== 'number' || typeof current.low !== 'number' ||
        typeof previous.close !== 'number' ||
        isNaN(current.high) || isNaN(current.low) || isNaN(previous.close)) {
      continue;
    }

    const highLow = current.high - current.low;
    const highClose = Math.abs(current.high - previous.close);
    const lowClose = Math.abs(current.low - previous.close);

    const trueRange = Math.max(highLow, Math.max(highClose, lowClose));
    if (!isNaN(trueRange) && trueRange >= 0) {
      trueRanges.push(trueRange);
    }
  }

  // Calculate Simple Moving Average of True Range
  if (trueRanges.length < period) return 50;

  let sum = 0;
  for (let i = trueRanges.length - period; i < trueRanges.length; i++) {
    sum += trueRanges[i];
  }

  const atr = sum / period;
  return isNaN(atr) || atr <= 0 ? 50 : atr;
};

/**
 * Convert OHLC data to Renko bricks
 * Enhanced version from working code with improved validation and timestamp handling
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

  // Initialize with first candle - validate first data point
  if (!data[0] || typeof data[0].close !== 'number' || isNaN(data[0].close)) {
    console.warn('Invalid first data point for Renko conversion');
    return [];
  }

  const firstPrice = data[0].close;
  const firstTime = data[0].time;

  let lastBrickHigh = firstPrice;
  let lastBrickLow = firstPrice;
  let direction = 1; // 1 for up, -1 for down

  for (let i = 1; i < data.length; i++) {
    const currentData = data[i];

    // Enhanced validation
    if (!currentData ||
        typeof currentData.close !== 'number' ||
        typeof currentData.time !== 'number' ||
        isNaN(currentData.close) ||
        isNaN(currentData.time)) {
      console.warn('Invalid data point in Renko conversion at index', i, currentData);
      continue;
    }

    const price = currentData.close;
    const baseTime = currentData.time;

    // Check for upward movement
    while (price >= lastBrickHigh + brickSize) {
      // Create green (up) brick
      const brickOpen = lastBrickHigh;
      const brickClose = lastBrickHigh + brickSize;

      // Ensure unique timestamp by adding brick index
      const brickTime = baseTime + brickIndex;
      brickIndex++;

      const brick = {
        time: brickTime,
        open: parseFloat(brickOpen.toFixed(2)),
        high: parseFloat(brickClose.toFixed(2)),
        low: parseFloat(brickOpen.toFixed(2)),
        close: parseFloat(brickClose.toFixed(2)),
        volume: currentData.volume || 0,
        color: 'green',
        direction: 1
      };

      // Validate brick before adding
      if (validateSingleRenkoBrick(brick)) {
        renkoBricks.push(brick);
      }

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

      const brick = {
        time: brickTime,
        open: parseFloat(brickOpen.toFixed(2)),
        high: parseFloat(brickOpen.toFixed(2)),
        low: parseFloat(brickClose.toFixed(2)),
        close: parseFloat(brickClose.toFixed(2)),
        volume: currentData.volume || 0,
        color: 'red',
        direction: -1
      };

      // Validate brick before adding
      if (validateSingleRenkoBrick(brick)) {
        renkoBricks.push(brick);
      }

      lastBrickLow = brickClose;
      lastBrickHigh = brickOpen;
      direction = -1;
    }
  }

  // Final validation and cleanup
  const validBricks = validateRenkoBricks(renkoBricks);

  // Ensure timestamps are sequential and unique
  if (validBricks.length > 1) {
    for (let i = 1; i < validBricks.length; i++) {
      if (validBricks[i].time <= validBricks[i-1].time) {
        validBricks[i].time = validBricks[i-1].time + 1;
      }
    }
  }

  console.log(`Generated ${validBricks.length} valid Renko bricks with size ${brickSize}`);
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
 * Validate a single Renko brick
 * @param {Object} brick - Single Renko brick to validate
 * @returns {boolean} Whether brick is valid
 */
export const validateSingleRenkoBrick = (brick) => {
  if (!brick || typeof brick !== 'object') return false;

  // Check all required properties exist and are numbers
  const requiredProps = ['time', 'open', 'high', 'low', 'close'];
  for (const prop of requiredProps) {
    if (typeof brick[prop] !== 'number' || isNaN(brick[prop])) {
      return false;
    }
  }

  // Basic OHLC validation
  if (brick.time <= 0 || brick.high < brick.low) {
    return false;
  }

  // Renko-specific validation
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
};

/**
 * Validate Renko bricks array
 * Enhanced version from working code with better error reporting
 * @param {Array} bricks - Renko bricks to validate
 * @returns {Array} Valid Renko bricks
 */
export const validateRenkoBricks = (bricks) => {
  if (!Array.isArray(bricks)) {
    console.warn('validateRenkoBricks: input is not an array');
    return [];
  }

  const validBricks = [];
  let invalidCount = 0;

  for (let i = 0; i < bricks.length; i++) {
    const brick = bricks[i];

    if (validateSingleRenkoBrick(brick)) {
      validBricks.push(brick);
    } else {
      invalidCount++;
      console.warn('Invalid Renko brick at index', i, brick);
    }
  }

  if (invalidCount > 0) {
    console.warn(`Filtered out ${invalidCount} invalid Renko bricks out of ${bricks.length}`);
  }

  return validBricks;
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