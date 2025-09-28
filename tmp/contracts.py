"""
Contract-related API endpoints
"""
import os
import json
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
import httpx

from api.dependencies import get_token_manager
from src.managers.token_manager import TokenManager

router = APIRouter(
    prefix="/contracts",
    tags=["contracts"],
    responses={404: {"description": "Not found"}},
)

@router.get("/live", response_model=List[Dict[str, Any]])
async def get_live_contracts(token_manager: TokenManager = Depends(get_token_manager)) -> List[Dict[str, Any]]:
    """
    Fetch live contracts from provider's userapi with authentication.
    This always gets the latest contract information.
    Falls back to external API if provider API fails.
    
    Returns:
        List of live contracts from the provider or fallback API
    """
    try:
        # Get current token
        token = await token_manager.get_token()
        if not token:
            raise HTTPException(status_code=401, detail="No valid authentication token available")
        
        # Get provider config
        provider_config = token_manager.provider_config
        userapi_endpoint = provider_config["userapi_endpoint"]
        
        # Make authenticated request to provider's userapi
        headers = {
            "accept": "application/json",
            "authorization": f"Bearer {token}"
        }
        
        # Construct the contracts URL for this provider
        contracts_url = f"{userapi_endpoint}/UserContract/active/nonprofesional"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(contracts_url, headers=headers)
        
        if response.status_code == 401:
            raise HTTPException(status_code=401, detail="Authentication failed - token may be expired")
        elif response.status_code != 200:
            print(f"⚠️ {token_manager.provider} userapi returned HTTP {response.status_code}, trying fallback...")
            raise Exception(f"{token_manager.provider} API failed with status {response.status_code}")
        
        contracts = response.json()
        print(f"Successfully fetched {len(contracts)} live contracts from {token_manager.provider} userapi")
        
        return contracts
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Provider API failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch contracts from provider API: {str(e)}"
        )

@router.get("/tradable", response_model=List[Dict[str, Any]])
async def get_tradable_contracts(token_manager: TokenManager = Depends(get_token_manager)) -> List[Dict[str, Any]]:
    """
    Fetch tradable contracts and store them in a JSON file.
    Uses authenticated provider userapi for latest information.
    
    Returns:
        List of tradable contracts
    """
    try:
        # Get the base directory
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        # Define all three file paths
        file_paths = [
            os.path.join(base_dir, "tradableContracts.json"),  # root
            os.path.join(base_dir, "config", "tradableContracts.json"),  # config folder
            os.path.join(base_dir, "api", "tradableContracts.json")  # api folder
        ]

        # Delete all old files if they exist
        for file_path in file_paths:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"Deleted existing file: {file_path}")

        # Get contracts from authenticated provider API
        contracts = await get_live_contracts(token_manager)

        # Save to all three locations
        for file_path in file_paths:
            with open(file_path, "w") as f:
                json.dump(contracts, f, indent=2)
            print(f"Created: {file_path}")

        print(f"Successfully saved {len(contracts)} contracts from {token_manager.provider} to all locations")

        return contracts
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving tradable contracts: {str(e)}") 