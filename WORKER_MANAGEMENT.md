# Worker Management Scripts

Scripts para gestionar los workers del sistema CFD y evitar problemas de caché de módulos Python.

## 🏗️ Arquitectura de Workers

El sistema utiliza **2 workers activos** que trabajan en conjunto:

```
┌─────────────────────────────────────────────────────────────────┐
│                      CFD PIPELINE ARCHITECTURE                   │
└─────────────────────────────────────────────────────────────────┘

   [User submits simulation]
            ↓
   Status: "pending"
            ↓
   ┌──────────────────────┐
   │ worker_submit.py     │  ← Prepares and submits
   │                      │     • JSON → Geometry
   │ Processes:           │     • Geometry → Mesh
   │ - comfortTest        │     • Mesh → CFD setup
   │ - comfort30Iter      │     • Submit to Inductiva
   └──────────────────────┘
            ↓
   Status: "cloud_execution"
   Task ID: "xxx..."
            ↓
   [Inductiva Cloud executes OpenFOAM simulation]
            ↓
   ┌──────────────────────┐
   │ worker_monitor.py    │  ← Monitors and downloads
   │                      │     • Checks task status
   │ Monitors:            │     • Downloads results
   │ - cloud_execution    │     • Generates VTK/vtkjs
   │ - post_processing    │     • Copies to public folder
   └──────────────────────┘
            ↓
   Status: "completed"
```

## 📋 Problema Identificado

Cuando cambias `mesher_config.py` (o cualquier módulo Python importado), Python cachea el módulo en memoria (`sys.modules`) con el valor ANTIGUO. Esto causa que:

- Las simulaciones usen configuraciones antiguas aunque el archivo haya cambiado
- Los workers no reflejen cambios en la configuración hasta que se reinicien
- Los archivos `.pyc` guarden bytecode desactualizado

**Ejemplo del problema:**
```python
# En worker_submit.py (línea 18)
from mesher_config import get_default_mesher  # ← Se cachea en sys.modules

# Si cambias mesher_config.py mientras el worker corre:
DEFAULT_MESHER = "cfmesh"  # ← Worker sigue usando valor viejo de memoria!
```

## 🛠️ Scripts Disponibles

### 1. `startWorkers.sh` - Reiniciar Workers

**Uso:**
```bash
./startWorkers.sh
```

**Qué hace:**
1. ✋ **Para** todos los procesos de worker activos (SIGTERM → SIGKILL si necesario)
2. 🧹 **Limpia** toda la caché de Python:
   - Elimina directorios `__pycache__/`
   - Elimina archivos `.pyc` (bytecode compilado)
   - Elimina archivos `.pyo` (bytecode optimizado)
3. ✅ **Verifica** la configuración actual de `mesher_config.py`
4. 🚀 **Lanza** los 2 workers activos en background con `nohup`
5. 📊 **Muestra** el estado final

**Workers iniciados:**
- `worker_submit.py` → Log: `worker_submit.log`
- `worker_monitor.py` → Log: `worker_monitor.log`

### 2. `checkWorkers.sh` - Verificar Estado

**Uso:**
```bash
./checkWorkers.sh
```

**Qué muestra:**
1. 🔍 **Procesos de worker** activos (PID, CPU, memoria)
2. 📄 **Estado de cada worker** (running/stopped) y su log
3. ⚙️ **Configuración actual** del mesher
4. 🗂️ **Estado de la caché** de Python
5. ⏰ **Comparación de timestamps** entre `.py` y `.pyc`

**Ejemplo de salida:**
```
[1] Worker Processes:
✓ Worker processes found:
  PID: 12345  CPU: 2.1%  MEM: 1.3%  START: 10:30    CMD: python3 worker_submit.py
  PID: 12346  CPU: 1.5%  MEM: 0.8%  START: 10:30    CMD: python3 worker_monitor.py

[2] Worker Files & Logs:

  worker_submit.py:
    Purpose: Prepares and submits simulations to Inductiva
    Status: RUNNING (PID: 12345)
    Log: worker_submit.log (Size: 24K, Lines: 456)

  worker_monitor.py:
    Purpose: Monitors cloud execution and downloads results
    Status: RUNNING (PID: 12346)
    Log: worker_monitor.log (Size: 18K, Lines: 312)

[3] Mesher Configuration:
✓ mesher_config.py found
  DEFAULT_MESHER: cfmesh
  DEFAULT_QUALITY_LEVEL: 1

[5] Module Cache Check:
  ⚠ WARNING: .pyc file is OLDER than .py file!
    Recommendation: Restart workers with ./startWorkers.sh
```

## 🔄 Workflow Recomendado

### Cuando cambies `mesher_config.py`:

```bash
# 1. Verificar estado actual
./checkWorkers.sh

# 2. Reiniciar workers (limpia caché automáticamente)
./startWorkers.sh

# 3. Verificar que todo está correcto
./checkWorkers.sh

# 4. Monitorear logs (opcional)
tail -f worker_submit.log worker_monitor.log
```

### Si sospechas problemas de caché:

```bash
# Ver si hay discrepancia entre .py y .pyc
./checkWorkers.sh

# Si aparece WARNING, reiniciar:
./startWorkers.sh
```

## 🎯 Cuándo Usar Cada Script

### Usa `startWorkers.sh` cuando:
- ✏️ Cambies `mesher_config.py`
- ✏️ Cambies cualquier módulo Python del pipeline
- 🔄 Actualices dependencias o código
- 🐛 Sospeches que hay caché desactualizada
- 🚀 Quieras asegurar un estado limpio antes de lanzar simulaciones

### Usa `checkWorkers.sh` cuando:
- 🔍 Quieras ver si los workers están corriendo
- 📊 Necesites información del estado actual
- ⏰ Quieras verificar si la caché está actualizada
- 🐛 Estés debugueando problemas de configuración

## 📝 Comandos Manuales

Si prefieres hacer las operaciones manualmente:

```bash
# Ver workers activos
ps aux | grep "python.*worker"

# Parar workers
pkill -f "python.*worker_submit.py"
pkill -f "python.*worker_monitor.py"

# Limpiar caché Python
find . -type d -name "__pycache__" -exec rm -rf {} +
find . -type f -name "*.pyc" -delete

# Lanzar workers manualmente
nohup python3 worker_submit.py > worker_submit.log 2>&1 &
nohup python3 worker_monitor.py > worker_monitor.log 2>&1 &

# Ver logs en tiempo real
tail -f worker_submit.log worker_monitor.log
```

## ⚙️ Detalles de Cada Worker

### worker_submit.py
**Responsabilidad:** Preparación y envío de simulaciones

**Polling:** Cada 10 segundos
- Busca simulaciones con status `pending`
- Filtra solo tipos HVAC: `comfortTest`, `comfort30Iter`

**Pipeline:**
1. JSON → Geometry (`step01_json2geo`)
2. Geometry → Mesh (`step02_geo2mesh`)
3. Mesh → CFD setup (`step03_mesh2cfd`)
4. Submit to Inductiva → Cambia a `cloud_execution` → **Sale** (no espera)

**Import crítico:**
```python
from mesher_config import get_default_mesher  # ← Top-level import
```
⚠️ **Se cachea en `sys.modules` - requiere reinicio para actualizar**

### worker_monitor.py
**Responsabilidad:** Monitoreo y post-procesamiento

**Polling:** Cada 30 segundos
- Busca simulaciones con status `cloud_execution`
- Chequea estado en Inductiva

**Cuando task termina (SUCCESS):**
1. Descarga resultados de Inductiva
2. Genera archivos VTK/vtkjs para visualización
3. Copia a carpeta pública (`/tmp/uploads` o `public/uploads`)
4. Cambia status a `completed`

**Protección de memoria:**
- Procesa solo **1 simulación por ciclo** (previene OOM)
- Fuerza garbage collection después de cada sim

**Recovery mode:**
- Si encuentra sims en `post_processing` (huérfanas), las completa

## ⚠️ Notas Importantes

1. **Los workers se lanzan en background** con `nohup` para que persistan aunque cierres la terminal
2. **Cada worker tiene su propio log** (`worker_submit.log`, `worker_monitor.log`)
3. **Los scripts son seguros** - esperan a que los procesos terminen antes de limpiar
4. **La limpieza de caché es recursiva** - limpia todo el proyecto
5. **worker.py fue eliminado** - era obsoleto y bloqueante

## 🔧 Troubleshooting

**Problema: Worker no arranca**
```bash
# Ver errores en el log
cat worker_submit.log
cat worker_monitor.log

# Verificar que los archivos existen
ls -la worker_submit.py worker_monitor.py

# Verificar que Python 3 está disponible
python3 --version
```

**Problema: Workers no se paran**
```bash
# Forzar parada inmediata
pkill -KILL -f "python.*worker"

# Verificar que se pararon
ps aux | grep worker
```

**Problema: Caché no se limpia**
```bash
# Limpiar manualmente con permisos elevados si es necesario
sudo find . -type d -name "__pycache__" -exec rm -rf {} +
sudo find . -type f -name "*.pyc" -delete
```

**Problema: Simulaciones usan mesher antiguo**
```bash
# 1. Verificar que mesher_config.py tiene el valor correcto
grep DEFAULT_MESHER mesher_config.py

# 2. Verificar si .pyc está desactualizado
./checkWorkers.sh

# 3. Si .pyc es más viejo que .py, reiniciar workers
./startWorkers.sh

# 4. Verificar que se actualizó
./checkWorkers.sh
```

## 📚 Referencias

- Python module caching: https://docs.python.org/3/tutorial/modules.html#compiled-python-files
- Process management: `man pkill`, `man nohup`
- Pipeline architecture: Ver `QUICK_START.md`
