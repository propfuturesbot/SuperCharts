#!/bin/bash

# Trading Backend - Development Startup Script
# This script cleans up ports and starts the Node.js backend server

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
BACKEND_PORT=8000
REDIS_PORT=6379
POSTGRES_PORT=5432
SIGNALR_PORT=5000

echo -e "${PURPLE}⚡ Starting Trading Backend System...${NC}"
echo -e "${PURPLE}=====================================${NC}"

# Function to kill process on port
kill_port() {
    local port=$1
    local service_name=$2
    
    echo -e "${YELLOW}🔍 Checking for processes on port ${port}...${NC}"
    
    if command -v lsof >/dev/null 2>&1; then
        # Using lsof (macOS/Linux)
        local pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$pids" ]; then
            echo -e "${RED}❌ Found ${service_name} running on port ${port}${NC}"
            echo -e "${YELLOW}🔄 Killing processes: ${pids}${NC}"
            echo $pids | xargs kill -9 2>/dev/null || true
            sleep 2
            
            # Verify process is killed
            local remaining=$(lsof -ti:$port 2>/dev/null || true)
            if [ -z "$remaining" ]; then
                echo -e "${GREEN}✅ Successfully cleared port ${port}${NC}"
            else
                echo -e "${RED}⚠️  Warning: Some processes may still be running on port ${port}${NC}"
            fi
        else
            echo -e "${GREEN}✅ Port ${port} is already free${NC}"
        fi
    elif command -v netstat >/dev/null 2>&1; then
        # Using netstat (Windows/Linux fallback)
        local pid=$(netstat -ano | grep ":$port" | awk '{print $5}' | head -1)
        if [ ! -z "$pid" ] && [ "$pid" != "0" ]; then
            echo -e "${RED}❌ Found ${service_name} running on port ${port} (PID: ${pid})${NC}"
            kill -9 $pid 2>/dev/null || true
            sleep 2
            echo -e "${GREEN}✅ Successfully cleared port ${port}${NC}"
        else
            echo -e "${GREEN}✅ Port ${port} is already free${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Cannot detect port usage (lsof/netstat not available)${NC}"
    fi
}

# Function to check if port is available
check_port_available() {
    local port=$1
    if command -v nc >/dev/null 2>&1; then
        if ! nc -z localhost $port 2>/dev/null; then
            return 0  # Port is available
        else
            return 1  # Port is in use
        fi
    else
        # Fallback: assume port is available after cleanup
        return 0
    fi
}

# Clean up ports
echo -e "${BLUE}🧹 Cleaning up backend ports...${NC}"
kill_port $BACKEND_PORT "Backend API Server"
kill_port $SIGNALR_PORT "SignalR Hub Server"

# Optional: Clean up database ports (commented out as they might be external services)
# kill_port $REDIS_PORT "Redis Server"
# kill_port $POSTGRES_PORT "PostgreSQL Server"

# Wait a moment for cleanup
sleep 2

# Check Node.js and npm
echo -e "${BLUE}🔍 Checking dependencies...${NC}"
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo -e "${YELLOW}💡 Please install Node.js from https://nodejs.org/${NC}"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}❌ npm is not installed${NC}"
    echo -e "${YELLOW}💡 npm should come with Node.js installation${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node --version) detected${NC}"
echo -e "${GREEN}✅ npm $(npm --version) detected${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json not found${NC}"
    echo -e "${YELLOW}💡 Make sure you're in the trading-backend directory${NC}"
    exit 1
fi

# Check TypeScript
if ! command -v tsc >/dev/null 2>&1 && ! npx tsc --version >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  TypeScript not found globally, will use npx${NC}"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 node_modules not found, installing dependencies...${NC}"
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Dependencies installed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Check for environment file
if [ ! -f ".env" ] && [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  No .env file found, creating default...${NC}"
    cat > .env << EOF
# Backend Configuration
NODE_ENV=development
PORT=$BACKEND_PORT
SIGNALR_PORT=$SIGNALR_PORT

# Database Configuration
REDIS_URL=redis://localhost:$REDIS_PORT
POSTGRES_URL=postgresql://localhost:$POSTGRES_PORT/trading

# Provider Configuration
DEFAULT_PROVIDER=topstepx

# Security
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# Logging
LOG_LEVEL=debug
LOG_FILE=logs/backend.log

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Performance
WORKER_THREADS=4
BUFFER_SIZE=1000
CACHE_TTL=300

# Development
DEBUG=trading:*
ENABLE_CORS=true
EOF
    echo -e "${GREEN}✅ Created default .env file${NC}"
    echo -e "${YELLOW}💡 Please review and customize the .env file for your setup${NC}"
fi

# Check for required directories
if [ ! -d "logs" ]; then
    mkdir -p logs
    echo -e "${GREEN}✅ Created logs directory${NC}"
fi

if [ ! -d "src" ]; then
    echo -e "${RED}❌ src directory not found${NC}"
    echo -e "${YELLOW}💡 This doesn't appear to be a valid backend project${NC}"
    exit 1
fi

# Build TypeScript if dist doesn't exist or src is newer
if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
    echo -e "${BLUE}🔨 Building TypeScript project...${NC}"
    if command -v tsc >/dev/null 2>&1; then
        tsc
    else
        npx tsc
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ TypeScript build successful${NC}"
    else
        echo -e "${RED}❌ TypeScript build failed${NC}"
        echo -e "${YELLOW}💡 Check your TypeScript configuration and syntax${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ TypeScript build is up to date${NC}"
fi

# Check external dependencies
echo -e "${BLUE}🔍 Checking external services...${NC}"

# Check Redis (optional)
if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli ping >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Redis is running${NC}"
    else
        echo -e "${YELLOW}⚠️  Redis is not running (optional for caching)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Redis CLI not found (optional for caching)${NC}"
fi

# Set environment variables
export NODE_ENV=development
export PORT=$BACKEND_PORT
export DEBUG=trading:*

echo -e "${BLUE}🌐 Environment Configuration:${NC}"
echo -e "   Node Environment: development"
echo -e "   Backend Port: $BACKEND_PORT"
echo -e "   SignalR Port: $SIGNALR_PORT"
echo -e "   Debug Mode: enabled"

# Start the backend server
echo -e "${PURPLE}⚡ Starting Trading Backend Server...${NC}"
echo -e "${PURPLE}=====================================${NC}"
echo -e "${GREEN}🌐 Backend API will be available at: http://localhost:$BACKEND_PORT${NC}"
echo -e "${GREEN}📡 SignalR Hub will be available at: http://localhost:$SIGNALR_PORT${NC}"
echo -e "${GREEN}📊 API Documentation: http://localhost:$BACKEND_PORT/docs${NC}"
echo -e "${GREEN}💻 Health Check: http://localhost:$BACKEND_PORT/health${NC}"
echo -e "${YELLOW}⚡ Hot reload is enabled - changes will restart the server${NC}"
echo -e "${YELLOW}🛑 Press Ctrl+C to stop the server${NC}"
echo -e "${PURPLE}=====================================${NC}"

# Choose the appropriate start command
if [ -f "dist/app.js" ]; then
    # Production-like start with built files
    if command -v nodemon >/dev/null 2>&1; then
        echo -e "${BLUE}🔄 Starting with nodemon (auto-restart enabled)...${NC}"
        nodemon dist/app.js
    else
        echo -e "${BLUE}🚀 Starting with Node.js...${NC}"
        node dist/app.js
    fi
elif [ -f "src/app.ts" ]; then
    # Development start with ts-node
    if command -v ts-node >/dev/null 2>&1; then
        echo -e "${BLUE}🔄 Starting with ts-node...${NC}"
        if command -v nodemon >/dev/null 2>&1; then
            nodemon --exec ts-node src/app.ts
        else
            ts-node src/app.ts
        fi
    else
        echo -e "${RED}❌ ts-node not found${NC}"
        echo -e "${YELLOW}💡 Install ts-node: npm install -g ts-node${NC}"
        exit 1
    fi
else
    # Fallback to npm scripts
    echo -e "${BLUE}🚀 Starting with npm script...${NC}"
    npm run dev || npm start
fi

# If we get here, the server has stopped
echo -e "${YELLOW}🛑 Trading Backend server stopped${NC}"
echo -e "${PURPLE}👋 Thanks for using the Trading Backend System!${NC}"