#!/bin/bash

# Start both the Express server and the Python worker in parallel

echo "Starting Express server..."
npm run dev &

# Wait a moment for the server to start
sleep 3

echo "Starting Python worker..."
python3 worker.py &

# Wait for both processes
wait
