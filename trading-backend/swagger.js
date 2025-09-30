const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SuperCharts Trading Backend API',
      version: '1.0.0',
      description: 'API documentation for SuperCharts Trading Backend - Contract management and account operations',
      contact: {
        name: 'SuperCharts Team',
        email: 'support@supercharts.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:8025',
        description: 'Development server'
      }
    ],
    components: {
      schemas: {
        Contract: {
          type: 'object',
          properties: {
            product_id: { type: 'string', example: 'F.US.MNQ' },
            product_name: { type: 'string', example: '/MNQ' },
            contract_id: { type: 'string', example: 'CON.F.US.MNQ.U25' },
            contract_name: { type: 'string', example: 'MNQU25' },
            symbol: { type: 'string', example: 'MNQ' },
            name: { type: 'string', example: 'Micro Nasdaq' },
            description: { type: 'string', example: 'Micro Nasdaq' },
            exchange: { type: 'string', example: '/MNQ' },
            category: { type: 'string', example: 'Futures' },
            tick_value: { type: 'number', example: 0.5 },
            tick_size: { type: 'number', example: 0.25 },
            point_value: { type: 'number', example: 2 },
            decimal_places: { type: 'integer', example: 2 },
            price_scale: { type: 'number', example: 100 },
            min_move: { type: 'number', example: 25 },
            min_move2: { type: 'number', example: 0 },
            fractional_price: { type: 'boolean', example: false },
            exchange_fee: { type: 'number', example: 0.35 },
            regulatory_fee: { type: 'number', example: 0.02 },
            commission_fee: { type: 'number', example: 0 },
            total_fees: { type: 'number', example: 0.37 },
            disabled: { type: 'boolean', example: false },
            is_professional: { type: 'boolean', example: false },
            provider: { type: 'string', example: 'topstep' },
            last_updated: { type: 'string', format: 'date-time' }
          }
        },
        ContractLookupResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            product_id: { type: 'string', example: 'F.US.MNQ' },
            matched_field: { type: 'string', example: 'symbol' },
            matched_value: { type: 'string', example: 'MNQ' },
            contract_info: { $ref: '#/components/schemas/Contract' }
          }
        },
        AccountData: {
          type: 'object',
          properties: {
            lastUpdated: { type: 'string', format: 'date-time' },
            provider: { type: 'string', example: 'thefuturesdesk' },
            username: { type: 'string', example: 'user@example.com' },
            totalCount: { type: 'integer', example: 4 },
            accounts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'TFDXAP_508PA89' },
                  id: { type: 'integer', example: 103075 },
                  canTrade: { type: 'boolean', example: true },
                  balance: { type: 'number', example: 12.2 },
                  isVisible: { type: 'boolean', example: true }
                }
              }
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Error message description' }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' }
          }
        }
      }
    }
  },
  apis: ['./simple-backend.js'], // paths to files containing OpenAPI definitions
};

const specs = swaggerJsdoc(options);

module.exports = {
  swaggerUi,
  specs
};