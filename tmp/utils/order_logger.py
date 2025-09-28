import json
import asyncio
from datetime import datetime
from typing import Dict, Any, List
import aiofiles
import os
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class OrderLogger:
    def __init__(self, file_path: str = "order_details.json"):
        self.file_path = file_path
        self._lock = asyncio.Lock()  # Lock for thread-safe file operations
        logger.debug(f"OrderLogger initialized with file path: {file_path}")
        
    async def _ensure_file_exists(self):
        """Ensure the order details file exists with proper structure."""
        logger.debug(f"Checking if file exists: {self.file_path}")
        if not os.path.exists(self.file_path):
            logger.debug(f"File does not exist, creating: {self.file_path}")
            async with aiofiles.open(self.file_path, 'w') as f:
                await f.write('[]')
                logger.debug("File created with empty array")
                
    async def _read_orders(self) -> List[Dict[str, Any]]:
        """Read all orders from the file."""
        logger.debug("Reading orders from file")
        async with self._lock:
            await self._ensure_file_exists()
            async with aiofiles.open(self.file_path, 'r') as f:
                content = await f.read()
                logger.debug(f"Read content: {content}")
                return json.loads(content) if content else []
                
    async def _write_orders(self, orders: List[Dict[str, Any]]):
        """Write all orders to the file."""
        logger.debug(f"Writing {len(orders)} orders to file")
        async with self._lock:
            async with aiofiles.open(self.file_path, 'w') as f:
                content = json.dumps(orders, indent=2)
                await f.write(content)
                logger.debug(f"Wrote content: {content}")
                
    async def log_order(self, order_data: Dict[str, Any]):
        """
        Log an order to the order details file.
        
        Args:
            order_data: Dictionary containing order details
        """
        logger.debug(f"Logging order: {order_data}")
        try:
            # Ensure timestamp is present
            if 'timestamp' not in order_data:
                order_data['timestamp'] = datetime.utcnow().isoformat() + 'Z'
                
            # Read existing orders
            orders = await self._read_orders()
            
            # Append new order
            orders.append(order_data)
            
            # Write back to file
            await self._write_orders(orders)
            logger.debug("Order successfully logged")
        except Exception as e:
            logger.error(f"Error logging order: {str(e)}", exc_info=True)
            raise
        
    async def get_orders(self) -> List[Dict[str, Any]]:
        """Get all orders from the file."""
        logger.debug("Getting all orders")
        return await self._read_orders()
        
    async def clear_orders(self):
        """Clear all orders from the file."""
        logger.debug("Clearing all orders")
        await self._write_orders([]) 