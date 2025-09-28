import httpx
import asyncio
import time
import json
import os
import sys
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import jwt  # pip install PyJWT
import logging

# Add project root to Python path for config imports
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Import config function with fallback
try:
    from config.config import get_provider_config
except ImportError:
    try:
        from api.config.providers import get_provider_config
    except ImportError:
        # Fallback implementation
        def get_provider_config(provider: str):
            return {
                "api_endpoint": "https://backend.topstepx.com" if provider == "topstepx" else "https://api.topsteptrader.com",
                "name": provider
            }

class TokenManager:
    """
    A manager class for handling API authentication tokens.
    
    Features:
    - Provider-based API URL selection
    - Asynchronous token retrieval
    - Token caching to avoid unnecessary API calls
    - Automatic token refresh when expired
    - Token validation and decoding
    - Optional token persistence to file
    """
    
    def __init__(
        self,
        username: Optional[str] = None,
        api_key: Optional[str] = None,
        provider: str = "topstepx",
        token_file: Optional[str] = None,
        auto_refresh: bool = True
    ):
        """
        Initialize the token manager.
        
        Args:
            username: API username
            api_key: API key
            provider: Provider name (default: "topstepx")
            token_file: Path to file for token persistence (optional)
            auto_refresh: Whether to automatically refresh tokens before they expire
        """
        self.username = username
        self.api_key = api_key
        self.provider = provider
        self.provider_config = get_provider_config(provider)
        self.token_file = token_file or self._get_default_token_file(provider)
        self.auto_refresh = auto_refresh
        self.token: Optional[str] = None
        self.token_data: Optional[Dict[str, Any]] = None
        self.expiry_time: Optional[float] = None

    def _get_default_token_file(self, provider: str) -> str:
        """
        Get the default token file path for a provider.
        
        Args:
            provider: Provider name
            
        Returns:
            Path to the default token file for the provider
        """
        # For backward compatibility
        if provider == "topstepx" and os.path.exists("topstep_token.json"):
            return "topstep_token.json"
            
        return f"{provider}_token.json"
        
    async def get_token(self, force_refresh: bool = False) -> str:
        """
        Get a valid JWT token, retrieving a new one if necessary.
        
        Args:
            force_refresh: Force a new token to be retrieved regardless of current state
            
        Returns:
            A valid JWT token string
        """
        # If not forcing a refresh and we have a valid token already, return it
        if not force_refresh and self.token and self.expiry_time and time.time() < self.expiry_time - 300:  # 5-minute buffer
            return self.token
            
        # Try to load from token file
        if not self.token and os.path.exists(self.token_file):
            self._load_token_from_file()
            # Check if loaded token is still valid
            if self.token and self.expiry_time and time.time() < self.expiry_time - 300:
                print(f"Using existing token from {self.token_file}")
                return self.token
            else:
                print(f"Token in {self.token_file} is expired or invalid, fetching new token")
        
        # We need a new token - make sure we have credentials
        if not self.username or not self.api_key:
            raise ValueError("Username and API key must be provided to retrieve a token")
            
        # Get a new token from the API
        await self._fetch_new_token()
        return self.token
        
    async def _fetch_new_token(self) -> None:
        """
        Fetch a new token from the API.
        """
        base_url = self.provider_config["api_endpoint"]
        url = f"{base_url}/api/Auth/loginKey"
        
        headers = {
            "accept": "text/plain",
            "Content-Type": "application/json"
        }
        payload = {
            "userName": self.username,
            "apiKey": self.api_key
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers)
            
            # Check if request was successful
            if response.status_code != 200:
                raise Exception(f"API error ({self.provider}): {response.text}")
            
            # Parse the response
            data = response.json()
            
            # Check if login was successful
            if not data.get("success", False):
                error_message = data.get("errorMessage", "Unknown error")
                raise Exception(f"Authentication failed ({self.provider}): {error_message}")
            
            # Set the token
            self.token = data["token"]
            
            # Decode and store token data
            self._process_token()
            
            # Save to file
            self._save_token_to_file()
            print(f"Saved token to {self.token_file}")
    
    def _process_token(self) -> None:
        """
        Process the JWT token to extract expiry time and other data.
        """
        if not self.token:
            return
            
        # Decode the token without verification to extract data
        # (we're not verifying signature, just extracting data)
        try:
            self.token_data = jwt.decode(self.token, options={"verify_signature": False})
            
            # Extract expiry time
            if "exp" in self.token_data:
                self.expiry_time = self.token_data["exp"]
            else:
                # If no expiry in token, set a default (24 hours from now)
                self.expiry_time = time.time() + 86400
                
        except Exception as e:
            print(f"Warning: Failed to decode token: {e}")
            # Set a default expiry if we can't decode
            self.expiry_time = time.time() + 3600  # 1 hour default
    
    def _save_token_to_file(self) -> None:
        """
        Save the current token and data to a file.
        """
        if not self.token or not self.token_file:
            return
            
        data = {
            "token": self.token,
            "expiry_time": self.expiry_time,
            "retrieved_at": time.time(),
            "provider": self.provider
        }
        
        try:
            with open(self.token_file, 'w') as f:
                json.dump(data, f)
        except Exception as e:
            print(f"Warning: Failed to save token to file: {e}")
    
    def _load_token_from_file(self) -> None:
        """
        Load a token from file.
        """
        if not self.token_file or not os.path.exists(self.token_file):
            return
            
        try:
            with open(self.token_file, 'r') as f:
                data = json.load(f)
                
            self.token = data.get("token")
            self.expiry_time = data.get("expiry_time")
            file_provider = data.get("provider")
            
            # If provider has changed, don't use the token
            if file_provider and file_provider != self.provider:
                self.token = None
                self.expiry_time = None
                print(f"Warning: Token in {self.token_file} is for provider '{file_provider}', but current provider is '{self.provider}'")
                return
                
            # Process token to extract data
            if self.token:
                self._process_token()
                
        except Exception as e:
            print(f"Warning: Failed to load token from file: {e}")
    
    def is_token_valid(self) -> bool:
        """
        Check if the current token is valid and not expired.
        
        Returns:
            True if token is valid, False otherwise
        """
        if not self.token or not self.expiry_time:
            return False
            
        # Check if token is expired (with 5-minute buffer)
        return time.time() < self.expiry_time - 300
    
    def get_token_expiry(self) -> Optional[datetime]:
        """
        Get the token expiry time as a datetime object.
        
        Returns:
            Datetime of token expiry or None if no valid token
        """
        if not self.expiry_time:
            return None
            
        return datetime.fromtimestamp(self.expiry_time)
    
    def time_until_expiry(self) -> Optional[timedelta]:
        """
        Get the time until token expiry.
        
        Returns:
            Timedelta until expiry or None if no valid token
        """
        if not self.expiry_time:
            return None
            
        seconds_remaining = max(0, self.expiry_time - time.time())
        return timedelta(seconds=seconds_remaining)
    
    async def delete_token(self) -> None:
        """
        Delete the current token from memory and file.
        This forces a fresh token to be retrieved on the next get_token() call.
        """
        logger = logging.getLogger(__name__)
        logger.info(f"🗑️  Deleting token for provider: {self.provider}")
        
        # Clear token from memory
        self.token = None
        self.token_data = None
        self.expiry_time = None
        
        # Delete token file if it exists
        if self.token_file and os.path.exists(self.token_file):
            try:
                os.remove(self.token_file)
                logger.info(f"✅ Deleted token file: {self.token_file}")
            except Exception as e:
                logger.warning(f"⚠️  Failed to delete token file {self.token_file}: {e}")
        else:
            logger.info("ℹ️  No token file to delete")
    
    def get_username_from_token(self) -> Optional[str]:
        """
        Extract the username from the token.
        
        Returns:
            Username or None if not available
        """
        if not self.token_data:
            return None
            
        # Common JWT claim for username
        for claim in ["name", "sub", "preferred_username"]:
            if claim in self.token_data:
                return self.token_data[claim]
                
        return None
    
    async def perform_authenticated_request(
        self, 
        method: str, 
        endpoint: str, 
        **kwargs
    ) -> httpx.Response:
        """
        Perform an authenticated request to the API.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path (e.g., "/User/profile")
            **kwargs: Additional arguments to pass to httpx
            
        Returns:
            httpx Response object
        """
        # Get a valid token
        token = await self.get_token()
        
        # Build the full URL
        base_url = self.provider_config["api_endpoint"]
        
        # Add "/api" prefix if endpoint doesn't start with it
        if not endpoint.startswith("/api"):
            endpoint = f"/api{endpoint}" if not endpoint.startswith("/") else f"/api{endpoint}"
            
        url = f"{base_url}{endpoint}"
        
        # Add authorization header
        headers = kwargs.get("headers", {})
        headers["Authorization"] = f"Bearer {token}"
        kwargs["headers"] = headers
        
        # Log request details for debugging
        logger = logging.getLogger(__name__)
        logger.info("📡 TokenManager Request Details:")
        logger.info(f"   Method: {method}")
        logger.info(f"   URL: {url}")
        logger.info(f"   Headers: {dict(headers)}")
        if 'json' in kwargs:
            logger.info(f"   JSON Body: {kwargs['json']}")
        
        # Perform the request
        async with httpx.AsyncClient() as client:
            response = await client.request(method, url, **kwargs)
            
            # If unauthorized and auto_refresh is enabled, try once more with a fresh token
            if response.status_code == 401 and self.auto_refresh:
                token = await self.get_token(force_refresh=True)
                headers["Authorization"] = f"Bearer {token}"
                response = await client.request(method, url, **kwargs)
                
            return response

# For backward compatibility
TopStepTokenManager = TokenManager