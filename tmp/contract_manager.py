import asyncio
import json
import re
import os
from typing import Dict, List, Optional, Union, Any
from pydantic import BaseModel, Field
import httpx

# Import the token manager
from .token_manager import TokenManager

# Import the config module
from config.config import get_user_provider_config

# Define models for the API responses and requests
class Contract(BaseModel):
    id: str
    name: str
    description: str
    tickSize: float
    tickValue: float
    activeContract: bool

class ContractSearchRequest(BaseModel):
    searchText: str = ""
    live: bool = True  # Default to searching for live contracts

class ContractSearchResponse(BaseModel):
    contracts: List[Contract]
    success: bool
    errorCode: int
    errorMessage: Optional[str] = None

class ContractManager:
    """
    Manager class for handling contract operations across different providers.
    """
    
    def __init__(
        self,
        token_manager: TokenManager
    ):
        """
        Initialize the contract manager.
        
        Args:
            token_manager: An instance of TokenManager for authentication
        """
        self.token_manager = token_manager
        self.provider = token_manager.provider
        
    async def resolve_instrument(self, ticker: str) -> str:
        """
        Normalize ticker strings by removing extraneous characters and 
        ensure the result is prefixed with a slash.
        
        Examples:
          - "NQ.1!" becomes "/NQ"
          - "!MES1!" becomes "/MES"
        """
        print(f"[DEBUG] Original ticker: {ticker}")
        ticker = ticker.strip("!")
        ticker = re.sub(r'\.\d+!?', '', ticker)
        ticker = re.sub(r'\d+!?$', '', ticker)
        result = ticker.upper()
        if not result.startswith("/"):
            result = "/" + result
        print(f"[DEBUG] Resolved instrument: {result}")
        return result
        
    async def search_contracts(
        self, 
        search_text: str = "", 
        live: bool = True
    ) -> ContractSearchResponse:
        """
        Search for contracts.
        
        Args:
            search_text: Text to search for in contracts
            live: Whether to search for live contracts only
            
        Returns:
            ContractSearchResponse containing contract information
        """
        endpoint = "/Contract/search"
        payload = ContractSearchRequest(searchText=search_text, live=live).dict()
        
        response = await self.token_manager.perform_authenticated_request(
            "POST",
            endpoint,
            json=payload
        )
        
        # Check if request was successful
        if response.status_code != 200:
            raise Exception(f"Failed to search contracts ({self.provider}): {response.text}")
        
        # Parse the response
        data = response.json()
        return ContractSearchResponse(**data)
    
    async def get_first_contract_id(
        self, 
        search_text: str, 
        live: bool = False
    ) -> Optional[str]:
        """
        Get the ID of the first contract matching the search text.
        First checks locally using tradableContracts.json, then falls back to API search.
        
        Args:
            search_text: Text to search for in contracts
            live: Whether to search for live contracts only
            
        Returns:
            The ID of the first matching contract, or None if no contracts found
        """

        # Normalize the ticker
        normalized_name = await self.resolve_instrument(search_text)
        
        # Extract the base symbol for better search results
        # Example: "NQM5" -> "NQ"
        srch_text = ''.join([c for c in normalized_name if c.isalpha()])

        # First, try to find the contract locally using get_contract_id_by_name
        print(f"Checking local cache for contract: '{srch_text}'")
        local_contract_id = await self.get_contract_id_by_name(srch_text)
        if local_contract_id:
            print(f"Found contract locally: {local_contract_id}")
            return local_contract_id
        
        print(f"Contract not found locally, searching via API...")

        response = await self.search_contracts(srch_text, live)
        
        if not response.contracts:
            print(f"No contracts found matching '{search_text}' (provider: '{self.provider}')")
            return None
            
        # Return the ID of the first contract
        first_contract = response.contracts[0]
        print(f"Found first contract matching '{search_text}': {first_contract.name} - {first_contract.description}")
        return first_contract.id
    
    async def get_contract_by_id(self, contract_id: str) -> Optional[Contract]:
        """
        Get a contract by its ID.
        
        Args:
            contract_id: The ID of the contract to retrieve
            
        Returns:
            The contract if found, otherwise None
        """
        # Extract search terms from the contract ID to improve search results
        # Example: "CON.F.US.ENQ.M25" -> "ENQ"
        parts = contract_id.split('.')
        search_text = parts[3] if len(parts) > 3 else contract_id
        
        response = await self.search_contracts(search_text, live=False)
        
        # Look for the contract with the matching ID
        for contract in response.contracts:
            if contract.id == contract_id:
                return contract
                
        # Contract not found
        print(f"No contract found with ID '{contract_id}' (provider: '{self.provider}')")
        return None
    
    async def get_contract_by_name(self, name: str) -> Optional[Contract]:
        """
        Get a contract by its name.
        
        Args:
            name: The name of the contract to retrieve (e.g., "NQM5")
            
        Returns:
            The contract if found, otherwise None
        """
        # Normalize the ticker
        normalized_name = await self.resolve_instrument(name)
        
        # Extract the base symbol for better search results
        # Example: "NQM5" -> "NQ"
        search_text = ''.join([c for c in normalized_name if c.isalpha()])
        
        response = await self.search_contracts(search_text, live=False)
        
        # Look for the contract with the matching name
        for contract in response.contracts:
            if contract.name.upper() == name.upper():
                return contract
                
        # Contract not found
        print(f"No contract found with name '{name}' (provider: '{self.provider}')")
        return None
    
    async def get_active_contracts(self) -> List[Contract]:
        """
        Get all active contracts.
        
        Returns:
            List of active contracts
        """
        response = await self.search_contracts(live=True)
        return response.contracts
    
    async def get_all_contracts_by_symbol(
        self, 
        symbol: str, 
        live: Optional[bool] = None
    ) -> List[Contract]:
        """
        Get all contracts for a specific symbol.
        
        Args:
            symbol: The symbol to search for (e.g., "NQ", "ES", "GC")
            live: Whether to filter for live contracts only
            
        Returns:
            List of contracts matching the symbol
        """
        response = await self.search_contracts(symbol, live)
        return response.contracts
    
    async def get_tick_value(self, contract_id: str) -> Optional[float]:
        """
        Get the tick value for a contract.
        
        Args:
            contract_id: The ID of the contract
            
        Returns:
            The tick value if found, otherwise None
        """
        contract = await self.get_contract_by_id(contract_id)
        return contract.tickValue if contract else None
    
    async def get_tick_size(self, contract_id: str) -> Optional[float]:
        """
        Get the tick size for a contract.
        
        Args:
            contract_id: The ID of the contract
            
        Returns:
            The tick size if found, otherwise None
        """
        contract = await self.get_contract_by_id(contract_id)
        return contract.tickSize if contract else None
    
    async def align_price_to_tick_size(self, contract_id: str, price: float) -> Optional[float]:
        """
        Align a price to the contract's tick size.
        
        Args:
            contract_id: The ID of the contract
            price: The price to align
            
        Returns:
            The aligned price if the contract is found, otherwise None
        """
        contract = await self.get_contract_by_id(contract_id)
        if not contract or contract.tickSize <= 0:
            return None
        
        # Round to nearest tick
        aligned_price = round(price / contract.tickSize) * contract.tickSize
        
        # Handle floating point precision issues
        decimal_places = contract.decimalPlaces if hasattr(contract, 'decimalPlaces') else 2
        return round(aligned_price, decimal_places)
    
    async def calculate_price_to_ticks(
        self, 
        contract_id: str, 
        price_difference: float
    ) -> Optional[float]:
        """
        Calculate how many ticks a price difference represents.
        
        Args:
            contract_id: The ID of the contract
            price_difference: The price difference to convert to ticks
            
        Returns:
            The number of ticks if the contract is found, otherwise None
        """
        contract = await self.get_contract_by_id(contract_id)
        if not contract:
            return None
            
        if contract.tickSize == 0:
            print(f"Warning: Contract {contract_id} has a tick size of 0")
            return None
            
        return price_difference / contract.tickSize
    
    async def calculate_ticks_to_price(
        self, 
        contract_id: str, 
        ticks: float
    ) -> Optional[float]:
        """
        Calculate the price difference represented by a number of ticks.
        
        Args:
            contract_id: The ID of the contract
            ticks: The number of ticks to convert to price
            
        Returns:
            The price difference if the contract is found, otherwise None
        """
        contract = await self.get_contract_by_id(contract_id)
        if not contract:
            return None
            
        return ticks * contract.tickSize
    
    async def calculate_pl_from_ticks(
        self, 
        contract_id: str, 
        ticks: float, 
        quantity: int = 1
    ) -> Optional[float]:
        """
        Calculate profit/loss from a number of ticks.
        
        Args:
            contract_id: The ID of the contract
            ticks: The number of ticks
            quantity: The quantity of contracts
            
        Returns:
            The profit/loss if the contract is found, otherwise None
        """
        contract = await self.get_contract_by_id(contract_id)
        if not contract:
            return None
            
        return ticks * contract.tickValue * quantity
    
    def format_contract_list(self, contracts: List[Contract]) -> str:
        """
        Format a list of contracts as a readable string.
        
        Args:
            contracts: List of contracts to format
            
        Returns:
            Formatted string representation of the contracts
        """
        if not contracts:
            return f"No contracts found for provider '{self.provider}'."
            
        # Create a formatted string
        result = f"Contracts for provider '{self.provider}':\n"
        for i, contract in enumerate(contracts, 1):
            result += (
                f"{i}. ID: {contract.id}, Name: {contract.name}, "
                f"Description: {contract.description}, "
                f"Tick Size: {contract.tickSize}, Tick Value: ${contract.tickValue}, "
                f"Active: {'Yes' if contract.activeContract else 'No'}\n"
            )
            
        return result

    async def get_contract_id_by_name(self, contract_name: str) -> Optional[str]:
        """
        Get the contract ID for a given contract name from tradableContracts.json.
        If the file is not present, fetch contracts from the API and populate the file.
        This method is designed to never throw errors - it will return None if anything goes wrong.

        Args:
            contract_name: The name of the contract to search for (e.g., NQ, !NQ.1, NQM25, etc.)

        Returns:
            The contract ID if found, otherwise None
        """
        try:
            file_path = "tradableContracts.json"
            print(f"[DEBUG] Checking for file: {file_path}")
            print(f"[DEBUG] Current working directory: {os.getcwd()}")

            # Check if the file exists
            if not os.path.exists(file_path):
                print(f"[DEBUG] File {file_path} not found, attempting to fetch from API")
                try:
                    # Get the token
                    token = await self.token_manager.get_token()
                    print(f"[DEBUG] Got token: {token[:10]}...")
                    
                    # Create headers with the authorization token
                    headers = {
                        "accept": "application/json",
                        "authorization": f"Bearer {token}"
                    }
                    
                    # Make the request directly to the TopstepX API
                    print("[DEBUG] Making request to TopstepX API...")
                    async with httpx.AsyncClient() as client:
                        # Get provider configuration and use userapi_endpoint
                        provider_config = get_user_provider_config()
                        response = await client.get(
                            f"{provider_config['userapi_endpoint']}/UserContract/active/nonprofesional",
                            headers=headers
                        )
                        
                        print(f"[DEBUG] API Response status: {response.status_code}")
                        print(f"[DEBUG] API Response headers: {response.headers}")
                        
                        if response.status_code != 200:
                            print(f"[DEBUG] Failed to fetch contracts: {response.text}")
                            return None
                            
                        contracts = response.json()
                        print(f"[DEBUG] Successfully parsed {len(contracts)} contracts from API")
                        
                        # Store the contracts in a JSON file
                        print(f"[DEBUG] Writing contracts to {file_path}")
                        try:
                            with open(file_path, "w") as f:
                                json.dump(contracts, f, indent=2)
                            print(f"[DEBUG] Successfully wrote contracts to {file_path}")
                            
                            # Verify file was created and is readable
                            if os.path.exists(file_path):
                                print(f"[DEBUG] File exists after writing, size: {os.path.getsize(file_path)} bytes")
                                try:
                                    with open(file_path, "r") as f:
                                        test_read = json.load(f)
                                    print(f"[DEBUG] Successfully verified file contents, contains {len(test_read)} contracts")
                                except Exception as e:
                                    print(f"[DEBUG] Error verifying file contents: {str(e)}")
                            else:
                                print(f"[DEBUG] File does not exist after writing!")
                        except Exception as e:
                            print(f"[DEBUG] Error writing file: {str(e)}")
                            print(f"[DEBUG] Error type: {type(e)}")
                            import traceback
                            print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
                            return None
                except Exception as e:
                    print(f"[DEBUG] Error fetching contracts from API: {str(e)}")
                    print(f"[DEBUG] Error type: {type(e)}")
                    import traceback
                    print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
                    return None
            else:
                print(f"[DEBUG] Found existing file: {file_path}")
                try:
                    # Load contracts from the file
                    with open(file_path, "r") as f:
                        contracts = json.load(f)
                    print(f"[DEBUG] Successfully loaded {len(contracts)} contracts from file")
                except Exception as e:
                    print(f"[DEBUG] Error reading contracts file: {str(e)}")
                    print(f"[DEBUG] Error type: {type(e)}")
                    import traceback
                    print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
                    return None

            # Normalize the input contract name
            # Remove leading ! and trailing numbers/dots (e.g., !NQ.1 -> NQ, NQM25 -> NQ)
            normalized_input = contract_name.lstrip("!")
            
            # Extract base symbol by removing trailing numbers and dots
            base_symbol = re.sub(r'[\.\d]+$', '', normalized_input).upper()
            
            print(f"[DEBUG] Searching for contract: '{contract_name}' -> normalized: '{normalized_input}' -> base: '{base_symbol}'")

            # Search strategies in order of preference:
            # 1. Exact match on contractName
            for contract in contracts:
                if contract_name.upper() == contract["contractName"].upper():
                    print(f"[DEBUG] Found exact match: {contract['contractName']} -> {contract['contractId']}")
                    return contract["contractId"]
            
            # 2. Exact match on productName (e.g., /NQ)
            for contract in contracts:
                product_name = contract["productName"].lstrip("/").upper()
                if normalized_input.upper() == product_name:
                    print(f"[DEBUG] Found product name match: {contract['productName']} -> {contract['contractId']}")
                    return contract["contractId"]
            
            # 3. Base symbol match on productName (e.g., NQ matches /NQ)
            for contract in contracts:
                product_name = contract["productName"].lstrip("/").upper()
                if base_symbol == product_name:
                    print(f"[DEBUG] Found base symbol match: {contract['productName']} -> {contract['contractId']}")
                    return contract["contractId"]
            
            # 4. Partial match on contractName (contains the base symbol)
            for contract in contracts:
                if base_symbol in contract["contractName"].upper():
                    print(f"[DEBUG] Found partial match: {contract['contractName']} -> {contract['contractId']}")
                    return contract["contractId"]

            # Contract not found
            print(f"[DEBUG] No contract found for '{contract_name}' (normalized: '{normalized_input}', base: '{base_symbol}')")
            return None

        except Exception as e:
            print(f"[DEBUG] Unexpected error in get_contract_id_by_name: {str(e)}")
            print(f"[DEBUG] Error type: {type(e)}")
            import traceback
            print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
            return None

    async def get_product_id_by_name(self, contract_name: str) -> Optional[str]:
        """
        Get the product ID for a given contract name from tradableContracts.json.
        If the file is not present, fetch contracts from the API and populate the file.
        This method is designed to never throw errors - it will return None if anything goes wrong.

        Args:
            contract_name: The name of the contract to search for (e.g., NQ, !NQ.1, NQM25, etc.)

        Returns:
            The product ID if found, otherwise None
        """
        try:
            file_path = "tradableContracts.json"
            print(f"[DEBUG] Checking for file: {file_path}")
            print(f"[DEBUG] Current working directory: {os.getcwd()}")

            # Check if the file exists
            if not os.path.exists(file_path):
                print(f"[DEBUG] File not found: {file_path}")
                print(f"[DEBUG] Fetching contracts from API and populating file...")
                
                try:
                    # Fetch contracts from the API
                    contracts = await self.get_live_contracts()
                    
                    if not contracts:
                        print(f"[DEBUG] No contracts returned from API")
                        return None
                    
                    print(f"[DEBUG] Fetched {len(contracts)} contracts from API")
                    
                    # Convert to JSON format
                    contracts_data = []
                    for contract in contracts:
                        contracts_data.append({
                            "productId": contract.product_id,
                            "productName": contract.product_name,
                            "contractId": contract.id,
                            "contractName": contract.name,
                            "tickValue": contract.tick_value,
                            "tickSize": contract.tick_size,
                            "pointValue": contract.point_value,
                            "exchangeFee": contract.exchange_fee,
                            "regulatoryFee": contract.regulatory_fee,
                            "commissionFee": contract.commission_fee,
                            "totalFees": contract.total_fees,
                            "description": contract.description,
                            "disabled": contract.disabled,
                            "decimalPlaces": contract.decimal_places,
                            "priceScale": contract.price_scale,
                            "minMove": contract.min_move,
                            "fractionalPrice": contract.fractional_price,
                            "exchange": contract.exchange,
                            "minMove2": contract.min_move2,
                            "isProfessional": contract.is_professional,
                        })
                    
                    # Save to file
                    with open(file_path, "w") as f:
                        json.dump(contracts_data, f, indent=2)
                    
                    print(f"[DEBUG] Successfully saved {len(contracts_data)} contracts to {file_path}")
                    contracts = contracts_data
                    
                except Exception as e:
                    print(f"[DEBUG] Error fetching contracts from API: {str(e)}")
                    print(f"[DEBUG] Error type: {type(e)}")
                    import traceback
                    print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
                    return None

            else:
                print(f"[DEBUG] Found existing file: {file_path}")
                try:
                    # Load contracts from the file
                    with open(file_path, "r") as f:
                        contracts = json.load(f)
                    print(f"[DEBUG] Successfully loaded {len(contracts)} contracts from file")
                except Exception as e:
                    print(f"[DEBUG] Error reading contracts file: {str(e)}")
                    print(f"[DEBUG] Error type: {type(e)}")
                    import traceback
                    print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
                    return None

            # Normalize the input contract name
            # Remove leading ! and trailing numbers/dots (e.g., !NQ.1 -> NQ, NQM25 -> NQ)
            normalized_input = contract_name.lstrip("!")
            
            # Extract base symbol by removing trailing numbers and dots
            base_symbol = re.sub(r'[\.\d]+$', '', normalized_input).upper()
            
            print(f"[DEBUG] Searching for product ID: '{contract_name}' -> normalized: '{normalized_input}' -> base: '{base_symbol}'")

            # Search strategies in order of preference:
            # 1. Exact match on contractName
            for contract in contracts:
                if contract_name.upper() == contract["contractName"].upper():
                    print(f"[DEBUG] Found exact match: {contract['contractName']} -> {contract['productId']}")
                    return contract["productId"]
            
            # 2. Exact match on productName (e.g., /NQ)
            for contract in contracts:
                product_name = contract["productName"].lstrip("/").upper()
                if normalized_input.upper() == product_name:
                    print(f"[DEBUG] Found product name match: {contract['productName']} -> {contract['productId']}")
                    return contract["productId"]
            
            # 3. Base symbol match on productName (e.g., NQ matches /NQ)
            for contract in contracts:
                product_name = contract["productName"].lstrip("/").upper()
                if base_symbol == product_name:
                    print(f"[DEBUG] Found base symbol match: {contract['productName']} -> {contract['productId']}")
                    return contract["productId"]
            
            # 4. Partial match on contractName (contains the base symbol)
            for contract in contracts:
                if base_symbol in contract["contractName"].upper():
                    print(f"[DEBUG] Found partial match: {contract['contractName']} -> {contract['productId']}")
                    return contract["productId"]

            # Contract not found
            print(f"[DEBUG] No contract found for '{contract_name}' (normalized: '{normalized_input}', base: '{base_symbol}')")
            return None

        except Exception as e:
            print(f"[DEBUG] Unexpected error in get_product_id_by_name: {str(e)}")
            print(f"[DEBUG] Error type: {type(e)}")
            import traceback
            print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
            return None

    async def get_product_name_by_contract_id(self, contract_id: str) -> Optional[str]:
        """
        Get the product name for a given contract ID from tradableContracts.json.
        If the file is not present, fetch contracts from the API and populate the file.
        This method is designed to never throw errors - it will return None if anything goes wrong.

        Args:
            contract_id: The contract ID to search for (e.g., "CON.F.US.ENQ.U25")

        Returns:
            The product name if found (e.g., "/MNQ"), otherwise None
        """
        try:
            file_path = "tradableContracts.json"
            print(f"[DEBUG] Checking for file: {file_path}")
            print(f"[DEBUG] Current working directory: {os.getcwd()}")

            # Check if the file exists
            if not os.path.exists(file_path):
                print(f"[DEBUG] File not found: {file_path}")
                print(f"[DEBUG] Fetching contracts from API and populating file...")
                
                try:
                    # Fetch contracts from the API
                    contracts = await self.get_live_contracts()
                    
                    if not contracts:
                        print(f"[DEBUG] No contracts returned from API")
                        return None
                    
                    print(f"[DEBUG] Fetched {len(contracts)} contracts from API")
                    
                    # Convert to JSON format
                    contracts_data = []
                    for contract in contracts:
                        contracts_data.append({
                            "productId": contract.product_id,
                            "productName": contract.product_name,
                            "contractId": contract.id,
                            "contractName": contract.name,
                            "tickValue": contract.tick_value,
                            "tickSize": contract.tick_size,
                            "pointValue": contract.point_value,
                            "exchangeFee": contract.exchange_fee,
                            "regulatoryFee": contract.regulatory_fee,
                            "commissionFee": contract.commission_fee,
                            "totalFees": contract.total_fees,
                            "description": contract.description,
                            "disabled": contract.disabled,
                            "decimalPlaces": contract.decimal_places,
                            "priceScale": contract.price_scale,
                            "minMove": contract.min_move,
                            "fractionalPrice": contract.fractional_price,
                            "exchange": contract.exchange,
                            "minMove2": contract.min_move2,
                            "isProfessional": contract.is_professional,
                        })
                    
                    # Save to file
                    with open(file_path, "w") as f:
                        json.dump(contracts_data, f, indent=2)
                    
                    print(f"[DEBUG] Successfully saved {len(contracts_data)} contracts to {file_path}")
                    contracts = contracts_data
                    
                except Exception as e:
                    print(f"[DEBUG] Error fetching contracts from API: {str(e)}")
                    print(f"[DEBUG] Error type: {type(e)}")
                    import traceback
                    print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
                    return None

            else:
                print(f"[DEBUG] Found existing file: {file_path}")
                try:
                    # Load contracts from the file
                    with open(file_path, "r") as f:
                        contracts = json.load(f)
                    print(f"[DEBUG] Successfully loaded {len(contracts)} contracts from file")
                except Exception as e:
                    print(f"[DEBUG] Error reading contracts file: {str(e)}")
                    print(f"[DEBUG] Error type: {type(e)}")
                    import traceback
                    print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
                    return None

            # Normalize the input contract ID
            normalized_contract_id = contract_id.strip().upper()
            
            print(f"[DEBUG] Searching for product name by contract ID: '{contract_id}' -> normalized: '{normalized_contract_id}'")

            # Search for exact match on contractId
            for contract in contracts:
                if normalized_contract_id == contract["contractId"].upper():
                    product_name = contract["productName"]
                    print(f"[DEBUG] Found exact match: {contract['contractId']} -> {product_name}")
                    return product_name

            # Contract not found
            print(f"[DEBUG] No contract found for contract ID '{contract_id}' (normalized: '{normalized_contract_id}')")
            return None

        except Exception as e:
            print(f"[DEBUG] Unexpected error in get_product_name_by_contract_id: {str(e)}")
            print(f"[DEBUG] Error type: {type(e)}")
            import traceback
            print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
            return None

    async def get_contract_info_by_contract_id(self, contract_id: str) -> Optional[Dict[str, Any]]:
        """
        Get complete contract information for a given contract ID from tradableContracts.json.
        If the file is not present, fetch contracts from the API and populate the file.
        This method is designed to never throw errors - it will return None if anything goes wrong.

        Args:
            contract_id: The contract ID to search for (e.g., "CON.F.US.ENQ.U25")

        Returns:
            Complete contract information dict if found, otherwise None
        """
        try:
            file_path = "tradableContracts.json"
            print(f"[DEBUG] Checking for file: {file_path}")
            print(f"[DEBUG] Current working directory: {os.getcwd()}")

            # Check if the file exists
            if not os.path.exists(file_path):
                print(f"[DEBUG] File not found: {file_path}")
                print(f"[DEBUG] Fetching contracts from API and populating file...")
                
                try:
                    # Fetch contracts from the API
                    contracts = await self.get_live_contracts()
                    
                    if not contracts:
                        print(f"[DEBUG] No contracts returned from API")
                        return None
                    
                    print(f"[DEBUG] Fetched {len(contracts)} contracts from API")
                    
                    # Convert to JSON format
                    contracts_data = []
                    for contract in contracts:
                        contracts_data.append({
                            "productId": contract.product_id,
                            "productName": contract.product_name,
                            "contractId": contract.id,
                            "contractName": contract.name,
                            "tickValue": contract.tick_value,
                            "tickSize": contract.tick_size,
                            "pointValue": contract.point_value,
                            "exchangeFee": contract.exchange_fee,
                            "regulatoryFee": contract.regulatory_fee,
                            "commissionFee": contract.commission_fee,
                            "totalFees": contract.total_fees,
                            "description": contract.description,
                            "disabled": contract.disabled,
                            "decimalPlaces": contract.decimal_places,
                            "priceScale": contract.price_scale,
                            "minMove": contract.min_move,
                            "fractionalPrice": contract.fractional_price,
                            "exchange": contract.exchange,
                            "minMove2": contract.min_move2,
                            "isProfessional": contract.is_professional,
                        })
                    
                    # Save to file
                    with open(file_path, "w") as f:
                        json.dump(contracts_data, f, indent=2)
                    
                    print(f"[DEBUG] Successfully saved {len(contracts_data)} contracts to {file_path}")
                    contracts = contracts_data
                    
                except Exception as e:
                    print(f"[DEBUG] Error fetching contracts from API: {str(e)}")
                    print(f"[DEBUG] Error type: {type(e)}")
                    import traceback
                    print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
                    return None

            else:
                print(f"[DEBUG] Found existing file: {file_path}")
                try:
                    # Load contracts from the file
                    with open(file_path, "r") as f:
                        contracts = json.load(f)
                    print(f"[DEBUG] Successfully loaded {len(contracts)} contracts from file")
                except Exception as e:
                    print(f"[DEBUG] Error reading contracts file: {str(e)}")
                    print(f"[DEBUG] Error type: {type(e)}")
                    import traceback
                    print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
                    return None

            # Normalize the input contract ID
            normalized_contract_id = contract_id.strip().upper()
            
            print(f"[DEBUG] Searching for contract info by contract ID: '{contract_id}' -> normalized: '{normalized_contract_id}'")

            # Search for exact match on contractId
            for contract in contracts:
                if normalized_contract_id == contract["contractId"].upper():
                    print(f"[DEBUG] Found exact match: {contract['contractId']} -> {contract['productName']}")
                    return contract

            # Contract not found
            print(f"[DEBUG] No contract found for contract ID '{contract_id}' (normalized: '{normalized_contract_id}')")
            return None

        except Exception as e:
            print(f"[DEBUG] Unexpected error in get_contract_info_by_contract_id: {str(e)}")
            print(f"[DEBUG] Error type: {type(e)}")
            import traceback
            print(f"[DEBUG] Error traceback: {traceback.format_exc()}")
            return None

