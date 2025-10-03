# SuperCharts Trading System

## Development Guidelines for Claude

### API Documentation Requirements

**IMPORTANT**: Whenever you create or modify any API endpoint, you MUST include it in the Swagger documentation.

#### Steps for API Documentation:

1. **Add JSDoc Comments**: For every new API endpoint, add comprehensive JSDoc comments with Swagger annotations:
   ```javascript
   /**
    * @swagger
    * /api/endpoint:
    *   get:
    *     summary: Brief description of what this endpoint does
    *     description: Detailed description
    *     tags: [Category]
    *     parameters:
    *       - in: path/query/body
    *         name: parameterName
    *         required: true/false
    *         schema:
    *           type: string/number/object
    *         description: Parameter description
    *     responses:
    *       200:
    *         description: Success response
    *         content:
    *           application/json:
    *             schema:
    *               $ref: '#/components/schemas/SchemaName'
    *       400:
    *         description: Error response
    */
   ```

2. **Update Swagger Schemas**: If creating new data structures, add them to the `swagger.js` file under `components.schemas`.

3. **Test Documentation**: After adding endpoints, verify they appear correctly at `http://localhost:9025/api/docs`.

#### Current API Documentation

The Swagger documentation is available at: **http://localhost:9025/api/docs**

Access via the documentation icon (📖) in the top-right header of the application.

#### Current API Endpoints:

**Contracts:**
- `GET /api/contracts` - Get all cached contracts
- `GET /api/contracts/lookup/{contractName}` - Lookup contract by name to get product_id
- `GET /api/contracts/lookup-id/{contractName}` - Lookup contract by name to get contract_id
- `POST /api/contracts/lookup` - Bulk lookup multiple contracts

**Accounts:**
- `GET /api/accounts/file` - Load accounts from cached file
- `POST /api/accounts/file` - Save accounts to cached file
- `DELETE /api/accounts/file` - Delete accounts file

**Trading:** *(Backend acts as adapter to frontend OrderManager)*
- `POST /api/orders/place` - **UNIFIED ORDER ENDPOINT** - Place any order type (MARKET, LIMIT, STOP_LOSS, TRAILING_STOP, BRACKET)
- `DELETE /api/positions/close` - Close all positions for a symbol
- `DELETE /api/positions/flatten` - Flatten all positions for account
- `POST /api/positions/reverse` - Reverse an existing position

**Trading (Legacy - Deprecated):** *(Use /api/orders/place instead)*
- ~~`POST /api/orders/market`~~ - Use `/api/orders/place` with `orderType: "MARKET"`
- ~~`POST /api/orders/limit`~~ - Use `/api/orders/place` with `orderType: "LIMIT"`
- ~~`POST /api/orders/trailing-stop`~~ - Use `/api/orders/place` with `orderType: "TRAILING_STOP"`
- ~~`POST /api/orders/stop`~~ - Use `/api/orders/place` with `orderType: "STOP_LOSS"`
- ~~`POST /api/orders/bracket`~~ - Use `/api/orders/place` with `orderType: "BRACKET"`

**Webhook & Tunnel Management:** *(NEW - Cloudflare Tunnel Integration)*
- `GET /api/check-cloudflared` - Check if cloudflared is installed
- `POST /api/start-tunnel` - Start cloudflared tunnel and get public URL
- `POST /api/stop-tunnel` - Stop the running tunnel
- `POST /api/kill-cloudflared` - Force kill all cloudflared processes
- `GET /api/get-webhook-url` - Retrieve saved webhook URL from config
- `POST /api/save-webhook-url` - Manually save webhook URL to config

**Webhook Trading Endpoints:** *(TradingView Webhook Integration)*
- `POST /webhook/order` - **UNIFIED WEBHOOK ENDPOINT** - Execute any order type from webhook (MARKET, LIMIT, STOP_LOSS, TRAILING_STOP, BRACKET)
- `POST /webhook/close` - Close position from webhook
- `POST /webhook/reverse` - Reverse position from webhook
- `POST /webhook/flatten` - Flatten all positions from webhook

**System:**
- `GET /api/health` - Health check endpoint

### Development Standards

1. **Always document new APIs** - No exceptions
2. **Use consistent response formats** - All responses should have `success` boolean field
3. **Include proper error handling** - Return appropriate HTTP status codes
4. **Test all endpoints** - Verify they work before committing
5. **Update this file** - Add any new development guidelines here

### File Structure

```
trading-backend/
├── simple-backend.js      # Main backend server with API endpoints
├── swagger.js            # Swagger configuration and schemas
├── package.json          # Dependencies including swagger-ui-express
├── tradableContracts.json # Cached contracts data
└── tradableAccounts.json  # Cached accounts data
```

### Testing APIs

Use the Swagger UI for testing, or curl commands:
```bash
# Test health endpoint
curl http://localhost:9025/api/health

# Test contract lookup
curl http://localhost:9025/api/contracts/lookup/MNQ

# View all contracts
curl http://localhost:9025/api/contracts
```

### Order Manager Integration

**Backend Trading APIs** - Backend acts as adapter to frontend OrderManager:
- All trading operations available as REST endpoints
- **Single source of truth**: Backend uses frontend OrderManager logic (no duplication)
- Centralized authentication via saved session (no tokens in request body)
- Proper error handling and parameter validation
- Full Swagger documentation with examples

**Shared Backend Services:**
- Contract lookup for symbol resolution and tick size conversion
- Account file operations for caching account data
- Points-to-ticks conversion using contract `tick_size` field

**Example Trading API Usage (Unified Endpoint):**
```bash
# Place a market order (NEW UNIFIED ENDPOINT)
curl -X POST http://localhost:9025/api/orders/place \
  -H "Content-Type: application/json" \
  -d '{
    "orderType": "MARKET",
    "accountName": "TFDXAP_508PA89",
    "symbol": "MNQ",
    "action": "BUY",
    "quantity": 1
  }'

# Place a limit order
curl -X POST http://localhost:9025/api/orders/place \
  -H "Content-Type: application/json" \
  -d '{
    "orderType": "LIMIT",
    "accountName": "TFDXAP_508PA89",
    "symbol": "MNQ",
    "action": "BUY",
    "quantity": 1,
    "limitPrice": 18000
  }'

# Place a stop loss order
curl -X POST http://localhost:9025/api/orders/place \
  -H "Content-Type: application/json" \
  -d '{
    "orderType": "STOP_LOSS",
    "accountName": "TFDXAP_508PA89",
    "symbol": "MNQ",
    "action": "BUY",
    "quantity": 1,
    "stopLossPoints": 15
  }'

# Place a trailing stop order
curl -X POST http://localhost:9025/api/orders/place \
  -H "Content-Type: application/json" \
  -d '{
    "orderType": "TRAILING_STOP",
    "accountName": "TFDXAP_508PA89",
    "symbol": "MNQ",
    "action": "BUY",
    "quantity": 1,
    "trailDistancePoints": 10
  }'

# Place a bracket order
curl -X POST http://localhost:9025/api/orders/place \
  -H "Content-Type: application/json" \
  -d '{
    "orderType": "BRACKET",
    "accountName": "TFDXAP_508PA89",
    "symbol": "MNQ",
    "action": "BUY",
    "quantity": 1,
    "stopLossPoints": 15,
    "takeProfitPoints": 20
  }'

# Close specific position
curl -X DELETE http://localhost:9025/api/positions/close \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "TFDXAP_508PA89",
    "symbol": "MNQ"
  }'

# Flatten all positions
curl -X DELETE http://localhost:9025/api/positions/flatten \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "TFDXAP_508PA89"
  }'

# Reverse position
curl -X POST http://localhost:9025/api/positions/reverse \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "TFDXAP_508PA89",
    "symbol": "MNQ"
  }'
```

**Note:** Authentication is handled automatically using saved credentials. No need to provide `provider` or `token` in request body.

---

## Webhook Generator & TradingView Integration

### Overview

The webhook generator feature allows you to:
1. Create secure Cloudflare tunnels for external webhook access
2. Generate webhook URLs and JSON payloads for TradingView alerts
3. Execute trades automatically from TradingView signals

### Access

Navigate to: **http://localhost:4001/webhook-generator**

### Prerequisites

**Important**: The React development server needs to be configured to allow Cloudflare tunnel hosts. This is already configured in `.env.development`:

```env
DANGEROUSLY_DISABLE_HOST_CHECK=true
WDS_SOCKET_HOST=0.0.0.0
```

**You must restart the React dev server** after generating a tunnel for the first time or after any .env changes:
```bash
cd react-trading-app
npm start
```

### Setup Process

#### Step 1: Start Cloudflare Tunnel

1. Click "Start Tunnel" button in the Dashboard Tunnel card
2. Wait for tunnel URL to be generated (takes ~10-30 seconds)
3. The tunnel URL will be displayed (format: `https://*.trycloudflare.com`)
4. Tunnel persists until system restart or manual stop

**Important Notes:**
- Cloudflared must be installed on your system
- Tunnel URL changes after each restart
- Tunnel provides secure HTTPS access to your **entire trading dashboard**
- The tunnel forwards to the React frontend (port 4001)
- React app proxies API calls to backend (port 9025)
- You can access the full application via the tunnel URL

#### Step 2: Configure Trading Parameters

In the Webhook Builder card:

1. **Order Type**: Select from Market, Limit, Stop Loss, Trailing Stop, Bracket, etc.
2. **Account Name**: Choose from your active accounts (dynamically loaded)
3. **Symbol**: Use `{{ticker}}` for dynamic symbol from TradingView
4. **Action**: Buy or Sell
5. **Quantity**: Number of contracts
6. **Advanced Options**:
   - Close Existing Orders
   - Enable Break-Even Stop

#### Step 3: Generate Webhook Configuration

1. Click "Generate Payload" button
2. Two items are generated:
   - **Webhook URL**: Copy this to TradingView alert webhook URL field
   - **JSON Payload**: Copy this to TradingView alert message field

#### Step 4: Configure TradingView Alert

1. Create an alert in TradingView
2. In alert settings:
   - Set "Webhook URL" to the generated webhook URL
   - Set "Message" to the generated JSON payload
3. Save the alert

### Webhook Endpoints

All webhook endpoints require authentication via stored token in `authToken.json`.

#### Unified Order Endpoint

**Market Order:**
```bash
POST https://your-tunnel.trycloudflare.com/webhook/order
{
  "orderType": "MARKET",
  "accountName": "TFDXAP_508PA89",
  "symbol": "MNQ",
  "action": "BUY",
  "quantity": 1
}
```

**Limit Order:**
```bash
POST https://your-tunnel.trycloudflare.com/webhook/order
{
  "orderType": "LIMIT",
  "accountName": "TFDXAP_508PA89",
  "symbol": "MNQ",
  "action": "BUY",
  "quantity": 1,
  "limitPrice": 21160
}
```

**Stop Loss Order:**
```bash
POST https://your-tunnel.trycloudflare.com/webhook/order
{
  "orderType": "STOP_LOSS",
  "accountName": "TFDXAP_508PA89",
  "symbol": "MNQ",
  "action": "BUY",
  "quantity": 1,
  "stopLossPoints": 20
}
```

**Trailing Stop Order:**
```bash
POST https://your-tunnel.trycloudflare.com/webhook/order
{
  "orderType": "TRAILING_STOP",
  "accountName": "TFDXAP_508PA89",
  "symbol": "MNQ",
  "action": "BUY",
  "quantity": 1,
  "trailDistancePoints": 10
}
```

**Bracket Order:**
```bash
POST https://your-tunnel.trycloudflare.com/webhook/order
{
  "orderType": "BRACKET",
  "accountName": "TFDXAP_508PA89",
  "symbol": "MNQ",
  "action": "BUY",
  "quantity": 1,
  "stopLossPoints": 20,
  "takeProfitPoints": 40
}
```

#### Position Management Endpoints

**Close Position:**
```bash
POST https://your-tunnel.trycloudflare.com/webhook/close
{
  "accountName": "TFDXAP_508PA89",
  "symbol": "MNQ"
}
```

**Reverse Position:**
```bash
POST https://your-tunnel.trycloudflare.com/webhook/reverse
{
  "accountName": "TFDXAP_508PA89",
  "symbol": "MNQ"
}
```

**Flatten All Positions:**
```bash
POST https://your-tunnel.trycloudflare.com/webhook/flatten
{
  "accountName": "TFDXAP_508PA89"
}
```

### Troubleshooting

**Tunnel won't start:**
- Verify cloudflared is installed: Run `cloudflared --version` in terminal
- Install cloudflared: `brew install cloudflared` (macOS) or download from Cloudflare
- Use "Kill Switch" button to stop all cloudflared processes and try again

**Webhook returns authentication error:**
- Ensure you're logged in to the application
- Check that `authToken.json` exists in `trading-backend/` directory
- Re-authenticate through the application login

**Order not executing:**
- Verify account name matches exactly (case-sensitive)
- Check symbol format (e.g., "MNQ" not "/MNQ")
- Ensure account has sufficient buying power
- Review backend logs in `trading-backend/logs/backend.log`

### Security Considerations

- Tunnel URLs are publicly accessible but time-limited
- Authentication token required for all webhook requests
- Regenerate tunnel after system restart
- Monitor webhook activity in backend logs
- Use "Stop Tunnel" or "Kill Switch" when not actively trading

### Configuration Files

**Webhook Config:** `trading-backend/config/webhook_config.json`
```json
{
  "url": "https://example.trycloudflare.com",
  "timestamp": "2025-09-29T12:00:00.000Z",
  "active": true,
  "port": "9025"
}
```

**Auth Token:** `trading-backend/authToken.json`
```json
{
  "provider": "thefuturesdesk",
  "token": "Bearer token...",
  "username": "user@example.com",
  "expiresAt": 1672531200000,
  "savedAt": 1672444800000
}
```

---

**Remember**: Documentation is not optional - it's a requirement for maintainable code!