import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaPlus,
  FaPlay,
  FaStop,
  FaEdit,
  FaTrash,
  FaCopy,
  FaSearch,
  FaFilter,
  FaChartLine,
  FaChartBar,
  FaCubes,
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle
} from 'react-icons/fa';
import axios from 'axios';
import Layout from '../Layout/Layout';
import StrategyCreationWizard from './StrategyCreationWizard';
import './StrategyManagement.css';

const StrategyManagement = () => {
  const [strategies, setStrategies] = useState([]);
  const [filteredStrategies, setFilteredStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [strategyToDelete, setStrategyToDelete] = useState(null);

  useEffect(() => {
    fetchStrategies();
  }, []);

  useEffect(() => {
    filterStrategies();
  }, [strategies, searchTerm, filterType, filterStatus]);

  const fetchStrategies = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:8000/api/strategies');
      setStrategies(response.data.data || []);
    } catch (error) {
      console.error('Error fetching strategies:', error);
      // Use mock data for demonstration
      setStrategies([
        {
          id: '1',
          name: 'NQ Scalping Strategy',
          strategy_type: 'candlestick',
          contract_symbol: 'NQ',
          contract_name: 'E-mini Nasdaq-100 Futures',
          product_id: 'F.US.NQ',
          timeframe: '5m',
          status: 'active',
          // Chart-specific settings for testing
          chart_type: 'candlestick',
          brick_size: null,
          chart_config: {
            resolution: '5',
            chartType: 'candlestick',
            indicators: []
          },
          indicators: [{ name: 'sma', display_name: 'SMA', parameters: { period: 20 } }],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: '2',
          name: 'ES Trend Following',
          strategy_type: 'heiken_ashi',
          contract_symbol: 'ES',
          contract_name: 'E-mini S&P 500 Futures',
          product_id: 'F.US.ES',
          timeframe: '15m',
          status: 'inactive',
          // Chart-specific settings for testing
          chart_type: 'heiken_ashi',
          brick_size: null,
          chart_config: {
            resolution: '15',
            chartType: 'heiken_ashi',
            indicators: []
          },
          indicators: [
            { name: 'ema', display_name: 'EMA', parameters: { period: 50 } },
            { name: 'macd', display_name: 'MACD', parameters: {} }
          ],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: '3',
          name: 'Renko Breakout Strategy',
          strategy_type: 'renko',
          contract_symbol: 'YM',
          contract_name: 'E-mini Dow Jones Futures',
          product_id: 'F.US.YM',
          timeframe: '10',
          status: 'inactive',
          // Chart-specific settings for testing Renko
          chart_type: 'renko',
          brick_size: 5.0,
          chart_config: {
            resolution: '10',
            chartType: 'renko',
            brickSize: 5.0,
            indicators: []
          },
          indicators: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filterStrategies = () => {
    let filtered = [...strategies];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(strategy =>
        strategy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        strategy.contract_symbol.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(strategy => strategy.strategy_type === filterType);
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(strategy => strategy.status === filterStatus);
    }

    setFilteredStrategies(filtered);
  };

  const handleStartStop = async (strategyId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await axios.patch(`http://localhost:8000/api/strategies/${strategyId}`, { status: newStatus });
      setStrategies(strategies.map(s => 
        s.id === strategyId ? { ...s, status: newStatus } : s
      ));
    } catch (error) {
      console.error('Error updating strategy status:', error);
      // Update locally for demonstration
      setStrategies(strategies.map(s => 
        s.id === strategyId ? { ...s, status: newStatus } : s
      ));
    }
  };

  const handleEdit = (strategy) => {
    setSelectedStrategy(strategy);
    setIsEditMode(true);
    setIsWizardOpen(true);
  };

  const handleDelete = (strategy) => {
    setStrategyToDelete(strategy);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!strategyToDelete) return;
    
    try {
      await axios.delete(`http://localhost:8000/api/strategies/${strategyToDelete.id}`);
      setStrategies(strategies.filter(s => s.id !== strategyToDelete.id));
    } catch (error) {
      console.error('Error deleting strategy:', error);
      // Delete locally for demonstration
      setStrategies(strategies.filter(s => s.id !== strategyToDelete.id));
    }
    
    setShowDeleteConfirm(false);
    setStrategyToDelete(null);
  };

  const handleClone = async (strategy) => {
    const clonedStrategy = {
      ...strategy,
      id: undefined,
      name: `${strategy.name} (Copy)`,
      status: 'inactive',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const response = await axios.post('http://localhost:8000/api/strategies', clonedStrategy);
      setStrategies([...strategies, response.data]);
    } catch (error) {
      console.error('Error cloning strategy:', error);
      // Add locally for demonstration
      const newStrategy = { ...clonedStrategy, id: Date.now().toString() };
      setStrategies([...strategies, newStrategy]);
    }
  };

  const handleStrategySaved = (strategyData) => {
    if (isEditMode && selectedStrategy?.id) {
      // Update existing strategy
      console.log('Updating existing strategy in list:', selectedStrategy.id);
      setStrategies(strategies.map(s => 
        s.id === selectedStrategy.id ? strategyData : s
      ));
    } else {
      // Create new strategy
      console.log('Adding new strategy to list');
      setStrategies([...strategies, strategyData]);
    }
    setIsWizardOpen(false);
    setIsEditMode(false);
    setSelectedStrategy(null);
  };

  const getStrategyIcon = (type) => {
    switch (type) {
      case 'candlestick': return FaChartLine;
      case 'heiken_ashi': return FaChartBar;
      case 'renko': return FaCubes;
      default: return FaChartLine;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return FaCheckCircle;
      case 'inactive': return FaTimesCircle;
      case 'error': return FaExclamationTriangle;
      default: return FaTimesCircle;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Layout title="Strategy Management" subtitle="Create, manage, and monitor your trading strategies">
      <div className="strategy-management">
      <div className="management-header">
        <div className="header-content">
          <h1 className="management-title">Strategy Management</h1>
          <p className="management-subtitle">Create, manage, and monitor your trading strategies</p>
        </div>
        <motion.button
          className="create-strategy-btn"
          onClick={() => setIsWizardOpen(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <FaPlus /> Create New Strategy
        </motion.button>
      </div>

      <div className="management-controls">
        <div className="search-bar">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search strategies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-controls">
          <div className="filter-group">
            <FaFilter className="filter-icon" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Types</option>
              <option value="candlestick">Candlestick</option>
              <option value="heiken_ashi">Heiken Ashi</option>
              <option value="renko">Renko</option>
            </select>
          </div>

          <div className="filter-group">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>
      </div>

      <div className="strategies-container">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading strategies...</p>
          </div>
        ) : filteredStrategies.length === 0 ? (
          <div className="empty-state">
            <FaChartLine className="empty-icon" />
            <h3>No strategies found</h3>
            <p>Create your first strategy to get started</p>
            <button 
              className="create-first-btn"
              onClick={() => setIsWizardOpen(true)}
            >
              <FaPlus /> Create Strategy
            </button>
          </div>
        ) : (
          <div className="strategies-grid">
            <AnimatePresence>
              {filteredStrategies.map((strategy) => {
                const StrategyIcon = getStrategyIcon(strategy.strategy_type);
                const StatusIcon = getStatusIcon(strategy.status);
                
                return (
                  <motion.div
                    key={strategy.id}
                    className={`strategy-card ${strategy.status}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    whileHover={{ y: -5 }}
                  >
                    <div className="card-header">
                      <div className="card-title-section">
                        <StrategyIcon className="strategy-type-icon" />
                        <div>
                          <h3 className="strategy-name">{strategy.name}</h3>
                          <div className="strategy-meta">
                            <span className="contract-badge">{strategy.contract_symbol}</span>
                            <span className="timeframe-badge">
                              <FaClock /> {strategy.timeframe}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className={`status-indicator ${strategy.status}`}>
                        <StatusIcon />
                        <span>{strategy.status}</span>
                      </div>
                    </div>

                    <div className="card-body">
                      <div className="strategy-details">
                        <div className="detail-item">
                          <span className="detail-label">Type:</span>
                          <span className="detail-value">
                            {strategy.strategy_type ? strategy.strategy_type.replace('_', ' ').toUpperCase() : 'Unknown'}
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Contract:</span>
                          <span className="detail-value">{strategy.contract_name || 'Unknown'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Payload:</span>
                          <span className="detail-value">
                            {strategy.webhook_payload ? 'Custom JSON' : 'Default'}
                          </span>
                        </div>
                      </div>

                      <div className="card-timestamps">
                        <div className="timestamp">
                          <span className="timestamp-label">Created:</span>
                          <span className="timestamp-value">{formatDate(strategy.created_at)}</span>
                        </div>
                        <div className="timestamp">
                          <span className="timestamp-label">Modified:</span>
                          <span className="timestamp-value">{formatDate(strategy.updated_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="card-actions">
                      <button
                        className={`action-btn ${strategy.status === 'active' ? 'stop' : 'start'}`}
                        onClick={() => handleStartStop(strategy.id, strategy.status)}
                        title={strategy.status === 'active' ? 'Stop Strategy' : 'Start Strategy'}
                      >
                        {strategy.status === 'active' ? <FaStop /> : <FaPlay />}
                      </button>
                      <button
                        className="action-btn edit"
                        onClick={() => handleEdit(strategy)}
                        title="Edit Strategy"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="action-btn clone"
                        onClick={() => handleClone(strategy)}
                        title="Clone Strategy"
                      >
                        <FaCopy />
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => handleDelete(strategy)}
                        title="Delete Strategy"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="confirm-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <h3>Delete Strategy</h3>
              <p>Are you sure you want to delete "{strategyToDelete?.name}"?</p>
              <p className="warning-text">This action cannot be undone.</p>
              <div className="confirm-actions">
                <button 
                  className="cancel-btn"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="confirm-delete-btn"
                  onClick={confirmDelete}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Strategy Creation Wizard */}
      <StrategyCreationWizard
        isOpen={isWizardOpen}
        onClose={() => {
          setIsWizardOpen(false);
          setIsEditMode(false);
          setSelectedStrategy(null);
        }}
        onStrategyCreated={handleStrategySaved}
        editMode={isEditMode}
        strategy={selectedStrategy}
      />
      </div>
    </Layout>
  );
};

export default StrategyManagement;