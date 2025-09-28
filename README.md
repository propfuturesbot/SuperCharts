# Webhook Trading Bot

A streamlined webhook-based trading bot with a modern React UI, authentication system, and contract management. This system is designed for automated trading through webhook integrations without the complexity of charting or strategy backtesting.

## Features

- **Webhook Integration**: Receive and process trading signals via webhooks
- **Contract Management**: Load and manage tradable contracts from multiple providers
- **Authentication System**: Secure login and session management
- **Modern UI**: Clean, responsive React interface
- **Provider Support**: Currently supports TopStep with extensible architecture
- **Real-time Status**: Monitor bot status and activity

## Architecture

The system consists of two main components:

1. **React Frontend** (`react-trading-app/`): Modern web interface for bot management
2. **Backend API** (`trading-backend/`): Node.js backend for webhook processing and contract management

## Quick Start

1. **Start the System**
   ```bash
   ./start-trading-system.sh
   ```

2. **Access the Application**
   - Frontend Dashboard: http://localhost:3000
   - Backend API: http://localhost:8025
   - Health Check: http://localhost:8025/api/health

## API Endpoints

### Contracts
- `GET /api/contracts` - Get all cached contracts
- `GET /api/contracts/lookup/:contractName` - Lookup contract by name
- `POST /api/contracts/lookup` - Bulk contract lookup

### System
- `GET /api/health` - System health check

## Configuration

### Provider Configuration
Edit `trading-backend/simple-backend.js` to configure your data provider:

```javascript
const PROVIDER_CONFIG = {
  topstep: {
    token: 'your-api-token',
    apiUrl: 'https://userapi.topstepx.com/UserContract/active/nonprofesional'
  }
  // Add other providers here
};
```

### Environment
- Frontend runs on port 3000
- Backend runs on port 8025
- No database required - uses file-based contract caching

## Development

### Frontend Development
```bash
cd react-trading-app
npm install
npm start
```

### Backend Development
```bash
cd trading-backend
npm install
npm start
```

## File Structure

```
webhook-trading-bot/
├── react-trading-app/          # React frontend
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── contexts/          # React contexts (Auth, Theme)
│   │   └── services/          # API services
│   └── package.json
├── trading-backend/            # Node.js backend
│   ├── simple-backend.js      # Main server file
│   ├── tradableContracts.json # Cached contracts
│   └── package.json
├── start-trading-system.sh     # Startup script
└── README.md
```

## Usage

1. **Login**: Use the authentication system to log in
2. **Dashboard**: Monitor webhook bot status and system health
3. **Contracts**: View and manage loaded trading contracts
4. **Webhooks**: Configure webhook endpoints for trading signals

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.