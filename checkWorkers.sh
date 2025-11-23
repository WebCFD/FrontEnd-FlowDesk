#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "🔍 WORKER STATUS CHECK"
echo "=========================================="
echo ""

# Detect available worker files
WORKER_FILES=(worker.py worker_monitor.py worker_submit.py)
AVAILABLE_WORKERS=()
for wf in "${WORKER_FILES[@]}"; do
    if [ -f "$wf" ]; then
        AVAILABLE_WORKERS+=("$wf")
    fi
done

# Check if workers are running
echo -e "${BLUE}[1] Worker Processes:${NC}"
WORKER_PIDS=$(pgrep -f "python.*worker" || true)

if [ -z "$WORKER_PIDS" ]; then
    echo -e "${RED}✗ No worker processes running${NC}"
else
    echo -e "${GREEN}✓ Worker processes found:${NC}"
    ps aux | grep "python.*worker" | grep -v grep | awk '{printf "  PID: %-6s CPU: %-5s MEM: %-5s START: %-8s CMD: %s\n", $2, $3"%", $4"%", $9, substr($0, index($0,$11))}'
fi

echo ""

# Check each worker file and its log
echo -e "${BLUE}[2] Worker Files & Logs:${NC}"
for worker_file in "${AVAILABLE_WORKERS[@]}"; do
    worker_name="${worker_file%.py}"
    log_file="${worker_name}.log"
    
    echo ""
    echo -e "${YELLOW}  $worker_file:${NC}"
    
    # Check if worker is running
    RUNNING=$(pgrep -f "python.*$worker_file" || true)
    if [ -n "$RUNNING" ]; then
        echo -e "    Status: ${GREEN}RUNNING${NC} (PID: $RUNNING)"
    else
        echo -e "    Status: ${RED}STOPPED${NC}"
    fi
    
    # Check log file
    if [ -f "$log_file" ]; then
        LOG_SIZE=$(du -h "$log_file" | cut -f1)
        LOG_LINES=$(wc -l < "$log_file")
        LOG_MODIFIED=$(stat -c %y "$log_file" 2>/dev/null | cut -d'.' -f1 || echo "unknown")
        echo "    Log: $log_file (Size: $LOG_SIZE, Lines: $LOG_LINES)"
        echo "    Modified: $LOG_MODIFIED"
        
        if [ -n "$RUNNING" ]; then
            echo "    Last 3 entries:"
            tail -3 "$log_file" | sed 's/^/      /'
        fi
    else
        echo -e "    Log: ${YELLOW}not found${NC}"
    fi
done

echo ""
echo ""

# Check mesher configuration
echo -e "${BLUE}[3] Mesher Configuration:${NC}"
if [ -f "mesher_config.py" ]; then
    DEFAULT_MESHER=$(grep "^DEFAULT_MESHER" mesher_config.py | cut -d'"' -f2 || echo "unknown")
    QUALITY_LEVEL=$(grep "^DEFAULT_QUALITY_LEVEL" mesher_config.py | cut -d'=' -f2 | tr -d ' ' || echo "unknown")
    echo -e "${GREEN}✓ mesher_config.py found${NC}"
    echo "  DEFAULT_MESHER: $DEFAULT_MESHER"
    echo "  DEFAULT_QUALITY_LEVEL: $QUALITY_LEVEL"
else
    echo -e "${YELLOW}⚠ mesher_config.py not found${NC}"
fi

echo ""

# Check Python cache
echo -e "${BLUE}[4] Python Cache:${NC}"
PYCACHE_DIRS=$(find . -type d -name "__pycache__" 2>/dev/null | wc -l)
PYC_FILES=$(find . -type f -name "*.pyc" 2>/dev/null | wc -l)

if [ "$PYCACHE_DIRS" -eq 0 ] && [ "$PYC_FILES" -eq 0 ]; then
    echo -e "${GREEN}✓ No Python cache files found (clean)${NC}"
else
    echo -e "${YELLOW}⚠ Python cache files found:${NC}"
    echo "  __pycache__ directories: $PYCACHE_DIRS"
    echo "  .pyc files: $PYC_FILES"
    echo ""
    echo -e "${YELLOW}  Tip: Run ./startWorkers.sh to clean cache and restart workers${NC}"
fi

echo ""

# Check if mesher_config is in Python module cache
echo -e "${BLUE}[5] Module Cache Check:${NC}"
if [ -n "$WORKER_PIDS" ]; then
    # Check specific common locations instead of recursive find
    MESHER_PYC=""
    if [ -f "__pycache__/mesher_config.cpython-311.pyc" ]; then
        MESHER_PYC="__pycache__/mesher_config.cpython-311.pyc"
    elif [ -f "__pycache__/mesher_config.cpython-310.pyc" ]; then
        MESHER_PYC="__pycache__/mesher_config.cpython-310.pyc"
    elif [ -f "__pycache__/mesher_config.cpython-312.pyc" ]; then
        MESHER_PYC="__pycache__/mesher_config.cpython-312.pyc"
    fi
    
    if [ -n "$MESHER_PYC" ] && [ -f "$MESHER_PYC" ]; then
        PYC_TIME=$(stat -c %y "$MESHER_PYC" 2>/dev/null | cut -d'.' -f1)
        
        if [ -f "mesher_config.py" ]; then
            PY_TIME=$(stat -c %y mesher_config.py 2>/dev/null | cut -d'.' -f1)
            echo "  mesher_config.pyc: $PYC_TIME"
            echo "  mesher_config.py:  $PY_TIME"
            
            # Compare timestamps
            if [ "$PYC_TIME" \< "$PY_TIME" ]; then
                echo -e "${RED}  ⚠ WARNING: .pyc file is OLDER than .py file!${NC}"
                echo -e "${YELLOW}    Recommendation: Restart workers with ./startWorkers.sh${NC}"
            else
                echo -e "${GREEN}  ✓ Cache is up to date${NC}"
            fi
        else
            echo "  mesher_config.pyc found but .py missing"
        fi
    else
        echo -e "${GREEN}  ✓ No mesher_config cache file found${NC}"
    fi
else
    echo -e "${YELLOW}  (No workers running to check)${NC}"
fi

echo ""

# Summary
echo "=========================================="
echo -e "${BLUE}Summary:${NC}"

RUNNING_COUNT=$(pgrep -f "python.*worker" | wc -l)
TOTAL_WORKERS=${#AVAILABLE_WORKERS[@]}

if [ "$RUNNING_COUNT" -eq "$TOTAL_WORKERS" ]; then
    echo -e "${GREEN}✓ All workers running ($RUNNING_COUNT/$TOTAL_WORKERS)${NC}"
elif [ "$RUNNING_COUNT" -eq 0 ]; then
    echo -e "${RED}✗ No workers running (0/$TOTAL_WORKERS)${NC}"
else
    echo -e "${YELLOW}⚠ Partial workers running ($RUNNING_COUNT/$TOTAL_WORKERS)${NC}"
fi

echo "=========================================="
echo ""
echo "Commands:"
echo "  Start/Restart: ./startWorkers.sh"
echo "  Stop workers:  pkill -f 'python.*worker'"
echo "  Monitor logs:  tail -f worker.log worker_monitor.log worker_submit.log"
echo "=========================================="
echo ""
