// Symbol and contract conversion utilities

/**
 * Convert product ID to API symbol format
 * @param {string} productId - Product ID (e.g., 'F.US.MNQ')
 * @returns {string} API symbol format (e.g., '%2FMNQ')
 */
export const convertProductIdToSymbol = (productId) => {
  if (!productId) return '';
  
  // If already in API format, return as is
  if (productId.startsWith('%2F')) {
    return productId;
  }
  
  // Handle F.US.XXX format
  if (productId.startsWith('F.US.')) {
    const baseSymbol = productId.replace('F.US.', '');
    return '%2F' + baseSymbol;
  }
  
  // Handle /XXX format
  if (productId.startsWith('/')) {
    return '%2F' + productId.substring(1);
  }
  
  // Default: assume it's just the symbol
  return '%2F' + productId;
};

/**
 * Convert API symbol to display format
 * @param {string} symbol - API symbol (e.g., '%2FMNQ')
 * @returns {string} Display format (e.g., '/MNQ')
 */
export const convertSymbolToDisplay = (symbol) => {
  if (!symbol) return '';
  
  // Replace URL encoded slash
  if (symbol.startsWith('%2F')) {
    return '/' + symbol.substring(3);
  }
  
  // If already has slash, return as is
  if (symbol.startsWith('/')) {
    return symbol;
  }
  
  // Default: add slash
  return '/' + symbol;
};

/**
 * Extract base symbol from various formats
 * @param {string} input - Input in any format
 * @returns {string} Base symbol (e.g., 'MNQ')
 */
export const extractBaseSymbol = (input) => {
  if (!input) return '';
  
  // Remove common prefixes
  let symbol = input;
  
  if (symbol.startsWith('F.US.')) {
    symbol = symbol.replace('F.US.', '');
  } else if (symbol.startsWith('%2F')) {
    symbol = symbol.substring(3);
  } else if (symbol.startsWith('/')) {
    symbol = symbol.substring(1);
  }
  
  return symbol;
};

/**
 * Validate and normalize contract info
 * @param {Object} contractInfo - Contract information object
 * @returns {Object} Normalized contract info
 */
export const normalizeContractInfo = (contractInfo) => {
  if (!contractInfo) return null;
  
  return {
    symbol: contractInfo.symbol || contractInfo.name || '',
    productId: contractInfo.product_id || contractInfo.productId || '',
    exchange: contractInfo.exchange || '',
    description: contractInfo.description || contractInfo.product_name || '',
    tickSize: contractInfo.tick_size || contractInfo.tickSize || 0.25,
    pointValue: contractInfo.point_value || contractInfo.pointValue || 1
  };
};