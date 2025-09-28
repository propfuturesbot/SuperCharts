"""
API routes for StopLoss and Trailing Stop order tracking and management
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from api.dependencies import get_token_manager, get_order_manager, get_position_manager
from src.managers.token_manager import TokenManager
from src.managers.order_manager import OrderManager
from src.managers.position_manager import PositionManager
from src.managers.stop_loss_tracker import StopLossTracker

router = APIRouter(prefix="/stop-loss-orders", tags=["stop-loss-orders"])

# Response models
class StopLossOrderStatusResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class AddStopLossOrderRequest(BaseModel):
    order_id: int
    account_id: int
    account_name: str
    contract_id: str
    symbol: str
    order_type: str  # "STOP_LOSS" or "TRAILING_STOP"
    stop_price: Optional[float] = None
    trail_amount: Optional[float] = None
    position_size: int = 1
    notes: Optional[str] = None

class UpdateOrderStatusRequest(BaseModel):
    order_id: int
    new_status: str
    notes: Optional[str] = None

class ModifyTrailingStopRequest(BaseModel):
    order_id: int
    new_trail_amount: float

# Get stop loss tracker dependency
async def get_stop_loss_tracker(
    token_manager: TokenManager = Depends(get_token_manager),
    order_manager: OrderManager = Depends(get_order_manager),
    position_manager: PositionManager = Depends(get_position_manager)
) -> StopLossTracker:
    """
    Create a StopLossTracker instance using the provided dependencies.
    """
    return StopLossTracker(
        token_manager=token_manager,
        order_manager=order_manager,
        position_manager=position_manager
    )

@router.get("/status", response_model=StopLossOrderStatusResponse)
async def get_all_stop_loss_orders_status(
    stop_loss_tracker: StopLossTracker = Depends(get_stop_loss_tracker)
):
    """
    Get the status of all stop loss orders.
    
    Returns summary information and details of all tracked stop loss orders.
    """
    try:
        status = stop_loss_tracker.get_all_orders_status()
        return StopLossOrderStatusResponse(
            success=True,
            message="Retrieved stop loss orders status successfully",
            data=status
        )
    except Exception as e:
        return StopLossOrderStatusResponse(
            success=False,
            message="Failed to retrieve stop loss orders status",
            error=str(e)
        )

@router.get("/status/{order_id}", response_model=StopLossOrderStatusResponse)
async def get_stop_loss_order_status(
    order_id: int,
    stop_loss_tracker: StopLossTracker = Depends(get_stop_loss_tracker)
):
    """
    Get the status of a specific stop loss order.
    
    Args:
        order_id: The unique identifier of the stop loss order
    """
    try:
        status = stop_loss_tracker.get_order_status(order_id)
        if status:
            return StopLossOrderStatusResponse(
                success=True,
                message=f"Retrieved status for order {order_id}",
                data=status
            )
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Stop loss order {order_id} not found"
            )
    except HTTPException:
        raise
    except Exception as e:
        return StopLossOrderStatusResponse(
            success=False,
            message=f"Failed to retrieve status for order {order_id}",
            error=str(e)
        )

@router.get("/symbol/{symbol}", response_model=StopLossOrderStatusResponse)
async def get_stop_loss_orders_by_symbol(
    symbol: str,
    account_name: Optional[str] = None,
    stop_loss_tracker: StopLossTracker = Depends(get_stop_loss_tracker)
):
    """
    Get all stop loss orders for a specific symbol.
    
    Args:
        symbol: The trading symbol
        account_name: Optional account name filter
    """
    try:
        orders = stop_loss_tracker.get_orders_by_symbol(symbol, account_name)
        return StopLossOrderStatusResponse(
            success=True,
            message=f"Retrieved {len(orders)} stop loss orders for {symbol}",
            data={
                "symbol": symbol,
                "account_name": account_name,
                "orders": orders,
                "count": len(orders)
            }
        )
    except Exception as e:
        return StopLossOrderStatusResponse(
            success=False,
            message=f"Failed to retrieve orders for symbol {symbol}",
            error=str(e)
        )

@router.post("/add", response_model=StopLossOrderStatusResponse)
async def add_stop_loss_order(
    request: AddStopLossOrderRequest,
    stop_loss_tracker: StopLossTracker = Depends(get_stop_loss_tracker)
):
    """
    Add a new stop loss or trailing stop order to tracking.
    
    This is typically called automatically when orders are placed,
    but can be used manually for existing orders.
    """
    try:
        success = await stop_loss_tracker.add_stop_loss_order(
            order_id=request.order_id,
            account_id=request.account_id,
            account_name=request.account_name,
            contract_id=request.contract_id,
            symbol=request.symbol,
            order_type=request.order_type,
            stop_price=request.stop_price,
            trail_amount=request.trail_amount,
            position_size=request.position_size,
            notes=request.notes
        )
        
        if success:
            return StopLossOrderStatusResponse(
                success=True,
                message=f"Added {request.order_type} order {request.order_id} to tracking"
            )
        else:
            return StopLossOrderStatusResponse(
                success=False,
                message=f"Failed to add order {request.order_id} to tracking",
                error="Invalid order type or other validation error"
            )
    except Exception as e:
        return StopLossOrderStatusResponse(
            success=False,
            message=f"Failed to add order {request.order_id} to tracking",
            error=str(e)
        )

@router.post("/cleanup", response_model=StopLossOrderStatusResponse)
async def trigger_stop_loss_cleanup(
    stop_loss_tracker: StopLossTracker = Depends(get_stop_loss_tracker)
):
    """
    Manually trigger cleanup of all active stop loss orders.
    
    This will check all active orders and cancel orphaned orders where positions have been closed.
    """
    try:
        await stop_loss_tracker.check_all_active_orders_fast()
        
        # Get updated status after cleanup
        status = stop_loss_tracker.get_all_orders_status()
        
        return StopLossOrderStatusResponse(
            success=True,
            message="Stop loss order cleanup completed",
            data=status
        )
    except Exception as e:
        return StopLossOrderStatusResponse(
            success=False,
            message="Failed to perform stop loss order cleanup",
            error=str(e)
        )

@router.post("/cleanup/{account_name}/{symbol}", response_model=StopLossOrderStatusResponse)
async def cleanup_stop_loss_orders_for_position(
    account_name: str,
    symbol: str,
    stop_loss_tracker: StopLossTracker = Depends(get_stop_loss_tracker)
):
    """
    Manually trigger cleanup for stop loss orders related to a specific position.
    
    Args:
        account_name: The account name
        symbol: The trading symbol
    """
    try:
        await stop_loss_tracker.cleanup_on_position_close(account_name, symbol)
        
        # Get updated orders for this symbol
        orders = stop_loss_tracker.get_orders_by_symbol(symbol, account_name)
        
        return StopLossOrderStatusResponse(
            success=True,
            message=f"Cleanup completed for {account_name}/{symbol}",
            data={
                "account_name": account_name,
                "symbol": symbol,
                "remaining_orders": orders,
                "count": len(orders)
            }
        )
    except Exception as e:
        return StopLossOrderStatusResponse(
            success=False,
            message=f"Failed to cleanup orders for {account_name}/{symbol}",
            error=str(e)
        )

@router.put("/status", response_model=StopLossOrderStatusResponse)
async def update_order_status(
    request: UpdateOrderStatusRequest,
    stop_loss_tracker: StopLossTracker = Depends(get_stop_loss_tracker)
):
    """
    Update the status of a tracked stop loss order.
    
    Useful for marking orders as FILLED, CANCELLED, etc.
    """
    try:
        success = await stop_loss_tracker.update_order_status(
            request.order_id,
            request.new_status,
            request.notes
        )
        
        if success:
            return StopLossOrderStatusResponse(
                success=True,
                message=f"Updated order {request.order_id} status to {request.new_status}"
            )
        else:
            return StopLossOrderStatusResponse(
                success=False,
                message=f"Order {request.order_id} not found in tracking",
                error="Order not found"
            )
    except Exception as e:
        return StopLossOrderStatusResponse(
            success=False,
            message=f"Failed to update order {request.order_id} status",
            error=str(e)
        )

@router.put("/trailing-stop", response_model=StopLossOrderStatusResponse)
async def modify_trailing_stop(
    request: ModifyTrailingStopRequest,
    stop_loss_tracker: StopLossTracker = Depends(get_stop_loss_tracker)
):
    """
    Modify the trail amount for a trailing stop order.
    
    This updates the tracking system only. You may need to also update
    the actual order in the broker system.
    """
    try:
        success = await stop_loss_tracker.modify_trailing_stop(
            request.order_id,
            request.new_trail_amount
        )
        
        if success:
            return StopLossOrderStatusResponse(
                success=True,
                message=f"Updated trailing stop order {request.order_id} trail amount to {request.new_trail_amount}"
            )
        else:
            return StopLossOrderStatusResponse(
                success=False,
                message=f"Failed to update trailing stop order {request.order_id}",
                error="Order not found or not a trailing stop order"
            )
    except Exception as e:
        return StopLossOrderStatusResponse(
            success=False,
            message=f"Failed to modify trailing stop order {request.order_id}",
            error=str(e)
        )

@router.delete("/old-orders", response_model=StopLossOrderStatusResponse)
async def remove_old_stop_loss_orders(
    days_to_keep: int = 1,
    stop_loss_tracker: StopLossTracker = Depends(get_stop_loss_tracker)
):
    """
    Remove old stop loss orders from tracking.
    
    Args:
        days_to_keep: Number of days to keep non-active orders (default: 1 for scalping)
    """
    try:
        # Get count before cleanup
        before_count = len(stop_loss_tracker.orders)
        
        # Perform cleanup
        stop_loss_tracker.cleanup_old_orders(days_to_keep)
        
        # Get count after cleanup
        after_count = len(stop_loss_tracker.orders)
        removed_count = before_count - after_count
        
        # Get updated status
        status = stop_loss_tracker.get_all_orders_status()
        status["removed_count"] = removed_count
        
        return StopLossOrderStatusResponse(
            success=True,
            message=f"Removed {removed_count} old stop loss orders",
            data=status
        )
    except Exception as e:
        return StopLossOrderStatusResponse(
            success=False,
            message="Failed to remove old stop loss orders",
            error=str(e)
        ) 