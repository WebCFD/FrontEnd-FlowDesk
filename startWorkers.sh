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

# Active workers (worker.py is obsolete and removed)
WORKER_FILES=(worker_submit.py worker_monitor.py)
AVAILABLE_WORKERS=()

print_info "Active workers: worker_submit.py (submission) + worker_monitor.py (monitoring)"

for wf in "${WORKER_FILES[@]}"; do
    if [ -f "$wf" ]; then
        AVAILABLE_WORKERS+=("$wf")
    else
        print_error "Required worker file not found: $wf"
        exit 1
    fi
done

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

# Clean cache with timeout to prevent hanging
print_info "Removing Python cache (this may take a moment)..."
timeout 60 bash -c '
    # Remove __pycache__ directories (most important)
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    # Remove .pyc files
    find . -type f -name "*.pyc" -delete 2>/dev/null || true
    # Remove .pyo files
    find . -type f -name "*.pyo" -delete 2>/dev/null || true
' && print_info "✓ Python cache cleaned" || print_warn "Cache cleaning timed out (non-critical)"

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
    print_warn "mesher_config.py not found"
fi

echo ""

# 4. Start worker processes
print_info "Starting worker processes..."
echo ""

STARTED_WORKERS=()
FAILED_WORKERS=()

# Start worker_submit.py (preparation & submission)
print_info "Starting worker_submit.py (preparation & submission)..."
nohup python3 worker_submit.py > worker_submit.log 2>&1 &
SUBMIT_PID=$!
sleep 1

if ps -p $SUBMIT_PID > /dev/null 2>&1; then
    print_info "  ✓ worker_submit.py started (PID: $SUBMIT_PID, Log: worker_submit.log)"
    STARTED_WORKERS+=("worker_submit.py")
else
    print_error "  ✗ Failed to start worker_submit.py"
    print_info "  Check worker_submit.log for errors:"
    tail -10 worker_submit.log 2>/dev/null | sed 's/^/    /' || echo "    No log file found"
    FAILED_WORKERS+=("worker_submit.py")
fi
echo ""

# Start worker_monitor.py (monitoring & post-processing)
print_info "Starting worker_monitor.py (monitoring & post-processing)..."
nohup python3 worker_monitor.py > worker_monitor.log 2>&1 &
MONITOR_PID=$!
sleep 1

if ps -p $MONITOR_PID > /dev/null 2>&1; then
    print_info "  ✓ worker_monitor.py started (PID: $MONITOR_PID, Log: worker_monitor.log)"
    STARTED_WORKERS+=("worker_monitor.py")
else
    print_error "  ✗ Failed to start worker_monitor.py"
    print_info "  Check worker_monitor.log for errors:"
    tail -10 worker_monitor.log 2>/dev/null | sed 's/^/    /' || echo "    No log file found"
    FAILED_WORKERS+=("worker_monitor.py")
fi
echo ""

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
    echo "  ✓ worker_submit.py   - Prepares and submits simulations to Inductiva"
    echo "  ✓ worker_monitor.py  - Monitors cloud execution and downloads results"
fi

echo ""
echo "Current worker processes:"
ps aux | grep "python.*worker" | grep -v grep | awk '{printf "  PID %-6s CPU %-5s MEM %-5s: %s\n", $2, $3"%", $4"%", substr($0, index($0,$11))}' || echo "  (none)"

echo ""
echo "Commands:"
echo "  • Monitor logs:   tail -f worker_submit.log worker_monitor.log"
echo "  • Check status:   ./checkWorkers.sh"
echo "  • Stop workers:   pkill -f 'python.*worker'"
echo ""
echo "Pipeline architecture:"
echo "  pending → worker_submit → cloud_execution → worker_monitor → completed"
echo ""
