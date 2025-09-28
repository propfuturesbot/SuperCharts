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

const getProviderConfig = (providerKey) => {
  return PROVIDERS[providerKey] || PROVIDERS.thefuturesdesk;
};

module.exports = {
  PROVIDERS,
  getProviderConfig
};