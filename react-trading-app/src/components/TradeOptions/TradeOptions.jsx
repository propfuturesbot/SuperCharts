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
  FaEyeSlash
} from 'react-icons/fa';
import Layout from '../Layout/Layout';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/auth.service';
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
  
  // Trading form state
  const [orderType, setOrderType] = useState('Market');
  const [action, setAction] = useState('Buy');
  const [quantity, setQuantity] = useState(1);
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [takeProfitPrice, setTakeProfitPrice] = useState('');
  const [trailingOffset, setTrailingOffset] = useState('');
  const [closeExistingOrders, setCloseExistingOrders] = useState(false);
  
  // Table state
  const [sortField, setSortField] = useState('symbol');
  const [sortDirection, setSortDirection] = useState('asc');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showDisabled, setShowDisabled] = useState(false);

  // Fetch contracts from backend
  useEffect(() => {
    fetchContracts();
  }, []);

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
      const response = await fetch('http://localhost:8025/api/contracts', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      
      if (data.success) {
        setContracts(data.contracts);
        setFilteredContracts(data.contracts);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch contracts: ' + err.message);
    } finally {
      setLoading(false);
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
  const handlePlaceOrder = () => {
    if (!selectedContract) {
      alert('Please select a contract first');
      return;
    }
    

    const orderData = {
      contract: selectedContract,
      orderType,
      action,
      quantity,
      limitPrice: orderType === 'Limit' || orderType === 'Bracket UI' ? limitPrice : null,
      stopPrice: orderType === 'Stop Loss UI' || orderType === 'Bracket UI' ? stopPrice : null,
      takeProfitPrice: orderType === 'Bracket UI' ? takeProfitPrice : null,
      trailingOffset: orderType === 'Trailing Stop' ? trailingOffset : null,
      closeExistingOrders
    };

    console.log('Placing order:', orderData);
    alert(`Order placed successfully!\n\nContract: ${selectedContract.symbol}\nType: ${orderType}\nAction: ${action}\nQuantity: ${quantity}`);
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
          
          <div className="trading-form">

            {/* Symbol Selection */}
            <div className="form-section">
              <label>SYMBOL</label>
              <div className="symbol-input-container">
                <input
                  type="text"
                  placeholder="e.g., NQ, ES, CL"
                  value={selectedContract?.symbol || ''}
                  readOnly
                  className="symbol-input"
                />
                <button 
                  className="select-contract-btn"
                  onClick={() => document.getElementById('contracts-table').scrollIntoView({ behavior: 'smooth' })}
                >
                  Select Contract
                </button>
              </div>
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
                disabled={!selectedContract}
              >
                PLACE ORDER
              </button>
              <button className="close-position-btn">
                CLOSE POSITION
              </button>
              <button className="reverse-position-btn">
                REVERSE POSITION
              </button>
              <button className="flatten-all-btn">
                FLATTEN ALL
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
