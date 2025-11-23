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
BLUE='\033[0;34m'
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

# Detect which workers to manage
WORKER_FILES=(worker.py worker_monitor.py worker_submit.py)
AVAILABLE_WORKERS=()
for wf in "${WORKER_FILES[@]}"; do
    if [ -f "$wf" ]; then
        AVAILABLE_WORKERS+=("$wf")
    fi
done

if [ ${#AVAILABLE_WORKERS[@]} -eq 0 ]; then
    print_error "No worker files found (worker.py, worker_monitor.py, worker_submit.py)"
    exit 1
fi

print_info "Found worker files: ${AVAILABLE_WORKERS[*]}"
echo ""

# 1. Stop all worker processes
print_info "Stopping all worker processes..."
WORKER_PIDS=$(pgrep -f "python.*worker" || true)

if [ -z "$WORKER_PIDS" ]; then
    print_warn "No worker processes found running"
else
    print_info "Found worker processes: $WORKER_PIDS"
    
    # Show what's running before stopping
    echo ""
    ps aux | grep "python.*worker" | grep -v grep | awk '{printf "  PID %-6s: %s\n", $2, substr($0, index($0,$11))}'
    echo ""
    
    # Try graceful shutdown first (SIGTERM)
    print_info "Sending SIGTERM for graceful shutdown..."
    pkill -TERM -f "python.*worker" || true
    
    # Wait up to 5 seconds for graceful shutdown
    sleep 2
    
    # Check if still running
    REMAINING=$(pgrep -f "python.*worker" || true)
    if [ -n "$REMAINING" ]; then
        print_warn "Some workers still running, forcing shutdown (SIGKILL)..."
        pkill -KILL -f "python.*worker" || true
        sleep 1
    fi
    
    # Verify all stopped
    FINAL_CHECK=$(pgrep -f "python.*worker" || true)
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
    print_warn "mesher_config.py not found (may not be needed for all workers)"
fi

echo ""

# 4. Start worker processes
print_info "Starting worker processes..."
echo ""

STARTED_WORKERS=()
FAILED_WORKERS=()

for worker_file in "${AVAILABLE_WORKERS[@]}"; do
    worker_name="${worker_file%.py}"
    log_file="${worker_name}.log"
    
    print_info "Starting $worker_file..."
    
    # Start worker in background with nohup for persistence
    nohup python3 "$worker_file" > "$log_file" 2>&1 &
    WORKER_PID=$!
    
    # Wait a moment for process to start
    sleep 1
    
    # Verify worker started successfully
    if ps -p $WORKER_PID > /dev/null 2>&1; then
        print_info "  ✓ $worker_file started (PID: $WORKER_PID, Log: $log_file)"
        STARTED_WORKERS+=("$worker_file")
    else
        print_error "  ✗ Failed to start $worker_file"
        print_info "  Check $log_file for errors:"
        tail -10 "$log_file" 2>/dev/null | sed 's/^/    /' || echo "    No log file found"
        FAILED_WORKERS+=("$worker_file")
    fi
    echo ""
done

# 5. Display final status
echo "=========================================="
if [ ${#FAILED_WORKERS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠ PARTIAL RESTART${NC}"
    echo "=========================================="
    echo ""
    echo -e "${GREEN}Started successfully (${#STARTED_WORKERS[@]}):${NC}"
    for w in "${STARTED_WORKERS[@]}"; do
        echo "  ✓ $w"
    done
    echo ""
    echo -e "${RED}Failed to start (${#FAILED_WORKERS[@]}):${NC}"
    for w in "${FAILED_WORKERS[@]}"; do
        echo "  ✗ $w"
    done
else
    echo -e "${GREEN}✓ ALL WORKERS RESTARTED SUCCESSFULLY${NC}"
    echo "=========================================="
    echo ""
    echo "Running workers:"
    for w in "${STARTED_WORKERS[@]}"; do
        echo "  ✓ $w"
    done
fi

echo ""
echo "Current worker processes:"
ps aux | grep "python.*worker" | grep -v grep | awk '{printf "  PID %-6s CPU %-5s MEM %-5s: %s\n", $2, $3"%", $4"%", substr($0, index($0,$11))}' || echo "  (none)"

echo ""
echo "Commands:"
echo "  • Monitor logs:   tail -f worker.log worker_monitor.log worker_submit.log"
echo "  • Check status:   ./checkWorkers.sh"
echo "  • Stop workers:   pkill -f 'python.*worker'"
echo ""
