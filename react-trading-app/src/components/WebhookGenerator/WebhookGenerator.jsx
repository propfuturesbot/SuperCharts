import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FaLink, 
  FaPlay, 
  FaStop, 
  FaCopy, 
  FaExclamationTriangle,
  FaInfoCircle,
  FaCode,
  FaDownload,
  FaExternalLinkAlt
} from 'react-icons/fa';
import Layout from '../Layout/Layout';
import { useAuth } from '../../contexts/AuthContext';
import './WebhookGenerator.css';

const WebhookGenerator = () => {
  const { user } = useAuth();

  // Dashboard URL Generator State
  const [dashboardUrl, setDashboardUrl] = useState('');
  const [tunnelActive, setTunnelActive] = useState(false);
  const [tunnelStatus, setTunnelStatus] = useState('inactive');
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);

  // Webhook Configuration State
  const [orderType, setOrderType] = useState('Market Order');
  const [accounts, setAccounts] = useState([]);
  const [accountName, setAccountName] = useState('');
  const [symbol, setSymbol] = useState('{{ticker}}');
  const [action, setAction] = useState('Buy');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('21160');
  const [stopPrice, setStopPrice] = useState('20');
  const [takeProfitPrice, setTakeProfitPrice] = useState('20');
  const [closeExistingOrders, setCloseExistingOrders] = useState(false);
  const [enableBreakEvenStop, setEnableBreakEvenStop] = useState(false);

  // Generated payload state
  const [generatedPayload, setGeneratedPayload] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');

  const orderTypes = [
    'Market Order',
    'Limit Order',
    'Stop Loss UI',
    'Trailing Stop Order',
    'Bracket UI',
    'Close Position',
    'Reverse Position',
    'Flatten All Positions'
  ];

  const actions = ['Buy', 'Sell'];

  // Load accounts and saved webhook URL on mount
  useEffect(() => {
    loadAccounts();
    loadSavedWebhookUrl();
  }, []);

  useEffect(() => {
    generateWebhookUrl();
  }, [dashboardUrl, orderType]);

  // Filter accounts based on balance criteria
  const shouldShowAccount = (account) => {
    if (!account || account.id === '8734161') {
      return false;
    }

    const accountNameStr = account.name || '';
    const balance = parseFloat(account.balance) || 0;

    // Apply balance filtering based on account name prefixes
    if (accountNameStr.startsWith('100')) {
      return balance >= 97000;
    } else if (accountNameStr.startsWith('150K')) {
      return balance >= 145500;
    } else if (accountNameStr.startsWith('50')) {
      return balance >= 48000;
    }

    // For accounts that don't match the specified prefixes, show them (no filtering)
    return true;
  };

  // Load accounts from backend
  const loadAccounts = async () => {
    try {
      const response = await fetch('/api/accounts/file');
      const data = await response.json();

      if (data.success && data.data && data.data.accounts) {
        const filteredAccounts = data.data.accounts.filter(shouldShowAccount);
        setAccounts(filteredAccounts);

        // Set first account as default
        if (filteredAccounts.length > 0) {
          setAccountName(filteredAccounts[0].name);
        }
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  // Load saved webhook URL from backend
  const loadSavedWebhookUrl = async () => {
    try {
      const response = await fetch('/api/get-webhook-url');
      const data = await response.json();

      if (data.success) {
        if (data.url) {
          setDashboardUrl(data.url);
        }
        // Backend now returns actual process state
        setTunnelActive(data.active || false);
        setTunnelStatus(data.active ? 'active' : 'inactive');
      }
    } catch (error) {
      console.error('Error loading saved webhook URL:', error);
    }
  };

  const generateWebhookUrl = () => {
    if (dashboardUrl) {
      const baseUrl = dashboardUrl.replace(/\/$/, '');
      let endpoint = '';

      // Map order types to simplified webhook endpoints
      switch (orderType) {
        case 'Close Position':
          endpoint = '/webhook/close';
          break;
        case 'Reverse Position':
          endpoint = '/webhook/reverse';
          break;
        case 'Flatten All Positions':
          endpoint = '/webhook/flatten';
          break;
        default:
          // All order types use the unified endpoint
          endpoint = '/webhook/order';
      }

      setWebhookUrl(`${baseUrl}${endpoint}`);
    }
  };

  const generatePayload = () => {
    let payload = {};

    // Extract just the account name without balance
    const cleanAccountName = accountName.split(' ($')[0];

    // Build payload based on order type
    switch (orderType) {
      case 'Flatten All Positions':
        payload = {
          accountName: cleanAccountName
        };
        break;

      case 'Close Position':
      case 'Reverse Position':
        payload = {
          accountName: cleanAccountName,
          symbol: symbol
        };
        break;

      default:
        // Standard order payload with orderType field
        payload = {
          orderType: orderType === 'Market Order' ? 'MARKET' :
                     orderType === 'Limit Order' ? 'LIMIT' :
                     orderType === 'Stop Loss UI' ? 'STOP_LOSS' :
                     orderType === 'Trailing Stop Order' ? 'TRAILING_STOP' :
                     orderType === 'Bracket UI' ? 'BRACKET' : 'MARKET',
          accountName: cleanAccountName,
          symbol: symbol,
          action: action.toUpperCase(),
          quantity: parseInt(quantity) || 1
        };

        // Add order-type specific fields
        if (orderType === 'Limit Order') {
          payload.limitPrice = parseFloat(limitPrice);
        }

        if (orderType === 'Stop Loss UI') {
          payload.stopLossPoints = parseFloat(stopPrice);
        }

        if (orderType === 'Bracket UI') {
          payload.stopLossPoints = parseFloat(stopPrice);
          payload.takeProfitPoints = parseFloat(takeProfitPrice);
        }

        if (orderType === 'Trailing Stop Order') {
          payload.trailDistancePoints = parseFloat(stopPrice);
        }

        // Add advanced options
        if (closeExistingOrders) {
          payload.closeExistingOrders = true;
        }

        if (enableBreakEvenStop) {
          payload.enableBreakEvenStop = true;
        }
        break;
    }

    setGeneratedPayload(JSON.stringify(payload, null, 2));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!', 'success');
  };

  const showToast = (message, type = 'info') => {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} show`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  };

  const startTunnel = async () => {
    try {
      setIsStartingTunnel(true);
      showToast('Starting tunnel...', 'info');

      const response = await fetch('/api/start-tunnel', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success && data.url) {
        setDashboardUrl(data.url);
        setTunnelActive(true);
        setTunnelStatus('active');
        showToast('Tunnel started successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to start tunnel', 'error');
      }
    } catch (error) {
      console.error('Error starting tunnel:', error);
      showToast('Error starting tunnel: ' + error.message, 'error');
    } finally {
      setIsStartingTunnel(false);
    }
  };

  const stopTunnel = async () => {
    try {
      const response = await fetch('/api/stop-tunnel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('Server returned non-JSON response');
      }

      const data = await response.json();

      if (data.success) {
        setTunnelActive(false);
        setTunnelStatus('inactive');
        showToast('Tunnel stopped successfully', 'info');
      } else {
        showToast(data.message || 'Failed to stop tunnel', 'error');
      }
    } catch (error) {
      console.error('Error stopping tunnel:', error);
      showToast('Error stopping tunnel: ' + error.message, 'error');
    }
  };

  const killCloudflared = async () => {
    try {
      const response = await fetch('/api/kill-cloudflared', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('Server returned non-JSON response');
      }

      const data = await response.json();

      if (data.success) {
        setTunnelActive(false);
        setTunnelStatus('inactive');
        setDashboardUrl('');
        showToast('All cloudflared processes killed', 'success');
      } else {
        showToast(data.error || 'Failed to kill cloudflared', 'error');
      }
    } catch (error) {
      console.error('Error killing cloudflared:', error);
      showToast('Error: ' + error.message, 'error');
    }
  };

  const renderOrderTypeFields = () => {
    switch (orderType) {
      case 'Limit Order':
        return (
          <div className="form-row">
            <div className="form-field">
              <label>LIMIT PRICE</label>
              <input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="form-input"
              />
            </div>
          </div>
        );
      
      case 'Stop Loss UI':
        return (
          <div className="form-row">
            <div className="form-field">
              <label>STOP PRICE (POINTS)</label>
              <input
                type="number"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                className="form-input"
              />
            </div>
          </div>
        );
      
      case 'Bracket UI':
        return (
          <>
            <div className="form-row">
              <div className="form-field">
                <label>STOP PRICE (POINTS)</label>
                <input
                  type="number"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>TAKE PROFIT (POINTS)</label>
                <input
                  type="number"
                  value={takeProfitPrice}
                  onChange={(e) => setTakeProfitPrice(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>
          </>
        );
      
      case 'Trailing Stop Order':
        return (
          <div className="form-row">
            <div className="form-field">
              <label>TRAILING OFFSET (POINTS)</label>
              <input
                type="number"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                className="form-input"
              />
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="webhook-generator-container">
        <div className="webhook-header">
          <motion.h1 
            className="page-title"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <FaLink className="title-icon" />
            Webhook Generator
          </motion.h1>
          <p className="page-subtitle">
            Generate secure webhook URLs and configure TradingView alerts for automated trading
          </p>
        </div>

        <div className="webhook-content">
          {/* Left Card - Dashboard URL Generator */}
          <motion.div 
            className="webhook-card left-card"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="card-header">
              <div className="card-icon">
                <FaLink />
              </div>
              <div className="card-title-section">
                <h2>Dashboard Tunnel</h2>
                <p>Secure external access control</p>
              </div>
            </div>

            <div className="card-content">
              <div className="status-indicator">
                <div className={`status-dot ${tunnelActive ? 'active' : 'inactive'}`}></div>
                <span className="status-text">
                  Tunnel Status: {tunnelActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="tunnel-warning">
                <FaExclamationTriangle className="warning-icon" />
                <div className="warning-text">
                  <strong>IMPORTANT:</strong> Regenerate tunnel URL after system restart
                </div>
              </div>

              <div className="control-section">
                <div className="tunnel-controls">
                  <button 
                    className={`control-btn primary ${tunnelActive ? 'stop' : 'start'}`}
                    onClick={tunnelActive ? stopTunnel : startTunnel}
                  >
                    {tunnelActive ? (
                      <>
                        <FaStop /> Stop Tunnel
                      </>
                    ) : (
                      <>
                        <FaPlay /> Start Tunnel
                      </>
                    )}
                  </button>
                  
                  <button className="control-btn danger" onClick={killCloudflared}>
                    <FaStop /> Kill Switch
                  </button>
                </div>

                <div className="url-display">
                  <label>Dashboard URL</label>
                  <div className="url-container">
                    <div className="url-text">{dashboardUrl}</div>
                    <button 
                      className="copy-btn"
                      onClick={() => copyToClipboard(dashboardUrl)}
                      title="Copy URL"
                    >
                      <FaCopy />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Card - Webhook Configuration */}
          <motion.div 
            className="webhook-card right-card"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="card-header">
              <div className="card-icon">
                <FaCode />
              </div>
              <div className="card-title-section">
                <h2>Webhook Builder</h2>
                <p>TradingView alert configuration</p>
              </div>
            </div>

            <div className="card-content">
              <div className="config-note">
                <FaInfoCircle className="note-icon" />
                Configure order parameters and generate webhook payload
              </div>

            <div className="webhook-form">
              <div className="form-row">
                <div className="form-field full-width">
                  <label>ORDER TYPE</label>
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                    className="form-select"
                  >
                    {orderTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>ACCOUNT NAME</label>
                  <select
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="form-select"
                  >
                    {accounts.length === 0 ? (
                      <option value="">Loading accounts...</option>
                    ) : (
                      accounts.map(account => (
                        <option key={account.id} value={account.name}>
                          {account.name} (${parseFloat(account.balance).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="form-field">
                  <label>SYMBOL</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="form-input"
                    placeholder="{{ticker}}"
                  />
                  <div className="field-hint">Use for dynamic symbol from TradingView</div>
                </div>
              </div>

              {(orderType !== 'Close Position' && orderType !== 'Reverse Position' && orderType !== 'Flatten All Positions') && (
                <div className="form-row">
                  <div className="form-field">
                    <label>ACTION</label>
                    <select
                      value={action}
                      onChange={(e) => setAction(e.target.value)}
                      className="form-select"
                    >
                      {actions.map(act => (
                        <option key={act} value={act}>{act}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>QUANTITY</label>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="form-input"
                      min="1"
                    />
                  </div>
                </div>
              )}

              {renderOrderTypeFields()}

              <div className="advanced-options">
                <h3>Advanced Options</h3>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={closeExistingOrders}
                      onChange={(e) => setCloseExistingOrders(e.target.checked)}
                    />
                    <span className="checkmark"></span>
                    CLOSE EXISTING ORDERS
                  </label>
                  
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={enableBreakEvenStop}
                      onChange={(e) => setEnableBreakEvenStop(e.target.checked)}
                    />
                    <span className="checkmark"></span>
                    ENABLE BREAK-EVEN STOP
                  </label>
                </div>
              </div>

              <button className="generate-btn" onClick={generatePayload}>
                <FaCode /> GENERATE PAYLOAD
              </button>
            </div>

              {/* Generated Results */}
              {generatedPayload && (
                <div className="results-section">
                  <div className="result-item">
                    <label>Webhook URL</label>
                    <div className="result-value">
                      <code>{webhookUrl}</code>
                      <button 
                        className="copy-btn"
                        onClick={() => copyToClipboard(webhookUrl)}
                        title="Copy URL"
                      >
                        <FaCopy />
                      </button>
                    </div>
                  </div>

                  <div className="result-item">
                    <label>JSON Payload</label>
                    <div className="result-value">
                      <pre className="payload-code">{generatedPayload}</pre>
                      <button 
                        className="copy-btn"
                        onClick={() => copyToClipboard(generatedPayload)}
                        title="Copy Payload"
                      >
                        <FaCopy />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Usage Instructions - Full Width Below Cards */}
        <motion.div 
          className="usage-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div className="usage-header">
            <FaInfoCircle className="usage-icon" />
            <h3>Quick Setup Guide</h3>
          </div>
          <div className="usage-grid">
            <div className="usage-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h4>Start Tunnel</h4>
                <p>Activate the dashboard tunnel for external access</p>
              </div>
            </div>
            <div className="usage-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h4>Configure Order</h4>
                <p>Set order type, symbol, and trading parameters</p>
              </div>
            </div>
            <div className="usage-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h4>Generate Payload</h4>
                <p>Create webhook URL and JSON payload</p>
              </div>
            </div>
            <div className="usage-step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h4>Setup TradingView</h4>
                <p>Copy URL and payload to your TradingView alerts</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default WebhookGenerator;
