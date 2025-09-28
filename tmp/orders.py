"""
Order Routes
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
    get_cached_contract_id
)
from src.managers.token_manager import TokenManager
from src.managers.account_manager import AccountManager
from src.managers.contract_manager import ContractManager
from src.managers.position_manager import PositionManager
from src.managers.order_manager import OrderManager, OrderType, OrderSide, MarketOrderPayload, PlaceOrderResponse, validate_trading_with_all_restrictions, get_enhanced_trading_hours_message, ModifyOrderRequest, ModifyOrderResponse
from src.utils.utils import is_trade_allowed, get_trading_hours_message
import httpx
import asyncio
from typing import Annotated
from src.managers.close_manager import CloseManager
from src.managers.bracket_order_tracker import BracketOrderTracker
import json
import os
import traceback
from config.config import get_user_provider_config
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])

# Order type mapping for efficient lookup - replaces conditional checks
ORDER_TYPE_MAPPING = {
    "market": "market",
    "stoploss": "stoploss",
    "stop": "stoploss",
    "stoplimit": "stoploss",
    "stop_loss": "stoploss",
    "stoplose": "stoploss",
    "stoplossui": "stoplossui",
    "stoplossx": "stoplossui",
    "stoploss_topstepx": "stoplossui",  # Legacy support
    "trailing": "trailing", 
    "trailingstop": "trailing",
    "trailing_stop": "trailing",
    "bracketui": "bracketui",
    "bracketx": "bracketui",
    "bracket_topstepx": "bracketui",  # Legacy support
    "brackettopstepx": "bracketui",   # Legacy support
    "bracket": "bracket",
    "limit": "limit"
}

# Request model
class PlaceOrderRequest(BaseModel):
    accountName: str
    action: str  # "Buy" or "Sell"
    orderType: str  # "market", "stopLoss", "trailing", "bracket_topstepx" (case insensitive)
    symbol: str
    qty: int
    limitPrice: Optional[float] = Field(None, description="Required for limit orders")
    stopPrice: Optional[float] = Field(None, description="Required for stop orders and bracket orders (distance)")
    stopLossPoints: Optional[float] = Field(None, description="Required for StopLossUI orders (distance in points)")
    takeProfit: Optional[float] = Field(None, description="Required for bracket orders (distance)")
    trailingOffset: Optional[float] = Field(None, description="Required for trailing orders")
    closeExistingOrders: Optional[bool] = Field(False, description="Close existing orders before placing new ones")
    tradeTimeRanges: Optional[List[str]] = Field([], description="Time ranges when trading is allowed")
    avoidTradeTimeRanges: Optional[List[str]] = Field([], description="Time ranges when trading should be avoided")
    # NEW OPTIONAL BREAK-EVEN FIELDS
    enableBreakEvenStop: Optional[str] = Field(None, description="Enable break-even stop: Y/N (optional, case insensitive)")
    breakEvenActivationOffset: Optional[float] = Field(None, description="Points profit to trigger break-even modification (optional)")

# Modify order request model
class ModifyOrderApiRequest(BaseModel):
    accountName: str
    orderId: int
    size: Optional[int] = Field(None, description="New size of the order")
    limitPrice: Optional[float] = Field(None, description="New limit price for the order")
    stopPrice: Optional[float] = Field(None, description="New stop price for the order")
    trailPrice: Optional[float] = Field(None, description="New trail price for the order")

# Request model for reverse order
class ReverseOrderRequest(BaseModel):
    accountName: str
    symbol: str

# Request model for stop loss order
class StopLossOrderRequest(BaseModel):
    accountName: str
    symbol: str
    action: str  # "Buy" or "Sell"
    qty: int
    stopLossPoints: float
    closeExistingOrders: Optional[bool] = Field(False, description="Close existing orders before placing new ones")
    tradeTimeRanges: Optional[List[str]] = Field([], description="Time ranges when trading is allowed")
    avoidTradeTimeRanges: Optional[List[str]] = Field([], description="Time ranges when trading should be avoided")
    # NEW OPTIONAL BREAK-EVEN FIELDS
    enableBreakEvenStop: Optional[str] = Field(None, description="Enable break-even stop: Y/N (optional, case insensitive)")
    breakEvenActivationOffset: Optional[float] = Field(None, description="Points profit to trigger break-even modification (optional)")

# Response model
class OrderResponse(BaseModel):
    success: bool
    message: str
    order_id: Optional[int] = None
    order_details: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# Enhanced order manager with dependency injection
class EnhancedOrderManager(OrderManager):
    """
    Enhanced version of OrderManager with optimizations for high-frequency trading.
    
    This class extends OrderManager with:
    - Pre-resolved account and contract IDs to reduce API calls
    - Optimized error handling
    - Better performance for repeated operations
    """
    
    def __init__(self, token_manager: TokenManager, position_manager=None):
        super().__init__(token_manager)
        # Cache for resolved IDs to avoid repeated API calls
        self._account_cache = {}
        self._contract_cache = {}
        
        # Assign the managers as instance attributes
        self.position_manager = position_manager
        from src.managers.account_manager import AccountManager
        from src.managers.contract_manager import ContractManager
        self.account_manager = AccountManager(token_manager)
        self.contract_manager = ContractManager(token_manager)
        
        if position_manager:
            self.close_manager = CloseManager(token_manager, position_manager)
            # Initialize bracket order tracker
            self.bracket_tracker = BracketOrderTracker(
                token_manager=token_manager,
                order_manager=self,
                position_manager=position_manager
            )
            
            # Initialize stop loss tracker
            from src.managers.stop_loss_tracker import StopLossTracker
            self.stop_loss_tracker = StopLossTracker(
                token_manager=token_manager,
                order_manager=self,
                position_manager=position_manager
            )
            
            # Initialize break-even monitor with centralized streaming
            from src.managers.break_even_monitor_v2 import BreakEvenMonitor
            self.break_even_monitor = BreakEvenMonitor(
                token_manager=token_manager,
                order_manager=self,
                stop_loss_tracker=self.stop_loss_tracker,
                bracket_tracker=self.bracket_tracker
            )
            
            # INTEGRATION: Connect stop loss tracker to break-even monitor
            self.stop_loss_tracker.set_break_even_monitor(self.break_even_monitor)
            
            # Start break-even monitoring service with Chart Streaming
            self.break_even_monitor.start_monitoring()
    
    def load_trading_hours_config(self):
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

    def load_trading_sessions_config(self):
        """Load trading sessions configuration from the API config file"""
        config_file = "config/trading_sessions_config.json"
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading trading sessions config: {e}")
        
        return {
            "enabled": False,
            "allowed_sessions": [],
            "restricted_sessions": []
        }

    def is_time_in_range_gmt(self, current_time, start_time, end_time):
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

    def is_session_trading_allowed_gmt(self, allowed_sessions: list, restricted_sessions: list) -> bool:
        """
        Check if trading is allowed based on GMT time and session configurations.
        This function properly handles GMT time for session validation.
        """
        import datetime
        
        now = datetime.datetime.utcnow()
        current_time_gmt = now.strftime("%H%M")
        
        print(f"[DEBUG] API Routes - Current GMT time: {now.strftime('%H:%M')} ({current_time_gmt})")
        print(f"[DEBUG] API Routes - Allowed sessions: {allowed_sessions}")
        print(f"[DEBUG] API Routes - Restricted sessions: {restricted_sessions}")
        
        # If there are allowed sessions, current time must be within at least one of them
        if allowed_sessions and any(str(session).strip() for session in allowed_sessions):
            session_allowed = False
            for session_range in allowed_sessions:
                if not str(session_range).strip():
                    continue
                try:
                    start_time, end_time = str(session_range).split('-')
                    if self.is_time_in_range_gmt(current_time_gmt, start_time, end_time):
                        print(f"[DEBUG] API Routes - Current time {current_time_gmt} is within allowed session {session_range}")
                        session_allowed = True
                        break
                    else:
                        print(f"[DEBUG] API Routes - Current time {current_time_gmt} is NOT within allowed session {session_range}")
                except Exception as e:
                    print(f"[DEBUG] API Routes - Error parsing allowed session range '{session_range}': {e}")
                    continue
            
            if not session_allowed:
                print("[DEBUG] API Routes - Current time not within any allowed session range")
                return False
        
        # If there are restricted sessions, current time must NOT be within any of them
        if restricted_sessions and any(str(session).strip() for session in restricted_sessions):
            for session_range in restricted_sessions:
                if not str(session_range).strip():
                    continue
                try:
                    start_time, end_time = str(session_range).split('-')
                    if self.is_time_in_range_gmt(current_time_gmt, start_time, end_time):
                        print(f"[DEBUG] API Routes - Current time {current_time_gmt} is within restricted session {session_range} - trading blocked")
                        return False
                    else:
                        print(f"[DEBUG] API Routes - Current time {current_time_gmt} is NOT within restricted session {session_range}")
                except Exception as e:
                    print(f"[DEBUG] API Routes - Error parsing restricted session range '{session_range}': {e}")
                    continue
        
        print("[DEBUG] API Routes - Session-based trading is allowed")
        return True

    def should_enable_break_even(self, payload: Dict[str, Any]) -> bool:
        """
        Safely check if break-even stop should be enabled.
        Only enables if explicitly requested with valid parameters.
        """
        enable_flag = payload.get("enableBreakEvenStop", "").upper()
        offset = payload.get("breakEvenActivationOffset")
        
        # Only enable if explicitly "Y" and offset is provided and positive
        return (enable_flag == "Y" and 
                offset is not None and 
                isinstance(offset, (int, float)) and 
                offset > 0)

    def get_break_even_fields(self, payload: Dict[str, Any], entry_price: Optional[float] = None) -> Dict[str, Any]:
        """
        Get break-even fields for tracking files.
        Returns empty dict if break-even not enabled (backward compatibility).
        """
        if not self.should_enable_break_even(payload):
            return {}
        
        return {
            "entry_price": entry_price,
            "enable_break_even_stop": True,
            "break_even_activation_offset": payload["breakEvenActivationOffset"],
            "break_even_activated": False,
            "break_even_activation_time": None,
            "original_stop_price": None  # Will be set when stop is first modified
        }

    async def place_market_order_from_payload_optimized(
        self,
        payload: Dict[str, Any],
        account_id: Optional[int] = None,
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Optimized version of place_market_order_from_payload that accepts
        pre-resolved account_id and contract_id.
        """
        # Parse the payload
        order_data = MarketOrderPayload(**payload)
        
        # Check trading hours restrictions first (frontend config)
        trading_hours_config = self.load_trading_hours_config()
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
        
        # Check session-based trading if enabled
        sessions_config = self.load_trading_sessions_config()
        if sessions_config.get('enabled', False):
            session_allowed_ranges = sessions_config.get('allowed_sessions', [])
            session_restricted_ranges = sessions_config.get('restricted_sessions', [])
            
            # Use GMT-based session validation
            if not self.is_session_trading_allowed_gmt(session_allowed_ranges, session_restricted_ranges):
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
        
        # Check if trading is allowed based on payload-specific time ranges
        if not is_trade_allowed(
            order_data.tradeTimeRanges or [], 
            order_data.avoidTradeTimeRanges or []
        ):
            return {
                "success": False,
                "error": get_trading_hours_message()
            }
        
        # Use provided account_id or get it if not provided
        if not account_id:
            account_id = await self.account_manager.get_account_id_by_name(order_data.accountName)
            if not account_id:
                return {
                    "success": False, 
                    "error": f"Account not found: {order_data.accountName}"
                }
        
        # Use provided contract_id or get it if not provided
        if not contract_id:
            # For symbols like "!NQ.1", we strip the "!" prefix if present
            search_symbol = order_data.symbol.lstrip("!")
            contract_id = await self.contract_manager.get_first_contract_id(search_symbol, live=False)
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
        
        # Check current position type and close if needed
        positions = await self.position_manager.get_positions_by_contract(account_id, contract_id)
        if positions:
            current_position = positions[0]  # Get the first position
            should_close = False
            
            # Check if we need to close the position based on type and action
            if current_position.type == 1 and order_data.action.upper() in ["SELL", "S"]:
                should_close = True
            elif current_position.type == 2 and order_data.action.upper() in ["BUY", "B"]:
                should_close = True
                
            if should_close:
                print(f"Closing existing position of type {current_position.type} before placing {order_data.action} order")
                close_payload = {
                    "accountName": order_data.accountName,
                    "symbol": order_data.symbol
                }
                await self.close_manager.close_positions_by_account_name_and_symbol(close_payload)
        
        # Place the order
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
            
            # Get the average price for the contract
            avg_price = await self.position_manager.get_average_price(
                account_id=account_id, 
                contract_id=contract_id
            )
            
            result = {
                "success": True,
                "orderId": order_response.orderId,
                "accountId": account_id,
                "contractId": contract_id,
                "filledPrice": avg_price,
                "message": f"Market order placed and filled at {avg_price if avg_price else 'unknown'} price"
            }

            # Log the order details
            order_details = {
                "orderType": "market",
                "symbol": order_data.symbol,
                "contractId": contract_id,
                "accountId": account_id,
                "accountName": order_data.accountName,
                "position": "LONG" if order_data.action.upper() in ["BUY", "B"] else "SHORT",
                "qty": order_data.qty,
                "filledPrice": avg_price,
                "marketOrder": {
                    "orderId": order_response.orderId,
                    "side": order_data.action
                }
            }
            
            # Log the order details asynchronously
            asyncio.create_task(self.order_logger.log_order(order_details))
            
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def place_market_order_optimized(
        self, 
        payload: Dict[str, Any],
        account_id: Optional[int] = None,
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Optimized version of placeMarketOrder."""
        return await self.place_market_order_from_payload_optimized(
            payload, account_id, contract_id
        )
        
    async def place_market_order_with_stop_loss_optimized(
        self, 
        payload: Dict[str, Any],
        account_id: Optional[int] = None,
        contract_id: Optional[str] = None,
        stop_loss_distance: float = None
    ) -> Dict[str, Any]:
        """Optimized version of placeMarketOrderWithStopLoss."""
        # Step 1: Place the market order
        market_order_result = await self.place_market_order_optimized(
            payload, account_id, contract_id
        )
        
        # If market order failed, return the error
        if not market_order_result.get("success", False):
            return market_order_result
        
        # Step 2: Extract necessary information from the market order result
        account_id = market_order_result["accountId"]
        contract_id = market_order_result["contractId"]
        filled_price = market_order_result.get("filledPrice")
        
        # If we couldn't get the filled price, we can't place a stop loss
        if filled_price is None:
            market_order_result["warning"] = "Market order placed but could not determine filled price for stop loss"
            return market_order_result
        
        # Step 3: Get stop loss distance from payload if not provided as parameter
        if stop_loss_distance is None:
            stop_loss_distance = payload.get("stopPrice")
            if stop_loss_distance is None:
                market_order_result["warning"] = "Market order placed but no stop loss distance provided in payload or parameter"
                return market_order_result
        
        # Step 4: Calculate stop price based on order direction
        is_long = payload["action"].upper() in ["BUY", "B"]
        
        # For long positions, stop is below the filled price
        # For short positions, stop is above the filled price
        stop_price = filled_price - stop_loss_distance if is_long else filled_price + stop_loss_distance
        
        # Ensure stop price is positive
        stop_price = max(0.01, stop_price)
        
        # Step 5: Place the stop loss order (opposite side of the market order)
        stop_side = OrderSide.SELL if is_long else OrderSide.BUY
        
        try:
            stop_order_response = await self.place_order(
                account_id=account_id,
                contract_id=contract_id,
                order_type=OrderType.STOP,
                side=stop_side,
                size=payload["qty"],
                stop_price=stop_price,
                custom_tag=f"Stop Loss for {payload.get('symbol', 'Unknown')} at {stop_price}"
            )
            
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

            # Log the order details
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
            
            # Add bracket order tracking
            if stop_order_response.success:
                # Get break-even fields for bracket tracking
                break_even_fields = self.get_break_even_fields(payload, filled_price)
                bracket_kwargs = {}
                if break_even_fields:
                    bracket_kwargs = {
                        "entry_price": break_even_fields.get("entry_price"),
                        "enable_break_even_stop": break_even_fields.get("enable_break_even_stop"),
                        "break_even_activation_offset": break_even_fields.get("break_even_activation_offset")
                    }
                
                await self.bracket_tracker.add_bracket_order_group(
                    account_id=account_id,
                    account_name=payload.get("accountName", ""),
                    contract_id=contract_id,
                    symbol=payload.get("symbol", ""),
                    market_order_id=market_order_result["orderId"],
                    stop_loss_order_id=stop_order_response.orderId,
                    position_size=payload["qty"],
                    **bracket_kwargs  # Add break-even fields if enabled
                )
                
                # Add individual stop loss tracking with break-even support
                await self.stop_loss_tracker.add_stop_loss_order(
                    order_id=stop_order_response.orderId,
                    account_id=account_id,
                    account_name=payload.get("accountName", ""),
                    contract_id=contract_id,
                    symbol=payload.get("symbol", ""),
                    order_type="STOP_LOSS",
                    stop_price=stop_price,
                    position_size=payload["qty"],
                    notes=f"Stop loss for market order {market_order_result['orderId']}",
                    **break_even_fields  # Add break-even fields if enabled
                )
            
            return result
            
        except Exception as e:
            # Market order was placed, but stop loss failed
            market_order_result["success"] = True  # Market order was successful
            market_order_result["warning"] = f"Market order placed but stop loss order failed: {str(e)}"
            return market_order_result

    async def place_market_order_with_trail_stop_optimized(
        self, 
        payload: Dict[str, Any],
        account_id: Optional[int] = None,
        contract_id: Optional[str] = None,
        trail_distance: float = None
    ) -> Dict[str, Any]:
        """Optimized version of placeMarketOrderWithTrailStop."""
        # Step 1: Place the market order
        market_order_result = await self.place_market_order_optimized(
            payload, account_id, contract_id
        )
        
        # Rest of the method is the same as placeMarketOrderWithTrailStop
        # If market order failed, return the error
        if not market_order_result.get("success", False):
            return market_order_result
        
        # Step 2: Extract necessary information from the market order result
        account_id = market_order_result["accountId"]
        contract_id = market_order_result["contractId"]
        filled_price = market_order_result.get("filledPrice")
        
        # If we couldn't get the filled price, we can't place a trailing stop
        if filled_price is None:
            market_order_result["warning"] = "Market order placed but could not determine filled price for trailing stop"
            return market_order_result
        
        # Step 3: Get trail distance from payload if not provided as parameter
        if trail_distance is None:
            trail_distance = payload.get("trailingOffset")
            if trail_distance is None:
                market_order_result["warning"] = "Market order placed but no trailing stop distance provided in payload or parameter"
                return market_order_result
        
        # Step 4: Determine if this is a long or short position
        is_long = payload["action"].upper() in ["BUY", "B"]
        
        # Calculate activation price based on filled price and direction
        activation_price = filled_price - trail_distance if is_long else filled_price + trail_distance
        activation_price = max(0.01, activation_price)  # Ensure price is positive
        
        # Step 5: Place the trailing stop order (opposite side of the market order)
        trail_side = OrderSide.SELL if is_long else OrderSide.BUY
        
        try:
            trail_order_response = await self.place_order(
                account_id=account_id,
                contract_id=contract_id,
                order_type=OrderType.TRAILING_STOP,
                side=trail_side,
                size=payload["qty"],
                trail_price=activation_price
            )
            
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

            # Log the order details
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
            
            # Add bracket order tracking
            if trail_order_response.success:
                await self.bracket_tracker.add_bracket_order_group(
                    account_id=account_id,
                    account_name=payload.get("accountName", ""),
                    contract_id=contract_id,
                    symbol=payload.get("symbol", ""),
                    market_order_id=market_order_result["orderId"],
                    trail_stop_order_id=trail_order_response.orderId,
                    position_size=payload["qty"]
                )
                
                # Add individual trailing stop tracking
                break_even_fields = self.get_break_even_fields(payload, filled_price)
                await self.stop_loss_tracker.add_stop_loss_order(
                    order_id=trail_order_response.orderId,
                    account_id=account_id,
                    account_name=payload.get("accountName", ""),
                    contract_id=contract_id,
                    symbol=payload.get("symbol", ""),
                    order_type="TRAILING_STOP",
                    trail_amount=trail_distance,
                    position_size=payload["qty"],
                    notes=f"Trailing stop for market order {market_order_result['orderId']}",
                    **break_even_fields  # Add break-even fields if enabled
                )
            
            return result
            
        except Exception as e:
            # Market order was placed, but trailing stop failed
            market_order_result["success"] = True  # Market order was successful
            market_order_result["warning"] = f"Market order placed but trailing stop order failed: {str(e)}"
            return market_order_result

    async def place_bracket_order_with_topstepx_optimized(
        self, 
        payload: Dict[str, Any],
        account_id: Optional[int] = None,
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Optimized version of placeBracketOrderWithTopStepX.
        
        Places a market order and then directly sets stop loss and take profit
        using the TopStepX API endpoint.
        """
        # Step 1: Place the market order
        market_order_result = await self.place_market_order_optimized(
            payload, account_id, contract_id
        )
        
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
        position_id = await self.position_manager.getPositionIDForAccountName(
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
            
        # Ensure prices are positive
        stop_price = max(0.01, stop_price)
        take_profit = max(0.01, take_profit)
        
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
            
            # Get provider configuration and use userapi_endpoint
            provider_config = get_user_provider_config()
            
            # Make the direct API call to TopStepX
            async with httpx.AsyncClient() as client:
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
            
            # Add stop loss and take profit info to the result
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

    async def place_bracket_order_optimized(
        self, 
        payload: Dict[str, Any],
        account_id: Optional[int] = None,
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Optimized version of placeBracketOrder.
        
        Places a market order with both stop loss and take profit orders.
        """
        # Step 1: Place the market order
        market_order_result = await self.place_market_order_optimized(
            payload, account_id, contract_id
        )
        
        # If market order failed, return the error
        if not market_order_result.get("success", False):
            return market_order_result
        
        # Step 2: Extract necessary information from the market order result
        account_id = market_order_result["accountId"]
        contract_id = market_order_result["contractId"]
        filled_price = market_order_result.get("filledPrice")
        
        # If we couldn't get the filled price, we can't place stop loss and take profit
        if filled_price is None:
            market_order_result["warning"] = "Market order placed but could not determine valid fill price for bracket order after multiple retries"
            return market_order_result
        
        # Step 3: Get stop loss and take profit distances from payload
        stop_loss_distance = payload.get("stopPrice")
        take_profit_distance = payload.get("takeProfit")
        
        if stop_loss_distance is None or take_profit_distance is None:
            market_order_result["warning"] = "Market order placed but stop loss distance or take profit distance not provided in payload"
            return market_order_result
        
        # Step 4: Determine if this is a long or short position
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
        
        # Step 5: Place the stop loss order (opposite side of the market order)
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
            
            # Step 6: Place the take profit order (limit order, opposite side of market order)
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

            # Log the order details
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
            
            # Add bracket order tracking
            if stop_order_response.success and take_profit_order_response.success:
                # Get break-even fields for bracket tracking
                break_even_fields = self.get_break_even_fields(payload, filled_price)
                bracket_kwargs = {}
                if break_even_fields:
                    bracket_kwargs = {
                        "entry_price": break_even_fields.get("entry_price"),
                        "enable_break_even_stop": break_even_fields.get("enable_break_even_stop"),
                        "break_even_activation_offset": break_even_fields.get("break_even_activation_offset")
                    }
                
                await self.bracket_tracker.add_bracket_order_group(
                    account_id=account_id,
                    account_name=payload.get("accountName", ""),
                    contract_id=contract_id,
                    symbol=payload.get("symbol", ""),
                    market_order_id=market_order_result["orderId"],
                    stop_loss_order_id=stop_order_response.orderId,
                    take_profit_order_id=take_profit_order_response.orderId,  # ✅ Now tracking take profit orders
                    position_size=payload["qty"],
                    **bracket_kwargs  # Add break-even fields if enabled
                )
                
                # Add individual stop loss tracking with break-even support
                await self.stop_loss_tracker.add_stop_loss_order(
                    order_id=stop_order_response.orderId,
                    account_id=account_id,
                    account_name=payload.get("accountName", ""),
                    contract_id=contract_id,
                    symbol=payload.get("symbol", ""),
                    order_type="STOP_LOSS",
                    stop_price=stop_price,
                    position_size=payload["qty"],
                    notes=f"Stop loss for market order {market_order_result['orderId']}",
                    **break_even_fields  # Add break-even fields if enabled
                )
            
            return result
            
        except Exception as e:
            # Market order was placed, but bracket orders failed
            market_order_result["success"] = True  # Market order was successful
            market_order_result["warning"] = f"Market order placed but bracket orders failed: {str(e)}"
            return market_order_result

    async def place_limit_order_optimized(
        self, 
        payload: Dict[str, Any],
        account_id: Optional[int] = None,
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Optimized version of placeLimitOrder.
        
        Places a limit order at the specified price.
        """
        # Parse the payload
        order_data = MarketOrderPayload(**payload)
        
        # Check trading hours restrictions first (frontend config)
        trading_hours_config = self.load_trading_hours_config()
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
        
        # Check session-based trading if enabled
        sessions_config = self.load_trading_sessions_config()
        if sessions_config.get('enabled', False):
            session_allowed_ranges = sessions_config.get('allowed_sessions', [])
            session_restricted_ranges = sessions_config.get('restricted_sessions', [])
            
            # Use GMT-based session validation
            if not self.is_session_trading_allowed_gmt(session_allowed_ranges, session_restricted_ranges):
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
        
        # Check if trading is allowed based on time ranges
        if not is_trade_allowed(
            order_data.tradeTimeRanges or [], 
            order_data.avoidTradeTimeRanges or []
        ):
            return {
                "success": False,
                "error": get_trading_hours_message()
            }
        
        # Use provided account_id or get it if not provided
        if not account_id:
            account_id = await self.account_manager.get_account_id_by_name(order_data.accountName)
            if not account_id:
                return {
                    "success": False, 
                    "error": f"Account not found: {order_data.accountName}"
                }
        
        # Use provided contract_id or get it if not provided
        if not contract_id:
            # For symbols like "!NQ.1", we strip the "!" prefix if present
            search_symbol = order_data.symbol.lstrip("!")
            contract_id = await self.contract_manager.get_first_contract_id(search_symbol, live=False)
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
        
        # Check current position type and close if needed
        positions = await self.position_manager.get_positions_by_contract(account_id, contract_id)
        if positions:
            current_position = positions[0]  # Get the first position
            should_close = False
            
            # Check if we need to close the position based on type and action
            if current_position.type == 1 and order_data.action.upper() in ["SELL", "S"]:
                should_close = True
            elif current_position.type == 2 and order_data.action.upper() in ["BUY", "B"]:
                should_close = True
                
            if should_close:
                print(f"Closing existing position of type {current_position.type} before placing {order_data.action} order")
                close_payload = {
                    "accountName": order_data.accountName,
                    "symbol": order_data.symbol
                }
                await self.close_manager.close_positions_by_account_name_and_symbol(close_payload)
        
        # Place the limit order
        try:
            order_response = await self.place_order(
                account_id=account_id,
                contract_id=contract_id,
                order_type=OrderType.LIMIT,
                side=order_data.action,  # "Buy" or "Sell"
                size=order_data.qty,
                limit_price=order_data.limitPrice,
                custom_tag=f"Limit Order for {order_data.symbol} at {order_data.limitPrice}"
            )
            
            if not order_response.success:
                return {
                    "success": False,
                    "error": order_response.errorMessage or "Unknown error",
                    "errorCode": order_response.errorCode
                }
            
            result = {
                "success": True,
                "orderId": order_response.orderId,
                "accountId": account_id,
                "contractId": contract_id,
                "limitPrice": order_data.limitPrice,
                "message": f"Limit order placed at {order_data.limitPrice}"
            }

            # Log the order details
            order_details = {
                "orderType": "limit",
                "symbol": order_data.symbol,
                "contractId": contract_id,
                "accountId": account_id,
                "accountName": order_data.accountName,
                "position": "LONG" if order_data.action.upper() in ["BUY", "B"] else "SHORT",
                "qty": order_data.qty,
                "limitPrice": order_data.limitPrice,
                "limitOrder": {
                    "orderId": order_response.orderId,
                    "side": order_data.action
                }
            }
            
            # Log the order details asynchronously
            asyncio.create_task(self.order_logger.log_order(order_details))
            
            return result
            
        except Exception as e:
            # Limit order failed
            return {
                "success": False,
                "error": str(e),
                "errorCode": getattr(e, 'errorCode', -1)
            }

    async def modify_order_optimized(
        self,
        payload: Dict[str, Any],
        account_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Optimized version of modify_order with pre-resolved account ID."""
        try:
            # Extract order details from payload
            order_id = payload["orderId"]
            size = payload.get("size")
            limit_price = payload.get("limitPrice")
            stop_price = payload.get("stopPrice")
            trail_price = payload.get("trailPrice")
            
            # Call the base modify_order method
            response = await self.modify_order(
                account_id=account_id,
                order_id=order_id,
                size=size,
                limit_price=limit_price,
                stop_price=stop_price,
                trail_price=trail_price
            )
            
            if not response.success:
                return {
                    "success": False,
                    "error": response.errorMessage or "Unknown error",
                    "errorCode": response.errorCode
                }
            
            result = {
                "success": True,
                "orderId": order_id,
                "accountId": account_id,
                "message": f"Order {order_id} modified successfully"
            }

            # Log the modification details
            modification_details = {
                "orderType": "modify",
                "orderId": order_id,
                "accountId": account_id,
                "accountName": payload.get("accountName", ""),
                "modifications": {
                    "size": size,
                    "limitPrice": limit_price,
                    "stopPrice": stop_price,
                    "trailPrice": trail_price
                }
            }
            
            # Log the modification details asynchronously
            asyncio.create_task(self.order_logger.log_order(modification_details))
            
            return result
            
        except Exception as e:
            # Order modification failed
            return {
                "success": False,
                "error": str(e),
                "errorCode": getattr(e, 'errorCode', -1)
            }

    async def reverse_order_optimized(
        self, 
        payload: Dict[str, Any],
        account_id: Optional[int] = None,
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Optimized version of reverse order operation.
        
        Reverses an existing position for the specified account and symbol.
        This method directly calls the provider's reverse position endpoint.
        """
        try:
            # Check trading hours restrictions first (frontend config)
            trading_hours_config = self.load_trading_hours_config()
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
            
            # Check session-based trading if enabled
            sessions_config = self.load_trading_sessions_config()
            if sessions_config.get('enabled', False):
                session_allowed_ranges = sessions_config.get('allowed_sessions', [])
                session_restricted_ranges = sessions_config.get('restricted_sessions', [])
                
                # Use GMT-based session validation
                if not self.is_session_trading_allowed_gmt(session_allowed_ranges, session_restricted_ranges):
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
            
            # Use provided account_id or get it if not provided
            if not account_id:
                account_id = await self.account_manager.get_account_id_by_name(payload["accountName"])
                if not account_id:
                    return {
                        "success": False, 
                        "error": f"Account not found: {payload['accountName']}"
                    }
            
            # Use provided contract_id or get it if not provided
            if not contract_id:
                # For symbols like "!NQ.1", we strip the "!" prefix if present
                search_symbol = payload["symbol"].lstrip("!")
                contract_id = await self.contract_manager.get_first_contract_id(search_symbol, live=False)
                if not contract_id:
                    return {
                        "success": False, 
                        "error": f"Contract not found for symbol: {payload['symbol']}"
                    }
            
            # Get the product ID for the reverse position API call
            # TopStepX reverse position endpoint requires productId (e.g., "F.US.MNQ") not contract ID
            search_symbol = payload["symbol"].lstrip("!")
            product_id = await self.contract_manager.get_product_id_by_name(search_symbol)
            if not product_id:
                return {
                    "success": False, 
                    "error": f"Product ID not found for symbol: {payload['symbol']}"
                }
            
            # Get the auth token
            token = await self.token_manager.get_token()
            
            # Create headers with the authorization token
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/json"
            }
            
            # Prepare the request parameters using product ID instead of contract ID
            params = {
                "accountId": account_id,
                "symbol": product_id  # Use product ID (e.g., "F.US.MNQ") instead of contract ID
            }
            
            # Get provider configuration and use userapi_endpoint
            provider_config = get_user_provider_config()
            
            # Make the direct API call to reverse the position
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{provider_config['userapi_endpoint']}/Position/reverse",
                    headers=headers,
                    params=params
                )
            
            # Check if the request was successful
            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"Failed to reverse position: HTTP {response.status_code} - {response.text}"
                }
                
            response_data = response.json()
            
            # Log the reverse order operation
            reverse_details = {
                "orderType": "reverse_position",
                "symbol": payload.get("symbol", ""),
                "contractId": contract_id,
                "productId": product_id,  # Log both contract ID and product ID
                "accountId": account_id,
                "accountName": payload.get("accountName", ""),
                "operation": "reverse",
                "success": response_data if isinstance(response_data, bool) else True,
                "response": response_data
            }
            
            # Log the reverse operation details asynchronously
            asyncio.create_task(self.order_logger.log_order(reverse_details))
            
            # Return success result
            return {
                "success": True,
                "accountId": account_id,
                "contractId": contract_id,
                "productId": product_id,
                "symbol": payload["symbol"],
                "accountName": payload["accountName"],
                "operation": "reverse",
                "result": response_data,
                "message": f"Position reversed successfully for {payload['symbol']} (productId: {product_id}) in account {payload['accountName']}"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to reverse position: {str(e)}"
            }

    async def place_market_order_with_stop_loss_topstepx_optimized(
        self, 
        payload: Dict[str, Any],
        account_id: Optional[int] = None,
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Optimized version of placing a market order with stop loss using TopStepX API.
        
        Places a market order and then sets only the stop loss (no take profit)
        using the TopStepX API endpoint. This method polls for the filled price
        and position ID before setting the stop loss.
        """
        # Step 1: Place the market order
        market_order_result = await self.place_market_order_optimized(
            payload, account_id, contract_id
        )
        
        # If market order failed, return the error
        if not market_order_result.get("success", False):
            return market_order_result
        
        # Step 2: Extract necessary information from the market order result
        account_id = market_order_result["accountId"]
        contract_id = market_order_result["contractId"]
        filled_price = market_order_result.get("filledPrice")
        
        # If we couldn't get the filled price, we can't set stop loss
        if filled_price is None:
            market_order_result["warning"] = "Market order placed but could not determine filled price for stop loss"
            return market_order_result
        
        # Step 3: Get the stop loss distance from payload
        stop_loss_points = payload.get("stopLossPoints") or payload.get("stopPrice")
        if stop_loss_points is None:
            market_order_result["warning"] = "Market order placed but no stop loss points provided in payload (stopLossPoints or stopPrice required)"
            return market_order_result
        
        # Step 4: Get the position ID for the account name
        position_id = await self.position_manager.getPositionIDForAccountName(
            account_name=payload["accountName"],
            contract_id=contract_id
        )
        
        if not position_id:
            market_order_result["warning"] = f"Market order placed but could not find position ID for account {payload['accountName']}"
            return market_order_result
        
        # Step 5: Calculate stop loss price based on order type
        is_long = payload["action"].upper() in ["BUY", "B"]
        
        # Calculate stop loss price based on position direction
        if is_long:
            # For long positions, stop loss is below filled price
            stop_loss_price = filled_price - stop_loss_points
        else:
            # For short positions, stop loss is above filled price
            stop_loss_price = filled_price + stop_loss_points
        
        # Ensure stop price is positive
        stop_loss_price = max(0.01, stop_loss_price)
        
        # Step 6: Make a direct API call to set stop loss only
        try:
            # Get the auth token
            token = await self.token_manager.get_token()
            
            # Create headers with the authorization token
            headers = {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/json",
                "authorization": f"Bearer {token}"
            }
            
            # Prepare the request payload (only stop loss, no take profit)
            stop_loss_data = {
                "positionId": position_id,
                "stopLoss": stop_loss_price,
                "takeProfit": None
            }
            
            # Get provider configuration and use userapi_endpoint
            provider_config = get_user_provider_config()
            
            # Make the direct API call to TopStepX
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{provider_config['userapi_endpoint']}/Order/editStopLossAccount",
                    headers=headers,
                    json=stop_loss_data
                )
            
            # Check if the request was successful
            if response.status_code != 200:
                market_order_result["warning"] = f"Market order placed but failed to set stop loss: {response.text}"
                return market_order_result
                
            response_data = response.json()
            
            # Log the order details
            order_details = {
                "orderType": "market_with_stop_loss_topstepx",
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
                "stopLoss": {
                    "positionId": position_id,
                    "stopLossPrice": stop_loss_price,
                    "success": response_data.get("success", False),
                    "response": response_data
                }
            }
            
            # Log the order details asynchronously
            asyncio.create_task(self.order_logger.log_order(order_details))
            
            # Add stop loss tracking with break-even support
            if response_data.get("success", False):
                # Get break-even fields for stop loss tracking
                break_even_fields = self.get_break_even_fields(payload, filled_price)
                
                await self.stop_loss_tracker.add_stop_loss_order(
                    order_id=market_order_result["orderId"],  # Use market order ID for tracking
                    account_id=account_id,
                    account_name=payload.get("accountName", ""),
                    contract_id=contract_id,
                    symbol=payload.get("symbol", ""),
                    order_type="STOP_LOSS_TOPSTEPX",
                    stop_price=stop_loss_price,
                    position_size=payload["qty"],
                    position_id=position_id,
                    notes=f"TopStepX stop loss for market order {market_order_result['orderId']}",
                    **break_even_fields  # Add break-even fields if enabled
                )
            
            # Return success result with stop loss info
            return {
                "success": True,
                "marketOrder": {
                    "orderId": market_order_result["orderId"],
                    "filledPrice": filled_price,
                    "side": payload["action"]
                },
                "stopLoss": {
                    "positionId": position_id,
                    "stopLossPrice": stop_loss_price,
                    "success": response_data.get("success", False)
                },
                "message": f"Market order filled at {filled_price} with stop loss set at {stop_loss_price}"
            }
            
        except Exception as e:
            # Market order was placed, but stop loss failed
            market_order_result["success"] = True  # Market order was successful
            market_order_result["warning"] = f"Market order placed but failed to set stop loss: {str(e)}"
            return market_order_result

# Get enhanced order manager dependency
async def get_enhanced_order_manager(
    token_manager: TokenManager = Depends(get_token_manager),
    account_manager: AccountManager = Depends(get_account_manager),
    contract_manager: ContractManager = Depends(get_contract_manager),
    position_manager: PositionManager = Depends(get_position_manager)
) -> EnhancedOrderManager:
    """
    Create an EnhancedOrderManager instance using the provided dependencies.
    """
    return EnhancedOrderManager(
        token_manager=token_manager,
        position_manager=position_manager
    )

# Routes
@router.post("/place", response_model=OrderResponse)
async def place_order(
    request: PlaceOrderRequest,
    enhanced_order_manager: EnhancedOrderManager = Depends(get_enhanced_order_manager),
    account_manager: AccountManager = Depends(get_account_manager),
    contract_manager: ContractManager = Depends(get_contract_manager)
):
    """
    Place an order based on the specified order type.
    
    Supported order types:
    - market: Simple market order
    - stopLoss: Market order with stop loss order
    - trailing: Market order with trailing stop
    - bracket_topstepx: Market order with stop loss and take profit (using TopStepX API)
    - bracket: Market order with separate stop loss and take profit orders
    
    Optimized version with pre-resolved dependencies and caching.
    """
    try:
        # 🚫 CRITICAL: Check all trading restrictions before placing any orders
        validation_result = validate_trading_with_all_restrictions()
        if not validation_result["overall_allowed"]:
            return OrderResponse(
                success=False,
                message="Trading is currently blocked",
                error=validation_result.get("primary_blocker", "Trading restrictions active")
            )
        
        # Convert payload to dict for easier manipulation
        # Use model_dump() for Pydantic v2 or dict() for v1
        try:
            # Try Pydantic v2 method first
            payload = request.model_dump(exclude_none=True)
        except AttributeError:
            # Fall back to Pydantic v1 method
            payload = request.dict(exclude_none=True)
        
        # Pre-resolve account and contract IDs for better performance
        account_name = payload["accountName"]
        symbol = payload["symbol"]
        
        # Use cached account ID lookup
        account_id = await get_cached_account_id(account_name, account_manager)
        if not account_id:
            return OrderResponse(
                success=False,
                message=f"Account not found: {account_name}",
                error=f"Could not resolve account ID for {account_name}"
            )
            
        # Use cached contract ID lookup
        contract_id = await get_cached_contract_id(symbol, contract_manager)
        if not contract_id:
            return OrderResponse(
                success=False,
                message=f"Contract not found: {symbol}",
                error=f"Could not resolve contract ID for {symbol}"
            )
        
        # Get order type from the optimized lookup table
        order_type_lower = payload["orderType"].lower()
        normalized_order_type = ORDER_TYPE_MAPPING.get(order_type_lower)
        
        if not normalized_order_type:
            return OrderResponse(
                success=False,
                message=f"Invalid order type: {payload['orderType']}",
                error=f"Order type must be one of: market, stopLoss, trailing, bracket_topstepx, bracket, limit"
            )
        
        # Call appropriate order method based on normalized order type
        if normalized_order_type == "market":
            result = await enhanced_order_manager.place_market_order_optimized(
                payload, account_id, contract_id
            )
        elif normalized_order_type == "stoploss":
            result = await enhanced_order_manager.place_market_order_with_stop_loss_optimized(
                payload, account_id, contract_id
            )
        elif normalized_order_type == "stoplossui":
            result = await enhanced_order_manager.place_market_order_with_stop_loss_topstepx_optimized(
                payload, account_id, contract_id
            )
        elif normalized_order_type == "trailing":
            result = await enhanced_order_manager.place_market_order_with_trail_stop_optimized(
                payload, account_id, contract_id
            )
        elif normalized_order_type == "bracketui":
            result = await enhanced_order_manager.place_bracket_order_with_topstepx_optimized(
                payload, account_id, contract_id
            )
        elif normalized_order_type == "bracket":
            result = await enhanced_order_manager.place_bracket_order_optimized(
                payload, account_id, contract_id
            )
        elif normalized_order_type == "limit":
            result = await enhanced_order_manager.place_limit_order_optimized(
                payload, account_id, contract_id
            )
        else:
            # This should never happen due to the mapping above
            return OrderResponse(
                success=False,
                message=f"Invalid order type: {payload['orderType']}",
                error=f"Order type must be one of: market, stopLoss, stoplossui, trailing, bracketui, bracket, limit"
            )
        
        # Process the result
        if result.get("success", False):
            return OrderResponse(
                success=True,
                message=result.get("message", "Order placed successfully"),
                order_id=result.get("orderId"),
                order_details=result
            )
        else:
            return OrderResponse(
                success=False,
                message="Failed to place order",
                error=result.get("error", "Unknown error")
            )
            
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            return OrderResponse(
                success=False,
                message="No credentials provided",
                error="Missing credentials: Username and API key must be provided to connect to trading account"
            )
        # Re-raise other ValueErrors
        raise
    except Exception as e:
        return OrderResponse(
            success=False,
            message="Error processing order",
            error=str(e)
        )

@router.put("/modify", response_model=OrderResponse)
async def modify_order(
    request: ModifyOrderApiRequest,
    enhanced_order_manager: EnhancedOrderManager = Depends(get_enhanced_order_manager),
    account_manager: AccountManager = Depends(get_account_manager)
):
    """
    Modify an existing order.
    
    This endpoint allows you to modify various parameters of an existing order:
    - size: Change the order quantity
    - limitPrice: Change the limit price (for limit orders)
    - stopPrice: Change the stop price (for stop orders)
    - trailPrice: Change the trail price (for trailing stop orders)
    
    At least one modification parameter must be provided.
    """
    try:
        # 🚫 CRITICAL: Check all trading restrictions before modifying orders
        validation_result = validate_trading_with_all_restrictions()
        if not validation_result["overall_allowed"]:
            return OrderResponse(
                success=False,
                message="Trading is currently blocked",
                error=validation_result.get("primary_blocker", "Trading restrictions active")
            )
        
        # Convert payload to dict for easier manipulation
        try:
            # Try Pydantic v2 method first
            payload = request.model_dump(exclude_none=True)
        except AttributeError:
            # Fall back to Pydantic v1 method
            payload = request.dict(exclude_none=True)
        
        # Validate that at least one modification parameter is provided
        modification_params = ["size", "limitPrice", "stopPrice", "trailPrice"]
        has_modifications = any(param in payload and payload[param] is not None for param in modification_params)
        
        if not has_modifications:
            return OrderResponse(
                success=False,
                message="At least one modification parameter (size, limitPrice, stopPrice, trailPrice) must be provided",
                error="No modifications specified"
            )
        
        # Pre-resolve account ID for better performance
        account_name = payload["accountName"]
        
        # Use cached account ID lookup
        account_id = await get_cached_account_id(account_name, account_manager)
        if not account_id:
            return OrderResponse(
                success=False,
                message=f"Account not found: {account_name}",
                error=f"Could not resolve account ID for {account_name}"
            )
        
        # Call the order modification method
        result = await enhanced_order_manager.modify_order_optimized(
            payload, account_id
        )
        
        # Process the result
        if result.get("success", False):
            return OrderResponse(
                success=True,
                message=result.get("message", "Order modified successfully"),
                order_id=result.get("orderId"),
                order_details=result
            )
        else:
            return OrderResponse(
                success=False,
                message="Failed to modify order",
                error=result.get("error", "Unknown error")
            )
            
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            return OrderResponse(
                success=False,
                message="No credentials provided",
                error="Missing credentials: Username and API key must be provided to connect to trading account"
            )
        # Re-raise other ValueErrors
        raise
    except Exception as e:
        return OrderResponse(
            success=False,
            message="Error processing order modification",
            error=str(e)
        )

@router.get("/break-even-status", response_model=OrderResponse)
async def get_break_even_status(
    enhanced_order_manager: EnhancedOrderManager = Depends(get_enhanced_order_manager)
):
    """
    Get the status of the break-even monitoring system.
    
    Returns information about:
    - Number of orders being monitored
    - Active streaming status
    - System health
    """
    try:
        # Get break-even monitor status
        status = enhanced_order_manager.break_even_monitor.get_monitoring_status()
        
        # Get stream manager details
        from src.managers.stream_manager import get_stream_manager
        stream_manager = get_stream_manager()
        stream_status = stream_manager.get_all_streams_status()
        
        # Count break-even enabled orders
        eligible_orders = []
        activated_orders = []
        
        for order in enhanced_order_manager.stop_loss_tracker.orders.values():
            if getattr(order, 'enable_break_even_stop', False):
                order_info = {
                    "order_id": order.order_id,
                    "symbol": getattr(order, 'symbol', 'N/A'),
                    "entry_price": getattr(order, 'entry_price', None),
                    "current_stop": getattr(order, 'stop_price', None),
                    "activation_offset": getattr(order, 'break_even_activation_offset', None),
                    "status": order.status,
                    "stream_active": getattr(order, 'stream_active', False),
                    "stream_symbol": getattr(order, 'stream_symbol', None)
                }
                
                if getattr(order, 'break_even_activated', False):
                    activated_orders.append(order_info)
                else:
                    eligible_orders.append(order_info)
        
        return OrderResponse(
            success=True,
            message="Break-even monitoring status retrieved successfully",
            order_details={
                "monitoring_active": status["monitoring_active"],
                "monitoring_interval": status["monitoring_interval"],
                "system_health": {
                    "eligible_orders": len(eligible_orders),
                    "activated_orders": len(activated_orders),
                    "total_stop_loss_orders": status["total_tracked_orders"],
                    "break_even_orders_tracked": status.get("break_even_orders_tracked", 0),
                    "active_streams": status["active_streams"],
                    "streaming_symbols": status["streaming_symbols"]
                },
                "eligible_orders": eligible_orders,
                "activated_orders": activated_orders,
                "stream_details": stream_status,
                "last_updated": datetime.now().isoformat()
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting break-even status: {e}")
        return OrderResponse(
            success=False,
            error=f"Failed to get break-even status: {str(e)}",
            message="Error retrieving break-even monitoring status"
        )

@router.post("/reverse", response_model=OrderResponse)
async def reverse_position(
    request: ReverseOrderRequest,
    enhanced_order_manager: EnhancedOrderManager = Depends(get_enhanced_order_manager),
    account_manager: AccountManager = Depends(get_account_manager),
    contract_manager: ContractManager = Depends(get_contract_manager)
):
    """
    Reverse an existing position for the specified account and symbol.
    
    This endpoint reverses the direction of an existing position:
    - If you have a long position, it will be reversed to a short position
    - If you have a short position, it will be reversed to a long position
    
    The reverse operation closes the current position and opens a new position
    in the opposite direction with the same quantity.
    
    Required parameters:
    - accountName: The name of the trading account
    - symbol: The symbol of the position to reverse (e.g., "NQ", "ES", "MES")
    """
    try:
        # 🚫 CRITICAL: Check all trading restrictions before reversing positions
        validation_result = validate_trading_with_all_restrictions()
        if not validation_result["overall_allowed"]:
            return OrderResponse(
                success=False,
                message="Trading is currently blocked",
                error=validation_result.get("primary_blocker", "Trading restrictions active")
            )
        
        # Convert payload to dict for easier manipulation
        try:
            # Try Pydantic v2 method first
            payload = request.model_dump(exclude_none=True)
        except AttributeError:
            # Fall back to Pydantic v1 method
            payload = request.dict(exclude_none=True)
        
        # Pre-resolve account and contract IDs for better performance
        account_name = payload["accountName"]
        symbol = payload["symbol"]
        
        # Use cached account ID lookup
        account_id = await get_cached_account_id(account_name, account_manager)
        if not account_id:
            return OrderResponse(
                success=False,
                message=f"Account not found: {account_name}",
                error=f"Could not resolve account ID for {account_name}"
            )
            
        # Use cached contract ID lookup
        contract_id = await get_cached_contract_id(symbol, contract_manager)
        if not contract_id:
            return OrderResponse(
                success=False,
                message=f"Contract not found: {symbol}",
                error=f"Could not resolve contract ID for {symbol}"
            )
        
        # Call the reverse order method
        result = await enhanced_order_manager.reverse_order_optimized(
            payload, account_id, contract_id
        )
        
        # Process the result
        if result.get("success", False):
            return OrderResponse(
                success=True,
                message=result.get("message", "Position reversed successfully"),
                order_details=result
            )
        else:
            return OrderResponse(
                success=False,
                message="Failed to reverse position",
                error=result.get("error", "Unknown error")
            )
            
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            return OrderResponse(
                success=False,
                message="No credentials provided",
                error="Missing credentials: Username and API key must be provided to connect to trading account"
            )
        # Re-raise other ValueErrors
        raise
    except Exception as e:
        return OrderResponse(
            success=False,
            message="Error processing position reversal",
            error=str(e)
        )

@router.post("/stop-loss", response_model=OrderResponse)
async def place_stop_loss_order(
    request: StopLossOrderRequest,
    enhanced_order_manager: EnhancedOrderManager = Depends(get_enhanced_order_manager),
    account_manager: AccountManager = Depends(get_account_manager),
    contract_manager: ContractManager = Depends(get_contract_manager)
):
    """
    Place a market order with stop loss using TopStepX API.
    
    This endpoint places a market order and then sets a stop loss level
    using the TopStepX position management API. The stop loss is set based
    on the specified number of points away from the filled price.
    
    Required parameters:
    - accountName: The name of the trading account
    - symbol: The symbol to trade (e.g., "NQ", "ES", "MES")
    - action: The order action ("Buy" or "Sell")
    - qty: The quantity to trade
    - stopLossPoints: Number of points away from entry for stop loss
    
    Optional parameters:
    - closeExistingOrders: Close existing orders before placing new ones
    - tradeTimeRanges: Time ranges when trading is allowed
    - avoidTradeTimeRanges: Time ranges when trading should be avoided
    - enableBreakEvenStop: Enable break-even stop modification ("Y" or "N")
    - breakEvenActivationOffset: Points profit to trigger break-even
    """
    try:
        # 🚫 CRITICAL: Check all trading restrictions before placing orders
        validation_result = validate_trading_with_all_restrictions()
        if not validation_result["overall_allowed"]:
            return OrderResponse(
                success=False,
                message="Trading is currently blocked",
                error=validation_result.get("primary_blocker", "Trading restrictions active")
            )
        
        # Convert payload to dict for easier manipulation
        try:
            # Try Pydantic v2 method first
            payload = request.model_dump(exclude_none=True)
        except AttributeError:
            # Fall back to Pydantic v1 method
            payload = request.dict(exclude_none=True)
        
        # Pre-resolve account and contract IDs for better performance
        account_name = payload["accountName"]
        symbol = payload["symbol"]
        
        # Use cached account ID lookup
        account_id = await get_cached_account_id(account_name, account_manager)
        if not account_id:
            return OrderResponse(
                success=False,
                message=f"Account not found: {account_name}",
                error=f"Could not resolve account ID for {account_name}"
            )
            
        # Use cached contract ID lookup
        contract_id = await get_cached_contract_id(symbol, contract_manager)
        if not contract_id:
            return OrderResponse(
                success=False,
                message=f"Contract not found: {symbol}",
                error=f"Could not resolve contract ID for {symbol}"
            )
        
        # Call the stop loss order method
        result = await enhanced_order_manager.place_market_order_with_stop_loss_topstepx_optimized(
            payload, account_id, contract_id
        )
        
        # Process the result
        if result.get("success", False):
            return OrderResponse(
                success=True,
                message=result.get("message", "Stop loss order placed successfully"),
                order_id=result.get("marketOrder", {}).get("orderId"),
                order_details=result
            )
        else:
            return OrderResponse(
                success=False,
                message="Failed to place stop loss order",
                error=result.get("error", "Unknown error")
            )
            
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            return OrderResponse(
                success=False,
                message="No credentials provided",
                error="Missing credentials: Username and API key must be provided to connect to trading account"
            )
        # Re-raise other ValueErrors
        raise
    except Exception as e:
        return OrderResponse(
            success=False,
            message="Error processing stop loss order",
            error=str(e)
        )

@router.post("/restart-break-even-streams", response_model=OrderResponse)
async def restart_break_even_streams(
    enhanced_order_manager: EnhancedOrderManager = Depends(get_enhanced_order_manager)
):
    """
    Force restart break-even monitoring streams.
    Useful when streams are lost due to server restarts.
    """
    try:
        logger.info("Force restarting break-even monitoring streams...")
        
        # Get the break-even monitor
        break_even_monitor = enhanced_order_manager.break_even_monitor
        
        # Get all eligible orders
        eligible_orders = []
        for order in enhanced_order_manager.stop_loss_tracker.orders.values():
            if (order.status == "ACTIVE" and
                getattr(order, 'enable_break_even_stop', False) and
                not getattr(order, 'break_even_activated', False)):
                eligible_orders.append(order)
        
        if not eligible_orders:
            return OrderResponse(
                success=True,
                message="No break-even orders found to restart streams for",
                order_details={"restarted_streams": 0, "eligible_orders": 0}
            )
        
        # Force recreate streams for all eligible orders
        restarted_count = 0
        for order in eligible_orders:
            order_id = getattr(order, 'order_id', None)
            symbol = getattr(order, 'symbol', '')
            contract_id = getattr(order, 'contract_id', None)
            
            if order_id and symbol and contract_id:
                logger.info(f"Force recreating stream for order {order_id} symbol {symbol}")
                
                # Remove from break-even tracking first
                if order_id in break_even_monitor.break_even_orders:
                    del break_even_monitor.break_even_orders[order_id]
                
                # Request new stream
                stream_success = await break_even_monitor.stream_manager.request_stream(symbol, contract_id, order_id)
                
                if stream_success:
                    # Add back to break-even monitoring
                    break_even_monitor.break_even_orders[order_id] = order
                    await break_even_monitor._update_order_stream_tracking(order, True)
                    restarted_count += 1
                    logger.info(f"Successfully restarted stream for order {order_id}")
                else:
                    logger.error(f"Failed to restart stream for order {order_id}")
        
        # Get updated status
        from src.managers.stream_manager import get_stream_manager
        stream_manager = get_stream_manager()
        active_streams = len(stream_manager.active_streams)
        
        return OrderResponse(
            success=True,
            message=f"Restarted {restarted_count} break-even streams",
            order_details={
                "restarted_streams": restarted_count,
                "eligible_orders": len(eligible_orders),
                "active_streams": active_streams,
                "stream_symbols": list(stream_manager.active_streams.keys())
            }
        )
        
    except Exception as e:
        logger.error(f"Error restarting break-even streams: {e}")
        return OrderResponse(
            success=False,
            message="Failed to restart break-even streams",
            error=str(e)
        )