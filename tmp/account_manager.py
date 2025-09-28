import asyncio
import json
import os
import logging
from typing import Dict, List, Optional, Union, Any
from pydantic import BaseModel, Field
import httpx

# Import the token manager you provided
from .token_manager import TokenManager

# Set up logging
logger = logging.getLogger(__name__)

# Define models for the API responses and requests
class Account(BaseModel):
    id: int
    name: str
    balance: float
    canTrade: bool
    isVisible: bool

class AccountSearchRequest(BaseModel):
    onlyActiveAccounts: bool = True

class AccountSearchResponse(BaseModel):
    accounts: List[Account]
    success: bool
    errorCode: int
    errorMessage: Optional[str] = None

class AccountManager:
    """
    Manager class for handling account operations across different providers.
    """
    
    def __init__(
        self,
        token_manager: TokenManager
    ):
        """
        Initialize the account manager.
        
        Args:
            token_manager: An instance of TokenManager for authentication
        """
        self.token_manager = token_manager
        self.provider = token_manager.provider
        
    async def search_accounts(
        self, 
        only_active_accounts: bool = True
    ) -> AccountSearchResponse:
        """
        Search for accounts.
        
        Args:
            only_active_accounts: Whether to only return active accounts
            
        Returns:
            AccountSearchResponse containing account information
        """
        endpoint = "/Account/search"
        payload = AccountSearchRequest(onlyActiveAccounts=only_active_accounts).dict()
        
        response = await self.token_manager.perform_authenticated_request(
            "POST",
            endpoint,
            json=payload
        )
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to search accounts ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        return AccountSearchResponse(**data)
        
    async def get_account_id_by_name(
        self, 
        account_name: str, 
        only_active_accounts: bool = True
    ) -> Optional[int]:
        """
        Get an account ID by its name.
        Uses intelligent caching: checks existing cache first, refreshes only if cache is stale or account not found.
        
        Args:
            account_name: The name of the account to search for
            only_active_accounts: Whether to only search active accounts
            
        Returns:
            The account ID if found, otherwise None
        """
        cache_file = "accountID.json"
        
        # First, check if we have a fresh cache
        if self._is_cache_fresh(cache_file, max_age_minutes=5):
            logger.info(f"Cache is fresh, checking existing cache for '{account_name}'")
            cached_account_id = await self._get_account_id_from_existing_cache(account_name)
            
            if cached_account_id is not None:
                logger.info(f"Found account '{account_name}' in fresh cache with ID {cached_account_id}")
                return cached_account_id
            else:
                logger.info(f"Account '{account_name}' not found in fresh cache, will refresh cache")
        else:
            logger.info(f"Cache is stale or doesn't exist, will refresh cache for '{account_name}'")
        
        # Cache is stale or account not found in cache, refresh it
        logger.info(f"Refreshing cache and searching for account '{account_name}'")
        refreshed_account_id = await self.get_account_id_from_cache(account_name)
        
        if refreshed_account_id is not None:
            logger.info(f"Found account '{account_name}' after cache refresh with ID {refreshed_account_id}")
            return refreshed_account_id
        
        # If still not found after cache refresh, fall back to direct API search
        logger.info(f"Account '{account_name}' not found in refreshed cache, trying direct API search")
        try:
            response = await self.search_accounts(only_active_accounts=only_active_accounts)
            
            # Look for the account with the matching name
            for account in response.accounts:
                if account.name == account_name:
                    logger.info(f"Found account '{account_name}' via direct API with ID {account.id}")
                    return account.id
                    
            # Account not found anywhere
            logger.warning(f"No account found with name '{account_name}' for provider '{self.provider}'")
            return None
            
        except Exception as e:
            logger.error(f"Error searching accounts via API for '{account_name}': {str(e)}")
            return None
        
    async def get_accounts_by_prefix(
        self,
        name_prefix: str,
        only_active_accounts: bool = True
    ) -> List[Account]:
        """
        Get accounts that start with a specific prefix.
        
        Args:
            name_prefix: The prefix to search for
            only_active_accounts: Whether to only search active accounts
            
        Returns:
            List of accounts matching the prefix
        """
        response = await self.search_accounts(only_active_accounts=only_active_accounts)
        
        # Filter accounts by name prefix
        matching_accounts = [
            account for account in response.accounts 
            if account.name.startswith(name_prefix)
        ]
        
        print(f"Found {len(matching_accounts)} accounts with prefix '{name_prefix}' for provider '{self.provider}'")
        return matching_accounts
        
    async def get_account_by_id(self, account_id: int) -> Optional[Account]:
        """
        Get a single account by its ID.
        
        Args:
            account_id: The ID of the account to retrieve
            
        Returns:
            The account if found, otherwise None
        """
        response = await self.search_accounts()
        
        # Look for the account with the matching ID
        for account in response.accounts:
            if account.id == account_id:
                return account
                
        # Account not found
        print(f"No account found with ID '{account_id}' for provider '{self.provider}'")
        return None
        
    async def get_total_balance(self, only_active_accounts: bool = True) -> float:
        """
        Calculate the total balance across all accounts.
        
        Args:
            only_active_accounts: Whether to only include active accounts
            
        Returns:
            Total balance as a float
        """
        response = await self.search_accounts(only_active_accounts=only_active_accounts)
        
        # Sum the balances
        total_balance = sum(account.balance for account in response.accounts)
        return total_balance
        
    async def get_tradable_accounts(self) -> List[Account]:
        """
        Get a list of accounts that can be traded.
        
        Returns:
            List of tradable accounts
        """
        response = await self.search_accounts()
        
        # Return all accounts (canTrade check disabled)
        tradable_accounts = response.accounts
        
        print(f"Found {len(tradable_accounts)} tradable accounts for provider '{self.provider}'")
        return tradable_accounts
        
    def format_account_list(self, accounts: List[Account]) -> str:
        """
        Format a list of accounts as a readable string.
        
        Args:
            accounts: List of accounts to format
            
        Returns:
            Formatted string representation of the accounts
        """
        if not accounts:
            return f"No accounts found for provider '{self.provider}'."
            
        # Create a formatted string
        result = f"Accounts for provider '{self.provider}':\n"
        for i, account in enumerate(accounts, 1):
            result += (
                f"{i}. ID: {account.id}, Name: {account.name}, "
                f"Balance: ${account.balance:,.2f}, "
                f"Can Trade: {'Yes' if account.canTrade else 'No'}, "
                f"Visible: {'Yes' if account.isVisible else 'No'}\n"
            )
            
        return result
    
    async def get_all_account_names(self, only_active_accounts: bool = True) -> List[str]:
        """
        Get a list of all account names.
        
        Args:
            only_active_accounts: Whether to only include active accounts
            
        Returns:
            List of account names
        """
        response = await self.search_accounts(only_active_accounts=only_active_accounts)
        return [account.name for account in response.accounts]

    async def get_active_accounts(self) -> List[Account]:
        """
        Get a list of all active accounts.
        
        Returns:
            List of active accounts
        """
        response = await self.search_accounts(only_active_accounts=True)
        return response.accounts

    async def get_account_id_from_cache(self, account_name: str) -> Optional[int]:
        """
        Get an account ID by name, creating/updating accountID.json cache file.
        
        This method:
        1. Fetches all tradable accounts from the API
        2. Creates/updates an accountID.json file with {accountName: accountId} mapping
        3. Returns the accountID for the given accountName
        4. Logs errors instead of throwing exceptions
        
        Args:
            account_name: The name of the account to search for
            
        Returns:
            The account ID if found, otherwise None
        """
        cache_file = "accountID.json"
        account_mapping = {}
        
        try:
            # Get all tradable accounts
            logger.info(f"Fetching all tradable accounts for provider '{self.provider}'")
            tradable_accounts = await self.get_tradable_accounts()
            
            # Create account name to ID mapping
            for account in tradable_accounts:
                account_mapping[account.name] = account.id
            
            # Save to accountID.json file
            try:
                with open(cache_file, 'w') as f:
                    json.dump(account_mapping, f, indent=2)
                logger.info(f"Successfully updated {cache_file} with {len(account_mapping)} account mappings")
            except Exception as e:
                logger.error(f"Failed to write to {cache_file}: {str(e)}")
                # Continue execution even if file write fails
            
            # Return the account ID if found
            if account_name in account_mapping:
                account_id = account_mapping[account_name]
                logger.info(f"Found account '{account_name}' with ID {account_id}")
                return account_id
            else:
                logger.warning(f"Account '{account_name}' not found in tradable accounts for provider '{self.provider}'")
                return None
                
        except Exception as e:
            logger.error(f"Error fetching tradable accounts for provider '{self.provider}': {str(e)}")
            
            # Try to load from existing cache file as fallback
            try:
                if os.path.exists(cache_file):
                    logger.info(f"Attempting to load account mapping from existing {cache_file}")
                    with open(cache_file, 'r') as f:
                        account_mapping = json.load(f)
                    
                    if account_name in account_mapping:
                        account_id = account_mapping[account_name]
                        logger.info(f"Found account '{account_name}' with ID {account_id} in cached file")
                        return account_id
                    else:
                        logger.warning(f"Account '{account_name}' not found in cached {cache_file}")
                        return None
                else:
                    logger.warning(f"No cached {cache_file} file found")
                    return None
                    
            except Exception as cache_error:
                logger.error(f"Error reading cached {cache_file}: {str(cache_error)}")
                return None

    def _is_cache_fresh(self, cache_file: str, max_age_minutes: int = 5) -> bool:
        """
        Check if the cache file exists and is fresh (not older than max_age_minutes).
        
        Args:
            cache_file: Path to the cache file
            max_age_minutes: Maximum age in minutes before cache is considered stale
            
        Returns:
            True if cache is fresh, False otherwise
        """
        try:
            if not os.path.exists(cache_file):
                return False
            
            import time
            file_age_seconds = time.time() - os.path.getmtime(cache_file)
            file_age_minutes = file_age_seconds / 60
            
            return file_age_minutes <= max_age_minutes
        except Exception as e:
            logger.error(f"Error checking cache freshness: {str(e)}")
            return False

    async def _get_account_id_from_existing_cache(self, account_name: str) -> Optional[int]:
        """
        Get account ID from existing cache file without refreshing.
        
        Args:
            account_name: The name of the account to search for
            
        Returns:
            The account ID if found in cache, otherwise None
        """
        cache_file = "accountID.json"
        
        try:
            if os.path.exists(cache_file):
                with open(cache_file, 'r') as f:
                    account_mapping = json.load(f)
                
                if account_name in account_mapping:
                    account_id = account_mapping[account_name]
                    logger.info(f"Found account '{account_name}' in existing cache with ID {account_id}")
                    return account_id
                else:
                    logger.debug(f"Account '{account_name}' not found in existing cache")
                    return None
            else:
                logger.debug("No existing cache file found")
                return None
                
        except Exception as e:
            logger.error(f"Error reading existing cache: {str(e)}")
            return None