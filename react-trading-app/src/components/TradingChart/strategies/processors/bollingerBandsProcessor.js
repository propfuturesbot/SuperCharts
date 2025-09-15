// For now, let's create mock implementations until we properly integrate the TypeScript library
// import { bb } from '../../../../../src/indicator/volatility/bollingerBands';
// import { bbStrategy } from '../../../../../src/strategy/volatility/bollingerBandsStrategy';
// import { Action } from '../../../../../src/strategy/action';

// Mock implementations for demonstration
const Action = {
  BUY: 1,
  SELL: -1,
  HOLD: 0
};

const bb = (closings, config) => {
  const period = config.period || 200;
  const stdDev = config.stdDev || 2;

  const result = {
    upper: [],
    middle: [],
    lower: []
  };

  for (let i = 0; i < closings.length; i++) {
    if (i < period - 1) {
      result.upper.push(NaN);
      result.middle.push(NaN);
      result.lower.push(NaN);
      continue;
    }

    // Calculate simple moving average
    const slice = closings.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b) / slice.length;

    // Calculate standard deviation
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / slice.length;
    const standardDev = Math.sqrt(variance);

    result.middle.push(sma);
    result.upper.push(sma + (stdDev * standardDev));
    result.lower.push(sma - (stdDev * standardDev));
  }

  return result;
};

const bbStrategy = (asset, config) => {
  const bandsResult = bb(asset.closings, config);
  const actions = [];

  for (let i = 0; i < asset.closings.length; i++) {
    if (isNaN(bandsResult.upper[i])) {
      actions.push(Action.HOLD);
    } else if (asset.closings[i] < bandsResult.lower[i]) {
      actions.push(Action.BUY);
    } else if (asset.closings[i] > bandsResult.upper[i]) {
      actions.push(Action.SELL);
    } else {
      actions.push(Action.HOLD);
    }
  }

  return actions;
};

/**
 * Process Bollinger Bands strategy for chart data
 * @param {Array} data - Chart data with OHLCV values
 * @param {Object} config - Strategy configuration
 * @returns {Object} Processed strategy data for chart display
 */
export const processBollingerBands = (data, config = {}) => {
  // Extract closing prices
  const closings = data.map(d => d.close || d.value);

  // Calculate Bollinger Bands
  const bandsResult = bb(closings, {
    period: config.period || 20
  });

  // Create asset object for strategy
  const asset = {
    closings: closings,
    highs: data.map(d => d.high || d.close || d.value),
    lows: data.map(d => d.low || d.close || d.value),
    volumes: data.map(d => d.volume || 0)
  };

  // Get trading signals
  const actions = bbStrategy(asset, {
    period: config.period || 20
  });

  // Prepare data for chart
  const chartData = {
    // Bollinger Bands lines
    upperBand: bandsResult.upper.map((value, i) => ({
      time: data[i].time,
      value: value
    })),
    middleBand: bandsResult.middle.map((value, i) => ({
      time: data[i].time,
      value: value
    })),
    lowerBand: bandsResult.lower.map((value, i) => ({
      time: data[i].time,
      value: value
    })),

    // Buy/Sell signals
    buySignals: [],
    sellSignals: [],

    // Raw values for analysis
    rawBands: bandsResult,
    rawActions: actions
  };

  // Extract buy and sell signals with price points
  actions.forEach((action, i) => {
    if (!isNaN(bandsResult.upper[i])) { // Only add signals where bands are calculated
      if (action === Action.BUY) {
        chartData.buySignals.push({
          time: data[i].time,
          value: data[i].low || data[i].close || data[i].value,
          price: closings[i],
          action: 'BUY'
        });
      } else if (action === Action.SELL) {
        chartData.sellSignals.push({
          time: data[i].time,
          value: data[i].high || data[i].close || data[i].value,
          price: closings[i],
          action: 'SELL'
        });
      }
    }
  });

  // Calculate strategy statistics
  const stats = calculateStrategyStats(actions, closings);
  chartData.stats = stats;

  return chartData;
};

/**
 * Calculate strategy performance statistics
 * @param {Array} actions - Array of trading actions
 * @param {Array} prices - Array of closing prices
 * @returns {Object} Strategy statistics
 */
const calculateStrategyStats = (actions, prices) => {
  let buyPrice = null;
  let totalTrades = 0;
  let winningTrades = 0;
  let totalReturn = 0;
  let inPosition = false;

  actions.forEach((action, i) => {
    if (action === Action.BUY && !inPosition) {
      buyPrice = prices[i];
      inPosition = true;
    } else if (action === Action.SELL && inPosition && buyPrice !== null) {
      const returnPct = ((prices[i] - buyPrice) / buyPrice) * 100;
      totalReturn += returnPct;
      totalTrades++;
      if (returnPct > 0) winningTrades++;
      inPosition = false;
      buyPrice = null;
    }
  });

  return {
    totalSignals: actions.filter(a => a !== Action.HOLD).length,
    buySignals: actions.filter(a => a === Action.BUY).length,
    sellSignals: actions.filter(a => a === Action.SELL).length,
    totalTrades: totalTrades,
    winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
    totalReturn: totalReturn.toFixed(2)
  };
};

/**
 * Format Bollinger Bands data for TradingView chart
 * @param {Object} bandsData - Processed Bollinger Bands data
 * @param {Object} config - Strategy configuration with styling options
 * @returns {Object} Formatted data for chart library
 */
export const formatBollingerBandsForChart = (bandsData, config = {}) => {
  // Default colors and thickness if not specified
  const upperBandColor = config.upperBandColor || '#2196F3';
  const upperBandThickness = config.upperBandThickness || 1;
  const middleBandColor = config.middleBandColor || '#9C27B0';
  const middleBandThickness = config.middleBandThickness || 2;
  const lowerBandColor = config.lowerBandColor || '#2196F3';
  const lowerBandThickness = config.lowerBandThickness || 1;

  return {
    upperBandSeries: {
      data: bandsData.upperBand.filter(d => !isNaN(d.value)),
      options: {
        color: upperBandColor,
        lineWidth: upperBandThickness,
        lineStyle: 2, // Dashed
        title: 'Upper Band'
      }
    },
    middleBandSeries: {
      data: bandsData.middleBand.filter(d => !isNaN(d.value)),
      options: {
        color: middleBandColor,
        lineWidth: middleBandThickness,
        lineStyle: 0, // Solid
        title: 'Middle Band (SMA)'
      }
    },
    lowerBandSeries: {
      data: bandsData.lowerBand.filter(d => !isNaN(d.value)),
      options: {
        color: lowerBandColor,
        lineWidth: lowerBandThickness,
        lineStyle: 2, // Dashed
        title: 'Lower Band'
      }
    },
    buyMarkers: bandsData.buySignals.map(signal => ({
      time: signal.time,
      position: 'belowBar',
      color: '#4CAF50',
      shape: 'arrowUp',
      text: 'Buy',
      size: 2
    })),
    sellMarkers: bandsData.sellSignals.map(signal => ({
      time: signal.time,
      position: 'aboveBar',
      color: '#f44336',
      shape: 'arrowDown',
      text: 'Sell',
      size: 2
    }))
  };
};