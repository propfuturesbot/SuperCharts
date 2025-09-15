import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaChevronDown, FaChartLine, FaCog, FaTimes } from 'react-icons/fa';
import './StrategySelector.css';

const StrategySelector = ({
  selectedStrategy,
  onStrategyChange,
  onConfigOpen,
  strategies
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStrategySelect = (strategy) => {
    onStrategyChange(strategy);
    setIsOpen(false);
  };

  return (
    <div className="strategy-selector" ref={dropdownRef}>
      <div className="strategy-selector-wrapper">
        <button
          className="strategy-selector-trigger"
          onClick={() => setIsOpen(!isOpen)}
        >
          <FaChartLine className="strategy-icon" />
          <span className="strategy-label">
            {selectedStrategy ? selectedStrategy.displayName : 'Select Strategy'}
          </span>
          <FaChevronDown className={`chevron-icon ${isOpen ? 'open' : ''}`} />
        </button>

        {selectedStrategy && (
          <div className="strategy-action-buttons">
            <button
              className="strategy-config-btn"
              onClick={onConfigOpen}
              title="Configure Strategy"
            >
              <FaCog />
            </button>
            <button
              className="strategy-remove-btn"
              onClick={() => onStrategyChange(null)}
              title="Remove Strategy"
            >
              <FaTimes />
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="strategy-dropdown"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="strategy-dropdown-header">
              <span>Trading Strategies</span>
            </div>

            <div className="strategy-list">
              <div
                className="strategy-option no-strategy"
                onClick={() => handleStrategySelect(null)}
              >
                <span>None</span>
              </div>

              <div className="strategy-category">
                <div className="category-label">Volatility</div>
                {strategies.volatility.map(strategy => (
                  <div
                    key={strategy.id}
                    className={`strategy-option ${selectedStrategy?.id === strategy.id ? 'selected' : ''}`}
                    onClick={() => handleStrategySelect(strategy)}
                  >
                    <span className="strategy-name">{strategy.displayName}</span>
                    {selectedStrategy?.id === strategy.id && (
                      <button
                        className="config-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOpen(false);
                          onConfigOpen();
                        }}
                      >
                        <FaCog />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="strategy-category">
                <div className="category-label">Momentum</div>
                {strategies.momentum.map(strategy => (
                  <div
                    key={strategy.id}
                    className={`strategy-option ${selectedStrategy?.id === strategy.id ? 'selected' : ''}`}
                    onClick={() => handleStrategySelect(strategy)}
                  >
                    <span className="strategy-name">{strategy.displayName}</span>
                    {selectedStrategy?.id === strategy.id && (
                      <button
                        className="config-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOpen(false);
                          onConfigOpen();
                        }}
                      >
                        <FaCog />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="strategy-category">
                <div className="category-label">Trend</div>
                {strategies.trend.map(strategy => (
                  <div
                    key={strategy.id}
                    className={`strategy-option ${selectedStrategy?.id === strategy.id ? 'selected' : ''}`}
                    onClick={() => handleStrategySelect(strategy)}
                  >
                    <span className="strategy-name">{strategy.displayName}</span>
                    {selectedStrategy?.id === strategy.id && (
                      <button
                        className="config-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOpen(false);
                          onConfigOpen();
                        }}
                      >
                        <FaCog />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="strategy-category">
                <div className="category-label">Volume</div>
                {strategies.volume.map(strategy => (
                  <div
                    key={strategy.id}
                    className={`strategy-option ${selectedStrategy?.id === strategy.id ? 'selected' : ''}`}
                    onClick={() => handleStrategySelect(strategy)}
                  >
                    <span className="strategy-name">{strategy.displayName}</span>
                    {selectedStrategy?.id === strategy.id && (
                      <button
                        className="config-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOpen(false);
                          onConfigOpen();
                        }}
                      >
                        <FaCog />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StrategySelector;