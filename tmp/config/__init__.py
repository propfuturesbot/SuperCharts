"""
Configuration package for the API
"""

import sys
from pathlib import Path

# Add parent directory to path to import from api/config.py
sys.path.append(str(Path(__file__).parent.parent))

# Import settings from the local settings.py file
from .settings import settings

# Import provider configuration functions
from .providers import get_provider_config, PROVIDERS, ProviderConfig

__all__ = ['settings', 'get_provider_config', 'PROVIDERS', 'ProviderConfig'] 