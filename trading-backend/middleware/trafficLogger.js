const fs = require('fs');
const path = require('path');

const TRAFFIC_LOG_FILE = path.join(__dirname, '..', 'data', 'traffic_logs.json');
const MAX_LOG_ENTRIES = 10000; // Keep last 10,000 entries

// Categorize traffic based on endpoint
function categorizeEndpoint(url) {
  if (url.startsWith('/webhook/')) return 'Webhook';
  if (url.startsWith('/api/')) return 'Backend API';
  return 'Frontend API';
}

// Extract trading-specific data from request
function extractTradingData(body, url) {
  const data = {
    accountName: body?.accountName || 'Unknown',
    symbol: body?.symbol || body?.ticker || 'UNKNOWN',
    action: body?.action || body?.side || 'UNKNOWN',
    quantity: body?.quantity || body?.qty || null,
    orderType: body?.orderType || 'UNKNOWN',
    price: body?.limitPrice || body?.price || null
  };

  // Handle webhook close/flatten/reverse endpoints
  if (url.includes('/close')) data.action = 'CLOSE';
  if (url.includes('/flatten')) data.action = 'FLATTEN';
  if (url.includes('/reverse')) data.action = 'REVERSE';

  return data;
}

// Read existing logs from file
function readLogs() {
  try {
    if (!fs.existsSync(TRAFFIC_LOG_FILE)) {
      return [];
    }
    const data = fs.readFileSync(TRAFFIC_LOG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[TRAFFIC] Error reading traffic logs:', error.message);
    return [];
  }
}

// Write logs to file
function writeLogs(logs) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(TRAFFIC_LOG_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Keep only last MAX_LOG_ENTRIES
    const logsToWrite = logs.slice(-MAX_LOG_ENTRIES);

    fs.writeFileSync(TRAFFIC_LOG_FILE, JSON.stringify(logsToWrite, null, 2));
  } catch (error) {
    console.error('[TRAFFIC] Error writing traffic logs:', error.message);
  }
}

// Check if request should be logged
function shouldLogRequest(url, method) {
  // Always skip these endpoints
  const skipEndpoints = ['/api/docs', '/api/health', '/api/traffic'];
  if (skipEndpoints.some(endpoint => url.startsWith(endpoint))) {
    return false;
  }

  // Always log all webhook requests
  if (url.startsWith('/webhook/')) {
    return true;
  }

  // For Backend API, only log specific endpoints
  if (url.startsWith('/api/')) {
    const allowedEndpoints = [
      '/api/orders/place',      // Unified place order endpoint
      '/api/positions/close',   // Close position
      '/api/positions/flatten', // Flatten all positions
      '/api/positions/reverse'  // Reverse position
    ];

    // Check if URL matches any allowed endpoint
    return allowedEndpoints.some(endpoint => url.startsWith(endpoint));
  }

  return false;
}

// Middleware function
function trafficLogger(req, res, next) {
  // Check if this request should be logged
  if (!shouldLogRequest(req.url, req.method)) {
    return next();
  }

  const startTime = Date.now();
  const logEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    category: categorizeEndpoint(req.url),
    method: req.method,
    endpoint: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    requestPayload: req.body || {},
    responseData: null,
    status: null,
    statusCode: null,
    latency: null
  };

  // Extract trading data
  const tradingData = extractTradingData(req.body || {}, req.url);
  Object.assign(logEntry, tradingData);

  // Flag to prevent double logging
  let logged = false;

  // Function to save log
  const saveLog = () => {
    if (logged) return; // Prevent duplicate saves
    logged = true;

    setImmediate(() => {
      try {
        const logs = readLogs();
        logs.push(logEntry);
        writeLogs(logs);
      } catch (error) {
        console.error('[TRAFFIC] Error saving log:', error.message);
      }
    });
  };

  // Capture the original res.json and res.send methods
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  // Override res.json to capture response
  res.json = function(data) {
    const endTime = Date.now();
    logEntry.latency = endTime - startTime;
    logEntry.statusCode = res.statusCode;
    logEntry.status = res.statusCode >= 200 && res.statusCode < 300 ? 'Success' : 'Error';
    logEntry.responseData = data;

    saveLog();
    return originalJson(data);
  };

  // Override res.send as fallback
  res.send = function(data) {
    const endTime = Date.now();
    logEntry.latency = endTime - startTime;
    logEntry.statusCode = res.statusCode;
    logEntry.status = res.statusCode >= 200 && res.statusCode < 300 ? 'Success' : 'Error';

    try {
      logEntry.responseData = JSON.parse(data);
    } catch {
      logEntry.responseData = data;
    }

    saveLog();
    return originalSend(data);
  };

  next();
}

module.exports = { trafficLogger, readLogs, writeLogs };
