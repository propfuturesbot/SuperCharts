import asyncio
import json
from typing import Dict, List, Optional, Union, Any
from pydantic import BaseModel, Field
import httpx

# Import the token manager
from .token_manager import TokenManager
from .position_manager import PositionManager  # For position-related operations
from config.config import get_user_provider_config

# Define models for the API responses and requests
class CloseContractRequest(BaseModel):
    accountId: int
    contractId: str

class ClosePositionRequest(BaseModel):
    accountId: int
    positionId: int

class CloseAllPositionsRequest(BaseModel):
    accountId: int

class CloseResponse(BaseModel):
    success: bool
    errorCode: int
    errorMessage: Optional[str] = None

class CloseManager:
    """
    Manager class for handling position closing operations across different providers.
    """
    
    def __init__(
        self,
        token_manager: TokenManager,
        position_manager: Optional[PositionManager] = None
    ):
        """
        Initialize the close manager.
        
        Args:
            token_manager: An instance of TokenManager for authentication
            position_manager: An optional instance of PositionManager for position operations
        """
        self.token_manager = token_manager
        self.provider = token_manager.provider
        self.position_manager = position_manager
        
    async def close_position_by_contract(
        self,
        account_id: int,
        contract_id: str
    ) -> CloseResponse:
        """
        Close all positions for a specific contract.
        
        Args:
            account_id: The account ID
            contract_id: The contract ID to close positions for
            
        Returns:
            CloseResponse indicating success or failure
        """
        endpoint = "/Position/closeContract"
        payload = CloseContractRequest(accountId=account_id, contractId=contract_id).dict()
        
        response = await self.token_manager.perform_authenticated_request(
            "POST",
            endpoint,
            json=payload
        )
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to close position by contract ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        return CloseResponse(**data)
    
    async def close_position_by_id(
        self,
        account_id: int,
        position_id: int
    ) -> CloseResponse:
        """
        Close a specific position by its ID using the direct API.
        
        Args:
            account_id: The account ID
            position_id: The ID of the position to close
            
        Returns:
            CloseResponse indicating success or failure
        """
        # Get provider configuration and use userapi_endpoint
        provider_config = get_user_provider_config()
        direct_url = f"{provider_config['userapi_endpoint']}/Position/close/{position_id}"
        
        # Get the auth token but make the request directly instead of using perform_authenticated_request
        token = await self.token_manager.get_token()
        
        # Create headers with the authorization token
        headers = {
            "accept": "application/json, text/plain, */*",
            "authorization": f"Bearer {token}"
        }
        
        # Make the request directly
        async with httpx.AsyncClient() as client:
            response = await client.delete(direct_url, headers=headers)
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to close position by ID ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        return CloseResponse(**data)
    
    async def close_all_positions(
        self,
        account_id: int
    ) -> CloseResponse:
        """
        Close all positions for an account.
        
        Args:
            account_id: The account ID
            
        Returns:
            CloseResponse indicating success or failure
        """
        endpoint = "/Position/closeAll"
        payload = CloseAllPositionsRequest(accountId=account_id).dict()
        
        response = await self.token_manager.perform_authenticated_request(
            "POST",
            endpoint,
            json=payload
        )
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to close all positions ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        return CloseResponse(**data)
    
    async def close_positions_by_contract_list(
        self,
        account_id: int,
        contract_ids: List[str]
    ) -> Dict[str, CloseResponse]:
        """
        Close positions for multiple contracts.
        
        Args:
            account_id: The account ID
            contract_ids: List of contract IDs to close positions for
            
        Returns:
            Dictionary mapping contract IDs to their respective close responses
        """
        results = {}
        
        for contract_id in contract_ids:
            try:
                result = await self.close_position_by_contract(account_id, contract_id)
                results[contract_id] = result
            except Exception as e:
                print(f"Error closing positions for contract {contract_id}: {e}")
                # Create a failure response
                results[contract_id] = CloseResponse(
                    success=False,
                    errorCode=-1,
                    errorMessage=str(e)
                )
                
        return results
    
    async def close_all_positions_by_symbol(
        self,
        account_id: int,
        symbol: str
    ) -> Dict[str, CloseResponse]:
        """
        Close all positions for contracts containing a specific symbol.
        
        Args:
            account_id: The account ID
            symbol: The symbol to match in contract IDs (e.g., "NQ" would match "CON.F.US.ENQ.M25")
            
        Returns:
            Dictionary mapping contract IDs to their respective close responses
        """
        if not self.position_manager:
            raise ValueError("PositionManager is required for this operation")
            
        # Get all open positions
        positions_response = await self.position_manager.search_open_positions(account_id)
        
        # Filter positions by symbol
        matching_contracts = set()
        for position in positions_response.positions:
            if symbol.upper() in position.contractId.upper():
                matching_contracts.add(position.contractId)
                
        # Close matching positions
        if not matching_contracts:
            print(f"No open positions found matching symbol '{symbol}' for account {account_id}")
            return {}
            
        print(f"Closing positions for {len(matching_contracts)} contracts matching symbol '{symbol}'")
        return await self.close_positions_by_contract_list(account_id, list(matching_contracts))
    
    async def close_positions_with_confirmation(
        self,
        account_id: int,
        contract_id: str
    ) -> bool:
        """
        Close positions for a contract with confirmation of success.
        
        Args:
            account_id: The account ID
            contract_id: The contract ID to close positions for
            
        Returns:
            True if positions were successfully closed, False otherwise
        """
        # First, check if there are open positions for this contract
        if self.position_manager:
            positions_response = await self.position_manager.search_open_positions(account_id)
            has_positions = any(p.contractId == contract_id for p in positions_response.positions)
            
            if not has_positions:
                print(f"No open positions found for contract '{contract_id}' in account {account_id}")
                return False
                
        # Attempt to close the positions
        try:
            response = await self.close_position_by_contract(account_id, contract_id)
            
            if response.success:
                print(f"Successfully closed positions for contract '{contract_id}' in account {account_id}")
                return True
            else:
                print(f"Failed to close positions: {response.errorMessage}")
                return False
        except Exception as e:
            print(f"Error closing positions: {e}")
            return False
            
        # Verify positions were closed (if position manager is available)
        if self.position_manager:
            positions_response = await self.position_manager.search_open_positions(account_id)
            still_has_positions = any(p.contractId == contract_id for p in positions_response.positions)
            
            if still_has_positions:
                print(f"Warning: Positions for contract '{contract_id}' still exist after attempted close")
                return False
                
        return True
    
    async def close_positions_by_account_name_and_symbol(
        self,
        payload: Dict[str, str]
    ) -> bool:
        """
        Close positions based on account name and symbol.
        
        Args:
            payload: A dictionary containing:
                     - accountName: The name of the account
                     - symbol: The symbol to match in contract IDs
            
        Returns:
            True if positions were successfully closed and orders cancelled, False otherwise
        """
        # Validate input
        account_name = payload.get("accountName")
        symbol = payload.get("symbol")
        
        if not account_name or not symbol:
            print("Error: Both accountName and symbol are required")
            return False
        
        # Get the account ID from the account name
        # Import AccountManager here to avoid circular imports
        from .account_manager import AccountManager
        account_manager = AccountManager(self.token_manager)
        
        # Get account ID
        account_id = await account_manager.get_account_id_by_name(account_name)
        if not account_id:
            print(f"Error: No account found with name '{account_name}'")
            return False
        
        # Get the contract ID from the symbol
        # Import ContractManager here to avoid circular imports
        from .contract_manager import ContractManager
        contract_manager = ContractManager(self.token_manager)
        
        # For symbols like "!NQ.1", we strip the "!" prefix if present
        search_symbol = symbol.lstrip("!")
        contract_id = await contract_manager.get_first_contract_id(search_symbol, live=False)
        if not contract_id:
            print(f"Error: Contract not found for symbol: {symbol}")
            return False
        
        # Import OrderManager here to avoid circular imports
        from .order_manager import OrderManager
        order_manager = OrderManager(self.token_manager)
        
        # First, get and cancel any open orders with retries
        max_retries = 3
        retry_delay = 1  # seconds
        orders_cancelled = True
        
        print("\n=== Starting order cancellation process ===")
        
        for attempt in range(max_retries):
            try:
                print(f"\nAttempt {attempt + 1}/{max_retries} to cancel orders")
                orders_response = await order_manager.search_open_orders_by_account_name_and_symbol(account_name, symbol)
                
                print(f"Order search response: success={orders_response.success}, error={orders_response.errorMessage}")
                
                if orders_response.success and orders_response.orders:
                    print(f"Found {len(orders_response.orders)} open orders to cancel")
                    
                    # Print order details for debugging
                    for i, order in enumerate(orders_response.orders):
                        print(f"\nOrder {i+1} details:")
                        print(f"  Full order data: {order}")
                        print(f"  Order keys: {list(order.keys())}")
                    
                    # Cancel each open order
                    for order in orders_response.orders:
                        try:
                            # Try different possible field names for order ID
                            order_id = order.get("id") or order.get("orderId") or order.get("orderID")
                            
                            if not order_id:
                                print(f"ERROR: Could not find order ID in order data: {order}")
                                orders_cancelled = False
                                continue
                            
                            print(f"\nAttempting to cancel order:")
                            print(f"  Order ID: {order_id}")
                            print(f"  Contract ID: {order.get('contractId')}")
                            print(f"  Account ID: {account_id}")
                            print(f"  Order Type: {order.get('type')}")
                            print(f"  Order Side: {order.get('side')}")
                            print(f"  Order Size: {order.get('size')}")
                            
                            cancel_response = await order_manager.cancel_order(account_id, order_id)
                            print(f"Cancel response: {cancel_response}")
                            
                            if cancel_response.get("success", False):
                                print(f"✓ Successfully cancelled order {order_id}")
                            else:
                                print(f"✗ Failed to cancel order {order_id}: {cancel_response.get('errorMessage', 'Unknown error')}")
                                orders_cancelled = False
                        except Exception as e:
                            print(f"✗ Error cancelling order {order.get('id', 'unknown')}: {str(e)}")
                            orders_cancelled = False
                    
                    # Verify orders were cancelled
                    print("\nVerifying order cancellation...")
                    verify_response = await order_manager.search_open_orders_by_account_name_and_symbol(account_name, symbol)
                    if verify_response.success and verify_response.orders:
                        print(f"✗ Warning: {len(verify_response.orders)} orders still exist after cancellation attempt")
                        for order in verify_response.orders:
                            print(f"  Remaining order: ID={order.get('id', order.get('orderId'))}, Type={order.get('type')}")
                        orders_cancelled = False
                    else:
                        print("✓ All orders successfully cancelled")
                        orders_cancelled = True
                        break
                    
                    # If this wasn't the last attempt, wait before retrying
                    if attempt < max_retries - 1:
                        print(f"\nWaiting {retry_delay} seconds before retrying order cancellation...")
                        await asyncio.sleep(retry_delay)
                else:
                    print("No open orders found to cancel")
                    orders_cancelled = True
                    break
            except Exception as e:
                print(f"✗ Error during order cancellation attempt {attempt + 1}: {str(e)}")
                orders_cancelled = False
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
        
        # Now close the positions
        try:
            response = await self.close_position_by_contract(account_id, contract_id)
            print(f"The Response: {response}")

            if response.success:
                print(f"Successfully closed positions for contract '{contract_id}' in account '{account_name}'")
                
                # Verify positions were closed
                if self.position_manager:
                    positions_response = await self.position_manager.search_open_positions(account_id)
                    still_has_positions = any(p.contractId == contract_id for p in positions_response.positions)
                    
                    if still_has_positions:
                        print(f"Warning: Positions for contract '{contract_id}' still exist after attempted close")
                        return False
                
                # Return true only if both position closing and order cancellation were successful
                return orders_cancelled
            else:
                print(f"Failed to close positions: {response.errorMessage}")
                return False
        except Exception as e:
            print(f"Error closing positions: {e}")
            return False
    
    async def flatten_position(
        self,
        position_id: int
    ) -> CloseResponse:
        """
        Flatten (close) a specific position by its ID using the direct API.
        
        Args:
            position_id: The ID of the position to close
            
        Returns:
            CloseResponse indicating success or failure
        """
        # Get provider configuration and use userapi_endpoint
        provider_config = get_user_provider_config()
        direct_url = f"{provider_config['userapi_endpoint']}/Position/close/{position_id}"
        
        # Get the auth token but make the request directly instead of using perform_authenticated_request
        token = await self.token_manager.get_token()
        
        # Create headers with the authorization token
        headers = {
            "accept": "application/json, text/plain, */*",
            "authorization": f"Bearer {token}"
        }
        
        # Make the request directly
        async with httpx.AsyncClient() as client:
            response = await client.delete(direct_url, headers=headers)
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to flatten position by ID ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        return CloseResponse(**data)
    
    async def flatten_account_positions(
        self,
        account_id: int
    ) -> CloseResponse:
        """
        Flatten (close) all positions for an account using the direct API.
        
        Args:
            account_id: The ID of the account to flatten all positions for
            
        Returns:
            CloseResponse indicating success or failure
        """
        # Get provider configuration and use userapi_endpoint
        provider_config = get_user_provider_config()
        direct_url = f"{provider_config['userapi_endpoint']}/Position/close/{account_id}"
        
        # Get the auth token but make the request directly instead of using perform_authenticated_request
        token = await self.token_manager.get_token()
        
        # Create headers with the authorization token
        headers = {
            "accept": "application/json, text/plain, */*",
            "authorization": f"Bearer {token}"
        }
        
        # Make the request directly
        async with httpx.AsyncClient() as client:
            # Try with DELETE method first
            response = await client.delete(direct_url, headers=headers)
            
            # If that fails, try with POST method
            if response.status_code != 200:
                try:
                    post_response = await client.post(direct_url, headers=headers)
                    if post_response.status_code == 200:
                        response = post_response
                except Exception:
                    # Continue with original response if POST approach fails
                    pass
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to flatten all positions for account ID {account_id} ({self.provider}): {response.text}")
        
        # Parse the response
        try:
            data = response.json()
            return CloseResponse(**data)
        except Exception:
            # If response is not JSON, create a response object with success=True
            return CloseResponse(success=True, errorCode=0, errorMessage=None)
    
    async def flatten_all_for_account(self, account_name: str) -> Dict[str, Any]:
        """
        For a given account name, close all positions by contract (using working endpoint), then cancel all open orders.
        Returns a summary dict with details of what was closed/cancelled and any errors.
        """
        from .account_manager import AccountManager
        from .order_manager import OrderManager
        from .position_manager import PositionManager
        summary = {"account_name": account_name, "positions_closed": [], "orders_cancelled": [], "errors": []}
        try:
            # Get account_id
            account_manager = AccountManager(self.token_manager)
            account_id = await account_manager.get_account_id_by_name(account_name)
            if not account_id:
                summary["errors"].append(f"Account not found: {account_name}")
                return summary
            
            # Get all open positions for the account
            try:
                position_manager = PositionManager(self.token_manager)
                positions_response = await position_manager.search_open_positions(account_id)
                if positions_response.success and positions_response.positions:
                    # Group positions by contract ID to close all positions for each contract
                    contracts_with_positions = set()
                    for position in positions_response.positions:
                        contracts_with_positions.add(position.contractId)
                    
                    # Close positions for each contract using the working endpoint
                    for contract_id in contracts_with_positions:
                        try:
                            close_resp = await self.close_position_by_contract(account_id, contract_id)
                            if close_resp.success:
                                summary["positions_closed"].append(f"All positions for contract {contract_id} closed")
                            else:
                                summary["errors"].append(f"Failed to close positions for contract {contract_id}: {close_resp.errorMessage}")
                        except Exception as e:
                            summary["errors"].append(f"Exception closing positions for contract {contract_id}: {str(e)}")
                else:
                    summary["positions_closed"].append("No open positions found")
            except Exception as e:
                summary["errors"].append(f"Exception getting/closing positions: {str(e)}")
            
            # Cancel all open orders
            try:
                order_manager = OrderManager(self.token_manager)
                open_orders_response = await order_manager.search_open_orders(account_id)
                if open_orders_response.success and open_orders_response.orders:
                    for order in open_orders_response.orders:
                        order_id = order.get("id") or order.get("orderId") or order.get("orderID")
                        if not order_id:
                            summary["errors"].append(f"Order missing ID: {order}")
                            continue
                        try:
                            cancel_resp = await order_manager.cancel_order(account_id, order_id)
                            if cancel_resp.get("success", False):
                                summary["orders_cancelled"].append(order_id)
                            else:
                                summary["errors"].append(f"Failed to cancel order {order_id}: {cancel_resp.get('errorMessage')}")
                        except Exception as e:
                            summary["errors"].append(f"Exception cancelling order {order_id}: {str(e)}")
                else:
                    summary["orders_cancelled"].append("No open orders found")
            except Exception as e:
                summary["errors"].append(f"Exception searching/cancelling orders: {str(e)}")
            
            return summary
        except Exception as e:
            summary["errors"].append(str(e))
            return summary