import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaInfoCircle, FaSave, FaUndo } from 'react-icons/fa';
import './StrategyConfigPanel.css';

const StrategyConfigPanel = ({
  isOpen,
  onClose,
  strategy,
  config,
  onConfigChange,
  onApply
}) => {
  const [localConfig, setLocalConfig] = useState(config || {});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalConfig(config || {});
    setHasChanges(false);
  }, [config, strategy]);

  const handleInputChange = (paramKey, value) => {
    const newConfig = { ...localConfig, [paramKey]: value };
    setLocalConfig(newConfig);
    setHasChanges(true);
  };

  const handleApply = () => {
    onConfigChange(localConfig);
    onApply(localConfig);
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalConfig(config || {});
    setHasChanges(false);
  };

  if (!strategy) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="strategy-config-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="strategy-config-panel"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="config-panel-header">
              <h3>{strategy.displayName} Settings</h3>
              <button className="close-button" onClick={onClose}>
                <FaTimes />
              </button>
            </div>

            <div className="config-panel-content">
              {strategy.description && (
                <div className="strategy-description">
                  <FaInfoCircle className="info-icon" />
                  <p>{strategy.description}</p>
                </div>
              )}

              <div className="config-parameters">
                {strategy.parameters.map((param) => (
                  <div key={param.key} className="parameter-group">
                    <label className="parameter-label">
                      {param.label}
                      {param.tooltip && (
                        <span className="parameter-tooltip" title={param.tooltip}>
                          <FaInfoCircle />
                        </span>
                      )}
                    </label>

                    {param.type === 'number' && (
                      <div className="parameter-input-group">
                        <input
                          type="number"
                          className="parameter-input"
                          value={localConfig[param.key] ?? param.defaultValue}
                          min={param.min}
                          max={param.max}
                          step={param.step || 1}
                          onChange={(e) => handleInputChange(param.key, parseFloat(e.target.value))}
                        />
                        {param.showSlider && (
                          <input
                            type="range"
                            className="parameter-slider"
                            value={localConfig[param.key] ?? param.defaultValue}
                            min={param.min}
                            max={param.max}
                            step={param.step || 1}
                            onChange={(e) => handleInputChange(param.key, parseFloat(e.target.value))}
                          />
                        )}
                      </div>
                    )}

                    {param.type === 'select' && (
                      <select
                        className="parameter-select"
                        value={localConfig[param.key] ?? param.defaultValue}
                        onChange={(e) => handleInputChange(param.key, e.target.value)}
                      >
                        {param.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {param.type === 'boolean' && (
                      <label className="parameter-switch">
                        <input
                          type="checkbox"
                          checked={localConfig[param.key] ?? param.defaultValue}
                          onChange={(e) => handleInputChange(param.key, e.target.checked)}
                        />
                        <span className="switch-slider"></span>
                      </label>
                    )}

                    {param.type === 'color' && (
                      <div className="parameter-color-group">
                        <input
                          type="color"
                          className="parameter-color-input"
                          value={localConfig[param.key] ?? param.defaultValue}
                          onChange={(e) => handleInputChange(param.key, e.target.value)}
                        />
                        <input
                          type="text"
                          className="parameter-color-text"
                          value={localConfig[param.key] ?? param.defaultValue}
                          onChange={(e) => handleInputChange(param.key, e.target.value)}
                          placeholder="#000000"
                        />
                      </div>
                    )}

                    {param.description && (
                      <span className="parameter-description">{param.description}</span>
                    )}
                  </div>
                ))}
              </div>

              {strategy.signals && (
                <div className="strategy-signals">
                  <h4>Trading Signals</h4>
                  <div className="signals-list">
                    {strategy.signals.buy && (
                      <div className="signal-item buy-signal">
                        <span className="signal-indicator"></span>
                        <span className="signal-label">Buy Signal:</span>
                        <span className="signal-description">{strategy.signals.buy}</span>
                      </div>
                    )}
                    {strategy.signals.sell && (
                      <div className="signal-item sell-signal">
                        <span className="signal-indicator"></span>
                        <span className="signal-label">Sell Signal:</span>
                        <span className="signal-description">{strategy.signals.sell}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="config-panel-footer">
              <button
                className="config-button reset-button"
                onClick={handleReset}
                disabled={!hasChanges}
              >
                <FaUndo /> Reset
              </button>
              <button
                className="config-button apply-button"
                onClick={handleApply}
                disabled={!hasChanges}
              >
                <FaSave /> Apply Changes
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StrategyConfigPanel;