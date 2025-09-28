"""
StopLoss and Trailing Stop Order Tracker Module

This module tracks individual stop loss and trailing stop orders and automatically
manages them when positions are closed or modified. Optimized for scalping with
fast 10-second cleanup cycles.
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
class StopLossOrder:
    """Represents a stop loss or trailing stop order"""
    order_id: int
    account_id: int
    account_name: str
    contract_id: str
    symbol: str
    order_type: str  # "STOP_LOSS" or "TRAILING_STOP"
    stop_price: Optional[float]
    trail_amount: Optional[float]  # For trailing stops
    position_id: Optional[int]
    position_size: int
    original_position_size: int  # Track original size for partial fills
    status: str  # "ACTIVE", "CANCELLED", "FILLED", "ORPHANED"
    created_at: str
    updated_at: Optional[str] = None
    notes: Optional[str] = None
    # NEW BREAK-EVEN FIELDS (optional for backward compatibility)
    entry_price: Optional[float] = None
    enable_break_even_stop: Optional[bool] = None
    break_even_activation_offset: Optional[float] = None
    break_even_activated: Optional[bool] = None
    break_even_activation_time: Optional[str] = None
    original_stop_price: Optional[float] = None  # Store original stop before break-even modification
    # STREAM TRACKING FIELDS
    stream_active: Optional[bool] = None  # True if chart stream is active for this order
    stream_started_at: Optional[str] = None  # When stream was started
    stream_symbol: Optional[str] = None  # Normalized symbol used for streaming (e.g., "NQ")

class StopLossTracker:
    """Manages stop loss and trailing stop order tracking and cleanup - Optimized for scalping"""
    
    def __init__(self, token_manager, order_manager, position_manager):
        self.token_manager = token_manager
        self.order_manager = order_manager
        self.position_manager = position_manager
        self.json_file_path = "stop_loss_orders.json"
        self.orders: Dict[int, StopLossOrder] = {}  # Key: order_id
        self.load_orders()
        
        # Scalping optimization: Track last cleanup to avoid excessive file I/O
        self.last_cleanup = datetime.now()
        self.cleanup_interval_seconds = 10  # Match bracket tracker frequency
        
        # Break-even monitor integration
        self._break_even_monitor = None
    
    def set_break_even_monitor(self, break_even_monitor):
        """Set the break-even monitor for automatic integration"""
        self._break_even_monitor = break_even_monitor
        logger.info("Break-even monitor integration enabled for stop loss tracker")
    
    def load_orders(self):
        """Load existing stop loss orders from JSON file"""
        if os.path.exists(self.json_file_path):
            try:
                # Check if file is empty
                if os.path.getsize(self.json_file_path) == 0:
                    logger.info("Stop loss orders file is empty, starting fresh")
                    self.orders = {}
                    return
                
                with open(self.json_file_path, 'r') as f:
                    content = f.read().strip()
                    if not content:
                        logger.info("Stop loss orders file is empty, starting fresh")
                        self.orders = {}
                        return
                    
                    data = json.loads(content)
                    
                    # Handle backward compatibility: support both list and dict formats
                    if isinstance(data, list):
                        # Legacy format: direct list of orders
                        logger.info("Loading stop loss orders from legacy list format")
                        orders_list = data
                    elif isinstance(data, dict):
                        # New format: dictionary with metadata
                        orders_list = data.get("stop_loss_orders", [])
                    else:
                        logger.warning(f"Unexpected data format in stop loss orders file: {type(data)}")
                        self.orders = {}
                        return
                    
                    # Load orders from the list
                    for order_data in orders_list:
                        if isinstance(order_data, dict):
                            order = StopLossOrder(**order_data)
                            self.orders[order.order_id] = order
                        else:
                            logger.warning(f"Skipping invalid order data: {order_data}")
                    
                logger.info(f"Loaded {len(self.orders)} stop loss orders")
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON in stop loss orders file: {e}. Starting fresh.")
                self.orders = {}
            except Exception as e:
                logger.error(f"Error loading stop loss orders: {e}")
                self.orders = {}
        else:
            logger.info("No existing stop loss orders file found, starting fresh")
            self.orders = {}
    
    def save_orders(self):
        """Save current stop loss orders to JSON file - Optimized for scalping frequency"""
        try:
            # Convert orders to serializable format
            data = {
                "stop_loss_orders": [asdict(order) for order in self.orders.values()],
                "last_updated": datetime.now().isoformat(),
                "active_count": len([o for o in self.orders.values() if o.status == "ACTIVE"])
            }
            
            # Write to file atomically for scalping safety
            temp_file = f"{self.json_file_path}.tmp"
            with open(temp_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            # Atomic rename for scalping reliability
            os.rename(temp_file, self.json_file_path)
            
            logger.debug(f"Saved {len(self.orders)} stop loss orders ({data['active_count']} active)")
        except Exception as e:
            logger.error(f"Error saving stop loss orders: {e}")
    
    async def add_stop_loss_order(
        self,
        order_id: int,
        account_id: int,
        account_name: str,
        contract_id: str,
        symbol: str,
        order_type: str,  # "STOP_LOSS" or "TRAILING_STOP"
        stop_price: Optional[float] = None,
        trail_amount: Optional[float] = None,
        position_size: int = 1,
        notes: Optional[str] = None,
        # NEW OPTIONAL BREAK-EVEN PARAMETERS
        entry_price: Optional[float] = None,
        enable_break_even_stop: Optional[bool] = None,
        break_even_activation_offset: Optional[float] = None,
        break_even_activated: Optional[bool] = None,
        break_even_activation_time: Optional[str] = None,
        original_stop_price: Optional[float] = None
    ) -> bool:
        """Add a new stop loss or trailing stop order to tracking"""
        
        # Validate order type
        if order_type not in ["STOP_LOSS", "TRAILING_STOP"]:
            logger.error(f"Invalid order type: {order_type}")
            return False
        
        # Get position ID if available (fast lookup for scalping)
        position_id = None
        try:
            position_id = await self.position_manager.getPositionIDForAccountName(
                account_name=account_name,
                contract_id=contract_id
            )
        except Exception as e:
            logger.debug(f"Could not get position ID for order {order_id}: {e}")  # Debug level for scalping
        
        # Create stop loss order
        order = StopLossOrder(
            order_id=order_id,
            account_id=account_id,
            account_name=account_name,
            contract_id=contract_id,
            symbol=symbol,
            order_type=order_type,
            stop_price=stop_price,
            trail_amount=trail_amount,
            position_id=position_id,
            position_size=position_size,
            original_position_size=position_size,
            status="ACTIVE",
            created_at=datetime.now().isoformat(),
            notes=notes,
            entry_price=entry_price,
            enable_break_even_stop=enable_break_even_stop,
            break_even_activation_offset=break_even_activation_offset,
            break_even_activated=break_even_activated,
            break_even_activation_time=break_even_activation_time,
            original_stop_price=original_stop_price
        )
        
        # Add to tracking
        self.orders[order_id] = order
        self.save_orders()
        
        logger.info(f"Added {order_type} order {order_id} for {symbol} in {account_name}")
        
        # INTEGRATION: Automatically add to break-even monitoring if enabled
        if enable_break_even_stop and hasattr(self, '_break_even_monitor'):
            try:
                # Update stream tracking fields
                order.stream_active = None  # Will be set by break-even monitor
                order.stream_started_at = None
                order.stream_symbol = None
                
                # Add to break-even monitoring asynchronously
                import asyncio
                asyncio.create_task(self._break_even_monitor.add_break_even_order(order))
                logger.info(f"Added order {order_id} to centralized Chart Streaming break-even monitoring")
            except Exception as e:
                logger.error(f"Failed to add order {order_id} to break-even monitoring: {e}")
        
        return True
    
    async def check_and_cleanup_order(self, order: StopLossOrder) -> bool:
        """Check if a stop loss order needs cleanup and perform it if necessary - Scalping optimized"""
        if order.status != "ACTIVE":
            return False
        
        try:
            # Fast position check for scalping
            positions = await self.position_manager.get_positions_by_contract(
                order.account_id, 
                order.contract_id
            )
            
            position_exists = len(positions) > 0
            
            # If position doesn't exist, immediately cancel order
            if not position_exists:
                logger.info(f"Position closed for {order.order_type} order {order.order_id}, checking if order needs cancellation")
                
                try:
                    # First check if order is still in open orders list
                    open_orders_response = await self.order_manager.search_open_orders(order.account_id)
                    order_still_open = any(
                        ord.get('id') == order.order_id or ord.get('orderId') == order.order_id 
                        for ord in open_orders_response.orders
                    ) if open_orders_response.success else False
                    
                    # Only attempt to cancel if order is still open
                    if order_still_open:
                        cancel_result = await self.order_manager.cancel_order(
                            order.account_id,
                            order.order_id
                        )
                        # Success case - order was cancelled
                        logger.info(f"Cancelled orphaned {order.order_type} order {order.order_id}")
                    else:
                        # Order is already filled/cancelled, just mark it as processed
                        logger.info(f"Order {order.order_id} not found in open orders, marking as processed")
                        order.status = "CANCELLED"  # Default to cancelled since position is closed
                        order.updated_at = datetime.now().isoformat()
                        order.notes = f"Auto-detected: Order not in open orders, position was closed"
                        return True
                    
                    # Update order status
                    order.status = "CANCELLED"
                    order.updated_at = datetime.now().isoformat()
                    order.notes = f"Auto-cancelled: Position closed"
                    
                    # Send notifications (async for scalping speed)
                    asyncio.create_task(self._send_notifications(
                        f"🗑️ Orphaned {order.order_type} order cancelled",
                        f"Cancelled {order.order_type} order {order.order_id} for {order.symbol} (acct {order.account_name}) - Position was closed"
                    ))
                    
                    return True
                    
                except Exception as e:
                    # Handle various failure cases
                    error_message = str(e).lower()
                    
                    if "already cancelled" in error_message or "not found" in error_message or "does not exist" in error_message:
                        # Order already cancelled or doesn't exist - mark as cancelled for cleanup
                        logger.info(f"Order {order.order_id} appears to be already cancelled or doesn't exist: {e}")
                        order.status = "CANCELLED"
                        order.updated_at = datetime.now().isoformat()
                        order.notes = f"Already cancelled or doesn't exist: {e}"
                        self.save_orders()
                        return True
                    else:
                        # Real cancellation error - mark as orphaned but don't remove immediately
                        logger.error(f"Error cancelling order {order.order_id}: {e}")
                        order.status = "ORPHANED"
                        order.updated_at = datetime.now().isoformat()
                        order.notes = f"Failed to cancel: {e}"
                        self.save_orders()
                        
                        # Async notification for scalping speed
                        asyncio.create_task(self._send_notifications(
                            f"⚠️ Failed to cancel {order.order_type} order",
                            f"Failed to cancel {order.order_type} order {order.order_id} for {order.symbol}: {e}"
                        ))
                        
                        return False  # Don't consider this "cleaned up" yet
            
            # Quick position size check for scalping (only if position exists)
            else:
                current_position_size = sum(pos.size for pos in positions)
                if current_position_size != order.position_size:
                    logger.debug(f"Position size changed for order {order.order_id}: {order.position_size} -> {current_position_size}")
                    order.position_size = current_position_size
                    order.updated_at = datetime.now().isoformat()
                    order.notes = f"Position size updated from {order.original_position_size} to {current_position_size}"
                
        except Exception as e:
            logger.error(f"Error checking order {order.order_id}: {e}")
        
        return False
    
    async def check_all_active_orders_fast(self):
        """Fast check of all active stop loss orders - Optimized for 10-second scalping cycles"""
        active_orders = [o for o in self.orders.values() if o.status == "ACTIVE"]
        
        if active_orders:
            logger.debug(f"Fast checking {len(active_orders)} active stop loss orders")
            
            cleaned_count = 0
            # Process orders concurrently for scalping speed
            tasks = [self.check_and_cleanup_order(order) for order in active_orders]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"Error checking order {active_orders[i].order_id}: {result}")
                elif result:
                    cleaned_count += 1
            
            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} stop loss orders")
                # Save after batch cleanup for efficiency
                self.save_orders()
        
        # ALWAYS run cleanup of processed orders - regardless of active orders count
        # This ensures CANCELLED/FILLED orders are removed from the JSON file
        self._cleanup_processed_orders()
        
        # Update last cleanup time
        self.last_cleanup = datetime.now()
    
    def _cleanup_processed_orders(self):
        """Remove processed orders quickly for scalping - keeps only ACTIVE orders and very recent others"""
        current_time = datetime.now().timestamp()
        
        orders_to_remove = []
        for order_id, order in self.orders.items():
            try:
                if order.status == "ORPHANED":
                    # Remove ORPHANED orders immediately - they failed to cancel and are useless
                    orders_to_remove.append(order_id)
                    logger.info(f"Removing ORPHANED order {order_id} from tracking - failed cancellation")
                elif order.status == "CANCELLED":
                    # Remove CANCELLED orders after 1 minute for scalping efficiency
                    order_time = datetime.fromisoformat(order.updated_at or order.created_at).timestamp()
                    if current_time - order_time > 60:  # 1 minute
                        orders_to_remove.append(order_id)
                elif order.status == "FILLED":
                    # Remove FILLED orders after 2 minutes for scalping efficiency  
                    order_time = datetime.fromisoformat(order.updated_at or order.created_at).timestamp()
                    if current_time - order_time > 120:  # 2 minutes
                        orders_to_remove.append(order_id)
                elif order.status != "ACTIVE":
                    # For any other non-active status, remove after 30 seconds
                    order_time = datetime.fromisoformat(order.updated_at or order.created_at).timestamp()
                    if current_time - order_time > 30:  # 30 seconds
                        orders_to_remove.append(order_id)
            except Exception as e:
                logger.debug(f"Error parsing date for order {order_id}: {e}")
                # If we can't parse the date, remove old non-active orders immediately
                if order.status != "ACTIVE":
                    orders_to_remove.append(order_id)
        
        # INTEGRATION: Remove from break-even monitoring before deleting
        if hasattr(self, '_break_even_monitor') and self._break_even_monitor:
            for order_id in orders_to_remove:
                try:
                    order = self.orders[order_id]
                    if getattr(order, 'enable_break_even_stop', False):
                        symbol = getattr(order, 'symbol', None)
                        if symbol:
                            import asyncio
                            asyncio.create_task(self._break_even_monitor.remove_break_even_order(order_id, symbol))
                            logger.debug(f"Removed order {order_id} from break-even monitoring during cleanup")
                except Exception as e:
                    logger.debug(f"Error removing order {order_id} from break-even monitoring during cleanup: {e}")
        
        for order_id in orders_to_remove:
            del self.orders[order_id]
        
        if orders_to_remove:
            logger.info(f"Cleaned up {len(orders_to_remove)} processed stop loss orders for scalping efficiency")
            self.save_orders()
    
    async def cleanup_on_position_close(self, account_name: str, symbol: str):
        """Immediate cleanup when a position is closed - Critical for scalping"""
        # Find all active orders for this account and symbol
        matching_orders = [
            o for o in self.orders.values()
            if o.status == "ACTIVE" 
            and o.account_name == account_name
            and o.symbol == symbol
        ]
        
        if not matching_orders:
            return
        
        logger.info(f"URGENT: Found {len(matching_orders)} active stop loss orders for {account_name}/{symbol}")
        
        # INTEGRATION: Remove break-even orders from monitoring and cleanup streams immediately
        if hasattr(self, '_break_even_monitor') and self._break_even_monitor:
            # Force cleanup all streams for this symbol (position flattened)
            try:
                await self._break_even_monitor.cleanup_streams_for_symbol(symbol)
                logger.info(f"Cleaned up all Chart Streams for {symbol} on position close")
            except Exception as e:
                logger.error(f"Error cleaning up streams for {symbol}: {e}")
            
            # Also remove individual orders from break-even monitoring
            for order in matching_orders:
                if getattr(order, 'enable_break_even_stop', False):
                    try:
                        await self._break_even_monitor.remove_break_even_order(order.order_id, symbol)
                        logger.debug(f"Removed order {order.order_id} from break-even monitoring on position close")
                    except Exception as e:
                        logger.debug(f"Error removing order {order.order_id} from break-even monitoring: {e}")
        
        # Process immediately for scalping
        tasks = [self.check_and_cleanup_order(order) for order in matching_orders]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        # Immediate save for scalping reliability
        self.save_orders()
    
    async def update_order_status(self, order_id: int, new_status: str, notes: Optional[str] = None):
        """Update the status of a tracked order - Fast for scalping"""
        if order_id in self.orders:
            order = self.orders[order_id]
            old_status = order.status
            order.status = new_status
            order.updated_at = datetime.now().isoformat()
            if notes:
                order.notes = notes
            
            logger.info(f"Updated order {order_id} status: {old_status} -> {new_status}")
            
            # INTEGRATION: Remove from break-even monitoring if order is no longer active
            if (new_status != "ACTIVE" and 
                getattr(order, 'enable_break_even_stop', False) and 
                hasattr(self, '_break_even_monitor') and 
                self._break_even_monitor):
                try:
                    symbol = getattr(order, 'symbol', None)
                    if symbol:
                        import asyncio
                        asyncio.create_task(self._break_even_monitor.remove_break_even_order(order_id, symbol))
                        logger.info(f"Removed order {order_id} from centralized Chart Streaming break-even monitoring")
                except Exception as e:
                    logger.error(f"Failed to remove order {order_id} from break-even monitoring: {e}")
            
            # Immediate save for critical status changes in scalping
            if new_status in ["FILLED", "CANCELLED"]:
                self.save_orders()
            
            return True
        
        logger.warning(f"Order {order_id} not found in tracking")
        return False
    
    async def modify_trailing_stop(self, order_id: int, new_trail_amount: float):
        """Update the trail amount for a trailing stop order - Fast for scalping"""
        if order_id in self.orders:
            order = self.orders[order_id]
            if order.order_type == "TRAILING_STOP":
                old_trail = order.trail_amount
                order.trail_amount = new_trail_amount
                order.updated_at = datetime.now().isoformat()
                order.notes = f"Trail amount updated from {old_trail} to {new_trail_amount}"
                
                logger.info(f"Updated trailing stop order {order_id} trail amount: {old_trail} -> {new_trail_amount}")
                # Immediate save for trailing stop changes in scalping
                self.save_orders()
                return True
            else:
                logger.error(f"Order {order_id} is not a trailing stop order")
                return False
        
        logger.warning(f"Order {order_id} not found in tracking")
        return False
    
    async def update_stop_price(self, order_id: int, new_stop_price: float, notes: Optional[str] = None):
        """Update the stop price for a tracked order - Used for break-even modifications"""
        if order_id in self.orders:
            order = self.orders[order_id]
            old_stop_price = order.stop_price
            order.stop_price = new_stop_price
            order.updated_at = datetime.now().isoformat()
            
            if notes:
                order.notes = f"{order.notes or ''} | {notes}"
            else:
                order.notes = f"{order.notes or ''} | Stop price updated from {old_stop_price} to {new_stop_price}"
            
            logger.info(f"Updated stop price for order {order_id}: {old_stop_price} -> {new_stop_price}")
            
            # Immediate save for stop price changes (critical for break-even)
            self.save_orders()
            return True
        
        logger.warning(f"Order {order_id} not found in tracking")
        return False
    
    def get_order_status(self, order_id: int) -> Optional[Dict[str, Any]]:
        """Get the status of a specific stop loss order"""
        order = self.orders.get(order_id)
        if order:
            return asdict(order)
        return None
    
    def get_orders_by_symbol(self, symbol: str, account_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all orders for a specific symbol - Fast lookup for scalping"""
        orders = [
            asdict(o) for o in self.orders.values()
            if o.symbol == symbol and (account_name is None or o.account_name == account_name)
        ]
        return orders
    
    def get_all_orders_status(self) -> Dict[str, Any]:
        """Get status of all stop loss orders - Optimized summary for scalping"""
        active_count = len([o for o in self.orders.values() if o.status == "ACTIVE"])
        cancelled_count = len([o for o in self.orders.values() if o.status == "CANCELLED"])
        orphaned_count = len([o for o in self.orders.values() if o.status == "ORPHANED"])
        filled_count = len([o for o in self.orders.values() if o.status == "FILLED"])
        
        return {
            "total": len(self.orders),
            "active": active_count,
            "cancelled": cancelled_count,
            "orphaned": orphaned_count,
            "filled": filled_count,
            "last_cleanup": self.last_cleanup.isoformat(),
            "orders": [asdict(o) for o in self.orders.values()]
        }
    
    def cleanup_old_orders(self, days_to_keep: int = 1):
        """Remove old orders from tracking - Shorter retention for scalping (1 day default)"""
        cutoff_date = datetime.now().timestamp() - (days_to_keep * 24 * 60 * 60)
        
        orders_to_remove = []
        for order_id, order in self.orders.items():
            try:
                order_date = datetime.fromisoformat(order.created_at).timestamp()
                # Only remove non-active orders that are old
                if order_date < cutoff_date and order.status != "ACTIVE":
                    orders_to_remove.append(order_id)
            except Exception as e:
                logger.error(f"Error parsing date for order {order_id}: {e}")
        
        for order_id in orders_to_remove:
            del self.orders[order_id]
        
        if orders_to_remove:
            logger.info(f"Removed {len(orders_to_remove)} old stop loss orders")
            self.save_orders()
    
    async def _send_notifications(self, title: str, message: str):
        """Send notifications via Slack and Email - Async for scalping performance"""
        try:
            # Send Slack notification
            try:
                from ..notifiers.slack_notifier import SlackNotifier
                notifier = SlackNotifier()
                notifier.send_notification(title, message)
            except Exception as e:
                logger.debug(f"Slack notification failed: {e}")
            
            # Send Email notification
            try:
                from ..notifiers.email_notifier import EmailNotifier
                email_notifier = EmailNotifier()
                email_notifier.send_notification(title, message)
            except Exception as e:
                logger.debug(f"Email notification failed: {e}")
        except Exception as e:
            logger.debug(f"Notification error: {e}")  # Don't let notifications slow down scalping 