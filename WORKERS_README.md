# Worker Management Scripts

Scripts para gestionar automáticamente los workers de simulación CFD.

## 🚀 Uso Rápido

### Iniciar supervisor (recomendado)
```bash
./supervisor_workers.sh
```

El supervisor:
- ✅ Inicia ambos workers automáticamente
- ✅ Verifica cada 60 segundos que estén corriendo
- ✅ Los relanza automáticamente si fallan
- ✅ Guarda logs en `worker_logs/`

### Detener todo
```bash
./stop_workers.sh
```

## 📁 Archivos

- **`supervisor_workers.sh`** - Script principal que vigila los workers
- **`stop_workers.sh`** - Detiene supervisor y workers
- **`worker_logs/`** - Directorio con logs de cada worker

## 📊 Ver Logs

Ver logs en tiempo real:
```bash
# Worker submit
tail -f worker_logs/worker_submit.log

# Worker monitor
tail -f worker_logs/worker_monitor.log
```

Ver últimas 50 líneas:
```bash
tail -50 worker_logs/worker_submit.log
```

## ⚙️ Configuración

Puedes cambiar el intervalo de verificación editando `supervisor_workers.sh`:
```bash
CHECK_INTERVAL=60  # Cambiar a 30 para verificar cada 30 segundos
```

## 🔍 Verificar Estado Manual

```bash
# Ver si están corriendo
ps aux | grep worker_

# Ver PIDs
pgrep -fa python3
```

## 🛠️ Troubleshooting

**Workers no inician:**
- Verifica que existan `worker_submit.py` y `worker_monitor.py`
- Revisa logs en `worker_logs/`

**Supervisor no se detiene:**
```bash
pkill -9 -f supervisor_workers
pkill -9 -f python3
```

**Reiniciar todo desde cero:**
```bash
./stop_workers.sh
rm -rf worker_logs/
./supervisor_workers.sh
```
