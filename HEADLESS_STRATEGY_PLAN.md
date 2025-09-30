# Headless Strategy Execution Implementation Plan

## Overview
Create a background strategy execution system that runs trading strategies without UI plotting, reusing the existing well-tested charting and indicator logic.

## Current Architecture Analysis

### Existing Components (src/realtime/index.js)
- **Data Processing Pipeline**: `historicalData`, `heikenAshiData`, `renkoData`, tick accumulation
- **WebSocket Integration**: Provider configs, connection handling, reconnection logic
- **Chart Type Support**: Candlestick, Heiken Ashi, Renko, Tick Charts (100T, 500T, 1000T, 5000T)
- **Indicator Engine**: `updateIndicators()`, `calculateIndicator()`, 30+ technical indicators
- **Strategy Framework**: Loading, execution, status monitoring via backend API
- **Signal Generation**: `sendPayload()` webhook integration for BUY/SELL signals

### Key Functions to Reuse (Copy Exactly)
1. **Data Transformation Logic**:
   - `calculateHeikenAshiBar()` - Single bar Heiken Ashi calculation
   - `calculateRenkoBricks()` - Renko brick generation from price data
   - `handleTickChartUpdate()` - Tick accumulation and bar completion
   - `getTicksPerBar()` - Dynamic tick scaling based on resolution

2. **Indicator Processing**:
   - `updateIndicators(newBarData, isNewRenkoBrick)` - Complete indicator update logic
   - `calculateIndicator(type, dataForIndicator, period)` - All 30+ indicators
   - Chart type-specific data selection logic

3. **WebSocket & Data Management**:
   - Provider configuration and token management
   - WebSocket connection, subscription, and message handling
   - Historical data fetching and real-time updates
   - Chart type switching and data source selection

4. **Strategy Integration**:
   - `loadStrategy()`, `toggleStrategy()`, `checkStrategyStatus()`
   - Backend API integration for strategy management
   - Webhook payload generation and sending

## Implementation Approach: Copy-Paste Strategy

### Step 1: Create Headless Runner
**File**: `src/realtime/headless-strategy-runner.js`

#### What to Copy (Keep Identical)
```javascript
// Essential variables and data structures
let historicalData = [];
let heikenAshiData = [];
let renkoData = [];
let tickAccumulator = null;
let activeIndicators = new Map();
let currentChartType = 'candlestick';
let currentResolution = '15';
let renkoState = { /* ... */ };

// Core functions (copy exactly)
- getAccessToken()
- getProviderConfig()
- formatContractSymbol()
- getHistoricalData()
- calculateHeikenAshiBar()
- calculateRenkoBricks()
- handleTickChartUpdate()
- updateIndicators()
- calculateIndicator()
- WebSocket connection and message handling
- Strategy loading and management functions
- sendPayload() webhook integration
```

#### What to Remove
```javascript
// UI/Chart related (remove entirely)
- chart, candleSeries variables
- All LightweightCharts imports and usage
- indicatorSeries Map and series.update() calls
- DOM element references and manipulations
- Event handlers for UI buttons
- Visual chart updates and plotting

// Example removals:
❌ const chart = createChart(document.getElementById('chart'));
❌ candleSeries.update({ time: bar.time, value: bar });
❌ series.update({ time: latestTime, value: latestValue });
❌ document.getElementById('resolution').addEventListener(...)
```

#### What to Modify
```javascript
// Configuration input (instead of DOM/URL)
const config = {
  contractSymbol: 'MNQ',
  resolution: '15',
  chartType: 'candlestick',
  strategyId: 'strategy-123',
  indicators: {
    'SMA': { period: 20 },
    'RSI': { period: 14 }
  }
};

// Replace DOM-based resolution changes
const changeResolution = (newResolution) => {
  currentResolution = newResolution;
  // Keep all data processing logic identical
  currentTicksPerBar = getTicksPerBar(newResolution);
  // ... rest of logic unchanged
};
```

### Step 2: Configuration Interface
**File**: `src/realtime/strategy-config.js`

```javascript
class StrategyConfig {
  constructor(config) {
    this.contractSymbol = config.contractSymbol;
    this.resolution = config.resolution;
    this.chartType = config.chartType;
    this.strategyId = config.strategyId;
    this.indicators = config.indicators || {};
  }

  validate() {
    // Validate configuration parameters
  }
}
```

### Step 3: Backend Integration
**File**: `trading-backend/simple-backend.js` (add endpoints)

```javascript
// New endpoints to add:
app.post('/api/strategies/start-headless', async (req, res) => {
  // Start headless strategy runner
  // Spawn new process or manage in current process
});

app.post('/api/strategies/stop-headless/:strategyId', async (req, res) => {
  // Stop specific headless strategy
});

app.get('/api/strategies/status-headless', async (req, res) => {
  // Get status of all running headless strategies
});
```

### Step 4: Process Management
**File**: `src/realtime/process-manager.js`

```javascript
class HeadlessStrategyManager {
  constructor() {
    this.runningStrategies = new Map();
  }

  async startStrategy(config) {
    // Create new headless runner instance
    // Track running strategies
  }

  async stopStrategy(strategyId) {
    // Clean shutdown of strategy
  }

  getStatus() {
    // Return status of all running strategies
  }
}
```

## Critical Implementation Details

### Data Processing (Keep Identical)
```javascript
// This logic MUST remain exactly the same:
const updateIndicators = (newBarData, isNewRenkoBrick = false) => {
  // Always update historicalData (source of truth)
  if (newBarData) {
    const existingIndex = historicalData.findIndex(bar => bar.time === newBarData.time);
    if (existingIndex !== -1) {
      historicalData[existingIndex] = newBarData;
    } else {
      historicalData.push(newBarData);
    }
  }

  // Update Heiken Ashi data if needed
  if (currentChartType === 'heikenashi') {
    const haBar = calculateHeikenAshiBar(
      newBarData,
      heikenAshiData.length > 0 ? heikenAshiData[heikenAshiData.length - 1] : null
    );
    // ... rest identical
  }

  // Only update indicators for Renko when new brick forms
  if (currentChartType === 'renko' && !isNewRenkoBrick) {
    return;
  }

  // Use appropriate data based on chart type
  let dataForIndicator = historicalData;
  if (currentChartType === 'renko' && renkoData.length > 0) {
    dataForIndicator = renkoData;
  } else if (currentChartType === 'heikenashi' && heikenAshiData.length > 0) {
    dataForIndicator = heikenAshiData;
  }

  // Calculate and store indicator values (remove only the series.update() calls)
  activeIndicators.forEach((config, type) => {
    const newValues = calculateIndicator(type, dataForIndicator, config.period);
    // Store values for strategy decisions, remove chart plotting
    activeIndicators.set(type, { period: config.period, values: newValues });
  });
};
```

### Strategy Signal Processing
```javascript
// Enhanced signal output (modify existing checkRealtimeSignal)
const checkRealtimeSignal = (barData) => {
  // Keep existing signal logic
  // Add indicator values to webhook payload
  const currentIndicatorValues = {};
  activeIndicators.forEach((config, type) => {
    const values = config.values;
    if (Array.isArray(values) && values.length > 0) {
      currentIndicatorValues[type] = values[values.length - 1];
    }
  });

  // Enhanced webhook payload
  if (signal) {
    sendPayload(signal.action, currentTicker, currentStrategyId, {
      price: barData.close,
      indicators: currentIndicatorValues,
      chartType: currentChartType,
      resolution: currentResolution,
      timestamp: barData.time
    });
  }
};
```

## File Structure
```
src/realtime/
├── index.js                     # Existing UI version
├── headless-strategy-runner.js  # New headless version
├── strategy-config.js           # Configuration management
├── process-manager.js           # Multiple strategy management
└── shared/
    ├── data-processor.js        # Common data processing (future refactor)
    ├── indicator-engine.js      # Common indicator logic (future refactor)
    └── websocket-client.js      # Common WebSocket logic (future refactor)
```

## Testing Strategy

### Phase 1: Validation
1. **Run Identical Configuration**: Start both UI and headless versions with same symbol/resolution
2. **Compare Indicator Values**: Log indicator calculations from both versions
3. **Verify Signal Timing**: Ensure signals fire at exactly the same times
4. **Test Chart Types**: Validate Renko, Heiken Ashi, and Tick charts work identically

### Phase 2: Performance
1. **Multiple Strategies**: Run 5-10 strategies simultaneously
2. **Resource Usage**: Monitor CPU/memory consumption
3. **Latency Measurement**: Measure signal generation delays
4. **Connection Stability**: Test WebSocket reconnection handling

### Phase 3: Production
1. **Signal Accuracy**: Compare with manual trading decisions
2. **Uptime Monitoring**: Track strategy execution continuity
3. **Error Handling**: Test various failure scenarios

## Benefits of This Approach

### Code Reuse
- **100% Logic Preservation**: All data processing, indicator calculations, and chart type handling remain identical
- **Battle-Tested Code**: Reuses existing proven logic for Renko, Heiken Ashi, and tick charts
- **Minimal Risk**: No changes to complex timing or data transformation logic

### Scalability
- **Multiple Strategies**: Can run dozens of strategies simultaneously
- **Resource Efficient**: No UI overhead, pure data processing
- **Independent Processes**: Strategies can run in isolation

### Maintainability
- **Single Source of Truth**: Indicator logic centralized
- **Easy Updates**: Bug fixes apply to both UI and headless versions
- **Clear Separation**: UI concerns separated from business logic

## Implementation Estimate
- **Time Required**: 1-2 days
- **Lines of Code**:
  - Remove: ~200-300 lines (UI code)
  - Add: ~100-150 lines (configuration, process management)
  - Copy: ~2000+ lines (existing data processing)
- **Risk Level**: Low (primarily removing code, not changing logic)

## Future Enhancements
1. **Performance Optimization**: Share indicator calculations across strategies on same symbol
2. **Database Integration**: Log all signals and indicator values
3. **Strategy Backtesting**: Run strategies on historical data
4. **Risk Management**: Position sizing, stop losses, portfolio management
5. **Multi-Asset Support**: Run strategies across multiple symbols
6. **Cloud Deployment**: Deploy headless runners on cloud infrastructure

## Critical Success Factors
1. **Identical Data Processing**: Must maintain exact same data transformation logic
2. **Timing Preservation**: Indicator updates must fire at identical times as UI version
3. **Configuration Flexibility**: Support all chart types, resolutions, and indicators
4. **Robust Error Handling**: Graceful handling of WebSocket disconnections
5. **Monitoring**: Comprehensive logging and status reporting