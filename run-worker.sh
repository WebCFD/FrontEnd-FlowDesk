#!/bin/bash

echo "Starting Python Worker..."
echo "Press Ctrl+C to stop"
echo ""

# Run worker with unbuffered output
python3 -u worker.py
