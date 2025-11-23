# Worker Management - Quick Start

## 🚀 Essential Commands

```bash
# Check worker status
./checkWorkers.sh

# Restart all workers (cleans Python cache)
./startWorkers.sh

# Monitor logs in real-time
tail -f worker_submit.log worker_monitor.log

# Stop all workers manually
pkill -f 'python.*worker'
```

## 🏗️ Pipeline Architecture

```
User submits → pending → worker_submit → cloud_execution → worker_monitor → completed
                              ↓                                    ↓
                      Submit to Inductiva                  Download & process
```

## 📊 What Workers Do

| Worker | Purpose | Status | Log File |
|--------|---------|--------|----------|
| **worker_submit.py** | Prepares & submits to Inductiva | ✅ Active | `worker_submit.log` |
| **worker_monitor.py** | Monitors cloud & downloads results | ✅ Active | `worker_monitor.log` |
| ~~worker.py~~ | ~~Obsolete monolithic worker~~ | ❌ Deleted | ~~N/A~~ |

### worker_submit.py Details
- **Processes:** `pending` simulations
- **Types:** `comfortTest`, `comfort30Iter`
- **Pipeline:** JSON → Geometry → Mesh → CFD → Submit (doesn't wait)
- **Poll interval:** 10 seconds
- **⚠️ Imports `mesher_config` at startup** - requires restart after config changes

### worker_monitor.py Details
- **Processes:** `cloud_execution` simulations
- **Checks:** Inductiva task status
- **On success:** Downloads → Generates VTK → Copies to public → Marks complete
- **Poll interval:** 30 seconds
- **Memory protection:** Processes only 1 sim per cycle + forced GC

## ⚡ Quick Workflows

### After changing `mesher_config.py`:
```bash
./startWorkers.sh
```
This ensures workers reload the new configuration from a clean state.

### Check if everything is running:
```bash
./checkWorkers.sh
```

### Something broken? Full restart:
```bash
pkill -f 'python.*worker'
./startWorkers.sh
./checkWorkers.sh
```

### Monitor what's happening:
```bash
# Follow both logs
tail -f worker_submit.log worker_monitor.log

# Or separately
tail -f worker_submit.log    # See simulation preparation
tail -f worker_monitor.log   # See downloads and post-processing
```

## 🔍 Understanding the Output

### `checkWorkers.sh` shows:
1. **Worker Processes** - Which workers are running (PID, CPU, memory)
2. **Worker Files & Logs** - Status of each worker and its purpose
3. **Mesher Configuration** - Current settings (cfmesh, quality level)
4. **Python Cache** - How much cache exists
5. **Module Cache Check** - ⚠️ Warns if .pyc files are outdated

**Example output:**
```
[1] Worker Processes:
✓ Worker processes found:
  PID: 12345  CPU: 2.1%  MEM: 1.3%  CMD: python3 worker_submit.py
  PID: 12346  CPU: 1.5%  MEM: 0.8%  CMD: python3 worker_monitor.py

[5] Module Cache Check:
  ⚠ WARNING: .pyc file is OLDER than .py file!
    Recommendation: Restart workers with ./startWorkers.sh
```

### `startWorkers.sh` does:
1. ✋ Stops all running workers (graceful → force if needed)
2. 🧹 **Deletes ALL Python cache**:
   - `__pycache__/` directories
   - `*.pyc` files (compiled bytecode)
   - `*.pyo` files (optimized bytecode)
3. ✅ Verifies current `mesher_config.py` settings
4. 🚀 Starts both workers in background
5. 📊 Shows final status and PIDs

**Example output:**
```
🔄 WORKER RESTART SCRIPT
==========================================

[INFO] Stopping all worker processes...
[INFO] Cleaning Python cache files...
[INFO] Removing 79 __pycache__ directories...
[INFO] Removing 626 .pyc files...
[INFO] ✓ Python cache cleaned

[INFO] Current configuration:
[INFO]   DEFAULT_MESHER = "cfmesh"
[INFO]   DEFAULT_QUALITY_LEVEL = 1

[INFO] Starting worker_submit.py (preparation & submission)...
[INFO]   ✓ worker_submit.py started (PID: 12345, Log: worker_submit.log)

[INFO] Starting worker_monitor.py (monitoring & post-processing)...
[INFO]   ✓ worker_monitor.py started (PID: 12346, Log: worker_monitor.log)

✓ ALL WORKERS RESTARTED SUCCESSFULLY
==========================================

Pipeline architecture:
  pending → worker_submit → cloud_execution → worker_monitor → completed
```

## ⚠️ Important Notes

- **Always restart workers after changing `mesher_config.py`** - Python caches modules in `sys.modules`!
- Workers run in background with `nohup` - they survive terminal close
- Each worker has its own log file
- Cache cleaning prevents stale configuration issues
- Old `worker.py` was deleted (obsolete/monolithic)

## 🐛 Common Issues

### Workers won't start?
```bash
# Check the logs
cat worker_submit.log
cat worker_monitor.log

# Verify files exist
ls -la worker_submit.py worker_monitor.py

# Check Python is available
python3 --version
```

### Workers keep using old config?
```bash
# This is the Python cache problem!
# Force clean restart:
pkill -KILL -f 'python.*worker'
rm -rf __pycache__
find . -name "*.pyc" -delete
./startWorkers.sh

# Verify it worked:
./checkWorkers.sh
```

### Simulations using wrong mesher?
```bash
# 1. Check what's configured
grep DEFAULT_MESHER mesher_config.py

# 2. Check if cache is stale
./checkWorkers.sh
# Look for: "⚠ WARNING: .pyc file is OLDER than .py file!"

# 3. If stale, restart
./startWorkers.sh

# 4. Verify
./checkWorkers.sh
```

### Only one worker running?
```bash
# Check which one is missing
./checkWorkers.sh

# Restart both
./startWorkers.sh

# If still failing, check logs for errors
tail -50 worker_submit.log worker_monitor.log
```

## 📝 Manual Operations

If you prefer manual control:

```bash
# Start workers manually
nohup python3 worker_submit.py > worker_submit.log 2>&1 &
nohup python3 worker_monitor.py > worker_monitor.log 2>&1 &

# Stop specific worker
pkill -f "python.*worker_submit.py"
pkill -f "python.*worker_monitor.py"

# Clean cache manually
find . -type d -name "__pycache__" -exec rm -rf {} +
find . -type f -name "*.pyc" -delete

# Check running workers
ps aux | grep "python.*worker"
```

## 🎯 When to Restart Workers

**ALWAYS restart after:**
- ✏️ Changing `mesher_config.py`
- ✏️ Modifying pipeline code (`step01_json2geo.py`, etc.)
- 🔄 Updating Python dependencies
- 🐛 Suspecting cache issues

**DON'T need to restart for:**
- ✅ Frontend changes (React/Vite)
- ✅ Database changes
- ✅ Environment variables (they're read at runtime)
