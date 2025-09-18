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

    // If chart configuration is provided, embed it in webhook_payload
    let finalWebhookPayload = webhook_payload;

    if (chart_type || brick_size || chart_config) {
      const enhancedPayload = {
        chart_configuration: {
          chart_type: chart_type || strategy_type,
          brick_size: brick_size,
          timeframe: timeframe,
          ...chart_config
        },
        original_payload: webhook_payload || {}
      };
      finalWebhookPayload = enhancedPayload;
    }

    const result = await pool.query(`
      UPDATE strategies
      SET name = $1, strategy_type = $2, contract_symbol = $3, contract_name = $4,
          timeframe = $5, webhook_url = $6, webhook_payload = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [
      name,
      chart_type || strategy_type, // Use chart_type as strategy_type if provided
      contract_symbol,
      contract_name || contract_symbol,
      timeframe,
      webhook_url,
      finalWebhookPayload ? JSON.stringify(finalWebhookPayload) : null,
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

// Store chart configuration temporarily
let currentChartConfig = {
  strategyType: 'candlestick',
  timeframe: '15',
  brickSize: '0.25',
  contractSymbol: '/MNQ',
  strategyName: 'Default'
};

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

    // Inject the chart configuration into the HTML
    const configScript = `
      <script>
        // Configuration passed from strategy wizard
        window.CHART_CONFIG = ${JSON.stringify(currentChartConfig)};
        console.log('Chart configuration:', window.CHART_CONFIG);

        // Add debug function to monitor brick size
        window.debugBrickSize = function() {
          const brickSizeInput = document.getElementById('brickSize');
          console.log('=== BRICK SIZE DEBUG ===');
          console.log('Config brick size:', window.CHART_CONFIG.brickSize);
          console.log('Input field value:', brickSizeInput ? brickSizeInput.value : 'Input not found');
          console.log('window.currentBrickSize:', window.currentBrickSize);
          console.log('Current chart type:', window.currentChartType);
          console.log('========================');
        };

        // Override initial chart settings after page loads
        window.addEventListener('load', function() {
          setTimeout(() => {
            // Map strategy types to chart types
            const chartTypeMap = {
              'candlestick': 'candlestick',
              'heiken_ashi': 'heikenashi',
              'renko': 'renko'
            };

            // Set the chart type
            const chartType = chartTypeMap[window.CHART_CONFIG.strategyType] || 'candlestick';
            const chartTypeSelect = document.getElementById('chartType');
            if (chartTypeSelect && window.changeChartType) {
              console.log('Setting chart type to:', chartType);
              chartTypeSelect.value = chartType;

              // For Renko charts, set the brick size BEFORE changing chart type
              if (chartType === 'renko' && window.CHART_CONFIG.brickSize) {
                console.log('Setting Renko brick size to:', window.CHART_CONFIG.brickSize);

                // Set global brick size variable if it exists
                if (typeof window.currentBrickSize !== 'undefined') {
                  window.currentBrickSize = parseFloat(window.CHART_CONFIG.brickSize);
                }

                // Set the brick size input field
                const brickSizeInput = document.getElementById('brickSize');
                if (brickSizeInput) {
                  brickSizeInput.value = window.CHART_CONFIG.brickSize;
                  console.log('Brick size input set to:', brickSizeInput.value);
                }

                // Set any other brick size related variables
                if (typeof window.setBrickSize === 'function') {
                  window.setBrickSize(parseFloat(window.CHART_CONFIG.brickSize));
                }
              }

              // Now change the chart type
              window.changeChartType(chartType);
            }

            // Set the resolution/timeframe after a short delay
            setTimeout(() => {
              const resolutionSelect = document.getElementById('resolution');
              if (resolutionSelect && window.changeResolution) {
                console.log('Setting resolution to:', window.CHART_CONFIG.timeframe);
                resolutionSelect.value = window.CHART_CONFIG.timeframe;
                window.changeResolution(window.CHART_CONFIG.timeframe);
              }

              // For Renko charts, ensure brick size is applied after resolution change
              if (chartType === 'renko' && window.CHART_CONFIG.brickSize) {
                setTimeout(() => {
                  console.log('Re-applying Renko brick size after resolution change:', window.CHART_CONFIG.brickSize);

                  // Re-set brick size variables after resolution change
                  if (typeof window.currentBrickSize !== 'undefined') {
                    window.currentBrickSize = parseFloat(window.CHART_CONFIG.brickSize);
                  }

                  // Re-set the brick size input field in case it was reset
                  const brickSizeInput = document.getElementById('brickSize');
                  if (brickSizeInput) {
                    brickSizeInput.value = window.CHART_CONFIG.brickSize;

                    // Trigger change event to ensure it's processed
                    const changeEvent = new Event('change', { bubbles: true });
                    brickSizeInput.dispatchEvent(changeEvent);

                    const inputEvent = new Event('input', { bubbles: true });
                    brickSizeInput.dispatchEvent(inputEvent);

                    // Look for and click any Apply button for brick size
                    const applyButton = document.querySelector('#applyBrickSize, .apply-brick-size, button[onclick*="brick"], button[onclick*="Brick"]');
                    if (applyButton) {
                      console.log('Found Apply button for brick size, clicking it');
                      applyButton.click();
                    }

                    // Also try looking for any button near the brick size input
                    const parentElement = brickSizeInput.closest('.brick-size-container, .input-group, .form-group, div');
                    if (parentElement) {
                      const nearbyButton = parentElement.querySelector('button, input[type="button"]');
                      if (nearbyButton && (nearbyButton.textContent.toLowerCase().includes('apply') ||
                                          nearbyButton.textContent.toLowerCase().includes('update') ||
                                          nearbyButton.getAttribute('onclick')?.includes('brick'))) {
                        console.log('Found nearby Apply button, clicking it');
                        nearbyButton.click();
                      }
                    }

                    // Force focus and blur to ensure the input is processed
                    brickSizeInput.focus();
                    setTimeout(() => {
                      brickSizeInput.blur();
                    }, 50);
                  }

                  // Call any brick size update functions
                  if (typeof window.setBrickSize === 'function') {
                    window.setBrickSize(parseFloat(window.CHART_CONFIG.brickSize));
                  }

                  if (typeof window.updateBrickSize === 'function') {
                    window.updateBrickSize(parseFloat(window.CHART_CONFIG.brickSize));
                  }

                  // Force Renko data regeneration if function exists
                  if (typeof window.regenerateRenkoData === 'function') {
                    window.regenerateRenkoData();
                  }

                  // Additional aggressive methods to force brick size update
                  setTimeout(() => {
                    // Try pressing Enter on the brick size input
                    const brickSizeInput = document.getElementById('brickSize');
                    if (brickSizeInput) {
                      const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        bubbles: true
                      });
                      brickSizeInput.dispatchEvent(enterEvent);

                      const enterUpEvent = new KeyboardEvent('keyup', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        bubbles: true
                      });
                      brickSizeInput.dispatchEvent(enterUpEvent);
                    }

                    // Force chart data reload with the new brick size
                    if (window.historicalData && window.historicalData.length > 0 && window.convertToRenko) {
                      console.log('Force regenerating Renko data with brick size:', window.CHART_CONFIG.brickSize);
                      const newRenkoData = window.convertToRenko(window.historicalData, parseFloat(window.CHART_CONFIG.brickSize), false);
                      if (window.candleSeries && newRenkoData && newRenkoData.length > 0) {
                        window.candleSeries.setData(newRenkoData);
                        window.chart.timeScale().fitContent();
                      }
                    }
                  }, 200);

                  console.log('Renko brick size configuration complete');
                }, 500);
              }
            }, 1000);

            // Override Renko functions to ensure they use the configured brick size
            if (chartType === 'renko' && window.CHART_CONFIG.brickSize) {
              // Override convertToRenko if it exists
              if (window.convertToRenko && typeof window.convertToRenko === 'function') {
                const originalConvertToRenko = window.convertToRenko;
                window.convertToRenko = function(data, brickSize, isRealtime) {
                  const configuredBrickSize = parseFloat(window.CHART_CONFIG.brickSize);
                  console.log('Using configured brick size in convertToRenko:', configuredBrickSize);
                  return originalConvertToRenko.call(this, data, configuredBrickSize, isRealtime);
                };
              }

              // Override updateRenkoRealtime if it exists
              if (window.updateRenkoRealtime && typeof window.updateRenkoRealtime === 'function') {
                const originalUpdateRenkoRealtime = window.updateRenkoRealtime;
                window.updateRenkoRealtime = function(newBar, renkoData, brickSize) {
                  const configuredBrickSize = parseFloat(window.CHART_CONFIG.brickSize);
                  console.log('Using configured brick size in updateRenkoRealtime:', configuredBrickSize);
                  return originalUpdateRenkoRealtime.call(this, newBar, renkoData, configuredBrickSize);
                };
              }
            }

            // Update the title if there's a contract symbol
            if (window.CHART_CONFIG.contractSymbol) {
              const title = document.querySelector('h1');
              if (title) {
                title.textContent = window.CHART_CONFIG.contractSymbol + ' Real-Time Chart';
              }
            }

            // Add appropriate button based on strategy type
            setTimeout(() => {
              console.log('=== Attempting to add Save/Update Strategy button ===');

              // Try multiple selectors to find the header area
              let targetElement = document.querySelector('.header');
              if (!targetElement) {
                targetElement = document.querySelector('h1').parentElement;
                console.log('Using h1 parent as target element');
              }
              if (!targetElement) {
                targetElement = document.querySelector('body');
                console.log('Using body as target element');
              }

              if (targetElement && !document.getElementById('saveStrategyBtn')) {
                const isExisting = window.CHART_CONFIG.isExistingStrategy;
                const button = document.createElement('button');
                button.id = 'saveStrategyBtn';
                button.textContent = isExisting ? 'Update Strategy' : 'Save Strategy';
                button.style.cssText = \`
                  background-color: #4CAF50;
                  color: white;
                  border: none;
                  padding: 8px 16px;
                  border-radius: 4px;
                  cursor: pointer;
                  margin: 10px;
                  font-size: 14px;
                  position: fixed;
                  top: 10px;
                  right: 10px;
                  z-index: 9999;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                \`;

                button.onclick = function() {
                  if (isExisting) {
                    window.updateExistingStrategy();
                  } else {
                    window.saveCurrentStrategy();
                  }
                };

                targetElement.appendChild(button);
                console.log('✅', isExisting ? 'Update Strategy button added to interface' : 'Save Strategy button added to interface');
                console.log('Button element:', button);
              } else {
                console.log('❌ Could not find target element or button already exists');
                console.log('Available elements:', {
                  header: document.querySelector('.header'),
                  h1: document.querySelector('h1'),
                  body: document.querySelector('body'),
                  existingButton: document.getElementById('saveStrategyBtn')
                });
              }

              // Restore saved indicators if available
              if (window.CHART_CONFIG.indicators && window.CHART_CONFIG.indicators.length > 0) {
                setTimeout(() => {
                  window.CHART_CONFIG.indicators.forEach(indicator => {
                    console.log('Restoring indicator:', indicator);
                    // Try to add the indicator - this might need adjustment based on the actual implementation
                    if (window.addIndicator && typeof window.addIndicator === 'function') {
                      try {
                        window.addIndicator(indicator);
                      } catch (e) {
                        console.warn('Failed to restore indicator:', indicator, e);
                      }
                    }
                  });
                }, 3000);
              }
            }, 2000);
          }, 1500);

          // Function to collect current chart configuration
          window.getCurrentChartConfig = function() {
            const chartTypeSelect = document.getElementById('chartType');
            const resolutionSelect = document.getElementById('resolution');
            const brickSizeInput = document.getElementById('brickSize');
            const indicatorSelect = document.getElementById('indicators');

            // Get active indicators (this might need adjustment based on the actual implementation)
            const activeIndicators = [];
            const indicatorTags = document.querySelectorAll('.indicator-tag');
            indicatorTags.forEach(tag => {
              activeIndicators.push(tag.textContent.trim());
            });

            const config = {
              chartType: chartTypeSelect ? chartTypeSelect.value : 'candlestick',
              resolution: resolutionSelect ? resolutionSelect.value : '15',
              brickSize: brickSizeInput ? brickSizeInput.value : '0.25',
              indicators: activeIndicators,
              strategyName: window.CHART_CONFIG.strategyName || 'Unnamed Strategy',
              contractSymbol: window.CHART_CONFIG.contractSymbol || '/MNQ',
              timestamp: new Date().toISOString()
            };

            console.log('Current chart configuration:', config);
            return config;
          };

          // Function to save the current strategy
          window.saveCurrentStrategy = async function() {
            try {
              const chartConfig = window.getCurrentChartConfig();

              const strategyData = {
                name: chartConfig.strategyName,
                strategy_type: chartConfig.chartType,
                contract_symbol: chartConfig.contractSymbol,
                timeframe: chartConfig.resolution,
                chart_type: chartConfig.chartType,
                brick_size: parseFloat(chartConfig.brickSize),
                chart_config: {
                  chartType: chartConfig.chartType,
                  resolution: chartConfig.resolution,
                  brickSize: chartConfig.brickSize,
                  indicators: chartConfig.indicators,
                  timestamp: chartConfig.timestamp
                },
                webhook_url: null,
                webhook_payload: null
              };

              console.log('Saving strategy:', strategyData);

              const response = await fetch('/api/save-chart-strategy', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(strategyData)
              });

              const result = await response.json();

              if (result.success) {
                alert('Strategy saved successfully!');
                console.log('Strategy saved with ID:', result.id);
                // Update the configuration to mark as existing
                window.CHART_CONFIG.strategyId = result.id;
                window.CHART_CONFIG.isExistingStrategy = true;
                // Update button text
                const button = document.getElementById('saveStrategyBtn');
                if (button) {
                  button.textContent = 'Update Strategy';
                  button.onclick = function() {
                    window.updateExistingStrategy();
                  };
                }
              } else {
                alert('Failed to save strategy: ' + result.error);
              }
            } catch (error) {
              console.error('Error saving strategy:', error);
              alert('Error saving strategy: ' + error.message);
            }
          };

          // Function to update an existing strategy
          window.updateExistingStrategy = async function() {
            try {
              const chartConfig = window.getCurrentChartConfig();
              const strategyId = window.CHART_CONFIG.strategyId;

              if (!strategyId) {
                alert('No strategy ID found. Please save as a new strategy.');
                return;
              }

              // Create enhanced payload with chart configuration
              const enhancedPayload = {
                chart_configuration: {
                  chart_type: chartConfig.chartType,
                  brick_size: chartConfig.brickSize,
                  timeframe: chartConfig.resolution,
                  resolution: chartConfig.resolution,
                  indicators: chartConfig.indicators,
                  timestamp: chartConfig.timestamp
                },
                original_payload: {}
              };

              const strategyData = {
                name: chartConfig.strategyName,
                strategy_type: chartConfig.chartType,
                contract_symbol: chartConfig.contractSymbol,
                contract_name: chartConfig.contractSymbol,
                timeframe: chartConfig.resolution,
                webhook_url: null,
                webhook_payload: enhancedPayload
              };

              console.log('Updating strategy:', strategyId, strategyData);

              const response = await fetch(\`/api/strategies/\${strategyId}\`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(strategyData)
              });

              const result = await response.json();

              if (result.success) {
                alert('Strategy updated successfully!');
                console.log('Strategy updated:', result.data);
              } else {
                alert('Failed to update strategy: ' + result.error);
              }
            } catch (error) {
              console.error('Error updating strategy:', error);
              alert('Error updating strategy: ' + error.message);
            }
          };
        });
      </script>
    `;

    // Insert the configuration script before other scripts
    htmlContent = htmlContent.replace('</head>', configScript + '</head>');

    // Add scripts to handle loading order and data processing issues
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

        // Data processing fixes that inject into the existing code
        window.addEventListener('load', function() {
          setTimeout(() => {
            // Override the fetch function to redirect API calls to our proxy
            if (window.getHistoricalData) {
              const originalGetHistoricalData = window.getHistoricalData;
              window.getHistoricalData = async function(resolution, countback) {
                try {
                  console.log('Using proxied historical data fetch');

                  const config = window.resolutionConfig[resolution];
                  if (!config) {
                    throw new Error('Invalid resolution config');
                  }

                  const now = Math.floor(Date.now() / 1000);
                  const from = now - (countback * 60 * parseInt(resolution)); // Rough estimate

                  const url = \`/api/chart-history?Symbol=\${encodeURIComponent(config.symbol)}&Resolution=\${resolution}&Countback=\${countback}&From=\${from}&To=\${now}&SessionId=extended&Live=false\`;

                  const response = await fetch(url);
                  const data = await response.json();

                  if (!data.bars || !Array.isArray(data.bars)) {
                    console.warn('No bars in response');
                    return [];
                  }

                  // Convert to the format expected by the chart
                  const convertedBars = data.bars.map(bar => ({
                    time: bar.t,
                    open: bar.o,
                    high: bar.h,
                    low: bar.l,
                    close: bar.c,
                    volume: bar.v || 0
                  })).filter(bar =>
                    bar.time && !isNaN(bar.time) &&
                    bar.open && !isNaN(bar.open) &&
                    bar.high && !isNaN(bar.high) &&
                    bar.low && !isNaN(bar.low) &&
                    bar.close && !isNaN(bar.close)
                  );

                  console.log(\`Converted \${convertedBars.length} bars from proxy\`);
                  return convertedBars;

                } catch (error) {
                  console.error('Error in proxied getHistoricalData:', error);
                  // Fallback to original function
                  return originalGetHistoricalData.call(this, resolution, countback);
                }
              };
            }
            // Override the changeResolution function to add better cleanup
            if (window.changeResolution) {
              const originalChangeResolution = window.changeResolution;
              window.changeResolution = async function(resolution) {
                console.log(\`=== Enhanced resolution change to "\${resolution}" ===\`);

                // Determine resolution type and apply appropriate delay
                const resolutionDelays = {
                  // Tick resolutions - work fine, minimal delay
                  '100T': 50,
                  '500T': 50,
                  '1000T': 50,
                  '2500T': 50,
                  // Second resolutions - work fine, minimal delay
                  '1S': 50,
                  '5S': 50,
                  '10S': 50,
                  '30S': 50,
                  // Minute resolutions - problematic, need longer delay
                  '1': 500,
                  '2': 500,
                  '3': 500,
                  '5': 500,
                  '10': 500,
                  '15': 500,
                  '30': 500,
                  // Hour resolutions - problematic, need longer delay
                  '60': 600,
                  '120': 600,
                  '240': 600,
                  // Day/Week/Month - work fine but add safety delay
                  'D': 300,
                  '1D': 300,
                  'W': 300,
                  '1W': 300,
                  'M': 300,
                  '1M': 300
                };

                const delay = resolutionDelays[resolution] || 400;
                console.log(\`Using delay of \${delay}ms for resolution \${resolution}\`);

                // Force disconnect from previous subscription
                if (window.currentSubscription && window.connection) {
                  try {
                    const prevConfig = window.resolutionConfig[window.currentSubscription];
                    if (prevConfig) {
                      await window.connection.invoke("UnsubscribeBars", prevConfig.symbol, window.currentSubscription);
                      console.log(\`Force unsubscribed from \${prevConfig.symbol} \${window.currentSubscription}\`);
                    }
                  } catch (e) {
                    console.warn('Unsubscribe error (continuing anyway):', e);
                  }
                  window.currentSubscription = null;
                }

                // Clear any existing chart data first
                if (window.candleSeries) {
                  try {
                    window.candleSeries.setData([]);
                    window.candleSeries.applyOptions({
                      priceScale: {
                        autoScale: true,
                      },
                    });
                  } catch (e) {
                    console.warn('Error clearing chart data:', e);
                  }
                }

                // Reset ALL chart-related variables
                window.lastBarTime = null;
                window.currentBar = null;
                window.heikenAshiData = [];
                window.renkoData = [];
                window.historicalData = [];
                window.tickAccumulator = null;
                window.tickCount = 0;
                window.lastTickTime = null;
                window.currentResolution = resolution; // Set this early

                // Add resolution-specific delay
                await new Promise(resolve => setTimeout(resolve, delay));

                try {
                  // For problematic resolutions, ensure chart is ready
                  if (delay >= 500 && window.chart && window.chart.timeScale) {
                    try {
                      window.chart.timeScale().fitContent();
                    } catch (e) {
                      console.warn('Error calling timeScale fitContent:', e);
                    }
                  }

                  await originalChangeResolution.call(this, resolution);

                  // Additional delay for minute/hour resolutions to ensure data loads
                  if (delay >= 500) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    if (window.chart && window.chart.timeScale && window.candleSeries) {
                      try {
                        window.chart.timeScale().fitContent();
                      } catch (e) {
                        console.warn('Error calling timeScale fitContent after delay:', e);
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error in changeResolution:', error);

                  // Try one recovery attempt before reload
                  console.log('Attempting recovery...');
                  await new Promise(resolve => setTimeout(resolve, 500));

                  try {
                    await originalChangeResolution.call(this, resolution);
                  } catch (retryError) {
                    console.error('Recovery failed, reloading page:', retryError);
                    location.reload();
                  }
                }
              };
            }

            // Override timestamp conversion for better handling
            if (window.convertTimestamp) {
              const originalConvertTimestamp = window.convertTimestamp;
              window.convertTimestamp = function(timestamp, originalTimestamp) {
                try {
                  // Handle microsecond timestamps (> 10^15)
                  if (timestamp > 1000000000000000) {
                    timestamp = Math.floor(timestamp / 1000000);
                  }
                  // Handle nanosecond timestamps (> 10^18)
                  else if (timestamp > 1000000000000000000) {
                    timestamp = Math.floor(timestamp / 1000000000);
                  }

                  const result = originalConvertTimestamp.call(this, timestamp, originalTimestamp);

                  // Validate the result
                  if (!result || isNaN(result) || result <= 0) {
                    console.warn('Invalid timestamp result, using current time');
                    return Math.floor(Date.now() / 1000);
                  }

                  return result;
                } catch (error) {
                  console.error('Timestamp conversion error:', error);
                  return Math.floor(Date.now() / 1000);
                }
              };
            }

            // Override the series setData to add validation
            let setDataAttempts = 0;
            const maxSetDataAttempts = 3;

            function wrapSetData() {
              if (window.candleSeries && window.candleSeries.setData) {
                const originalSetData = window.candleSeries.setData.bind(window.candleSeries);
                window.candleSeries.setData = function(data) {
                  try {
                    // Filter and validate data
                    if (!data || !Array.isArray(data)) {
                      console.warn('Invalid data passed to setData');
                      return;
                    }

                    const cleanData = data.filter(bar => {
                      if (!bar) return false;
                      if (typeof bar.time !== 'number' || isNaN(bar.time) || bar.time <= 0) return false;
                      if (typeof bar.open !== 'number' || isNaN(bar.open)) return false;
                      if (typeof bar.high !== 'number' || isNaN(bar.high)) return false;
                      if (typeof bar.low !== 'number' || isNaN(bar.low)) return false;
                      if (typeof bar.close !== 'number' || isNaN(bar.close)) return false;
                      return true;
                    });

                    if (cleanData.length === 0) {
                      console.warn('No valid data to set on chart');
                      return;
                    }

                    // Sort data by time
                    cleanData.sort((a, b) => a.time - b.time);

                    // For minute/hour resolutions, add extra validation
                    const currentRes = window.currentResolution;
                    const problematicResolutions = ['1', '2', '3', '5', '10', '15', '30', '60', '120', '240'];

                    if (problematicResolutions.includes(currentRes)) {
                      console.log(\`Setting \${cleanData.length} bars for problematic resolution \${currentRes}\`);

                      // Clear the series first
                      try {
                        originalSetData([]);
                      } catch (e) {
                        console.warn('Error clearing series:', e);
                      }

                      // Small delay before setting new data
                      setTimeout(() => {
                        try {
                          originalSetData(cleanData);
                          console.log('Data set successfully after delay');
                          setDataAttempts = 0;
                        } catch (e) {
                          console.error('Error setting data after delay:', e);
                          if (setDataAttempts < maxSetDataAttempts) {
                            setDataAttempts++;
                            console.log(\`Retry attempt \${setDataAttempts}\`);
                            setTimeout(() => {
                              window.candleSeries.setData(cleanData);
                            }, 500);
                          }
                        }
                      }, 100);
                    } else {
                      // For working resolutions, set data normally
                      originalSetData(cleanData);
                      setDataAttempts = 0;
                    }
                  } catch (error) {
                    console.error('Error in setData wrapper:', error);
                    // Try original function as fallback
                    try {
                      originalSetData(data);
                    } catch (fallbackError) {
                      console.error('Fallback setData also failed:', fallbackError);
                    }
                  }
                };
              }
            }

            // Apply the wrapper initially and whenever the series is recreated
            wrapSetData();

            // Monitor for series recreation
            setInterval(() => {
              if (window.candleSeries && !window.candleSeries._wrapped) {
                wrapSetData();
                window.candleSeries._wrapped = true;
              }
            }, 1000);

            // Add better error handling for chart operations
            const originalConsoleError = console.error;
            console.error = function(...args) {
              if (args[0] && args[0].includes && args[0].includes('Value is null')) {
                console.warn('Intercepted null value error, attempting recovery...');

                // Get current resolution
                const currentRes = window.currentResolution;
                const problematicResolutions = ['1', '2', '3', '5', '10', '15', '30', '60', '120', '240'];

                if (problematicResolutions.includes(currentRes)) {
                  console.log('Null error on problematic resolution, forcing reload...');

                  // Try to force a resolution change to itself
                  if (window.changeResolution) {
                    setTimeout(() => {
                      console.log('Forcing resolution reload...');
                      window.changeResolution(currentRes);
                    }, 1000);
                  }
                } else {
                  // Original recovery logic for other resolutions
                  if (window.candleSeries) {
                    setTimeout(() => {
                      try {
                        window.candleSeries.setData([]);
                        if (window.historicalData && window.historicalData.length > 0) {
                          const validData = window.historicalData.filter(d =>
                            d && typeof d.time === 'number' &&
                            typeof d.open === 'number' &&
                            !isNaN(d.time) && !isNaN(d.open)
                          );
                          if (validData.length > 0) {
                            window.candleSeries.setData(validData);
                          }
                        }
                      } catch (recoveryError) {
                        console.warn('Recovery attempt failed:', recoveryError);
                      }
                    }, 100);
                  }
                }
                return; // Don't show the original error
              }
              originalConsoleError.apply(console, args);
            };
          }, 500);
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

// Proxy for historical data with timestamp fixing
app.get('/api/chart-history', async (req, res) => {
  try {
    const { Symbol, Resolution, Countback, From, To, SessionId, Live } = req.query;

    // Build the TopStepX API URL
    const apiUrl = `https://chartapi.topstepx.com/History/v2?Symbol=${encodeURIComponent(Symbol)}&Resolution=${Resolution}&Countback=${Countback}&From=${From}&To=${To}&SessionId=${SessionId || 'extended'}&Live=${Live || 'false'}`;

    console.log('Proxying chart history request:', apiUrl);

    // Fetch data from TopStepX
    const response = await axios.get(apiUrl);
    let data = response.data;

    // Fix timestamp issues in the bars
    if (data && data.bars && Array.isArray(data.bars)) {
      data.bars = data.bars.map(bar => {
        if (bar.t) {
          // Handle microsecond timestamps (> 10^15)
          if (bar.t > 1000000000000000) {
            bar.t = Math.floor(bar.t / 1000);
          }
          // Ensure timestamp is valid
          if (isNaN(bar.t) || bar.t <= 0) {
            console.warn('Invalid timestamp detected:', bar.t);
            return null;
          }
        }

        // Validate OHLC data
        if (isNaN(bar.o) || isNaN(bar.h) || isNaN(bar.l) || isNaN(bar.c)) {
          console.warn('Invalid OHLC data detected:', bar);
          return null;
        }

        return bar;
      }).filter(bar => bar !== null); // Remove invalid bars

      console.log(`Processed ${data.bars.length} valid bars`);
    }

    res.json(data);
  } catch (error) {
    console.error('❌ Error proxying chart history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save chart strategy from chart interface
app.post('/api/save-chart-strategy', async (req, res) => {
  try {
    const {
      name,
      strategy_type,
      contract_symbol,
      timeframe,
      chart_type,
      brick_size,
      chart_config,
      webhook_url,
      webhook_payload
    } = req.body;

    console.log('📊 Saving chart strategy:', req.body);

    // Create a comprehensive webhook payload that includes chart configuration
    const enhancedPayload = {
      chart_configuration: {
        chart_type: chart_type || strategy_type,
        brick_size: brick_size,
        timeframe: timeframe,
        ...chart_config
      },
      original_payload: webhook_payload || {}
    };

    const result = await pool.query(`
      INSERT INTO strategies (
        name, strategy_type, contract_symbol, contract_name,
        timeframe, webhook_url, webhook_payload,
        status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'inactive', 'chart')
      RETURNING *
    `, [
      name,
      chart_type || strategy_type, // Use chart_type as strategy_type if provided
      contract_symbol,
      contract_symbol, // using contract_symbol for both
      timeframe,
      webhook_url,
      JSON.stringify(enhancedPayload)
    ]);

    res.json({
      success: true,
      message: 'Chart strategy saved successfully',
      data: result.rows[0],
      id: result.rows[0].id
    });
  } catch (error) {
    console.error('❌ Error saving chart strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get chart configuration for a strategy
app.get('/api/strategy/:id/chart-config', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT id, name, strategy_type, contract_symbol, timeframe,
             webhook_payload, status, created_at, updated_at
      FROM strategies
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Strategy not found'
      });
    }

    const strategy = result.rows[0];

    // Extract chart configuration from webhook_payload
    let chartConfig = {};
    if (strategy.webhook_payload) {
      try {
        const payload = JSON.parse(strategy.webhook_payload);
        if (payload.chart_configuration) {
          chartConfig = payload.chart_configuration;
        }
      } catch (e) {
        console.warn('Failed to parse webhook_payload for chart config:', e);
      }
    }

    // Add extracted chart config to strategy object
    strategy.chart_config = chartConfig;
    strategy.chart_type = chartConfig.chart_type || strategy.strategy_type;
    strategy.brick_size = chartConfig.brick_size;

    res.json({
      success: true,
      data: strategy
    });
  } catch (error) {
    console.error('❌ Error fetching strategy chart config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Launch TradingView chart in browser
app.post('/api/launch-chart', async (req, res) => {
  try {
    // Check if launching from a saved strategy
    if (req.body && req.body.strategyId) {
      console.log('📊 Loading saved strategy:', req.body.strategyId);

      try {
        const result = await pool.query(`
          SELECT id, name, strategy_type, contract_symbol, timeframe,
                 webhook_payload, status
          FROM strategies
          WHERE id = $1
        `, [req.body.strategyId]);

        if (result.rows.length > 0) {
          const strategy = result.rows[0];
          let chartConfig = {};

          // Extract chart configuration from webhook_payload
          if (strategy.webhook_payload) {
            try {
              const payload = JSON.parse(strategy.webhook_payload);
              if (payload.chart_configuration) {
                chartConfig = payload.chart_configuration;
              }
            } catch (e) {
              console.warn('Failed to parse saved webhook_payload for chart config:', e);
            }
          }

          // Use saved configuration
          currentChartConfig = {
            strategyType: chartConfig.chart_type || strategy.strategy_type || 'candlestick',
            timeframe: chartConfig.resolution || chartConfig.timeframe || strategy.timeframe || '15',
            brickSize: chartConfig.brick_size || '0.25',
            contractSymbol: strategy.contract_symbol || '/MNQ',
            strategyName: strategy.name || 'Saved Strategy',
            indicators: chartConfig.indicators || [],
            strategyId: strategy.id,
            isExistingStrategy: true
          };

          console.log('📊 Loaded saved strategy configuration:', currentChartConfig);
        } else {
          console.warn('Strategy not found, using default configuration');
          currentChartConfig = {
            strategyType: 'candlestick',
            timeframe: '15',
            brickSize: '0.25',
            contractSymbol: '/MNQ',
            strategyName: 'Default'
          };
        }
      } catch (dbError) {
        console.error('Database error loading strategy:', dbError);
        // Fall back to default configuration
        currentChartConfig = {
          strategyType: 'candlestick',
          timeframe: '15',
          brickSize: '0.25',
          contractSymbol: '/MNQ',
          strategyName: 'Default'
        };
      }
    } else {
      // Store the configuration from the request body (new strategy)
      currentChartConfig = {
        strategyType: req.body?.strategyType || 'candlestick',
        timeframe: req.body?.timeframe || '15',
        brickSize: req.body?.brickSize || '0.25',
        contractSymbol: req.body?.contractSymbol || '/MNQ',
        strategyName: req.body?.strategyName || 'Default',
        indicators: req.body?.indicators || [],
        isExistingStrategy: false
      };
      console.log('📊 Chart configuration received:', currentChartConfig);
    }

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
    console.log(`📊 With configuration:`, currentChartConfig);

    res.json({
      success: true,
      message: 'Chart launched in browser successfully',
      url: chartUrl,
      config: currentChartConfig
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