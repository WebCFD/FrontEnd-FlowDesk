# Worker Management Scripts

Scripts para gestionar los procesos de worker y evitar problemas de caché de módulos Python.

## 📋 Problema Identificado

Cuando cambias `mesher_config.py` (o cualquier módulo Python importado), Python cachea el módulo en memoria con el valor ANTIGUO. Esto causa que:

- Las simulaciones usen configuraciones antiguas aunque el archivo haya cambiado
- Los workers no reflejen cambios en la configuración hasta que se reinicien
- Los archivos `.pyc` guarden bytecode desactualizado

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
4. 🚀 **Lanza** el worker en background con `nohup`
5. 📊 **Muestra** el estado del worker iniciado

**Salida del log:**
- El worker escribe a `worker.log`
- Puedes monitorear con: `tail -f worker.log`

### 2. `checkWorkers.sh` - Verificar Estado

**Uso:**
```bash
./checkWorkers.sh
```

**Qué muestra:**
1. 🔍 **Procesos de worker** activos (PID, CPU, memoria)
2. 📄 **Log del worker** (tamaño, últimas entradas)
3. ⚙️ **Configuración actual** del mesher
4. 🗂️ **Estado de la caché** de Python
5. ⏰ **Comparación de timestamps** entre `.py` y `.pyc`

**Ejemplo de salida:**
```
[1] Worker Processes:
✓ Worker processes found:
  PID: 12345  CPU: 2.1%  MEM: 1.3%  START: 10:30    CMD: python3 worker.py

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
tail -f worker.log
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
ps aux | grep "python.*worker.py"

# Parar workers
pkill -f "python.*worker.py"

# Limpiar caché Python
find . -type d -name "__pycache__" -exec rm -rf {} +
find . -type f -name "*.pyc" -delete

# Lanzar worker manualmente
nohup python3 worker.py > worker.log 2>&1 &

# Ver logs en tiempo real
tail -f worker.log
```

## ⚠️ Notas Importantes

1. **Los workers se lanzan en background** con `nohup` para que persistan aunque cierres la terminal
2. **Los logs se escriben en `worker.log`** en el directorio actual
3. **Los scripts son seguros** - esperan a que los procesos terminen antes de limpiar
4. **La limpieza de caché es recursiva** - limpia todo el proyecto

## 🔧 Troubleshooting

**Problema: Worker no arranca**
```bash
# Ver errores en el log
cat worker.log

# Verificar que worker.py existe
ls -la worker.py

# Verificar que Python 3 está disponible
python3 --version
```

**Problema: Workers no se paran**
```bash
# Forzar parada inmediata
pkill -KILL -f "python.*worker.py"

# Verificar que se pararon
ps aux | grep worker
```

**Problema: Caché no se limpia**
```bash
# Limpiar manualmente con permisos elevados si es necesario
sudo find . -type d -name "__pycache__" -exec rm -rf {} +
sudo find . -type f -name "*.pyc" -delete
```

## 📚 Referencias

- Python module caching: https://docs.python.org/3/tutorial/modules.html#compiled-python-files
- Process management: `man pkill`, `man nohup`
