# Indicator Fixes Test Plan

## Fixed Issues

### 1. SMA Calculation for Renko Charts
**Problem**: Indicators were being calculated on original candlestick data instead of Renko brick data
**Solution**: Modified `addIndicator()`, `displayIndicator()`, and `updateIndicators()` to use appropriate data based on chart type

### 2. Realtime Updates for All Chart Types
**Problem**: Indicators were updating on every tick for Renko, causing distortion
**Solution**: Added `isNewRenkoBrick` parameter to only update indicators when new bricks are formed

### 3. Chart Type Switching
**Problem**: Indicators weren't recalculated when switching between chart types
**Solution**: Modified `changeChartType()` to recalculate indicators using appropriate data

### 4. Renko Brick Size Changes
**Problem**: Indicators weren't recalculated when changing brick size
**Solution**: Added indicator recalculation in `updateRenkoBrickSize()`

## Test Steps

### Test 1: SMA on Renko Chart (Historical Data)
1. Load the chart application
2. Switch to Renko chart type
3. Add SMA indicator with period 14
4. **Expected**: SMA line should be smooth and follow the Renko bricks properly

### Test 2: SMA Realtime Updates on Renko
1. With Renko chart and SMA active
2. Wait for realtime data to stream in
3. **Expected**: SMA should only update when new Renko bricks form, not on every tick

### Test 3: Chart Type Switching
1. Add SMA to candlestick chart
2. Switch to Renko chart
3. **Expected**: SMA should recalculate and display correctly for Renko data
4. Switch to Heiken Ashi
5. **Expected**: SMA should recalculate for Heiken Ashi data

### Test 4: Renko Brick Size Change
1. On Renko chart with SMA active
2. Change brick size from 10 to 20
3. **Expected**: Chart should update with new bricks and SMA should recalculate

### Test 5: Multiple Indicators on Renko
1. Add SMA, EMA, and RSI to Renko chart
2. **Expected**: All indicators should calculate based on Renko data
3. Wait for realtime updates
4. **Expected**: All indicators should update only on new brick formation

## Code Changes Summary

1. **addIndicator()**: Now uses `renkoData` when chart type is 'renko'
2. **displayIndicator()**: Uses appropriate data for time alignment
3. **updateIndicators()**:
   - Added `isNewRenkoBrick` parameter
   - Only updates on new brick for Renko charts
   - Uses appropriate data based on chart type
4. **changeChartType()**: Recalculates indicators with correct data
5. **updateRenkoBrickSize()**: Recalculates indicators after brick size change
6. **handleWebSocketMessage()**: Passes `isNewRenkoBrick` flag to updateIndicators()

## Verification Points

- ✅ SMA line follows Renko bricks smoothly
- ✅ No erratic jumps in indicator values
- ✅ Indicators update only on new brick formation for Renko
- ✅ Indicators recalculate correctly on chart type switch
- ✅ Indicators recalculate on brick size change
- ✅ All indicator types (SMA, EMA, RSI, BB, DC) work correctly with Renko