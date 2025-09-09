#!/bin/bash

# Trading System Master Startup Script
# This script starts both the React frontend and Node.js backend simultaneously

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

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
║                              Futuristic Trading Dashboard v2.0                                ║
║                                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${PURPLE}🚀 Starting Complete Trading System...${NC}"
echo -e "${PURPLE}======================================${NC}"

# Configuration
REACT_PORT=3000
BACKEND_PORT=8000
SIGNALR_PORT=5000

# Function to kill process on port
kill_port() {
    local port=$1
    local service_name=$2
    
    echo -e "${YELLOW}🔍 Checking for processes on port ${port}...${NC}"
    
    if command -v lsof >/dev/null 2>&1; then
        local pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$pids" ]; then
            echo -e "${RED}❌ Found ${service_name} running on port ${port}${NC}"
            echo $pids | xargs kill -9 2>/dev/null || true
            sleep 1
            echo -e "${GREEN}✅ Cleared port ${port}${NC}"
        else
            echo -e "${GREEN}✅ Port ${port} is already free${NC}"
        fi
    fi
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

# Function to start service in background
start_service() {
    local service_name=$1
    local directory=$2
    local script_path=$3
    local port=$4
    
    echo -e "${BLUE}🚀 Starting ${service_name}...${NC}"
    
    cd "$directory"
    
    # Convert service name to lowercase for file names
    local service_lower=$(echo "$service_name" | tr '[:upper:]' '[:lower:]')
    
    # Make script executable
    chmod +x "$script_path" 2>/dev/null || true
    
    # Start the service in background
    nohup bash "$script_path" > "logs/${service_lower}.log" 2>&1 &
    local pid=$!
    
    # Store PID for cleanup
    echo $pid > "logs/${service_lower}.pid"
    
    echo -e "${GREEN}✅ ${service_name} started (PID: ${pid})${NC}"
    echo -e "${CYAN}📋 Logs: ${directory}/logs/${service_lower}.log${NC}"
    
    # Wait a bit and check if process is still running
    sleep 3
    if kill -0 $pid 2>/dev/null; then
        echo -e "${GREEN}✅ ${service_name} is running successfully${NC}"
    else
        echo -e "${RED}❌ ${service_name} failed to start${NC}"
        return 1
    fi
    
    cd - >/dev/null
}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down Trading System...${NC}"
    
    # Kill background processes
    for service in "frontend" "backend"; do
        # Check in react-trading-app/logs first
        pid_file="$REACT_DIR/logs/${service}.pid"
        if [ -f "$pid_file" ]; then
            pid=$(cat "$pid_file")
            if kill -0 $pid 2>/dev/null; then
                echo -e "${YELLOW}🔄 Stopping ${service} (PID: ${pid})...${NC}"
                kill -TERM $pid 2>/dev/null || true
                sleep 2
                kill -KILL $pid 2>/dev/null || true
            fi
            rm -f "$pid_file"
        fi
        
        # Check in trading-backend/logs too
        pid_file="$BACKEND_DIR/logs/${service}.pid"
        if [ -f "$pid_file" ]; then
            pid=$(cat "$pid_file")
            if kill -0 $pid 2>/dev/null; then
                echo -e "${YELLOW}🔄 Stopping ${service} (PID: ${pid})...${NC}"
                kill -TERM $pid 2>/dev/null || true
                sleep 2
                kill -KILL $pid 2>/dev/null || true
            fi
            rm -f "$pid_file"
        fi
    done
    
    # Clean up ports
    echo -e "${YELLOW}🧹 Cleaning up ports...${NC}"
    kill_port $REACT_PORT "React Frontend"
    kill_port $BACKEND_PORT "Backend API"
    kill_port $SIGNALR_PORT "SignalR Hub"
    
    echo -e "${GREEN}✅ Trading System shutdown complete${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Clean up ports first
echo -e "${BLUE}🧹 Cleaning up ports...${NC}"
kill_port $REACT_PORT "React Frontend"
kill_port $BACKEND_PORT "Backend API"
kill_port $SIGNALR_PORT "SignalR Hub"

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

# Install dependencies
echo -e "${BLUE}📦 Checking dependencies...${NC}"

# React dependencies
echo -e "${CYAN}🔍 Checking React dependencies...${NC}"
cd "$REACT_DIR"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing React dependencies...${NC}"
    npm install
fi

# Backend dependencies
if [ "$BACKEND_AVAILABLE" = true ]; then
    echo -e "${CYAN}🔍 Checking Backend dependencies...${NC}"
    cd "$BACKEND_DIR"
    if [ ! -d "node_modules" ]; then
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
    if start_service "Backend" "$BACKEND_DIR" "scripts/start-backend.sh" "$BACKEND_PORT"; then
        echo -e "${GREEN}✅ Backend service started successfully${NC}"
        sleep 5  # Give backend time to fully start
    else
        echo -e "${RED}❌ Backend service failed to start${NC}"
        echo -e "${YELLOW}ℹ️  Continuing with React frontend only${NC}"
    fi
fi

# Start React Frontend
if start_service "Frontend" "$REACT_DIR" "scripts/start-dev.sh" "$REACT_PORT"; then
    echo -e "${GREEN}✅ Frontend service started successfully${NC}"
else
    echo -e "${RED}❌ Frontend service failed to start${NC}"
    cleanup
    exit 1
fi

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