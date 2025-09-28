"""
API Configuration Settings
"""
from pydantic import BaseModel
from typing import Optional
import os

class APISettings(BaseModel):
    """API Configuration Settings"""
    # API Settings
    API_TITLE: str = "ProjectX Account API"
    API_DESCRIPTION: str = "API for managing trading accounts across different providers"
    API_VERSION: str = "0.1.0"
    
    # Authentication settings
    USERNAME: str = os.environ.get("PROJECTX_USERNAME", "")
    API_KEY: str = os.environ.get("PROJECTX_API_KEY", "")
    DEFAULT_PROVIDER: str = os.environ.get("PROJECTX_PROVIDER", "topstepx")
    
    # Server settings
    HOST: str = os.environ.get("API_HOST", "0.0.0.0")
    PORT: int = int(os.environ.get("API_PORT", "8000"))
    
    # Token settings
    TOKEN_FILE_PATH: Optional[str] = os.environ.get("TOKEN_FILE_PATH", None)
    AUTO_REFRESH: bool = True
    
    # Cors settings
    CORS_ORIGINS: list = ["*"]
    
# Create settings instance
settings = APISettings() 