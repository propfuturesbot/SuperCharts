"""
Position Routes
"""
from typing import List, Optional, Dict, Any, Union
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from api.dependencies import (
    get_token_manager,
    get_account_manager,
    get_contract_manager,
    get_position_manager,
    get_cached_account_id,
    get_cached_contract_id,
    get_order_manager
)
from src.managers.token_manager import TokenManager
from src.managers.account_manager import AccountManager
from src.managers.contract_manager import ContractManager
from src.managers.position_manager import PositionManager
from src.managers.close_manager import CloseManager
from src.managers.order_manager import OrderManager, validate_trading_with_all_restrictions
from src.utils.utils import is_trade_allowed, get_trading_hours_message
import httpx
import asyncio
from typing import Annotated
from src.managers.bracket_order_tracker import BracketOrderTracker
from src.managers.stop_loss_tracker import StopLossTracker

router = APIRouter(prefix="/positions", tags=["positions"])

# Request model
class ClosePositionRequest(BaseModel):
    accountName: str
    symbol: str

# Response models
class PositionDetailsResponse(BaseModel):
    id: int
    accountId: int
    contractId: str
    creationTimestamp: str
    type: int
    size: int
    averagePrice: float

class OpenPositionsResponse(BaseModel):
    positions: List[PositionDetailsResponse]
    total_count: int

class ClosePositionResponse(BaseModel):
    success: bool
    message: str
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

# New request and response models for flattening positions
class FlattenPositionRequest(BaseModel):
    position_id: int

class FlattenAllPositionsRequest(BaseModel):
    accountName: Optional[str] = None
    accountId: Optional[int] = None

class FlattenPositionResponse(BaseModel):
    success: bool
    message: str
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

# Cache for tracking positions being closed to prevent duplicate requests
close_request_cache: Dict[str, Dict[str, Any]] = {}

# High-performance in-memory caches for frequently used mappings
account_name_to_id_cache: Dict[str, int] = {}
symbol_to_contract_cache: Dict[str, str] = {}
cache_ttl = 300  # 5 minutes TTL

# Get close manager dependency
async def get_close_manager(
    token_manager: TokenManager = Depends(get_token_manager),
    position_manager: PositionManager = Depends(get_position_manager)
) -> CloseManager:
    """
    Create a CloseManager instance using the provided dependencies.
    """
    return CloseManager(token_manager, position_manager)

# Enhanced close manager with caching
class EnhancedCloseManager(CloseManager):
    """
    Enhanced close manager with additional caching and optimization.
    """
    def __init__(
        self,
        token_manager: TokenManager,
        position_manager: PositionManager,
        account_manager: AccountManager,
        contract_manager: ContractManager,
        order_manager: OrderManager
    ):
        super().__init__(token_manager, position_manager)
        self.account_manager = account_manager
        self.contract_manager = contract_manager
        self.order_manager = order_manager
        # Initialize bracket order tracker
        self.bracket_tracker = BracketOrderTracker(
            token_manager=token_manager,
            order_manager=order_manager,
            position_manager=position_manager
        )
        
        # Initialize stop loss tracker
        self.stop_loss_tracker = StopLossTracker(
            token_manager=token_manager,
            order_manager=order_manager,
            position_manager=position_manager
        )
        
    async def close_positions_by_account_name_and_symbol_optimized(
        self,
        account_name: str,
        symbol: str,
        account_id: Optional[int] = None,
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Close positions with pre-resolved account and contract IDs.
        Fast version with parallel order cancellation and no verification steps.
        """
        # Cache key for this request
        cache_key = f"{account_name}:{symbol}"
        
        # Clean old cache entries first
        clean_old_cache_entries()
        
        # Check if this exact request is currently being processed (only very recent ones)
        if cache_key in close_request_cache:
            cached_entry = close_request_cache[cache_key]
            # Only consider it duplicate if it's very recent (less than 30 seconds) and still processing
            import time
            if (time.time() - cached_entry.get("timestamp", 0) < 30 and 
                cached_entry.get("status") == "processing"):
                result = cached_entry.copy()
                result["is_duplicate"] = True
                print(f"Detected recent duplicate request for {cache_key}, age: {time.time() - cached_entry.get('timestamp', 0)} seconds")
                return result
            else:
                # Remove old cache entry
                close_request_cache.pop(cache_key, None)
                print(f"Removed stale cache entry for {cache_key}")
            
        try:
            # Create a temporary entry in the cache to mark this request as being processed
            close_request_cache[cache_key] = {
                "success": False,
                "status": "processing",
                "timestamp": import_time(),
                "is_duplicate": False
            }
            
            print(f"\n=== Starting fast position close process for {account_name} - {symbol} ===")
            
            # Parallel lookups for account and contract IDs if not provided
            lookup_tasks = []
            
            if not account_id:
                print("Scheduling fast cached account lookup...")
                lookup_tasks.append(("account", get_cached_account_id_fast(account_name, self.account_manager)))
            
            if not contract_id:
                print("Scheduling fast cached contract lookup...")
                search_symbol = symbol.lstrip("!")
                lookup_tasks.append(("contract", get_cached_contract_id_fast(search_symbol, self.contract_manager)))
            
            # Execute lookups in parallel if needed
            if lookup_tasks:
                print(f"Executing {len(lookup_tasks)} lookups in parallel...")
                lookup_results = await asyncio.gather(*[task for _, task in lookup_tasks], return_exceptions=True)
                
                for i, (lookup_type, result) in enumerate(zip([t[0] for t in lookup_tasks], lookup_results)):
                    if isinstance(result, Exception):
                        error_result = {
                            "success": False,
                            "error": f"Error during {lookup_type} lookup: {str(result)}",
                            "status": "failed"
                        }
                        close_request_cache[cache_key] = error_result
                        return error_result
                    
                    if lookup_type == "account":
                        account_id = result
                        if not account_id:
                            error_result = {
                                "success": False,
                                "error": f"No account found with name '{account_name}'",
                                "status": "failed"
                            }
                            close_request_cache[cache_key] = error_result
                            return error_result
                    elif lookup_type == "contract":
                        contract_id = result
                        if not contract_id:
                            error_result = {
                                "success": False,
                                "error": f"Contract not found for symbol: {symbol}",
                                "status": "failed"
                            }
                            close_request_cache[cache_key] = error_result
                            return error_result
            
            print(f"Resolved IDs - Account: {account_id}, Contract: {contract_id}")
            
            # First, close the positions
            print("\n=== Starting position closing process ===")
            
            try:
                print(f"Closing positions for contract '{contract_id}' in account '{account_name}'")
                response = await self.close_position_by_contract(account_id, contract_id)
                print(f"Close position response: success={response.success}")
                
                if not response.success:
                    result = {
                        "success": False,
                        "error": response.errorMessage or "Unknown error",
                        "status": "failed",
                        "details": {
                            "accountId": account_id,
                            "contractId": contract_id,
                            "errorCode": response.errorCode
                        }
                    }
                    close_request_cache[cache_key] = result
                    return result
                
                print("✓ Successfully closed positions")
                
            except Exception as e:
                result = {
                    "success": False,
                    "error": str(e),
                    "status": "error",
                    "details": {
                        "accountId": account_id,
                        "contractId": contract_id
                    }
                }
                close_request_cache[cache_key] = result
                return result
            
            # After closing positions, cancel any remaining open orders
            order_manager = OrderManager(self.token_manager)
            
            orders_cancelled = True
            cancelled_orders = []
            matching_orders = []  # Initialize to avoid scope issues
            print("\n=== Starting fast order cancellation process ===")
            
            try:
                # Use direct order search with account_id and filter by contract_id
                print(f"Searching for open orders with account_id={account_id}")
                orders_response = await order_manager.search_open_orders(account_id)
                print(f"Order search response: success={orders_response.success}")
                
                if orders_response.success and orders_response.orders:
                    # Filter orders by contract_id to avoid redundant lookups
                    matching_orders = [
                        order for order in orders_response.orders 
                        if order.get("contractId") == contract_id
                    ]
                    print(f"Found {len(matching_orders)} orders matching contract '{contract_id}' out of {len(orders_response.orders)} total orders")
                    
                    if matching_orders:
                        print(f"Cancelling {len(matching_orders)} orders...")
                        
                        # Cancel orders sequentially to avoid asyncio scope issues
                        for order in matching_orders:
                            order_id = order.get("id") or order.get("orderId") or order.get("orderID")
                            if order_id:
                                try:
                                    print(f"Cancelling order ID: {order_id}")
                                    cancel_response = await order_manager.cancel_order(account_id, order_id)
                                    
                                    if cancel_response.get("success", False):
                                        print(f"✓ Successfully cancelled order {order_id}")
                                        cancelled_orders.append(order_id)
                                    else:
                                        print(f"✗ Failed to cancel order {order_id}: {cancel_response.get('errorMessage', 'Unknown error')}")
                                        orders_cancelled = False
                                except Exception as e:
                                    print(f"✗ Error cancelling order {order_id}: {str(e)}")
                                    orders_cancelled = False
                            else:
                                print(f"ERROR: Could not find order ID in order data: {order}")
                                orders_cancelled = False
                        
                        print(f"Successfully cancelled {len(cancelled_orders)} out of {len(matching_orders)} orders")
                    else:
                        print("No orders found matching the contract ID")
                        orders_cancelled = True
                else:
                    print("No open orders found to cancel")
                    orders_cancelled = True
            except Exception as e:
                print(f"✗ Error during order cancellation: {str(e)}")
                orders_cancelled = False
            
            # Return success - position closing was successful, order cancellation is secondary
            final_success = True  # Position closing succeeded, which is the main goal
            result = {
                "success": final_success,
                "message": f"Fast close completed for {symbol} in account {account_name}" + ("" if orders_cancelled else " (warning: some remaining orders may not have been cancelled)"),
                "status": "completed",
                "details": {
                    "accountId": account_id,
                    "contractId": contract_id,
                    "orders_cancelled": len(cancelled_orders),
                    "total_orders_found": len(matching_orders) if orders_response.success else 0,
                    "responseData": response.dict(),
                    "position_closed": True,
                    "orders_cleanup_successful": orders_cancelled
                }
            }
            
            # After successfully closing positions, trigger bracket order cleanup
            if final_success:
                await self.bracket_tracker.cleanup_on_position_close(account_name, symbol)
                # Also cleanup individual stop loss orders
                await self.stop_loss_tracker.cleanup_on_position_close(account_name, symbol)
            
            # Update cache with final result and set short expiration
            close_request_cache[cache_key] = result
            print(f"\n=== Fast Close Result: Success (Position: ✓, Orders: {'✓' if orders_cancelled else '⚠'}) ===")
            return result
                
        except Exception as e:
            # Handle any unexpected errors
            result = {
                "success": False,
                "error": str(e),
                "status": "error"
            }
            close_request_cache[cache_key] = result
            return result
        finally:
            # Clean up cache entry after a short delay to prevent immediate duplicates
            # but not block subsequent legitimate requests
            async def cleanup_cache():
                await asyncio.sleep(5)  # Wait 5 seconds
                close_request_cache.pop(cache_key, None)
                print(f"Cleaned up cache entry for {cache_key}")
            
            # Schedule cleanup (fire and forget)
            asyncio.create_task(cleanup_cache())

def import_time():
    """Import time module only when needed to avoid circular imports"""
    import time
    return time.time()

def clean_old_cache_entries():
    """Clean up old cache entries to prevent memory leaks"""
    import time
    current_time = time.time()
    # Keep entries for only 30 seconds instead of 10 minutes
    expiration_time = 30
    
    # Find keys to remove
    keys_to_remove = []
    for key, data in close_request_cache.items():
        if current_time - data.get("timestamp", 0) > expiration_time:
            keys_to_remove.append(key)
            
    # Remove expired entries
    for key in keys_to_remove:
        close_request_cache.pop(key, None)
        print(f"Auto-expired cache entry for {key}")

# Get enhanced close manager dependency
async def get_enhanced_close_manager(
    token_manager: TokenManager = Depends(get_token_manager),
    position_manager: PositionManager = Depends(get_position_manager),
    account_manager: AccountManager = Depends(get_account_manager),
    contract_manager: ContractManager = Depends(get_contract_manager),
    order_manager: OrderManager = Depends(get_order_manager)
) -> EnhancedCloseManager:
    """
    Create an EnhancedCloseManager instance with all dependencies.
    """
    return EnhancedCloseManager(
        token_manager=token_manager,
        position_manager=position_manager,
        account_manager=account_manager,
        contract_manager=contract_manager,
        order_manager=order_manager
    )

# Routes
@router.post("/close", response_model=ClosePositionResponse)
async def close_position(
    request: ClosePositionRequest,
    enhanced_close_manager: EnhancedCloseManager = Depends(get_enhanced_close_manager),
    account_manager: AccountManager = Depends(get_account_manager),
    contract_manager: ContractManager = Depends(get_contract_manager)
):
    """
    Close positions for a specific account and symbol.
    Uses optimized versions with caching for better performance.
    
    Note: Position closing is ALWAYS allowed for risk management purposes,
    even when trading restrictions are active.
    """
    try:
        # Get account and contract IDs from cache if possible
        account_id = await get_cached_account_id(request.accountName, account_manager)
        contract_id = await get_cached_contract_id(request.symbol, contract_manager)
        
        # Call the optimized method
        result = await enhanced_close_manager.close_positions_by_account_name_and_symbol_optimized(
            request.accountName,
            request.symbol,
            account_id,
            contract_id
        )
        
        # Check if this was a duplicate request
        if result.get("is_duplicate", False):
            return ClosePositionResponse(
                success=result.get("success", False),
                message="Duplicate request: This position close operation is already in progress",
                details=result
            )
            
        # Return the appropriate response
        if result.get("success", False):
            return ClosePositionResponse(
                success=True,
                message=result.get("message", "Positions closed successfully"),
                details=result.get("details")
            )
        else:
            return ClosePositionResponse(
                success=False,
                message="Failed to close positions",
                error=result.get("error", "Unknown error"),
                details=result.get("details")
            )
            
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            return ClosePositionResponse(
                success=False,
                message="No credentials provided",
                error="Missing credentials: Username and API key must be provided to connect to trading account"
            )
        # Re-raise other ValueErrors
        raise
    except Exception as e:
        return ClosePositionResponse(
            success=False,
            message="Error processing close position request",
            error=str(e)
        )

@router.post("/flatten", response_model=FlattenPositionResponse)
async def flatten_position(
    request: FlattenPositionRequest,
    close_manager: CloseManager = Depends(get_close_manager)
):
    """
    Flatten (close) a position by its ID using the direct API endpoint.
    Uses the provider's userapi endpoint for position closing.
    
    Note: Position flattening is ALWAYS allowed for risk management purposes,
    even when trading restrictions are active.
    """
    try:
        # Call the flatten_position method
        result = await close_manager.flatten_position(request.position_id)
        
        # Return the appropriate response
        if result.success:
            return FlattenPositionResponse(
                success=True,
                message=f"Position {request.position_id} flattened successfully using direct API",
                details={"position_id": request.position_id}
            )
        else:
            return FlattenPositionResponse(
                success=False,
                message=f"Failed to flatten position {request.position_id}",
                error=result.errorMessage or "Unknown error",
                details={"position_id": request.position_id, "error_code": result.errorCode}
            )
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            return FlattenPositionResponse(
                success=False,
                message="No credentials provided",
                error="Missing credentials: Username and API key must be provided to connect to trading account",
                details={"position_id": request.position_id}
            )
        # Re-raise other ValueErrors
        raise
    except Exception as e:
        return FlattenPositionResponse(
            success=False,
            message="Error flattening position",
            error=str(e),
            details={"position_id": request.position_id}
        )

@router.post("/flattenAll", response_model=FlattenPositionResponse)
async def flatten_all_positions(
    request: FlattenAllPositionsRequest,
    close_manager: CloseManager = Depends(get_close_manager),
    account_manager: AccountManager = Depends(get_account_manager)
):
    """
    Flatten (close) all open positions for a given account using the direct API endpoint.
    Uses the provider's userapi endpoint for position closing.
    
    Note: Position flattening is ALWAYS allowed for risk management purposes,
    even when trading restrictions are active.
    """
    try:
        # Check if both accountName and accountId are provided
        if request.accountName and request.accountId:
            return FlattenPositionResponse(
                success=False,
                message="You must provide either accountName or accountId, not both",
                error="Invalid account identifier",
                details={}
            )
        
        account_id = None
        account_name = None
        
        # Check if account ID is provided directly
        if request.accountId:
            account_id = request.accountId
            # Try to get account name for better feedback messages
            account = await account_manager.get_account_by_id(account_id)
            account_name = account.name if account else f"Account ID {account_id}"
        # Otherwise use account name
        elif request.accountName:
            account_name = request.accountName
            # Get account ID from name
            account_id = await account_manager.get_account_id_by_name(account_name)
            if not account_id:
                return FlattenPositionResponse(
                    success=False,
                    message=f"No account found with name '{account_name}'",
                    error=f"Invalid account name: {account_name}",
                    details={"account_name": account_name}
                )
        else:
            # Neither account name nor ID provided
            return FlattenPositionResponse(
                success=False,
                message="You must provide either accountName or accountId",
                error="Missing account identifier",
                details={}
            )
        
        # Now directly call the flatten_account_positions method with the account ID
        try:
            result = await close_manager.flatten_account_positions(account_id)
            
            return FlattenPositionResponse(
                success=result.success,
                message=f"All positions flattened for account {account_name} (ID: {account_id}) using direct API",
                details={
                    "account_id": account_id,
                    "account_name": account_name
                }
            )
        except ValueError as e:
            if "Username and API key must be provided" in str(e):
                return FlattenPositionResponse(
                    success=False,
                    message="No credentials provided",
                    error="Missing credentials: Username and API key must be provided to connect to trading account",
                    details={
                        "account_id": account_id,
                        "account_name": account_name
                    }
                )
            # Re-raise other ValueErrors
            raise
        except Exception as e:
            return FlattenPositionResponse(
                success=False,
                message=f"Failed to flatten positions for account {account_name} (ID: {account_id})",
                error=str(e),
                details={
                    "account_id": account_id,
                    "account_name": account_name
                }
            )
            
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            return FlattenPositionResponse(
                success=False,
                message="No credentials provided",
                error="Missing credentials: Username and API key must be provided to connect to trading account",
                details={"account": request.accountName or request.accountId}
            )
        # Re-raise other ValueErrors
        raise
    except Exception as e:
        account_info = request.accountName or request.accountId
        return FlattenPositionResponse(
            success=False,
            message="Error flattening all positions",
            error=str(e),
            details={"account": account_info}
        )

@router.get("/{account_name}", response_model=OpenPositionsResponse)
async def get_open_positions(
    account_name: str,
    order_manager: Annotated[OrderManager, Depends(get_order_manager)]
):
    """
    Get all open positions for a given account name.
    
    Args:
        account_name: The name of the account to get positions for
        
    Returns:
        List of position details and total count
    """
    try:
        positions = await order_manager.get_position_details_for_account_name(account_name)
        return {
            "positions": positions,
            "total_count": len(positions)
        }
    except Exception as e:
        raise HTTPException(
            status_code=404 if "Account not found" in str(e) else 500,
            detail=str(e)
        )

async def get_cached_account_id_fast(account_name: str, account_manager: AccountManager) -> int:
    """Ultra-fast account ID lookup with caching"""
    if account_name in account_name_to_id_cache:
        return account_name_to_id_cache[account_name]
    
    # Cache miss - fetch from API
    account_id = await account_manager.get_account_id_by_name(account_name)
    if account_id:
        account_name_to_id_cache[account_name] = account_id
    return account_id

async def get_cached_contract_id_fast(symbol: str, contract_manager: ContractManager) -> str:
    """Ultra-fast contract ID lookup with caching"""
    cache_key = symbol.lstrip("!")  # Normalize symbol
    if cache_key in symbol_to_contract_cache:
        return symbol_to_contract_cache[cache_key]
    
    # Cache miss - fetch from API
    contract_id = await contract_manager.get_first_contract_id(cache_key, live=False)
    if contract_id:
        symbol_to_contract_cache[cache_key] = contract_id
    return contract_id 

class FlattenAllForAccountRequest(BaseModel):
    accountName: str

class FlattenAllForAccountResponse(BaseModel):
    account_name: str
    orders_cancelled: list
    positions_closed: list
    errors: list

@router.post("/flattenAllForAccount", response_model=FlattenPositionResponse)
async def flatten_all_for_account(
    request: FlattenAllForAccountRequest,
    close_manager: CloseManager = Depends(get_close_manager)
):
    """
    Flatten (close) all open positions and cancel all open orders for a given account name.
    
    Note: Position flattening and order cancellation is ALWAYS allowed for risk management purposes,
    even when trading restrictions are active.
    """
    summary = await close_manager.flatten_all_for_account(request.accountName)
    
    # Determine success based on whether there are errors
    success = len(summary.get("errors", [])) == 0
    
    # Create a detailed message
    positions_count = len(summary.get("positions_closed", []))
    orders_count = len(summary.get("orders_cancelled", []))
    errors_count = len(summary.get("errors", []))
    
    if success:
        message = f"Successfully closed {positions_count} positions and cancelled {orders_count} orders for account {summary['account_name']}"
    else:
        message = f"Completed with {errors_count} errors: closed {positions_count} positions and cancelled {orders_count} orders for account {summary['account_name']}"
    
    return FlattenPositionResponse(
        success=success,
        message=message,
        error=None if success else f"{errors_count} errors occurred",
        details=summary
    ) 