#!/bin/bash

# Trading System Master Startup Script
# This script starts both the React frontend and Node.js backend with proper process management

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REACT_PORT=3000
BACKEND_PORT=8000
SIGNALR_PORT=5000

# Application identifiers for safe process killing
APP_NAME="trading-system"
BACKEND_IDENTIFIER="simple-backend.js"
FRONTEND_IDENTIFIER="react-scripts"

# ASCII Art Banner
echo -e "${CYAN}"
cat << "EOF"
╔════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                                ║
║  ████████╗██████╗  █████╗ ██████╗ ██╗███╗   ██╗ ██████╗     ███████╗██╗   ██╗███████╗████████╗║
║  ╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║██╔════╝     ██╔════╝╚██╗ ██╔╝██╔════╝╚══██╔══╝║
║     ██║   ██████╔╝███████║██║  ██║██║██╔██╗ ██║██║  ███╗    ███████╗ ╚████╔╝ ███████╗   ██║   ║
║     ██║   ██╔══██╗██╔══██║██║  ██║██║██║╚██╗██║██║   ██║    ╚════██║  ╚██╔╝  ╚════██║   ██║   ║
║     ██║   ██║  ██║██║  ██║██████╔╝██║██║ ╚████║╚██████╔╝    ███████║   ██║   ███████║   ██║   ║
║     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝     ╚══════╝   ╚═╝   ╚══════╝   ╚═╝   ║
║                                                                                                ║
║                              PropFutures Trading System                                ║
║                                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${PURPLE}🚀 Starting Complete Trading System...${NC}"
echo -e "${PURPLE}======================================${NC}"

# Function to safely kill our application processes only
kill_app_processes() {
    local identifier=$1
    local service_name=$2
    
    echo -e "${YELLOW}🔍 Checking for ${service_name} processes (${identifier})...${NC}"
    
    # Find processes matching our application identifier
    local pids=$(ps aux | grep "$identifier" | grep -v grep | awk '{print $2}' || true)
    
    if [ ! -z "$pids" ]; then
        echo -e "${RED}❌ Found ${service_name} processes: ${pids}${NC}"
        for pid in $pids; do
            # Double-check this is really our process
            local cmdline=$(ps -p $pid -o command= 2>/dev/null || true)
            if [[ "$cmdline" == *"$identifier"* ]]; then
                echo -e "${YELLOW}🔄 Killing ${service_name} process ${pid}: ${cmdline}${NC}"
                kill -TERM $pid 2>/dev/null || true
                sleep 2
                # Force kill if still running
                if kill -0 $pid 2>/dev/null; then
                    kill -KILL $pid 2>/dev/null || true
                    echo -e "${RED}⚠️  Force killed process ${pid}${NC}"
                else
                    echo -e "${GREEN}✅ Process ${pid} stopped gracefully${NC}"
                fi
            fi
        done
    else
        echo -e "${GREEN}✅ No ${service_name} processes found${NC}"
    fi
}

# Function to kill process on specific port (with verification)
kill_port_safely() {
    local port=$1
    local service_name=$2
    
    echo -e "${YELLOW}🔍 Checking port ${port} for ${service_name}...${NC}"
    
    if command -v lsof >/dev/null 2>&1; then
        local port_info=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$port_info" ]; then
            for pid in $port_info; do
                # Get process details to verify it's our application
                local cmdline=$(ps -p $pid -o command= 2>/dev/null || true)
                local process_name=$(ps -p $pid -o comm= 2>/dev/null || true)
                
                echo -e "${YELLOW}📋 Port ${port} used by PID ${pid}: ${process_name}${NC}"
                echo -e "${YELLOW}   Command: ${cmdline}${NC}"
                
                # Only kill if it's related to our application
                if [[ "$cmdline" == *"$BACKEND_IDENTIFIER"* ]] || [[ "$cmdline" == *"$FRONTEND_IDENTIFIER"* ]] || [[ "$cmdline" == *"trading"* ]]; then
                    echo -e "${RED}❌ Killing our application process on port ${port} (PID: ${pid})${NC}"
                    kill -TERM $pid 2>/dev/null || true
                    sleep 2
                    if kill -0 $pid 2>/dev/null; then
                        kill -KILL $pid 2>/dev/null || true
                        echo -e "${RED}⚠️  Force killed process ${pid}${NC}"
                    fi
                    echo -e "${GREEN}✅ Cleared port ${port}${NC}"
                else
                    echo -e "${YELLOW}⚠️  Port ${port} is used by unrelated process (${process_name}), skipping${NC}"
                fi
            done
        else
            echo -e "${GREEN}✅ Port ${port} is free${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  lsof not available, cannot check port ${port}${NC}"
    fi
}

# Function to verify port is actually free
verify_port_free() {
    local port=$1
    local service_name=$2
    
    if command -v nc >/dev/null 2>&1; then
        if nc -z localhost $port 2>/dev/null; then
            echo -e "${RED}❌ Port ${port} is still in use after cleanup${NC}"
            return 1
        else
            echo -e "${GREEN}✅ Port ${port} is confirmed free for ${service_name}${NC}"
            return 0
        fi
    else
        # Fallback: use lsof
        if command -v lsof >/dev/null 2>&1; then
            local port_check=$(lsof -ti:$port 2>/dev/null || true)
            if [ ! -z "$port_check" ]; then
                echo -e "${RED}❌ Port ${port} is still in use after cleanup${NC}"
                return 1
            else
                echo -e "${GREEN}✅ Port ${port} is confirmed free for ${service_name}${NC}"
                return 0
            fi
        fi
    fi
    
    # If no tools available, assume it's free
    echo -e "${YELLOW}⚠️  Cannot verify port ${port} status (no nc/lsof available)${NC}"
    return 0
}

# Function to check if directory exists
check_directory() {
    local dir=$1
    local name=$2
    
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✅ Found ${name} directory: ${dir}${NC}"
        return 0
    else
        echo -e "${RED}❌ ${name} directory not found: ${dir}${NC}"
        return 1
    fi
}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down Trading System...${NC}"
    
    # Kill our application processes
    kill_app_processes "$BACKEND_IDENTIFIER" "Backend"
    kill_app_processes "$FRONTEND_IDENTIFIER" "Frontend"
    
    # Clean up ports
    echo -e "${YELLOW}🧹 Cleaning up ports...${NC}"
    kill_port_safely $REACT_PORT "React Frontend"
    kill_port_safely $BACKEND_PORT "Backend API"
    kill_port_safely $SIGNALR_PORT "SignalR Hub"
    
    # Clean up PID files
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    REACT_DIR="$SCRIPT_DIR/react-trading-app"
    BACKEND_DIR="$SCRIPT_DIR/trading-backend"
    
    rm -f "$REACT_DIR/logs/frontend.pid" 2>/dev/null || true
    rm -f "$BACKEND_DIR/logs/backend.pid" 2>/dev/null || true
    
    echo -e "${GREEN}✅ Trading System shutdown complete${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Step 1: Clean up any existing processes
echo -e "${BLUE}🧹 Cleaning up existing processes...${NC}"
kill_app_processes "$BACKEND_IDENTIFIER" "Backend"
kill_app_processes "$FRONTEND_IDENTIFIER" "Frontend"

# Step 2: Clean up ports
echo -e "${BLUE}🧹 Cleaning up ports...${NC}"
kill_port_safely $REACT_PORT "React Frontend"
kill_port_safely $BACKEND_PORT "Backend API" 
kill_port_safely $SIGNALR_PORT "SignalR Hub"

# Step 3: Verify ports are free
echo -e "${BLUE}🔍 Verifying ports are free...${NC}"
verify_port_free $REACT_PORT "React Frontend" || exit 1
verify_port_free $BACKEND_PORT "Backend API" || exit 1
verify_port_free $SIGNALR_PORT "SignalR Hub" || exit 1

# Check system requirements
echo -e "${BLUE}🔍 Checking system requirements...${NC}"

if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo -e "${YELLOW}💡 Please install Node.js from https://nodejs.org/${NC}"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node --version) detected${NC}"
echo -e "${GREEN}✅ npm $(npm --version) detected${NC}"

# Check project directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REACT_DIR="$SCRIPT_DIR/react-trading-app"
BACKEND_DIR="$SCRIPT_DIR/trading-backend"

echo -e "${BLUE}🔍 Checking project structure...${NC}"

if ! check_directory "$REACT_DIR" "React Frontend"; then
    echo -e "${YELLOW}💡 Expected React app at: $REACT_DIR${NC}"
    exit 1
fi

if ! check_directory "$BACKEND_DIR" "Trading Backend"; then
    echo -e "${YELLOW}💡 Expected backend at: $BACKEND_DIR${NC}"
    echo -e "${YELLOW}ℹ️  Will start only React frontend${NC}"
    BACKEND_AVAILABLE=false
else
    BACKEND_AVAILABLE=true
fi

# Create logs directories
mkdir -p "$REACT_DIR/logs"
[ "$BACKEND_AVAILABLE" = true ] && mkdir -p "$BACKEND_DIR/logs"

# Install dependencies if needed
echo -e "${BLUE}📦 Checking dependencies...${NC}"

# React dependencies
echo -e "${CYAN}🔍 Checking React dependencies...${NC}"
cd "$REACT_DIR"
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo -e "${YELLOW}📦 Installing React dependencies...${NC}"
    npm install
fi
cd - >/dev/null

# Backend dependencies
if [ "$BACKEND_AVAILABLE" = true ]; then
    echo -e "${CYAN}🔍 Checking Backend dependencies...${NC}"
    cd "$BACKEND_DIR"
    if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
        echo -e "${YELLOW}📦 Installing Backend dependencies...${NC}"
        npm install
    fi
    cd - >/dev/null
fi

# Start services
echo -e "${PURPLE}🚀 Starting Trading System Services...${NC}"
echo -e "${PURPLE}======================================${NC}"

# Start Backend first (if available)
if [ "$BACKEND_AVAILABLE" = true ]; then
    echo -e "${BLUE}🚀 Starting Backend...${NC}"
    cd "$BACKEND_DIR"
    
    # Start backend in background
    nohup npm start > logs/backend.log 2>&1 &
    backend_pid=$!
    echo $backend_pid > logs/backend.pid
    
    echo -e "${GREEN}✅ Backend started (PID: ${backend_pid})${NC}"
    echo -e "${CYAN}📋 Logs: ${BACKEND_DIR}/logs/backend.log${NC}"
    
    # Wait and verify backend started
    sleep 5
    if kill -0 $backend_pid 2>/dev/null; then
        echo -e "${GREEN}✅ Backend is running successfully${NC}"
        
        # Verify backend is responding on port
        if verify_port_free $BACKEND_PORT "Backend API"; then
            echo -e "${YELLOW}⚠️  Backend started but port ${BACKEND_PORT} not in use yet, giving more time...${NC}"
            sleep 5
        fi
    else
        echo -e "${RED}❌ Backend failed to start${NC}"
        echo -e "${YELLOW}ℹ️  Check logs: ${BACKEND_DIR}/logs/backend.log${NC}"
        BACKEND_AVAILABLE=false
    fi
    
    cd - >/dev/null
fi

# Start React Frontend
echo -e "${BLUE}🚀 Starting Frontend...${NC}"
cd "$REACT_DIR"

# Start frontend in background
nohup npm start > logs/frontend.log 2>&1 &
frontend_pid=$!
echo $frontend_pid > logs/frontend.pid

echo -e "${GREEN}✅ Frontend started (PID: ${frontend_pid})${NC}"
echo -e "${CYAN}📋 Logs: ${REACT_DIR}/logs/frontend.log${NC}"

# Wait and verify frontend started
sleep 10
if kill -0 $frontend_pid 2>/dev/null; then
    echo -e "${GREEN}✅ Frontend is running successfully${NC}"
else
    echo -e "${RED}❌ Frontend failed to start${NC}"
    echo -e "${YELLOW}ℹ️  Check logs: ${REACT_DIR}/logs/frontend.log${NC}"
    cleanup
    exit 1
fi

cd - >/dev/null

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
sleep 10

# Display service information
echo -e "${PURPLE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 Trading System is now running!${NC}"
echo -e "${PURPLE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}🌐 Frontend Dashboard: http://localhost:${REACT_PORT}${NC}"

if [ "$BACKEND_AVAILABLE" = true ]; then
    echo -e "${CYAN}⚡ Backend API: http://localhost:${BACKEND_PORT}${NC}"
    echo -e "${CYAN}📡 SignalR Hub: http://localhost:${SIGNALR_PORT}${NC}"
    echo -e "${CYAN}📚 API Docs: http://localhost:${BACKEND_PORT}/docs${NC}"
    echo -e "${CYAN}💻 Health Check: http://localhost:${BACKEND_PORT}/health${NC}"
fi

echo -e "${PURPLE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}📋 Service Status:${NC}"
echo -e "${GREEN}   ✅ React Frontend (Port ${REACT_PORT})${NC}"
[ "$BACKEND_AVAILABLE" = true ] && echo -e "${GREEN}   ✅ Backend API (Port ${BACKEND_PORT})${NC}"
[ "$BACKEND_AVAILABLE" = true ] && echo -e "${GREEN}   ✅ SignalR Hub (Port ${SIGNALR_PORT})${NC}"
echo -e "${PURPLE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}📝 Log Files:${NC}"
echo -e "${CYAN}   Frontend: ${REACT_DIR}/logs/frontend.log${NC}"
[ "$BACKEND_AVAILABLE" = true ] && echo -e "${CYAN}   Backend: ${BACKEND_DIR}/logs/backend.log${NC}"
echo -e "${PURPLE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${RED}🛑 Press Ctrl+C to stop all services${NC}"
echo -e "${PURPLE}════════════════════════════════════════════════════════════════${NC}"

# Auto-open browser (optional)
if command -v python3 >/dev/null 2>&1; then
    sleep 5
    echo -e "${BLUE}🌐 Opening browser...${NC}"
    python3 -m webbrowser "http://localhost:${REACT_PORT}" 2>/dev/null || true
elif command -v python >/dev/null 2>&1; then
    sleep 5
    echo -e "${BLUE}🌐 Opening browser...${NC}"
    python -m webbrowser "http://localhost:${REACT_PORT}" 2>/dev/null || true
fi

# Keep script running and monitor services
while true; do
    sleep 30
    
    # Check if services are still running
    frontend_pid=$(cat "$REACT_DIR/logs/frontend.pid" 2>/dev/null || echo "")
    if [ ! -z "$frontend_pid" ] && ! kill -0 $frontend_pid 2>/dev/null; then
        echo -e "${RED}❌ Frontend service has stopped${NC}"
        break
    fi
    
    if [ "$BACKEND_AVAILABLE" = true ]; then
        backend_pid=$(cat "$BACKEND_DIR/logs/backend.pid" 2>/dev/null || echo "")
        if [ ! -z "$backend_pid" ] && ! kill -0 $backend_pid 2>/dev/null; then
            echo -e "${YELLOW}⚠️  Backend service has stopped${NC}"
        fi
    fi
done

# If we get here, something went wrong
cleanup