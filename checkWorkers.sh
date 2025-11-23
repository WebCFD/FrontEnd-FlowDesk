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

# Check if workers are running
echo -e "${BLUE}[1] Worker Processes:${NC}"
WORKER_PIDS=$(pgrep -f "python.*worker.py" || true)

if [ -z "$WORKER_PIDS" ]; then
    echo -e "${RED}✗ No worker processes running${NC}"
else
    echo -e "${GREEN}✓ Worker processes found:${NC}"
    ps aux | grep "python.*worker.py" | grep -v grep | awk '{printf "  PID: %-6s CPU: %-5s MEM: %-5s START: %-8s CMD: %s\n", $2, $3"%", $4"%", $9, substr($0, index($0,$11))}'
fi

echo ""

# Check log file
echo -e "${BLUE}[2] Worker Log:${NC}"
if [ -f "worker.log" ]; then
    LOG_SIZE=$(du -h worker.log | cut -f1)
    LOG_LINES=$(wc -l < worker.log)
    echo -e "${GREEN}✓ worker.log found${NC}"
    echo "  Size: $LOG_SIZE"
    echo "  Lines: $LOG_LINES"
    echo ""
    echo "  Last 5 log entries:"
    tail -5 worker.log | sed 's/^/    /'
else
    echo -e "${YELLOW}⚠ worker.log not found${NC}"
fi

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
    echo -e "${RED}✗ mesher_config.py not found${NC}"
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
    # Try to check if mesher_config.pyc exists and when it was modified
    if [ -f "__pycache__/mesher_config.cpython-311.pyc" ]; then
        PYC_TIME=$(stat -c %y __pycache__/mesher_config.cpython-311.pyc 2>/dev/null | cut -d'.' -f1)
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
        echo -e "${GREEN}  ✓ No mesher_config cache file${NC}"
    fi
else
    echo -e "${YELLOW}  (No workers running to check)${NC}"
fi

echo ""
echo "=========================================="
echo "Commands:"
echo "  Start/Restart: ./startWorkers.sh"
echo "  Stop workers:  pkill -f 'python.*worker.py'"
echo "  Monitor logs:  tail -f worker.log"
echo "=========================================="
echo ""
