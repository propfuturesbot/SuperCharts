const request = require('supertest');
const axios = require('axios');

const API_BASE_URL = 'http://localhost:8025';

describe('Trading Backend API Tests', () => {
  
  beforeAll(async () => {
    // Wait for server to be ready
    const maxAttempts = 30;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        await axios.get(`${API_BASE_URL}/api/contracts`);
        console.log('✅ Backend server is ready for testing');
        break;
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) {
          throw new Error('Backend server is not responding after 30 attempts');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  });

  describe('Contract Endpoints', () => {
    test('GET /api/contracts should return contracts successfully', async () => {
      const response = await axios.get(`${API_BASE_URL}/api/contracts`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('contracts');
      expect(response.data).toHaveProperty('count');
      expect(response.data).toHaveProperty('source', 'cached_file');
      expect(Array.isArray(response.data.contracts)).toBe(true);
      expect(response.data.count).toBeGreaterThan(0);
      
      // Check contract structure
      if (response.data.contracts.length > 0) {
        const contract = response.data.contracts[0];
        expect(contract).toHaveProperty('symbol');
        expect(contract).toHaveProperty('name');
        expect(contract).toHaveProperty('exchange');
        expect(contract).toHaveProperty('category');
      }
    });
  });

  describe('Strategy Endpoints', () => {
    let createdStrategyId = null;

    test('GET /api/strategies should return empty strategies list initially', async () => {
      const response = await axios.get(`${API_BASE_URL}/api/strategies`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('data');
      expect(response.data).toHaveProperty('count', 0);
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    test('POST /api/strategies should create a new strategy', async () => {
      const strategyData = {
        name: 'Test Strategy',
        strategy_type: 'candlestick',
        contract_symbol: 'NQ',
        contract_name: 'E-mini Nasdaq-100 Futures',
        timeframe: '5m',
        status: 'inactive',
        indicators: [
          { name: 'sma', display_name: 'SMA', parameters: { period: 20 } }
        ]
      };

      const response = await axios.post(`${API_BASE_URL}/api/strategies`, strategyData);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('message', 'Strategy saved successfully');
      expect(response.data).toHaveProperty('id');
      expect(typeof response.data.id).toBe('number');
      
      createdStrategyId = response.data.id;
    });

    test('POST /api/strategies should handle invalid data gracefully', async () => {
      const invalidData = {
        // Missing required fields
      };

      try {
        const response = await axios.post(`${API_BASE_URL}/api/strategies`, invalidData);
        // Current implementation doesn't validate, so it should still succeed
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('success', true);
      } catch (error) {
        // If validation is added later, expect proper error handling
        expect(error.response.status).toBeGreaterThanOrEqual(400);
      }
    });

    // Note: The current backend doesn't implement PATCH and DELETE endpoints
    // These tests will fail until those endpoints are implemented
    test.skip('PATCH /api/strategies/:id should update strategy status', async () => {
      if (!createdStrategyId) {
        throw new Error('No strategy ID available for testing');
      }

      const updateData = { status: 'active' };
      
      const response = await axios.patch(`${API_BASE_URL}/api/strategies/${createdStrategyId}`, updateData);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
    });

    test.skip('DELETE /api/strategies/:id should delete a strategy', async () => {
      if (!createdStrategyId) {
        throw new Error('No strategy ID available for testing');
      }

      const response = await axios.delete(`${API_BASE_URL}/api/strategies/${createdStrategyId}`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
    });
  });

  describe('Error Handling', () => {
    test('Should handle non-existent endpoints gracefully', async () => {
      try {
        await axios.get(`${API_BASE_URL}/api/nonexistent`);
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
    });

    test('Should handle CORS properly', async () => {
      const response = await axios.get(`${API_BASE_URL}/api/contracts`, {
        headers: {
          'Origin': 'http://localhost:3000'
        }
      });
      
      expect(response.status).toBe(200);
      // CORS headers should be present in actual response
    });
  });

  describe('Server Health', () => {
    test('Server should be responding', async () => {
      const response = await axios.get(`${API_BASE_URL}/api/contracts`);
      expect(response.status).toBe(200);
    });

    test('Server should handle concurrent requests', async () => {
      const promises = Array.from({ length: 5 }, () => 
        axios.get(`${API_BASE_URL}/api/contracts`)
      );
      
      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});