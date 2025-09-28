"""
Configuration module for root level imports
This module provides backward compatibility for modules importing config directly
"""

from api.config.providers import get_provider_config, PROVIDERS, ProviderConfig, load_user_config, get_user_provider_config, get_user_provider_name

__all__ = ['get_provider_config', 'PROVIDERS', 'ProviderConfig', 'load_user_config', 'get_user_provider_config', 'get_user_provider_name'] 