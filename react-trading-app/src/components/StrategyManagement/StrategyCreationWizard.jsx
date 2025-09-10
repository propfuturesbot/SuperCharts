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
import './StrategyCreationWizard.css';

const StrategyCreationWizard = ({ isOpen, onClose, onStrategyCreated }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    strategyType: '',
    contract: null,
    strategyName: '',
    timeframe: '5m',
    webhookUrl: '',
    webhookPayload: '{\n  "accountName": "",\n  "action": "buy",\n  "orderType": "",\n  "symbol": "",\n  "qty": 5,\n  "trailingOffset": null,\n  "closeExistingOrders": "N",\n  "tradeTimeRanges": [],\n  "avoidTradeTimeRanges": []\n}'
  });
  
  const [contracts, setContracts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    { value: '1m', label: '1 Minute' },
    { value: '5m', label: '5 Minutes' },
    { value: '15m', label: '15 Minutes' },
    { value: '30m', label: '30 Minutes' },
    { value: '1h', label: '1 Hour' },
    { value: '4h', label: '4 Hours' },
    { value: '1d', label: '1 Day' },
    { value: '1w', label: '1 Week' }
  ];

  useEffect(() => {
    fetchContracts();
  }, []);

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

  const handleContractSelect = (contract) => {
    setFormData({ ...formData, contract });
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

  const handleSaveStrategy = async () => {
    // Validation
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

    setLoading(true);
    setError('');

    const strategyData = {
      name: formData.strategyName,
      strategy_type: formData.strategyType,
      contract_symbol: formData.contract.symbol,
      contract_name: formData.contract.name,
      timeframe: formData.timeframe,
      webhook_url: formData.webhookUrl || null,
      webhook_payload: JSON.parse(formData.webhookPayload)
    };

    try {
      const response = await axios.post('http://localhost:8000/api/strategies', strategyData);
      // Create a complete strategy object for the frontend
      const newStrategy = {
        ...strategyData,
        id: response.data.id,
        status: 'inactive',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      onStrategyCreated(newStrategy);
      onClose();
    } catch (error) {
      console.error('Error saving strategy:', error);
      setError(error.response?.data?.message || 'Failed to save strategy');
    } finally {
      setLoading(false);
    }
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
          <h2>Create New Strategy</h2>
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
                    {timeframes.map(tf => (
                      <option key={tf.value} value={tf.value}>{tf.label}</option>
                    ))}
                  </select>
                </div>

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
            <button 
              className="wizard-btn save-btn" 
              onClick={handleSaveStrategy}
              disabled={loading}
            >
              {loading ? 'Saving...' : <><FaSave /> Save Strategy</>}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default StrategyCreationWizard;