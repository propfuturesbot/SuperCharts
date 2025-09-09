#!/bin/bash

# Simple Trading System Startup Script
# Compatible with older bash versions and various Unix systems

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REACT_PORT=3000
BACKEND_PORT=8000

echo -e "${BLUE}🚀 Starting Trading System (Simple Mode)...${NC}"
echo "================================================"

# Function to kill process on port
kill_port() {
    local port=$1
    local service_name=$2
    
    echo -e "${YELLOW}🔍 Checking port ${port}...${NC}"
    
    if command -v lsof >/dev/null 2>&1; then
        local pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$pids" ]; then
            echo -e "${RED}❌ Killing processes on port ${port}${NC}"
            echo $pids | xargs kill -9 2>/dev/null || true
            sleep 1
            echo -e "${GREEN}✅ Port ${port} cleared${NC}"
        else
            echo -e "${GREEN}✅ Port ${port} is free${NC}"
        fi
    fi
}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Stopping services...${NC}"
    kill_port $REACT_PORT "React"
    kill_port $BACKEND_PORT "Backend"
    echo -e "${GREEN}✅ Cleanup complete${NC}"
    exit 0
}

# Set up signal handler
trap cleanup SIGINT SIGTERM

# Clean up ports
echo -e "${BLUE}🧹 Cleaning up ports...${NC}"
kill_port $REACT_PORT "React Frontend"
kill_port $BACKEND_PORT "Backend API"

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node --version) detected${NC}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REACT_DIR="$SCRIPT_DIR/react-trading-app"
BACKEND_DIR="$SCRIPT_DIR/trading-backend"

# Check directories
if [ ! -d "$REACT_DIR" ]; then
    echo -e "${RED}❌ React directory not found: $REACT_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found React directory${NC}"

# Create logs directories
mkdir -p "$REACT_DIR/logs"
[ -d "$BACKEND_DIR" ] && mkdir -p "$BACKEND_DIR/logs"

# Install React dependencies
echo -e "${BLUE}📦 Checking React dependencies...${NC}"
cd "$REACT_DIR"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Start React frontend
echo -e "${BLUE}🚀 Starting React frontend...${NC}"
export PORT=$REACT_PORT
export BROWSER=none

# Start in background and capture PID
npm start > logs/frontend.log 2>&1 &
REACT_PID=$!
echo $REACT_PID > logs/frontend.pid

echo -e "${GREEN}✅ React started (PID: $REACT_PID)${NC}"

# Wait and check if React is running
sleep 5
if kill -0 $REACT_PID 2>/dev/null; then
    echo -e "${GREEN}✅ React is running successfully${NC}"
else
    echo -e "${RED}❌ React failed to start${NC}"
    exit 1
fi

# Start backend if available
if [ -d "$BACKEND_DIR" ]; then
    echo -e "${BLUE}🚀 Starting backend...${NC}"
    cd "$BACKEND_DIR"
    
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing backend dependencies...${NC}"
        npm install
    fi
    
    # Build if needed
    if [ ! -d "dist" ] && [ -f "tsconfig.json" ]; then
        echo -e "${YELLOW}Building TypeScript...${NC}"
        npx tsc || true
    fi
    
    # Start backend
    if [ -f "dist/app.js" ]; then
        node dist/app.js > logs/backend.log 2>&1 &
    elif [ -f "src/app.ts" ]; then
        npx ts-node src/app.ts > logs/backend.log 2>&1 &
    else
        npm start > logs/backend.log 2>&1 &
    fi
    
    BACKEND_PID=$!
    echo $BACKEND_PID > logs/backend.pid
    echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"
    
    cd "$SCRIPT_DIR"
fi

# Display URLs
echo ""
echo "================================================"
echo -e "${GREEN}🎉 Trading System is running!${NC}"
echo "================================================"
echo -e "${BLUE}🌐 Frontend: http://localhost:$REACT_PORT${NC}"
[ ! -z "$BACKEND_PID" ] && echo -e "${BLUE}⚡ Backend: http://localhost:$BACKEND_PORT${NC}"
echo "================================================"
echo -e "${YELLOW}📝 Logs:${NC}"
echo -e "${BLUE}   Frontend: $REACT_DIR/logs/frontend.log${NC}"
[ ! -z "$BACKEND_PID" ] && echo -e "${BLUE}   Backend: $BACKEND_DIR/logs/backend.log${NC}"
echo "================================================"
echo -e "${RED}🛑 Press Ctrl+C to stop${NC}"
echo "================================================"

# Open browser (optional)
if command -v open >/dev/null 2>&1; then
    # macOS
    sleep 3
    open "http://localhost:$REACT_PORT" 2>/dev/null &
elif command -v xdg-open >/dev/null 2>&1; then
    # Linux
    sleep 3
    xdg-open "http://localhost:$REACT_PORT" 2>/dev/null &
fi

# Monitor services
while true; do
    sleep 10
    
    # Check React
    if [ ! -z "$REACT_PID" ] && ! kill -0 $REACT_PID 2>/dev/null; then
        echo -e "${RED}❌ React frontend has stopped${NC}"
        break
    fi
    
    # Check Backend
    if [ ! -z "$BACKEND_PID" ] && ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Backend has stopped${NC}"
    fi
done

# Cleanup on exit
cleanup