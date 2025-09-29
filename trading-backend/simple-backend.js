const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Routes removed

const app = express();
const port = 8025;

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

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

const CONTRACTS_FILE = path.join(__dirname, 'tradableContracts.json');
const ACCOUNTS_FILE = path.join(__dirname, 'tradableAccounts.json');

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

// Contract lookup method - find contract_id by contract name variations
function lookupContractId(contractName) {
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
          contract_id: contract.contract_id,
          matched_field: 'product_name',
          matched_value: contract.product_name,
          contract_info: contract
        };
      }
      
      // Strategy 2: Match with product_name without leading slash (e.g., "MNQ" matches "/MNQ")
      if (contract.product_name && contract.product_name.replace('/', '').toUpperCase() === cleanContractName) {
        return {
          success: true,
          contract_id: contract.contract_id,
          matched_field: 'product_name',
          matched_value: contract.product_name,
          contract_info: contract
        };
      }
      
      // Strategy 3: Match with symbol (e.g., "MNQ")
      if (contract.symbol && contract.symbol.toUpperCase() === cleanContractName) {
        return {
          success: true,
          contract_id: contract.contract_id,
          matched_field: 'symbol',
          matched_value: contract.symbol,
          contract_info: contract
        };
      }
      
      // Strategy 4: Match with contract_name (e.g., "MNQU25")
      if (contract.contract_name && contract.contract_name.toUpperCase() === cleanContractName) {
        return {
          success: true,
          contract_id: contract.contract_id,
          matched_field: 'contract_name',
          matched_value: contract.contract_name,
          contract_info: contract
        };
      }
      
      // Strategy 5: Match with exchange field (e.g., "/MNQ")
      if (contract.exchange && contract.exchange.toUpperCase() === cleanContractName) {
        return {
          success: true,
          contract_id: contract.contract_id,
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
          contract_id: contract.contract_id,
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

// Contract lookup API - find contract_id by contract name
app.get('/api/contracts/lookup-id/:contractName', (req, res) => {
  try {
    const { contractName } = req.params;
    
    if (!contractName) {
      return res.status(400).json({
        success: false,
        error: 'Contract name parameter is required'
      });
    }
    
    const result = lookupContractId(contractName);
    
    if (result.success) {
      res.json({
        success: true,
        contract_id: result.contract_id,
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

// Accounts file API - load accounts from file
app.get('/api/accounts/file', (req, res) => {
  try {
    if (!fs.existsSync(ACCOUNTS_FILE)) {
      return res.status(404).json({
        success: false,
        error: 'Accounts file not found'
      });
    }

    const accountsData = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));

    res.json({
      success: true,
      data: accountsData,
      source: 'file'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Accounts file API - save accounts to file
app.post('/api/accounts/file', (req, res) => {
  try {
    const { accountsData } = req.body;

    if (!accountsData) {
      return res.status(400).json({
        success: false,
        error: 'accountsData is required'
      });
    }

    // Save to file
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsData, null, 2));
    console.log(`✅ Saved accounts data to ${ACCOUNTS_FILE}`);

    res.json({
      success: true,
      message: 'Accounts file saved successfully',
      filePath: ACCOUNTS_FILE
    });
  } catch (error) {
    console.error('❌ Failed to save accounts file:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Accounts file API - delete accounts file
app.delete('/api/accounts/file', (req, res) => {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      fs.unlinkSync(ACCOUNTS_FILE);
      console.log(`✅ Deleted accounts file: ${ACCOUNTS_FILE}`);
    }

    res.json({
      success: true,
      message: 'Accounts file deleted successfully'
    });
  } catch (error) {
    console.error('❌ Failed to delete accounts file:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Account routes removed

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Webhook Bot API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
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