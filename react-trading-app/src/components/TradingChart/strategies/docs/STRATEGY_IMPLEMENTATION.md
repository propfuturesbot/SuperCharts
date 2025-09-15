# Strategy Implementation Documentation

## Overview
This document provides comprehensive documentation for implementing trading strategies in the TradingChart component. Each strategy follows a consistent pattern for configuration, calculation, and visualization.

## Folder Structure
```
strategies/
├── StrategyManager.jsx         # Main coordinator component
├── StrategySelector.jsx        # Dropdown for strategy selection
├── StrategyConfigPanel.jsx     # Configuration panel for parameters
├── StrategyManager.css         # Styles for manager
├── StrategySelector.css        # Styles for selector
├── StrategyConfigPanel.css     # Styles for config panel
├── registry/
│   └── strategyRegistry.js     # Central strategy configurations
├── processors/
│   ├── bollingerBandsProcessor.js  # Bollinger Bands implementation
│   └── [other strategies]...       # Future strategy processors
└── docs/
    └── STRATEGY_IMPLEMENTATION.md   # This documentation
```

## Implemented Strategies

### 1. Bollinger Bands Strategy

#### Description
Bollinger Bands consist of three lines:
- **Upper Band**: Middle Band + (2 × Standard Deviation)
- **Middle Band**: Simple Moving Average (SMA)
- **Lower Band**: Middle Band - (2 × Standard Deviation)

#### Configuration Parameters
- **Period** (default: 20): Number of periods for calculating SMA and standard deviation
- **Standard Deviations** (default: 2): Multiplier for band width

#### Trading Signals
- **BUY Signal**: Generated when price touches or crosses below the lower band (oversold condition)
- **SELL Signal**: Generated when price touches or crosses above the upper band (overbought condition)

#### Visual Elements
- Three lines: Upper, Middle, and Lower bands
- Green arrow markers for buy signals
- Red arrow markers for sell signals
- Statistics display showing win rate and returns

#### Implementation Files
- **Registry**: `registry/strategyRegistry.js` - Configuration definition
- **Processor**: `processors/bollingerBandsProcessor.js` - Calculation logic
- **Core Logic**: Uses `src/indicator/volatility/bollingerBands.ts` and `src/strategy/volatility/bollingerBandsStrategy.ts`

## How to Add a New Strategy

### Step 1: Add to Registry
Edit `registry/strategyRegistry.js` and add your strategy configuration:

```javascript
{
  id: 'your_strategy_id',
  name: 'yourStrategyName',
  displayName: 'Your Strategy Display Name',
  category: 'volatility|momentum|trend|volume',
  description: 'Brief description of the strategy',
  parameters: [
    {
      key: 'parameterKey',
      label: 'Parameter Label',
      type: 'number|select|boolean',
      defaultValue: 20,
      min: 5,
      max: 100,
      step: 1,
      showSlider: true,
      tooltip: 'Helpful tooltip',
      description: 'Detailed description'
    }
  ],
  signals: {
    buy: 'Description of buy condition',
    sell: 'Description of sell condition'
  },
  chartElements: ['element1', 'element2', 'buySignals', 'sellSignals']
}
```

### Step 2: Create Processor
Create a new file in `processors/yourStrategyProcessor.js`:

```javascript
import { yourIndicator } from '../../../../../src/indicator/[category]/yourIndicator';
import { yourStrategy } from '../../../../../src/strategy/[category]/yourStrategy';
import { Action } from '../../../../../src/strategy/action';

export const processYourStrategy = (data, config = {}) => {
  // 1. Extract data
  const closings = data.map(d => d.close || d.value);

  // 2. Calculate indicator
  const indicatorResult = yourIndicator(closings, config);

  // 3. Get trading signals
  const asset = {
    closings: closings,
    highs: data.map(d => d.high || d.close),
    lows: data.map(d => d.low || d.close),
    volumes: data.map(d => d.volume || 0)
  };
  const actions = yourStrategy(asset, config);

  // 4. Prepare chart data
  const chartData = {
    // Indicator lines
    indicatorLine: indicatorResult.map((value, i) => ({
      time: data[i].time,
      value: value
    })),

    // Buy/Sell signals
    buySignals: [],
    sellSignals: [],

    // Statistics
    stats: calculateStrategyStats(actions, closings)
  };

  // 5. Extract signals
  actions.forEach((action, i) => {
    if (action === Action.BUY) {
      chartData.buySignals.push({
        time: data[i].time,
        value: data[i].low,
        price: closings[i]
      });
    } else if (action === Action.SELL) {
      chartData.sellSignals.push({
        time: data[i].time,
        value: data[i].high,
        price: closings[i]
      });
    }
  });

  return chartData;
};

export const formatYourStrategyForChart = (strategyData) => {
  // Format data for TradingView chart library
  return {
    indicatorSeries: {
      data: strategyData.indicatorLine,
      options: {
        color: 'rgba(33, 150, 243, 0.6)',
        lineWidth: 2,
        title: 'Your Indicator'
      }
    },
    buyMarkers: strategyData.buySignals.map(signal => ({
      time: signal.time,
      position: 'belowBar',
      color: '#4CAF50',
      shape: 'arrowUp',
      text: 'Buy'
    })),
    sellMarkers: strategyData.sellSignals.map(signal => ({
      time: signal.time,
      position: 'aboveBar',
      color: '#f44336',
      shape: 'arrowDown',
      text: 'Sell'
    }))
  };
};
```

### Step 3: Update StrategyManager
Edit `StrategyManager.jsx` to include your strategy:

```javascript
// Import your processor
import { processYourStrategy, formatYourStrategyForChart } from './processors/yourStrategyProcessor';

// In applyStrategy function, add case:
switch (selectedStrategy.id) {
  case 'your_strategy_id':
    processedData = processYourStrategy(chartData, strategyConfig);
    formattedData = formatYourStrategyForChart(processedData);
    break;
  // ... other cases
}
```

## Integration with TradingChart

To integrate the StrategyManager into the main TradingChart component:

```javascript
import StrategyManager from './strategies/StrategyManager';

// In your TradingChart component:
<StrategyManager
  chartRef={chartRef}
  candleSeriesRef={candleSeriesRef}
  chartData={displayData}
  onStrategyUpdate={(strategyInfo) => {
    console.log('Strategy updated:', strategyInfo);
  }}
/>
```

## Testing a Strategy

1. **Unit Tests**: Test the processor functions with sample data
2. **Visual Testing**: Apply strategy to different chart types and timeframes
3. **Signal Validation**: Verify buy/sell signals match expected conditions
4. **Performance Testing**: Check calculation speed with large datasets

## Best Practices

1. **Consistent Naming**: Use consistent naming patterns for strategies
2. **Parameter Validation**: Always validate and provide defaults for parameters
3. **Error Handling**: Handle NaN values and insufficient data gracefully
4. **Performance**: Use memoization for expensive calculations
5. **Documentation**: Document each strategy's logic and signals clearly

## Common Issues and Solutions

### Issue: Strategy lines not appearing
**Solution**: Ensure data has valid values (not NaN) and check console for errors

### Issue: Markers not showing
**Solution**: Verify time values match chart data format

### Issue: Configuration changes not applying
**Solution**: Check that applyStrategy is called after config updates

## Future Enhancements

1. **Multiple Strategies**: Support for applying multiple strategies simultaneously
2. **Custom Strategies**: Allow users to create custom strategy combinations
3. **Backtesting**: Full backtesting with detailed performance metrics
4. **Alerts**: Real-time alerts when signals are generated
5. **Strategy Optimization**: Auto-optimize parameters based on historical performance