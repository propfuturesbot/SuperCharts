// Resolution configuration for all supported timeframes
export const resolutionConfig = {
  // Tick-based resolutions
  '100T': { 
    countback: 50, 
    displayName: '100 Ticks', 
    group: 'Ticks',
    symbol: 'F.US.MNQ' 
  },
  '500T': { 
    countback: 50, 
    displayName: '500 Ticks', 
    group: 'Ticks',
    symbol: 'F.US.MNQ' 
  },
  '1000T': { 
    countback: 50, 
    displayName: '1000 Ticks', 
    group: 'Ticks',
    symbol: 'F.US.MNQ' 
  },
  '5000T': { 
    countback: 50, 
    displayName: '5000 Ticks', 
    group: 'Ticks',
    symbol: 'F.US.MNQ' 
  },
  
  // Second-based resolutions
  '1S': { 
    countback: 500, 
    displayName: '1 Second', 
    group: 'Seconds',
    symbol: 'F.US.MNQ' 
  },
  '5S': { 
    countback: 500, 
    displayName: '5 Seconds', 
    group: 'Seconds',
    symbol: 'F.US.MNQ' 
  },
  '10S': { 
    countback: 500, 
    displayName: '10 Seconds', 
    group: 'Seconds',
    symbol: 'F.US.MNQ' 
  },
  '15S': { 
    countback: 500, 
    displayName: '15 Seconds', 
    group: 'Seconds',
    symbol: 'F.US.MNQ' 
  },
  '20S': { 
    countback: 500, 
    displayName: '20 Seconds', 
    group: 'Seconds',
    symbol: 'F.US.MNQ' 
  },
  '30S': { 
    countback: 500, 
    displayName: '30 Seconds', 
    group: 'Seconds',
    symbol: 'F.US.MNQ' 
  },
  
  // Minute-based resolutions
  '1': { 
    countback: 500, 
    displayName: '1 Minute', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  '2': { 
    countback: 500, 
    displayName: '2 Minutes', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  '3': { 
    countback: 500, 
    displayName: '3 Minutes', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  '4': { 
    countback: 500, 
    displayName: '4 Minutes', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  '5': { 
    countback: 500, 
    displayName: '5 Minutes', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  '10': { 
    countback: 500, 
    displayName: '10 Minutes', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  '15': { 
    countback: 500, 
    displayName: '15 Minutes', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  '20': { 
    countback: 500, 
    displayName: '20 Minutes', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  '30': { 
    countback: 500, 
    displayName: '30 Minutes', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  '45': { 
    countback: 500, 
    displayName: '45 Minutes', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  '60': { 
    countback: 500, 
    displayName: '1 Hour', 
    group: 'Minutes',
    symbol: 'F.US.MNQ' 
  },
  
  // Day/Week/Month resolutions
  '1D': { 
    countback: 326, 
    displayName: '1 Day', 
    group: 'Extended',
    symbol: 'F.US.MNQ' 
  },
  '1W': { 
    countback: 500, 
    displayName: '1 Week', 
    group: 'Extended',
    symbol: 'F.US.MNQ' 
  },
  '1M': { 
    countback: 500, 
    displayName: '1 Month', 
    group: 'Extended',
    symbol: 'F.US.MNQ' 
  }
};

// Get ticks per bar for tick-based resolutions
export const getTicksPerBar = (resolution) => {
  if (!resolution.endsWith('T')) return 10;
  
  const tickValue = parseInt(resolution.replace('T', ''));
  
  switch (tickValue) {
    case 100: return 5;   // 100T: accumulate 5 individual ticks per bar
    case 500: return 15;  // 500T: accumulate 15 individual ticks per bar
    case 1000: return 25; // 1000T: accumulate 25 individual ticks per bar
    case 5000: return 50; // 5000T: accumulate 50 individual ticks per bar
    default: return Math.max(5, Math.min(50, Math.floor(tickValue / 20)));
  }
};

// Get grouped resolutions for UI
export const getGroupedResolutions = () => {
  const groups = {};
  
  Object.entries(resolutionConfig).forEach(([key, config]) => {
    if (!groups[config.group]) {
      groups[config.group] = [];
    }
    groups[config.group].push({
      value: key,
      label: config.displayName
    });
  });
  
  return groups;
};