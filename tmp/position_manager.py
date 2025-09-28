import asyncio
import json
from typing import Dict, List, Optional, Union, Any
from pydantic import BaseModel, Field
import httpx
from datetime import datetime

# Import the token manager
from .token_manager import TokenManager

# Define models for the API responses and requests
class Position(BaseModel):
    id: int
    accountId: int
    contractId: str
    creationTimestamp: str
    type: int  # 1 = Long, 2 = Short
    size: int
    averagePrice: float
    
    @property
    def position_type(self) -> str:
        """Return the position type as a string."""
        return "Long" if self.type == 1 else "Short" if self.type == 2 else f"Unknown ({self.type})"
    
    @property
    def creation_datetime(self) -> datetime:
        """Parse the creation timestamp as a datetime object."""
        return datetime.fromisoformat(self.creationTimestamp.replace('Z', '+00:00'))

class PositionSearchRequest(BaseModel):
    accountId: int

class PositionSearchResponse(BaseModel):
    positions: List[Position]
    success: bool
    errorCode: int
    errorMessage: Optional[str] = None

class PositionManager:
    """
    Manager class for handling position operations across different providers.
    """
    
    def __init__(
        self,
        token_manager: TokenManager,
        account_manager=None
    ):
        """
        Initialize the position manager.
        
        Args:
            token_manager: An instance of TokenManager for authentication
            account_manager: An optional AccountManager instance for resolving account names
        """
        self.token_manager = token_manager
        self.provider = token_manager.provider
        self.account_manager = account_manager
        
    async def search_open_positions(
        self, 
        account_id: int
    ) -> PositionSearchResponse:
        """
        Search for open positions for a specific account.
        
        Args:
            account_id: The ID of the account to search positions for
            
        Returns:
            PositionSearchResponse containing position information
        """
        endpoint = "/Position/searchOpen"
        payload = PositionSearchRequest(accountId=account_id).dict()
        
        response = await self.token_manager.perform_authenticated_request(
            "POST",
            endpoint,
            json=payload
        )
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to search positions ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        return PositionSearchResponse(**data)
    
    async def get_position_by_id(
        self,
        account_id: int,
        position_id: int
    ) -> Optional[Position]:
        """
        Get a specific position by its ID.
        
        Args:
            account_id: The ID of the account
            position_id: The ID of the position to retrieve
            
        Returns:
            The position if found, otherwise None
        """
        response = await self.search_open_positions(account_id)
        
        # Look for the position with the matching ID
        for position in response.positions:
            if position.id == position_id:
                return position
                
        # Position not found
        print(f"No position found with ID '{position_id}' for account '{account_id}' (provider: '{self.provider}')")
        return None
    
    async def get_average_price(
        self,
        account_id: int,
        contract_id: Optional[str] = None,
        position_id: Optional[int] = None
    ) -> Optional[float]:
        """
        Get the average filled price for a position.
        
        Args:
            account_id: The ID of the account
            contract_id: The contract ID to filter by (optional)
            position_id: The specific position ID to get the price for (optional)
            
        Returns:
            The average price if found, otherwise None
        """
        response = await self.search_open_positions(account_id)
        
        # If we have a specific position ID, look for that
        if position_id:
            for position in response.positions:
                if position.id == position_id:
                    return position.averagePrice
                    
            print(f"No position found with ID '{position_id}' for account '{account_id}' (provider: '{self.provider}')")
            return None
            
        # If we have a contract ID, filter by that
        if contract_id:
            positions = [p for p in response.positions if p.contractId == contract_id]
            if not positions:
                print(f"No positions found for contract '{contract_id}' in account '{account_id}' (provider: '{self.provider}')")
                return None
                
            # If there are multiple positions, we'll return the weighted average
            if len(positions) > 1:
                total_value = sum(p.averagePrice * p.size for p in positions)
                total_size = sum(p.size for p in positions)
                return total_value / total_size if total_size > 0 else None
            
            # Single position case
            return positions[0].averagePrice
            
        # If we have neither position ID nor contract ID, and there's only one position, return its price
        if len(response.positions) == 1:
            return response.positions[0].averagePrice
            
        # If we have multiple positions and no filters, we can't determine which one to return
        if len(response.positions) > 1:
            print(f"Multiple positions found for account '{account_id}', please specify a contract ID or position ID")
            return None
            
        # No positions found
        print(f"No open positions found for account '{account_id}' (provider: '{self.provider}')")
        return None
    
    async def get_positions_by_contract(
        self,
        account_id: int,
        contract_id: str
    ) -> List[Position]:
        """
        Get all positions for a specific contract.
        
        Args:
            account_id: The ID of the account
            contract_id: The contract ID to filter by
            
        Returns:
            List of positions for the contract
        """
        response = await self.search_open_positions(account_id)
        
        # Filter positions by contract ID
        matching_positions = [
            position for position in response.positions 
            if position.contractId == contract_id
        ]
        
        print(f"Found {len(matching_positions)} positions for contract '{contract_id}' in account '{account_id}' (provider: '{self.provider}')")
        return matching_positions
    
    async def get_total_position_size(
        self,
        account_id: int,
        contract_id: Optional[str] = None
    ) -> Dict[str, int]:
        """
        Get the total position size for an account, optionally filtered by contract.
        
        Args:
            account_id: The ID of the account
            contract_id: The contract ID to filter by (optional)
            
        Returns:
            Dictionary with contract IDs as keys and total sizes as values
        """
        response = await self.search_open_positions(account_id)
        
        # Filter positions by contract ID if provided
        positions = response.positions
        if contract_id:
            positions = [p for p in positions if p.contractId == contract_id]
        
        # Group positions by contract and calculate total size
        result = {}
        for position in positions:
            # Sign is based on position type (1 = Long = positive, 2 = Short = negative)
            sign = 1 if position.type == 1 else -1
            size = position.size * sign
            
            if position.contractId in result:
                result[position.contractId] += size
            else:
                result[position.contractId] = size
                
        return result
    
    def format_position_list(self, positions: List[Position]) -> str:
        """
        Format a list of positions as a readable string.
        
        Args:
            positions: List of positions to format
            
        Returns:
            Formatted string representation of the positions
        """
        if not positions:
            return f"No positions found for provider '{self.provider}'."
            
        # Create a formatted string
        result = f"Positions for provider '{self.provider}':\n"
        for i, position in enumerate(positions, 1):
            position_type = "Long" if position.type == 1 else "Short" if position.type == 2 else f"Unknown ({position.type})"
            creation_time = position.creation_datetime.strftime("%Y-%m-%d %H:%M:%S")
            
            result += (
                f"{i}. ID: {position.id}, Account: {position.accountId}, "
                f"Contract: {position.contractId}, Type: {position_type}, "
                f"Size: {position.size}, Avg Price: {position.averagePrice:,.2f}, "
                f"Created: {creation_time}\n"
            )
            
        return result

    async def getPositionIDForAccountName(
        self, 
        account_name: str,
        contract_id: str = None
    ) -> Optional[int]:
        """
        Get position ID for an account name.
        
        Args:
            account_name: The name of the account
            contract_id: Optional contract ID to filter positions
            
        Returns:
            The position ID if found, otherwise None
        """
        # If we don't have an account manager, create one
        if not self.account_manager:
            from .account_manager import AccountManager
            self.account_manager = AccountManager(self.token_manager)
            
        # Get the account ID from the account name
        account_id = await self.account_manager.get_account_id_by_name(account_name)
        if not account_id:
            print(f"No account found with name '{account_name}' (provider: '{self.provider}')")
            return None
            
        # Get open positions for the account
        response = await self.search_open_positions(account_id)
        
        # Filter by contract ID if provided
        positions = response.positions
        if contract_id:
            positions = [p for p in positions if p.contractId == contract_id]
            
        # Return the first position ID or None if no positions
        if positions:
            return positions[0].id
        else:
            print(f"No positions found for account '{account_name}'{' and contract ' + contract_id if contract_id else ''} (provider: '{self.provider}')")
            return None