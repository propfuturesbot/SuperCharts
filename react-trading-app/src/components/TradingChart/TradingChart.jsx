import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaChartLine, FaChartBar, FaCubes, FaSave, FaArrowLeft, FaSpinner } from 'react-icons/fa';

// Configuration and utilities
import { getChartOptions, getCandlestickSeriesOptions, CHART_TYPES, DEFAULT_SETTINGS } from './utils/chartConfig';
import { resolutionConfig, getGroupedResolutions, getTicksPerBar } from './utils/resolutionConfig';
import { convertSymbolToDisplay, normalizeContractInfo } from './utils/symbolConverter';
import { transformDataForChartType, accumulateTickData, mergeRealtimeUpdate } from './utils/dataProcessor';

// Chart type implementations
import { calculateHeikenAshi, updateHeikenAshiRealtime } from './chartTypes/heikenAshi';
import { convertToRenko, updateRenkoRealtime, initializeRenkoState } from './chartTypes/renko';

// Services
import { fetchHistoricalData, isAuthenticated } from './services/historicalData';
import realtimeConnection from './services/realtimeConnection';

// Strategy components
import StrategyManager from './strategies/StrategyManager';

// Styles
import './TradingChart.css';

const TradingChart = ({ 
  isOpen = true,
  onClose,
  onSave,
  onResolutionChange,
  productId,
  resolution = '15',
  strategyType,
  strategyName,
  contractInfo,
  fullscreen = false,
  // Strategy-specific settings
  strategyBrickSize,
  strategyConfig,
  editMode = false
}) => {
  // Chart references
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  
  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  
  // Chart settings
  const [chartType, setChartType] = useState(DEFAULT_SETTINGS.chartType);
  const [currentResolution, setCurrentResolution] = useState(resolution);
  const [brickSize, setBrickSize] = useState(DEFAULT_SETTINGS.brickSize);
  const [brickSizeInput, setBrickSizeInput] = useState(DEFAULT_SETTINGS.brickSize.toString());
  const [userChangedResolution, setUserChangedResolution] = useState(false);
  
  // Data state
  const [rawData, setRawData] = useState([]);
  const [displayData, setDisplayData] = useState([]);
  const [heikenAshiData, setHeikenAshiData] = useState([]);
  const [renkoData, setRenkoData] = useState([]);
  
  // Renko state
  const [renkoState, setRenkoState] = useState({
    lastBrickHigh: null,
    lastBrickLow: null,
    direction: 1,
    lastTimestamp: null
  });
  
  // Tick accumulation state
  const [tickAccumulator, setTickAccumulator] = useState(null);
  const ticksPerBar = useMemo(() => getTicksPerBar(currentResolution), [currentResolution]);

  // Strategy state
  const [currentStrategy, setCurrentStrategy] = useState(null);

  // Get normalized contract info
  const normalizedContract = useMemo(() => normalizeContractInfo(contractInfo), [contractInfo]);
  
  // Get grouped resolutions for UI
  const groupedResolutions = useMemo(() => getGroupedResolutions(), []);

  /**
   * Validate chart data to ensure proper format for LightweightCharts
   */
  const validateChartData = useCallback((data) => {
    if (!data || typeof data !== 'object') {
      console.warn('Invalid chart data: not an object', data);
      return null;
    }

    // Ensure time is a number (not an object)
    let time = data.time;
    if (typeof time === 'object' && time !== null) {
      // If time is an object, try to extract a numeric value
      time = time.valueOf ? time.valueOf() : Date.now() / 1000;
    }
    time = Math.floor(Number(time));

    // Validate OHLC values
    const open = Number(data.open);
    const high = Number(data.high);
    const low = Number(data.low);
    const close = Number(data.close);
    const volume = Number(data.volume || 0);

    // Check for valid numbers
    if (isNaN(time) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
      console.warn('Invalid chart data: NaN values', { time, open, high, low, close });
      return null;
    }

    // Check OHLC relationships
    if (high < low || high < open || high < close || low > open || low > close) {
      console.warn('Invalid OHLC relationships', { open, high, low, close });
      return null;
    }

    return {
      time,
      open,
      high,
      low,
      close,
      volume
    };
  }, []);

  /**
   * Apply strategy settings when component mounts or strategyType changes
   */
  useEffect(() => {
    if (strategyType) {
      console.log('Applying strategy settings:', {
        strategyType,
        strategyBrickSize,
        strategyConfig
      });

      // Map strategy type to chart type
      const chartTypeMap = {
        'candlestick': CHART_TYPES.CANDLESTICK,
        'heiken_ashi': CHART_TYPES.HEIKEN_ASHI,
        'renko': CHART_TYPES.RENKO
      };

      if (chartTypeMap[strategyType]) {
        setChartType(chartTypeMap[strategyType]);
      }

      // Apply brick size for Renko charts
      if (strategyType === 'renko' && strategyBrickSize) {
        const brickSizeNum = parseFloat(strategyBrickSize);
        if (!isNaN(brickSizeNum) && brickSizeNum > 0) {
          setBrickSize(brickSizeNum);
          setBrickSizeInput(brickSizeNum.toString());
        }
      }
      
      // Apply additional strategy configuration if provided
      if (strategyConfig) {
        // Only set resolution from strategy config if user hasn't manually changed it
        if (strategyConfig.resolution && strategyConfig.resolution !== resolution && !userChangedResolution) {
          setCurrentResolution(strategyConfig.resolution);
        }

        if (strategyConfig.brickSize && strategyType === 'renko') {
          const configBrickSize = parseFloat(strategyConfig.brickSize);
          if (!isNaN(configBrickSize) && configBrickSize > 0) {
            setBrickSize(configBrickSize);
            setBrickSizeInput(configBrickSize.toString());
          }
        }
      }
    }
  }, [strategyType, strategyBrickSize, strategyConfig, resolution, userChangedResolution]);


  /**
   * Load historical data
   */
  const loadHistoricalData = useCallback(async () => {
    console.log('loadHistoricalData called with:', { 
      productId, 
      currentResolution, 
      editMode, 
      strategyType,
      strategyName
    });
    
    if (!productId) {
      console.error('No productId provided, cannot load data');
      setError('No product ID available');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      console.log('Loading historical data...', { productId, resolution: currentResolution });
      
      // Check authentication - but allow demo data to load
      if (!isAuthenticated()) {
        console.warn('No authentication available, will use demo data');
      }
      
      // Fetch historical data
      const data = await fetchHistoricalData(productId, currentResolution);
      
      if (data && data.length > 0) {
        console.log(`Loaded ${data.length} bars of historical data`);
        setRawData(data);
        
        // Initialize Renko state if needed
        if (chartType === CHART_TYPES.RENKO) {
          setRenkoState(initializeRenkoState(data));
        }
        
        // Transform and display data
        updateChartDisplay(data, chartType);
      } else {
        console.warn('No historical data received');
        setError('No data available for this symbol');
      }
    } catch (err) {
      console.error('Error loading historical data:', err);
      setError(err.message || 'Failed to load chart data');
    } finally {
      setIsLoading(false);
    }
  }, [productId, currentResolution, chartType]);
  
  /**
   * Update chart display with transformed data
   */
  const updateChartDisplay = useCallback((data, type) => {
    if (!candleSeriesRef.current || !data || data.length === 0) return;
    
    console.log(`Updating chart display for ${type} with ${data.length} bars`);
    
    // Transform data based on chart type
    const transformedData = transformDataForChartType(data, type, { 
      brickSize, 
      useATR: false 
    });
    
    // Store transformed data
    switch (type) {
      case CHART_TYPES.HEIKEN_ASHI:
        setHeikenAshiData(transformedData);
        break;
      case CHART_TYPES.RENKO:
        setRenkoData(transformedData);
        break;
    }
    
    setDisplayData(transformedData);
    
    // Update chart
    if (transformedData.length > 0) {
      // Validate all data before setting on chart
      const validatedData = transformedData.map(validateChartData).filter(Boolean);
      if (validatedData.length > 0) {
        candleSeriesRef.current.setData(validatedData);
        console.log(`Set ${validatedData.length} validated bars on chart (${transformedData.length - validatedData.length} invalid filtered)`);
      } else {
        console.warn('No valid data after validation');
        return;
      }
      
      // Force chart to maintain proper size after data update
      if (chartRef.current && chartContainerRef.current) {
        const containerWidth = chartContainerRef.current.offsetWidth || window.innerWidth;
        const containerHeight = chartContainerRef.current.offsetHeight || (window.innerHeight - 80);
        
        const width = Math.max(containerWidth, 1000);
        const height = Math.max(containerHeight, 700);
        
        chartRef.current.applyOptions({
          width,
          height
        });
      }
      
      chartRef.current.timeScale().fitContent();
      
      // For tick charts, set visible range
      if (currentResolution.endsWith('T') && transformedData.length > 10) {
        const lastTime = transformedData[transformedData.length - 1].time;
        const firstTime = transformedData[Math.max(0, transformedData.length - 100)].time;
        chartRef.current.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
      }
    }
  }, [brickSize, currentResolution]);
  
  /**
   * Setup real-time connection
   */
  const setupRealtimeConnection = useCallback(async () => {
    if (!isAuthenticated()) {
      console.log('Skipping real-time connection setup - using demo data mode');
      setConnectionStatus('Demo mode - no real-time data');
      return;
    }

    try {
      console.log('Setting up real-time connection...');

      await realtimeConnection.initialize({
        onData: (bar, resolution) => {
          // Handle real-time data inline to avoid circular dependency
          if (resolution !== currentResolution) {
            console.log('Ignoring bar for different resolution:', resolution, 'vs', currentResolution);
            return;
          }

          console.log('Real-time bar received:', bar);

          // Handle tick chart accumulation
          if (currentResolution.endsWith('T')) {
            setTickAccumulator(prev => {
              const { accumulator, completedBar } = accumulateTickData(bar, prev, ticksPerBar);
              if (completedBar) {
                // Validate and update chart with completed bar
                const validatedBar = validateChartData(completedBar);
                if (validatedBar) {
                  candleSeriesRef.current?.update(validatedBar);
                  setRawData(prevData => mergeRealtimeUpdate(prevData, completedBar));
                }
              }
              return accumulator;
            });
          } else {
            // Update raw data
            setRawData(prevData => {
              const updatedData = mergeRealtimeUpdate(prevData, bar);

              // Transform based on chart type
              if (chartType === CHART_TYPES.HEIKEN_ASHI) {
                setHeikenAshiData(prev => {
                  const haBar = updateHeikenAshiRealtime(bar, prev, updatedData);
                  if (haBar) {
                    const validatedHABar = validateChartData(haBar);
                    if (validatedHABar) {
                      candleSeriesRef.current?.update(validatedHABar);
                    }
                    return mergeRealtimeUpdate(prev, haBar);
                  }
                  return prev;
                });
              } else if (chartType === CHART_TYPES.RENKO) {
                setRenkoState(prevState => {
                  const { newBricks, updatedState } = updateRenkoRealtime(bar, prevState, brickSize);
                  if (newBricks.length > 0) {
                    newBricks.forEach(brick => {
                      // Validate brick data before updating
                      const validatedBrick = validateChartData(brick);
                      if (validatedBrick) {
                        candleSeriesRef.current?.update(validatedBrick);
                      }
                    });
                    setRenkoData(prev => [...prev, ...newBricks]);
                  }
                  return updatedState;
                });
              } else {
                // Regular candlestick update - validate data first
                const validatedBar = validateChartData(bar);
                if (validatedBar) {
                  candleSeriesRef.current?.update(validatedBar);
                }
              }

              return updatedData;
            });
          }
        },
        onConnect: () => {
          setConnectionStatus('Connected');
          console.log('Real-time connection established');
        },
        onDisconnect: (status) => {
          setConnectionStatus(status || 'Disconnected');
        },
        onError: (error) => {
          console.error('Real-time error:', error);
          setConnectionStatus('Connection Error');
        }
      });

      // Subscribe to current symbol/resolution
      if (productId && currentResolution) {
        await realtimeConnection.subscribe(productId, currentResolution);
      }
    } catch (err) {
      console.error('Failed to setup real-time connection:', err);
      setConnectionStatus('Failed to connect');
    }
  }, [productId, currentResolution, ticksPerBar, chartType, brickSize]);
  
  
  /**
   * Handle chart type change
   */
  const handleChartTypeChange = useCallback((newType) => {
    console.log('Changing chart type to:', newType);
    setChartType(newType);
    
    // Ensure chart maintains proper size after chart type change
    if (chartRef.current && chartContainerRef.current) {
      const containerWidth = chartContainerRef.current.offsetWidth || window.innerWidth;
      const containerHeight = chartContainerRef.current.offsetHeight || (window.innerHeight - 80);
      
      const width = Math.max(containerWidth, 1000);
      const height = Math.max(containerHeight, 700);
      
      chartRef.current.applyOptions({
        width,
        height
      });
    }
    
    // Re-transform and display data
    if (rawData.length > 0) {
      if (newType === CHART_TYPES.RENKO) {
        setRenkoState(initializeRenkoState(rawData));
      }
      updateChartDisplay(rawData, newType);
    }
  }, [rawData, updateChartDisplay]);
  
  /**
   * Handle resolution change
   */
  const handleResolutionChange = useCallback(async (newResolution) => {
    console.log('Changing resolution to:', newResolution);
    setCurrentResolution(newResolution);
    setUserChangedResolution(true); // Mark that user has manually changed resolution

    // Notify parent component about resolution change (if callback provided)
    if (onResolutionChange) {
      onResolutionChange(newResolution);
    }

    // Reset tick accumulator
    setTickAccumulator(null);

    // Clear chart
    candleSeriesRef.current?.setData([]);

    // Ensure chart maintains proper size after resolution change
    if (chartRef.current && chartContainerRef.current) {
      const containerWidth = chartContainerRef.current.offsetWidth || window.innerWidth;
      const containerHeight = chartContainerRef.current.offsetHeight || (window.innerHeight - 80);

      const width = Math.max(containerWidth, 1000);
      const height = Math.max(containerHeight, 700);

      chartRef.current.applyOptions({
        width,
        height
      });
    }

    // Reload data with new resolution
    await loadHistoricalData();

    // Re-subscribe to real-time data
    if (realtimeConnection.isConnected()) {
      await realtimeConnection.subscribe(productId, newResolution);
    }
  }, [productId, loadHistoricalData]);
  
  /**
   * Handle brick size update
   */
  const handleBrickSizeUpdate = useCallback(() => {
    const newSize = parseFloat(brickSizeInput);
    
    if (isNaN(newSize) || newSize <= 0) {
      alert('Please enter a valid brick size greater than 0');
      setBrickSizeInput(brickSize.toString());
      return;
    }
    
    if (newSize > 1000) {
      alert('Brick size too large. Please enter a value less than 1000');
      setBrickSizeInput(brickSize.toString());
      return;
    }
    
    console.log('Updating brick size to:', newSize);
    setBrickSize(newSize);
    
    // Re-calculate Renko if currently showing
    if (chartType === CHART_TYPES.RENKO && rawData.length > 0) {
      setRenkoState(initializeRenkoState(rawData));
      updateChartDisplay(rawData, CHART_TYPES.RENKO);
    }
  }, [brickSizeInput, brickSize, chartType, rawData, updateChartDisplay]);
  
  /**
   * Create chart instance
   */
  const createChartInstance = useCallback(async () => {
    if (!chartContainerRef.current || !window.LightweightCharts) {
      console.error('Chart container or LightweightCharts not available');
      return;
    }
    
    // Clean up existing chart
    if (chartRef.current) {
      console.log('Cleaning up existing chart');
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    }
    
    console.log('Creating new chart instance...');
    console.log('Container dimensions:', {
      width: chartContainerRef.current.offsetWidth,
      height: chartContainerRef.current.offsetHeight
    });
    
    try {
      // Create new chart
      const chart = window.LightweightCharts.createChart(
        chartContainerRef.current,
        getChartOptions(chartContainerRef.current)
      );
      
      console.log('Chart created successfully');
      
      // Add candlestick series
      const candleSeries = chart.addCandlestickSeries(getCandlestickSeriesOptions());
      console.log('Candlestick series added');
      
      // Store references
      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      
      // Handle window resize
      const handleResize = () => {
        if (chartRef.current && chartContainerRef.current) {
          const containerWidth = chartContainerRef.current.offsetWidth || window.innerWidth;
          const containerHeight = chartContainerRef.current.offsetHeight || (window.innerHeight - 80);
          
          const newWidth = Math.max(containerWidth, 1000);
          const newHeight = Math.max(containerHeight, 700);
          
          console.log('Resizing chart to:', { 
            width: newWidth, 
            height: newHeight,
            containerWidth,
            containerHeight 
          });
          
          chartRef.current.applyOptions({
            width: newWidth,
            height: newHeight
          });
        }
      };
      
      window.addEventListener('resize', handleResize);
      
      console.log('Chart initialization complete');

      // Load data after chart is ready
      if (productId) {
        // Load historical data first
        await loadHistoricalData();

        // Then setup real-time connection if authenticated
        if (isAuthenticated()) {
          await setupRealtimeConnection();
        } else {
          setConnectionStatus('Demo mode - no real-time data');
        }
      }
      
      // Cleanup on unmount
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    } catch (error) {
      console.error('Error creating chart:', error);
      setError('Failed to create chart instance');
    }
  }, [productId, loadHistoricalData, setupRealtimeConnection]);
  
  /**
   * Initialize chart library
   */
  const initializeChart = useCallback(() => {
    if (!chartContainerRef.current) return;
    
    console.log('Initializing chart library...');
    
    // Load LightweightCharts if not already loaded
    if (!window.LightweightCharts) {
      console.log('Loading LightweightCharts library...');
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js';
      script.onload = () => {
        console.log('LightweightCharts library loaded');
        createChartInstance();
      };
      script.onerror = () => {
        console.error('Failed to load LightweightCharts library');
        setError('Failed to load chart library');
      };
      document.head.appendChild(script);
    } else {
      console.log('LightweightCharts already available');
      createChartInstance();
    }
  }, [createChartInstance]);
  
  /**
   * Initialize chart on mount
   */
  useEffect(() => {
    if (isOpen) {
      initializeChart();
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
      }
    };
  }, [isOpen, initializeChart]);

  /**
   * Cleanup real-time connection on unmount
   */
  useEffect(() => {
    return () => {
      realtimeConnection.stop();
    };
  }, []);
  
  // Data loading is now handled in createChart() to avoid timing issues
  
  if (!isOpen) return null;
  
  return (
    <div className={`trading-chart-container ${fullscreen ? 'fullscreen' : ''}`}>
      <AnimatePresence>
        <motion.div
          className="trading-chart-wrapper"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
        >
          {/* Header */}
          <div className="trading-chart-header">
            <div className="chart-header-left">
              {onClose && (
                <button className="chart-back-btn" onClick={onClose}>
                  <FaArrowLeft />
                </button>
              )}
              <div className="chart-title-info">
                <h1 className="chart-main-title">
                  {convertSymbolToDisplay(normalizedContract?.symbol || productId)} - {resolutionConfig[currentResolution]?.displayName}
                </h1>
                {strategyName && (
                  <p className="chart-subtitle">
                    Strategy: {strategyName} | Type: {strategyType}
                  </p>
                )}
              </div>
            </div>
            
            <div className="chart-header-controls">
              {/* Chart Type Selector */}
              <div className="chart-control-group">
                <label>Chart Type:</label>
                <select 
                  value={chartType} 
                  onChange={(e) => handleChartTypeChange(e.target.value)}
                  className="chart-select"
                >
                  <option value={CHART_TYPES.CANDLESTICK}>Candlestick</option>
                  <option value={CHART_TYPES.HEIKEN_ASHI}>Heiken Ashi</option>
                  <option value={CHART_TYPES.RENKO}>Renko</option>
                </select>
              </div>
              
              {/* Resolution Selector */}
              <div className="chart-control-group">
                <label>Resolution:</label>
                <select 
                  value={currentResolution} 
                  onChange={(e) => handleResolutionChange(e.target.value)}
                  className="chart-select"
                >
                  {Object.entries(groupedResolutions).map(([group, resolutions]) => (
                    <optgroup key={group} label={group}>
                      {resolutions.map(res => (
                        <option key={res.value} value={res.value}>
                          {res.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              
              {/* Renko Brick Size */}
              {chartType === CHART_TYPES.RENKO && (
                <div className="chart-control-group renko-controls">
                  <label>Brick Size:</label>
                  <input
                    type="number"
                    value={brickSizeInput}
                    onChange={(e) => setBrickSizeInput(e.target.value)}
                    className="brick-size-input"
                    min="0.1"
                    step="0.1"
                  />
                  <button 
                    onClick={handleBrickSizeUpdate}
                    className="brick-size-apply"
                  >
                    Apply
                  </button>
                </div>
              )}
              
              {/* Connection Status */}
              <div className={`connection-status ${connectionStatus === 'Connected' ? 'connected' : ''}`}>
                {connectionStatus}
              </div>

              {/* Strategy Manager */}
              <StrategyManager
                chartRef={chartRef}
                candleSeriesRef={candleSeriesRef}
                chartData={displayData}
                initialStrategy={strategyConfig}
                onStrategyUpdate={(strategyInfo) => {
                  setCurrentStrategy(strategyInfo);
                  console.log('Strategy applied:', strategyInfo);
                }}
              />

              {/* Save Button */}
              {onSave && (
                <button 
                  className="chart-save-btn" 
                  onClick={() => onSave({
                    productId,
                    resolution: currentResolution,
                    chartType,
                    strategyType,
                    strategyName,
                    contractInfo: normalizedContract,
                    // Complete chart state for restoration
                    brickSize,
                    indicators: [], // TODO: Add indicator state if implemented
                    // Strategy information
                    strategy: currentStrategy ? {
                      id: currentStrategy.strategy?.id,
                      name: currentStrategy.strategy?.name,
                      displayName: currentStrategy.strategy?.displayName,
                      category: currentStrategy.strategy?.category,
                      config: currentStrategy.config,
                      stats: currentStrategy.stats
                    } : null,
                    chartSettings: {
                      ticksPerBar,
                      normalizedContract
                    }
                  })}
                >
                  <FaSave />
                  {editMode ? 'Update Strategy' : 'Save Strategy'}
                </button>
              )}
            </div>
          </div>
          
          {/* Chart Canvas */}
          <div className="trading-chart-canvas-wrapper">
            {isLoading && (
              <div className="chart-loading">
                <FaSpinner className="spinner" />
                Loading chart data...
              </div>
            )}
            
            {error && (
              <div className="chart-error">
                {error}
              </div>
            )}
            
            <div 
              ref={chartContainerRef} 
              className="trading-chart-canvas"
              style={{ display: isLoading ? 'none' : 'block' }}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default TradingChart;