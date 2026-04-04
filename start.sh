#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start the log server
echo "Starting log server on port 4174..."
(cd "$SCRIPT_DIR/server" && npm install && npm start) &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Start the frontend
echo "Starting frontend on port 5173..."
(cd "$SCRIPT_DIR" && npm run dev) &
FRONTEND_PID=$!

# Handle cleanup
cleanup() {
    echo "Shutting down..."
    kill $SERVER_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for any process to exit
wait
