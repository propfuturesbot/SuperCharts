from typing import Dict, TypedDict, Optional
import json
import os

class ProviderConfig(TypedDict):
    api_endpoint: str
    userapi_endpoint: str
    websocket_endpoint: str
    user_hub: str
    market_hub: str
    websocket_chartapi: Optional[str]
    chartapi_endpoint: str

def load_providers_config() -> Dict[str, ProviderConfig]:
    """
    Load provider configurations from the shared JSON file.
    
    Returns:
        Dict[str, ProviderConfig]: Dictionary of provider configurations
    """
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        providers_file = os.path.join(current_dir, "providers.json")
        
        with open(providers_file, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading providers config: {e}")
        # Fallback to topstepx only
        return {
            "topstepx": {
                "api_endpoint": "https://api.topstepx.com",
                "userapi_endpoint": "https://userapi.topstepx.com",
                "websocket_endpoint": "wss://api.topstepx.com/signalr",
                "user_hub": "https://rtc.topstepx.com/hubs/user",
                "market_hub": "https://rtc.topstepx.com/hubs/market",
                "websocket_chartapi": "wss://chartapi.topstepx.com/hubs",
                "chartapi_endpoint": "https://chartapi.topstepx.com"
            }
        }

# Load providers from JSON file
PROVIDERS: Dict[str, ProviderConfig] = load_providers_config()

def get_provider_config(provider_name: str) -> ProviderConfig:
    """
    Get the configuration for a specific provider.
    
    Args:
        provider_name (str): The name of the provider (case-insensitive)
        
    Returns:
        ProviderConfig: The configuration for the specified provider
        
    Raises:
        ValueError: If the provider is not found
    """
    provider_name = provider_name.lower()
    if provider_name not in PROVIDERS:
        raise ValueError(f"Provider '{provider_name}' not found. Available providers: {', '.join(PROVIDERS.keys())}")
    return PROVIDERS[provider_name]

def load_user_config() -> Dict:
    """
    Load user configuration from user_config.json file.
    
    Returns:
        Dict: User configuration data, empty dict if file doesn't exist or error occurs
    """
    try:
        # Get the project root directory
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(current_dir))
        config_file = os.path.join(project_root, "config", "user_config.json")
        
        if os.path.exists(config_file):
            with open(config_file, 'r') as f:
                return json.load(f)
        return {}
    except Exception as e:
        print(f"Error loading user config: {e}")
        return {}

def get_user_provider_config() -> ProviderConfig:
    """
    Get provider configuration from user_config.json.
    Falls back to topstepx if no provider specified or config not found.
    
    Returns:
        ProviderConfig: The provider configuration for the user's selected provider
    """
    user_config = load_user_config()
    provider = user_config.get("provider", "topstepx")
    return get_provider_config(provider)

def get_user_provider_name() -> str:
    """
    Get the provider name from user_config.json.
    Falls back to topstepx if no provider specified or config not found.
    
    Returns:
        str: The provider name
    """
    user_config = load_user_config()
    return user_config.get("provider", "topstepx") 