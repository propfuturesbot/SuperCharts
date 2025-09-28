"""
Break-Even Stop Monitor with Centralized Stream Management
"""
import asyncio
import json
from datetime import datetime
from typing import Dict, List, Optional, Any, Set
import logging

logger = logging.getLogger(__name__)

class BreakEvenMonitor:
    def __init__(self, token_manager, order_manager, stop_loss_tracker, bracket_tracker):
        self.token_manager = token_manager
        self.order_manager = order_manager
        self.stop_loss_tracker = stop_loss_tracker
        self.bracket_tracker = bracket_tracker
        self.monitoring_active = False
        self.monitoring_interval = 2
        
        from src.managers.stream_manager import get_stream_manager
        self.stream_manager = get_stream_manager()
        self.break_even_orders: Dict[int, Any] = {}
        
        # 🚨 EMERGENCY FIX: Track failed orders to prevent infinite loops
        self.failed_orders: Set[int] = set()  # Order IDs that have permanently failed
        self.max_lifetime_failures = 3  # Maximum failures before permanent blacklist
        
    async def add_break_even_order(self, order) -> bool:
        try:
            if not getattr(order, 'enable_break_even_stop', False):
                return False
            
            order_id = getattr(order, 'order_id', None)
            symbol = getattr(order, 'symbol', None)
            contract_id = getattr(order, 'contract_id', None)
            
            if not all([order_id, symbol, contract_id]):
                return False
            
            self.break_even_orders[order_id] = order
            stream_success = await self.stream_manager.request_stream(symbol, contract_id, order_id)
            
            if stream_success:
                await self._update_order_stream_tracking(order, True)
                logger.info(f"Added order {order_id} to break-even monitoring")
                return True
            else:
                del self.break_even_orders[order_id]
                return False
                
        except Exception as e:
            logger.error(f"Error adding break-even order: {e}")
            return False
    
    async def remove_break_even_order(self, order_id: int, symbol: str) -> bool:
        try:
            if order_id in self.break_even_orders:
                order = self.break_even_orders[order_id]
                del self.break_even_orders[order_id]
                await self._update_order_stream_tracking(order, False)
                
            await self.stream_manager.release_stream(symbol, order_id)
            logger.info(f"Removed order {order_id} from break-even monitoring")
            return True
            
        except Exception as e:
            logger.error(f"Error removing break-even order {order_id}: {e}")
            return False
    
    async def cleanup_streams_for_symbol(self, symbol: str) -> bool:
        try:
            orders_to_remove = []
            for order_id, order in self.break_even_orders.items():
                if getattr(order, 'symbol', '') == symbol:
                    orders_to_remove.append(order_id)
            
            for order_id in orders_to_remove:
                order = self.break_even_orders[order_id]
                del self.break_even_orders[order_id]
                await self._update_order_stream_tracking(order, False)
            
            await self.stream_manager.cleanup_streams_for_symbol(symbol)
            logger.info(f"Cleaned up {len(orders_to_remove)} orders for {symbol}")
            return True
            
        except Exception as e:
            logger.error(f"Error during cleanup for {symbol}: {e}")
            return False
    
    async def _update_order_stream_tracking(self, order, stream_active: bool):
        try:
            order.stream_active = stream_active
            order.stream_started_at = datetime.now().isoformat() if stream_active else None
            
            symbol = getattr(order, 'symbol', None)
            order.stream_symbol = self.stream_manager.normalize_symbol(symbol) if symbol and stream_active else None
            
            if hasattr(order, 'order_type'):
                self.stop_loss_tracker.save_orders()
            elif hasattr(order, 'group_id'):
                self.bracket_tracker.save_groups()
                
        except Exception as e:
            logger.error(f"Error updating stream tracking: {e}")
    
    async def get_current_price_from_stream(self, symbol: str) -> Optional[float]:
        try:
            logger.info(f"Calling stream_manager.get_latest_price for symbol: {symbol}")
            price = await self.stream_manager.get_latest_price(symbol)
            if price is not None:
                logger.info(f"Stream manager returned price {price} for {symbol}")
            else:
                logger.warning(f"Stream manager returned None for {symbol}")
            return price
        except Exception as e:
            logger.error(f"Error getting price for {symbol}: {e}")
            return None
    
    def calculate_profit(self, current_price: float, entry_price: float, is_long: bool) -> float:
        """Calculate profit based on position direction"""
        if is_long:
            return current_price - entry_price
        else:
            return entry_price - current_price
    
    def determine_position_direction(self, order_type: str, stop_price: float, entry_price: float) -> bool:
        """
        Determine if position is long or short based on order characteristics
        Returns True for long, False for short
        """
        # For stop loss orders, if stop is below entry, it's a long position
        # If stop is above entry, it's a short position
        return stop_price < entry_price
    
    async def check_break_even_trigger(self, order) -> bool:
        """
        Check if break-even should be triggered for a specific order.
        """
        try:
            # Validate order has break-even enabled and not yet activated
            if (not getattr(order, 'enable_break_even_stop', False) or
                getattr(order, 'break_even_activated', False) or
                not hasattr(order, 'entry_price') or
                not hasattr(order, 'break_even_activation_offset')):
                return False
            
            # Get current price from centralized stream manager
            symbol = getattr(order, 'symbol', '')
            logger.info(f"Attempting to get current price for order {order.order_id} symbol {symbol}")
            current_price = await self.get_current_price_from_stream(symbol)
            if current_price is None:
                logger.warning(f"Could not get current price for order {order.order_id} symbol {symbol}")
                return False
            
            logger.info(f"Retrieved current price {current_price} for order {order.order_id} symbol {symbol}")
            
            # Determine position direction
            is_long = self.determine_position_direction(
                order.order_type, 
                order.stop_price, 
                order.entry_price
            )
            
            # Calculate current profit
            profit = self.calculate_profit(current_price, order.entry_price, is_long)
            
            logger.debug(f"Order {order.order_id}: Current price={current_price}, Entry={order.entry_price}, "
                        f"Profit={profit}, Required={order.break_even_activation_offset}, IsLong={is_long}")
            
            # Check if profit threshold is met
            if profit >= order.break_even_activation_offset:
                logger.info(f"Break-even threshold met for order {order.order_id}: "
                          f"Profit {profit} >= {order.break_even_activation_offset}")
                
                # Modify stop loss to break-even (entry price) with retry logic
                success = await self.modify_stop_to_break_even(order)
                
                if success:
                    # Update order tracking
                    await self.update_break_even_activation(order)
                    
                    # Remove from monitoring and release stream
                    symbol = getattr(order, 'symbol', None)
                    if symbol:
                        await self.remove_break_even_order(order.order_id, symbol)
                        logger.info(f"Break-even completed for order {order.order_id}, removed from monitoring")
                    
                    return True
                else:
                    # Modification failed after all retry attempts
                    logger.error(f"Break-even modification failed for order {order.order_id} after all retry attempts")
                    
                    # Remove from monitoring to prevent infinite loops
                    symbol = getattr(order, 'symbol', None)
                    if symbol:
                        await self.remove_break_even_order(order.order_id, symbol)
                        logger.warning(f"Order {order.order_id} removed from break-even monitoring due to repeated modification failures")
                    
                    return False
                    
        except Exception as e:
            logger.error(f"Error checking break-even trigger for order {order.order_id}: {e}")
            
        return False
    
    async def modify_stop_to_break_even(self, order, max_attempts: int = 5) -> bool:
        """
        Modify stop loss order to break-even price (aligned to tick size) with retry logic.
        
        Args:
            order: The order to modify
            max_attempts: Maximum number of modification attempts (default: 5)
            
        Returns:
            True if modification successful, False if failed after all attempts
        """
        attempt = 0
        last_error = None
        
        while attempt < max_attempts:
            attempt += 1
            
            try:
                # Get contract ID for tick size alignment
                contract_id = getattr(order, 'contract_id', None)
                if not contract_id:
                    logger.error(f"No contract ID found for order {order.order_id}")
                    return False
                
                # Use entry price as new stop price (break-even)
                raw_stop_price = order.entry_price
                
                # Align price to tick size using ContractManager
                from src.managers.contract_manager import ContractManager
                contract_manager = ContractManager(self.token_manager)
                aligned_stop_price = await contract_manager.align_price_to_tick_size(contract_id, raw_stop_price)
                
                if aligned_stop_price is None:
                    logger.error(f"Failed to align price to tick size for order {order.order_id}")
                    return False
                
                logger.info(f"Modifying order {order.order_id} stop from {order.stop_price} to {aligned_stop_price} "
                           f"(break-even, aligned from {raw_stop_price}) - Attempt {attempt}/{max_attempts}")
                
                # Call the modify order API
                response = await self.order_manager.modify_order(
                    account_id=order.account_id,
                    order_id=order.order_id,
                    stop_price=aligned_stop_price
                )
                
                if response.success:
                    logger.info(f"Successfully modified order {order.order_id} to break-even at {aligned_stop_price} "
                               f"(attempt {attempt}/{max_attempts})")
                    return True
                else:
                    last_error = response.errorMessage or "Unknown error"
                    logger.warning(f"Attempt {attempt}/{max_attempts} failed to modify order {order.order_id}: {last_error}")
                    
                    # 🚨 EMERGENCY FIX: Detect terminal failures immediately
                    if self._is_terminal_error(last_error):
                        logger.error(f"🚨 TERMINAL ERROR for order {order.order_id}: {last_error}")
                        logger.error(f"🚨 Stopping retries immediately to prevent API spam")
                        
                        # Immediately remove from break-even monitoring and blacklist
                        symbol = getattr(order, 'symbol', None)
                        if symbol:
                            await self.remove_break_even_order(order.order_id, symbol)
                            self.failed_orders.add(order.order_id)  # 🚨 Permanently blacklist
                            logger.warning(f"🚨 Order {order.order_id} IMMEDIATELY removed and BLACKLISTED due to terminal error")
                        
                        return False
                    
                    # If not the last attempt and not a terminal error, wait before retrying
                    if attempt < max_attempts:
                        await asyncio.sleep(2)  # Wait 2 seconds between attempts
                        
            except Exception as e:
                last_error = str(e)
                logger.warning(f"Attempt {attempt}/{max_attempts} error modifying order {order.order_id}: {e}")
                
                # 🚨 EMERGENCY FIX: Check for terminal errors in exceptions too
                if self._is_terminal_error(str(e)):
                    logger.error(f"🚨 TERMINAL EXCEPTION for order {order.order_id}: {e}")
                    logger.error(f"🚨 Stopping retries immediately to prevent API spam")
                    
                    # Immediately remove from break-even monitoring and blacklist
                    symbol = getattr(order, 'symbol', None)
                    if symbol:
                        await self.remove_break_even_order(order.order_id, symbol)
                        self.failed_orders.add(order.order_id)  # 🚨 Permanently blacklist
                        logger.warning(f"🚨 Order {order.order_id} IMMEDIATELY removed and BLACKLISTED due to terminal exception")
                    
                    return False
                
                # If not the last attempt and not a terminal error, wait before retrying
                if attempt < max_attempts:
                    await asyncio.sleep(2)  # Wait 2 seconds between attempts
        
        # All attempts failed
        logger.error(f"FAILED to modify order {order.order_id} to break-even after {max_attempts} attempts. "
                    f"Last error: {last_error}")
        logger.error(f"Order {order.order_id} will be removed from break-even monitoring to prevent infinite retries.")
        
        # 🚨 EMERGENCY FIX: Ensure cleanup happens here too and blacklist
        symbol = getattr(order, 'symbol', None)
        if symbol:
            await self.remove_break_even_order(order.order_id, symbol)
            self.failed_orders.add(order.order_id)  # 🚨 Permanently blacklist
            logger.warning(f"🚨 Order {order.order_id} FORCE removed and BLACKLISTED after retry exhaustion")
        
        return False
    
    def _is_terminal_error(self, error_message: str) -> bool:
        """
        🚨 EMERGENCY FIX: Detect terminal errors that should not be retried.
        
        Args:
            error_message: The error message to check
            
        Returns:
            True if this is a terminal error, False if it might be transient
        """
        if not error_message:
            return False
            
        error_lower = error_message.lower()
        
        # Terminal error patterns that indicate the order no longer exists
        terminal_patterns = [
            "order not found",
            "not found",
            "does not exist", 
            "order does not exist",
            "invalid order",
            "order invalid",
            "already cancelled",
            "already canceled",
            "already filled",
            "order cancelled",
            "order canceled",
            "order filled",
            "order expired",
            "order closed"
        ]
        
        for pattern in terminal_patterns:
            if pattern in error_lower:
                return True
                
        return False
    
    def clear_failed_orders_blacklist(self) -> int:
        """
        🚨 EMERGENCY ADMIN: Clear the failed orders blacklist.
        
        Returns:
            Number of orders removed from blacklist
        """
        count = len(self.failed_orders)
        self.failed_orders.clear()
        logger.warning(f"🚨 ADMIN ACTION: Cleared {count} orders from failed orders blacklist")
        return count
    
    def get_failed_orders_count(self) -> int:
        """
        Get the number of orders in the failed orders blacklist.
        
        Returns:
            Number of blacklisted orders
        """
        return len(self.failed_orders)
    
    async def update_break_even_activation(self, order):
        """
        Update order tracking to reflect break-even activation.
        """
        try:
            # Store original stop price if not already stored
            if not getattr(order, 'original_stop_price', None):
                order.original_stop_price = order.stop_price
            
            # Update order with break-even activation (use aligned price)
            contract_id = getattr(order, 'contract_id', None)
            raw_stop_price = order.entry_price
            
            # Align price to tick size
            if contract_id:
                from src.managers.contract_manager import ContractManager
                contract_manager = ContractManager(self.token_manager)
                aligned_stop_price = await contract_manager.align_price_to_tick_size(contract_id, raw_stop_price)
                new_stop_price = aligned_stop_price if aligned_stop_price is not None else raw_stop_price
            else:
                new_stop_price = raw_stop_price
            
            order.stop_price = new_stop_price
            order.break_even_activated = True
            order.break_even_activation_time = datetime.now().isoformat()
            order.updated_at = datetime.now().isoformat()
            order.notes = f"{order.notes or ''} | Break-even activated at {order.break_even_activation_time}"
            
            # Update the stop loss tracker to reflect the new stop price
            await self.stop_loss_tracker.update_stop_price(
                order.order_id,
                new_stop_price,
                f"Break-even activated - stop moved to entry price {new_stop_price}"
            )
            
            logger.info(f"Updated tracking for order {order.order_id} - break-even activated")
            
        except Exception as e:
            logger.error(f"Error updating break-even activation for order {order.order_id}: {e}")

    def start_monitoring(self):
        if not self.monitoring_active:
            self.monitoring_active = True
            asyncio.create_task(self.monitor_break_even_orders())
            logger.info("Break-even monitoring started with centralized streaming")
    
    def stop_monitoring(self):
        self.monitoring_active = False
        logger.info("Break-even monitoring stopped")
    
    async def monitor_break_even_orders(self):
        """
        Main monitoring loop for break-even orders with centralized stream management.
        """
        logger.info("Starting break-even monitoring loop with centralized streaming")
        
        while self.monitoring_active:
            try:
                # Get all active stop loss orders with break-even enabled
                eligible_orders = []
                
                for order in self.stop_loss_tracker.orders.values():
                    # Only check orders that have break-even enabled and not yet activated
                    if (order.status == "ACTIVE" and
                        getattr(order, 'enable_break_even_stop', False) and
                        not getattr(order, 'break_even_activated', False)):
                        eligible_orders.append(order)
                
                # Ensure orders are in break-even monitoring with streams
                for order in eligible_orders:
                    order_id = getattr(order, 'order_id', None)
                    if order_id and order_id not in self.break_even_orders:
                        logger.info(f"Adding newly detected break-even order to monitoring: {order_id}")
                        await self.add_break_even_order(order)
                    elif order_id in self.break_even_orders:
                        # Check if stream is still active for existing orders
                        symbol = getattr(order, 'symbol', '')
                        normalized_symbol = self.stream_manager.normalize_symbol(symbol)
                        if normalized_symbol not in self.stream_manager.active_streams:
                            logger.warning(f"Stream lost for order {order_id}, recreating...")
                            contract_id = getattr(order, 'contract_id', None)
                            if contract_id:
                                stream_success = await self.stream_manager.request_stream(symbol, contract_id, order_id)
                                if stream_success:
                                    logger.info(f"Successfully recreated stream for order {order_id}")
                                else:
                                    logger.error(f"Failed to recreate stream for order {order_id}")
                
                if eligible_orders:
                    active_streams = len(self.stream_manager.active_streams)
                    logger.info(f"Monitoring {len(eligible_orders)} break-even orders with {active_streams} active streams")
                    
                    # Check each eligible order for break-even trigger
                    for order in eligible_orders:
                        try:
                            order_id = getattr(order, 'order_id', None)
                            
                            # 🚨 EMERGENCY FIX: Skip orders that have permanently failed
                            if order_id and order_id in self.failed_orders:
                                logger.debug(f"Skipping permanently failed order {order_id}")
                                continue
                            
                            # 🚨 EMERGENCY FIX: Skip orders that are no longer in break-even tracking
                            if order_id and order_id not in self.break_even_orders:
                                logger.debug(f"Skipping order {order_id} - not in break-even tracking")
                                continue
                            
                            # 🚨 EMERGENCY FIX: Double-check order hasn't been removed during processing
                            if getattr(order, 'break_even_activated', False):
                                logger.debug(f"Skipping order {order_id} - already activated")
                                # Clean up from tracking if somehow still there
                                if order_id in self.break_even_orders:
                                    symbol = getattr(order, 'symbol', '')
                                    await self.remove_break_even_order(order_id, symbol)
                                    logger.info(f"🚨 Cleaned up already-activated order {order_id} from monitoring")
                                continue
                            
                            triggered = await self.check_break_even_trigger(order)
                            if triggered:
                                logger.info(f"Break-even triggered for order {order.order_id}")
                        except Exception as e:
                            logger.error(f"Error checking order {order.order_id}: {e}")
                            # 🚨 EMERGENCY FIX: Remove problematic orders from monitoring
                            order_id = getattr(order, 'order_id', None)
                            if order_id and order_id in self.break_even_orders:
                                symbol = getattr(order, 'symbol', '')
                                await self.remove_break_even_order(order_id, symbol)
                                logger.warning(f"🚨 Removed problematic order {order_id} from monitoring due to exception")
                            continue
                            
                    logger.debug(f"Completed break-even check cycle")
                else:
                    # No eligible orders - clean up any remaining break-even tracking
                    if self.break_even_orders:
                        logger.info("No eligible break-even orders found, cleaning up tracking")
                        orders_to_remove = list(self.break_even_orders.keys())
                        for order_id in orders_to_remove:
                            order = self.break_even_orders[order_id]
                            symbol = getattr(order, 'symbol', '')
                            await self.remove_break_even_order(order_id, symbol)
                
                # Wait before next check
                await asyncio.sleep(self.monitoring_interval)
                
            except Exception as e:
                logger.error(f"Error in break-even monitoring loop: {e}")
                await asyncio.sleep(self.monitoring_interval)
                
        # Clean up when monitoring stops
        logger.info("Stopping break-even monitoring service and cleaning up")
        orders_to_remove = list(self.break_even_orders.keys())
        for order_id in orders_to_remove:
            order = self.break_even_orders[order_id]
            symbol = getattr(order, 'symbol', '')
            await self.remove_break_even_order(order_id, symbol)
    
    def get_monitoring_status(self) -> Dict[str, Any]:
        """
        Get current monitoring status including streaming information.
        """
        # Count eligible orders
        eligible_count = 0
        activated_count = 0
        
        for order in self.stop_loss_tracker.orders.values():
            if getattr(order, 'enable_break_even_stop', False):
                if getattr(order, 'break_even_activated', False):
                    activated_count += 1
                else:
                    eligible_count += 1
        
        # Get streaming statistics from centralized stream manager
        stream_status = self.stream_manager.get_all_streams_status()
        
        return {
            "monitoring_active": self.monitoring_active,
            "monitoring_interval": self.monitoring_interval,
            "eligible_orders": eligible_count,
            "activated_orders": activated_count,
            "total_tracked_orders": len(self.stop_loss_tracker.orders),
            "break_even_orders_tracked": len(self.break_even_orders),
            "failed_orders_blacklisted": len(self.failed_orders),  # 🚨 EMERGENCY FIX: Track blacklisted orders
            "streaming_enabled": True,
            "active_streams": len(self.stream_manager.active_streams),
            "streaming_symbols": list(self.stream_manager.active_streams.keys()),
            "stream_details": stream_status,
            "emergency_fixes_active": True  # 🚨 Indicate emergency fixes are in place
        }
