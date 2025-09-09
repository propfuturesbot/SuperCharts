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