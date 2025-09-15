# Real-Time Trading System Usage Guide

This module provides both Node.js command-line tools and browser-based charting applications with dynamic authentication and multi-provider support.

## Installation

First, install the required dependencies:

```bash
cd src/realtime
npm install
```

## Authentication Methods

The script supports multiple authentication methods (in order of priority):

### 1. Command Line Token
```bash
node realTimeBarData.js --token "your_auth_token_here"
```

### 2. Environment Variable
```bash
export AUTH_TOKEN="your_auth_token_here"
node realTimeBarData.js
```

### 3. Stored Credentials
If you're running this in a browser environment with localStorage, the script will automatically try to use stored credentials from the main authentication system.

## Usage Examples

### Basic Usage
```bash
# Use default settings (TopStepX, F.US.MNQ, 100T)
node realTimeBarData.js --token "your_token"

# Specify symbol and resolution
node realTimeBarData.js --token "your_token" --symbol F.US.NQ --resolution 500T

# Use different provider
node realTimeBarData.js --token "your_token" --provider alphaticks

# Using environment variable
AUTH_TOKEN="your_token" node realTimeBarData.js --provider blueguardian --symbol F.US.ES --resolution 1
```

### Advanced Examples
```bash
# Stream multiple symbols (run multiple instances)
AUTH_TOKEN="token" node realTimeBarData.js --symbol F.US.MNQ --resolution 100T &
AUTH_TOKEN="token" node realTimeBarData.js --symbol F.US.NQ --resolution 500T &
AUTH_TOKEN="token" node realTimeBarData.js --symbol F.US.ES --resolution 1 &

# Test different providers
node realTimeBarData.js --token "token" --provider topstepx --symbol F.US.MNQ
node realTimeBarData.js --token "token" --provider alphaticks --symbol F.US.MNQ
node realTimeBarData.js --token "token" --provider blueguardian --symbol F.US.MNQ
```

## Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--token` | `-t` | Authentication token | Required* |
| `--provider` | `-p` | Trading provider (topstepx, alphaticks, blueguardian) | topstepx |
| `--symbol` | `-s` | Trading symbol | F.US.MNQ |
| `--resolution` | `-r` | Bar resolution | 100T |
| `--help` | `-h` | Show help information | - |

*Token can also be provided via AUTH_TOKEN environment variable

## Supported Providers

- **topstepx** - TopStepX platform
- **alphaticks** - AlphaTicks platform
- **blueguardian** - Blue Guardian platform

## Resolution Formats

- **Tick-based**: `100T`, `500T`, `1000T`, `5000T`
- **Second-based**: `1S`, `5S`, `10S`, `15S`, `30S`
- **Minute-based**: `1`, `2`, `3`, `5`, `10`, `15`, `30`, `45`, `60`
- **Daily/Weekly**: `1D`, `1W`, `1M`

## Output Format

The script outputs real-time bar data in the following format:

```
📊 RealTimeBar: F.US.MNQ | 100T
Time: 2024-09-11T14:30:00.000Z
O/H/L/C: 18450.25 / 18452.75 / 18449.50 / 18451.00
Volume: 150 | Tick Vol: 25
Closed: true
```

## Error Handling

The script includes comprehensive error handling and will provide helpful troubleshooting information if authentication or connection fails.

## Integration with Main System

When running in a browser environment (like with the React trading app), the script can automatically use stored authentication credentials from localStorage, making it seamlessly integrate with the main authentication system.

## Browser-Based Trading Charts (index.html)

### Overview
The browser-based charting application (`index.html` + `index.js`) provides a complete trading interface with:
- Real-time candlestick, Heiken Ashi, and Renko charts
- Technical indicators (SMA, EMA, RSI, Bollinger Bands, Donchian Channel)
- Trading signals and alerts
- Multiple timeframes and resolutions
- Multi-provider support

### Authentication Methods (Browser)

#### 1. Main Application Integration (Recommended)
When accessed from the main React trading application, authentication is automatic:
```
https://your-app.com/realtime/
```

#### 2. URL Parameters
```
https://your-app.com/realtime/?token=your_auth_token&provider=topstepx
```

#### 3. Saved Credentials
If you've previously logged in and saved credentials, the application will automatically attempt to re-authenticate.

### Provider Selection (Browser)

#### URL Parameter
```
https://your-app.com/realtime/?provider=alphaticks
```

#### Saved Preferences
The application remembers your last used provider from localStorage.

### Features

#### Chart Types
- **Candlestick**: Traditional OHLC bars
- **Heiken Ashi**: Smoothed candlesticks for trend analysis
- **Renko**: Price movement based bricks

#### Technical Indicators
- Simple Moving Average (SMA)
- Exponential Moving Average (EMA)
- Relative Strength Index (RSI)
- Bollinger Bands
- Donchian Channel

#### Trading Signals
- Donchian Channel breakout signals
- Buy/Sell markers on chart
- Real-time signal detection

#### Timeframes
- Tick-based: 100T, 500T, 1000T, 5000T
- Time-based: 1S-30S, 1M-60M, 1D, 1W, 1M

## File Structure

```
src/realtime/
├── README.md              # Module documentation
├── USAGE.md              # This usage guide
├── package.json          # Node.js dependencies
├── providers.js          # Node.js provider config
├── auth.js              # Node.js authentication
├── browser-auth.js      # Browser authentication
├── realTimeBarData.js   # Node.js command-line tool
├── index.html           # Browser trading interface
└── index.js             # Browser application logic
```

## Error Handling

### Authentication Errors
- **Node.js**: Shows help message with authentication options
- **Browser**: Displays overlay with login redirect option

### Connection Errors
- Automatic reconnection attempts
- Status indicators
- Detailed error logging

### Provider Errors
- Fallback to default provider (TopStepX)
- Configuration validation
- Network connectivity checks

## Integration Examples

### React Application Integration
```javascript
// In your React component
const openRealTimeCharts = () => {
  const token = localStorage.getItem('auth_token');
  const provider = localStorage.getItem('provider') || 'topstepx';
  
  // Open in new window/tab
  window.open(`/realtime/index.html?token=${token}&provider=${provider}`);
};
```

### Iframe Integration
```html
<iframe 
  src="/realtime/index.html?token=your_token&provider=topstepx"
  width="100%" 
  height="600px"
  frameborder="0">
</iframe>
```

## Graceful Shutdown

- **Node.js**: Press `Ctrl+C` to gracefully shutdown the connection
- **Browser**: Close tab/window or refresh page
