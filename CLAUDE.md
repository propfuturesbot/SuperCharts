# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IndicatorTS is a TypeScript library providing stock technical analysis indicators, trading strategies, and a backtest framework. This is a TypeScript port of the Indicator Go module.

## Development Commands

### Build
```bash
npm run build         # Full build: ESM, CJS, and TypeScript definitions
npm run build-esm     # ESM build only (browser platform)
npm run build-cjs     # CJS build only (Node.js platform)
npm run build-types   # TypeScript definitions only
```

### Testing
```bash
npm test              # Run all tests with Jest
npm test -- --coverage  # Run tests with coverage report
npm test -- path/to/file.test.ts  # Run specific test file
```

### Code Quality
```bash
npm run lint          # Run ESLint
npm run fix           # Auto-fix Prettier and ESLint issues
```

## Architecture Overview

### Module Structure
The codebase is organized into distinct modules with clear separation of concerns:

- **`src/indicator/`**: Technical indicators grouped by category (trend, momentum, volatility, volume)
  - Each indicator is a pure function that processes arrays of numbers
  - Indicators return arrays or tuples of arrays for multi-value outputs

- **`src/strategy/`**: Trading strategies that generate buy/sell signals
  - Strategies return `Action[]` arrays indicating BUY, SELL, or HOLD decisions
  - Built on top of indicators to create actionable trading signals

- **`src/backtest/`**: Framework for evaluating strategy performance
  - Provides metrics like win rate, profit/loss, and statistical analysis
  - Supports portfolio-level backtesting across multiple assets

- **`src/chart/`**: Visualization utilities for plotting indicators and strategies
  - Provides HTML/JavaScript chart generation capabilities

- **`src/helper/`**: Utility functions used across the library
  - Array operations, mathematical functions, and common calculations

- **`src/company/`**: Asset and company data management utilities

### Design Patterns

1. **Pure Functions**: All indicators and most utilities are pure functions with no side effects
2. **Array-Based Processing**: Data is processed as arrays for efficient batch operations
3. **Modular Exports**: Each module has an index.ts that re-exports all public APIs
4. **Consistent Naming**: Functions use camelCase, constants use UPPER_CASE
5. **Type Safety**: Strict TypeScript configuration ensures type safety throughout

### Build System

- **esbuild**: Used for bundling (faster than webpack/rollup)
- **Three Output Formats**:
  - ESM for modern browsers (dist/esm/)
  - CommonJS for Node.js (dist/cjs/)
  - TypeScript definitions (dist/types/)
- **Minification**: Production builds are minified with source maps

### Testing Approach

- **Jest** with ts-jest for TypeScript support
- Test files co-located with source files (*.test.ts)
- Tests focus on mathematical accuracy and edge cases
- Coverage reports generated automatically

### Key Conventions

- Arrays represent time series data (oldest to newest)
- NaN values indicate insufficient data for calculation
- Strategies use Action enum: BUY = 1, SELL = -1, HOLD = 0
- All exported functions have JSDoc documentation

## Realtime Indicator Calculation (Critical Implementation Details)

### Overview
The realtime charting application (`src/realtime/index.js`) supports four chart types (Candlestick, Heiken Ashi, Renko, Tick Charts) with live indicator updates. Proper implementation requires careful handling of data transformations and update timing.

### Key Architecture Decisions

#### 1. Data Layer Separation
- **`historicalData`**: Raw candlestick data (always maintained as source of truth)
- **`heikenAshiData`**: Transformed Heiken Ashi bars
- **`renkoData`**: Renko bricks calculated from price movements
- **`tickAccumulator`**: Current accumulating tick bar for tick charts
- **`tickCount`**: Number of ticks accumulated in current bar
- Indicators MUST calculate on the appropriate transformed data for each chart type

#### 2. Indicator Update Function
```javascript
const updateIndicators = (newBarData, isNewRenkoBrick = false) => {
  // 1. Always update historicalData (source of truth)
  if (newBarData) {
    const existingIndex = historicalData.findIndex(bar => bar.time === newBarData.time);
    if (existingIndex !== -1) {
      historicalData[existingIndex] = newBarData;
    } else {
      historicalData.push(newBarData);
    }
  }

  // 2. Update transformed data for Heiken Ashi
  if (currentChartType === 'heikenashi') {
    const haBar = calculateHeikenAshiBar(newBarData,
      heikenAshiData.length > 0 ? heikenAshiData[heikenAshiData.length - 1] : null);
    // Update or append haBar to heikenAshiData
  }

  // 3. Control update frequency for Renko
  if (currentChartType === 'renko' && !isNewRenkoBrick) {
    return; // Skip indicator update if no new brick
  }

  // 4. Select correct data source
  let dataForIndicator = historicalData;
  if (currentChartType === 'renko' && renkoData.length > 0) {
    dataForIndicator = renkoData;
  } else if (currentChartType === 'heikenashi' && heikenAshiData.length > 0) {
    dataForIndicator = heikenAshiData;
  }

  // 5. Use dataForIndicator for BOTH calculation AND time alignment
  const latestTime = dataForIndicator[dataForIndicator.length - 1]?.time;
  // Update indicator series with latestTime, not historicalData time
}
```

#### 3. Chart Type Specific Behaviors

##### Candlestick Charts
- Updates on every tick
- Uses raw `historicalData`
- No transformation needed

##### Heiken Ashi Charts
- Updates on every tick
- Requires `calculateHeikenAshiBar()` for single bar calculation
- Formula:
  ```
  HA-Close = (Open + High + Low + Close) / 4
  HA-Open = (Previous HA-Open + Previous HA-Close) / 2
  HA-High = Max(High, HA-Open, HA-Close)
  HA-Low = Min(Low, HA-Open, HA-Close)
  ```

##### Renko Charts
- Updates ONLY when new bricks form
- Pass `isNewRenkoBrick = true` to updateIndicators()
- Prevents indicator distortion from tick-by-tick updates

##### Tick Charts
- Updates based on tick accumulation (e.g., 100T, 500T, 1000T, 5000T)
- Uses `handleTickChartUpdate()` for special processing
- Accumulates individual ticks into bars using `tickAccumulator`
- Updates indicators when:
  - New tick bar is completed (`shouldCreateNewBar = true`)
  - Current bar is updated with new tick data
- Special handling for Heiken Ashi and Renko on tick data

#### 4. Critical Implementation Points

##### Time Alignment
**WRONG:**
```javascript
const latestTime = historicalData[historicalData.length - 1]?.time;
series.update({ time: latestTime, value: indicatorValue });
```

**CORRECT:**
```javascript
const latestTime = dataForIndicator[dataForIndicator.length - 1]?.time;
series.update({ time: latestTime, value: indicatorValue });
```

##### Data Source Selection in addIndicator()
```javascript
let dataForIndicator = historicalData;
if (currentChartType === 'renko' && renkoData.length > 0) {
  dataForIndicator = renkoData;
} else if (currentChartType === 'heikenashi' && heikenAshiData.length > 0) {
  dataForIndicator = heikenAshiData;
}
const indicatorValues = calculateIndicator(type, dataForIndicator, period);
```

##### Chart Type Switching
When user switches chart types, indicators must be recalculated:
```javascript
const changeChartType = (chartType) => {
  // ... update chart display ...

  if (activeIndicators.size > 0) {
    const tempIndicators = new Map(activeIndicators);
    clearAllIndicators();

    tempIndicators.forEach((config, type) => {
      let dataToUse = historicalData;
      if (chartType === 'renko' && renkoData.length > 0) {
        dataToUse = renkoData;
      } else if (chartType === 'heikenashi' && heikenAshiData.length > 0) {
        dataToUse = heikenAshiData;
      }

      const indicatorValues = calculateIndicator(type, dataToUse, config.period);
      // Redisplay indicators...
    });
  }
}
```

##### Tick Chart Special Handling
Tick charts require special processing in `handleTickChartUpdate()`:
```javascript
const handleTickChartUpdate = (update, bar) => {
  // 1. Accumulate ticks into bars
  if (shouldCreateNewBar && tickAccumulator) {
    // Add completed bar to historicalData
    const completedBar = { ...currentBar };
    historicalData.push(completedBar);

    // Update indicators for completed tick bar
    updateIndicators(completedBar, false);
  } else {
    // Update indicators with current accumulating bar
    updateIndicators(currentBarData, false);
  }

  // 2. Special handling for chart types on tick data
  if (currentChartType === 'heikenashi') {
    // Update heikenAshiData array
    if (shouldCreateNewBar) {
      heikenAshiData.push(haBar);
    } else {
      heikenAshiData[heikenAshiData.length - 1] = haBar;
    }
  } else if (currentChartType === 'renko') {
    // Update indicators when new Renko bricks form
    if (newBricks.length > 0) {
      updateIndicators(currentBarData, true);
    }
  }
}
```

### Common Pitfalls to Avoid

1. **Using wrong data source**: Never calculate Renko indicators on candlestick data
2. **Time misalignment**: Always use time from the data source being displayed
3. **Excessive Renko updates**: Only update when bricks form, not on every tick
4. **Missing HA maintenance**: Must update heikenAshiData array in realtime
5. **Forgetting chart switches**: Must recalculate indicators when chart type changes
6. **Tick chart indicator gaps**: Must call updateIndicators() in handleTickChartUpdate()
7. **Missing tick accumulation**: Must maintain historicalData for tick charts

### Testing Checklist

- [ ] Indicators update in realtime for candlestick charts
- [ ] Indicators update in realtime for Heiken Ashi charts
- [ ] Indicators update only on new bricks for Renko charts
- [ ] No distortion or jumping in Renko indicators
- [ ] Indicators update in realtime for tick charts (100T, 500T, 1000T, 5000T)
- [ ] Tick chart indicators update both during bar accumulation and on completion
- [ ] Heiken Ashi tick charts maintain correct heikenAshiData array
- [ ] Renko tick charts only update indicators on new brick formation
- [ ] Indicators recalculate when switching chart types
- [ ] Indicators recalculate when changing Renko brick size
- [ ] Time alignment is correct for all chart types
- [ ] No missing indicator updates when switching to/from tick charts