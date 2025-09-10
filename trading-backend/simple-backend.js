const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = 8000;

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// TopStep Authentication
const TOPSTEP_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjE5NDY5OSIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL3NpZCI6IjYzYzBjYTZhLWQxYTgtNDBjNS04MWViLWY1YTA0NGQ0ZjU0NiIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWUiOiJzdW1vbmV5MSIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6InVzZXIiLCJtc2QiOiJDTUVHUk9VUF9UT0IiLCJtZmEiOiJ2ZXJpZmllZCIsImV4cCI6MTc1ODA2MzYzNH0.HRx9bQw0GfM3pGfyTmtfusdPx6kW3wLp5k-HyByyLjs';

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

// Fetch contracts from TopStep and cache them
async function loadContracts() {
  try {
    console.log('Loading contracts from TopStep API...');
    
    const response = await axios.get('https://userapi.topstepx.com/UserContract/active/nonprofesional', {
      headers: { 'Authorization': `Bearer ${TOPSTEP_TOKEN}` }
    });

    const contracts = response.data.map(contract => ({
      symbol: contract.productName.replace('/', ''),
      name: contract.description,
      exchange: contract.exchange,
      category: 'Futures',
      contract_id: contract.contractId,
      product_name: contract.productName,
      contract_name: contract.contractName,
      tick_value: contract.tickValue,
      tick_size: contract.tickSize,
      point_value: contract.pointValue,
      total_fees: contract.totalFees,
      description: contract.description,
      disabled: contract.disabled
    }));

    // Save to file
    fs.writeFileSync(CONTRACTS_FILE, JSON.stringify(contracts, null, 2));
    console.log(`✅ Saved ${contracts.length} contracts to ${CONTRACTS_FILE}`);
    
    return contracts;
  } catch (error) {
    console.error('❌ Failed to load contracts from TopStep:', error.message);
    throw error;
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

// Initialize contracts on startup
async function initializeServer() {
  try {
    // Check if contracts file already exists
    if (fs.existsSync(CONTRACTS_FILE)) {
      const contracts = JSON.parse(fs.readFileSync(CONTRACTS_FILE, 'utf8'));
      console.log(`✅ Found existing contracts file with ${contracts.length} contracts`);
    } else {
      console.log('📥 No existing contracts file found, fetching from TopStep...');
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