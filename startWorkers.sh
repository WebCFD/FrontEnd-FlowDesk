#!/bin/bash
set -e

echo "=========================================="
echo "🔄 WORKER RESTART SCRIPT"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 1. Stop all worker processes
print_info "Stopping all worker processes..."
WORKER_PIDS=$(pgrep -f "python.*worker.py" || true)

if [ -z "$WORKER_PIDS" ]; then
    print_warn "No worker processes found running"
else
    print_info "Found worker processes: $WORKER_PIDS"
    
    # Try graceful shutdown first (SIGTERM)
    print_info "Sending SIGTERM for graceful shutdown..."
    pkill -TERM -f "python.*worker.py" || true
    
    # Wait up to 5 seconds for graceful shutdown
    sleep 2
    
    # Check if still running
    REMAINING=$(pgrep -f "python.*worker.py" || true)
    if [ -n "$REMAINING" ]; then
        print_warn "Some workers still running, forcing shutdown (SIGKILL)..."
        pkill -KILL -f "python.*worker.py" || true
        sleep 1
    fi
    
    # Verify all stopped
    FINAL_CHECK=$(pgrep -f "python.*worker.py" || true)
    if [ -z "$FINAL_CHECK" ]; then
        print_info "✓ All worker processes stopped"
    else
        print_error "Failed to stop some workers: $FINAL_CHECK"
        exit 1
    fi
fi

echo ""

# 2. Clean Python cache files
print_info "Cleaning Python cache files..."

# Remove __pycache__ directories
PYCACHE_COUNT=$(find . -type d -name "__pycache__" 2>/dev/null | wc -l)
if [ "$PYCACHE_COUNT" -gt 0 ]; then
    print_info "Removing $PYCACHE_COUNT __pycache__ directories..."
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
fi

# Remove .pyc files
PYC_COUNT=$(find . -type f -name "*.pyc" 2>/dev/null | wc -l)
if [ "$PYC_COUNT" -gt 0 ]; then
    print_info "Removing $PYC_COUNT .pyc files..."
    find . -type f -name "*.pyc" -delete 2>/dev/null || true
fi

# Remove .pyo files (optimized bytecode)
PYO_COUNT=$(find . -type f -name "*.pyo" 2>/dev/null | wc -l)
if [ "$PYO_COUNT" -gt 0 ]; then
    print_info "Removing $PYO_COUNT .pyo files..."
    find . -type f -name "*.pyo" -delete 2>/dev/null || true
fi

print_info "✓ Python cache cleaned"

echo ""

# 3. Verify mesher_config.py current setting
print_info "Verifying mesher_config.py settings..."
if [ -f "mesher_config.py" ]; then
    DEFAULT_MESHER=$(grep "^DEFAULT_MESHER" mesher_config.py | cut -d'"' -f2 || echo "unknown")
    QUALITY_LEVEL=$(grep "^DEFAULT_QUALITY_LEVEL" mesher_config.py | cut -d'=' -f2 | tr -d ' ' || echo "unknown")
    print_info "Current configuration:"
    print_info "  DEFAULT_MESHER = \"$DEFAULT_MESHER\""
    print_info "  DEFAULT_QUALITY_LEVEL = $QUALITY_LEVEL"
else
    print_error "mesher_config.py not found!"
    exit 1
fi

echo ""

# 4. Start worker processes
print_info "Starting worker process..."

# Check if worker.py exists
if [ ! -f "worker.py" ]; then
    print_error "worker.py not found in current directory!"
    exit 1
fi

# Start worker in background with nohup for persistence
nohup python3 worker.py > worker.log 2>&1 &
WORKER_PID=$!

# Wait a moment for process to start
sleep 2

# Verify worker started successfully
if ps -p $WORKER_PID > /dev/null 2>&1; then
    print_info "✓ Worker started successfully (PID: $WORKER_PID)"
    print_info "  Log file: worker.log"
    print_info "  To monitor: tail -f worker.log"
else
    print_error "Failed to start worker process"
    print_info "Check worker.log for errors:"
    tail -20 worker.log 2>/dev/null || echo "No log file found"
    exit 1
fi

echo ""

# 5. Display worker status
print_info "Worker status:"
ps aux | grep "python.*worker.py" | grep -v grep || print_warn "Worker process not found in ps output"

echo ""
echo "=========================================="
echo -e "${GREEN}✓ WORKER RESTART COMPLETE${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  • Monitor logs: tail -f worker.log"
echo "  • Check status: ps aux | grep worker.py"
echo "  • Stop workers: pkill -f 'python.*worker.py'"
echo ""
