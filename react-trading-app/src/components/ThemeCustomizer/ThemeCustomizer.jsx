import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPalette, FaTimes, FaRedo, FaKeyboard, FaMagic } from 'react-icons/fa';
import { useTheme } from '../../contexts/ThemeContext';
import './ThemeCustomizer.css';

const ThemeCustomizer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState('#00d4ff');
  const { 
    primaryColor, 
    predefinedColors, 
    isDynamicMode, 
    currentColorIndex, 
    changeThemeColor, 
    toggleDynamicMode, 
    resetToDefault 
  } = useTheme();

  // Keyboard shortcut to reset to original (Ctrl/Cmd + R + T)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        resetToDefault();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [resetToDefault]);

  const handleCustomColorChange = (e) => {
    const color = e.target.value;
    setCustomColor(color);
    changeThemeColor(color);
  };

  const handlePredefinedColor = (color) => {
    setCustomColor(color.value);
    changeThemeColor(color.value);
  };

  return (
    <>
      {/* Theme Toggle Button */}
      <motion.button
        className="theme-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        animate={{ rotate: isOpen ? 180 : 0 }}
        style={{ backgroundColor: `var(--primary-color-20)`, borderColor: 'var(--primary-color)' }}
      >
        <FaPalette />
      </motion.button>

      {/* Theme Customizer Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="theme-customizer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              className="theme-customizer-panel"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="theme-customizer-header">
                <h3 className="theme-title">
                  <FaPalette /> Theme Customizer
                </h3>
                <button
                  className="theme-close-btn"
                  onClick={() => setIsOpen(false)}
                >
                  <FaTimes />
                </button>
              </div>

              <div className="theme-customizer-content">
                {/* Current Color Display */}
                <div className="current-color-section">
                  <label className="section-label">Current Theme Color</label>
                  <div className="current-color-display">
                    <div 
                      className="current-color-preview"
                      style={{ backgroundColor: primaryColor }}
                    ></div>
                    <span className="current-color-value">{primaryColor.toUpperCase()}</span>
                  </div>
                </div>

                {/* Custom Color Picker */}
                <div className="custom-color-section">
                  <label className="section-label">Custom Color Picker</label>
                  <div className="custom-color-input-wrapper">
                    <input
                      type="color"
                      value={customColor}
                      onChange={handleCustomColorChange}
                      className="custom-color-input"
                      disabled={isDynamicMode}
                    />
                    <span className="custom-color-label">
                      {isDynamicMode ? 'Disabled in Dynamic Mode' : 'Pick Any Color'}
                    </span>
                  </div>
                </div>

                {/* Dynamic Mode Section */}
                <div className="dynamic-mode-section">
                  <label className="section-label">Dynamic Color Mode</label>
                  <div className="dynamic-mode-controls">
                    <motion.button
                      className={`dynamic-mode-btn ${isDynamicMode ? 'active' : ''}`}
                      onClick={toggleDynamicMode}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <FaMagic />
                      {isDynamicMode ? 'Stop Dynamic Mode' : 'Start Dynamic Mode'}
                    </motion.button>
                    
                    {isDynamicMode && (
                      <div className="dynamic-mode-info">
                        <div className="dynamic-status">
                          <span className="dynamic-indicator">🎨</span>
                          <span>Colors changing every 15 seconds</span>
                        </div>
                        <div className="current-cycle">
                          Current: {predefinedColors[currentColorIndex]?.name || 'Cyber Blue'}
                        </div>
                      </div>
                    )}
                  </div>
                  <small className="dynamic-mode-description">
                    Automatically cycles through all preset colors every 15 seconds
                  </small>
                </div>

                {/* Predefined Colors */}
                <div className="predefined-colors-section">
                  <label className="section-label">Preset Colors</label>
                  <div className="predefined-colors-grid">
                    {predefinedColors.map((color, index) => (
                      <motion.button
                        key={color.value}
                        className={`predefined-color-btn ${primaryColor === color.value ? 'active' : ''} ${isDynamicMode ? 'disabled' : ''}`}
                        style={{ backgroundColor: color.value }}
                        onClick={() => handlePredefinedColor(color)}
                        whileHover={{ scale: isDynamicMode ? 1 : 1.1 }}
                        whileTap={{ scale: isDynamicMode ? 1 : 0.9 }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                        title={isDynamicMode ? 'Disabled in Dynamic Mode' : color.name}
                        disabled={isDynamicMode}
                      >
                        <span className="color-name">{color.name}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Reset Buttons */}
                <div className="reset-section">
                  <motion.button
                    className="reset-theme-btn primary-reset"
                    onClick={resetToDefault}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <FaRedo /> Reset to Original (Cyber Blue)
                  </motion.button>
                  
                  <div className="reset-info">
                    <small>This will restore the original cyber blue theme (#00d4ff)</small>
                    <div className="keyboard-shortcut">
                      <FaKeyboard /> <strong>Ctrl+Shift+R</strong> (Quick Reset)
                    </div>
                  </div>
                </div>

                {/* Preview Text */}
                <div className="preview-section">
                  <label className="section-label">Live Preview</label>
                  <div className="preview-elements">
                    <div className="preview-button" style={{ 
                      backgroundColor: 'var(--primary-color-20)', 
                      borderColor: 'var(--primary-color)',
                      color: 'var(--primary-color)'
                    }}>
                      Sample Button
                    </div>
                    <div className="preview-text" style={{ color: 'var(--primary-color)' }}>
                      Sample Text with Current Theme
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ThemeCustomizer;