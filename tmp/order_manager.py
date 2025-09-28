import asyncio
import json
import os
from typing import Dict, List, Optional, Union, Any, Literal
import uuid
from pydantic import BaseModel, Field
import httpx
from enum import Enum
from datetime import datetime, timezone

# Import the token manager
from .token_manager import TokenManager
from .account_manager import AccountManager
from .contract_manager import ContractManager
from ..utils.utils import is_trade_allowed, get_trading_hours_message
from ..utils.order_logger import OrderLogger
from .close_manager import CloseManager
from config.config import get_user_provider_config

# Define enums for order types and sides for better type safety
class OrderType(Enum):
    """Provider-native order type enumeration.

    Why: Centralizes valid order types and provides robust parsing from
    external inputs (strings/ints) to ensure type-safety throughout the
    order placement pipeline.
    """
    LIMIT = 1
    MARKET = 2
    STOP = 4
    TRAILING_STOP = 5
    JOIN_BID = 6
    JOIN_ASK = 7
    
    @classmethod
    def parse(cls, value: Union[str, int]) -> 'OrderType':
        """Parse an order type from string or int, case-insensitive."""
        if isinstance(value, int):
            for order_type in cls:
                if order_type.value == value:
                    return order_type
            raise ValueError(f"Invalid order type: {value}")
            
        if isinstance(value, str):
            value = value.upper().replace(" ", "_")
            for order_type in cls:
                if order_type.name == value:
                    return order_type
            raise ValueError(f"Invalid order type: {value}")
            
        raise TypeError(f"Expected str or int, got {type(value)}")

class OrderSide(Enum):
    """Order side (BUY/SELL) abstraction.

    Why: Normalizes user/broker representations (e.g., Buy/Bid, Sell/Ask)
    to a consistent internal enum for safer downstream logic.
    """
    BUY = 0
    SELL = 1
    
    @classmethod
    def parse(cls, value: Union[str, int]) -> 'OrderSide':
        """Parse an order side from string or int, case-insensitive."""
        if isinstance(value, int):
            for side in cls:
                if side.value == value:
                    return side
            raise ValueError(f"Invalid order side: {value}")
            
        if isinstance(value, str):
            value = value.upper()
            for side in cls:
                if side.name == value:
                    return side
                    
            # Handle common synonyms
            if value in ["BID", "B"]:
                return cls.BUY
            elif value in ["ASK", "S", "OFFER"]:
                return cls.SELL
                
            raise ValueError(f"Invalid order side: {value}")
            
        raise TypeError(f"Expected str or int, got {type(value)}")

# Define models for the API responses and requests
class PlaceOrderRequest(BaseModel):
    """Low-level provider request schema for placing an order.

    Why: Mirrors the provider's API contract for the final
    `/Order/place` call after all higher-level validations/mappings.
    """
    accountId: int
    contractId: str
    type: int
    side: int
    size: int
    limitPrice: Optional[float] = None
    stopPrice: Optional[float] = None
    trailPrice: Optional[float] = None
    customTag: Optional[str] = None
    linkedOrderId: Optional[int] = None
    
    class Config:
        extra = "ignore"  # Allow extra fields

class PlaceOrderResponse(BaseModel):
    """Canonical response model for provider order placement.

    Why: Ensures consistent parsing/validation of provider responses.
    """
    orderId: Optional[int] = None  # Optional because provider returns null on failures
    success: bool
    errorCode: int
    errorMessage: Optional[str] = None

class ModifyOrderRequest(BaseModel):
    """Low-level provider request schema for modifying an order.

    Why: Encapsulates only the fields the provider expects when modifying
    orders, preventing accidental extra-data submission.
    """
    accountId: int
    orderId: int
    size: Optional[int] = None
    limitPrice: Optional[float] = None
    stopPrice: Optional[float] = None
    trailPrice: Optional[float] = None
    
    class Config:
        extra = "ignore"  # Allow extra fields

class ModifyOrderResponse(BaseModel):
    """Response model for provider order modification results.

    Why: Normalizes success/error handling for order modifications.
    """
    success: bool
    errorCode: int
    errorMessage: Optional[str] = None

class MarketOrderPayload(BaseModel):
    """High-level order payload received from the API layer.

    Why: Represents user/API-facing order parameters before resolution of
    account/contract IDs and before mapping to provider-specific fields.
    Includes convenience coercions for booleans → "Y"/"N" strings.
    """
    accountName: str
    action: str  # "Buy" or "Sell"
    orderType: str  # "market", "limit", etc.
    symbol: str  # Contract symbol like "!NQ.1"
    qty: int
    limitPrice: Optional[float] = None
    stopPrice: Optional[float] = None
    takeProfit: Optional[float] = None
    trailingOffset: Optional[float] = None
    tradeTimeRanges: Optional[List[str]] = None
    avoidTradeTimeRanges: Optional[List[str]] = None
    closeExistingPosition: Optional[Union[str, bool]] = None  # "Y"/"N" or True/False
    closeExistingOrders: Optional[Union[str, bool]] = None  # "Y"/"N" or True/False
    # NEW OPTIONAL BREAK-EVEN FIELDS
    enableBreakEvenStop: Optional[str] = None  # "Y"/"N" (case insensitive)
    breakEvenActivationOffset: Optional[float] = None  # Points to trigger break-even

    class Config:
        extra = "ignore"  # Allow extra fields

    def __init__(self, **data):
        # Convert boolean values to "Y"/"N" strings
        if "closeExistingPosition" in data and isinstance(data["closeExistingPosition"], bool):
            data["closeExistingPosition"] = "Y" if data["closeExistingPosition"] else "N"
        if "closeExistingOrders" in data and isinstance(data["closeExistingOrders"], bool):
            data["closeExistingOrders"] = "Y" if data["closeExistingOrders"] else "N"
        super().__init__(**data)

class OrderSearchRequest(BaseModel):
    """Provider request model to search open orders by account.

    Why: Minimal wrapper around provider search API contract.
    """
    accountId: int

class OrderSearchResponse(BaseModel):
    """Provider response model for open orders search.

    Why: Provides typed access to orders and error information.
    """
    orders: List[Dict[str, Any]]
    success: bool
    errorCode: int
    errorMessage: Optional[str] = None

class OpenPosition(BaseModel):
    """Lightweight view for an open position reference.

    Why: Used to track unique account/contract tuples from open orders.
    """
    accountId: int
    contractId: str

class PositionDetails(BaseModel):
    """Detailed view of a position returned by the provider.

    Why: Enables downstream consumers to access normalized position data.
    """
    id: int
    accountId: int
    contractId: str
    creationTimestamp: str
    type: int
    size: int
    averagePrice: float

class OrderManager:
    """Facade for all order-related operations against the provider.

    Why: Centralizes order placement/modify/cancel logic, enforces trading
    restriction checks, normalizes payloads, appends unique customTag UUIDs
    for traceability, and logs operations consistently.
    """
    def __init__(self, token_manager: TokenManager):
        self.token_manager = token_manager
        self.provider = token_manager.provider
        self.order_logger = OrderLogger()
        self.close_manager = CloseManager(token_manager)

    async def place_order(
        self,
        account_id: int,
        contract_id: str,
        order_type: Union[str, int, OrderType],
        side: Union[str, int, OrderSide],
        size: int,
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
        trail_price: Optional[float] = None,
        custom_tag: Optional[str] = None,
        linked_order_id: Optional[int] = None
    ) -> PlaceOrderResponse:
        """Place an order.

        Why: This is the single low-level gateway that sends the final
        provider-specific payload to `/Order/place`. All order variants
        ultimately route here. It appends a UUID to `customTag` to ensure
        every order can be uniquely traced across systems and logs.

        Args:
            account_id: The account ID to place the order for
            contract_id: The contract ID to place the order for
            order_type: The type of order (Limit, Market, Stop, TrailingStop, JoinBid, JoinAsk)
            side: The side of the order (Buy/Bid or Sell/Ask)
            size: The size of the order
            limit_price: The limit price for limit orders
            stop_price: The stop price for stop orders
            trail_price: The trail price for trailing stop orders
            custom_tag: An optional custom tag for the order
            linked_order_id: The linked order ID (for OCO orders)
            
        Returns:
            PlaceOrderResponse containing the order ID and success status
        """
        # Parse order type and side
        if not isinstance(order_type, OrderType):
            order_type = OrderType.parse(order_type)
            
        if not isinstance(side, OrderSide):
            side = OrderSide.parse(side)
            
        # Validate required parameters based on order type
        if order_type == OrderType.LIMIT and limit_price is None:
            raise ValueError("Limit price is required for limit orders")
            
        if order_type == OrderType.STOP and stop_price is None:
            raise ValueError("Stop price is required for stop orders")
            
        if order_type == OrderType.TRAILING_STOP and trail_price is None:
            raise ValueError("Trail price is required for trailing stop orders")
            
        # ===== EVENT-BASED TRADING VALIDATION =====
        # Validate that trading is allowed based on all restrictions (hours, sessions, events)
        validation_result = validate_trading_with_all_restrictions()
        if not validation_result["overall_allowed"]:
            error_message = get_enhanced_trading_hours_message()
            raise ValueError(f"Trading is blocked by {validation_result['primary_blocker']}: {error_message}")
            
        # Format price values - we want whole numbers with .00 suffix
        def format_price(price):
            if price is None:
                return None
                
            # Convert to string and remove commas
            price_str = str(price).replace(',', '')
            
            # Extract the whole number part (before decimal)
            if '.' in price_str:
                whole_part = price_str.split('.')[0]
            else:
                whole_part = price_str
                
            # Return as integer with .00 suffix directly formatted as float
            return float(whole_part + ".00")
            
        # Apply price formatting to all price parameters
        if limit_price is not None:
            limit_price = format_price(limit_price)
            
        if stop_price is not None:
            stop_price = format_price(stop_price)
            
        if trail_price is not None:
            trail_price = format_price(trail_price)
            
        # Prepare request
        payload = {
            "accountId": account_id,
            "contractId": contract_id,
            "type": order_type.value,
            "side": side.value,
            "size": size
        }
        
        # Add optional parameters if provided
        if limit_price is not None:
            payload["limitPrice"] = limit_price
            
        if stop_price is not None:
            payload["stopPrice"] = stop_price
            
        if trail_price is not None:
            payload["trailPrice"] = trail_price
        
        # Always include a unique customTag with UUID for traceability
        unique_id = str(uuid.uuid4())
        if custom_tag is not None and str(custom_tag).strip():
            payload["customTag"] = f"{custom_tag} | {unique_id}"
        else:
            payload["customTag"] = f"API Order for {contract_id} | {unique_id}"
        
        if linked_order_id is not None:
            payload["linkedOrderId"] = linked_order_id
        
        # Print formatted payload for debugging
        print(f"Sending order with payload: {json.dumps(payload, indent=2)}")
            
        # Call API to place order
        endpoint = "/Order/place"
        
        response = await self.token_manager.perform_authenticated_request(
            "POST",
            endpoint,
            json=payload
        )
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to place order ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        return PlaceOrderResponse(**data)
    
    async def place_market_order(
        self,
        account_id: int,
        contract_id: str,
        side: Union[str, int, OrderSide],
        size: int,
        custom_tag: Optional[str] = None
    ) -> PlaceOrderResponse:
        """Place a market order (convenience wrapper).

        Why: Simplifies callers by pre-filling the order type while still
        delegating to `place_order` for unified validation and UUID tagging.

        Args:
            account_id: The account ID to place the order for
            contract_id: The contract ID to place the order for
            side: The side of the order (Buy/Bid or Sell/Ask)
            size: The size of the order
            custom_tag: An optional custom tag for the order
            
        Returns:
            PlaceOrderResponse containing the order ID and success status
        """
        return await self.place_order(
            account_id=account_id,
            contract_id=contract_id,
            order_type=OrderType.MARKET,
            side=side,
            size=size,
            custom_tag=custom_tag
        )

    async def place_market_order_from_payload(
        self,
        payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Place a market order using a high-level payload.

        Why: Allows the API layer to submit user-friendly payloads. This
        method performs trading restrictions checks, resolves account and
        contract IDs, handles optional pre-close logic, and routes to
        `place_market_order` which ensures UUID-tagged `customTag`.

        Args:
            payload: The order payload containing account info, symbol, and order details
            
        Returns:
            A dictionary with order status and filled price information
        """
        print("Debug - Entering place_market_order_from_payload")
        print(f"Debug - Received payload: {payload}")
        
        # Parse the payload
        try:
            order_data = MarketOrderPayload(**payload)
            print(f"Debug - Successfully parsed payload into order_data: {order_data}")
        except Exception as e:
            print(f"Debug - Error parsing payload: {str(e)}")
            raise
        
        # Step 1: Check if trading is allowed based on time ranges
        # Load global sessions configuration
        sessions_config = load_trading_sessions_config()
        
        # Load trading hours configuration (the new frontend config)
        trading_hours_config = load_trading_hours_config()
        
        # Check trading hours restrictions first
        if trading_hours_config.get('restrict_hours', False):
            import datetime
            now = datetime.datetime.utcnow()
            current_minutes = now.hour * 60 + now.minute
            start_minutes = trading_hours_config.get('start_hour', 0) * 60 + trading_hours_config.get('start_minute', 0)
            end_minutes = trading_hours_config.get('end_hour', 23) * 60 + trading_hours_config.get('end_minute', 59)
            
            hours_allowed = True
            if start_minutes <= end_minutes:
                hours_allowed = start_minutes <= current_minutes <= end_minutes
            else:
                # Overnight range
                hours_allowed = current_minutes >= start_minutes or current_minutes <= end_minutes
            
            if not hours_allowed:
                start_time = f"{trading_hours_config.get('start_hour', 0):02d}:{trading_hours_config.get('start_minute', 0):02d}"
                end_time = f"{trading_hours_config.get('end_hour', 23):02d}:{trading_hours_config.get('end_minute', 59):02d}"
                return {
                    "success": False,
                    "error": f"Trading is restricted to the hours between {start_time} GMT and {end_time} GMT. Current time: {now.strftime('%H:%M')} GMT"
                }
        
        # Combine payload time ranges with global sessions config
        allowed_ranges = list(order_data.tradeTimeRanges or [])
        restricted_ranges = list(order_data.avoidTradeTimeRanges or [])
        
        # Check session-based trading if enabled
        if sessions_config.get('enabled', False):
            session_allowed_ranges = sessions_config.get('allowed_sessions', [])
            session_restricted_ranges = sessions_config.get('restricted_sessions', [])
            
            # Use GMT-based session validation
            if not is_session_trading_allowed_gmt(session_allowed_ranges, session_restricted_ranges):
                return {
                    "success": False,
                    "error": "Trading is not allowed during the current session time period (GMT-based validation)"
                }

        # ===== NEW: Event-based trading validation =====
        # Validate that trading is allowed based on event restrictions
        validation_result = validate_trading_with_all_restrictions()
        if not validation_result["overall_allowed"]:
            error_message = get_enhanced_trading_hours_message()
            return {
                "success": False,
                "error": f"Trading is blocked by {validation_result['primary_blocker']}: {error_message}",
                "validation_details": validation_result
            }
        
        # Check payload-specific time ranges (if any) using the original function
        if allowed_ranges or restricted_ranges:
            if not is_trade_allowed(allowed_ranges, restricted_ranges):
                return {
                    "success": False,
                    "error": get_trading_hours_message()
                }
        
        # Create account manager and contract manager
        account_manager = AccountManager(self.token_manager)
        contract_manager = ContractManager(self.token_manager)
        
        # Step 2: Check if account exists
        account_id = await account_manager.get_account_id_by_name(order_data.accountName)
        if not account_id:
            return {
                "success": False, 
                "error": f"Account not found: {order_data.accountName}"
            }
        
        # Step 3: Get contract ID from symbol
        # For symbols like "!NQ.1", we strip the "!" prefix if present
        search_symbol = order_data.symbol.lstrip("!")
        contract_id = await contract_manager.get_first_contract_id(search_symbol, live=False)
        if not contract_id:
            return {
                "success": False, 
                "error": f"Contract not found for symbol: {order_data.symbol}"
            }
        
        # Handle closing existing positions and orders if requested
        print(f"Debug - closeExistingOrders value: {order_data.closeExistingOrders}")
        print(f"Debug - closeExistingPosition value: {order_data.closeExistingPosition}")
        
        should_close = (
            (order_data.closeExistingPosition and order_data.closeExistingPosition.upper() == "Y") or
            (order_data.closeExistingOrders and order_data.closeExistingOrders.upper() == "Y")
        )
        print(f"Debug - should_close value: {should_close}")
        
        if should_close:
            # Close all positions and orders for this symbol using CloseManager
            print(f"Closing positions and orders for {order_data.accountName} and {order_data.symbol}")
            close_payload = {
                "accountName": order_data.accountName,
                "symbol": order_data.symbol
            }
            await self.close_manager.close_positions_by_account_name_and_symbol(close_payload)
    
        # Step 4: Place the order
        try:
            order_response = await self.place_market_order(
                account_id=account_id,
                contract_id=contract_id,
                side=order_data.action,  # "Buy" or "Sell"
                size=order_data.qty,
                custom_tag=f"API Order for {order_data.symbol}"
            )
            
            if not order_response.success:
                return {
                    "success": False,
                    "error": order_response.errorMessage or "Unknown error",
                    "errorCode": order_response.errorCode
                }
            
            # Step 5: Get the filled price - market orders are filled immediately
            # For market orders, we need to fetch the position to get the fill price
            from .position_manager import PositionManager
            position_manager = PositionManager(self.token_manager)
            # Wait a brief moment for the order to be processed
            #await asyncio.sleep(0.5)
            
            # Get the average price for the contract
            avg_price = await position_manager.get_average_price(
                account_id=account_id, 
                contract_id=contract_id
            )
            
            return {
                "success": True,
                "orderId": order_response.orderId,
                "accountId": account_id,
                "contractId": contract_id,
                "filledPrice": avg_price,
                "message": f"Market order placed and filled at {avg_price if avg_price else 'unknown'} price"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
            
    async def placeMarketOrder(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for place_market_order_from_payload for legacy callers.

        Why: Maintains backward compatibility with existing call sites while
        reusing the same validation and execution path.
        """
        return await self.place_market_order_from_payload(payload)

    async def _get_fill_price_with_retry(
        self,
        account_id: int,
        contract_id: str,
        max_retries: int = 3,
        retry_delay: float = 0.5
    ) -> Optional[float]:
        """Get fill price with retries to ensure a valid value.

        Why: Provider fill prices may not be immediately available; retrying
        improves robustness when chaining protective orders after entries.

        Args:
            account_id: The account ID
            contract_id: The contract ID
            max_retries: Maximum number of retries
            retry_delay: Delay between retries in seconds
            
        Returns:
            The fill price if successful, None otherwise
        """
        from .position_manager import PositionManager
        position_manager = PositionManager(self.token_manager)
        
        for attempt in range(max_retries):
            try:
                avg_price = await position_manager.get_average_price(
                    account_id=account_id,
                    contract_id=contract_id
                )
                
                if avg_price and avg_price > 0:
                    return avg_price
                    
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    
            except Exception as e:
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                continue
                
        return None

    async def placeMarketOrderWithStopLoss(self, payload: Dict[str, Any], stop_loss_distance: float = None) -> Dict[str, Any]:
        """Market entry followed by placing a stop loss order.

        Why: Encapsulates a common workflow (entry + protection) and ensures
        prices are formatted/validated. Uses `place_order` (UUID tagging) for
        the protective order and logs a consistent combined result.
        """
        # Step 1: Place the market order
        market_order_result = await self.placeMarketOrder(payload)
        
        # If market order failed, return the error
        if not market_order_result.get("success", False):
            return market_order_result
        
        # Step 2: Extract necessary information from the market order result
        account_id = market_order_result["accountId"]
        contract_id = market_order_result["contractId"]
        
        # Step 3: Get fill price with retries
        filled_price = await self._get_fill_price_with_retry(account_id, contract_id)
        
        # If we couldn't get the filled price, we can't place a stop loss
        if filled_price is None:
            market_order_result["warning"] = "Market order placed but could not determine valid fill price for stop loss after multiple retries"
            return market_order_result
        
        # Step 4: Get stop loss distance from payload if not provided as parameter
        if stop_loss_distance is None:
            stop_loss_distance = payload.get("stopPrice")
            if stop_loss_distance is None:
                market_order_result["warning"] = "Market order placed but no stop loss distance provided in payload or parameter"
                return market_order_result
        
        # Step 5: Calculate stop price based on order direction
        is_long = payload["action"].upper() in ["BUY", "B"]
        
        # For long positions, stop is below the filled price
        # For short positions, stop is above the filled price
        stop_price = filled_price - stop_loss_distance if is_long else filled_price + stop_loss_distance
        
        # Format prices to have only whole numbers with .00
        def format_price_for_api(price):
            # Convert to string and remove any existing commas
            price_str = str(price).replace(',', '')
            
            # Extract the whole number part (before decimal)
            if '.' in price_str:
                whole_part = price_str.split('.')[0]
            else:
                whole_part = price_str
                
            # Format with commas for thousands and add .00
            # Integer value for API calculation
            formatted_price = float(whole_part + ".00")
            
            return formatted_price
        
        # Apply formatting to all prices
        filled_price = format_price_for_api(filled_price)
        stop_price = format_price_for_api(stop_price)
        stop_loss_distance = format_price_for_api(stop_loss_distance)
        
        # Ensure stop price is positive
        stop_price = max(1.00, stop_price)
        
        # Step 6: Place the stop loss order (opposite side of the market order)
        stop_side = OrderSide.SELL if is_long else OrderSide.BUY
        
        try:
            stop_order_response = await self.place_order(
                account_id=account_id,
                contract_id=contract_id,
                order_type=OrderType.STOP,
                side=stop_side,
                size=payload["qty"],
                stop_price=stop_price,
                custom_tag=f"Stop Loss for {payload.get('symbol', 'Unknown')} at {stop_price}",
                linked_order_id=market_order_result["orderId"]
            )
            
            # Step 7: Combine results
            result = {
                "success": True,
                "marketOrder": {
                    "orderId": market_order_result["orderId"],
                    "filledPrice": filled_price,
                    "side": payload["action"]
                },
                "stopLossOrder": {
                    "orderId": stop_order_response.orderId,
                    "stopPrice": stop_price,
                    "side": "SELL" if is_long else "BUY",
                    "success": stop_order_response.success
                },
                "message": f"Market order filled at {filled_price} with stop loss at {stop_price}"
            }
            
            # Step 8: Log the order details
            order_details = {
                "orderType": "placeMarketOrderWithStopLoss",
                "symbol": payload.get("symbol", ""),
                "contractId": contract_id,
                "accountId": account_id,
                "accountName": payload.get("accountName", ""),
                "position": "LONG" if is_long else "SHORT",
                "qty": payload["qty"],
                "filledPrice": filled_price,
                "marketOrder": {
                    "orderId": market_order_result["orderId"],
                    "side": payload["action"]
                },
                "stopLossOrder": {
                    "orderId": stop_order_response.orderId,
                    "stopPrice": stop_price,
                    "side": "SELL" if is_long else "BUY",
                    "success": stop_order_response.success
                }
            }
            
            # Log the order details asynchronously
            asyncio.create_task(self.order_logger.log_order(order_details))
            
            return result
            
        except Exception as e:
            # Market order was placed, but stop loss failed
            market_order_result["success"] = True  # Market order was successful
            market_order_result["warning"] = f"Market order placed but stop loss order failed: {str(e)}"
            return market_order_result

    async def placeMarketOrderWithTrailStop(self, payload: Dict[str, Any], trail_distance: float = None) -> Dict[str, Any]:
        """Market entry followed by placing a trailing stop order.

        Why: Provides a first-class flow for dynamic protection. Uses
        `place_order` (UUID tagging) for the trailing order and logs results.
        """
        # Step 1: Place the market order
        market_order_result = await self.placeMarketOrder(payload)
        
        # If market order failed, return the error
        if not market_order_result.get("success", False):
            return market_order_result
        
        # Step 2: Extract necessary information from the market order result
        account_id = market_order_result["accountId"]
        contract_id = market_order_result["contractId"]
        
        # Step 3: Get fill price with retries
        filled_price = await self._get_fill_price_with_retry(account_id, contract_id)
        
        # If we couldn't get the filled price, we can't place a trailing stop
        if filled_price is None:
            market_order_result["warning"] = "Market order placed but could not determine valid fill price for trailing stop after multiple retries"
            return market_order_result
        
        # Step 4: Get trail distance from payload if not provided as parameter
        if trail_distance is None:
            trail_distance = payload.get("trailingOffset")
            if trail_distance is None:
                market_order_result["warning"] = "Market order placed but no trailing stop distance provided in payload or parameter"
                return market_order_result
        
        # Step 5: Determine if this is a long or short position
        is_long = payload["action"].upper() in ["BUY", "B"]
        
        # Format prices to have only whole numbers with .00
        def format_price_for_api(price):
            # Convert to string and remove any existing commas
            price_str = str(price).replace(',', '')
            
            # Extract the whole number part (before decimal)
            if '.' in price_str:
                whole_part = price_str.split('.')[0]
            else:
                whole_part = price_str
                
            # Format with commas for thousands and add .00
            # Integer value for API calculation
            formatted_price = float(whole_part + ".00")
            
            return formatted_price
        
        # Apply formatting to prices
        filled_price = format_price_for_api(filled_price)
        trail_distance = format_price_for_api(trail_distance)
        
        # Calculate activation price based on filled price and direction
        activation_price = filled_price - trail_distance if is_long else filled_price + trail_distance
        
        # Format activation price
        activation_price = format_price_for_api(activation_price)
        
        # Ensure activation price is positive
        activation_price = max(1.00, activation_price)
        
        # Step 6: Place the trailing stop order (opposite side of the market order)
        trail_side = OrderSide.SELL if is_long else OrderSide.BUY
        
        try:
            trail_order_response = await self.place_order(
                account_id=account_id,
                contract_id=contract_id,
                order_type=OrderType.TRAILING_STOP,
                side=trail_side,
                size=payload["qty"],
                trail_price=activation_price,
                linked_order_id=market_order_result["orderId"]
            )
            
            # Step 7: Combine results
            result = {
                "success": True,
                "marketOrder": {
                    "orderId": market_order_result["orderId"],
                    "filledPrice": filled_price,
                    "side": payload["action"]
                },
                "trailStopOrder": {
                    "orderId": trail_order_response.orderId,
                    "trailDistance": trail_distance,
                    "activationPrice": activation_price,
                    "filledPrice": filled_price,
                    "side": "SELL" if is_long else "BUY",
                    "success": trail_order_response.success
                },
                "message": f"Market order filled at {filled_price} with trailing stop at distance {trail_distance}"
            }
            
            # Step 8: Log the order details
            order_details = {
                "orderType": "placeMarketOrderWithTrailStop",
                "symbol": payload.get("symbol", ""),
                "contractId": contract_id,
                "accountId": account_id,
                "accountName": payload.get("accountName", ""),
                "position": "LONG" if is_long else "SHORT",
                "qty": payload["qty"],
                "filledPrice": filled_price,
                "marketOrder": {
                    "orderId": market_order_result["orderId"],
                    "side": payload["action"]
                },
                "trailStopOrder": {
                    "orderId": trail_order_response.orderId,
                    "trailDistance": trail_distance,
                    "activationPrice": activation_price,
                    "filledPrice": filled_price,
                    "side": "SELL" if is_long else "BUY",
                    "success": trail_order_response.success
                }
            }
            
            # Log the order details asynchronously
            asyncio.create_task(self.order_logger.log_order(order_details))
            
            return result
            
        except Exception as e:
            # Market order was placed, but trailing stop failed
            market_order_result["success"] = True  # Market order was successful
            market_order_result["warning"] = f"Market order placed but trailing stop order failed: {str(e)}"
            return market_order_result

    async def placeBracketOrderWithTopStepX(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Market entry then set stop loss and take profit via TopStepX API.

        Why: Uses the provider's dedicated endpoint for post-entry risk
        settings. Fills in prices, validates, and returns a consolidated view.
        """
        # Step 1: Place the market order
        market_order_result = await self.placeMarketOrder(payload)
        
        # If market order failed, return the error
        if not market_order_result.get("success", False):
            return market_order_result
        
        # Step 2: Extract necessary information from the market order result
        account_id = market_order_result["accountId"]
        contract_id = market_order_result["contractId"]
        filled_price = market_order_result.get("filledPrice")
        
        # If we couldn't get the filled price, we can't set stop loss and take profit
        if filled_price is None:
            market_order_result["warning"] = "Market order placed but could not determine filled price for stop loss/take profit"
            return market_order_result
        
        # Step 3: Get the position ID for the account name
        from .position_manager import PositionManager
        position_manager = PositionManager(self.token_manager)
        position_id = await position_manager.getPositionIDForAccountName(
            account_name=payload["accountName"],
            contract_id=contract_id
        )
        
        if not position_id:
            market_order_result["warning"] = f"Market order placed but could not find position ID for account {payload['accountName']}"
            return market_order_result
        
        # Step 4: Calculate stop loss and take profit prices
        is_long = payload["action"].upper() in ["BUY", "B"]
        
        # Get the stop distance and take profit distance from payload
        stop_distance = payload.get("stopPrice")
        take_profit_distance = payload.get("takeProfit")
        
        # If not provided, can't set stops
        if stop_distance is None or take_profit_distance is None:
            market_order_result["warning"] = "Market order placed but stopPrice or takeProfit not provided in payload"
            return market_order_result
            
        # Calculate actual price levels based on order type
        if is_long:
            # For long positions, stop is below filled price and take profit is above
            stop_price = filled_price - stop_distance
            take_profit = filled_price + take_profit_distance
        else:
            # For short positions, stop is above filled price and take profit is below
            stop_price = filled_price + stop_distance
            take_profit = filled_price - take_profit_distance
            
        # Round prices to whole numbers by removing decimal places
        stop_price = int(stop_price)
        take_profit = int(take_profit)
        
        # Ensure prices are positive
        stop_price = max(1, stop_price)
        take_profit = max(1, take_profit)
        
        # Step 5: Make a direct API call to set stop loss and take profit
        try:
            # Get the auth token
            token = await self.token_manager.get_token()
            
            # Create headers with the authorization token
            headers = {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/json",
                "authorization": f"Bearer {token}"
            }
            
            # Prepare the request payload
            stop_loss_data = {
                "positionId": position_id,
                "stopLoss": stop_price,
                "takeProfit": take_profit
            }
            
            # Make the direct API call to TopStepX
            async with httpx.AsyncClient() as client:
                # Get provider configuration and use userapi_endpoint
                provider_config = get_user_provider_config()
                response = await client.post(
                    f"{provider_config['userapi_endpoint']}/Order/editStopLossAccount",
                    headers=headers,
                    json=stop_loss_data
                )
            
            # Check if the request was successful
            if response.status_code != 200:
                market_order_result["warning"] = f"Market order placed but failed to set stop loss/take profit: {response.text}"
                return market_order_result
                
            response_data = response.json()
            
            # Step 6: Combine results
            return {
                "success": True,
                "marketOrder": {
                    "orderId": market_order_result["orderId"],
                    "filledPrice": filled_price,
                    "side": payload["action"]
                },
                "bracketOrder": {
                    "positionId": position_id,
                    "stopLoss": stop_price,
                    "takeProfit": take_profit,
                    "success": response_data.get("success", False)
                },
                "message": f"Market order filled at {filled_price} with stop loss at {stop_price} and take profit at {take_profit}"
            }
            
        except Exception as e:
            # Market order was placed, but bracket order failed
            market_order_result["success"] = True  # Market order was successful
            market_order_result["warning"] = f"Market order placed but failed to set stop loss/take profit: {str(e)}"
            return market_order_result

    async def placeBracketOrder(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Bracket order flow: market entry + stop loss + take profit orders.

        Why: Implements a classic bracket setup using separate provider orders,
        leveraging `place_order` (UUID tagging) for both protective legs.
        """
        # Step 1: Place the market order
        market_order_result = await self.placeMarketOrder(payload)
        
        # If market order failed, return the error
        if not market_order_result.get("success", False):
            return market_order_result
        
        # Step 2: Extract necessary information from the market order result
        account_id = market_order_result["accountId"]
        contract_id = market_order_result["contractId"]
        
        # Step 3: Get fill price with retries
        filled_price = await self._get_fill_price_with_retry(account_id, contract_id)
        
        # If we couldn't get the filled price, we can't place stop loss and take profit
        if filled_price is None:
            market_order_result["warning"] = "Market order placed but could not determine valid fill price for bracket order after multiple retries"
            return market_order_result
        
        # Step 4: Get stop loss and take profit distances from payload
        stop_loss_distance = payload.get("stopPrice")
        take_profit_distance = payload.get("takeProfit")
        
        if stop_loss_distance is None or take_profit_distance is None:
            market_order_result["warning"] = "Market order placed but stop loss distance or take profit distance not provided in payload"
            return market_order_result
        
        # Step 5: Determine if this is a long or short position
        is_long = payload["action"].upper() in ["BUY", "B"]
        
        # Calculate stop loss and take profit prices based on position direction
        if is_long:
            # For long positions, stop loss is below filled price, take profit is above
            stop_price = filled_price - stop_loss_distance
            take_profit_price = filled_price + take_profit_distance
        else:
            # For short positions, stop loss is above filled price, take profit is below
            stop_price = filled_price + stop_loss_distance
            take_profit_price = filled_price - take_profit_distance
        
        # Step 6: Place the stop loss order (opposite side of the market order)
        stop_side = OrderSide.SELL if is_long else OrderSide.BUY
        
        try:
            stop_order_response = await self.place_order(
                account_id=account_id,
                contract_id=contract_id,
                order_type=OrderType.STOP,
                side=stop_side,
                size=payload["qty"],
                stop_price=stop_price,
                custom_tag=f"Bracket Stop Loss for {payload.get('symbol', 'Unknown')} at {stop_price}",
                linked_order_id=market_order_result["orderId"]
            )
            
            # Step 7: Place the take profit order (limit order, opposite side of market order)
            take_profit_order_response = await self.place_order(
                account_id=account_id,
                contract_id=contract_id,
                order_type=OrderType.LIMIT,
                side=stop_side,  # Same side as stop loss (opposite of entry)
                size=payload["qty"],
                limit_price=take_profit_price,
                custom_tag=f"Bracket Take Profit for {payload.get('symbol', 'Unknown')} at {take_profit_price}",
                linked_order_id=market_order_result["orderId"]
            )
            
            # Step 8: Combine results
            result = {
                "success": True,
                "type": "bracket",
                "marketOrder": {
                    "orderId": market_order_result["orderId"],
                    "filledPrice": filled_price,
                    "side": payload["action"]
                },
                "stopLossOrder": {
                    "orderId": stop_order_response.orderId,
                    "stopPrice": stop_price,
                    "side": "SELL" if is_long else "BUY",
                    "success": stop_order_response.success
                },
                "takeProfitOrder": {
                    "orderId": take_profit_order_response.orderId,
                    "limitPrice": take_profit_price,
                    "side": "SELL" if is_long else "BUY",
                    "success": take_profit_order_response.success
                },
                "message": f"Bracket order placed: Market {payload['action']} filled at {filled_price}, Stop Loss at {stop_price}, Take Profit at {take_profit_price}"
            }
            
            # Step 9: Log the order details
            order_details = {
                "orderType": "placeBracketOrder",
                "symbol": payload.get("symbol", ""),
                "contractId": contract_id,
                "accountId": account_id,
                "accountName": payload.get("accountName", ""),
                "position": "LONG" if is_long else "SHORT",
                "qty": payload["qty"],
                "filledPrice": filled_price,
                "marketOrder": {
                    "orderId": market_order_result["orderId"],
                    "side": payload["action"]
                },
                "stopLossOrder": {
                    "orderId": stop_order_response.orderId,
                    "stopPrice": stop_price,
                    "side": "SELL" if is_long else "BUY",
                    "success": stop_order_response.success
                },
                "takeProfitOrder": {
                    "orderId": take_profit_order_response.orderId,
                    "limitPrice": take_profit_price,
                    "side": "SELL" if is_long else "BUY",
                    "success": take_profit_order_response.success
                }
            }
            
            # Log the order details asynchronously
            asyncio.create_task(self.order_logger.log_order(order_details))
            
            return result
            
        except Exception as e:
            # Market order was placed, but bracket orders failed
            market_order_result["success"] = True  # Market order was successful
            market_order_result["warning"] = f"Market order placed but bracket orders failed: {str(e)}"
            return market_order_result 

    async def search_open_orders(
        self, 
        account_id: int
    ) -> OrderSearchResponse:
        """Search open orders for an account via provider API.

        Why: Supports order management UIs and post-trade checks.
        """
        endpoint = "/Order/searchOpen"
        payload = OrderSearchRequest(accountId=account_id).dict()
        
        response = await self.token_manager.perform_authenticated_request(
            "POST",
            endpoint,
            json=payload
        )
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to search orders ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        return OrderSearchResponse(**data)

    async def get_open_positions_for_account(
        self, 
        account_id: int
    ) -> List[OpenPosition]:
        """Return a unique list of account/contract open position tuples.

        Why: Simplifies mapping orders to positions without full position data.
        """
        endpoint = "/Order/searchOpen"
        payload = {"accountId": account_id}
        
        response = await self.token_manager.perform_authenticated_request(
            "POST",
            endpoint,
            json=payload
        )
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to get open positions ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        
        if not data.get("success", False):
            raise Exception(f"Failed to get open positions: {data.get('errorMessage', 'Unknown error')}")
            
        # Extract unique account and contract IDs from orders
        positions = []
        seen_contracts = set()
        
        for order in data.get("orders", []):
            contract_id = order.get("contractId")
            if contract_id and contract_id not in seen_contracts:
                positions.append(OpenPosition(
                    accountId=account_id,
                    contractId=contract_id
                ))
                seen_contracts.add(contract_id)
                
        return positions

    async def get_open_positions_for_account_name(
        self, 
        account_name: str
    ) -> List[OpenPosition]:
        """Get open positions using account name (resolves to account ID).

        Why: Convenience overload for client code that works with names.
        """
        # Create account manager to get account ID
        account_manager = AccountManager(self.token_manager)
        
        # Get account ID from name
        account_id = await account_manager.get_account_id_by_name(account_name)
        if not account_id:
            raise Exception(f"Account not found with name: {account_name}")
            
        # Use the existing method to get positions
        return await self.get_open_positions_for_account(account_id)

    async def get_position_details_for_account_name(
        self, 
        account_name: str
    ) -> List[PositionDetails]:
        """Return detailed position information by account name.

        Why: Provides a higher-fidelity view for analytics and UIs.
        """
        # Create account manager to get account ID
        account_manager = AccountManager(self.token_manager)
        
        # Get account ID from name
        account_id = await account_manager.get_account_id_by_name(account_name)
        if not account_id:
            raise Exception(f"Account not found with name: {account_name}")
            
        # Create position manager to get position details
        from .position_manager import PositionManager
        position_manager = PositionManager(self.token_manager)
        
        # Get open positions for the account
        positions_response = await position_manager.search_open_positions(account_id)
        
        # Convert positions to PositionDetails objects
        position_details = []
        for position in positions_response.positions:
            position_details.append(PositionDetails(
                id=position.id,
                accountId=account_id,
                contractId=position.contractId,
                creationTimestamp=position.creationTimestamp,
                type=position.type,
                size=position.size,
                averagePrice=position.averagePrice
            ))
            
        return position_details 

    async def search_open_orders_by_account_name_and_symbol(
        self,
        account_name: str,
        symbol: str
    ) -> OrderSearchResponse:
        """Search open orders filtered by account name and symbol.

        Why: Useful for symbol-scoped UIs or to detect conflicting orders
        before placing new ones.
        """
        # Get the account ID from the account name
        account_manager = AccountManager(self.token_manager)
        account_id = await account_manager.get_account_id_by_name(account_name)
        if not account_id:
            print(f"Error: No account found with name '{account_name}'")
            return OrderSearchResponse(
                orders=[],
                success=False,
                errorCode=-1,
                errorMessage=f"No account found with name '{account_name}'"
            )
        
        # Get the contract ID from the symbol
        contract_manager = ContractManager(self.token_manager)
        # For symbols like "!NQ.1", we strip the "!" prefix if present
        search_symbol = symbol.lstrip("!")
        contract_id = await contract_manager.get_first_contract_id(search_symbol, live=False)
        if not contract_id:
            print(f"Error: Contract not found for symbol: {symbol}")
            return OrderSearchResponse(
                orders=[],
                success=False,
                errorCode=-1,
                errorMessage=f"Contract not found for symbol: {symbol}"
            )
        
        # Get all open orders for the account
        response = await self.search_open_orders(account_id)
        
        # Filter orders to only include those matching the contract ID
        if response.success:
            filtered_orders = [
                order for order in response.orders 
                if order.get("contractId") == contract_id
            ]
            return OrderSearchResponse(
                orders=filtered_orders,
                success=True,
                errorCode=0,
                errorMessage=None
            )
        
        return response 

    async def cancel_order(
        self,
        account_id: int,
        order_id: int
    ) -> Dict[str, Any]:
        """Cancel a specific order via provider API.

        Why: Wraps provider cancel semantics with consistent error handling.
        """
        endpoint = "/Order/cancel"
        payload = {
            "accountId": account_id,
            "orderId": order_id
        }
        
        response = await self.token_manager.perform_authenticated_request(
            "POST",
            endpoint,
            json=payload
        )
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to cancel order: {response.text}")
        
        # Parse the response
        data = response.json()
        
        # Check if the response indicates success
        if not data.get("success", False):
            raise Exception(f"Failed to cancel order: {data.get('errorMessage', 'Unknown error')}")
            
        return data 

    async def modify_order(
        self,
        account_id: int,
        order_id: int,
        size: Optional[int] = None,
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
        trail_price: Optional[float] = None
    ) -> ModifyOrderResponse:
        """Modify an existing order via provider API.

        Why: Allows post-placement adjustments with explicit None-handling
        for price fields per provider expectations.
        """
        endpoint = "/Order/modify"
        
        # Build payload with only provided parameters
        payload = {
            "accountId": account_id,
            "orderId": order_id
        }
        
        # Add optional parameters if provided
        if size is not None:
            payload["size"] = size
            
        if limit_price is not None:
            payload["limitPrice"] = limit_price
        else:
            payload["limitPrice"] = None
            
        if stop_price is not None:
            payload["stopPrice"] = stop_price
        else:
            payload["stopPrice"] = None
            
        if trail_price is not None:
            payload["trailPrice"] = trail_price
        else:
            payload["trailPrice"] = None
        
        # Print formatted payload for debugging
        print(f"Modifying order with payload: {json.dumps(payload, indent=2)}")
            
        # Call API to modify order
        response = await self.token_manager.perform_authenticated_request(
            "POST",
            endpoint,
            json=payload
        )
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to modify order ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        return ModifyOrderResponse(**data)

    # Note: The close_positions_by_account_name_and_symbol functionality has been moved to CloseManager
    # Use self.close_manager.close_positions_by_account_name_and_symbol() instead 

def load_trading_sessions_config():
    """Load trading sessions configuration from the API config file"""
    config_file = "config/trading_sessions_config.json"
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading trading sessions config: {e}")
    
    # Return default config if file doesn't exist or error occurs
    return {
        "enabled": False,
        "allowed_sessions": [],
        "restricted_sessions": []
    }

def is_time_in_range_gmt(current_time, start_time, end_time):
    """Check if current time is within a time range (handles overnight ranges)"""
    current = int(current_time)
    start = int(start_time)
    end = int(end_time)
    
    if start <= end:
        # Same day range (e.g., 0700-1600)
        return start <= current <= end
    else:
        # Overnight range (e.g., 2300-0800)
        return current >= start or current <= end

def is_session_trading_allowed_gmt(allowed_sessions: List, restricted_sessions: List) -> bool:
    """
    Check if trading is allowed based on GMT time and session configurations.
    This function properly handles GMT time for session validation.
    """
    import datetime
    
    now = datetime.datetime.utcnow()
    current_time_gmt = now.strftime("%H%M")
    
    print(f"[DEBUG] OrderManager - Current GMT time: {now.strftime('%H:%M')} ({current_time_gmt})")
    print(f"[DEBUG] OrderManager - Allowed sessions: {allowed_sessions}")
    print(f"[DEBUG] OrderManager - Restricted sessions: {restricted_sessions}")
    
    # If there are allowed sessions, current time must be within at least one of them
    if allowed_sessions and any(str(session).strip() for session in allowed_sessions):
        session_allowed = False
        for session_range in allowed_sessions:
            if not str(session_range).strip():
                continue
            try:
                start_time, end_time = str(session_range).split('-')
                if is_time_in_range_gmt(current_time_gmt, start_time, end_time):
                    print(f"[DEBUG] OrderManager - Current time {current_time_gmt} is within allowed session {session_range}")
                    session_allowed = True
                    break
                else:
                    print(f"[DEBUG] OrderManager - Current time {current_time_gmt} is NOT within allowed session {session_range}")
            except Exception as e:
                print(f"[DEBUG] OrderManager - Error parsing allowed session range '{session_range}': {e}")
                continue
        
        if not session_allowed:
            print("[DEBUG] OrderManager - Current time not within any allowed session range")
            return False
    
    # If there are restricted sessions, current time must NOT be within any of them
    if restricted_sessions and any(str(session).strip() for session in restricted_sessions):
        for session_range in restricted_sessions:
            if not str(session_range).strip():
                continue
            try:
                start_time, end_time = str(session_range).split('-')
                if is_time_in_range_gmt(current_time_gmt, start_time, end_time):
                    print(f"[DEBUG] OrderManager - Current time {current_time_gmt} is within restricted session {session_range} - trading blocked")
                    return False
                else:
                    print(f"[DEBUG] OrderManager - Current time {current_time_gmt} is NOT within restricted session {session_range}")
            except Exception as e:
                print(f"[DEBUG] OrderManager - Error parsing restricted session range '{session_range}': {e}")
                continue
    
    print("[DEBUG] OrderManager - Session-based trading is allowed")
    return True

def load_trading_hours_config():
    """Load trading hours configuration from the API config file"""
    config_file = "config/trading_hours_config.json"
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading trading hours config: {e}")
    
    # Return default config if file doesn't exist or error occurs
    return {
        "restrict_hours": False,
        "start_hour": 0,
        "start_minute": 0,
        "end_hour": 23,
        "end_minute": 59
    } 

# ==================== NEW EVENT-BASED TRADING VALIDATION FUNCTIONS ====================

def load_event_restrictions_config():
    """Load event-based trading restrictions configuration for order validation"""
    config_file = "config/trading_events_config.json"
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading event restrictions config: {e}")
    return {
        "events": [],
        "before_event_minutes": 0,
        "after_event_minutes": 0,
        "created_at": None
    }

def is_trading_allowed_by_events_om(current_time_gmt=None):
    """
    Check if trading is allowed based on event restrictions for order manager.
    
    Args:
        current_time_gmt: Current GMT time (defaults to now)
        
    Returns:
        tuple: (bool, dict) - (is_allowed, details)
    """
    import datetime
    
    if current_time_gmt is None:
        current_time_gmt = datetime.datetime.utcnow()
    elif isinstance(current_time_gmt, str):
        # Parse string time to datetime
        try:
            current_time_gmt = datetime.datetime.fromisoformat(current_time_gmt.replace('Z', '+00:00'))
            current_time_gmt = current_time_gmt.replace(tzinfo=None)
        except Exception as e:
            print(f"Error parsing time: {e}")
            current_time_gmt = datetime.datetime.utcnow()
    
    config = load_event_restrictions_config()
    
    if not config.get("events"):
        return True, {
            "allowed": True,
            "blocked_by_events": False,
            "active_restrictions": [],
            "message": "No event restrictions configured"
        }
    
    active_restrictions = []
    
    for event in config["events"]:
        try:
            # Parse restriction times
            start_time = datetime.datetime.fromisoformat(event["avoid_start_time_gmt"].replace('Z', '+00:00'))
            end_time = datetime.datetime.fromisoformat(event["avoid_end_time_gmt"].replace('Z', '+00:00'))
            
            # Remove timezone info for comparison (both are GMT)
            start_time = start_time.replace(tzinfo=None)
            end_time = end_time.replace(tzinfo=None)
            
            # Check if current time is within restriction period
            if start_time <= current_time_gmt <= end_time:
                active_restrictions.append({
                    "event_name": event["event_name"],
                    "event_id": event["event_id"],
                    "start_time_gmt": start_time.isoformat() + "Z",
                    "end_time_gmt": end_time.isoformat() + "Z",
                    "currency": event.get("currency", "Unknown"),
                    "impact": event.get("impact", "Unknown"),
                    "minutes_remaining": int((end_time - current_time_gmt).total_seconds() / 60)
                })
                    
        except Exception as e:
            print(f"Error processing event restriction {event.get('event_id', 'unknown')}: {e}")
            continue
    
    is_blocked = len(active_restrictions) > 0
    
    return not is_blocked, {
        "allowed": not is_blocked,
        "blocked_by_events": is_blocked,
        "active_restrictions": active_restrictions,
        "message": f"Trading {'blocked' if is_blocked else 'allowed'} by event restrictions",
        "total_active": len(active_restrictions)
    }

def validate_trading_with_all_restrictions(current_time_gmt=None):
    """
    Comprehensive trading validation including all restriction layers.
    
    Args:
        current_time_gmt: Current GMT time (defaults to now)
        
    Returns:
        dict: Complete validation result
    """
    import datetime
    
    if current_time_gmt is None:
        current_time_gmt = datetime.datetime.utcnow()
    
    # Get all validation results
    sessions_config = load_trading_sessions_config()
    hours_config = load_trading_hours_config()
    
    # Hours validation
    hours_allowed = True
    if hours_config.get('restrict_hours', False):
        current_minutes = current_time_gmt.hour * 60 + current_time_gmt.minute
        start_minutes = hours_config.get('start_hour', 0) * 60 + hours_config.get('start_minute', 0)
        end_minutes = hours_config.get('end_hour', 23) * 60 + hours_config.get('end_minute', 59)
        
        if start_minutes <= end_minutes:
            hours_allowed = start_minutes <= current_minutes <= end_minutes
        else:
            hours_allowed = current_minutes >= start_minutes or current_minutes <= end_minutes
    
    # Sessions validation
    sessions_allowed = True
    if sessions_config.get('enabled', False):
        sessions_allowed = is_session_trading_allowed_gmt(
            sessions_config.get('allowed_sessions', []),
            sessions_config.get('restricted_sessions', [])
        )
    
    # Events validation
    events_allowed, event_details = is_trading_allowed_by_events_om(current_time_gmt)
    
    # Overall result
    overall_allowed = hours_allowed and sessions_allowed and events_allowed
    
    # Determine primary blocker
    primary_blocker = None
    if not overall_allowed:
        if not hours_allowed:
            primary_blocker = "Trading Hours"
        elif not sessions_allowed:
            primary_blocker = "Trading Sessions"
        elif not events_allowed:
            primary_blocker = "Event Restrictions"
    
    return {
        "overall_allowed": overall_allowed,
        "check_time_gmt": current_time_gmt.isoformat() + "Z",
        "validation_layers": {
            "hours_allowed": hours_allowed,
            "sessions_allowed": sessions_allowed,
            "events_allowed": events_allowed
        },
        "event_details": event_details,
        "primary_blocker": primary_blocker,
        "blocking_reasons": [
            reason for allowed, reason in [
                (hours_allowed, "Trading Hours"),
                (sessions_allowed, "Trading Sessions"),
                (events_allowed, "Event Restrictions")
            ] if not allowed
        ]
    }

def get_enhanced_trading_hours_message():
    """
    Get enhanced trading hours message including event restrictions.
    
    Returns:
        str: Detailed message about current trading restrictions
    """
    validation_result = validate_trading_with_all_restrictions()
    
    if validation_result["overall_allowed"]:
        return "Trading is currently allowed"
    
    primary_blocker = validation_result["primary_blocker"]
    
    if primary_blocker == "Event Restrictions":
        event_details = validation_result["event_details"]
        active_restrictions = event_details.get("active_restrictions", [])
        
        if active_restrictions:
            # Get details of the first (most relevant) restriction
            first_restriction = active_restrictions[0]
            event_name = first_restriction["event_name"]
            currency = first_restriction["currency"]
            impact = first_restriction["impact"]
            minutes_remaining = first_restriction["minutes_remaining"]
            end_time = first_restriction["end_time_gmt"]
            
            # Parse end time for user-friendly display
            try:
                import datetime
                end_dt = datetime.datetime.fromisoformat(end_time.replace('Z', '+00:00'))
                end_time_display = end_dt.strftime('%H:%M GMT')
            except:
                end_time_display = end_time
            
            # Build detailed message
            message = f"Trading is blocked due to economic event: '{event_name}' ({currency}, {impact} Impact). "
            message += f"Restriction ends at {end_time_display} "
            
            if minutes_remaining > 0:
                if minutes_remaining == 1:
                    message += f"(in {minutes_remaining} minute)"
                else:
                    message += f"(in {minutes_remaining} minutes)"
            else:
                message += "(ending now)"
            
            # Add count if multiple events
            if len(active_restrictions) > 1:
                message += f". Total {len(active_restrictions)} active event restrictions."
            
            return message
    
    elif primary_blocker == "Trading Hours":
        return get_trading_hours_message()  # Use existing function
    
    elif primary_blocker == "Trading Sessions":
        return "Trading is not allowed during the current market session"
    
    return f"Trading is currently restricted by: {primary_blocker}" 