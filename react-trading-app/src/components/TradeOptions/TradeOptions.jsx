import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  FaSearch, 
  FaSync, 
  FaChartLine, 
  FaDollarSign,
  FaExchangeAlt,
  FaFilter,
  FaSortAmountDown,
  FaSortAmountUp,
  FaEye,
  FaEyeSlash,
  FaUser,
  FaWallet
} from 'react-icons/fa';
import Layout from '../Layout/Layout';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/auth.service';
import accountManager from '../../managers/AccountManager';
import orderManager from '../../managers/OrderManager';
import './TradeOptions.css';

const TradeOptions = () => {
  const { user } = useAuth();
  
  // State management
  const [contracts, setContracts] = useState([]);
  const [filteredContracts, setFilteredContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContract, setSelectedContract] = useState(null);
  
  // Account state
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState(null);
  
  // Trading form state
  const [orderType, setOrderType] = useState('Market');
  const [action, setAction] = useState('Buy');
  const [quantity, setQuantity] = useState(1);
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [takeProfitPrice, setTakeProfitPrice] = useState('');
  const [trailingOffset, setTrailingOffset] = useState('');
  const [closeExistingOrders, setCloseExistingOrders] = useState(false);

  // Order execution state
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [isClosingPosition, setIsClosingPosition] = useState(false);
  const [isReversingPosition, setIsReversingPosition] = useState(false);
  const [isFlatteningAll, setIsFlatteningAll] = useState(false);
  
  // Table state
  const [sortField, setSortField] = useState('symbol');
  const [sortDirection, setSortDirection] = useState('asc');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showDisabled, setShowDisabled] = useState(false);

  // Fetch contracts and accounts from backend
  useEffect(() => {
    fetchContracts();
    fetchAccounts();
  }, []);

  // Initialize managers when user is authenticated
  useEffect(() => {
    const initializeManagers = async () => {
      if (user && authService.isAuthenticated()) {
        try {
          await accountManager.initialize();
          console.log('AccountManager initialized successfully');

          await orderManager.initialize();
          console.log('OrderManager initialized successfully');
        } catch (error) {
          console.error('Failed to initialize managers:', error);
          setOrderError('Failed to initialize trading managers: ' + error.message);
        }
      }
    };

    initializeManagers();
  }, [user]);

  const getAuthHeaders = () => {
    const token = authService.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  };

  const fetchContracts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching contracts from backend...');
      
      const response = await fetch('http://localhost:8025/api/contracts', {
        headers: getAuthHeaders()
      });
      
      console.log('Contracts response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Contracts response data:', data);
      
      if (data.success) {
        setContracts(data.contracts);
        setFilteredContracts(data.contracts);
        console.log(`Successfully loaded ${data.contracts.length} contracts`);
      } else {
        const errorMsg = data.error || 'Unknown error occurred';
        setError(errorMsg);
        console.error('Contracts API returned error:', errorMsg);
      }
    } catch (err) {
      const errorMsg = `Failed to fetch contracts: ${err.message}`;
      setError(errorMsg);
      console.error('Error fetching contracts:', err);
      
      // Provide fallback message for users
      if (err.message.includes('fetch')) {
        setError('Unable to connect to trading backend. Please ensure the backend server is running on port 8025.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      setAccountsLoading(true);
      setAccountsError(null);
      
      if (!authService.isAuthenticated()) {
        setAccountsError('User not authenticated');
        return;
      }

      const accountNames = await accountManager.getAccountNames(true, true);
      setAccounts(accountNames);
      
      // Auto-select first account if available
      if (accountNames.length > 0 && !selectedAccount) {
        setSelectedAccount(accountNames[0]);
      }
      
      console.log(`Loaded ${accountNames.length} account names`);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
      setAccountsError('Failed to fetch accounts: ' + err.message);
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  };


  // Filter and search contracts
  useEffect(() => {
    let filtered = contracts.filter(contract => {
      const matchesSearch = 
        contract.symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contract.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contract.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contract.product_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter === 'All' || contract.category === categoryFilter;
      const matchesDisabled = showDisabled || !contract.disabled;
      
      return matchesSearch && matchesCategory && matchesDisabled;
    });

    // Sort contracts
    filtered.sort((a, b) => {
      let aValue = a[sortField] || '';
      let bValue = b[sortField] || '';
      
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    setFilteredContracts(filtered);
  }, [contracts, searchTerm, categoryFilter, showDisabled, sortField, sortDirection]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = [...new Set(contracts.map(c => c.category).filter(Boolean))];
    return ['All', ...cats.sort()];
  }, [contracts]);

  // Handle contract selection
  const handleContractSelect = (contract) => {
    setSelectedContract(contract);
  };

  // Handle sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Handle order submission
  const handlePlaceOrder = async () => {
    if (!selectedAccount) {
      setOrderError('Please select a trading account first');
      return;
    }

    if (!selectedContract) {
      setOrderError('Please select a contract first');
      return;
    }

    if (!orderManager.isReady()) {
      setOrderError('Order manager not ready. Please refresh and try again.');
      return;
    }

    // Clear previous errors/success
    setOrderError(null);
    setOrderSuccess(null);
    setIsPlacingOrder(true);

    try {
      const symbol = selectedContract.symbol;
      let orderId;

      console.log(`Placing ${orderType} order: ${action} ${quantity} ${symbol} for ${selectedAccount}`);

      switch (orderType) {
        case 'Market':
          orderId = await orderManager.placeMarketOrder(selectedAccount, symbol, action, quantity);
          setOrderSuccess(`Market order placed successfully! Order ID: ${orderId}`);
          break;

        case 'Limit':
          if (!limitPrice || isNaN(parseFloat(limitPrice))) {
            throw new Error('Please enter a valid limit price');
          }
          orderId = await orderManager.placeLimitOrder(
            selectedAccount,
            symbol,
            action,
            parseFloat(limitPrice),
            quantity
          );
          setOrderSuccess(`Limit order placed successfully! Order ID: ${orderId}`);
          break;

        case 'Stop Loss UI':
          if (!stopPrice || isNaN(parseFloat(stopPrice))) {
            throw new Error('Please enter a valid stop price in points');
          }
          const { marketOrderId, stopOrderId } = await orderManager.placeMarketWithStopLossOrder(
            selectedAccount,
            action,
            symbol,
            quantity,
            parseFloat(stopPrice)
          );
          setOrderSuccess(`Market order with stop loss placed successfully! Market Order ID: ${marketOrderId}, Stop Order ID: ${stopOrderId}`);
          break;

        case 'Trailing Stop':
          if (!trailingOffset || isNaN(parseFloat(trailingOffset))) {
            throw new Error('Please enter a valid trailing offset in points');
          }
          orderId = await orderManager.placeTrailStopOrder(
            selectedAccount,
            action,
            symbol,
            quantity,
            parseFloat(trailingOffset)
          );
          setOrderSuccess(`Trailing stop order placed successfully! Order ID: ${orderId}`);
          break;

        case 'Bracket UI':
          if (!stopPrice || isNaN(parseFloat(stopPrice))) {
            throw new Error('Please enter a valid stop loss price in points');
          }
          if (!takeProfitPrice || isNaN(parseFloat(takeProfitPrice))) {
            throw new Error('Please enter a valid take profit price in points');
          }
          const { marketOrderId: bracketOrderId } = await orderManager.placeBracketOrderWithTPAndSL(
            selectedAccount,
            symbol,
            action,
            quantity,
            parseFloat(stopPrice),
            parseFloat(takeProfitPrice)
          );
          setOrderSuccess(`Bracket order placed successfully! Order ID: ${bracketOrderId}`);
          break;

        default:
          throw new Error(`Unsupported order type: ${orderType}`);
      }

      console.log(`Order placed successfully:`, orderId);

      // Clear the success message after 10 seconds
      setTimeout(() => {
        setOrderSuccess(null);
      }, 10000);

    } catch (error) {
      console.error('Error placing order:', error);
      setOrderError(error.message || 'Failed to place order');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Handle close position
  const handleClosePosition = async () => {
    if (!selectedAccount) {
      setOrderError('Please select a trading account first');
      return;
    }

    if (!selectedContract) {
      setOrderError('Please select a contract first');
      return;
    }

    if (!orderManager.isReady()) {
      setOrderError('Order manager not ready. Please refresh and try again.');
      return;
    }

    setOrderError(null);
    setOrderSuccess(null);
    setIsClosingPosition(true);

    try {
      const symbol = selectedContract.symbol;
      const success = await orderManager.closeAllPositionsForASymbol(selectedAccount, symbol);

      if (success) {
        setOrderSuccess(`Successfully closed all positions for ${symbol} in account ${selectedAccount}`);
      } else {
        setOrderError('Failed to close positions - no response from server');
      }

      // Clear the success message after 10 seconds
      setTimeout(() => {
        setOrderSuccess(null);
      }, 10000);

    } catch (error) {
      console.error('Error closing position:', error);
      setOrderError(error.message || 'Failed to close position');
    } finally {
      setIsClosingPosition(false);
    }
  };

  // Handle reverse position
  const handleReversePosition = async () => {
    if (!selectedAccount) {
      setOrderError('Please select a trading account first');
      return;
    }

    if (!selectedContract) {
      setOrderError('Please select a contract first');
      return;
    }

    if (!orderManager.isReady()) {
      setOrderError('Order manager not ready. Please refresh and try again.');
      return;
    }

    setOrderError(null);
    setOrderSuccess(null);
    setIsReversingPosition(true);

    try {
      const symbol = selectedContract.symbol;
      const success = await orderManager.reverseOrder(selectedAccount, symbol);

      if (success) {
        setOrderSuccess(`Successfully reversed position for ${symbol} in account ${selectedAccount}`);
      } else {
        setOrderError('Failed to reverse position - no response from server');
      }

      // Clear the success message after 10 seconds
      setTimeout(() => {
        setOrderSuccess(null);
      }, 10000);

    } catch (error) {
      console.error('Error reversing position:', error);
      setOrderError(error.message || 'Failed to reverse position');
    } finally {
      setIsReversingPosition(false);
    }
  };

  // Handle flatten all positions
  const handleFlattenAll = async () => {
    if (!selectedAccount) {
      setOrderError('Please select a trading account first');
      return;
    }

    if (!orderManager.isReady()) {
      setOrderError('Order manager not ready. Please refresh and try again.');
      return;
    }

    setOrderError(null);
    setOrderSuccess(null);
    setIsFlatteningAll(true);

    try {
      const success = await orderManager.flattenAllPositionsForAccount(selectedAccount);

      if (success) {
        setOrderSuccess(`Successfully flattened all positions in account ${selectedAccount}`);
      } else {
        setOrderError('Failed to flatten all positions - no response from server');
      }

      // Clear the success message after 10 seconds
      setTimeout(() => {
        setOrderSuccess(null);
      }, 10000);

    } catch (error) {
      console.error('Error flattening all positions:', error);
      setOrderError(error.message || 'Failed to flatten all positions');
    } finally {
      setIsFlatteningAll(false);
    }
  };

  const renderOrderTypeFields = () => {
    switch (orderType) {
      case 'Limit':
        return (
          <div className="order-field">
            <label>LIMIT PRICE:</label>
            <input
              type="number"
              step="0.01"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder="Enter limit price"
            />
          </div>
        );
      
      case 'Stop Loss UI':
        return (
          <div className="order-field">
            <label>STOP PRICE (POINTS):</label>
            <input
              type="number"
              step="0.01"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              placeholder="Enter stop price"
            />
          </div>
        );
      
      case 'Trailing Stop':
        return (
          <div className="order-field">
            <label>TRAILING OFFSET (POINTS):</label>
            <input
              type="number"
              step="0.01"
              value={trailingOffset}
              onChange={(e) => setTrailingOffset(e.target.value)}
              placeholder="Enter trailing offset"
            />
          </div>
        );
      
      case 'Bracket UI':
        return (
          <>
            <div className="order-field">
              <label>STOP PRICE (POINTS):</label>
              <input
                type="number"
                step="0.01"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                placeholder="Enter stop price"
              />
            </div>
            <div className="order-field">
              <label>TAKE PROFIT (POINTS):</label>
              <input
                type="number"
                step="0.01"
                value={takeProfitPrice}
                onChange={(e) => setTakeProfitPrice(e.target.value)}
                placeholder="Enter take profit"
              />
            </div>
          </>
        );
      
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="trade-options-loading">
        <div className="loading-spinner"></div>
        <p>Loading trading data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trade-options-error">
        <p>Error: {error}</p>
        <button onClick={fetchContracts} className="retry-button">
          <FaSync /> Retry
        </button>
      </div>
    );
  }

  return (
    <Layout title="Trade Options" subtitle="Execute orders directly from the dashboard">
      <div className="trade-options-container">
        <motion.div 
          className="trade-options-header"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="page-title">
            <FaChartLine className="title-icon" />
            Trading Dashboard
          </h1>
          <p className="page-subtitle">Execute orders directly from the dashboard.</p>
        </motion.div>

      <div className="trade-options-content">
        {/* Trading Panel */}
        <motion.div 
          className="trading-panel"
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="panel-header">
            <h2>Trade Execution</h2>
          </div>

          {/* Order Status Messages */}
          {orderError && (
            <div className="order-error-message">
              <span className="error-icon">❌</span>
              <span>{orderError}</span>
              <button
                className="close-message-btn"
                onClick={() => setOrderError(null)}
                title="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {orderSuccess && (
            <div className="order-success-message">
              <span className="success-icon">✅</span>
              <span>{orderSuccess}</span>
              <button
                className="close-message-btn"
                onClick={() => setOrderSuccess(null)}
                title="Dismiss success message"
              >
                ×
              </button>
            </div>
          )}

          <div className="trading-form">

            {/* Account Selection */}
            <div className="form-section">
              <label>
                <FaUser className="label-icon" />
                TRADING ACCOUNT
              </label>
              <div className="account-selection-container">
                <select 
                  value={selectedAccount || ''} 
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="account-select"
                  disabled={accountsLoading || accounts.length === 0}
                >
                  <option value="" disabled>
                    {accountsLoading ? 'Loading accounts...' : 
                     accounts.length === 0 ? 'No accounts available' : 
                     'Select account'}
                  </option>
                  {accounts.map((accountName, index) => (
                    <option key={`${accountName}-${index}`} value={accountName}>
                      {accountName}
                    </option>
                  ))}
                </select>
                <button 
                  className="refresh-accounts-btn"
                  onClick={fetchAccounts}
                  disabled={accountsLoading}
                  title="Refresh accounts"
                >
                  <FaSync className={accountsLoading ? 'spinning' : ''} />
                </button>
              </div>
              {accountsError && (
                <div className="error-message">
                  <small>{accountsError}</small>
                </div>
              )}
            </div>

            {/* Symbol Selection */}
            <div className="form-section">
              <label>
                <FaChartLine className="label-icon" />
                SYMBOL
              </label>
              <div className="symbol-input-container">
                <input
                  type="text"
                  placeholder="Type symbol (e.g., NQ, ES, CL) or select from table below"
                  value={selectedContract?.symbol || ''}
                  onChange={(e) => {
                    const inputSymbol = e.target.value.toUpperCase();
                    
                    if (!inputSymbol) {
                      setSelectedContract(null);
                      return;
                    }
                    
                    // Find matching contract from loaded contracts
                    const matchingContract = contracts.find(contract => 
                      contract.symbol === inputSymbol || 
                      contract.product_name === inputSymbol ||
                      contract.contract_name === inputSymbol
                    );
                    
                    if (matchingContract) {
                      setSelectedContract(matchingContract);
                    } else {
                      // Create a temporary contract object for manual entry
                      setSelectedContract({
                        symbol: inputSymbol,
                        contract_name: inputSymbol,
                        manual_entry: true
                      });
                    }
                  }}
                  className={`symbol-input ${selectedContract?.manual_entry ? 'manual-entry' : ''}`}
                  title={selectedContract?.manual_entry ? 'Manual entry - contract not found in loaded contracts' : ''}
                />
                <button 
                  className="select-contract-btn"
                  onClick={() => {
                    const contractsSection = document.getElementById('contracts-table');
                    if (contractsSection) {
                      contractsSection.scrollIntoView({ behavior: 'smooth' });
                    } else {
                      console.warn('Contracts table not found');
                      // Try to scroll to contracts section instead
                      const contractsContainer = document.querySelector('.contracts-section');
                      if (contractsContainer) {
                        contractsContainer.scrollIntoView({ behavior: 'smooth' });
                      }
                    }
                  }}
                >
                  Select from Table
                </button>
              </div>
              
              {/* Symbol Status */}
              {selectedContract && (
                <div className="symbol-status">
                  {selectedContract.manual_entry ? (
                    <small className="manual-entry-notice">
                      ⚠️ Manual entry: "{selectedContract.symbol}" - Contract details not verified
                    </small>
                  ) : (
                    <small className="contract-verified">
                      ✅ Contract verified: {selectedContract.name || selectedContract.contract_name}
                    </small>
                  )}
                </div>
              )}
              
              {/* Contracts Loading Error */}
              {error && (
                <div className="contracts-error">
                  <small>⚠️ Contracts unavailable: {error}</small>
                  <small>You can still enter symbols manually above.</small>
                </div>
              )}
            </div>

            {/* Order Configuration */}
            <div className="order-config">
              <div className="config-row">
                <div className="config-field">
                  <label>ORDER TYPE:</label>
                  <select 
                    value={orderType} 
                    onChange={(e) => setOrderType(e.target.value)}
                  >
                    <option value="Market">Market</option>
                    <option value="Limit">Limit</option>
                    <option value="Stop Loss UI">Stop Loss UI</option>
                    <option value="Trailing Stop">Trailing Stop</option>
                    <option value="Bracket UI">Bracket UI</option>
                  </select>
                </div>
                
                <div className="config-field">
                  <label>ACTION</label>
                  <select 
                    value={action} 
                    onChange={(e) => setAction(e.target.value)}
                  >
                    <option value="Buy">Buy</option>
                    <option value="Sell">Sell</option>
                  </select>
                </div>
                
                <div className="config-field">
                  <label>QUANTITY</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>

              {/* Dynamic order type fields */}
              {renderOrderTypeFields()}

              {/* Close existing orders option */}
              <div className="checkbox-field">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={closeExistingOrders}
                    onChange={(e) => setCloseExistingOrders(e.target.checked)}
                  />
                  CLOSE EXISTING ORDERS
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="action-buttons">
              <button
                className="place-order-btn"
                onClick={handlePlaceOrder}
                disabled={!selectedContract || !selectedAccount || isPlacingOrder}
              >
                {isPlacingOrder ? 'PLACING ORDER...' : 'PLACE ORDER'}
              </button>
              <button
                className="close-position-btn"
                onClick={handleClosePosition}
                disabled={!selectedContract || !selectedAccount || isClosingPosition}
              >
                {isClosingPosition ? 'CLOSING...' : 'CLOSE POSITION'}
              </button>
              <button
                className="reverse-position-btn"
                onClick={handleReversePosition}
                disabled={!selectedContract || !selectedAccount || isReversingPosition}
              >
                {isReversingPosition ? 'REVERSING...' : 'REVERSE POSITION'}
              </button>
              <button
                className="flatten-all-btn"
                onClick={handleFlattenAll}
                disabled={!selectedAccount || isFlatteningAll}
              >
                {isFlatteningAll ? 'FLATTENING...' : 'FLATTEN ALL'}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Contracts Table */}
        <motion.div 
          className="contracts-section"
          id="contracts-table"
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="section-header">
            <h2>Tradable Symbols</h2>
            <button 
              className="refresh-btn"
              onClick={fetchContracts}
              title="Refresh contracts"
            >
              <FaSync />
            </button>
          </div>

          {/* Search and Filters */}
          <div className="table-controls">
            <div className="search-container">
              <FaSearch className="search-icon" />
              <input
                type="text"
                placeholder="Search symbols, contract names, or descriptions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            
            <div className="filter-controls">
              <select 
                value={categoryFilter} 
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="category-filter"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              
              <button 
                className={`toggle-disabled ${showDisabled ? 'active' : ''}`}
                onClick={() => setShowDisabled(!showDisabled)}
                title={showDisabled ? 'Hide disabled contracts' : 'Show disabled contracts'}
              >
                {showDisabled ? <FaEye /> : <FaEyeSlash />}
              </button>
            </div>
          </div>

          {/* Contracts Table */}
          <div className="contracts-table-container">
            <table className="contracts-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('symbol')} className="sortable">
                    Symbol {sortField === 'symbol' && (sortDirection === 'asc' ? <FaSortAmountUp /> : <FaSortAmountDown />)}
                  </th>
                  <th onClick={() => handleSort('name')} className="sortable">
                    Name {sortField === 'name' && (sortDirection === 'asc' ? <FaSortAmountUp /> : <FaSortAmountDown />)}
                  </th>
                  <th onClick={() => handleSort('tick_size')} className="sortable">
                    Tick Size {sortField === 'tick_size' && (sortDirection === 'asc' ? <FaSortAmountUp /> : <FaSortAmountDown />)}
                  </th>
                  <th onClick={() => handleSort('point_value')} className="sortable">
                    Point Value {sortField === 'point_value' && (sortDirection === 'asc' ? <FaSortAmountUp /> : <FaSortAmountDown />)}
                  </th>
                  <th onClick={() => handleSort('total_fees')} className="sortable">
                    Total Fees {sortField === 'total_fees' && (sortDirection === 'asc' ? <FaSortAmountUp /> : <FaSortAmountDown />)}
                  </th>
                  <th>Exchange</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((contract, index) => (
                  <motion.tr 
                    key={contract.contract_id}
                    className={`${contract.disabled ? 'disabled' : ''} ${selectedContract?.contract_id === contract.contract_id ? 'selected' : ''}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.02 }}
                  >
                    <td className="symbol-cell">
                      <span className="symbol">{contract.symbol}</span>
                    </td>
                    <td className="name-cell">
                      <div className="contract-info">
                        <span className="contract-name">{contract.name}</span>
                        <span className="contract-description">{contract.description}</span>
                      </div>
                    </td>
                    <td className="tick-size-cell">
                      {contract.tick_size?.toFixed(contract.decimal_places || 2)}
                    </td>
                    <td className="point-value-cell">
                      ${contract.point_value?.toLocaleString()}
                    </td>
                    <td className="fees-cell">
                      ${contract.total_fees?.toFixed(2)}
                    </td>
                    <td className="exchange-cell">
                      {contract.exchange}
                    </td>
                    <td className="action-cell">
                      <button 
                        className="select-btn"
                        onClick={() => handleContractSelect(contract)}
                        disabled={contract.disabled}
                      >
                        Select
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            
            {filteredContracts.length === 0 && (
              <div className="no-results">
                <p>No contracts found matching your criteria.</p>
              </div>
            )}
          </div>

          <div className="table-footer">
            <p>Showing {filteredContracts.length} of {contracts.length} contracts</p>
            <p>Last updated: {contracts[0]?.last_updated ? new Date(contracts[0].last_updated).toLocaleString() : 'N/A'}</p>
          </div>
        </motion.div>
      </div>
      </div>
    </Layout>
  );
};

export default TradeOptions;
