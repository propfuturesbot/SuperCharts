import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FaSave, FaArrowLeft } from 'react-icons/fa';
import authService from '../../services/auth.service';
import './FullPageChart.css';

// Global variables exactly like index.js
let chart = null;
let candleSeries = null;

const FullPageChart = ({ 
  isOpen, 
  onClose, 
  onSave, 
  productId, 
  resolution, 
  strategyType,
  strategyName,
  contractInfo
}) => {
  const chartRef = useRef();

  useEffect(() => {
    if (isOpen) {
      // Load library and initialize chart
      if (!window.LightweightCharts) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js';
        script.onload = () => setTimeout(initializeChart, 100);
        document.head.appendChild(script);
      } else {
        setTimeout(initializeChart, 100);
      }
    }
    
    return () => {
      if (chart) {
        chart.remove();
        chart = null;
        candleSeries = null;
      }
    };
  }, [isOpen]);

  const initializeChart = () => {
    const chartElement = document.getElementById('chart');
    
    if (typeof window.LightweightCharts === 'undefined') {
      console.error('LightweightCharts library not loaded');
      return;
    }
    
    if (chart) {
      chart.remove();
    }
    
    chart = window.LightweightCharts.createChart(chartElement, {
      width: chartElement.offsetWidth,
      height: chartElement.offsetHeight,
      layout: {
        background: { color: '#222' },
        textColor: '#DDD',
      },
      grid: {
        vertLines: { color: '#444' },
        horzLines: { color: '#444' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
      },
      crosshair: {
        mode: window.LightweightCharts.CrosshairMode.Normal,
      },
    });
    
    candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
      if (chart) {
        chart.applyOptions({ 
          width: chartElement.offsetWidth,
          height: chartElement.offsetHeight 
        });
      }
    });

    loadHistoricalData();
  };

  const loadHistoricalData = async () => {
    if (!candleSeries) return;

    try {
      const accessToken = authService.getToken();
      const now = Math.floor(Date.now() / 1000);
      const from = now - (86400 * 7);
      const to = now;
      
      let symbolToUse = productId;
      if (productId && productId.startsWith('F.US.')) {
        const baseSymbol = productId.replace('F.US.', '');
        symbolToUse = '%2F' + baseSymbol;
      }
      
      const url = `https://chartapi.topstepx.com/History/v2?Symbol=${symbolToUse}&Resolution=${resolution}&Countback=500&From=${from}&To=${to}&SessionId=extended&Live=false`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      let bars = Array.isArray(data) ? data : (data.data || data.bars || []);
      
      if (bars && bars.length > 0) {
        const chartData = bars
          .map(bar => ({
            time: Math.floor(bar.t / 1000),
            open: parseFloat(bar.o),
            high: parseFloat(bar.h),
            low: parseFloat(bar.l),
            close: parseFloat(bar.c)
          }))
          .filter(bar => !isNaN(bar.time) && !isNaN(bar.open))
          .sort((a, b) => a.time - b.time);

        candleSeries.setData(chartData);
        chart.timeScale().fitContent();
        console.log('Data loaded:', chartData.length, 'bars');
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fullpage-chart-overlay">
      <motion.div 
        className="fullpage-chart-container"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <div className="chart-header">
          <div className="chart-header-left">
            <button className="chart-back-btn" onClick={onClose}>
              <FaArrowLeft />
            </button>
            <div className="chart-title-info">
              <h1 className="chart-main-title">
                {contractInfo?.symbol} - {resolution}
              </h1>
              <p className="chart-subtitle">
                Strategy: {strategyName} | Type: {strategyType}
              </p>
            </div>
          </div>
          
          <div className="chart-header-right">
            <button className="chart-save-btn" onClick={() => onSave({
              productId,
              resolution,
              strategyType,
              strategyName,
              contractInfo
            })}>
              <FaSave />
              Save Strategy
            </button>
          </div>
        </div>

        <div className="chart-canvas-container">
          <div id="chart" className="chart-canvas"></div>
        </div>
      </motion.div>
    </div>
  );
};

export default FullPageChart;