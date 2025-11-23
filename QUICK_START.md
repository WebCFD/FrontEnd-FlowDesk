# Worker Management - Quick Start

## 🚀 Essential Commands

```bash
# Check worker status
./checkWorkers.sh

# Restart all workers (cleans Python cache)
./startWorkers.sh

# Monitor logs in real-time
tail -f worker.log worker_monitor.log worker_submit.log

# Stop all workers manually
pkill -f 'python.*worker'
```

## 📊 What Workers Do

| Worker | Purpose | Log File |
|--------|---------|----------|
| `worker.py` | Main simulation processor | `worker.log` |
| `worker_monitor.py` | Monitor task progress | `worker_monitor.log` |
| `worker_submit.py` | Handle submission pipeline | `worker_submit.log` |

## ⚡ Quick Workflows

### After changing `mesher_config.py`:
```bash
./startWorkers.sh
```

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

## 🔍 Understanding the Output

### `checkWorkers.sh` shows:
1. **Worker Processes** - Which workers are running (PID, CPU, memory)
2. **Worker Files & Logs** - Status of each worker file and its log
3. **Mesher Configuration** - Current settings (cfmesh, quality level)
4. **Python Cache** - How much cache exists
5. **Module Cache Check** - If .pyc files are outdated

### `startWorkers.sh` does:
1. ✋ Stops all running workers gracefully
2. 🧹 Deletes ALL Python cache (`__pycache__/`, `*.pyc`, `*.pyo`)
3. ✅ Verifies `mesher_config.py` settings
4. 🚀 Starts all available workers
5. 📊 Shows final status

## ⚠️ Important Notes

- **Always restart workers after changing `mesher_config.py`** - Python caches modules!
- Workers run in background with `nohup` - they survive terminal close
- Each worker has its own log file
- Cache cleaning prevents stale configuration issues

## 🐛 Common Issues

**Workers won't start?**
```bash
# Check the logs
cat worker.log worker_monitor.log worker_submit.log

# Check Python is available
python3 --version
```

**Workers keep using old config?**
```bash
# Force clean restart
pkill -KILL -f 'python.*worker'
rm -rf __pycache__
find . -name "*.pyc" -delete
./startWorkers.sh
```

**Too many cache files?**
```bash
# Just restart - it cleans automatically
./startWorkers.sh
```
