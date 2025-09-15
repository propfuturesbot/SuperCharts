// Real-time WebSocket/SignalR connection service

import { HubConnectionBuilder, HubConnectionState, LogLevel, HttpTransportType } from '@microsoft/signalr';
import authService from '../../../services/auth.service';
import { getProviderConfig } from '../../../config/providers';
import { convertProductIdToSymbol } from '../utils/symbolConverter';
import { processRealtimeBar } from '../utils/dataProcessor';

class RealtimeConnectionService {
  constructor() {
    this.connection = null;
    this.currentSubscription = null;
    this.callbacks = {
      onData: null,
      onConnect: null,
      onDisconnect: null,
      onError: null
    };
  }
  
  /**
   * Initialize real-time connection
   * @param {Object} callbacks - Callback functions for events
   * @returns {Promise<void>}
   */
  async initialize(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };

    try {
      // Get authentication token
      const accessToken = authService.getToken();
      if (!accessToken) {
        console.warn('No authentication token - skipping real-time connection');
        if (this.callbacks.onConnect) {
          this.callbacks.onConnect();
        }
        return; // Skip connection in demo mode
      }

      // Get provider configuration
      const provider = authService.getProvider();
      const providerConfig = getProviderConfig(provider);
      if (!providerConfig || !providerConfig.chartapi_endpoint) {
        console.warn('No provider configuration - skipping real-time connection');
        if (this.callbacks.onConnect) {
          this.callbacks.onConnect();
        }
        return; // Skip connection when no provider config
      }

      // Check if we already have a connected connection
      if (this.connection && this.connection.state === HubConnectionState.Connected) {
        console.log('Already connected to SignalR hub');
        if (this.callbacks.onConnect) {
          this.callbacks.onConnect();
        }
        return;
      }

      // Close existing connection if any
      if (this.connection && this.connection.state !== HubConnectionState.Disconnected) {
        console.log('Closing existing connection...');
        await this.connection.stop();
        this.connection = null;
      }

      // Build SignalR hub URL
      const chartApiUrl = `${providerConfig.chartapi_endpoint}/hubs/chart`;
      console.log('Connecting to SignalR hub:', chartApiUrl);
      console.log('Using provider:', providerConfig.name);

      // Create SignalR connection
      this.connection = new HubConnectionBuilder()
        .withUrl(`${chartApiUrl}?access_token=${accessToken}`, {
          skipNegotiation: true,
          transport: HttpTransportType.WebSockets
        })
        .configureLogging(LogLevel.Information)
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .build();

      // Setup event handlers before starting
      this.setupEventHandlers();

      // Start connection
      await this.connection.start();
      console.log('Connected to SignalR hub successfully');

      if (this.callbacks.onConnect) {
        this.callbacks.onConnect();
      }

    } catch (error) {
      console.error('Failed to setup real-time connection:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      // Don't throw, just log the error
    }
  }
  
  /**
   * Setup SignalR event handlers
   */
  setupEventHandlers() {
    if (!this.connection) return;
    
    // Handle real-time bar data
    this.connection.on("RealTimeBar", (receivedSymbol, receivedResolution, bar) => {
      console.log('RealTimeBar received:', {
        symbol: receivedSymbol,
        resolution: receivedResolution,
        bar: bar,
        currentSubscription: this.currentSubscription
      });

      // Check if this update is for our current subscription
      if (this.currentSubscription && receivedResolution === this.currentSubscription.resolution) {
        // Process and deliver the bar data
        if (this.callbacks.onData) {
          const processedBar = processRealtimeBar(bar);
          console.log('Processed bar:', processedBar);
          if (processedBar) {
            this.callbacks.onData(processedBar, receivedResolution);
          }
        }
      } else {
        console.log('Ignoring bar for different resolution/symbol');
      }
    });
    
    // Handle reconnecting
    this.connection.onreconnecting((error) => {
      console.log('Reconnecting to SignalR...', error);
      if (this.callbacks.onDisconnect) {
        this.callbacks.onDisconnect('Reconnecting...');
      }
    });
    
    // Handle reconnected
    this.connection.onreconnected(async (connectionId) => {
      console.log('Reconnected to SignalR, connection ID:', connectionId);
      
      // Re-subscribe to current subscription
      if (this.currentSubscription) {
        const { symbol, resolution } = this.currentSubscription;
        await this.subscribe(symbol, resolution);
      }
      
      if (this.callbacks.onConnect) {
        this.callbacks.onConnect();
      }
    });
    
    // Handle connection closed
    this.connection.onclose((error) => {
      console.log('SignalR connection closed', error);
      if (this.callbacks.onDisconnect) {
        this.callbacks.onDisconnect('Disconnected');
      }
    });
  }
  
  /**
   * Subscribe to a symbol and resolution
   * @param {string} productId - Product ID or symbol
   * @param {string} resolution - Resolution/timeframe
   * @returns {Promise<void>}
   */
  async subscribe(productId, resolution) {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
      console.warn('Not connected to real-time service, skipping subscription');
      return;
    }

    try {
      // Get the correct symbol for subscription
      // Based on the working example in index.js, we need to use the exact product format
      let symbolToSubscribe = productId;

      // If productId is in the format "F.US.XX", check if we need to add micro prefix
      if (productId.startsWith('F.US.')) {
        const baseSymbol = productId.replace('F.US.', '');

        // Common equity index futures that have micro contracts
        // These are the most common ones that need the 'M' prefix
        const microContracts = {
          'NQ': 'MNQ',   // Nasdaq -> Micro Nasdaq
          'ES': 'MES',   // S&P 500 -> Micro S&P
          'YM': 'MYM',   // Dow -> Micro Dow
          'RTY': 'M2K',  // Russell -> Micro Russell
        };

        // Check if this is a contract that needs the micro prefix
        if (microContracts[baseSymbol]) {
          symbolToSubscribe = `F.US.${microContracts[baseSymbol]}`;
          console.log(`Using micro contract: ${productId} -> ${symbolToSubscribe}`);
        }
      }

      console.log('Subscribe request:', { productId, symbolToSubscribe, resolution });

      // Check if already subscribed to same symbol/resolution
      if (this.currentSubscription &&
          this.currentSubscription.symbol === symbolToSubscribe &&
          this.currentSubscription.resolution === resolution) {
        console.log(`Already subscribed to ${symbolToSubscribe} ${resolution}`);
        return;
      }

      // Unsubscribe from previous subscription if any
      if (this.currentSubscription) {
        await this.unsubscribe();
      }

      // Subscribe to new symbol/resolution
      await this.connection.invoke("SubscribeBars", symbolToSubscribe, resolution);
      console.log(`Subscribed to ${symbolToSubscribe} ${resolution}`);

      this.currentSubscription = {
        symbol: symbolToSubscribe,
        resolution,
        productId
      };

    } catch (error) {
      console.error('Failed to subscribe:', error);
      // Don't throw, just log the error
    }
  }
  
  /**
   * Unsubscribe from current subscription
   * @returns {Promise<void>}
   */
  async unsubscribe() {
    if (!this.connection || !this.currentSubscription) return;
    
    try {
      const { symbol, resolution } = this.currentSubscription;
      await this.connection.invoke("UnsubscribeBars", symbol, resolution);
      console.log(`Unsubscribed from ${symbol} ${resolution}`);
      this.currentSubscription = null;
    } catch (error) {
      console.warn('Error unsubscribing:', error);
    }
  }
  
  /**
   * Stop the real-time connection
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.connection) {
      try {
        // Only unsubscribe if connected
        if (this.connection.state === HubConnectionState.Connected) {
          await this.unsubscribe();
        }

        // Only stop if not already disconnected
        if (this.connection.state !== HubConnectionState.Disconnected) {
          await this.connection.stop();
          console.log('Real-time connection stopped');
        }
      } catch (error) {
        console.warn('Error stopping connection:', error);
      }
      this.connection = null;
      this.currentSubscription = null;
    }
  }
  
  /**
   * Get connection state
   * @returns {string} Connection state
   */
  getState() {
    if (!this.connection) return 'Disconnected';
    
    switch (this.connection.state) {
      case HubConnectionState.Connected:
        return 'Connected';
      case HubConnectionState.Connecting:
        return 'Connecting';
      case HubConnectionState.Reconnecting:
        return 'Reconnecting';
      case HubConnectionState.Disconnected:
        return 'Disconnected';
      case HubConnectionState.Disconnecting:
        return 'Disconnecting';
      default:
        return 'Unknown';
    }
  }
  
  /**
   * Check if connected
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.connection && 
           this.connection.state === HubConnectionState.Connected;
  }
}

// Export singleton instance
export default new RealtimeConnectionService();