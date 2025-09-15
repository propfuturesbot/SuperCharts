# Real-Time Data Module

This module contains utilities and scripts for handling real-time market data feeds and WebSocket connections.

## Structure

- `providers.ts` - Provider configuration for different trading platforms
- `auth.ts` - Authentication utilities for real-time connections
- `barData.ts` - Real-time bar data handler with SignalR integration
- `connection.ts` - WebSocket connection management utilities

## Features

- **Multi-Provider Support**: Configurable endpoints for different trading platforms (TopStepX, AlphaTicks, Blue Guardian)
- **Authentication Integration**: Seamless integration with the main authentication system
- **Real-Time Bar Data**: Live market data streaming with SignalR
- **Connection Management**: Robust WebSocket connection handling with auto-reconnect

## Usage

### Basic Real-Time Bar Data

```typescript
import { RealTimeBarData } from './barData';
import { getAuthToken } from './auth';

const token = await getAuthToken();
const barData = new RealTimeBarData('topstepx', token);
await barData.connect();
await barData.subscribeToBars('F.US.MNQ', '100T');
```

### Custom Provider

```typescript
import { getProviderConfig } from './providers';

const config = getProviderConfig('alphaticks');
// Use custom provider configuration
```

## Dependencies

- `@microsoft/signalr` - For WebSocket connections
- Node.js compatible authentication system

## Security

- Never hard-code authentication tokens
- Use environment variables for sensitive configuration
- Implement proper token refresh mechanisms

