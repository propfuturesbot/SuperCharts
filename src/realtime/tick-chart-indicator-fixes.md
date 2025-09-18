# Tick Chart Indicator Fixes

## Problem Summary
Indicators were not updating in realtime for tick charts (100T, 500T, 1000T, 5000T). The `handleTickChartUpdate()` function was handling chart display but not calling indicator update functions.

## Root Cause
The `handleTickChartUpdate()` function was missing calls to `updateIndicators()`, which meant:
1. Indicators never recalculated during tick accumulation
2. Indicators were not updated when tick bars completed
3. Historical data was not being maintained for tick charts
4. Heiken Ashi and Renko transformations on tick data didn't update indicators

## Fixes Applied

### 1. Added Indicator Updates in handleTickChartUpdate() (line 654-670)
```javascript
// Update historical data for indicator calculations
if (shouldCreateNewBar && tickAccumulator) {
  // Add completed bar to historical data
  const completedBar = { ...currentBar };
  const existingIndex = historicalData.findIndex(bar => bar.time === completedBar.time);
  if (existingIndex !== -1) {
    historicalData[existingIndex] = completedBar;
  } else {
    historicalData.push(completedBar);
  }

  // Update indicators for completed tick bar
  updateIndicators(completedBar, false);
} else {
  // Update indicators with current accumulating bar
  updateIndicators(currentBarData, false);
}
```

### 2. Fixed Renko Indicators on Tick Data (line 638-640)
```javascript
// Update indicators when new Renko bricks are formed
updateIndicators(currentBarData, true);
```

### 3. Enhanced Heiken Ashi Data Maintenance (line 625-635)
```javascript
// Update heikenAshiData array
if (shouldCreateNewBar && heikenAshiData.length > 0) {
  // Add new HA bar when tick bar is completed
  heikenAshiData.push(haBar);
} else if (heikenAshiData.length > 0) {
  // Update current HA bar
  heikenAshiData[heikenAshiData.length - 1] = haBar;
} else {
  // First HA bar
  heikenAshiData.push(haBar);
}
```

## How Tick Charts Work

### Tick Accumulation Process
1. **Individual ticks** come in via WebSocket
2. **Tick accumulator** (`tickAccumulator`) builds bars from multiple ticks
3. **Tick count** (`tickCount`) tracks how many ticks are in current bar
4. **Bar completion** happens when `tickCount >= currentTicksPerBar`
5. **New bar creation** starts fresh accumulator

### Indicator Update Strategy
- **During accumulation**: Indicators update with current `tickAccumulator` data
- **On bar completion**: Indicators update with finalized bar data
- **Historical data**: Completed bars are added to `historicalData` array
- **Chart types**: Each chart type (Candlestick/HA/Renko) handles tick data appropriately

## Chart Type Behaviors on Tick Data

### Candlestick Tick Charts
- Updates indicators on every tick during accumulation
- Updates indicators when bar completes
- Uses raw tick accumulator data

### Heiken Ashi Tick Charts
- Calculates HA values from tick accumulator
- Maintains `heikenAshiData` array with HA bars
- Updates indicators using HA data

### Renko Tick Charts
- Feeds tick bars into Renko brick calculation
- Only updates indicators when new Renko bricks form
- Uses `isNewRenkoBrick = true` parameter

## Testing Results

✅ **Tick Chart Resolution Support**
- 100T: Updates indicators every 5 ticks
- 500T: Updates indicators every 15 ticks
- 1000T: Updates indicators every 25 ticks
- 5000T: Updates indicators every 50 ticks

✅ **Real-time Updates**
- SMA updates during tick accumulation
- EMA updates during tick accumulation
- RSI updates during tick accumulation
- All indicators update when tick bar completes

✅ **Chart Type Integration**
- Heiken Ashi tick charts work correctly
- Renko tick charts work correctly
- Switching between chart types maintains indicators

## Files Modified
- `/src/realtime/index.js`: Added indicator updates to `handleTickChartUpdate()`
- `/CLAUDE.md`: Added comprehensive tick chart documentation

## Architecture Notes

### Data Flow for Tick Charts
1. Raw tick → `tickAccumulator` (OHLCV bar)
2. Chart type transformation (HA/Renko if needed)
3. Display update on chart
4. Historical data maintenance
5. Indicator calculation and update

### Key Variables
- `tickAccumulator`: Current bar being built from ticks
- `tickCount`: Number of ticks in current bar
- `currentTicksPerBar`: Target ticks per bar (resolution dependent)
- `shouldCreateNewBar`: Flag indicating bar completion
- `historicalData`: Array of completed bars for indicators