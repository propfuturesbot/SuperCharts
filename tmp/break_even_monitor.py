"""
Break-Even Stop Monitor with Centralized Chart Streaming

This module monitors orders with break-even stops enabled and automatically
modifies stop losses to break-even when profit thresholds are met.

Now uses centralized StreamManager for efficient stream lifecycle management.
"""
import asyncio
import json
from datetime import datetime
from typing import Dict, List, Optional, Any, Set
import logging

# Set up logging
logger = logging.getLogger(__name__)

class BreakEvenMonitor:
    """
    Monitors break-even stops and modifies stop losses when thresholds are met.
    Uses centralized StreamManager for efficient stream lifecycle management.
    """
    
    def __init__(self, token_manager, order_manager, stop_loss_tracker, bracket_tracker):
        self.token_manager = token_manager
        self.order_manager = order_manager
        self.stop_loss_tracker = stop_loss_tracker
        self.bracket_tracker = bracket_tracker
        self.monitoring_active = False
        self.monitoring_interval = 2  # Check every 2 seconds (faster with streaming)
        
        # Import and use centralized stream manager
        from src.managers.stream_manager import get_stream_manager
        self.stream_manager = get_stream_manager()
        
        # Order tracking for break-even monitoring
        self.break_even_orders: Dict[int, Any] = {}  # order_id -> order
        
    async def get_current_price_from_stream(self, symbol: str) -> Optional[float]:
        """
        Get current price from active chart stream via StreamManager.
        
        Args:
            symbol: The symbol to get price for (e.g., "NQ!", "MNQ!")
            
        Returns:
            Current price from stream or None if not available
        """
        try:
            return await self.stream_manager.get_latest_price(symbol)
        except Exception as e:
            logger.error(f"Error getting current price from stream for {symbol}: {e}")
            return None
    
    async def start_streaming_for_symbol(self, symbol: str, contract_id: str) -> bool:
        """
        Start chart streaming for a specific symbol.
        
        Args:
            symbol: The symbol to stream (e.g., "NQ!", "MNQ!")
            contract_id: The contract ID for mapping
            
        Returns:
            True if streaming started successfully, False otherwise
        """
        try:
            # Normalize symbol by removing exclamation marks and other special characters
            normalized_symbol = symbol.replace("!", "").replace(".", "").upper()
            logger.debug(f"Normalizing symbol: '{symbol}' -> '{normalized_symbol}'")
            
            # Check if already streaming this normalized symbol
            if normalized_symbol in self.active_streams:
                logger.debug(f"Already streaming {normalized_symbol}, reusing existing stream")
                # Still need to map the original symbol to the normalized one
                self.contract_to_symbol[contract_id] = normalized_symbol
                return True
            
            # Import chart streaming functionality
            from api.streaming.chart_stream import create_chart_stream_client
            
            # Create chart stream client for this normalized symbol
            logger.info(f"Starting chart stream for break-even monitoring: {symbol} (normalized: {normalized_symbol})")
            chart_client = await create_chart_stream_client([normalized_symbol])
            
            # Set up price update callback
            def on_price_update(symbol_data, price_data):
                """Callback for price updates from chart stream"""
                try:
                    if 'symbol' in price_data and 'lastPrice' in price_data:
                        stream_symbol = price_data['symbol']  # This will be product_id like "F.US.ENQ"
                        latest_price = float(price_data['lastPrice'])
                        
                        # Map product_id back to normalized symbol
                        # The stream_symbol will be product_id like "F.US.ENQ"
                        # We need to map it to our normalized symbol like "NQ"
                        if stream_symbol.endswith("ENQ"):
                            mapped_symbol = "NQ"
                        elif stream_symbol.endswith("MNQ"):
                            mapped_symbol = "MNQ"
                        elif stream_symbol.endswith("ES"):
                            mapped_symbol = "ES"
                        elif stream_symbol.endswith("YM"):
                            mapped_symbol = "YM"
                        else:
                            # Fallback to normalized symbol
                            mapped_symbol = normalized_symbol
                        
                        self.latest_prices[mapped_symbol] = latest_price
                        logger.debug(f"Price update for {mapped_symbol}: ${latest_price}")
                        
                except Exception as e:
                    logger.error(f"Error processing price update: {e}")
            
            # Override the quote processing to capture prices
            original_process_quote = chart_client._process_quote
            def enhanced_process_quote(quote_data):
                # Call original processing
                original_process_quote(quote_data)
                # Call our callback
                on_price_update(symbol, quote_data)
                
                # IMPORTANT: Map the product_id back to normalized symbol for break-even monitoring
                if 'symbol' in quote_data and 'lastPrice' in quote_data:
                    product_id = quote_data['symbol']  # e.g., "F.US.ENQ"
                    latest_price = float(quote_data['lastPrice'])
                    
                    # Map product_id to normalized symbol
                    if product_id.endswith("ENQ"):
                        mapped_symbol = "NQ"
                    elif product_id.endswith("MNQ"):
                        mapped_symbol = "MNQ"
                    elif product_id.endswith("ES"):
                        mapped_symbol = "ES"
                    elif product_id.endswith("YM"):
                        mapped_symbol = "YM"
                    else:
                        # Fallback to normalized symbol
                        mapped_symbol = normalized_symbol
                    
                    # Store price using the normalized symbol for break-even lookup
                    self.latest_prices[mapped_symbol] = latest_price
                    logger.debug(f"Mapped price update: {product_id} -> {mapped_symbol}: ${latest_price}")
            
            chart_client._process_quote = enhanced_process_quote
            
            # Start the stream
            chart_client.start()
            
            # Store the client and mapping using normalized symbol
            self.active_streams[normalized_symbol] = chart_client
            self.contract_to_symbol[contract_id] = normalized_symbol
            
            logger.info(f"Successfully started chart streaming for {symbol} (normalized: {normalized_symbol})")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start chart streaming for {symbol} (normalized: {normalized_symbol}): {e}")
            return False
    
    async def stop_streaming_for_symbol(self, symbol: str) -> bool:
        """
        Stop chart streaming for a specific symbol.
        
        Args:
            symbol: The symbol to stop streaming
            
        Returns:
            True if streaming stopped successfully, False otherwise
        """
        try:
            if symbol not in self.active_streams:
                logger.debug(f"No active stream found for {symbol}")
                return True
            
            # Stop the stream
            chart_client = self.active_streams[symbol]
            chart_client.stop()
            
            # Clean up
            del self.active_streams[symbol]
            if symbol in self.latest_prices:
                del self.latest_prices[symbol]
            
            # Clean up contract mapping
            contract_ids_to_remove = []
            for contract_id, mapped_symbol in self.contract_to_symbol.items():
                if mapped_symbol == symbol:
                    contract_ids_to_remove.append(contract_id)
            
            for contract_id in contract_ids_to_remove:
                del self.contract_to_symbol[contract_id]
            
            logger.info(f"Successfully stopped chart streaming for {symbol}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to stop chart streaming for {symbol}: {e}")
            return False
    
    async def add_break_even_order(self, order) -> bool:
        """
        Add an order to break-even monitoring and start streaming if needed.
        
        Args:
            order: StopLossOrder object with break-even enabled
            
        Returns:
            True if successfully added to monitoring, False otherwise
        """
        try:
            # Validate order has break-even enabled
            if not getattr(order, 'enable_break_even_stop', False):
                logger.debug(f"Order {order.order_id} does not have break-even enabled")
                return False
            
            # Extract symbol from contract_id or use provided symbol
            symbol = getattr(order, 'symbol', None)
            contract_id = getattr(order, 'contract_id', None)
            
            if not symbol or not contract_id:
                logger.error(f"Order {order.order_id} missing symbol or contract_id")
                return False
            
            # Normalize symbol for consistent tracking
            normalized_symbol = symbol.replace("!", "").replace(".", "").upper()
            logger.debug(f"Adding break-even order: '{symbol}' -> '{normalized_symbol}'")
            
            # Add to symbol tracking using normalized symbol
            if normalized_symbol not in self.symbol_orders:
                self.symbol_orders[normalized_symbol] = set()
            
            self.symbol_orders[normalized_symbol].add(order.order_id)
            
            # Start streaming for this symbol if not already active
            if normalized_symbol not in self.active_streams:
                success = await self.start_streaming_for_symbol(symbol, contract_id)
                if not success:
                    logger.error(f"Failed to start streaming for {symbol}, removing from tracking")
                    self.symbol_orders[normalized_symbol].discard(order.order_id)
                    if not self.symbol_orders[normalized_symbol]:
                        del self.symbol_orders[normalized_symbol]
                    return False
            
            logger.info(f"Added order {order.order_id} to break-even monitoring for {symbol} (normalized: {normalized_symbol})")
            return True
            
        except Exception as e:
            logger.error(f"Error adding order {order.order_id} to break-even monitoring: {e}")
            return False
    
    async def remove_break_even_order(self, order_id: int, symbol: str) -> bool:
        """
        Remove an order from break-even monitoring and stop streaming if no more orders.
        
        Args:
            order_id: The order ID to remove
            symbol: The symbol for this order (can be original like "NQ!" or normalized like "NQ")
            
        Returns:
            True if successfully removed, False otherwise
        """
        try:
            # Normalize symbol for consistent tracking
            normalized_symbol = symbol.replace("!", "").replace(".", "").upper()
            logger.debug(f"Removing break-even order: '{symbol}' -> '{normalized_symbol}'")
            
            # Remove from symbol tracking using normalized symbol
            if normalized_symbol in self.symbol_orders:
                self.symbol_orders[normalized_symbol].discard(order_id)
                
                # If no more orders for this symbol, stop streaming
                if not self.symbol_orders[normalized_symbol]:
                    del self.symbol_orders[normalized_symbol]
                    await self.stop_streaming_for_symbol(normalized_symbol)
                    logger.info(f"Stopped streaming for {symbol} (normalized: {normalized_symbol}) - no more break-even orders")
            
            logger.info(f"Removed order {order_id} from break-even monitoring for {symbol} (normalized: {normalized_symbol})")
            return True
            
        except Exception as e:
            logger.error(f"Error removing order {order_id} from break-even monitoring: {e}")
            return False
    
    def calculate_profit(self, current_price: float, entry_price: float, is_long: bool) -> float:
        """
        Calculate profit based on position direction.
        
        Args:
            current_price: Current market price
            entry_price: Entry price of the position
            is_long: True for long positions, False for short
            
        Returns:
            Profit in points (positive = profit, negative = loss)
        """
        if is_long:
            return current_price - entry_price
        else:
            return entry_price - current_price
    
    def determine_position_direction(self, order_type: str, stop_price: float, entry_price: float) -> bool:
        """
        Determine if position is long or short based on stop loss placement.
        
        Args:
            order_type: Type of order ("STOP_LOSS" or "TRAILING_STOP")
            stop_price: Current stop price
            entry_price: Entry price
            
        Returns:
            True if long position, False if short position
        """
        # For long positions, stop loss is below entry price
        # For short positions, stop loss is above entry price
        return stop_price < entry_price
    
    async def check_break_even_trigger(self, order) -> bool:
        """
        Check if break-even should be triggered for a specific order.
        
        Args:
            order: StopLossOrder object
            
        Returns:
            True if break-even was triggered, False otherwise
        """
        try:
            # Validate order has break-even enabled and not yet activated
            if (not getattr(order, 'enable_break_even_stop', False) or
                getattr(order, 'break_even_activated', False) or
                not hasattr(order, 'entry_price') or
                not hasattr(order, 'break_even_activation_offset')):
                return False
            
            # Get current price from stream
            current_price = await self.get_current_price_from_stream(order.contract_id)
            if current_price is None:
                logger.debug(f"Could not get current price for order {order.order_id}")
                return False
            
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
                
                # Modify stop loss to break-even (entry price)
                success = await self.modify_stop_to_break_even(order)
                
                if success:
                    # Update order tracking
                    await self.update_break_even_activation(order)
                    
                    # IMPORTANT: Remove from monitoring and stop streaming if no more orders
                    symbol = getattr(order, 'symbol', None)
                    if symbol:
                        await self.remove_break_even_order(order.order_id, symbol)
                        logger.info(f"Break-even completed for order {order.order_id}, removed from monitoring")
                    
                    return True
                    
        except Exception as e:
            logger.error(f"Error checking break-even trigger for order {order.order_id}: {e}")
            
        return False
    
    async def modify_stop_to_break_even(self, order) -> bool:
        """
        Modify stop loss order to break-even price.
        
        Args:
            order: StopLossOrder object
            
        Returns:
            True if modification successful, False otherwise
        """
        try:
            # Use entry price as new stop price (break-even)
            new_stop_price = order.entry_price
            
            logger.info(f"Modifying order {order.order_id} stop from {order.stop_price} to {new_stop_price} (break-even)")
            
            # Call the modify order API
            response = await self.order_manager.modify_order(
                account_id=order.account_id,
                order_id=order.order_id,
                stop_price=new_stop_price
            )
            
            if response.success:
                logger.info(f"Successfully modified order {order.order_id} to break-even")
                return True
            else:
                logger.error(f"Failed to modify order {order.order_id}: {response.errorMessage}")
                return False
                
        except Exception as e:
            logger.error(f"Error modifying order {order.order_id} to break-even: {e}")
            return False
    
    async def update_break_even_activation(self, order):
        """
        Update order tracking to reflect break-even activation.
        
        Args:
            order: StopLossOrder object
        """
        try:
            # Store original stop price if not already stored
            if not getattr(order, 'original_stop_price', None):
                order.original_stop_price = order.stop_price
            
            # Update order with break-even activation
            new_stop_price = order.entry_price
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
    
    async def monitor_break_even_orders(self):
        """
        Main monitoring loop for break-even orders with Chart Streaming.
        """
        logger.info("Starting break-even monitoring service with Chart Streaming")
        
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
                
                # Ensure streaming is active for all eligible orders
                for order in eligible_orders:
                    symbol = getattr(order, 'symbol', None)
                    if symbol:
                        # Normalize symbol for checking
                        normalized_symbol = symbol.replace("!", "").replace(".", "").upper()
                        if normalized_symbol not in self.active_streams:
                            logger.info(f"Starting streaming for newly detected break-even order: {order.order_id}")
                            await self.add_break_even_order(order)
                
                if eligible_orders:
                    logger.debug(f"Monitoring {len(eligible_orders)} orders with {len(self.active_streams)} active streams")
                    
                    # Check each eligible order (prices updated via streaming callbacks)
                    for order in eligible_orders:
                        try:
                            triggered = await self.check_break_even_trigger(order)
                            if triggered:
                                logger.info(f"Break-even triggered for order {order.order_id}")
                        except Exception as e:
                            logger.error(f"Error checking order {order.order_id}: {e}")
                            continue
                            
                    logger.debug(f"Completed break-even check cycle")
                else:
                    # No eligible orders - clean up any leftover streams
                    if self.active_streams:
                        logger.info("No break-even orders found, cleaning up streams")
                        for symbol in list(self.active_streams.keys()):
                            await self.stop_streaming_for_symbol(symbol)
                
                # Wait before next check (faster with streaming)
                await asyncio.sleep(self.monitoring_interval)
                
            except Exception as e:
                logger.error(f"Error in break-even monitoring loop: {e}")
                await asyncio.sleep(self.monitoring_interval)
                
        # Clean up all streams when monitoring stops
        logger.info("Stopping break-even monitoring service and cleaning up streams")
        for symbol in list(self.active_streams.keys()):
            await self.stop_streaming_for_symbol(symbol)
    
    def start_monitoring(self):
        """Start the break-even monitoring service."""
        if not self.monitoring_active:
            self.monitoring_active = True
            # Start monitoring in background
            asyncio.create_task(self.monitor_break_even_orders())
            logger.info("Break-even monitoring service started")
    
    def stop_monitoring(self):
        """Stop the break-even monitoring service."""
        self.monitoring_active = False
        logger.info("Break-even monitoring service stopped")
    
    def get_monitoring_status(self) -> Dict[str, Any]:
        """
        Get current monitoring status including streaming information.
        
        Returns:
            Dictionary with monitoring status information
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
        
        # Get streaming statistics
        streaming_symbols = list(self.active_streams.keys())
        total_orders_per_symbol = {symbol: len(orders) for symbol, orders in self.symbol_orders.items()}
        
        return {
            "monitoring_active": self.monitoring_active,
            "monitoring_interval": self.monitoring_interval,
            "eligible_orders": eligible_count,
            "activated_orders": activated_count,
            "total_tracked_orders": len(self.stop_loss_tracker.orders),
            "streaming_enabled": True,
            "active_streams": len(self.active_streams),
            "streaming_symbols": streaming_symbols,
            "orders_per_symbol": total_orders_per_symbol,
            "latest_prices": dict(self.latest_prices)
        } 