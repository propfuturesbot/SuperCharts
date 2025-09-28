"""
API Dependencies
"""
import sys
import os
import json
from typing import Dict, Annotated, Optional, Any
from fastapi import Depends, Request, Cookie, HTTPException, status
from fastapi.responses import RedirectResponse

# Add parent directory to path to import modules
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from src.managers.token_manager import TokenManager
from src.managers.account_manager import AccountManager
from src.managers.contract_manager import ContractManager
from src.managers.position_manager import PositionManager
from src.managers.order_manager import OrderManager
from api.config import settings

# Path to the user configuration file
USER_CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config", "user_config.json")

# Store token managers by provider to avoid creating new instances
token_managers: Dict[str, Dict[str, TokenManager]] = {}

# Cache for contracts and accounts to improve performance
contract_cache: Dict[str, str] = {}  # symbol -> contract_id mapping
account_cache: Dict[str, int] = {}  # account_name -> account_id mapping

# User credentials storage (in-memory for this implementation)
# In a production environment, this would use a more secure storage method
user_credentials: Dict[str, Dict[str, str]] = {}

def load_config_from_file():
    """Load user configuration from file"""
    try:
        if os.path.exists(USER_CONFIG_FILE):
            with open(USER_CONFIG_FILE, 'r') as f:
                config = json.load(f)
            return config
        return {}
    except Exception as e:
        print(f"Error loading config from file: {str(e)}")
        return {}

async def get_user_credentials(request: Request) -> tuple:
    """
    Get user credentials either from config file, cookies, session, or default settings.
    
    Args:
        request: FastAPI request object
        
    Returns:
        Tuple of (username, api_key, provider)
    """
    # Try to get from config file first
    file_config = load_config_from_file()
    if file_config and "username" in file_config and "api_key" in file_config:
        return file_config.get("username"), file_config.get("api_key"), file_config.get("provider", settings.DEFAULT_PROVIDER)
    
    # If not in file and request is available, try to get from cookies
    username = None
    api_key = None
    provider = settings.DEFAULT_PROVIDER
    
    if request is not None:
        username = request.cookies.get("user_name")
        api_key = request.cookies.get("api_key")
        provider = request.cookies.get("provider", settings.DEFAULT_PROVIDER)
    
    # If not in cookies or request is None, use default values
    if not username or not api_key:
        username = settings.USERNAME
        api_key = settings.API_KEY
    
    # Check if credentials are set at all
    if not username or not api_key:
        return "", "", provider
    
    return username, api_key, provider

async def require_authentication(request: Request) -> tuple:
    """
    Require user authentication. Raises HTTPException if not authenticated.
    
    Args:
        request: FastAPI request object
        
    Returns:
        Tuple of (username, api_key, provider)
        
    Raises:
        HTTPException: If user is not authenticated
    """
    username, api_key, provider = await get_user_credentials(request)
    
    if not username or not api_key:
        # For API endpoints, return 401
        if request.url.path.startswith("/api/"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Please login first."
            )
        # For page routes, redirect to login
        else:
            raise HTTPException(
                status_code=status.HTTP_302_FOUND,
                detail="Redirect to login",
                headers={"Location": "/login"}
            )
    
    return username, api_key, provider

async def get_token_manager(request: Request = None) -> TokenManager:
    """
    Get or create a TokenManager instance for the user and provider.
    
    Args:
        request: FastAPI request object
        
    Returns:
        TokenManager instance
    """
    # Get user credentials
    username, api_key, provider = await get_user_credentials(request)
    
    # Create credential key for storing token manager
    cred_key = f"{username}:{provider}"
    
    # Initialize provider dictionary if it doesn't exist
    if provider not in token_managers:
        token_managers[provider] = {}
    
    # Return existing instance if available
    if cred_key in token_managers[provider]:
        return token_managers[provider][cred_key]
    
    # Create new instance
    token_manager = TokenManager(
        username=username,
        api_key=api_key,
        provider=provider,
        token_file=f"{username}_{provider}_token.json",  # Unique token file per user/provider
        auto_refresh=settings.AUTO_REFRESH
    )
    
    # Store for reuse
    token_managers[provider][cred_key] = token_manager
    return token_manager

async def get_account_manager(
    token_manager: Annotated[TokenManager, Depends(get_token_manager)]
) -> AccountManager:
    """
    Create an AccountManager instance using the provided TokenManager.
    
    Args:
        token_manager: TokenManager instance
        
    Returns:
        AccountManager instance
    """
    return AccountManager(token_manager)

async def get_contract_manager(
    token_manager: Annotated[TokenManager, Depends(get_token_manager)]
) -> ContractManager:
    """
    Create a ContractManager instance using the provided TokenManager.
    
    Args:
        token_manager: TokenManager instance
        
    Returns:
        ContractManager instance
    """
    return ContractManager(token_manager)

async def get_position_manager(
    token_manager: Annotated[TokenManager, Depends(get_token_manager)]
) -> PositionManager:
    """
    Create a PositionManager instance using the provided TokenManager.
    
    Args:
        token_manager: TokenManager instance
        
    Returns:
        PositionManager instance
    """
    return PositionManager(token_manager)

async def get_order_manager(
    token_manager: Annotated[TokenManager, Depends(get_token_manager)]
) -> OrderManager:
    """
    Create an OrderManager instance using the provided TokenManager.
    
    Args:
        token_manager: TokenManager instance
        
    Returns:
        OrderManager instance
    """
    return OrderManager(token_manager)

async def get_cached_contract_id(
    symbol: str,
    contract_manager: Annotated[ContractManager, Depends(get_contract_manager)]
) -> Optional[str]:
    """
    Get contract ID with caching for better performance.
    
    Args:
        symbol: The symbol to look up
        contract_manager: ContractManager instance
        
    Returns:
        Contract ID if found, otherwise None
    """
    # Normalize symbol
    normalized_symbol = symbol.lstrip("!")
    
    # Check cache first
    if normalized_symbol in contract_cache:
        return contract_cache[normalized_symbol]
    
    # Not in cache, look it up
    contract_id = await contract_manager.get_first_contract_id(normalized_symbol, live=False)
    
    # Store in cache if found
    if contract_id:
        contract_cache[normalized_symbol] = contract_id
    
    return contract_id

async def get_cached_account_id(
    account_name: str,
    account_manager: Annotated[AccountManager, Depends(get_account_manager)]
) -> Optional[int]:
    """
    Get account ID with caching for better performance.
    
    Args:
        account_name: The account name to look up
        account_manager: AccountManager instance
        
    Returns:
        Account ID if found, otherwise None
    """
    # Check cache first
    if account_name in account_cache:
        return account_cache[account_name]
    
    # Not in cache, look it up
    account_id = await account_manager.get_account_id_by_name(account_name)
    
    # Store in cache if found
    if account_id:
        account_cache[account_name] = account_id
    
    return account_id 