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
  const [dashboardUrl, setDashboardUrl] = useState('https://administration-storage-battery-synopsis.trycloudflare.com');
  const [tunnelActive, setTunnelActive] = useState(false);
  const [tunnelStatus, setTunnelStatus] = useState('inactive');

  // Webhook Configuration State
  const [orderType, setOrderType] = useState('Market Order');
  const [accountName, setAccountName] = useState('150KTC-V2-111791-89166097 ($155,519.48)');
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

  useEffect(() => {
    generateWebhookUrl();
  }, [dashboardUrl, orderType]);

  const generateWebhookUrl = () => {
    if (dashboardUrl) {
      const baseUrl = dashboardUrl.replace(/\/$/, '');
      const endpoint = `/webhook/${orderType.toLowerCase().replace(/\s+/g, '-')}`;
      setWebhookUrl(`${baseUrl}${endpoint}`);
    }
  };

  const generatePayload = () => {
    const payload = {
      orderType,
      account: {
        name: accountName,
        id: accountName.split(' ')[0]
      },
      symbol,
      action,
      quantity: parseInt(quantity),
      ...(orderType === 'Limit Order' && { limitPrice: parseFloat(limitPrice) }),
      ...(orderType === 'Stop Loss UI' && { stopPrice: parseFloat(stopPrice) }),
      ...(orderType === 'Bracket UI' && { 
        stopPrice: parseFloat(stopPrice),
        takeProfitPrice: parseFloat(takeProfitPrice)
      }),
      ...(orderType === 'Trailing Stop Order' && { trailingOffset: parseFloat(stopPrice) }),
      options: {
        closeExistingOrders,
        enableBreakEvenStop
      },
      timestamp: new Date().toISOString()
    };

    setGeneratedPayload(JSON.stringify(payload, null, 2));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  const startTunnel = () => {
    setTunnelActive(true);
    setTunnelStatus('active');
    // In a real implementation, this would start the actual tunnel
  };

  const stopTunnel = () => {
    setTunnelActive(false);
    setTunnelStatus('inactive');
    // In a real implementation, this would stop the tunnel
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
                  
                  <button className="control-btn danger">
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
                    <option value="150KTC-V2-111791-89166097 ($155,519.48)">
                      150KTC-V2-111791-89166097 ($155,519.48)
                    </option>
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
