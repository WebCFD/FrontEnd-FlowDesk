#!/bin/bash

# Worker Supervisor - Vigila y relanza workers automáticamente
# Uso: ./supervisor_workers.sh

LOG_DIR="worker_logs"
CHECK_INTERVAL=60  # Segundos entre verificaciones

# Crear directorio de logs
mkdir -p "$LOG_DIR"

echo "========================================="
echo "Worker Supervisor iniciado"
echo "Intervalo de verificación: ${CHECK_INTERVAL}s"
echo "Logs en: $LOG_DIR/"
echo "========================================="
echo ""

# Función para verificar si un proceso está corriendo
is_running() {
    local script_name=$1
    pgrep -f "python3 $script_name" > /dev/null 2>&1
    return $?
}

# Función para iniciar un worker
start_worker() {
    local script_name=$1
    local log_file="$LOG_DIR/${script_name%.py}.log"
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando $script_name..."
    nohup python3 "$script_name" >> "$log_file" 2>&1 &
    
    # Esperar un momento y verificar que inició correctamente
    sleep 2
    if is_running "$script_name"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $script_name iniciado correctamente (PID: $(pgrep -f "python3 $script_name"))"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Error al iniciar $script_name"
    fi
}

# Función para verificar y relanzar si es necesario
check_and_restart() {
    local script_name=$1
    
    if is_running "$script_name"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $script_name está corriendo (PID: $(pgrep -f "python3 $script_name"))"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $script_name no está corriendo. Relanzando..."
        start_worker "$script_name"
    fi
}

# Lanzar workers inicialmente
echo "Iniciando workers por primera vez..."
start_worker "worker_submit.py"
start_worker "worker_monitor.py"
echo ""

# Loop infinito de verificación
echo "Supervisor activo. Presiona Ctrl+C para detener."
echo ""

while true; do
    echo "--- Verificación: $(date '+%Y-%m-%d %H:%M:%S') ---"
    
    check_and_restart "worker_submit.py"
    check_and_restart "worker_monitor.py"
    
    echo ""
    echo "Próxima verificación en ${CHECK_INTERVAL} segundos..."
    echo ""
    
    sleep "$CHECK_INTERVAL"
done
