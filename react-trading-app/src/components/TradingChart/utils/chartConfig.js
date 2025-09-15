// Chart configuration settings for TradingView Lightweight Charts

export const getChartOptions = (container) => {
  // Calculate dimensions - use full available space
  const containerWidth = container?.offsetWidth || window.innerWidth;
  const containerHeight = container?.offsetHeight || (window.innerHeight - 80);
  
  const width = Math.max(containerWidth, 1000);
  const height = Math.max(containerHeight, 700);
  
  console.log('Chart dimensions calculated:', { width, height, containerWidth, containerHeight });
  
  return {
    width,
    height,
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
      mode: 0, // Normal mode
    },
    handleScroll: true,
    handleScale: true,
    autoSize: true,
  };
};

export const getCandlestickSeriesOptions = () => ({
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderVisible: false,
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
});

// Chart types
export const CHART_TYPES = {
  CANDLESTICK: 'candlestick',
  HEIKEN_ASHI: 'heikenashi',
  RENKO: 'renko'
};

// Default settings
export const DEFAULT_SETTINGS = {
  chartType: CHART_TYPES.CANDLESTICK,
  resolution: '15',
  brickSize: 10,
  useATRForBrickSize: false,
  atrPeriod: 14,
  atrMultiplier: 0.5
};