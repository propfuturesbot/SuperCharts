const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { swaggerUi, specs } = require('./swagger');
const orderManager = require('./orderManager');

// Routes removed

const app = express();
const port = 8025;

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Swagger Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "SuperCharts Trading API Documentation"
}));

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
const AUTH_FILE = path.join(__dirname, 'authToken.json');

// Save auth token to file
function saveAuthToFile(provider, token, username, expiresAt) {
  const authData = {
    provider,
    token,
    username,
    expiresAt: expiresAt || Date.now() + 3600000, // Default 1 hour
    savedAt: Date.now()
  };

  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2));
    console.log(`[AUTH] Saved authentication for ${username}@${provider}`);
  } catch (error) {
    console.error('[AUTH] Failed to save auth to file:', error.message);
  }
}

// Load and validate auth token from file
function loadAuthFromFile() {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      throw new Error('Auth file not found');
    }

    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));

    // Check if token is expired
    if (Date.now() > authData.expiresAt) {
      console.log('[AUTH] Token expired, removing auth file');
      fs.unlinkSync(AUTH_FILE);
      throw new Error('Token expired');
    }

    console.log(`[AUTH] Loaded valid authentication for ${authData.username}@${authData.provider}`);
    return authData;
  } catch (error) {
    console.log(`[AUTH] Failed to load auth: ${error.message}`);
    return null;
  }
}

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

/**
 * @swagger
 * /api/contracts:
 *   get:
 *     summary: Get all cached contracts
 *     description: Retrieve all trading contracts from the cached file
 *     tags: [Contracts]
 *     responses:
 *       200:
 *         description: Successfully retrieved contracts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 contracts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Contract'
 *                 count:
 *                   type: integer
 *                   example: 57
 *                 source:
 *                   type: string
 *                   example: 'cached_file'
 *       500:
 *         description: Server error or contracts file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/contracts/lookup/{contractName}:
 *   get:
 *     summary: Lookup contract by name to get product_id
 *     description: Find a contract's product_id using various matching strategies (symbol, product_name, contract_name, etc.)
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: contractName
 *         required: true
 *         schema:
 *           type: string
 *         description: Contract name to lookup (e.g., MNQ, /MNQ, MNQU25)
 *         example: MNQ
 *     responses:
 *       200:
 *         description: Contract found successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContractLookupResponse'
 *       404:
 *         description: Contract not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: 'Contract not found for: XYZ'
 *                 searched_term:
 *                   type: string
 *                   example: 'XYZ'
 *       400:
 *         description: Missing contract name parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/contracts/lookup-id/{contractName}:
 *   get:
 *     summary: Lookup contract by name to get contract_id
 *     description: Find a contract's contract_id using various matching strategies
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: contractName
 *         required: true
 *         schema:
 *           type: string
 *         description: Contract name to lookup
 *         example: MNQ
 *     responses:
 *       200:
 *         description: Contract found successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 contract_id:
 *                   type: string
 *                 matched_field:
 *                   type: string
 *                 matched_value:
 *                   type: string
 *                 contract_info:
 *                   $ref: '#/components/schemas/Contract'
 *       404:
 *         description: Contract not found
 *       400:
 *         description: Missing contract name parameter
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /api/contracts/lookup:
 *   post:
 *     summary: Bulk lookup contracts by names
 *     description: Find multiple contracts' product_ids in a single request
 *     tags: [Contracts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contractNames:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["MNQ", "MES", "/ES"]
 *     responses:
 *       200:
 *         description: Bulk lookup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 total:
 *                   type: integer
 *                 successful:
 *                   type: integer
 *                 failed:
 *                   type: integer
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /api/accounts/file:
 *   get:
 *     summary: Load accounts from file
 *     description: Retrieve cached account data from the accounts file
 *     tags: [Accounts]
 *     responses:
 *       200:
 *         description: Accounts loaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AccountData'
 *                 source:
 *                   type: string
 *                   example: 'file'
 *       404:
 *         description: Accounts file not found
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /api/accounts/file:
 *   post:
 *     summary: Save accounts to file
 *     description: Save account data to the cached accounts file
 *     tags: [Accounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountsData:
 *                 $ref: '#/components/schemas/AccountData'
 *     responses:
 *       200:
 *         description: Accounts saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 filePath:
 *                   type: string
 *       400:
 *         description: Missing accountsData
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /api/accounts/file:
 *   delete:
 *     summary: Delete accounts file
 *     description: Remove the cached accounts file from the filesystem
 *     tags: [Accounts]
 *     responses:
 *       200:
 *         description: Accounts file deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       500:
 *         description: Server error
 */
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

// Authentication Endpoints

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Store authentication credentials
 *     description: Store provider, token and username for subsequent API calls
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, token, username]
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [topstepx, alphaticks, blueguardian, thefuturesdesk]
 *                 example: thefuturesdesk
 *               token:
 *                 type: string
 *                 description: JWT authentication token
 *               username:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Authentication stored successfully
 *       400:
 *         description: Invalid credentials
 */
app.post('/api/auth/login', (req, res) => {
  try {
    const { provider, token, username } = req.body;

    if (!provider || !token || !username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: provider, token, username'
      });
    }

    authStore.setAuth(provider, token, username);

    res.json({
      success: true,
      message: 'Authentication stored successfully',
      provider,
      username
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/auth/status:
 *   get:
 *     summary: Get authentication status
 *     description: Check if backend has valid authentication credentials
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Authentication status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 authenticated:
 *                   type: boolean
 *                 provider:
 *                   type: string
 *                 username:
 *                   type: string
 */
app.get('/api/auth/status', (req, res) => {
  const status = authStore.getStatus();
  res.json({
    success: true,
    ...status
  });
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Clear authentication
 *     description: Clear stored authentication credentials
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
app.post('/api/auth/logout', (req, res) => {
  // Remove auth file on logout
  try {
    if (fs.existsSync(AUTH_FILE)) {
      fs.unlinkSync(AUTH_FILE);
      console.log('[AUTH] Removed auth file on logout');
    }
  } catch (error) {
    console.error('[AUTH] Failed to remove auth file:', error.message);
  }

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * @swagger
 * /api/auth/save:
 *   post:
 *     summary: Save authentication to file
 *     description: Save authentication credentials to file for backend use
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 example: "thefuturesdesk"
 *               token:
 *                 type: string
 *                 example: "Bearer token"
 *               username:
 *                 type: string
 *                 example: "user123"
 *               expiresAt:
 *                 type: number
 *                 example: 1672531200000
 *     responses:
 *       200:
 *         description: Authentication saved successfully
 *       400:
 *         description: Invalid auth data
 */
app.post('/api/auth/save', (req, res) => {
  try {
    const { provider, token, username, expiresAt } = req.body;

    if (!provider || !token || !username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required auth data: provider, token, username'
      });
    }

    // Save auth to file
    saveAuthToFile(provider, token, username, expiresAt);

    res.json({
      success: true,
      message: 'Authentication saved to file successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Simple function to get current auth from file
function getCurrentAuth() {
  const authData = loadAuthFromFile();
  if (!authData) {
    throw new Error('No valid authentication found. Please log in first.');
  }
  return {
    provider: authData.provider,
    token: authData.token,
    username: authData.username
  };
}

// Trading API Endpoints (Updated to use internal auth)

/**
 * @swagger
 * /api/orders/market:
 *   post:
 *     summary: Place a market order (DEPRECATED - use /api/orders/place)
 *     deprecated: true
 *     description: |
 *       **DEPRECATED**: Use POST /api/orders/place with orderType="MARKET" instead.
 *       Execute a market order using current authenticated session. Authentication is handled automatically via saved credentials.
 *     tags: [Trading (Legacy)]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName, symbol, orderType]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *                 description: Name of the trading account
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *                 description: Trading symbol
 *               orderType:
 *                 type: string
 *                 enum: [BUY, SELL, LONG, SHORT]
 *                 example: BUY
 *                 description: Order side
 *               quantity:
 *                 type: integer
 *                 default: 1
 *                 example: 1
 *                 description: Number of contracts
 *     responses:
 *       200:
 *         description: Order placed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 orderId:
 *                   type: string
 *                 orderData:
 *                   type: object
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Order placement failed
 */
app.post('/api/orders/market', async (req, res) => {
  try {
    const { accountName, symbol, orderType, quantity = 1 } = req.body;

    if (!accountName || !symbol || !orderType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, symbol, orderType'
      });
    }

    // ===== TRADING HOURS VALIDATION =====
    const timeValidation = orderManager.validateTradingTime();
    if (!timeValidation.allowed) {
      console.log(`[VALIDATION BLOCKED] Market order rejected: ${timeValidation.reason}`);
      return res.status(403).json({
        success: false,
        error: `Trading not allowed: ${timeValidation.reason}`,
        trading_restricted: true
      });
    }

    // Get auth from current system (same as frontend)
    const auth = getCurrentAuth();
    const provider = auth.provider;
    const token = auth.token;

    const result = await orderManager.placeMarketOrder(provider, token, accountName, symbol, orderType, quantity);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] Market order API error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/orders/limit:
 *   post:
 *     summary: Place a limit order (DEPRECATED - use /api/orders/place)
 *     deprecated: true
 *     description: |
 *       **DEPRECATED**: Use POST /api/orders/place with orderType="LIMIT" instead.
 *       Execute a limit order using current authenticated session
 *     tags: [Trading (Legacy)]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName, symbol, orderType, limitPrice]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *               orderType:
 *                 type: string
 *                 enum: [BUY, SELL, LONG, SHORT]
 *                 example: BUY
 *               limitPrice:
 *                 type: number
 *                 example: 18000
 *                 description: Limit price for the order
 *               quantity:
 *                 type: integer
 *                 default: 1
 *                 example: 1
 *     responses:
 *       200:
 *         description: Limit order placed successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Order placement failed
 */
app.post('/api/orders/limit', async (req, res) => {
  try {
    const { accountName, symbol, orderType, limitPrice, quantity = 1 } = req.body;

    if (!accountName || !symbol || !orderType || !limitPrice) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, symbol, orderType, limitPrice'
      });
    }

    const auth = getCurrentAuth();
    const provider = auth.provider;
    const token = auth.token;

    const result = await orderManager.placeLimitOrder(provider, token, accountName, symbol, orderType, limitPrice, quantity);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] Limit order API error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/orders/trailing-stop:
 *   post:
 *     summary: Place a trailing stop order (DEPRECATED - use /api/orders/place)
 *     deprecated: true
 *     description: |
 *       **DEPRECATED**: Use POST /api/orders/place with orderType="TRAILING_STOP" instead.
 *       Execute a market order with trailing stop using current authenticated session
 *     tags: [Trading (Legacy)]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName, symbol, orderType, trailDistancePoints]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *               orderType:
 *                 type: string
 *                 enum: [BUY, SELL, LONG, SHORT]
 *                 example: BUY
 *               trailDistancePoints:
 *                 type: number
 *                 example: 10
 *                 description: Trailing distance in points
 *               quantity:
 *                 type: integer
 *                 default: 1
 *                 example: 1
 *     responses:
 *       200:
 *         description: Trailing stop order placed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 marketOrderId:
 *                   type: string
 *                 trailStopOrderId:
 *                   type: string
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Order placement failed
 */
app.post('/api/orders/trailing-stop', async (req, res) => {
  try {
    const { accountName, orderType, symbol, quantity = 1, trailDistancePoints } = req.body;

    if (!accountName || !symbol || !orderType || !trailDistancePoints) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, symbol, orderType, trailDistancePoints'
      });
    }

    const auth = getCurrentAuth();
    const provider = auth.provider;
    const token = auth.token;

    const result = await orderManager.placeTrailStopOrder(provider, token, accountName, orderType, symbol, quantity, trailDistancePoints);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] Trailing stop order API error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/orders/stop:
 *   post:
 *     summary: Place a stop-loss order (DEPRECATED - use /api/orders/place)
 *     deprecated: true
 *     description: |
 *       **DEPRECATED**: Use POST /api/orders/place with orderType="STOP_LOSS" instead.
 *       Place a market order with stop-loss using current authenticated session
 *     tags: [Trading (Legacy)]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName, symbol, orderType, stopLossPoints]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *               orderType:
 *                 type: string
 *                 enum: [BUY, SELL, LONG, SHORT]
 *                 example: BUY
 *               stopLossPoints:
 *                 type: number
 *                 example: 10
 *                 description: Stop loss distance in points
 *               quantity:
 *                 type: number
 *                 example: 1
 *     responses:
 *       200:
 *         description: Stop order placed successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Stop order placement failed
 */
app.post('/api/orders/stop', async (req, res) => {
  try {
    const { accountName, symbol, orderType, stopLossPoints, quantity = 1 } = req.body;

    if (!accountName || !symbol || !orderType || !stopLossPoints) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, symbol, orderType, stopLossPoints'
      });
    }

    const auth = getCurrentAuth();
    const result = await orderManager.placeMarketWithStopLossOrder(auth.provider, auth.token, accountName, orderType, symbol, quantity, stopLossPoints);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/orders/bracket:
 *   post:
 *     summary: Place a bracket order (DEPRECATED - use /api/orders/place)
 *     deprecated: true
 *     description: |
 *       **DEPRECATED**: Use POST /api/orders/place with orderType="BRACKET" instead.
 *       Place a bracket order with take profit and stop loss using current authenticated session
 *     tags: [Trading (Legacy)]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName, symbol, orderType, stopLossPoints, takeProfitPoints]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *               orderType:
 *                 type: string
 *                 enum: [BUY, SELL, LONG, SHORT]
 *                 example: BUY
 *               stopLossPoints:
 *                 type: number
 *                 example: 15
 *                 description: Stop loss distance in points
 *               takeProfitPoints:
 *                 type: number
 *                 example: 20
 *                 description: Take profit distance in points
 *               quantity:
 *                 type: number
 *                 example: 1
 *     responses:
 *       200:
 *         description: Bracket order placed successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Bracket order placement failed
 */
app.post('/api/orders/bracket', async (req, res) => {
  try {
    const { accountName, symbol, orderType, stopLossPoints, takeProfitPoints, quantity = 1 } = req.body;

    if (!accountName || !symbol || !orderType || !stopLossPoints || !takeProfitPoints) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, symbol, orderType, stopLossPoints, takeProfitPoints'
      });
    }

    const auth = getCurrentAuth();
    const result = await orderManager.placeBracketOrderWithTPAndSL(auth.provider, auth.token, accountName, symbol, orderType, quantity, stopLossPoints, takeProfitPoints);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/positions/close:
 *   delete:
 *     summary: Close all positions for a symbol
 *     description: Close all open positions for a specific symbol and account using current authenticated session
 *     tags: [Trading]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName, symbol]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *     responses:
 *       200:
 *         description: Positions closed successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Position close failed
 */
app.delete('/api/positions/close', async (req, res) => {
  try {
    const { accountName, symbol } = req.body;

    if (!accountName || !symbol) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, symbol'
      });
    }

    const auth = getCurrentAuth();
    const provider = auth.provider;
    const token = auth.token;

    const result = await orderManager.closeAllPositionsForASymbol(provider, token, accountName, symbol);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] Close positions API error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/positions/flatten:
 *   delete:
 *     summary: Flatten all positions for account
 *     description: Close all open positions for an account using current authenticated session
 *     tags: [Trading]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *     responses:
 *       200:
 *         description: All positions flattened successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Flatten operation failed
 */
app.delete('/api/positions/flatten', async (req, res) => {
  try {
    const { accountName } = req.body;

    if (!accountName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: accountName'
      });
    }

    const auth = getCurrentAuth();
    const provider = auth.provider;
    const token = auth.token;

    const result = await orderManager.flattenAllPositionsForAccount(provider, token, accountName);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] Flatten positions API error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/positions/reverse:
 *   post:
 *     summary: Reverse an existing position
 *     description: Reverse the direction of an existing position using current authenticated session
 *     tags: [Trading]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName, symbol]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *     responses:
 *       200:
 *         description: Position reversed successfully
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Reverse operation failed
 */
app.post('/api/positions/reverse', async (req, res) => {
  try {
    const { accountName, symbol } = req.body;

    if (!accountName || !symbol) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, symbol'
      });
    }

    const auth = getCurrentAuth();
    const provider = auth.provider;
    const token = auth.token;

    const result = await orderManager.reverseOrder(provider, token, accountName, symbol);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] Reverse position API error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================
// UNIFIED ORDER PLACEMENT API
// ===========================

/**
 * @swagger
 * /api/orders/place:
 *   post:
 *     summary: Place an order (unified endpoint)
 *     description: |
 *       Unified order placement endpoint supporting all order types.
 *       Uses current authenticated session. Backend acts as adapter to frontend OrderManager.
 *     tags: [Trading]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderType, accountName, symbol, action, quantity]
 *             properties:
 *               orderType:
 *                 type: string
 *                 enum: [MARKET, LIMIT, STOP_LOSS, TRAILING_STOP, BRACKET]
 *                 example: MARKET
 *                 description: Type of order to place
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *                 description: Trading account name
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *                 description: Trading symbol
 *               action:
 *                 type: string
 *                 enum: [BUY, SELL, LONG, SHORT]
 *                 example: BUY
 *                 description: Order side
 *               quantity:
 *                 type: integer
 *                 example: 1
 *                 description: Number of contracts
 *               limitPrice:
 *                 type: number
 *                 example: 18000
 *                 description: Required for LIMIT orders - limit price
 *               stopLossPoints:
 *                 type: number
 *                 example: 15
 *                 description: Required for STOP_LOSS and BRACKET orders - stop loss distance in points
 *               takeProfitPoints:
 *                 type: number
 *                 example: 20
 *                 description: Required for BRACKET orders - take profit distance in points
 *               trailDistancePoints:
 *                 type: number
 *                 example: 10
 *                 description: Required for TRAILING_STOP orders - trailing distance in points
 *     responses:
 *       200:
 *         description: Order placed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 orderId:
 *                   type: string
 *                   example: "4644672"
 *                 data:
 *                   type: object
 *                   description: Order details from provider
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Order placement failed
 */
app.post('/api/orders/place', async (req, res) => {
  try {
    const { orderType, accountName, symbol, action, quantity = 1, limitPrice, stopLossPoints, takeProfitPoints, trailDistancePoints } = req.body;

    // Validate required parameters
    if (!orderType || !accountName || !symbol || !action) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: orderType, accountName, symbol, action'
      });
    }

    // ===== TRADING HOURS VALIDATION =====
    const timeValidation = orderManager.validateTradingTime();
    if (!timeValidation.allowed) {
      console.log(`[VALIDATION BLOCKED] Order rejected: ${timeValidation.reason}`);
      return res.status(403).json({
        success: false,
        error: `Trading not allowed: ${timeValidation.reason}`,
        trading_restricted: true
      });
    }

    // Get auth from current system
    const auth = getCurrentAuth();
    const provider = auth.provider;
    const token = auth.token;

    let result;

    // Route to appropriate OrderManager method based on orderType
    switch (orderType.toUpperCase()) {
      case 'MARKET':
        console.log(`[INFO] Placing market order: provider=${provider}, accountName=${accountName}, symbol=${symbol}, action=${action}, quantity=${quantity}`);
        result = await orderManager.placeMarketOrder(provider, token, accountName, symbol, action, quantity);
        break;

      case 'LIMIT':
        if (!limitPrice) {
          return res.status(400).json({
            success: false,
            error: 'limitPrice is required for LIMIT orders'
          });
        }
        console.log(`[INFO] Placing limit order: provider=${provider}, accountName=${accountName}, symbol=${symbol}, action=${action}, limitPrice=${limitPrice}, quantity=${quantity}`);
        result = await orderManager.placeLimitOrder(provider, token, accountName, symbol, action, limitPrice, quantity);
        break;

      case 'STOP_LOSS':
        if (!stopLossPoints) {
          return res.status(400).json({
            success: false,
            error: 'stopLossPoints is required for STOP_LOSS orders'
          });
        }
        console.log(`[INFO] Placing stop loss order: provider=${provider}, accountName=${accountName}, symbol=${symbol}, action=${action}, stopLossPoints=${stopLossPoints}, quantity=${quantity}`);
        result = await orderManager.placeMarketWithStopLossOrder(provider, token, accountName, action, symbol, quantity, stopLossPoints);
        break;

      case 'TRAILING_STOP':
        if (!trailDistancePoints) {
          return res.status(400).json({
            success: false,
            error: 'trailDistancePoints is required for TRAILING_STOP orders'
          });
        }
        console.log(`[INFO] Placing trailing stop order: provider=${provider}, accountName=${accountName}, symbol=${symbol}, action=${action}, trailDistancePoints=${trailDistancePoints}, quantity=${quantity}`);
        result = await orderManager.placeTrailStopOrder(provider, token, accountName, action, symbol, quantity, trailDistancePoints);
        break;

      case 'BRACKET':
        if (!stopLossPoints || !takeProfitPoints) {
          return res.status(400).json({
            success: false,
            error: 'stopLossPoints and takeProfitPoints are required for BRACKET orders'
          });
        }
        console.log(`[INFO] Placing bracket order: provider=${provider}, accountName=${accountName}, symbol=${symbol}, action=${action}, stopLoss=${stopLossPoints}, takeProfit=${takeProfitPoints}, quantity=${quantity}`);
        result = await orderManager.placeBracketOrderWithTPAndSL(provider, token, accountName, symbol, action, quantity, stopLossPoints, takeProfitPoints);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Invalid orderType: ${orderType}. Must be one of: MARKET, LIMIT, STOP_LOSS, TRAILING_STOP, BRACKET`
        });
    }

    res.json(result);
  } catch (error) {
    console.error('[ERROR] Unified order placement error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================
// CLOUDFLARE TUNNEL MANAGEMENT
// ===========================

const { spawn } = require('child_process');
const WEBHOOK_CONFIG_FILE = path.join(__dirname, 'config', 'webhook_config.json');
let tunnelProcess = null;

// Ensure config directory exists
const configDir = path.join(__dirname, 'config');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

/**
 * @swagger
 * /api/check-cloudflared:
 *   get:
 *     summary: Check if cloudflared is installed
 *     description: Verify that cloudflared tunnel binary is available on the system
 *     tags: [Webhook]
 *     responses:
 *       200:
 *         description: Cloudflared installation status
 */
app.get('/api/check-cloudflared', async (req, res) => {
  try {
    const cloudflaredPaths = [
      'cloudflared',
      '/usr/bin/cloudflared',
      '/usr/local/bin/cloudflared',
      '/bin/cloudflared',
      '/opt/homebrew/bin/cloudflared'
    ];

    for (const cloudflaredPath of cloudflaredPaths) {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        const { stdout } = await execAsync(`${cloudflaredPath} --version`);
        return res.json({
          installed: true,
          version: stdout.trim(),
          path: cloudflaredPath
        });
      } catch (err) {
        continue;
      }
    }

    res.json({
      installed: false,
      error: 'Cloudflared not found in PATH or common locations'
    });
  } catch (error) {
    res.json({
      installed: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/start-tunnel:
 *   post:
 *     summary: Start Cloudflare tunnel
 *     description: Start a cloudflared tunnel and return the generated public URL
 *     tags: [Webhook]
 *     responses:
 *       200:
 *         description: Tunnel started successfully
 */
app.post('/api/start-tunnel', async (req, res) => {
  try {
    // Check if cloudflared is installed
    const checkResult = await axios.get('http://localhost:8025/api/check-cloudflared');
    if (!checkResult.data.installed) {
      return res.status(400).json({
        success: false,
        error: `Cloudflare tunnel is not installed. Details: ${checkResult.data.error}`
      });
    }

    const cloudflaredPath = checkResult.data.path || 'cloudflared';
    // Tunnel to frontend (React app) on port 3000, not backend
    const frontendPort = process.env.FRONTEND_PORT || '3000';
    const tunnelUrl = `http://localhost:${frontendPort}`;

    console.log(`[TUNNEL] Starting cloudflared tunnel for ${tunnelUrl} (Frontend Dashboard)`);

    // Stop existing tunnel if running
    if (tunnelProcess && !tunnelProcess.killed) {
      console.log('[TUNNEL] Stopping existing tunnel process');
      tunnelProcess.kill();
      tunnelProcess = null;
    }

    // Start cloudflared tunnel
    tunnelProcess = spawn(cloudflaredPath, ['tunnel', '--url', tunnelUrl, '--no-autoupdate']);

    let publicUrl = null;
    const urlPattern = /https?:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
    const outputLines = [];

    // Set up timeout
    const timeout = setTimeout(() => {
      if (!publicUrl && tunnelProcess) {
        tunnelProcess.kill();
        tunnelProcess = null;
      }
    }, 30000);

    // Capture output to find URL
    const captureOutput = (data) => {
      const line = data.toString();
      outputLines.push(line.trim());
      console.log(`[TUNNEL] ${line.trim()}`);

      const match = line.match(urlPattern);
      if (match && !publicUrl) {
        publicUrl = match[0];
        clearTimeout(timeout);

        // Save to config
        const config = {
          url: publicUrl,
          timestamp: new Date().toISOString(),
          active: true,
          port: frontendPort,
          type: 'frontend'
        };

        fs.writeFileSync(WEBHOOK_CONFIG_FILE, JSON.stringify(config, null, 2));
        console.log(`[TUNNEL] Tunnel URL: ${publicUrl}`);

        res.json({
          success: true,
          url: publicUrl,
          port: frontendPort,
          type: 'frontend',
          message: 'Tunnel started successfully - Frontend dashboard accessible'
        });
      }
    };

    tunnelProcess.stdout.on('data', captureOutput);
    tunnelProcess.stderr.on('data', captureOutput);

    tunnelProcess.on('error', (error) => {
      clearTimeout(timeout);
      console.error('[TUNNEL] Process error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: `Failed to start tunnel: ${error.message}`
        });
      }
    });

    tunnelProcess.on('exit', (code) => {
      clearTimeout(timeout);
      console.log(`[TUNNEL] Process exited with code ${code}`);
      tunnelProcess = null;

      if (!publicUrl && !res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Could not generate tunnel URL',
          output: outputLines.slice(-10)
        });
      }
    });

  } catch (error) {
    console.error('[TUNNEL] Error starting tunnel:', error);
    res.status(500).json({
      success: false,
      error: `Error starting tunnel: ${error.message}`
    });
  }
});

/**
 * @swagger
 * /api/stop-tunnel:
 *   post:
 *     summary: Stop Cloudflare tunnel
 *     description: Stop the currently running cloudflared tunnel
 *     tags: [Webhook]
 *     responses:
 *       200:
 *         description: Tunnel stopped successfully
 */
app.post('/api/stop-tunnel', (req, res) => {
  try {
    if (tunnelProcess && !tunnelProcess.killed) {
      tunnelProcess.kill();
      tunnelProcess = null;
      console.log('[TUNNEL] Stopped tunnel process');

      // Update config
      if (fs.existsSync(WEBHOOK_CONFIG_FILE)) {
        const config = JSON.parse(fs.readFileSync(WEBHOOK_CONFIG_FILE, 'utf8'));
        config.active = false;
        config.stopped_at = new Date().toISOString();
        fs.writeFileSync(WEBHOOK_CONFIG_FILE, JSON.stringify(config, null, 2));
      }

      res.json({
        success: true,
        message: 'Tunnel stopped successfully'
      });
    } else {
      res.json({
        success: false,
        message: 'No active tunnel to stop'
      });
    }
  } catch (error) {
    console.error('[TUNNEL] Error stopping tunnel:', error);
    res.status(500).json({
      success: false,
      error: `Error stopping tunnel: ${error.message}`
    });
  }
});

/**
 * @swagger
 * /api/kill-cloudflared:
 *   post:
 *     summary: Force kill all cloudflared processes
 *     description: Kill all running cloudflared processes on the system
 *     tags: [Webhook]
 *     responses:
 *       200:
 *         description: Cloudflared processes killed
 */
app.post('/api/kill-cloudflared', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const methods = [
      'pkill cloudflared',
      'killall cloudflared',
      'taskkill /F /IM cloudflared.exe'
    ];

    for (const cmd of methods) {
      try {
        await execAsync(cmd);
        console.log(`[TUNNEL] Killed cloudflared processes using: ${cmd}`);

        // Update config
        if (fs.existsSync(WEBHOOK_CONFIG_FILE)) {
          const config = JSON.parse(fs.readFileSync(WEBHOOK_CONFIG_FILE, 'utf8'));
          config.active = false;
          config.force_killed_at = new Date().toISOString();
          fs.writeFileSync(WEBHOOK_CONFIG_FILE, JSON.stringify(config, null, 2));
        }

        tunnelProcess = null;

        return res.json({
          success: true,
          message: 'Cloudflared processes killed successfully',
          method: cmd.split(' ')[0]
        });
      } catch (err) {
        continue;
      }
    }

    res.json({
      success: false,
      error: 'All process kill methods failed. Try stopping cloudflared manually.'
    });
  } catch (error) {
    console.error('[TUNNEL] Error killing cloudflared:', error);
    res.status(500).json({
      success: false,
      error: `Error killing cloudflared: ${error.message}`
    });
  }
});

/**
 * @swagger
 * /api/get-webhook-url:
 *   get:
 *     summary: Get saved webhook URL
 *     description: Retrieve the currently saved webhook tunnel URL from config
 *     tags: [Webhook]
 *     responses:
 *       200:
 *         description: Webhook URL retrieved
 */
app.get('/api/get-webhook-url', (req, res) => {
  try {
    if (!fs.existsSync(WEBHOOK_CONFIG_FILE)) {
      return res.json({
        success: true,
        url: null,
        active: false
      });
    }

    const config = JSON.parse(fs.readFileSync(WEBHOOK_CONFIG_FILE, 'utf8'));

    // Check if tunnel process is actually running in memory
    const processActive = tunnelProcess && !tunnelProcess.killed && tunnelProcess.exitCode === null;

    // Also check if cloudflared is running on the system
    const { exec } = require('child_process');
    exec('pgrep -f cloudflared', (error, stdout) => {
      const systemProcessActive = !error && stdout.trim().length > 0;

      // Tunnel is active if either condition is true
      const actuallyActive = processActive || systemProcessActive;

      // If config says active but neither process exists, update config
      if (config.active && !actuallyActive) {
        console.log('[TUNNEL] Config says active but no process found, updating...');
        config.active = false;
        config.stopped_at = new Date().toISOString();
        fs.writeFileSync(WEBHOOK_CONFIG_FILE, JSON.stringify(config, null, 2));
      }

      res.json({
        success: true,
        url: config.url,
        active: actuallyActive, // Return actual state based on running processes
        timestamp: config.timestamp,
        port: config.port
      });
    });
  } catch (error) {
    console.error('[TUNNEL] Error getting webhook URL:', error);
    res.status(500).json({
      success: false,
      error: `Error getting webhook URL: ${error.message}`
    });
  }
});

/**
 * @swagger
 * /api/save-webhook-url:
 *   post:
 *     summary: Save webhook URL
 *     description: Manually save a webhook URL to config
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *     responses:
 *       200:
 *         description: URL saved successfully
 */
app.post('/api/save-webhook-url', (req, res) => {
  try {
    const { url } = req.body;

    const config = {
      url,
      timestamp: new Date().toISOString(),
      active: true,
      manually_saved: true
    };

    fs.writeFileSync(WEBHOOK_CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`[TUNNEL] Manually saved webhook URL: ${url}`);

    res.json({
      success: true,
      message: 'Webhook URL saved successfully'
    });
  } catch (error) {
    console.error('[TUNNEL] Error saving webhook URL:', error);
    res.status(500).json({
      success: false,
      error: `Error saving webhook URL: ${error.message}`
    });
  }
});

// ===========================
// WEBHOOK TRADING ENDPOINTS (Route to unified API)
// ===========================

/**
 * @swagger
 * /webhook/order:
 *   post:
 *     summary: Place any order via webhook (unified endpoint)
 *     description: |
 *       Unified webhook endpoint for TradingView alerts. Routes to /api/orders/place.
 *       Supports all order types: MARKET, LIMIT, STOP_LOSS, TRAILING_STOP, BRACKET
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderType, accountName, symbol, action]
 *             properties:
 *               orderType:
 *                 type: string
 *                 enum: [MARKET, LIMIT, STOP_LOSS, TRAILING_STOP, BRACKET]
 *                 example: MARKET
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *               action:
 *                 type: string
 *                 enum: [BUY, SELL, LONG, SHORT]
 *                 example: BUY
 *               quantity:
 *                 type: integer
 *                 default: 1
 *                 example: 1
 *               limitPrice:
 *                 type: number
 *                 example: 18000
 *               stopLossPoints:
 *                 type: number
 *                 example: 15
 *               takeProfitPoints:
 *                 type: number
 *                 example: 20
 *               trailDistancePoints:
 *                 type: number
 *                 example: 10
 *     responses:
 *       200:
 *         description: Order placed successfully
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Order failed
 */
app.post('/webhook/order', async (req, res) => {
  try {
    // Webhook orders use the unified API internally
    const { orderType, accountName, symbol, action, quantity = 1, limitPrice, stopLossPoints, takeProfitPoints, trailDistancePoints } = req.body;

    // Validate required parameters
    if (!orderType || !accountName || !symbol || !action) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: orderType, accountName, symbol, action'
      });
    }

    // ===== TRADING HOURS VALIDATION =====
    const timeValidation = orderManager.validateTradingTime();
    if (!timeValidation.allowed) {
      console.log(`[VALIDATION BLOCKED] Webhook order rejected: ${timeValidation.reason}`);
      return res.status(403).json({
        success: false,
        error: `Trading not allowed: ${timeValidation.reason}`,
        trading_restricted: true
      });
    }

    // Get auth from current system
    const auth = getCurrentAuth();
    const provider = auth.provider;
    const token = auth.token;

    let result;

    // Route to appropriate OrderManager method based on orderType
    switch (orderType.toUpperCase()) {
      case 'MARKET':
        result = await orderManager.placeMarketOrder(provider, token, accountName, symbol, action, quantity);
        break;

      case 'LIMIT':
        if (!limitPrice) {
          return res.status(400).json({ success: false, error: 'limitPrice required for LIMIT orders' });
        }
        result = await orderManager.placeLimitOrder(provider, token, accountName, symbol, action, limitPrice, quantity);
        break;

      case 'STOP_LOSS':
        if (!stopLossPoints) {
          return res.status(400).json({ success: false, error: 'stopLossPoints required for STOP_LOSS orders' });
        }
        result = await orderManager.placeMarketWithStopLossOrder(provider, token, accountName, action, symbol, quantity, stopLossPoints);
        break;

      case 'TRAILING_STOP':
        if (!trailDistancePoints) {
          return res.status(400).json({ success: false, error: 'trailDistancePoints required for TRAILING_STOP orders' });
        }
        result = await orderManager.placeTrailStopOrder(provider, token, accountName, action, symbol, quantity, trailDistancePoints);
        break;

      case 'BRACKET':
        if (!stopLossPoints || !takeProfitPoints) {
          return res.status(400).json({ success: false, error: 'stopLossPoints and takeProfitPoints required for BRACKET orders' });
        }
        result = await orderManager.placeBracketOrderWithTPAndSL(provider, token, accountName, symbol, action, quantity, stopLossPoints, takeProfitPoints);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Invalid orderType: ${orderType}. Must be one of: MARKET, LIMIT, STOP_LOSS, TRAILING_STOP, BRACKET`
        });
    }

    res.json(result);
  } catch (error) {
    console.error('[WEBHOOK] Order error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Webhook position management endpoints (simplified)
/**
 * @swagger
 * /webhook/close:
 *   delete:
 *     summary: Close position via webhook
 *     description: Close all positions for a specific symbol
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName, symbol]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *     responses:
 *       200:
 *         description: Position closed successfully
 */
app.delete('/webhook/close', async (req, res) => {
  try {
    const auth = getCurrentAuth();
    const { accountName, symbol } = req.body;

    const result = await orderManager.closeAllPositionsForASymbol(auth.provider, auth.token, accountName, symbol);
    res.json(result);
  } catch (error) {
    console.error('[WEBHOOK] Close error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /webhook/flatten:
 *   delete:
 *     summary: Flatten all positions via webhook
 *     description: Close all positions for an account
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *     responses:
 *       200:
 *         description: All positions flattened successfully
 */
app.delete('/webhook/flatten', async (req, res) => {
  try {
    const auth = getCurrentAuth();
    const { accountName } = req.body;

    const result = await orderManager.flattenAllPositionsForAccount(auth.provider, auth.token, accountName);
    res.json(result);
  } catch (error) {
    console.error('[WEBHOOK] Flatten error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /webhook/reverse:
 *   post:
 *     summary: Reverse position via webhook
 *     description: Close current position and open opposite direction
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountName, symbol]
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: TFDXAP_508PA89
 *               symbol:
 *                 type: string
 *                 example: MNQ
 *     responses:
 *       200:
 *         description: Position reversed successfully
 */
app.post('/webhook/reverse', async (req, res) => {
  try {
    const auth = getCurrentAuth();
    const { accountName, symbol } = req.body;

    const result = await orderManager.reverseOrder(auth.provider, auth.token, accountName, symbol);
    res.json(result);
  } catch (error) {
    console.error('[WEBHOOK] Reverse error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: Root endpoint - Webhook info
 *     description: Display webhook system information and available endpoints
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Webhook system information
 */
app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'SuperCharts Trading Webhook API',
    version: '1.0.0',
    message: 'Webhook service is running. This URL is for TradingView webhooks.',
    documentation: '/api/docs',
    health: '/api/health',
    webhookEndpoints: {
      marketOrder: '/webhook/market-order',
      limitOrder: '/webhook/limit-order',
      stopLossUI: '/webhook/stop-loss-ui',
      trailingStop: '/webhook/trailing-stop-order',
      bracketUI: '/webhook/bracket-ui',
      closePosition: '/webhook/close-position',
      reversePosition: '/webhook/reverse-position',
      flattenAll: '/webhook/flatten-all-positions'
    },
    instructions: 'Use the webhook generator at http://localhost:3000/webhook-generator to configure TradingView alerts'
  });
});

// ===========================
// TRADING HOURS ENDPOINTS
// ===========================

/**
 * @swagger
 * /api/trading-hours/status:
 *   get:
 *     summary: Get trading hours status
 *     description: Get current trading status based on all time restrictions
 *     tags: [Trading Hours]
 *     responses:
 *       200:
 *         description: Trading status retrieved
 */
app.get('/api/trading-hours/status', (req, res) => {
  try {
    const validation = orderManager.validateTradingTime();

    const now = new Date();
    const currentTimeGMT = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;
    const currentTimeLocal = now.toLocaleTimeString();

    // Load configs for detailed response
    const hoursConfigPath = path.join(__dirname, 'config', 'trading_hours_config.json');
    const sessionsConfigPath = path.join(__dirname, 'config', 'trading_sessions_config.json');

    let hoursConfig = { restrict_hours: false, start_hour: 0, start_minute: 0, end_hour: 23, end_minute: 59 };
    let sessionsConfig = { enabled: false, allowed_sessions: [], restricted_sessions: [] };

    if (fs.existsSync(hoursConfigPath)) {
      hoursConfig = JSON.parse(fs.readFileSync(hoursConfigPath, 'utf8'));
    }

    if (fs.existsSync(sessionsConfigPath)) {
      sessionsConfig = JSON.parse(fs.readFileSync(sessionsConfigPath, 'utf8'));
    }

    // Get active sessions
    const activeSessions = getActiveSessions(now);

    res.json({
      success: true,
      trading_allowed: validation.allowed,
      reason: validation.reason,
      current_time_gmt: currentTimeGMT,
      current_time_local: currentTimeLocal,
      trading_hours: {
        restrict_enabled: hoursConfig.restrict_hours,
        start: `${hoursConfig.start_hour.toString().padStart(2, '0')}:${hoursConfig.start_minute.toString().padStart(2, '0')}`,
        end: `${hoursConfig.end_hour.toString().padStart(2, '0')}:${hoursConfig.end_minute.toString().padStart(2, '0')}`
      },
      sessions: {
        enabled: sessionsConfig.enabled,
        allowed_sessions: sessionsConfig.allowed_sessions || [],
        restricted_sessions: sessionsConfig.restricted_sessions || [],
        active_sessions: activeSessions
      }
    });
  } catch (error) {
    console.error('[ERROR] Trading hours status error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/trading-hours/config:
 *   post:
 *     summary: Save trading hours configuration
 *     description: Save time-based trading restrictions
 *     tags: [Trading Hours]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               start_hour:
 *                 type: integer
 *               start_minute:
 *                 type: integer
 *               end_hour:
 *                 type: integer
 *               end_minute:
 *                 type: integer
 *               restrict_hours:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Configuration saved
 */
app.post('/api/trading-hours/config', (req, res) => {
  try {
    const { start_hour, start_minute, end_hour, end_minute, restrict_hours } = req.body;

    const config = {
      start_hour: start_hour || 0,
      start_minute: start_minute || 0,
      end_hour: end_hour || 23,
      end_minute: end_minute || 59,
      restrict_hours: restrict_hours || false,
      last_updated: new Date().toISOString()
    };

    const configPath = path.join(__dirname, 'config', 'trading_hours_config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('[TRADING HOURS] Configuration saved:', config);

    res.json({
      success: true,
      message: 'Trading hours configuration saved successfully',
      config
    });
  } catch (error) {
    console.error('[ERROR] Trading hours config save error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/trading-hours/sessions:
 *   get:
 *     summary: Get trading sessions configuration
 *     description: Get session-based trading restrictions
 *     tags: [Trading Hours]
 *     responses:
 *       200:
 *         description: Sessions configuration retrieved
 */
app.get('/api/trading-hours/sessions', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config', 'trading_sessions_config.json');

    let config = {
      enabled: false,
      allowed_sessions: [],
      restricted_sessions: [],
      predefined_sessions: {
        '2300-0800': 'Asia (Tokyo)',
        '0700-1600': 'Europe (London)',
        '1200-2100': 'U.S. (New York)',
        '0700-0800': 'Asia↔London Overlap',
        '1200-1600': 'London↔New York Overlap'
      }
    };

    if (fs.existsSync(configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...savedConfig };
    }

    // Get active sessions
    const now = new Date();
    const activeSessions = getActiveSessions(now);

    res.json({
      success: true,
      ...config,
      active_sessions: activeSessions
    });
  } catch (error) {
    console.error('[ERROR] Trading sessions get error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/trading-hours/sessions:
 *   post:
 *     summary: Save trading sessions configuration
 *     description: Save session-based trading restrictions
 *     tags: [Trading Hours]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               allowed_sessions:
 *                 type: array
 *                 items:
 *                   type: string
 *               restricted_sessions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Configuration saved
 */
app.post('/api/trading-hours/sessions', (req, res) => {
  try {
    const { enabled, allowed_sessions, restricted_sessions } = req.body;

    const config = {
      enabled: enabled || false,
      allowed_sessions: allowed_sessions || [],
      restricted_sessions: restricted_sessions || [],
      last_updated: new Date().toISOString()
    };

    const configPath = path.join(__dirname, 'config', 'trading_sessions_config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('[TRADING SESSIONS] Configuration saved:', config);

    res.json({
      success: true,
      message: 'Trading sessions configuration saved successfully',
      config
    });
  } catch (error) {
    console.error('[ERROR] Trading sessions config save error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to get active sessions
function getActiveSessions(now) {
  const currentTimeGMT = now.getUTCHours().toString().padStart(2, '0') +
                         now.getUTCMinutes().toString().padStart(2, '0');

  const sessions = {
    'Asia (Tokyo)': ['2300', '0800'],
    'Europe (London)': ['0700', '1600'],
    'U.S. (New York)': ['1200', '2100'],
    'Asia↔London Overlap': ['0700', '0800'],
    'London↔New York Overlap': ['1200', '1600']
  };

  const activeSessions = [];

  for (const [sessionName, [start, end]] of Object.entries(sessions)) {
    if (isTimeInSessionRange(currentTimeGMT, start, end)) {
      activeSessions.push(sessionName);
    }
  }

  return activeSessions;
}

function isTimeInSessionRange(current, start, end) {
  const currentInt = parseInt(current);
  const startInt = parseInt(start);
  const endInt = parseInt(end);

  if (startInt <= endInt) {
    return startInt <= currentInt && currentInt <= endInt;
  } else {
    return currentInt >= startInt || currentInt <= endInt;
  }
}

// ===========================
// ECONOMIC CALENDAR ENDPOINTS
// ===========================

/**
 * @swagger
 * /api/economic-calendar/config:
 *   get:
 *     summary: Get economic calendar configuration
 *     description: Retrieve the current economic calendar settings including enabled status, buffer times, and events
 *     tags: [Economic Calendar]
 *     responses:
 *       200:
 *         description: Configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 config:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     before_event_minutes:
 *                       type: number
 *                     after_event_minutes:
 *                       type: number
 *                     liquidate_positions_before_event:
 *                       type: boolean
 *                     events:
 *                       type: array
 *                     last_updated:
 *                       type: string
 */
app.get('/api/economic-calendar/config', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');

    if (!fs.existsSync(configPath)) {
      return res.json({
        success: true,
        config: {
          enabled: false,
          before_event_minutes: 30,
          after_event_minutes: 30,
          liquidate_positions_before_event: false,
          events: [],
          last_updated: null
        }
      });
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.json({ success: true, config });
  } catch (error) {
    console.error('[ERROR] Failed to load economic calendar config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/economic-calendar/config:
 *   post:
 *     summary: Update economic calendar configuration
 *     description: Save economic calendar settings including buffer times and enabled status
 *     tags: [Economic Calendar]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               before_event_minutes:
 *                 type: number
 *               after_event_minutes:
 *                 type: number
 *               liquidate_positions_before_event:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Configuration saved successfully
 */
app.post('/api/economic-calendar/config', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');

    // Load existing config
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Update settings
    if (req.body.enabled !== undefined) config.enabled = req.body.enabled;
    if (req.body.before_event_minutes !== undefined) config.before_event_minutes = req.body.before_event_minutes;
    if (req.body.after_event_minutes !== undefined) config.after_event_minutes = req.body.after_event_minutes;
    if (req.body.liquidate_positions_before_event !== undefined) config.liquidate_positions_before_event = req.body.liquidate_positions_before_event;
    config.last_updated = new Date().toISOString();

    // Preserve events array
    if (!config.events) config.events = [];

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('[SUCCESS] Economic calendar config saved:', config);

    res.json({ success: true, config });
  } catch (error) {
    console.error('[ERROR] Failed to save economic calendar config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/economic-calendar/events:
 *   get:
 *     summary: Get all economic events
 *     description: Retrieve list of all scheduled economic events
 *     tags: [Economic Calendar]
 *     responses:
 *       200:
 *         description: Events retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       datetime:
 *                         type: string
 *                       impact:
 *                         type: string
 *                       enabled:
 *                         type: boolean
 */
app.get('/api/economic-calendar/events', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');

    if (!fs.existsSync(configPath)) {
      return res.json({ success: true, events: [] });
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.json({ success: true, events: config.events || [] });
  } catch (error) {
    console.error('[ERROR] Failed to load events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/economic-calendar/events:
 *   post:
 *     summary: Add or update economic event
 *     description: Create new economic event or update existing one
 *     tags: [Economic Calendar]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - datetime
 *             properties:
 *               id:
 *                 type: string
 *               title:
 *                 type: string
 *               datetime:
 *                 type: string
 *               impact:
 *                 type: string
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Event saved successfully
 */
app.post('/api/economic-calendar/events', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');

    // Load existing config
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    if (!config.events) config.events = [];

    const eventData = {
      id: req.body.id || `event_${Date.now()}`,
      title: req.body.title,
      datetime: req.body.datetime,
      impact: req.body.impact || 'HIGH',
      enabled: req.body.enabled !== undefined ? req.body.enabled : true
    };

    // Check if updating existing event
    const existingIndex = config.events.findIndex(e => e.id === eventData.id);
    if (existingIndex >= 0) {
      config.events[existingIndex] = eventData;
      console.log('[SUCCESS] Updated event:', eventData.title);
    } else {
      config.events.push(eventData);
      console.log('[SUCCESS] Added event:', eventData.title);
    }

    config.last_updated = new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    res.json({ success: true, event: eventData, events: config.events });
  } catch (error) {
    console.error('[ERROR] Failed to save event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/economic-calendar/events/{id}:
 *   delete:
 *     summary: Delete economic event
 *     description: Remove an economic event from the calendar
 *     tags: [Economic Calendar]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Event deleted successfully
 */
app.delete('/api/economic-calendar/events/:id', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ success: false, error: 'No events found' });
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!config.events) {
      return res.status(404).json({ success: false, error: 'No events found' });
    }

    const initialLength = config.events.length;
    config.events = config.events.filter(e => e.id !== req.params.id);

    if (config.events.length === initialLength) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    config.last_updated = new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('[SUCCESS] Deleted event:', req.params.id);
    res.json({ success: true, events: config.events });
  } catch (error) {
    console.error('[ERROR] Failed to delete event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================
// ECONOMIC EVENTS FETCHING
// ===========================

/**
 * @swagger
 * /api/economic-calendar/fetch-events:
 *   post:
 *     summary: Fetch economic events from external source
 *     description: Downloads and imports economic events from external API
 *     tags: [Economic Calendar]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               source_url:
 *                 type: string
 *                 description: Optional custom URL to fetch events from
 *     responses:
 *       200:
 *         description: Events fetched and imported successfully
 */
app.post('/api/economic-calendar/fetch-events', async (req, res) => {
  try {
    const sourceUrl = req.body.source_url || 'https://dvs7yi5a78.execute-api.us-east-1.amazonaws.com/api/file/weekly_economic_events/download';

    console.log('[FETCH EVENTS] Downloading from:', sourceUrl);

    // Fetch events from external source
    const axios = require('axios');
    const response = await axios.get(sourceUrl, { timeout: 30000 });

    if (!response.data || !response.data.events) {
      throw new Error('Invalid response format from source');
    }

    const externalEvents = response.data.events;
    console.log('[FETCH EVENTS] Downloaded', externalEvents.length, 'events');

    // Filter out past events
    const today = new Date().toISOString().split('T')[0];
    const futureEvents = externalEvents.filter(event => {
      return event.date >= today;
    });

    console.log('[FETCH EVENTS]', futureEvents.length, 'future events after filtering');

    // Load existing config
    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');
    let config = {};

    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Transform external events to our format
    const importedEvents = futureEvents.map((event, index) => {
      // Combine date and time_gmt to create ISO datetime
      const timeStr = event.time_gmt.split(' ')[0]; // Remove ' GMT' suffix
      const datetime = event.date + 'T' + timeStr + ':00.000Z';

      return {
        id: 'imported_' + Date.now() + '_' + index,
        title: event.event,
        datetime: datetime,
        impact: event.impact.toUpperCase(),
        currency: event.currency || 'Unknown',
        enabled: false, // Default to disabled - user must explicitly add to restrictions
        source: 'external',
        imported_at: new Date().toISOString()
      };
    });

    // Merge with existing events (avoid duplicates)
    const existingEvents = config.events || [];
    const existingTitles = new Set(existingEvents.map(e => e.title + e.datetime));

    const newEvents = importedEvents.filter(e => {
      return !existingTitles.has(e.title + e.datetime);
    });

    config.events = [...existingEvents, ...newEvents];
    config.last_updated = new Date().toISOString();
    config.last_fetch = new Date().toISOString();
    config.source_url = sourceUrl;

    // Save config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('[SUCCESS] Imported', newEvents.length, 'new events,', (importedEvents.length - newEvents.length), 'duplicates skipped');

    res.json({
      success: true,
      message: 'Fetched ' + externalEvents.length + ' events, imported ' + newEvents.length + ' new events',
      total_fetched: externalEvents.length,
      future_events: futureEvents.length,
      imported: newEvents.length,
      duplicates: importedEvents.length - newEvents.length,
      total_events: config.events.length
    });

  } catch (error) {
    console.error('[ERROR] Failed to fetch events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Failed to fetch economic events from external source'
    });
  }
});

/**
 * @swagger
 * /api/economic-calendar/clear-imported:
 *   delete:
 *     summary: Clear all imported events
 *     description: Removes all events that were imported from external sources
 *     tags: [Economic Calendar]
 *     responses:
 *       200:
 *         description: Imported events cleared successfully
 */
app.delete('/api/economic-calendar/clear-imported', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');

    if (!fs.existsSync(configPath)) {
      return res.json({ success: true, message: 'No events to clear' });
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const originalCount = config.events ? config.events.length : 0;

    // Keep only manually added events (those without 'source' field or source !== 'external')
    config.events = (config.events || []).filter(event => {
      return event.source !== 'external';
    });

    const removedCount = originalCount - config.events.length;

    config.last_updated = new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('[SUCCESS] Cleared', removedCount, 'imported events');

    res.json({
      success: true,
      message: 'Cleared ' + removedCount + ' imported events',
      removed: removedCount,
      remaining: config.events.length
    });

  } catch (error) {
    console.error('[ERROR] Failed to clear imported events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/economic-calendar/add-restrictions:
 *   post:
 *     summary: Add events to trading restrictions
 *     description: Enable trading restrictions for selected events with custom buffer times
 *     tags: [Economic Calendar]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               before_minutes:
 *                 type: number
 *               after_minutes:
 *                 type: number
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Successfully added restrictions
 */
app.post('/api/economic-calendar/add-restrictions', (req, res) => {
  try {
    const { event_ids, before_minutes, after_minutes, enabled } = req.body;

    if (!event_ids || !Array.isArray(event_ids) || event_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'event_ids array required' });
    }

    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Enable global event restrictions and set buffer times
    config.enabled = true;
    config.before_event_minutes = before_minutes || 30;
    config.after_event_minutes = after_minutes || 30;

    // Enable the selected events
    config.events = config.events.map(event => {
      if (event_ids.includes(event.id)) {
        return { ...event, enabled: true };
      }
      return event;
    });

    config.last_updated = new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(`[ADD RESTRICTIONS] Enabled ${event_ids.length} events with ${before_minutes}min before, ${after_minutes}min after`);

    res.json({
      success: true,
      message: `Added ${event_ids.length} events to restrictions`,
      count: event_ids.length,
      config: {
        enabled: config.enabled,
        before_event_minutes: config.before_event_minutes,
        after_event_minutes: config.after_event_minutes
      }
    });
  } catch (error) {
    console.error('[ERROR] Failed to add restrictions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/economic-calendar/clear-restrictions:
 *   post:
 *     summary: Clear trading restrictions for selected events
 *     description: Disable trading restrictions for the specified events
 *     tags: [Economic Calendar]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Successfully cleared restrictions
 */
app.post('/api/economic-calendar/clear-restrictions', (req, res) => {
  try {
    const { event_ids } = req.body;

    if (!event_ids || !Array.isArray(event_ids) || event_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'event_ids array required' });
    }

    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Disable the selected events
    let clearedCount = 0;
    config.events = config.events.map(event => {
      if (event_ids.includes(event.id) && event.enabled) {
        clearedCount++;
        return { ...event, enabled: false };
      }
      return event;
    });

    // Check if any events are still enabled
    const hasEnabledEvents = config.events.some(event => event.enabled);
    if (!hasEnabledEvents) {
      config.enabled = false; // Disable global restriction if no events are enabled
    }

    config.last_updated = new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(`[CLEAR RESTRICTIONS] Disabled ${clearedCount} events`);

    res.json({
      success: true,
      message: `Cleared restrictions for ${clearedCount} events`,
      count: clearedCount,
      global_enabled: config.enabled
    });
  } catch (error) {
    console.error('[ERROR] Failed to clear restrictions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================
// SYSTEM ENDPOINTS
// ===========================

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Check if the API server is running and healthy
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Webhook Bot API is running'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *                   example: '1.0.0'
 */
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
// ===========================
// ECONOMIC EVENTS FETCHING
// ===========================

/**
 * @swagger
 * /api/economic-calendar/fetch-events:
 *   post:
 *     summary: Fetch economic events from external source
 *     description: Downloads and imports economic events from external API
 *     tags: [Economic Calendar]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               source_url:
 *                 type: string
 *                 description: Optional custom URL to fetch events from
 *     responses:
 *       200:
 *         description: Events fetched and imported successfully
 */
app.post('/api/economic-calendar/fetch-events', async (req, res) => {
  try {
    const sourceUrl = req.body.source_url || 'https://dvs7yi5a78.execute-api.us-east-1.amazonaws.com/api/file/weekly_economic_events/download';
    
    console.log(`[FETCH EVENTS] Downloading from: ${sourceUrl}`);
    
    // Fetch events from external source
    const axios = require('axios');
    const response = await axios.get(sourceUrl, { timeout: 30000 });
    
    if (!response.data || !response.data.events) {
      throw new Error('Invalid response format from source');
    }
    
    const externalEvents = response.data.events;
    console.log(`[FETCH EVENTS] Downloaded ${externalEvents.length} events`);
    
    // Filter out past events
    const today = new Date().toISOString().split('T')[0];
    const futureEvents = externalEvents.filter(event => {
      return event.date >= today;
    });
    
    console.log(`[FETCH EVENTS] ${futureEvents.length} future events after filtering`);
    
    // Load existing config
    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');
    let config = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    // Transform external events to our format
    const importedEvents = futureEvents.map((event, index) => {
      // Combine date and time_gmt to create ISO datetime
      const datetime = `${event.date}T${event.time_gmt.replace(' GMT', '')}:00.000Z`;
      
      return {
        id: `imported_${Date.now()}_${index}`,
        title: event.event,
        datetime: datetime,
        impact: event.impact.toUpperCase(),
        currency: event.currency || 'Unknown',
        enabled: true,
        source: 'external',
        imported_at: new Date().toISOString()
      };
    });
    
    // Merge with existing events (avoid duplicates)
    const existingEvents = config.events || [];
    const existingTitles = new Set(existingEvents.map(e => e.title + e.datetime));
    
    const newEvents = importedEvents.filter(e => {
      return !existingTitles.has(e.title + e.datetime);
    });
    
    config.events = [...existingEvents, ...newEvents];
    config.last_updated = new Date().toISOString();
    config.last_fetch = new Date().toISOString();
    config.source_url = sourceUrl;
    
    // Save config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    console.log(`[SUCCESS] Imported ${newEvents.length} new events, ${importedEvents.length - newEvents.length} duplicates skipped`);
    
    res.json({
      success: true,
      message: `Fetched ${externalEvents.length} events, imported ${newEvents.length} new events`,
      total_fetched: externalEvents.length,
      future_events: futureEvents.length,
      imported: newEvents.length,
      duplicates: importedEvents.length - newEvents.length,
      total_events: config.events.length
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to fetch events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Failed to fetch economic events from external source'
    });
  }
});

/**
 * @swagger
 * /api/economic-calendar/clear-imported:
 *   delete:
 *     summary: Clear all imported events
 *     description: Removes all events that were imported from external sources
 *     tags: [Economic Calendar]
 *     responses:
 *       200:
 *         description: Imported events cleared successfully
 */
app.delete('/api/economic-calendar/clear-imported', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config', 'economic_events_config.json');
    
    if (!fs.existsSync(configPath)) {
      return res.json({ success: true, message: 'No events to clear' });
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    const originalCount = config.events ? config.events.length : 0;
    
    // Keep only manually added events (those without 'source' field or source !== 'external')
    config.events = (config.events || []).filter(event => {
      return event.source !== 'external';
    });
    
    const removedCount = originalCount - config.events.length;
    
    config.last_updated = new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    console.log(`[SUCCESS] Cleared ${removedCount} imported events`);
    
    res.json({
      success: true,
      message: `Cleared ${removedCount} imported events`,
      removed: removedCount,
      remaining: config.events.length
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to clear imported events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

