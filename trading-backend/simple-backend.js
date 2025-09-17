const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { spawn } = require('child_process');

const app = express();
const port = 8000;

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Serve static files from src/realtime directory
app.use('/chart-assets', express.static(path.join(__dirname, '../src/realtime')));

// Provider Configuration
const PROVIDER_CONFIG = {
  topstep: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjE5NDY5OSIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL3NpZCI6IjYzYzBjYTZhLWQxYTgtNDBjNS04MWViLWY1YTA0NGQ0ZjU0NiIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWUiOiJzdW1vbmV5MSIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6InVzZXIiLCJtc2QiOiJDTUVHUk9VUF9UT0IiLCJtZmEiOiJ2ZXJpZmllZCIsImV4cCI6MTc1ODA2MzYzNH0.HRx9bQw0GfM3pGfyTmtfusdPx6kW3wLp5k-HyByyLjs',
    apiUrl: 'https://userapi.topstepx.com/UserContract/active/nonprofesional'
  }
  // Add other providers here as needed
};

// Current provider (configurable)
const CURRENT_PROVIDER = 'topstep';

// PostgreSQL Database connection
const pool = new Pool({
  user: 'techuser',
  host: 'localhost',
  database: 'techanalysis',
  password: 'techanalysis2024',
  port: 5432,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error acquiring client', err.stack);
  } else {
    console.log('✅ Connected to PostgreSQL database');
    release();
  }
});

const CONTRACTS_FILE = path.join(__dirname, 'tradableContracts.json');
const STRATEGIES_FILE = path.join(__dirname, 'strategies.json');

// Fetch contracts from provider and cache them
async function loadContracts(provider = CURRENT_PROVIDER) {
  try {
    const providerConfig = PROVIDER_CONFIG[provider];
    if (!providerConfig) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    console.log(`Loading contracts from ${provider.toUpperCase()} API...`);
    
    const response = await axios.get(providerConfig.apiUrl, {
      headers: { 'Authorization': `Bearer ${providerConfig.token}` }
    });

    const contracts = response.data.map(contract => ({
      // Core identification fields
      product_id: contract.productId,
      product_name: contract.productName,
      contract_id: contract.contractId,
      contract_name: contract.contractName,
      symbol: contract.productName ? contract.productName.replace('/', '') : '',
      name: contract.description,
      description: contract.description,
      exchange: contract.exchange,
      category: 'Futures',
      
      // Pricing and tick information
      tick_value: contract.tickValue,
      tick_size: contract.tickSize,
      point_value: contract.pointValue,
      decimal_places: contract.decimalPlaces,
      price_scale: contract.priceScale,
      min_move: contract.minMove,
      min_move2: contract.minMove2,
      fractional_price: contract.fractionalPrice,
      
      // Fee information
      exchange_fee: contract.exchangeFee,
      regulatory_fee: contract.regulatoryFee,
      commission_fee: contract.commissionFee,
      total_fees: contract.totalFees,
      
      // Status and configuration
      disabled: contract.disabled,
      is_professional: contract.isProfessional,
      
      // Metadata
      provider: provider,
      last_updated: new Date().toISOString()
    }));

    // Save to file
    fs.writeFileSync(CONTRACTS_FILE, JSON.stringify(contracts, null, 2));
    console.log(`✅ Saved ${contracts.length} contracts from ${provider.toUpperCase()} to ${CONTRACTS_FILE}`);
    
    return contracts;
  } catch (error) {
    console.error(`❌ Failed to load contracts from ${provider.toUpperCase()}:`, error.message);
    throw error;
  }
}

// Contract lookup method - find product_id by contract name variations
function lookupContractProductId(contractName) {
  try {
    if (!fs.existsSync(CONTRACTS_FILE)) {
      throw new Error('Contracts file not found. Please ensure contracts are loaded first.');
    }
    
    const contracts = JSON.parse(fs.readFileSync(CONTRACTS_FILE, 'utf8'));
    
    // Clean and normalize the input contract name
    const cleanContractName = contractName.trim().toUpperCase();
    
    // Try multiple matching strategies
    for (const contract of contracts) {
      // Strategy 1: Direct match with product_name (e.g., "/MNQ")
      if (contract.product_name && contract.product_name.toUpperCase() === cleanContractName) {
        return {
          success: true,
          product_id: contract.product_id,
          matched_field: 'product_name',
          matched_value: contract.product_name,
          contract_info: contract
        };
      }
      
      // Strategy 2: Match with product_name without leading slash (e.g., "MNQ" matches "/MNQ")
      if (contract.product_name && contract.product_name.replace('/', '').toUpperCase() === cleanContractName) {
        return {
          success: true,
          product_id: contract.product_id,
          matched_field: 'product_name',
          matched_value: contract.product_name,
          contract_info: contract
        };
      }
      
      // Strategy 3: Match with symbol (e.g., "MNQ")
      if (contract.symbol && contract.symbol.toUpperCase() === cleanContractName) {
        return {
          success: true,
          product_id: contract.product_id,
          matched_field: 'symbol',
          matched_value: contract.symbol,
          contract_info: contract
        };
      }
      
      // Strategy 4: Match with contract_name (e.g., "MNQU25")
      if (contract.contract_name && contract.contract_name.toUpperCase() === cleanContractName) {
        return {
          success: true,
          product_id: contract.product_id,
          matched_field: 'contract_name',
          matched_value: contract.contract_name,
          contract_info: contract
        };
      }
      
      // Strategy 5: Match with exchange field (e.g., "/MNQ")
      if (contract.exchange && contract.exchange.toUpperCase() === cleanContractName) {
        return {
          success: true,
          product_id: contract.product_id,
          matched_field: 'exchange',
          matched_value: contract.exchange,
          contract_info: contract
        };
      }
      
      // Strategy 6: Handle variations like "MNQ1!" by matching base symbol
      const baseSymbol = cleanContractName.replace(/[0-9!]+$/, ''); // Remove trailing numbers and !
      if (contract.symbol && contract.symbol.toUpperCase() === baseSymbol) {
        return {
          success: true,
          product_id: contract.product_id,
          matched_field: 'symbol_base',
          matched_value: contract.symbol,
          contract_info: contract
        };
      }
    }
    
    // No match found
    return {
      success: false,
      error: `Contract not found for: ${contractName}`,
      searched_term: cleanContractName
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Error looking up contract: ${error.message}`
    };
  }
}

// Contracts API - read from cached file
app.get('/api/contracts', (req, res) => {
  try {
    if (!fs.existsSync(CONTRACTS_FILE)) {
      return res.status(500).json({ 
        success: false, 
        error: 'Contracts file not found. Server may be starting up.' 
      });
    }
    
    const contracts = JSON.parse(fs.readFileSync(CONTRACTS_FILE, 'utf8'));
    
    res.json({
      success: true,
      contracts: contracts,
      count: contracts.length,
      source: 'cached_file'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Contract lookup API - find product_id by contract name
app.get('/api/contracts/lookup/:contractName', (req, res) => {
  try {
    const { contractName } = req.params;
    
    if (!contractName) {
      return res.status(400).json({
        success: false,
        error: 'Contract name parameter is required'
      });
    }
    
    const result = lookupContractProductId(contractName);
    
    if (result.success) {
      res.json({
        success: true,
        product_id: result.product_id,
        matched_field: result.matched_field,
        matched_value: result.matched_value,
        contract_info: result.contract_info
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
        searched_term: result.searched_term
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Bulk contract lookup API - find multiple product_ids
app.post('/api/contracts/lookup', (req, res) => {
  try {
    const { contractNames } = req.body;
    
    if (!Array.isArray(contractNames)) {
      return res.status(400).json({
        success: false,
        error: 'contractNames must be an array'
      });
    }
    
    const results = contractNames.map(contractName => {
      const result = lookupContractProductId(contractName);
      return {
        input: contractName,
        ...result
      };
    });
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    res.json({
      success: true,
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      results: results
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all strategies
app.get('/api/strategies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, strategy_type, contract_symbol, contract_name, 
             timeframe, webhook_url, webhook_payload, 
             status, created_at, updated_at
      FROM strategies 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('❌ Error fetching strategies:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create new strategy
app.post('/api/strategies', async (req, res) => {
  try {
    const {
      name,
      strategy_type,
      contract_symbol,
      contract_name,
      timeframe,
      webhook_url,
      webhook_payload
    } = req.body;

    const result = await pool.query(`
      INSERT INTO strategies (
        name, strategy_type, contract_symbol, contract_name, 
        timeframe, webhook_url, webhook_payload,
        status, created_by
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'inactive', 'system')
      RETURNING *
    `, [
      name, strategy_type, contract_symbol, contract_name,
      timeframe, webhook_url, 
      webhook_payload ? JSON.stringify(webhook_payload) : null
    ]);

    res.json({
      success: true,
      message: 'Strategy saved successfully',
      data: result.rows[0],
      id: result.rows[0].id
    });
  } catch (error) {
    console.error('❌ Error creating strategy:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update strategy status (PUT)
app.put('/api/strategies/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(`
      UPDATE strategies 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Strategy not found'
      });
    }

    res.json({
      success: true,
      message: 'Strategy status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating strategy status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update strategy status (PATCH) - same functionality as PUT for frontend compatibility
app.patch('/api/strategies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(`
      UPDATE strategies 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Strategy not found'
      });
    }

    res.json({
      success: true,
      message: 'Strategy status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating strategy status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update strategy (PUT) - full update
app.put('/api/strategies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      strategy_type,
      contract_symbol,
      contract_name,
      timeframe,
      webhook_url,
      webhook_payload,
      chart_type,
      brick_size,
      chart_config
    } = req.body;

    const result = await pool.query(`
      UPDATE strategies
      SET name = $1, strategy_type = $2, contract_symbol = $3, contract_name = $4,
          timeframe = $5, webhook_url = $6, webhook_payload = $7,
          chart_type = $8, brick_size = $9, chart_config = $10,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `, [
      name, strategy_type, contract_symbol, contract_name,
      timeframe, webhook_url,
      webhook_payload ? JSON.stringify(webhook_payload) : null,
      chart_type, brick_size,
      chart_config ? JSON.stringify(chart_config) : null,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Strategy not found'
      });
    }

    res.json({
      success: true,
      message: 'Strategy updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete strategy
app.delete('/api/strategies/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM strategies
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Strategy not found'
      });
    }

    res.json({
      success: true,
      message: 'Strategy deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error deleting strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve the TradingView chart files
app.get('/api/chart', (req, res) => {
  try {
    const htmlPath = path.join(__dirname, '../src/realtime/index.html');
    if (!fs.existsSync(htmlPath)) {
      return res.status(404).json({
        success: false,
        error: 'Chart HTML file not found'
      });
    }

    // Read the HTML file and modify the script src to use the correct path
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Replace the relative path with the full path to the static assets
    htmlContent = htmlContent.replace(
      'src="index.js"',
      'src="/chart-assets/index.js"'
    );

    // Add a small script to handle the loading order issue
    const loadingScript = `
      <script>
        // Temporarily disable the onchange handlers until index.js loads
        document.addEventListener('DOMContentLoaded', function() {
          const selects = document.querySelectorAll('select[onchange]');
          selects.forEach(select => {
            const originalHandler = select.getAttribute('onchange');
            select.removeAttribute('onchange');
            select.setAttribute('data-original-onchange', originalHandler);
          });
        });

        // Re-enable handlers after index.js loads
        window.addEventListener('load', function() {
          setTimeout(() => {
            const selects = document.querySelectorAll('select[data-original-onchange]');
            selects.forEach(select => {
              const originalHandler = select.getAttribute('data-original-onchange');
              select.setAttribute('onchange', originalHandler);
              select.removeAttribute('data-original-onchange');
            });
          }, 100);
        });
      </script>
    `;

    // Insert the loading script before the closing head tag
    htmlContent = htmlContent.replace('</head>', loadingScript + '</head>');

    // Set proper content type
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  } catch (error) {
    console.error('❌ Error serving chart HTML:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Launch TradingView chart in browser
app.post('/api/launch-chart', (req, res) => {
  try {
    const chartUrl = `http://localhost:${port}/api/chart`;

    // Launch in default browser based on platform
    let command;
    const args = [chartUrl];

    switch (process.platform) {
      case 'darwin': // macOS
        command = 'open';
        break;
      case 'win32': // Windows
        command = 'start';
        args.unshift('');
        break;
      default: // Linux and others
        command = 'xdg-open';
        break;
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    console.log(`🚀 Launched chart in browser: ${chartUrl}`);

    res.json({
      success: true,
      message: 'Chart launched in browser successfully',
      url: chartUrl
    });
  } catch (error) {
    console.error('❌ Error launching chart:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Initialize contracts on startup
async function initializeServer() {
  try {
    // Check if contracts file already exists
    if (fs.existsSync(CONTRACTS_FILE)) {
      const contracts = JSON.parse(fs.readFileSync(CONTRACTS_FILE, 'utf8'));
      console.log(`✅ Found existing contracts file with ${contracts.length} contracts`);
    } else {
      console.log(`📥 No existing contracts file found, fetching from ${CURRENT_PROVIDER.toUpperCase()}...`);
      await loadContracts();
    }
    
    app.listen(port, () => {
      console.log(`🚀 Backend running on http://localhost:${port}`);
      console.log(`📄 Contracts cached in: ${CONTRACTS_FILE}`);
    });
  } catch (error) {
    console.error('❌ Failed to initialize server:', error.message);
    process.exit(1);
  }
}

initializeServer();