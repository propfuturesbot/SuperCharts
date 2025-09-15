import React, { useEffect, useRef, useState } from 'react';
import './TradingChart.css';

const TradingChart = ({ productId, resolution, chartType = 'candlestick' }) => {
  const chartRef = useRef();
  const [chart, setChart] = useState(null);
  const [candleSeries, setCandleSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [currentResolution, setCurrentResolution] = useState(resolution);

  // Provider configuration - using TopStepX as default
  const PROVIDER_CONFIG = {
    name: 'TopStepX',
    chartapi_endpoint: 'https://chartapi.topstepx.com',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjE5NDY5OSIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL3NpZCI6IjYzYzBjYTZhLWQxYTgtNDBjNS04MWViLWY1YTA0NGQ0ZjU0NiIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWUiOiJzdW1vbmV5MSIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6InVzZXIiLCJtc2QiOiJDTUVHUk9VUF9UT0IiLCJtZmEiOiJ2ZXJpZmllZCIsImV4cCI6MTc1ODA2MzYzNH0.HRx9bQw0GfM3pGfyTmtfusdPx6kW3wLp5k-HyByyLjs'
  };

  const resolutionConfig = {
    '100T': { countback: 50, displayName: '100 Ticks' },
    '500T': { countback: 50, displayName: '500 Ticks' },
    '1000T': { countback: 50, displayName: '1000 Ticks' },
    '5000T': { countback: 50, displayName: '5000 Ticks' },
    '1S': { countback: 500, displayName: '1 Second' },
    '5S': { countback: 500, displayName: '5 Seconds' },
    '10S': { countback: 500, displayName: '10 Seconds' },
    '15S': { countback: 500, displayName: '15 Seconds' },
    '20S': { countback: 500, displayName: '20 Seconds' },
    '30S': { countback: 500, displayName: '30 Seconds' },
    '1': { countback: 500, displayName: '1 Minute' },
    '2': { countback: 500, displayName: '2 Minutes' },
    '3': { countback: 500, displayName: '3 Minutes' },
    '4': { countback: 500, displayName: '4 Minutes' },
    '5': { countback: 500, displayName: '5 Minutes' },
    '10': { countback: 500, displayName: '10 Minutes' },
    '15': { countback: 500, displayName: '15 Minutes' },
    '20': { countback: 500, displayName: '20 Minutes' },
    '30': { countback: 500, displayName: '30 Minutes' },
    '45': { countback: 500, displayName: '45 Minutes' },
    '60': { countback: 500, displayName: '1 Hour' },
    '1D': { countback: 326, displayName: '1 Day' },
    '1W': { countback: 500, displayName: '1 Week' },
    '1M': { countback: 500, displayName: '1 Month' }
  };

  // Initialize chart
  useEffect(() => {
    if (!window.LightweightCharts) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js';
      script.onload = () => initializeChart();
      document.head.appendChild(script);
    } else {
      initializeChart();
    }

    return () => {
      if (chart) {
        chart.remove();
      }
      if (connection) {
        connection.stop();
      }
    };
  }, []);

  // Update chart when props change
  useEffect(() => {
    if (chart && (resolution !== currentResolution || productId)) {
      setCurrentResolution(resolution);
      loadChartData();
    }
  }, [productId, resolution, chart]);

  const initializeChart = () => {
    if (!chartRef.current || !window.LightweightCharts) return;

    try {
      const newChart = window.LightweightCharts.createChart(chartRef.current, {
        width: chartRef.current.offsetWidth,
        height: chartRef.current.offsetHeight,
        layout: {
          background: { color: '#1a1a1a' },
          textColor: '#ddd',
        },
        grid: {
          vertLines: { color: '#2a2a2a' },
          horzLines: { color: '#2a2a2a' },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: true,
          borderVisible: false,
          borderColor: '#444',
        },
        rightPriceScale: {
          borderVisible: false,
          borderColor: '#444',
        },
        crosshair: {
          mode: window.LightweightCharts.CrosshairMode.Normal,
        },
      });

      const newCandleSeries = newChart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      setChart(newChart);
      setCandleSeries(newCandleSeries);

      // Handle window resize
      const resizeHandler = () => {
        newChart.applyOptions({
          width: chartRef.current.offsetWidth,
          height: chartRef.current.offsetHeight
        });
      };

      window.addEventListener('resize', resizeHandler);

      // Load initial data
      loadChartData();

    } catch (error) {
      console.error('Error initializing chart:', error);
      setError('Failed to initialize chart');
    }
  };

  const getHistoricalData = async (resolution, countback, symbol) => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - (86400 * 7); // 7 days ago
      const to = now;
      
      const url = `${PROVIDER_CONFIG.chartapi_endpoint}/History/v2?Symbol=${encodeURIComponent(symbol)}&Resolution=${resolution}&Countback=${countback}&From=${from}&To=${to}&SessionId=extended&Live=false`;
      
      console.log('Fetching historical data:', { symbol, resolution, url });
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${PROVIDER_CONFIG.token}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP error! status: ${response.status}, response: ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      console.log('Raw response (first 500 chars):', text.substring(0, 500));
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse JSON:', e);
        throw new Error('Invalid JSON response');
      }
      
      // Handle both array and object with data property
      let bars = Array.isArray(data) ? data : (data.data || data.bars || []);
      
      if (!Array.isArray(bars)) {
        console.error('Unexpected data format:', data);
        throw new Error('Unexpected data format');
      }
      
      console.log(`Received ${bars.length} bars for resolution ${resolution}`);
      
      if (bars.length === 0) {
        console.warn(`No data received for resolution ${resolution}`);
        return [];
      }
      
      // Convert to chart format
      const chartData = bars
        .map(bar => {
          if (!bar || typeof bar.t === 'undefined' || typeof bar.o === 'undefined') {
            console.warn('Invalid bar data:', bar);
            return null;
          }
          
          return {
            time: Math.floor(bar.t / 1000), // Convert milliseconds to seconds
            open: parseFloat(bar.o),
            high: parseFloat(bar.h),
            low: parseFloat(bar.l),
            close: parseFloat(bar.c),
            volume: parseInt(bar.v || bar.tv || 0)
          };
        })
        .filter(bar => {
          if (!bar) return false;
          return !isNaN(bar.time) && !isNaN(bar.open) && !isNaN(bar.high) && 
                 !isNaN(bar.low) && !isNaN(bar.close) && bar.time > 0;
        })
        .sort((a, b) => a.time - b.time);

      // Fix duplicate timestamps for tick charts
      if (resolution.endsWith('T') && chartData.length > 0) {
        console.log('Fixing duplicate timestamps for tick chart...');
        let duplicatesFixed = 0;
        
        for (let i = 1; i < chartData.length; i++) {
          if (chartData[i].time <= chartData[i - 1].time) {
            chartData[i].time = chartData[i - 1].time + 1;
            duplicatesFixed++;
          }
        }
        
        console.log(`Fixed ${duplicatesFixed} duplicate timestamps`);
      }
      
      console.log(`Processed ${chartData.length} valid bars`);
      return chartData;
      
    } catch (error) {
      console.error('Error fetching historical data:', error);
      throw error;
    }
  };

  const loadChartData = async () => {
    if (!productId || !resolution || !candleSeries) return;

    try {
      setLoading(true);
      setError('');

      const config = resolutionConfig[resolution];
      if (!config) {
        throw new Error(`No configuration found for resolution: ${resolution}`);
      }

      console.log(`Loading data for ${productId} at ${resolution} resolution`);
      
      const data = await getHistoricalData(resolution, config.countback, productId);
      
      if (data && data.length > 0) {
        console.log(`Setting ${data.length} bars on chart`);
        
        // Validate data
        const validData = data.filter(d => {
          return d && 
                 typeof d.time === 'number' && 
                 typeof d.open === 'number' && 
                 typeof d.high === 'number' && 
                 typeof d.low === 'number' && 
                 typeof d.close === 'number' &&
                 !isNaN(d.time) && 
                 !isNaN(d.open) && 
                 !isNaN(d.high) && 
                 !isNaN(d.low) && 
                 !isNaN(d.close) &&
                 d.time > 0 &&
                 d.high >= d.low &&
                 d.high >= d.open &&
                 d.high >= d.close &&
                 d.low <= d.open &&
                 d.low <= d.close;
        });
        
        console.log(`Filtered data: ${validData.length} valid bars out of ${data.length}`);
        
        if (validData.length > 0) {
          // CRITICAL: Always sort data before setting to chart
          const sortedData = validData.sort((a, b) => a.time - b.time);

          candleSeries.setData(sortedData);
          setHistoricalData(sortedData);

          // Fit content to show all data
          chart.timeScale().fitContent();
          
          // For tick charts, set visible range to last portion
          if (resolution.endsWith('T') && validData.length > 10) {
            const lastTime = validData[validData.length - 1].time;
            const firstTime = validData[Math.max(0, validData.length - 100)].time;
            chart.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
          }
          
          console.log('Chart data loaded successfully');
          
          // Setup real-time connection after loading historical data
          setupRealTimeConnection();
        } else {
          setError('No valid data available for this contract and timeframe');
        }
      } else {
        setError('No data available for this contract and timeframe');
      }
    } catch (error) {
      console.error('Error loading chart data:', error);
      setError(error.message || 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  const setupRealTimeConnection = async () => {
    if (!window.signalR || !productId || !resolution) return;

    try {
      // Stop existing connection
      if (connection) {
        await connection.stop();
      }

      const chartApiUrl = `${PROVIDER_CONFIG.chartapi_endpoint}/hubs/chart`;
      console.log('Setting up real-time connection:', chartApiUrl);
      
      const newConnection = new window.signalR.HubConnectionBuilder()
        .withUrl(`${chartApiUrl}?access_token=${PROVIDER_CONFIG.token}`, {
          skipNegotiation: true,
          transport: window.signalR.HttpTransportType.WebSockets
        })
        .configureLogging(window.signalR.LogLevel.Information)
        .withAutomaticReconnect()
        .build();
      
      newConnection.on("RealTimeBar", (receivedSymbol, receivedResolution, bar) => {
        console.log('RealTimeBar received:', {
          symbol: receivedSymbol,
          resolution: receivedResolution,
          bar: bar,
          currentResolution: resolution
        });
        
        if (receivedResolution === resolution && receivedSymbol === productId) {
          handleRealTimeBar(bar);
        }
      });
      
      newConnection.onreconnecting(() => {
        console.log('Reconnecting to SignalR...');
      });
      
      newConnection.onreconnected(async () => {
        console.log('Reconnected to SignalR');
        await newConnection.invoke("SubscribeBars", productId, resolution);
      });
      
      newConnection.onclose(() => {
        console.log('SignalR connection closed');
      });
      
      await newConnection.start();
      console.log('Connected to SignalR hub successfully');
      
      // Subscribe to the symbol and resolution
      await newConnection.invoke("SubscribeBars", productId, resolution);
      console.log(`Subscribed to ${productId} ${resolution}`);
      
      setConnection(newConnection);
      
    } catch (error) {
      console.error('Failed to setup real-time connection:', error);
    }
  };

  const handleRealTimeBar = (bar) => {
    if (!bar || !candleSeries) return;

    try {
      // Parse timestamp
      let timestamp;
      if (bar.timestampUnix && bar.timestampUnix > 0) {
        timestamp = bar.timestampUnix * 1000;
      } else if (bar.timestamp && typeof bar.timestamp === 'string') {
        timestamp = new Date(bar.timestamp).getTime();
      } else {
        return;
      }

      // Fix timestamp format
      if (timestamp > 10000000000000000) {
        timestamp = Math.floor(timestamp / 1000000);
      } else if (timestamp > 100000000000000) {
        timestamp = Math.floor(timestamp / 1000);
      } else if (timestamp < 946684800000) {
        if (timestamp > 946684800) {
          timestamp = timestamp * 1000;
        }
      }

      const barTime = Math.floor(timestamp / 1000);
      const update = {
        time: barTime,
        open: parseFloat(bar.open),
        high: parseFloat(bar.high),
        low: parseFloat(bar.low),
        close: parseFloat(bar.close),
        volume: parseInt(bar.volume || bar.tickVolume || 0)
      };

      // Validate update data
      if (isNaN(update.time) || isNaN(update.open) || isNaN(update.high) ||
          isNaN(update.low) || isNaN(update.close)) {
        return;
      }

      // CRITICAL FIX: Update React state properly and ensure data is sorted
      setHistoricalData(currentData => {
        if (currentData.length === 0) {
          // First bar
          const newData = [update];
          candleSeries.setData(newData);
          return newData;
        }

        const lastBar = currentData[currentData.length - 1];
        let updatedData;

        if (update.time === lastBar.time) {
          // Update existing bar (same timestamp)
          updatedData = [...currentData.slice(0, -1), update];
        } else {
          // New bar (different timestamp)
          updatedData = [...currentData, update];
        }

        // CRITICAL: Always sort to prevent chart crashes
        updatedData.sort((a, b) => a.time - b.time);

        // Update the chart with the entire sorted dataset
        candleSeries.setData(updatedData);

        return updatedData;
      });

      console.log('Chart updated with real-time bar:', update);

    } catch (error) {
      console.error('Error handling real-time bar:', error);
    }
  };

  // Load SignalR if not available
  useEffect(() => {
    if (!window.signalR) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@microsoft/signalr@6.0.0/dist/browser/signalr.min.js';
      script.onload = () => {
        if (historicalData.length > 0) {
          setupRealTimeConnection();
        }
      };
      document.head.appendChild(script);
    }
  }, [historicalData]);

  return (
    <div className="trading-chart-container">
      <div className="trading-chart-header">
        <h3 className="chart-title">
          {productId} - {resolutionConfig[resolution]?.displayName || resolution}
        </h3>
        {loading && <div className="chart-loading">Loading chart data...</div>}
        {error && <div className="chart-error">{error}</div>}
      </div>
      <div className="trading-chart" ref={chartRef}></div>
    </div>
  );
};

export default TradingChart;



