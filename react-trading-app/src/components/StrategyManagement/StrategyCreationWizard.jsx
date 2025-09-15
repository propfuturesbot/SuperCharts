import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaChartLine,
  FaChartBar,
  FaCubes,
  FaTimes,
  FaArrowLeft,
  FaArrowRight,
  FaSearch,
  FaClock,
  FaLink,
  FaSave,
  FaCheckCircle
} from 'react-icons/fa';
import axios from 'axios';
import tradovateContracts from '../../data/tradovate_contracts.json';
import TradingChart from '../TradingChart/TradingChart';
import './StrategyCreationWizard.css';

const StrategyCreationWizard = ({ isOpen, onClose, onStrategyCreated, editMode = false, strategy = null }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    strategyType: '',
    contract: null,
    contractProductId: '',
    strategyName: '',
    timeframe: '15',
    brickSize: '0.25',
    webhookUrl: '',
    webhookPayload: '{\n  "accountName": "",\n  "action": "buy",\n  "orderType": "",\n  "symbol": "",\n  "qty": 5,\n  "trailingOffset": null,\n  "closeExistingOrders": "N",\n  "tradeTimeRanges": [],\n  "avoidTradeTimeRanges": []\n}'
  });
  
  const [contracts, setContracts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showFullPageChart, setShowFullPageChart] = useState(false);

  const strategyTypes = [
    {
      id: 'candlestick',
      name: 'Candlestick Strategy',
      icon: FaChartLine,
      description: 'Traditional candlestick patterns and analysis'
    },
    {
      id: 'heiken_ashi',
      name: 'Heiken Ashi Strategy',
      icon: FaChartBar,
      description: 'Smoothed candlestick patterns for trend identification'
    },
    {
      id: 'renko',
      name: 'Renko Strategy',
      icon: FaCubes,
      description: 'Price movement-based charts ignoring time'
    }
  ];

  const timeframes = [
    // Ticks
    { value: '100T', label: '100 Ticks', group: 'Ticks' },
    { value: '500T', label: '500 Ticks', group: 'Ticks' },
    { value: '1000T', label: '1000 Ticks', group: 'Ticks' },
    { value: '5000T', label: '5000 Ticks', group: 'Ticks' },
    
    // Seconds
    { value: '1S', label: '1 Second', group: 'Seconds' },
    { value: '5S', label: '5 Seconds', group: 'Seconds' },
    { value: '10S', label: '10 Seconds', group: 'Seconds' },
    { value: '15S', label: '15 Seconds', group: 'Seconds' },
    { value: '20S', label: '20 Seconds', group: 'Seconds' },
    { value: '30S', label: '30 Seconds', group: 'Seconds' },
    
    // Minutes
    { value: '1', label: '1 Minute', group: 'Minutes' },
    { value: '2', label: '2 Minutes', group: 'Minutes' },
    { value: '3', label: '3 Minutes', group: 'Minutes' },
    { value: '4', label: '4 Minutes', group: 'Minutes' },
    { value: '5', label: '5 Minutes', group: 'Minutes' },
    { value: '10', label: '10 Minutes', group: 'Minutes' },
    { value: '15', label: '15 Minutes', group: 'Minutes' },
    { value: '20', label: '20 Minutes', group: 'Minutes' },
    { value: '30', label: '30 Minutes', group: 'Minutes' },
    { value: '45', label: '45 Minutes', group: 'Minutes' },
    { value: '60', label: '1 Hour', group: 'Minutes' },
    
    // Days/Weeks/Months
    { value: '1D', label: '1 Day', group: 'Extended' },
    { value: '1W', label: '1 Week', group: 'Extended' },
    { value: '1M', label: '1 Month', group: 'Extended' }
  ];

  useEffect(() => {
    fetchContracts();
  }, []);

  // Load strategy data when in edit mode
  useEffect(() => {
    const loadStrategyData = async () => {
      if (!editMode || !strategy || !isOpen) return;
      console.log('Loading strategy for editing:', strategy);
      
      // Pre-populate form with strategy data
      console.log('Loading strategy for editing - full strategy object:', strategy);
      
      // Find the contract and look up product_id if needed
      const foundContract = contracts.find(c => c.symbol === strategy.contract_symbol);
      let productId = strategy.product_id || '';
      
      // If no product_id in strategy data, try to look it up
      if (!productId && foundContract) {
        try {
          console.log('Looking up product_id for contract:', foundContract.symbol);
          productId = await lookupContractProductId(foundContract.symbol);
          console.log('Found product_id:', productId);
        } catch (error) {
          console.warn('Could not lookup product_id, using fallback:', error);
          // Fallback: generate product_id from contract symbol
          productId = `F.US.${strategy.contract_symbol}`;
        }
      }
      
      const loadedFormData = {
        strategyType: strategy.strategy_type || strategy.chart_type || '',
        contract: foundContract,
        contractProductId: productId,
        strategyName: strategy.name || '',
        timeframe: strategy.chart_config?.resolution || strategy.timeframe || '15',
        brickSize: strategy.brick_size || strategy.chart_config?.brickSize || '0.25',
        webhookUrl: strategy.webhook_url || '',
        webhookPayload: strategy.webhook_payload ? JSON.stringify(strategy.webhook_payload, null, 2) : '{\n  "accountName": "",\n  "action": "buy",\n  "orderType": "",\n  "symbol": "",\n  "qty": 5,\n  "trailingOffset": null,\n  "closeExistingOrders": "N",\n  "tradeTimeRanges": [],\n  "avoidTradeTimeRanges": []\n}'
      };
      
      console.log('Loaded form data for editing:', loadedFormData);
      setFormData(loadedFormData);

      // If we have strategy type and contract, skip to step 3 (configuration)
      if (strategy.strategy_type && strategy.contract_symbol) {
        setCurrentStep(3);
      }
      
      // Reset error state
      setError('');
    };

    const resetCreateMode = () => {
      if (!editMode && isOpen) {
        // Reset form for create mode
        setCurrentStep(1);
        setFormData({
          strategyType: '',
          contract: null,
          contractProductId: '',
          strategyName: '',
          timeframe: '15',
          brickSize: '0.25',
          webhookUrl: '',
          webhookPayload: '{\n  "accountName": "",\n  "action": "buy",\n  "orderType": "",\n  "symbol": "",\n  "qty": 5,\n  "trailingOffset": null,\n  "closeExistingOrders": "N",\n  "tradeTimeRanges": [],\n  "avoidTradeTimeRanges": []\n}'
        });
      }
    };

    if (editMode && strategy && isOpen) {
      loadStrategyData();
    } else {
      resetCreateMode();
    }
  }, [editMode, strategy, isOpen, contracts]);

  // Contract lookup function to get product_id
  const lookupContractProductId = async (contractName) => {
    try {
      const response = await axios.get(`http://localhost:8000/api/contracts/lookup/${encodeURIComponent(contractName)}`);
      if (response.data && response.data.success) {
        return response.data.product_id;
      }
      throw new Error('Contract not found');
    } catch (error) {
      console.error('Error looking up contract:', error);
      throw error;
    }
  };

  const fetchContracts = async () => {
    try {
      setLoading(true);
      console.log('Fetching contracts from API...');
      
      // Fetch contracts from our backend API
      const response = await axios.get('http://localhost:8000/api/contracts');
      
      if (response.data && response.data.success && response.data.contracts) {
        console.log(`Loaded ${response.data.contracts.length} contracts from ${response.data.source}`);
        setContracts(response.data.contracts);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error fetching contracts:', error);
      
      // Fallback to local JSON file if API fails
      try {
        console.log('Falling back to local contract data...');
        setContracts(tradovateContracts);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        setError('Failed to load contracts. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };


  const handleStrategyTypeSelect = (type) => {
    setFormData({ ...formData, strategyType: type });
  };

  const handleContractSelect = async (contract) => {
    try {
      setLoading(true);
      setError('');
      
      // First, look up the product_id for this contract
      let productId = '';
      
      // Try different contract name formats for lookup
      const searchTerms = [
        contract.symbol,
        contract.product_name || contract.symbol,
        contract.name
      ].filter(Boolean);
      
      for (const term of searchTerms) {
        try {
          productId = await lookupContractProductId(term);
          console.log(`Found product_id: ${productId} for contract: ${term}`);
          break;
        } catch (error) {
          console.log(`No match for ${term}, trying next...`);
        }
      }
      
      if (!productId) {
        // Fallback: use the product_id from contract data if available
        productId = contract.product_id || `F.US.${contract.symbol}`;
        console.log(`Using fallback product_id: ${productId}`);
      }
      
      setFormData({ 
        ...formData, 
        contract,
        contractProductId: productId
      });
      
    } catch (error) {
      console.error('Error selecting contract:', error);
      setError('Failed to lookup contract details');
    } finally {
      setLoading(false);
    }
  };


  const handleNext = () => {
    if (currentStep === 1 && !formData.strategyType) {
      setError('Please select a strategy type');
      return;
    }
    if (currentStep === 2 && !formData.contract) {
      setError('Please select a contract');
      return;
    }
    if (currentStep === 3) {
      if (!formData.strategyName.trim()) {
        setError('Please enter a strategy name');
        return;
      }
      
      // Validate JSON payload
      try {
        JSON.parse(formData.webhookPayload);
      } catch (error) {
        setError('Invalid JSON in payload. Please check your JSON syntax.');
        return;
      }
      
      if (formData.webhookUrl && !validateWebhookUrl(formData.webhookUrl)) {
        setError('Please enter a valid webhook URL');
        return;
      }
      
      // Open full page chart instead of going to step 4
      setShowFullPageChart(true);
      return;
    }
    setError('');
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    setError('');
    setCurrentStep(currentStep - 1);
  };

  const validateWebhookUrl = (url) => {
    if (!url) return true; // Optional field
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSaveStrategy = async (chartData = null) => {
    setLoading(true);
    setError('');

    console.log('handleSaveStrategy called with chartData:', chartData);
    console.log('Current formData.timeframe:', formData.timeframe);
    console.log('chartData.resolution:', chartData?.resolution);

    const strategyData = {
      name: formData.strategyName,
      strategy_type: formData.strategyType,
      contract_symbol: formData.contract.symbol,
      contract_name: formData.contract.name,
      timeframe: chartData?.resolution || formData.timeframe,
      // Chart-specific settings
      chart_type: formData.strategyType, // Store the chart type for restoration
      brick_size: formData.strategyType === 'renko' ? parseFloat(formData.brickSize) : null,
      // Chart configuration from TradingChart component (if available)
      chart_config: chartData ? {
        resolution: chartData.resolution,
        chartType: chartData.chartType,
        brickSize: chartData.brickSize,
        indicators: chartData.indicators || []
      } : null,
      webhook_url: formData.webhookUrl || null,
      webhook_payload: JSON.parse(formData.webhookPayload)
    };

    try {
      let updatedStrategy;
      
      if (editMode && strategy?.id) {
        // Update existing strategy
        console.log('Updating strategy:', strategy.id);
        try {
          const response = await axios.put(`http://localhost:8000/api/strategies/${strategy.id}`, strategyData);
          updatedStrategy = {
            ...strategyData,
            id: strategy.id,
            status: strategy.status || 'inactive',
            created_at: strategy.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        } catch (apiError) {
          console.warn('API update failed, handling locally:', apiError.message);
          // Handle update locally since API is not available
          updatedStrategy = { 
            ...strategy, 
            ...strategyData, 
            updated_at: new Date().toISOString() 
          };
        }
      } else {
        // Create new strategy
        console.log('Creating new strategy');
        try {
          const response = await axios.post('http://localhost:8000/api/strategies', strategyData);
          updatedStrategy = {
            ...strategyData,
            id: response.data.id,
            status: 'inactive',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        } catch (apiError) {
          console.warn('API create failed, handling locally:', apiError.message);
          // Handle create locally since API is not available
          updatedStrategy = { 
            ...strategyData, 
            id: Date.now().toString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'inactive'
          };
        }
      }
      
      onStrategyCreated(updatedStrategy);
      setShowFullPageChart(false);
      onClose();
    } catch (error) {
      console.error('Error in strategy save process:', error);
      setError(`Failed to ${editMode ? 'update' : 'save'} strategy: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResolutionChange = (newResolution) => {
    console.log('Resolution changed in chart to:', newResolution);
    setFormData(prev => ({ ...prev, timeframe: newResolution }));
  };

  const testWebhook = async () => {
    if (!validateWebhookUrl(formData.webhookUrl)) {
      setError('Please enter a valid webhook URL');
      return;
    }
    
    try {
      const testPayload = JSON.parse(formData.webhookPayload);
      await axios.post(formData.webhookUrl, testPayload);
      alert('Webhook test successful!');
    } catch (error) {
      if (error.name === 'SyntaxError') {
        setError('Invalid JSON in payload. Please check your JSON syntax.');
      } else {
        setError('Webhook test failed: ' + error.message);
      }
    }
  };

  const filteredContracts = contracts.filter(contract =>
    contract.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contract.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  
  if (!isOpen) return null;

  return (
    <div className="wizard-overlay">
      <motion.div 
        className="wizard-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
      >
        <div className="wizard-header">
          <h2>{editMode ? `Edit Strategy: ${strategy?.name || 'Loading...'}` : 'Create New Strategy'}</h2>
          <button className="close-button" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="wizard-progress">
          <div className={`progress-step ${currentStep >= 1 ? 'active' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-label">Strategy Type</div>
          </div>
          <div className={`progress-line ${currentStep >= 2 ? 'active' : ''}`}></div>
          <div className={`progress-step ${currentStep >= 2 ? 'active' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-label">Contract</div>
          </div>
          <div className={`progress-line ${currentStep >= 3 ? 'active' : ''}`}></div>
          <div className={`progress-step ${currentStep >= 3 ? 'active' : ''}`}>
            <div className="step-number">3</div>
            <div className="step-label">Configuration</div>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        <div className="wizard-content">
          <AnimatePresence mode="wait">
            {/* Step 1: Strategy Type Selection */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -100, opacity: 0 }}
                className="wizard-step"
              >
                <h3>Select Strategy Type</h3>
                <div className="strategy-type-grid">
                  {strategyTypes.map(type => (
                    <motion.div
                      key={type.id}
                      className={`strategy-type-card ${formData.strategyType === type.id ? 'selected' : ''}`}
                      onClick={() => handleStrategyTypeSelect(type.id)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <type.icon className="strategy-icon" />
                      <h4>{type.name}</h4>
                      <p>{type.description}</p>
                      {formData.strategyType === type.id && (
                        <FaCheckCircle className="selected-icon" />
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Contract Selection */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -100, opacity: 0 }}
                className="wizard-step"
              >
                <h3>Select Contract</h3>
                <div className="search-container">
                  <FaSearch className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search contracts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
                <div className="contracts-grid">
                  {filteredContracts.map(contract => (
                    <motion.div
                      key={contract.symbol}
                      className={`contract-card ${formData.contract?.symbol === contract.symbol ? 'selected' : ''}`}
                      onClick={() => handleContractSelect(contract)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="contract-symbol">{contract.symbol}</div>
                      <div className="contract-name">{contract.name}</div>
                      <div className="contract-exchange">{contract.exchange}</div>
                      <div className="contract-category">{contract.category}</div>
                      {formData.contract?.symbol === contract.symbol && (
                        <FaCheckCircle className="selected-icon" />
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 3: Strategy Configuration */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -100, opacity: 0 }}
                className="wizard-step configuration-step"
              >
                <h3>Configure Strategy</h3>
                
                <div className="config-section">
                  <label className="config-label">Strategy Name</label>
                  <input
                    type="text"
                    placeholder="Enter strategy name..."
                    value={formData.strategyName}
                    onChange={(e) => setFormData({ ...formData, strategyName: e.target.value })}
                    className="config-input"
                  />
                </div>

                <div className="config-section">
                  <label className="config-label">
                    <FaClock /> Timeframe
                  </label>
                  <select
                    value={formData.timeframe}
                    onChange={(e) => setFormData({ ...formData, timeframe: e.target.value })}
                    className="config-select"
                  >
                    <optgroup label="Ticks">
                      {timeframes.filter(tf => tf.group === 'Ticks').map(tf => (
                        <option key={tf.value} value={tf.value}>{tf.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Seconds">
                      {timeframes.filter(tf => tf.group === 'Seconds').map(tf => (
                        <option key={tf.value} value={tf.value}>{tf.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Minutes">
                      {timeframes.filter(tf => tf.group === 'Minutes').map(tf => (
                        <option key={tf.value} value={tf.value}>{tf.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Extended">
                      {timeframes.filter(tf => tf.group === 'Extended').map(tf => (
                        <option key={tf.value} value={tf.value}>{tf.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Brick Size field - only for Renko strategies */}
                {formData.strategyType === 'renko' && (
                  <div className="config-section">
                    <label className="config-label">
                      <FaCubes /> Brick Size
                    </label>
                    <p className="config-description">
                      The fixed price movement required to create a new Renko brick.
                    </p>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.25"
                      value={formData.brickSize}
                      onChange={(e) => setFormData({ ...formData, brickSize: e.target.value })}
                      className="config-input"
                    />
                    <div className="payload-help">
                      <small>
                        <strong>Examples:</strong> For ES: 0.25, 0.5, 1.0 | For NQ: 0.25, 0.5, 1.0 | For Gold: 0.10, 0.50
                      </small>
                    </div>
                  </div>
                )}

                <div className="config-section">
                  <label className="config-label">Strategy Payload (JSON)</label>
                  <p className="config-description">
                    Configure the JSON payload that will be sent when the strategy triggers.
                  </p>
                  <textarea
                    value={formData.webhookPayload}
                    onChange={(e) => setFormData({ ...formData, webhookPayload: e.target.value })}
                    className="config-textarea payload-textarea"
                    rows="12"
                    placeholder="Enter your JSON payload here..."
                  />
                  <div className="payload-help">
                    <small>
                      <strong>Default template includes:</strong> accountName, action, orderType, symbol, qty, trailingOffset, closeExistingOrders, tradeTimeRanges, avoidTradeTimeRanges
                    </small>
                  </div>
                </div>

                <div className="config-section">
                  <label className="config-label">
                    <FaLink /> Webhook URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://your-webhook-url.com/endpoint"
                    value={formData.webhookUrl}
                    onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                    className="config-input"
                  />
                  {formData.webhookUrl && (
                    <button className="test-webhook-btn" onClick={testWebhook}>
                      Test Webhook
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="wizard-footer">
          {currentStep > 1 && (
            <button className="wizard-btn back-btn" onClick={handleBack}>
              <FaArrowLeft /> Back
            </button>
          )}
          {currentStep < 3 ? (
            <button className="wizard-btn next-btn" onClick={handleNext}>
              Next <FaArrowRight />
            </button>
          ) : (
            <button className="wizard-btn chart-btn" onClick={handleNext}>
              <FaChartLine /> {editMode ? 'Edit Chart' : 'View Chart'}
            </button>
          )}
        </div>
      </motion.div>

      {/* Trading Chart Component */}
      <TradingChart
        isOpen={showFullPageChart}
        onClose={() => setShowFullPageChart(false)}
        onSave={handleSaveStrategy}
        onResolutionChange={handleResolutionChange}
        productId={formData.contractProductId}
        resolution={formData.timeframe}
        strategyType={formData.strategyType}
        strategyName={formData.strategyName}
        contractInfo={formData.contract}
        fullscreen={true}
        // Strategy-specific settings
        strategyBrickSize={formData.brickSize}
        strategyConfig={editMode && strategy?.chart_config ? strategy.chart_config : null}
        editMode={editMode}
      />
    </div>
  );
};

export default StrategyCreationWizard;