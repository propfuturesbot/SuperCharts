// Browser-compatible provider configuration
// This file provides the same provider configurations as providers.js but for browser use

(function(window) {
  'use strict';

  // Provider configurations - single source of truth
  const PROVIDERS = {
    topstepx: {
      name: 'TopStepX',
      api_endpoint: 'https://api.topstepx.com',
      userapi_endpoint: 'https://userapi.topstepx.com',
      websocket_endpoint: 'wss://api.topstepx.com/signalr',
      user_hub: 'https://rtc.topstepx.com/hubs/user',
      market_hub: 'https://rtc.topstepx.com/hubs/market',
      websocket_chartapi: 'wss://chartapi.topstepx.com/hubs',
      chartapi_endpoint: 'https://chartapi.topstepx.com'
    },
    alphaticks: {
      name: 'AlphaTicks',
      api_endpoint: 'https://api.alphaticks.projectx.com',
      userapi_endpoint: 'https://userapi.alphaticks.projectx.com',
      websocket_endpoint: 'wss://api.alphaticks.projectx.com/signalr',
      user_hub: 'https://rtc.alphaticks.projectx.com/hubs/user',
      market_hub: 'https://rtc.alphaticks.projectx.com/hubs/market',
      websocket_chartapi: 'wss://chartapi.alphaticks.projectx.com/hubs',
      chartapi_endpoint: 'https://chartapi.alphaticks.projectx.com'
    },
    blueguardian: {
      name: 'Blue Guardian',
      api_endpoint: 'https://api.blueguardianfutures.projectx.com',
      userapi_endpoint: 'https://userapi.blueguardianfutures.projectx.com',
      websocket_endpoint: 'wss://api.blueguardianfutures.projectx.com/signalr',
      user_hub: 'https://rtc.blueguardianfutures.projectx.com/hubs/user',
      market_hub: 'https://rtc.blueguardianfutures.projectx.com/hubs/market',
      websocket_chartapi: 'wss://chartapi.blueguardianfutures.projectx.com/hubs',
      chartapi_endpoint: 'https://chartapi.blueguardianfutures.projectx.com'
    },
    thefuturesdesk: {
      name: 'The Futures Desk',
      api_endpoint: 'https://api.thefuturesdesk.projectx.com',
      userapi_endpoint: 'https://userapi.thefuturesdesk.projectx.com',
      websocket_endpoint: 'wss://api.thefuturesdesk.projectx.com/signalr',
      user_hub: 'https://rtc.thefuturesdesk.projectx.com/hubs/user',
      market_hub: 'https://rtc.thefuturesdesk.projectx.com/hubs/market',
      websocket_chartapi: 'wss://chartapi.thefuturesdesk.projectx.com/hubs',
      chartapi_endpoint: 'https://chartapi.thefuturesdesk.projectx.com'
    }
  };

  // Function to get provider configuration
  function getProviderConfig(providerKey) {
    return PROVIDERS[providerKey] || PROVIDERS.topstepx;
  }

  // Function to get all providers
  function getProviders() {
    return PROVIDERS;
  }

  // Export to window object for browser use
  window.ProviderConfig = {
    PROVIDERS: PROVIDERS,
    getProviderConfig: getProviderConfig,
    getProviders: getProviders
  };

})(window);