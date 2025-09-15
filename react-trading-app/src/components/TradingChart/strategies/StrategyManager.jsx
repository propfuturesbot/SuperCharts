import React, { useState, useEffect, useCallback } from 'react';
import StrategySelector from './StrategySelector';
import StrategyConfigPanel from './StrategyConfigPanel';
import { strategyRegistry, getStrategyById, getDefaultConfig } from './registry/strategyRegistry';
import { processBollingerBands, formatBollingerBandsForChart } from './processors/bollingerBandsProcessor';
import './StrategyManager.css';

const StrategyManager = ({
  chartRef,
  candleSeriesRef,
  chartData,
  onStrategyUpdate,
  initialStrategy = null
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [strategyConfig, setStrategyConfig] = useState({});
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [strategyLines, setStrategyLines] = useState([]);
  const [strategyMarkers, setStrategyMarkers] = useState([]);
  const [strategyStats, setStrategyStats] = useState(null);

  // Initialize strategy from saved data
  useEffect(() => {
    if (initialStrategy && initialStrategy.id) {
      const strategy = getStrategyById(initialStrategy.id);
      if (strategy) {
        setSelectedStrategy(strategy);
        setStrategyConfig(initialStrategy.config || getDefaultConfig(initialStrategy.id));
      }
    }
  }, [initialStrategy]);

  // Clean up previous strategy lines and markers
  const cleanupStrategy = useCallback(() => {
    if (chartRef.current && strategyLines.length > 0) {
      strategyLines.forEach(line => {
        try {
          chartRef.current.removeSeries(line);
        } catch (e) {
          console.warn('Failed to remove series:', e);
        }
      });
      setStrategyLines([]);
    }

    if (candleSeriesRef.current && strategyMarkers.length > 0) {
      candleSeriesRef.current.setMarkers([]);
      setStrategyMarkers([]);
    }
  }, [chartRef, candleSeriesRef, strategyLines, strategyMarkers]);

  // Apply strategy to chart
  const applyStrategy = useCallback(() => {
    if (!selectedStrategy || !chartData || chartData.length === 0) {
      cleanupStrategy();
      setStrategyStats(null);
      return;
    }

    // Clean up previous strategy
    cleanupStrategy();

    let processedData = null;
    let formattedData = null;

    // Process strategy based on type
    switch (selectedStrategy.id) {
      case 'bollinger_bands':
        processedData = processBollingerBands(chartData, strategyConfig);
        formattedData = formatBollingerBandsForChart(processedData, strategyConfig);
        break;
      // Add more strategies here as they are implemented
      default:
        console.warn(`Strategy ${selectedStrategy.id} not yet implemented`);
        return;
    }

    if (!processedData || !formattedData) return;

    // Add strategy lines to chart
    if (chartRef.current) {
      const newLines = [];

      // Add Bollinger Bands lines
      if (formattedData.upperBandSeries) {
        const upperLine = chartRef.current.addLineSeries({
          ...formattedData.upperBandSeries.options,
          priceScaleId: 'right',
          crosshairMarkerVisible: false
        });
        upperLine.setData(formattedData.upperBandSeries.data);
        newLines.push(upperLine);
      }

      if (formattedData.middleBandSeries) {
        const middleLine = chartRef.current.addLineSeries({
          ...formattedData.middleBandSeries.options,
          priceScaleId: 'right',
          crosshairMarkerVisible: false
        });
        middleLine.setData(formattedData.middleBandSeries.data);
        newLines.push(middleLine);
      }

      if (formattedData.lowerBandSeries) {
        const lowerLine = chartRef.current.addLineSeries({
          ...formattedData.lowerBandSeries.options,
          priceScaleId: 'right',
          crosshairMarkerVisible: false
        });
        lowerLine.setData(formattedData.lowerBandSeries.data);
        newLines.push(lowerLine);
      }

      setStrategyLines(newLines);
    }

    // Add buy/sell markers
    if (candleSeriesRef.current && formattedData.buyMarkers && formattedData.sellMarkers) {
      const allMarkers = [...formattedData.buyMarkers, ...formattedData.sellMarkers]
        .sort((a, b) => a.time - b.time);
      candleSeriesRef.current.setMarkers(allMarkers);
      setStrategyMarkers(allMarkers);
    }

    // Update statistics
    if (processedData.stats) {
      setStrategyStats(processedData.stats);
    }

    // Notify parent component
    if (onStrategyUpdate) {
      onStrategyUpdate({
        strategy: selectedStrategy,
        config: strategyConfig,
        data: processedData,
        stats: processedData.stats
      });
    }
  }, [selectedStrategy, strategyConfig, chartData, chartRef, candleSeriesRef, cleanupStrategy, onStrategyUpdate]);

  // Handle strategy change
  const handleStrategyChange = useCallback((strategy) => {
    setSelectedStrategy(strategy);
    if (strategy) {
      const defaultConfig = getDefaultConfig(strategy.id);
      setStrategyConfig(defaultConfig);
    } else {
      setStrategyConfig({});
    }
  }, []);

  // Handle config change
  const handleConfigChange = useCallback((newConfig) => {
    setStrategyConfig(newConfig);
  }, []);

  // Apply strategy when data or config changes
  useEffect(() => {
    applyStrategy();
  }, [applyStrategy]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupStrategy();
    };
  }, [cleanupStrategy]);

  return (
    <div className="strategy-manager">
      <div className="strategy-controls">
        <StrategySelector
          selectedStrategy={selectedStrategy}
          onStrategyChange={handleStrategyChange}
          onConfigOpen={() => setIsConfigOpen(true)}
          strategies={strategyRegistry}
        />

        {strategyStats && (
          <div className="strategy-stats">
            <div className="stat-item">
              <span className="stat-label">Signals:</span>
              <span className="stat-value">{strategyStats.totalSignals}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Win Rate:</span>
              <span className="stat-value">{strategyStats.winRate.toFixed(1)}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Return:</span>
              <span className={`stat-value ${strategyStats.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                {strategyStats.totalReturn}%
              </span>
            </div>
          </div>
        )}
      </div>

      <StrategyConfigPanel
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        strategy={selectedStrategy}
        config={strategyConfig}
        onConfigChange={handleConfigChange}
        onApply={applyStrategy}
      />
    </div>
  );
};

export default StrategyManager;