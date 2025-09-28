"""
Bracket Order Routes
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from api.dependencies import (
    get_token_manager,
    get_order_manager,
    get_position_manager
)
from src.managers.token_manager import TokenManager
from src.managers.order_manager import OrderManager
from src.managers.position_manager import PositionManager
from src.managers.bracket_order_tracker import BracketOrderTracker

router = APIRouter(prefix="/api/bracket-orders", tags=["bracket_orders"])

# Response models
class BracketOrderStatusResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# Get bracket tracker dependency
async def get_bracket_tracker(
    token_manager: TokenManager = Depends(get_token_manager),
    order_manager: OrderManager = Depends(get_order_manager),
    position_manager: PositionManager = Depends(get_position_manager)
) -> BracketOrderTracker:
    """
    Create a BracketOrderTracker instance using the provided dependencies.
    """
    return BracketOrderTracker(
        token_manager=token_manager,
        order_manager=order_manager,
        position_manager=position_manager
    )

@router.get("/status", response_model=BracketOrderStatusResponse)
async def get_all_bracket_orders_status(
    bracket_tracker: BracketOrderTracker = Depends(get_bracket_tracker)
):
    """
    Get the status of all bracket order groups.
    
    Returns summary information and details of all tracked bracket orders.
    """
    try:
        status = bracket_tracker.get_all_groups_status()
        return BracketOrderStatusResponse(
            success=True,
            message="Retrieved bracket order status successfully",
            data=status
        )
    except Exception as e:
        return BracketOrderStatusResponse(
            success=False,
            message="Failed to retrieve bracket order status",
            error=str(e)
        )

@router.get("/status/{group_id}", response_model=BracketOrderStatusResponse)
async def get_bracket_order_group_status(
    group_id: str,
    bracket_tracker: BracketOrderTracker = Depends(get_bracket_tracker)
):
    """
    Get the status of a specific bracket order group.
    
    Args:
        group_id: The unique identifier of the bracket order group
    """
    try:
        status = bracket_tracker.get_group_status(group_id)
        if status:
            return BracketOrderStatusResponse(
                success=True,
                message=f"Retrieved status for group {group_id}",
                data=status
            )
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Bracket order group {group_id} not found"
            )
    except HTTPException:
        raise
    except Exception as e:
        return BracketOrderStatusResponse(
            success=False,
            message=f"Failed to retrieve status for group {group_id}",
            error=str(e)
        )

@router.post("/cleanup", response_model=BracketOrderStatusResponse)
async def trigger_bracket_cleanup(
    bracket_tracker: BracketOrderTracker = Depends(get_bracket_tracker)
):
    """
    Manually trigger cleanup of all open bracket order groups.
    
    This will check all open groups and cancel orphaned orders where positions have been closed.
    """
    try:
        await bracket_tracker.check_all_open_groups()
        
        # Get updated status after cleanup
        status = bracket_tracker.get_all_groups_status()
        
        return BracketOrderStatusResponse(
            success=True,
            message="Bracket order cleanup completed",
            data=status
        )
    except Exception as e:
        return BracketOrderStatusResponse(
            success=False,
            message="Failed to perform bracket order cleanup",
            error=str(e)
        )

@router.post("/cleanup/{group_id}", response_model=BracketOrderStatusResponse)
async def cleanup_specific_bracket_group(
    group_id: str,
    bracket_tracker: BracketOrderTracker = Depends(get_bracket_tracker)
):
    """
    Manually trigger cleanup for a specific bracket order group.
    
    Args:
        group_id: The unique identifier of the bracket order group to cleanup
    """
    try:
        # Get the group
        group = bracket_tracker.groups.get(group_id)
        if not group:
            raise HTTPException(
                status_code=404,
                detail=f"Bracket order group {group_id} not found"
            )
        
        # Perform cleanup
        cleaned = await bracket_tracker.check_and_cleanup_group(group)
        
        # Get updated status
        status = bracket_tracker.get_group_status(group_id)
        
        return BracketOrderStatusResponse(
            success=True,
            message=f"Cleanup {'completed' if cleaned else 'not needed'} for group {group_id}",
            data=status
        )
    except HTTPException:
        raise
    except Exception as e:
        return BracketOrderStatusResponse(
            success=False,
            message=f"Failed to cleanup group {group_id}",
            error=str(e)
        )

@router.delete("/old-groups", response_model=BracketOrderStatusResponse)
async def remove_old_bracket_groups(
    days_to_keep: int = 7,
    bracket_tracker: BracketOrderTracker = Depends(get_bracket_tracker)
):
    """
    Remove old cleaned bracket order groups from tracking.
    
    Args:
        days_to_keep: Number of days to keep cleaned groups (default: 7)
    """
    try:
        # Get count before cleanup
        before_count = len(bracket_tracker.groups)
        
        # Perform cleanup
        bracket_tracker.cleanup_old_groups(days_to_keep)
        
        # Get count after cleanup
        after_count = len(bracket_tracker.groups)
        removed_count = before_count - after_count
        
        # Get updated status
        status = bracket_tracker.get_all_groups_status()
        status["removed_count"] = removed_count
        
        return BracketOrderStatusResponse(
            success=True,
            message=f"Removed {removed_count} old bracket order groups",
            data=status
        )
    except Exception as e:
        return BracketOrderStatusResponse(
            success=False,
            message="Failed to remove old bracket order groups",
            error=str(e)
        ) 