"""
Account Routes
"""
from typing import List, Optional, Annotated
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from api.dependencies import get_account_manager
from src.managers.account_manager import AccountManager, Account

router = APIRouter(prefix="/accounts", tags=["accounts"])

# Response models
class AccountResponse(BaseModel):
    id: int
    name: str
    balance: float
    canTrade: bool
    isVisible: bool
    
    class Config:
        from_attributes = True
        
class AccountListResponse(BaseModel):
    accounts: List[AccountResponse]
    total_count: int
    
class AccountNamesResponse(BaseModel):
    account_names: List[str]
    
class AccountBalanceResponse(BaseModel):
    total_balance: float
    
class AccountIdResponse(BaseModel):
    account_id: Optional[int] = None
    message: str

# Routes
@router.get("/", response_model=AccountListResponse)
async def get_all_accounts(
    account_manager: Annotated[AccountManager, Depends(get_account_manager)],
    only_active: bool = Query(True, description="Only return active accounts"),
    can_trade: Optional[bool] = Query(True, description="Filter by tradable status - default True to show only tradable accounts"),
    include_all: bool = Query(False, description="Include all accounts including non-tradable and excluded accounts")
):
    """Get all accounts with optional filtering"""
    try:
        response = await account_manager.search_accounts(only_active_accounts=only_active)
        accounts = response.accounts
        
        # Apply filtering unless include_all is True
        if not include_all:
            # canTrade filter disabled - show all accounts regardless of trade status

            # Exclude account ID 8734161 by default
            accounts = [account for account in accounts if str(account.id) != "8734161"]
        
        return {
            "accounts": accounts,
            "total_count": len(accounts)
        }
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            # Return empty list if no credentials are provided
            return {
                "accounts": [],
                "total_count": 0
            }
        # Re-raise other ValueErrors
        raise

@router.get("/names", response_model=AccountNamesResponse)
async def get_account_names(
    account_manager: Annotated[AccountManager, Depends(get_account_manager)],
    only_active: bool = Query(True, description="Only return active accounts"),
    only_tradable: bool = Query(True, description="Only return tradable accounts"),
    include_all: bool = Query(False, description="Include all accounts including non-tradable and excluded accounts")
):
    """Get all account names"""
    try:
        # Get all accounts first to apply filtering
        response = await account_manager.search_accounts(only_active_accounts=only_active)
        accounts = response.accounts
        
        # Apply filtering unless include_all is True
        if not include_all:
            # canTrade filter disabled - show all accounts regardless of trade status

            # Exclude account ID 8734161 by default
            accounts = [account for account in accounts if str(account.id) != "8734161"]
        
        # Extract just the names
        account_names = [account.name for account in accounts]
        return {"account_names": account_names}
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            # Return empty list if no credentials are provided
            return {"account_names": []}
        # Re-raise other ValueErrors
        raise

@router.get("/balance", response_model=AccountBalanceResponse)
async def get_total_balance(
    account_manager: Annotated[AccountManager, Depends(get_account_manager)],
    only_active: bool = Query(True, description="Only include active accounts")
):
    """Get total balance across all accounts"""
    try:
        total_balance = await account_manager.get_total_balance(only_active_accounts=only_active)
        return {"total_balance": total_balance}
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            # Return zero balance if no credentials are provided
            return {"total_balance": 0.0}
        # Re-raise other ValueErrors
        raise

@router.get("/tradable", response_model=AccountListResponse)
async def get_tradable_accounts(
    account_manager: Annotated[AccountManager, Depends(get_account_manager)],
    include_all: bool = Query(False, description="Include all tradable accounts including excluded ones")
):
    """Get all accounts that can be traded"""
    try:
        tradable_accounts = await account_manager.get_tradable_accounts()
        
        # Exclude account ID 8734161 by default unless include_all is True
        if not include_all:
            tradable_accounts = [account for account in tradable_accounts if str(account.id) != "8734161"]
        
        return {
            "accounts": tradable_accounts,
            "total_count": len(tradable_accounts)
        }
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            # Return empty list if no credentials are provided
            return {
                "accounts": [],
                "total_count": 0
            }
        # Re-raise other ValueErrors
        raise

@router.get("/by-prefix/{prefix}", response_model=AccountListResponse)
async def get_accounts_by_prefix(
    prefix: str,
    account_manager: Annotated[AccountManager, Depends(get_account_manager)],
    only_active: bool = Query(True, description="Only return active accounts")
):
    """Get accounts that start with a specific prefix"""
    try:
        accounts = await account_manager.get_accounts_by_prefix(
            name_prefix=prefix,
            only_active_accounts=only_active
        )
        return {
            "accounts": accounts,
            "total_count": len(accounts)
        }
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            # Return empty list if no credentials are provided
            return {
                "accounts": [],
                "total_count": 0
            }
        # Re-raise other ValueErrors
        raise

@router.get("/by-name/{account_name}", response_model=AccountIdResponse)
async def get_account_id_by_name(
    account_name: str,
    account_manager: Annotated[AccountManager, Depends(get_account_manager)]
):
    """Get account ID by account name"""
    try:
        account_id = await account_manager.get_account_id_by_name(account_name)
        
        if account_id:
            return {
                "account_id": account_id,
                "message": f"Account found with ID: {account_id}"
            }
        else:
            return {
                "account_id": None,
                "message": f"No account found with name: {account_name}"
            }
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            # Return not found message if no credentials are provided
            return {
                "account_id": None,
                "message": "No credentials provided to search for accounts"
            }
        # Re-raise other ValueErrors
        raise

@router.get("/{account_id}", response_model=AccountResponse)
async def get_account_by_id(
    account_id: int,
    account_manager: Annotated[AccountManager, Depends(get_account_manager)]
):
    """Get account by ID"""
    try:
        account = await account_manager.get_account_by_id(account_id)
        
        if not account:
            raise HTTPException(status_code=404, detail=f"Account with ID {account_id} not found")
            
        return account
    except ValueError as e:
        if "Username and API key must be provided" in str(e):
            # Return 404 with appropriate message if no credentials are provided
            raise HTTPException(
                status_code=404, 
                detail="No credentials provided to search for accounts"
            )
        # Re-raise other ValueErrors
        raise 