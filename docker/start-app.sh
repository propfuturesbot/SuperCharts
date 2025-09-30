#!/bin/sh

echo "Starting SuperCharts application..."

# Copy auth-token.json to the realtime directory if it exists
if [ -f "/app/auth-token.json" ]; then
    cp /app/auth-token.json /app/src/realtime/auth-token.json
    echo "✓ Auth token copied to realtime directory"
fi

# Start the backend server in the background
echo "Starting backend server..."
cd /app/trading-backend
node simple-backend.js &
BACKEND_PID=$!
echo "✓ Backend server started with PID: $BACKEND_PID"

# Give backend a moment to start
sleep 2

# Start the frontend server (React app)
echo "Starting frontend server (React app)..."
cd /app
http-server react-app -p 3000 -c-1 --cors &
FRONTEND_PID=$!
echo "✓ Frontend server (React app) started with PID: $FRONTEND_PID"

# Keep the container running and handle shutdown
trap "echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID; exit" SIGTERM SIGINT

# Wait for any process to exit
wait $BACKEND_PID $FRONTEND_PID

# Exit with status of process that exited first
exit $?