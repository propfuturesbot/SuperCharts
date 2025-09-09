# Backend Architecture Plan for IndicatorTS Streaming Service

## Overview
A Node.js backend service that computes technical indicators in real-time using streaming data from Project X/Topstack X providers via SignalR, and redistributes computed indicators to connected clients.

## Architecture Benefits
✅ **Real-time Processing**: Leverage SignalR for bi-directional real-time communication
✅ **Provider Integration**: Seamless integration with Project X/Topstack X data feeds
✅ **Scalable Computation**: Server-side indicator calculations with caching
✅ **Multi-client Support**: Broadcast computed indicators to multiple clients
✅ **Historical & Live Data**: Handle both streaming and historical data from providers

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Data Providers                          │
│         (Project X / Topstack X via SignalR)               │
└────────────────────┬────────────────────────────────────────┘
                     │ Raw Market Data
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Node.js Backend Service                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            SignalR Client (Data Ingestion)           │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                       │
│  ┌──────────────────▼───────────────────────────────────┐  │
│  │           Indicator Computation Engine               │  │
│  │              (Using IndicatorTS)                     │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                       │
│  ┌──────────────────▼───────────────────────────────────┐  │
│  │            SignalR Hub (Distribution)                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────┬────────────────────────────────────────┘
                     │ Computed Indicators
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                      │
│              (Web, Mobile, Desktop via SignalR)            │
└─────────────────────────────────────────────────────────────┘
```

## Proposed Folder Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── index.ts                   # Configuration management
│   │   ├── signalr.ts                 # SignalR configuration
│   │   └── providers.ts               # Provider configurations
│   │
│   ├── providers/
│   │   ├── IDataProvider.ts           # Provider interface
│   │   ├── ProjectXProvider.ts        # Project X integration
│   │   ├── TopstackXProvider.ts       # Topstack X integration
│   │   └── ProviderManager.ts         # Manages multiple providers
│   │
│   ├── hubs/
│   │   ├── IndicatorHub.ts            # Main SignalR hub for clients
│   │   ├── AdminHub.ts                # Administrative controls
│   │   └── MonitoringHub.ts           # System monitoring
│   │
│   ├── services/
│   │   ├── SignalRClientService.ts    # Connects to provider SignalR
│   │   ├── IndicatorComputeService.ts # Computes indicators
│   │   ├── DataBufferService.ts       # Manages sliding windows
│   │   ├── CacheService.ts            # Redis caching
│   │   ├── SubscriptionService.ts     # Client subscription management
│   │   └── HistoricalDataService.ts   # Historical data handling
│   │
│   ├── processors/
│   │   ├── StreamProcessor.ts         # Processes streaming data
│   │   ├── IndicatorProcessor.ts      # Indicator computation logic
│   │   └── BatchProcessor.ts          # Batch processing for efficiency
│   │
│   ├── models/
│   │   ├── MarketData.ts              # Market data types
│   │   ├── IndicatorConfig.ts         # Indicator configurations
│   │   ├── Subscription.ts            # Subscription models
│   │   └── ComputedIndicator.ts       # Computed indicator results
│   │
│   ├── workers/
│   │   ├── IndicatorWorker.ts         # Worker threads for computation
│   │   └── DataAggregator.ts          # Aggregates data from providers
│   │
│   ├── utils/
│   │   ├── SlidingWindow.ts           # Sliding window implementation
│   │   ├── CircularBuffer.ts          # Efficient buffer for streaming
│   │   ├── Logger.ts                  # Logging utility
│   │   └── Metrics.ts                 # Performance metrics
│   │
│   └── app.ts                          # Application entry point
│
├── tests/
├── docker/
├── package.json
└── tsconfig.json
```

## Core Components

### 1. Provider Integration Layer

```typescript
interface IDataProvider {
  // Connect to provider's SignalR hub
  connect(config: ProviderConfig): Promise<void>
  
  // Subscribe to real-time market data
  subscribeToSymbols(symbols: string[]): void
  
  // Fetch historical data
  getHistoricalData(symbol: string, from: Date, to: Date): Promise<MarketData[]>
  
  // Handle incoming streaming data
  onData(callback: (data: MarketData) => void): void
  
  // Disconnect from provider
  disconnect(): Promise<void>
}

class ProjectXProvider implements IDataProvider {
  private hubConnection: signalR.HubConnection
  
  async connect(config: ProviderConfig) {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(config.hubUrl)
      .withAutomaticReconnect()
      .build()
    
    // Set up event handlers for Project X specific events
    this.hubConnection.on("MarketData", this.handleMarketData)
    this.hubConnection.on("TradeUpdate", this.handleTradeUpdate)
  }
}
```

### 2. SignalR Hub Architecture

```typescript
// Main hub for distributing computed indicators to clients
class IndicatorHub {
  // Client subscribes to specific indicators
  async Subscribe(connectionId: string, request: {
    symbols: string[]
    indicators: IndicatorConfig[]
    interval?: string
  }) {
    // Add to subscription manager
    await subscriptionService.addSubscription(connectionId, request)
    
    // Start computing if not already running
    await indicatorService.startComputation(request)
  }
  
  // Broadcast computed indicators to subscribed clients
  async BroadcastIndicators(symbol: string, indicators: ComputedIndicator[]) {
    const subscribers = await subscriptionService.getSubscribers(symbol)
    
    for (const sub of subscribers) {
      await this.Clients.Client(sub.connectionId).SendAsync(
        "IndicatorUpdate",
        { symbol, indicators, timestamp: Date.now() }
      )
    }
  }
}
```

### 3. Data Flow Pipeline

```typescript
class StreamProcessor {
  private buffers: Map<string, CircularBuffer> = new Map()
  
  // Process incoming market data from providers
  async processMarketData(data: MarketData) {
    // Update buffer for the symbol
    const buffer = this.getOrCreateBuffer(data.symbol)
    buffer.add(data)
    
    // Get active subscriptions for this symbol
    const subscriptions = await subscriptionService.getBySymbol(data.symbol)
    
    // Compute indicators for each subscription
    for (const sub of subscriptions) {
      const computed = await this.computeIndicators(
        buffer.toArray(),
        sub.indicators
      )
      
      // Distribute via SignalR hub
      await indicatorHub.BroadcastIndicators(data.symbol, computed)
    }
  }
  
  private async computeIndicators(
    data: MarketData[],
    configs: IndicatorConfig[]
  ): Promise<ComputedIndicator[]> {
    // Use worker threads for heavy computation
    return await indicatorWorker.compute(data, configs)
  }
}
```

### 4. Indicator Computation Service

```typescript
class IndicatorComputeService {
  // Compute single indicator
  compute(
    type: string,
    data: number[],
    params?: any
  ): number | number[] {
    switch(type) {
      case 'SMA':
        return sma(data, params.period)
      case 'RSI':
        return rsi(data, params.period)
      case 'MACD':
        return macd(data, params.fast, params.slow, params.signal)
      // ... other indicators
    }
  }
  
  // Batch compute for efficiency
  computeBatch(
    data: MarketData[],
    configs: IndicatorConfig[]
  ): ComputedIndicator[] {
    const prices = data.map(d => d.close)
    const highs = data.map(d => d.high)
    const lows = data.map(d => d.low)
    const volumes = data.map(d => d.volume)
    
    return configs.map(config => {
      const value = this.compute(
        config.type,
        this.selectDataSeries(config, { prices, highs, lows, volumes }),
        config.params
      )
      
      return {
        type: config.type,
        value,
        timestamp: Date.now()
      }
    })
  }
}
```

### 5. Sliding Window Management

```typescript
class SlidingWindow<T> {
  private buffer: T[]
  private maxSize: number
  
  constructor(size: number) {
    this.maxSize = size
    this.buffer = []
  }
  
  add(item: T): void {
    this.buffer.push(item)
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift() // Remove oldest
    }
  }
  
  getWindow(): T[] {
    return [...this.buffer]
  }
  
  isFull(): boolean {
    return this.buffer.length === this.maxSize
  }
}

class DataBufferService {
  private windows = new Map<string, SlidingWindow<MarketData>>()
  
  updateBuffer(symbol: string, data: MarketData): void {
    if (!this.windows.has(symbol)) {
      // Default window size based on longest indicator period
      this.windows.set(symbol, new SlidingWindow(500))
    }
    
    this.windows.get(symbol).add(data)
  }
  
  getBufferData(symbol: string): MarketData[] {
    return this.windows.get(symbol)?.getWindow() || []
  }
}
```

## Implementation Phases

### Phase 1: Provider Integration (Week 1)
- [ ] Set up SignalR client for Node.js
- [ ] Implement IDataProvider interface
- [ ] Create Project X provider adapter
- [ ] Create Topstack X provider adapter
- [ ] Test connection and data reception

### Phase 2: Core Infrastructure (Week 1-2)
- [ ] Set up TypeScript Node.js project
- [ ] Configure SignalR hub for clients
- [ ] Implement subscription management
- [ ] Set up Redis for caching
- [ ] Create data models

### Phase 3: Indicator Processing (Week 2-3)
- [ ] Integrate IndicatorTS library
- [ ] Build sliding window buffers
- [ ] Implement stream processor
- [ ] Add worker threads for computation
- [ ] Create caching strategy

### Phase 4: Client Distribution (Week 3-4)
- [ ] Implement SignalR hub methods
- [ ] Build client subscription logic
- [ ] Create broadcast mechanisms
- [ ] Add error handling and reconnection
- [ ] Implement backpressure handling

### Phase 5: Optimization & Testing (Week 4-5)
- [ ] Performance profiling
- [ ] Load testing with multiple clients
- [ ] Memory leak detection
- [ ] Integration tests
- [ ] Documentation

## Technology Stack

### Core
- **Node.js** + **TypeScript**: Runtime and type safety
- **@microsoft/signalr**: SignalR client and server
- **Redis**: Caching and state management
- **IndicatorTS**: Technical indicator library

### Data Processing
- **Worker Threads**: Parallel indicator computation
- **RxJS**: Stream processing
- **Node-cache**: In-memory caching as Redis alternative

### Monitoring
- **Winston**: Structured logging
- **Prometheus**: Metrics collection
- **Health checks**: Service monitoring

## Performance Optimizations

### Computation Strategy
1. **Incremental Calculation**: Only compute new values as data arrives
2. **Sliding Windows**: Maintain fixed-size buffers per symbol
3. **Worker Pool**: Distribute computation across worker threads
4. **Batch Processing**: Group calculations for efficiency
5. **Caching**: Store recent computations in Redis

### Memory Management
```typescript
class MemoryManager {
  private readonly MAX_BUFFER_SIZE = 1000
  private readonly MAX_SYMBOLS = 100
  
  pruneOldData(): void {
    // Remove inactive symbol buffers
    // Clear old cache entries
    // Garbage collect worker threads
  }
}
```

## Client Connection Example

```typescript
// Client-side SignalR connection
const connection = new signalR.HubConnectionBuilder()
  .withUrl("http://localhost:5000/indicatorHub")
  .withAutomaticReconnect()
  .build()

// Subscribe to indicators
await connection.invoke("Subscribe", {
  symbols: ["AAPL", "GOOGL"],
  indicators: [
    { type: "SMA", params: { period: 20 } },
    { type: "RSI", params: { period: 14 } },
    { type: "MACD", params: { fast: 12, slow: 26, signal: 9 } }
  ]
})

// Receive computed indicators
connection.on("IndicatorUpdate", (data) => {
  console.log(`Symbol: ${data.symbol}`)
  data.indicators.forEach(ind => {
    console.log(`${ind.type}: ${ind.value}`)
  })
})
```

## Deployment Considerations

### Docker Configuration
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 5000
CMD ["node", "dist/app.js"]
```

### Environment Variables
```env
# Provider Configuration
PROJECTX_HUB_URL=wss://projectx.example.com/hub
PROJECTX_API_KEY=xxx
TOPSTACKX_HUB_URL=wss://topstackx.example.com/hub
TOPSTACKX_API_KEY=xxx

# Redis
REDIS_URL=redis://localhost:6379

# SignalR
SIGNALR_PORT=5000
SIGNALR_PATH=/indicatorHub

# Performance
MAX_WORKER_THREADS=4
BUFFER_SIZE=1000
CACHE_TTL=300
```

## Next Steps
1. Wait for Project X/Topstack X documentation and files
2. Review provider-specific data formats and APIs
3. Set up development environment
4. Implement provider adapters first
5. Build core streaming infrastructure