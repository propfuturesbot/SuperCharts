#!/bin/bash

# Script to make all startup scripts executable
# Run this once after cloning the repository

echo "🔧 Making startup scripts executable..."

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Make main startup scripts executable
chmod +x "$PROJECT_ROOT/start-trading-system.sh"
echo "✅ Made start-trading-system.sh executable"

# Make React scripts executable
if [ -d "$PROJECT_ROOT/react-trading-app/scripts" ]; then
    chmod +x "$PROJECT_ROOT/react-trading-app/scripts/start-dev.sh"
    echo "✅ Made react-trading-app/scripts/start-dev.sh executable"
fi

# Make Backend scripts executable
if [ -d "$PROJECT_ROOT/trading-backend/scripts" ]; then
    chmod +x "$PROJECT_ROOT/trading-backend/scripts/start-backend.sh"
    echo "✅ Made trading-backend/scripts/start-backend.sh executable"
fi

# Make this script executable too
chmod +x "$PROJECT_ROOT/scripts/make-executable.sh"
echo "✅ Made scripts/make-executable.sh executable"

echo ""
echo "🎉 All startup scripts are now executable!"
echo ""
echo "You can now run:"
echo "  ./start-trading-system.sh    - Start both frontend and backend"
echo "  ./react-trading-app/scripts/start-dev.sh    - Start only React frontend"
echo "  ./trading-backend/scripts/start-backend.sh  - Start only backend"