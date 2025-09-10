import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const predefinedColors = [
  { name: 'Cyber Blue', value: '#00d4ff', rgb: '0, 212, 255' },
  { name: 'Electric Purple', value: '#8b5cf6', rgb: '139, 92, 246' },
  { name: 'Neon Green', value: '#10b981', rgb: '16, 185, 129' },
  { name: 'Hot Pink', value: '#ec4899', rgb: '236, 72, 153' },
  { name: 'Orange Flame', value: '#f59e0b', rgb: '245, 158, 11' },
  { name: 'Red Alert', value: '#ef4444', rgb: '239, 68, 68' },
  { name: 'Teal Wave', value: '#14b8a6', rgb: '20, 184, 166' },
  { name: 'Violet Storm', value: '#7c3aed', rgb: '124, 58, 237' },
  { name: 'Gold Rush', value: '#eab308', rgb: '234, 179, 8' },
  { name: 'Emerald Matrix', value: '#059669', rgb: '5, 150, 105' }
];

export const ThemeProvider = ({ children }) => {
  const [primaryColor, setPrimaryColor] = useState('#00d4ff');
  const [primaryColorRgb, setPrimaryColorRgb] = useState('0, 212, 255');
  const [isDynamicMode, setIsDynamicMode] = useState(false);
  const [currentColorIndex, setCurrentColorIndex] = useState(0);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedColor = localStorage.getItem('theme-primary-color');
    const savedColorRgb = localStorage.getItem('theme-primary-color-rgb');
    const savedDynamicMode = localStorage.getItem('theme-dynamic-mode') === 'true';
    
    if (savedColor && savedColorRgb) {
      setPrimaryColor(savedColor);
      setPrimaryColorRgb(savedColorRgb);
      updateCSSVariables(savedColor, savedColorRgb);
    } else {
      updateCSSVariables(primaryColor, primaryColorRgb);
    }
    
    setIsDynamicMode(savedDynamicMode);
  }, []);

  // Dynamic mode effect - cycle through colors every 15 seconds
  useEffect(() => {
    let interval;
    if (isDynamicMode) {
      interval = setInterval(() => {
        setCurrentColorIndex((prevIndex) => {
          const nextIndex = (prevIndex + 1) % predefinedColors.length;
          const nextColor = predefinedColors[nextIndex];
          setPrimaryColor(nextColor.value);
          setPrimaryColorRgb(nextColor.rgb);
          updateCSSVariables(nextColor.value, nextColor.rgb);
          return nextIndex;
        });
      }, 15000); // 15 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isDynamicMode]);

  const updateCSSVariables = (color, colorRgb) => {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', color);
    root.style.setProperty('--primary-color-rgb', colorRgb);
    
    // Create variations
    root.style.setProperty('--primary-color-10', `rgba(${colorRgb}, 0.1)`);
    root.style.setProperty('--primary-color-20', `rgba(${colorRgb}, 0.2)`);
    root.style.setProperty('--primary-color-30', `rgba(${colorRgb}, 0.3)`);
    root.style.setProperty('--primary-color-50', `rgba(${colorRgb}, 0.5)`);
    root.style.setProperty('--primary-color-70', `rgba(${colorRgb}, 0.7)`);
    root.style.setProperty('--primary-color-80', `rgba(${colorRgb}, 0.8)`);
  };

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      return `${r}, ${g}, ${b}`;
    }
    return '0, 212, 255'; // fallback
  };

  const changeThemeColor = (color) => {
    // Turn off dynamic mode when manually selecting a color
    if (isDynamicMode) {
      setIsDynamicMode(false);
      localStorage.setItem('theme-dynamic-mode', 'false');
    }
    
    const colorRgb = hexToRgb(color);
    setPrimaryColor(color);
    setPrimaryColorRgb(colorRgb);
    updateCSSVariables(color, colorRgb);
    
    // Save to localStorage
    localStorage.setItem('theme-primary-color', color);
    localStorage.setItem('theme-primary-color-rgb', colorRgb);
  };

  const toggleDynamicMode = () => {
    const newDynamicMode = !isDynamicMode;
    setIsDynamicMode(newDynamicMode);
    localStorage.setItem('theme-dynamic-mode', newDynamicMode.toString());
    
    if (newDynamicMode) {
      // Start with the first color immediately
      const firstColor = predefinedColors[0];
      setPrimaryColor(firstColor.value);
      setPrimaryColorRgb(firstColor.rgb);
      updateCSSVariables(firstColor.value, firstColor.rgb);
      setCurrentColorIndex(0);
    }
  };

  const resetToDefault = () => {
    const defaultColor = '#00d4ff';
    const defaultColorRgb = '0, 212, 255';
    setIsDynamicMode(false);
    localStorage.setItem('theme-dynamic-mode', 'false');
    changeThemeColor(defaultColor);
  };

  return (
    <ThemeContext.Provider value={{
      primaryColor,
      primaryColorRgb,
      predefinedColors,
      isDynamicMode,
      currentColorIndex,
      changeThemeColor,
      toggleDynamicMode,
      resetToDefault
    }}>
      {children}
    </ThemeContext.Provider>
  );
};