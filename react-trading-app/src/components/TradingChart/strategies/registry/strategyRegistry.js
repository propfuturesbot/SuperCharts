// Strategy Registry - Central configuration for all trading strategies
// Each strategy defines its parameters, default values, and UI configuration

export const strategyRegistry = {
  volatility: [
    {
      id: 'bollinger_bands',
      name: 'bollingerBands',
      displayName: 'Bollinger Bands',
      category: 'volatility',
      description: 'Bollinger Bands consist of a middle band (SMA) and two outer bands. The outer bands are typically 2 standard deviations away from the middle band.',
      parameters: [
        {
          key: 'period',
          label: 'Period',
          type: 'number',
          defaultValue: 200,
          min: 5,
          max: 200,
          step: 1,
          showSlider: true,
          tooltip: 'Number of periods for the moving average',
          description: 'The number of bars used to calculate the moving average and standard deviation'
        },
        {
          key: 'stdDev',
          label: 'Standard Deviations',
          type: 'number',
          defaultValue: 2,
          min: 0.5,
          max: 5,
          step: 0.1,
          showSlider: true,
          tooltip: 'Number of standard deviations for the bands',
          description: 'Multiplier for the standard deviation to determine band width'
        },
        {
          key: 'upperBandColor',
          label: 'Upper Band Color',
          type: 'color',
          defaultValue: '#2196F3',
          tooltip: 'Color for the upper Bollinger Band',
          description: 'Choose the color for the upper resistance band'
        },
        {
          key: 'upperBandThickness',
          label: 'Upper Band Thickness',
          type: 'number',
          defaultValue: 1,
          min: 1,
          max: 5,
          step: 1,
          showSlider: true,
          tooltip: 'Line thickness for the upper band',
          description: 'Thickness of the upper band line'
        },
        {
          key: 'middleBandColor',
          label: 'Middle Band Color',
          type: 'color',
          defaultValue: '#9C27B0',
          tooltip: 'Color for the middle band (SMA)',
          description: 'Choose the color for the middle band (moving average)'
        },
        {
          key: 'middleBandThickness',
          label: 'Middle Band Thickness',
          type: 'number',
          defaultValue: 2,
          min: 1,
          max: 5,
          step: 1,
          showSlider: true,
          tooltip: 'Line thickness for the middle band',
          description: 'Thickness of the middle band line'
        },
        {
          key: 'lowerBandColor',
          label: 'Lower Band Color',
          type: 'color',
          defaultValue: '#2196F3',
          tooltip: 'Color for the lower Bollinger Band',
          description: 'Choose the color for the lower support band'
        },
        {
          key: 'lowerBandThickness',
          label: 'Lower Band Thickness',
          type: 'number',
          defaultValue: 1,
          min: 1,
          max: 5,
          step: 1,
          showSlider: true,
          tooltip: 'Line thickness for the lower band',
          description: 'Thickness of the lower band line'
        }
      ],
      signals: {
        buy: 'Price touches or crosses below the lower band (oversold)',
        sell: 'Price touches or crosses above the upper band (overbought)'
      },
      chartElements: ['upperBand', 'middleBand', 'lowerBand', 'buySignals', 'sellSignals']
    },
    {
      id: 'acceleration_bands',
      name: 'accelerationBands',
      displayName: 'Acceleration Bands',
      category: 'volatility',
      description: 'Acceleration Bands are based on the average trading range and help identify trend acceleration.',
      parameters: [
        {
          key: 'period',
          label: 'Period',
          type: 'number',
          defaultValue: 20,
          min: 5,
          max: 100,
          step: 1,
          showSlider: true
        }
      ],
      signals: {
        buy: 'Price breaks above upper band',
        sell: 'Price breaks below lower band'
      }
    },
    {
      id: 'projection_oscillator',
      name: 'projectionOscillator',
      displayName: 'Projection Oscillator',
      category: 'volatility',
      description: 'Projection Oscillator identifies overbought and oversold conditions.',
      parameters: [
        {
          key: 'period',
          label: 'Period',
          type: 'number',
          defaultValue: 14,
          min: 5,
          max: 50,
          step: 1,
          showSlider: true
        },
        {
          key: 'smooth',
          label: 'Smoothing Period',
          type: 'number',
          defaultValue: 3,
          min: 1,
          max: 10,
          step: 1
        }
      ]
    }
  ],
  momentum: [
    {
      id: 'rsi2',
      name: 'rsi2',
      displayName: 'RSI-2 Strategy',
      category: 'momentum',
      description: 'RSI-2 uses a 2-period Relative Strength Index to identify deeply oversold and overbought conditions.',
      parameters: [
        {
          key: 'oversoldLevel',
          label: 'Oversold Level',
          type: 'number',
          defaultValue: 10,
          min: 5,
          max: 30,
          step: 1,
          showSlider: true,
          description: 'RSI level below which the asset is considered oversold'
        },
        {
          key: 'overboughtLevel',
          label: 'Overbought Level',
          type: 'number',
          defaultValue: 90,
          min: 70,
          max: 95,
          step: 1,
          showSlider: true,
          description: 'RSI level above which the asset is considered overbought'
        }
      ],
      signals: {
        buy: 'RSI < Oversold Level (default: 10)',
        sell: 'RSI > Overbought Level (default: 90)'
      }
    },
    {
      id: 'stochastic',
      name: 'stochasticOscillator',
      displayName: 'Stochastic Oscillator',
      category: 'momentum',
      description: 'Stochastic Oscillator compares closing price to price range over a period.',
      parameters: [
        {
          key: 'kPeriod',
          label: '%K Period',
          type: 'number',
          defaultValue: 14,
          min: 5,
          max: 50,
          step: 1,
          showSlider: true
        },
        {
          key: 'dPeriod',
          label: '%D Period',
          type: 'number',
          defaultValue: 3,
          min: 1,
          max: 10,
          step: 1
        },
        {
          key: 'smooth',
          label: 'Smoothing',
          type: 'number',
          defaultValue: 3,
          min: 1,
          max: 10,
          step: 1
        }
      ],
      signals: {
        buy: '%K crosses above %D in oversold zone (<20)',
        sell: '%K crosses below %D in overbought zone (>80)'
      }
    },
    {
      id: 'awesome_oscillator',
      name: 'awesomeOscillator',
      displayName: 'Awesome Oscillator',
      category: 'momentum',
      description: 'Awesome Oscillator measures market momentum using the difference between 5 and 34 period SMAs.',
      parameters: [
        {
          key: 'fastPeriod',
          label: 'Fast Period',
          type: 'number',
          defaultValue: 5,
          min: 3,
          max: 20,
          step: 1
        },
        {
          key: 'slowPeriod',
          label: 'Slow Period',
          type: 'number',
          defaultValue: 34,
          min: 20,
          max: 100,
          step: 1
        }
      ]
    },
    {
      id: 'williams_r',
      name: 'williamsR',
      displayName: 'Williams %R',
      category: 'momentum',
      description: 'Williams %R is a momentum indicator that measures overbought and oversold levels.',
      parameters: [
        {
          key: 'period',
          label: 'Period',
          type: 'number',
          defaultValue: 14,
          min: 5,
          max: 50,
          step: 1,
          showSlider: true
        }
      ],
      signals: {
        buy: 'Williams %R < -80 (oversold)',
        sell: 'Williams %R > -20 (overbought)'
      }
    },
    {
      id: 'ichimoku_cloud',
      name: 'ichimokuCloud',
      displayName: 'Ichimoku Cloud',
      category: 'momentum',
      description: 'Ichimoku Cloud provides support/resistance levels and trend direction.',
      parameters: [
        {
          key: 'conversionPeriod',
          label: 'Conversion Period',
          type: 'number',
          defaultValue: 9,
          min: 5,
          max: 20,
          step: 1
        },
        {
          key: 'basePeriod',
          label: 'Base Period',
          type: 'number',
          defaultValue: 26,
          min: 20,
          max: 50,
          step: 1
        },
        {
          key: 'spanPeriod',
          label: 'Span Period',
          type: 'number',
          defaultValue: 52,
          min: 40,
          max: 100,
          step: 1
        }
      ]
    }
  ],
  trend: [
    {
      id: 'macd',
      name: 'macd',
      displayName: 'MACD',
      category: 'trend',
      description: 'MACD (Moving Average Convergence Divergence) identifies trend changes through the relationship between two moving averages.',
      parameters: [
        {
          key: 'fastPeriod',
          label: 'Fast Period',
          type: 'number',
          defaultValue: 12,
          min: 5,
          max: 50,
          step: 1,
          showSlider: true
        },
        {
          key: 'slowPeriod',
          label: 'Slow Period',
          type: 'number',
          defaultValue: 26,
          min: 10,
          max: 100,
          step: 1,
          showSlider: true
        },
        {
          key: 'signalPeriod',
          label: 'Signal Period',
          type: 'number',
          defaultValue: 9,
          min: 3,
          max: 30,
          step: 1,
          showSlider: true
        }
      ],
      signals: {
        buy: 'MACD line crosses above signal line',
        sell: 'MACD line crosses below signal line'
      }
    },
    {
      id: 'parabolic_sar',
      name: 'parabolicSar',
      displayName: 'Parabolic SAR',
      category: 'trend',
      description: 'Parabolic SAR provides entry and exit points based on price momentum.',
      parameters: [
        {
          key: 'step',
          label: 'Step',
          type: 'number',
          defaultValue: 0.02,
          min: 0.01,
          max: 0.1,
          step: 0.01,
          showSlider: true
        },
        {
          key: 'max',
          label: 'Maximum',
          type: 'number',
          defaultValue: 0.2,
          min: 0.1,
          max: 0.5,
          step: 0.01
        }
      ],
      signals: {
        buy: 'SAR moves below price',
        sell: 'SAR moves above price'
      }
    },
    {
      id: 'aroon',
      name: 'aroon',
      displayName: 'Aroon',
      category: 'trend',
      description: 'Aroon indicator identifies trend changes and strength.',
      parameters: [
        {
          key: 'period',
          label: 'Period',
          type: 'number',
          defaultValue: 25,
          min: 10,
          max: 100,
          step: 1,
          showSlider: true
        }
      ],
      signals: {
        buy: 'Aroon Up crosses above Aroon Down',
        sell: 'Aroon Down crosses above Aroon Up'
      }
    },
    {
      id: 'vortex',
      name: 'vortex',
      displayName: 'Vortex Indicator',
      category: 'trend',
      description: 'Vortex Indicator identifies the start of new trends.',
      parameters: [
        {
          key: 'period',
          label: 'Period',
          type: 'number',
          defaultValue: 14,
          min: 10,
          max: 50,
          step: 1,
          showSlider: true
        }
      ]
    },
    {
      id: 'kdj',
      name: 'kdj',
      displayName: 'KDJ',
      category: 'trend',
      description: 'KDJ is a variant of Stochastic with an additional J line.',
      parameters: [
        {
          key: 'kPeriod',
          label: 'K Period',
          type: 'number',
          defaultValue: 9,
          min: 5,
          max: 30,
          step: 1
        },
        {
          key: 'dPeriod',
          label: 'D Period',
          type: 'number',
          defaultValue: 3,
          min: 1,
          max: 10,
          step: 1
        }
      ]
    }
  ],
  volume: [
    {
      id: 'money_flow_index',
      name: 'moneyFlowIndex',
      displayName: 'Money Flow Index',
      category: 'volume',
      description: 'Money Flow Index is a momentum indicator that uses price and volume.',
      parameters: [
        {
          key: 'period',
          label: 'Period',
          type: 'number',
          defaultValue: 14,
          min: 5,
          max: 50,
          step: 1,
          showSlider: true
        }
      ],
      signals: {
        buy: 'MFI < 20 (oversold)',
        sell: 'MFI > 80 (overbought)'
      }
    },
    {
      id: 'chaikin_money_flow',
      name: 'chaikinMoneyFlow',
      displayName: 'Chaikin Money Flow',
      category: 'volume',
      description: 'Chaikin Money Flow measures buying and selling pressure.',
      parameters: [
        {
          key: 'period',
          label: 'Period',
          type: 'number',
          defaultValue: 21,
          min: 10,
          max: 100,
          step: 1,
          showSlider: true
        }
      ]
    },
    {
      id: 'volume_weighted_average_price',
      name: 'vwap',
      displayName: 'VWAP',
      category: 'volume',
      description: 'Volume Weighted Average Price gives the average price weighted by volume.',
      parameters: [],
      signals: {
        buy: 'Price crosses above VWAP',
        sell: 'Price crosses below VWAP'
      }
    },
    {
      id: 'force_index',
      name: 'forceIndex',
      displayName: 'Force Index',
      category: 'volume',
      description: 'Force Index combines price and volume to measure buying/selling pressure.',
      parameters: [
        {
          key: 'period',
          label: 'Period',
          type: 'number',
          defaultValue: 13,
          min: 5,
          max: 50,
          step: 1,
          showSlider: true
        }
      ]
    },
    {
      id: 'ease_of_movement',
      name: 'easeOfMovement',
      displayName: 'Ease of Movement',
      category: 'volume',
      description: 'Ease of Movement relates price change to volume.',
      parameters: [
        {
          key: 'period',
          label: 'Period',
          type: 'number',
          defaultValue: 14,
          min: 5,
          max: 50,
          step: 1,
          showSlider: true
        }
      ]
    },
    {
      id: 'negative_volume_index',
      name: 'negativeVolumeIndex',
      displayName: 'Negative Volume Index',
      category: 'volume',
      description: 'NVI tracks price changes on days with decreasing volume.',
      parameters: []
    }
  ]
};

// Helper function to get strategy by ID
export const getStrategyById = (strategyId) => {
  for (const category of Object.values(strategyRegistry)) {
    const strategy = category.find(s => s.id === strategyId);
    if (strategy) return strategy;
  }
  return null;
};

// Helper function to get default config for a strategy
export const getDefaultConfig = (strategyId) => {
  const strategy = getStrategyById(strategyId);
  if (!strategy) return {};

  const config = {};
  strategy.parameters.forEach(param => {
    config[param.key] = param.defaultValue;
  });
  return config;
};