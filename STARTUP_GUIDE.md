# 🚀 Trading System Startup Guide

This guide explains how to start your futuristic trading system with automated port cleanup and comprehensive service management.

## 📁 Startup Scripts Overview

The trading system includes multiple startup scripts for different platforms and use cases:

```
SuperCharts/
├── start-trading-system.sh      # 🌟 MAIN: Start complete system (Unix/macOS)
├── start-trading-system.bat     # 🌟 MAIN: Start complete system (Windows)
├── scripts/
│   └── make-executable.sh       # Make all scripts executable (Unix/macOS)
├── react-trading-app/
│   └── scripts/
│       ├── start-dev.sh         # React frontend only (Unix/macOS)
│       └── start-dev.bat        # React frontend only (Windows)
└── trading-backend/
    └── scripts/
        ├── start-backend.sh     # Backend only (Unix/macOS)
        └── start-backend.bat    # Backend only (Windows)
```

## 🎯 Quick Start

### Option 1: Complete System (Recommended)

**macOS/Linux:**
```bash
# Make scripts executable (first time only)
chmod +x start-trading-system.sh
chmod +x scripts/make-executable.sh
./scripts/make-executable.sh

# Start the complete system
./start-trading-system.sh
```

**Windows:**
```batch
# Double-click or run from command prompt
start-trading-system.bat
```

### Option 2: Frontend Only

**macOS/Linux:**
```bash
cd react-trading-app
chmod +x scripts/start-dev.sh
./scripts/start-dev.sh
```

**Windows:**
```batch
cd react-trading-app
scripts\start-dev.bat
```

### Option 3: Backend Only

**macOS/Linux:**
```bash
cd trading-backend
chmod +x scripts/start-backend.sh
./scripts/start-backend.sh
```

**Windows:**
```batch
cd trading-backend
scripts\start-backend.bat
```

## 🔧 What the Scripts Do

### 🧹 Port Cleanup
- **Automatically kills** any processes running on required ports
- **Ports cleaned**: 3000 (React), 8000 (Backend API), 5000 (SignalR)
- **Smart detection** using `lsof` (Unix) or `netstat` (Windows)
- **Graceful cleanup** with process verification

### 📋 System Checks
- **Node.js & npm** version verification
- **Project structure** validation
- **Dependencies** installation check
- **TypeScript build** status (backend)
- **Environment files** creation

### 🚀 Service Startup
- **Background execution** with PID tracking
- **Log file generation** for monitoring
- **Health checks** and status verification
- **Auto-browser opening** (optional)
- **Service monitoring** and restart capabilities

## 🌐 Service URLs

Once started, your services will be available at:

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend Dashboard** | http://localhost:3000 | Main React trading interface |
| **Backend API** | http://localhost:8000 | REST API endpoints |
| **SignalR Hub** | http://localhost:5000 | Real-time WebSocket communication |
| **API Documentation** | http://localhost:8000/docs | Interactive API docs |
| **Health Check** | http://localhost:8000/health | Service health status |

## 📊 Features by Script

### 🌟 Main System Script (`start-trading-system.sh/bat`)

**Features:**
- ✅ Comprehensive port cleanup
- ✅ ASCII art banner
- ✅ Service dependency management
- ✅ Parallel service startup
- ✅ Real-time monitoring
- ✅ Auto-browser opening
- ✅ Interactive control panel (Windows)
- ✅ Graceful shutdown handling
- ✅ Service health monitoring

**Control Panel (Windows Only):**
```
═══ Trading System Control Panel ═══
1. Open Frontend Dashboard
2. Open Backend API Docs
3. View System Status
4. Restart Frontend
5. Restart Backend
6. Stop All Services
7. Exit Control Panel
```

### ⚛️ React Frontend Script (`start-dev.sh/bat`)

**Features:**
- ✅ React-specific port cleanup (3000)
- ✅ Node.js/npm version checks
- ✅ Dependency installation
- ✅ Hot reload configuration
- ✅ Environment variable setup
- ✅ Source map generation
- ✅ Development optimizations

**Environment Variables Set:**
```bash
PORT=3000
BROWSER=none              # Prevents auto-opening
GENERATE_SOURCEMAP=true   # Enables debugging
```

### ⚡ Backend Script (`start-backend.sh/bat`)

**Features:**
- ✅ Multi-port cleanup (8000, 5000)
- ✅ TypeScript compilation
- ✅ Environment file creation
- ✅ External service checks (Redis)
- ✅ Worker thread configuration
- ✅ Development/production modes
- ✅ Logging setup

**Auto-generated .env:**
```env
NODE_ENV=development
PORT=8000
SIGNALR_PORT=5000
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
DEBUG=trading:*
```

## 🛠️ Package.json Scripts

Both projects include additional npm scripts for development:

### React Frontend Scripts
```bash
npm run dev              # Alias for npm start
npm run start:clean      # Use startup script (Unix)
npm run start:clean:windows  # Use startup script (Windows)
npm run clean:ports      # Kill processes on port 3000
npm run build:analyze    # Build and serve for analysis
npm run lint            # ESLint with auto-fix
npm run format          # Prettier formatting
```

### Backend Scripts
```bash
npm run dev             # Development with nodemon + ts-node
npm run start:clean     # Use startup script (Unix)
npm run start:clean:windows # Use startup script (Windows)
npm run build           # TypeScript compilation
npm run build:watch     # Watch mode compilation
npm run clean:ports     # Kill processes on ports 8000, 5000
npm run test           # Jest testing
npm run test:coverage  # Coverage reports
npm run docker:build   # Docker build
npm run docker:run     # Docker run
```

## 🔍 Troubleshooting

### Port Already in Use
```bash
# Manual port cleanup (Unix/macOS)
lsof -ti:3000 | xargs kill -9    # Kill React
lsof -ti:8000 | xargs kill -9    # Kill Backend
lsof -ti:5000 | xargs kill -9    # Kill SignalR

# Manual port cleanup (Windows)
netstat -ano | findstr :3000     # Find PID
taskkill /PID <PID> /F           # Kill process
```

### Permission Denied (Unix/macOS)
```bash
# Make scripts executable
chmod +x start-trading-system.sh
chmod +x react-trading-app/scripts/start-dev.sh
chmod +x trading-backend/scripts/start-backend.sh

# Or use the helper script
chmod +x scripts/make-executable.sh
./scripts/make-executable.sh
```

### Missing Dependencies
```bash
# React frontend
cd react-trading-app
npm install

# Backend
cd trading-backend
npm install

# Global tools (optional)
npm install -g typescript ts-node nodemon
```

### TypeScript Build Errors
```bash
cd trading-backend
npm run typecheck    # Check for type errors
npm run build       # Compile TypeScript
```

### Environment Issues
- Check `.env` files are created
- Verify Node.js version (16+ required)
- Ensure proper permissions on log directories
- Validate network connectivity for external services

## 📈 Monitoring & Logs

### Log Locations
```
react-trading-app/logs/frontend.log    # React development server logs
trading-backend/logs/backend.log       # Backend service logs
trading-backend/logs/error.log         # Error-specific logs
```

### Process Monitoring
```bash
# Check running processes
ps aux | grep node
ps aux | grep react-scripts

# Monitor ports
lsof -i :3000    # React
lsof -i :8000    # Backend
lsof -i :5000    # SignalR
```

### Service Health
```bash
# Quick health checks
curl http://localhost:3000                    # React frontend
curl http://localhost:8000/health            # Backend health
curl http://localhost:8000/api/status        # API status
```

## 🎛️ Advanced Configuration

### Custom Ports
Edit the configuration variables at the top of startup scripts:
```bash
# In startup scripts
REACT_PORT=3000
BACKEND_PORT=8000
SIGNALR_PORT=5000
```

### Docker Alternative
```bash
# Build and run with Docker
cd trading-backend
npm run docker:build
npm run docker:run
```

### Production Mode
```bash
# Build for production
cd react-trading-app
npm run build

cd trading-backend
npm run build
npm start
```

## 🎉 Success Indicators

When the system starts successfully, you'll see:

```
🎉 Trading System is now running!
════════════════════════════════════════════════════════════════
🌐 Frontend Dashboard: http://localhost:3000
⚡ Backend API: http://localhost:8000
📡 SignalR Hub: http://localhost:5000
📚 API Docs: http://localhost:8000/docs
💻 Health Check: http://localhost:8000/health
════════════════════════════════════════════════════════════════
```

The browser will automatically open to `http://localhost:3000` showing your futuristic trading dashboard with the black and green cyberpunk theme.

---

**Happy Trading! 🚀💹**