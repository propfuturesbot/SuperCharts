"""
Bracket Order Tracker Module

This module tracks bracket order relationships and automatically cancels orphaned orders
when positions are closed.
"""
import json
import os
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
import logging

# Set up logging
logger = logging.getLogger(__name__)

@dataclass
class BracketOrderGroup:
    """Represents a group of related bracket orders"""
    group_id: str
    account_id: int
    account_name: str
    contract_id: str
    symbol: str
    orders: List[Dict[str, Any]]  # List of order details
    position_id: Optional[int]
    position_size: int
    status: str  # "OPEN", "CLOSED", "CLEANED"
    created_at: str
    updated_at: Optional[str] = None
    # NEW BREAK-EVEN FIELDS (optional for backward compatibility)
    entry_price: Optional[float] = None
    enable_break_even_stop: Optional[bool] = None
    break_even_activation_offset: Optional[float] = None
    break_even_activated: Optional[bool] = None
    break_even_activation_time: Optional[str] = None
    # STREAM TRACKING FIELDS
    stream_active: Optional[bool] = None  # True if chart stream is active for this group
    stream_started_at: Optional[str] = None  # When stream was started
    stream_symbol: Optional[str] = None  # Normalized symbol used for streaming (e.g., "NQ")

class BracketOrderTracker:
    """Manages bracket order tracking and orphaned order cleanup"""
    
    def __init__(self, token_manager, order_manager, position_manager):
        self.token_manager = token_manager
        self.order_manager = order_manager
        self.position_manager = position_manager
        self.json_file_path = "bracket_orders.json"
        self.groups: Dict[str, BracketOrderGroup] = {}
        self.load_groups()
    
    def load_groups(self):
        """Load existing bracket order groups from JSON file"""
        if os.path.exists(self.json_file_path):
            try:
                # Check if file is empty
                if os.path.getsize(self.json_file_path) == 0:
                    logger.info("Bracket orders file is empty, starting fresh")
                    self.groups = {}
                    return
                
                with open(self.json_file_path, 'r') as f:
                    content = f.read().strip()
                    if not content:
                        logger.info("Bracket orders file is empty, starting fresh")
                        self.groups = {}
                        return
                    
                    data = json.loads(content)
                    for group_data in data.get("bracket_orders", []):
                        group = BracketOrderGroup(**group_data)
                        self.groups[group.group_id] = group
                logger.info(f"Loaded {len(self.groups)} bracket order groups")
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON in bracket orders file: {e}. Starting fresh.")
                self.groups = {}
            except Exception as e:
                logger.error(f"Error loading bracket orders: {e}")
                self.groups = {}
        else:
            logger.info("No existing bracket orders file found, starting fresh")
            self.groups = {}
    
    def save_groups(self):
        """Save current bracket order groups to JSON file"""
        try:
            # Convert groups to serializable format
            data = {
                "bracket_orders": [asdict(group) for group in self.groups.values()],
                "last_updated": datetime.now().isoformat()
            }
            
            # Write to file
            with open(self.json_file_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            logger.info(f"Saved {len(self.groups)} bracket order groups")
        except Exception as e:
            logger.error(f"Error saving bracket orders: {e}")
    
    async def add_bracket_order_group(
        self,
        account_id: int,
        account_name: str,
        contract_id: str,
        symbol: str,
        market_order_id: int,
        stop_loss_order_id: Optional[int] = None,
        take_profit_order_id: Optional[int] = None,
        trail_stop_order_id: Optional[int] = None,
        position_size: int = 1,
        # NEW OPTIONAL BREAK-EVEN PARAMETERS
        entry_price: Optional[float] = None,
        enable_break_even_stop: Optional[bool] = None,
        break_even_activation_offset: Optional[float] = None
    ) -> str:
        """Add a new bracket order group to tracking"""
        # Generate unique group ID
        timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
        group_id = f"BRACKET-{account_id}-{symbol}-{timestamp}"
        
        # Create orders list based on what's provided
        orders = []
        
        if stop_loss_order_id:
            orders.append({
                "id": stop_loss_order_id,
                "type": "STOP_LOSS",
                "status": 1  # Open
            })
        
        if take_profit_order_id:
            orders.append({
                "id": take_profit_order_id,
                "type": "TAKE_PROFIT",
                "status": 1  # Open
            })
            
        if trail_stop_order_id:
            orders.append({
                "id": trail_stop_order_id,
                "type": "TRAILING_STOP",
                "status": 1  # Open
            })
        
        # Get position ID if available
        position_id = None
        try:
            position_id = await self.position_manager.getPositionIDForAccountName(
                account_name=account_name,
                contract_id=contract_id
            )
        except Exception as e:
            logger.warning(f"Could not get position ID: {e}")
        
        # Create bracket order group
        group = BracketOrderGroup(
            group_id=group_id,
            account_id=account_id,
            account_name=account_name,
            contract_id=contract_id,
            symbol=symbol,
            orders=orders,
            position_id=position_id,
            position_size=position_size,
            status="OPEN",
            created_at=datetime.now().isoformat(),
            # Break-even fields (optional)
            entry_price=entry_price,
            enable_break_even_stop=enable_break_even_stop,
            break_even_activation_offset=break_even_activation_offset,
            break_even_activated=False if enable_break_even_stop else None,
            break_even_activation_time=None
        )
        
        # Add to tracking
        self.groups[group_id] = group
        self.save_groups()
        
        logger.info(f"Added bracket order group {group_id} for {symbol} in account {account_name} with {len(orders)} orders")
        return group_id
    
    async def check_and_cleanup_group(self, group: BracketOrderGroup) -> bool:
        """Check if a bracket order group needs cleanup and perform it if necessary"""
        if group.status != "OPEN":
            return False
        
        try:
            # Check if position still exists
            positions = await self.position_manager.get_positions_by_contract(
                group.account_id, 
                group.contract_id
            )
            
            position_exists = len(positions) > 0
            
            if not position_exists:
                logger.info(f"Position closed for group {group.group_id}, cleaning up orphaned orders")
                
                # Check each order's current status before attempting to cancel
                for order_info in group.orders:
                    order_id = order_info["id"]
                    try:
                        # First check if order is still in open orders list
                        open_orders_response = await self.order_manager.search_open_orders(group.account_id)
                        order_still_open = any(
                            order.get('id') == order_id or order.get('orderId') == order_id 
                            for order in open_orders_response.orders
                        ) if open_orders_response.success else False
                        
                        # Only attempt to cancel if order is still open
                        if order_still_open:
                            await self.order_manager.cancel_order(
                                group.account_id,
                                order_id
                            )
                            # If we get here, cancellation was successful
                            logger.info(f"Cancelled {order_info['type']} order {order_id}")
                        else:
                            # Order is already filled/cancelled, just log it
                            logger.info(f"Order {order_id} not found in open orders, likely already filled/cancelled")
                        # Send Slack notification on successful cancellation
                        try:
                            from ..notifiers.slack_notifier import SlackNotifier
                            notifier = SlackNotifier()
                            notifier.send_notification(
                                "🗑️ Orphaned order cancelled",
                                f"Cancelled {order_info['type']} order {order_id} for {group.symbol} (acct {group.account_name})"
                            )
                        except Exception as e:
                            logger.debug(f"Slack notification failed: {e}")
                        
                        # Send Email notification on successful cancellation
                        try:
                            from ..notifiers.email_notifier import EmailNotifier
                            email_notifier = EmailNotifier()
                            email_notifier.send_notification(
                                "Orphaned order cancelled",
                                f"Cancelled {order_info['type']} order {order_id} for {group.symbol} (acct {group.account_name})"
                            )
                        except Exception as e:
                            logger.debug(f"Email notification failed: {e}")
                            
                    except Exception as e:
                        # Handle cancellation failures
                        error_message = str(e).lower()
                        
                        if "already cancelled" in error_message or "not found" in error_message or "does not exist" in error_message:
                            logger.info(f"Order {order_id} already cancelled or doesn't exist: {e}")
                        else:
                            logger.error(f"Error cancelling order {order_id}: {e}")
                            try:
                                from ..notifiers.slack_notifier import SlackNotifier
                                notifier = SlackNotifier()
                                notifier.send_notification(
                                    "⚠️ Failed to cancel order",
                                    f"Failed to cancel {order_info['type']} order {order_id} for {group.symbol}: {e}"
                                )
                            except Exception as ne:
                                logger.debug(f"Slack notification failed: {ne}")
                            
                            # Send Email notification on failed cancellation
                            try:
                                from ..notifiers.email_notifier import EmailNotifier
                                email_notifier = EmailNotifier()
                                email_notifier.send_notification(
                                    "Failed to cancel order",
                                    f"Failed to cancel {order_info['type']} order {order_id} for {group.symbol}: {e}"
                                )
                            except Exception as ne:
                                logger.debug(f"Email notification failed: {ne}")
                
                # Remove the group from tracking after successful cleanup
                del self.groups[group.group_id]
                self.save_groups()
                
                logger.info(f"Removed bracket order group {group.group_id} after successful cleanup")
                return True
                
        except Exception as e:
            logger.error(f"Error checking group {group.group_id}: {e}")
        
        return False
    
    async def check_all_open_groups(self):
        """Check all open bracket order groups and cleanup if necessary"""
        open_groups = [g for g in self.groups.values() if g.status == "OPEN"]
        
        logger.info(f"Checking {len(open_groups)} open bracket order groups")
        
        cleaned_count = 0
        for group in open_groups:
            if await self.check_and_cleanup_group(group):
                cleaned_count += 1
        
        if cleaned_count > 0:
            logger.info(f"Cleaned up {cleaned_count} bracket order groups")
    
    async def cleanup_on_position_close(self, account_name: str, symbol: str):
        """Trigger cleanup when a position is closed"""
        # Find all open groups for this account and symbol
        matching_groups = [
            g for g in self.groups.values()
            if g.status == "OPEN" 
            and g.account_name == account_name
            and g.symbol == symbol
        ]
        
        logger.info(f"Found {len(matching_groups)} open bracket groups for {account_name}/{symbol}")
        
        for group in matching_groups:
            await self.check_and_cleanup_group(group)
    
    def get_group_status(self, group_id: str) -> Optional[Dict[str, Any]]:
        """Get the status of a specific bracket order group"""
        group = self.groups.get(group_id)
        if group:
            return asdict(group)
        return None
    
    def get_all_groups_status(self) -> Dict[str, Any]:
        """Get status of all bracket order groups"""
        return {
            "total": len(self.groups),
            "open": len([g for g in self.groups.values() if g.status == "OPEN"]),
            "groups": [asdict(g) for g in self.groups.values()]
        }
    
    def cleanup_old_groups(self, days_to_keep: int = 7):
        """Remove old groups from tracking (both cleaned and uncleaned)"""
        cutoff_date = datetime.now().timestamp() - (days_to_keep * 24 * 60 * 60)
        
        groups_to_remove = []
        for group_id, group in self.groups.items():
            try:
                group_date = datetime.fromisoformat(group.created_at).timestamp()
                if group_date < cutoff_date:
                    groups_to_remove.append(group_id)
            except Exception as e:
                logger.error(f"Error parsing date for group {group_id}: {e}")
        
        for group_id in groups_to_remove:
            del self.groups[group_id]
        
        if groups_to_remove:
            logger.info(f"Removed {len(groups_to_remove)} old bracket order groups")
            self.save_groups() 