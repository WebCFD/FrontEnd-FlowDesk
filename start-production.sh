#!/bin/bash

# Production Start Script - Simplified for Cloud Run
# Sets NODE_ENV explicitly and starts server with workers

set -e

# Ensure NODE_ENV is set to production
export NODE_ENV=production

echo "========================================="
echo "Starting Production Server"
echo "NODE_ENV: $NODE_ENV"
echo "Port: 5000"
echo "Host: 0.0.0.0"
echo "========================================="
echo ""

# Create necessary directories
mkdir -p production_logs
mkdir -p /tmp/worker_heartbeats

# Log function with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Cleanup handler for graceful shutdown
cleanup() {
    log "Shutdown signal received. Stopping all processes..."
    
    # Kill all child processes
    pkill -P $$ 2>/dev/null || true
    
    # Kill specific processes
    pkill -f "node dist/index.js" 2>/dev/null || true
    pkill -f "worker_submit.py" 2>/dev/null || true
    pkill -f "worker_monitor.py" 2>/dev/null || true
    
    log "All processes stopped"
    exit 0
}

# Trap termination signals
trap cleanup SIGTERM SIGINT EXIT

# Start Express server (foreground - required for Cloud Run)
log "Starting Express server..."
node dist/index.js &
EXPRESS_PID=$!
log "Express server started (PID: $EXPRESS_PID)"

# Start Python workers in background
log "Starting worker_submit.py..."
python3 -u worker_submit.py >> production_logs/worker_submit.log 2>&1 &
log "Worker submit started (PID: $!)"

log "Starting worker_monitor.py..."
python3 -u worker_monitor.py >> production_logs/worker_monitor.log 2>&1 &
log "Worker monitor started (PID: $!)"

log "All processes started successfully"
log "Server is now serving on 0.0.0.0:5000"

# Wait for Express process (keeps container alive)
wait $EXPRESS_PID
