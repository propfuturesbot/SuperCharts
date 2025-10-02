#!/bin/bash

# React Trading Dashboard - Development Startup Script
# This script cleans up ports and starts the React development server

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REACT_PORT=3000
BACKEND_PORT=8026

echo -e "${BLUE}🚀 Starting React Trading Dashboard...${NC}"
echo -e "${BLUE}======================================${NC}"

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
echo -e "${BLUE}🧹 Cleaning up ports...${NC}"
kill_port $REACT_PORT "React Dev Server"
kill_port $BACKEND_PORT "Backend API Server"

# Wait a moment for cleanup
sleep 1

# Check if ports are now available
echo -e "${BLUE}🔍 Verifying ports are available...${NC}"
if check_port_available $REACT_PORT; then
    echo -e "${GREEN}✅ Port ${REACT_PORT} is available for React${NC}"
else
    echo -e "${RED}❌ Port ${REACT_PORT} is still in use${NC}"
    echo -e "${YELLOW}💡 You may need to manually kill the process or use a different port${NC}"
fi

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
    echo -e "${YELLOW}💡 Make sure you're in the react-trading-app directory${NC}"
    exit 1
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

# Set environment variables
export PORT=$REACT_PORT
export BROWSER=none  # Don't auto-open browser
export GENERATE_SOURCEMAP=true

echo -e "${BLUE}🌐 Environment Configuration:${NC}"
echo -e "   Port: ${REACT_PORT}"
echo -e "   Auto-browser: disabled"
echo -e "   Source maps: enabled"

# Start the development server
echo -e "${BLUE}🚀 Starting React development server...${NC}"
echo -e "${BLUE}======================================${NC}"
echo -e "${GREEN}🌐 Dashboard will be available at: http://localhost:${REACT_PORT}${NC}"
echo -e "${GREEN}📱 Mobile access: http://[your-ip]:${REACT_PORT}${NC}"
echo -e "${YELLOW}⚡ Hot reload is enabled - changes will auto-refresh${NC}"
echo -e "${YELLOW}🛑 Press Ctrl+C to stop the server${NC}"
echo -e "${BLUE}======================================${NC}"

# Start the server
npm start

# If we get here, the server has stopped
echo -e "${YELLOW}🛑 React development server stopped${NC}"
echo -e "${BLUE}👋 Thanks for using the Trading Dashboard!${NC}"