#!/bin/bash

# Production Supervisor - Auto-restart para Express + Workers Python
# Este script supervisa y reinicia automáticamente los procesos si fallan

set -e

LOG_DIR="production_logs"
HEARTBEAT_DIR="/tmp/worker_heartbeats"
CHECK_INTERVAL=30  # Verificar cada 30 segundos

# Crear directorios necesarios
mkdir -p "$LOG_DIR"
mkdir -p "$HEARTBEAT_DIR"

echo "========================================="
echo "Production Supervisor v1.0"
echo "Intervalo de verificación: ${CHECK_INTERVAL}s"
echo "Logs en: $LOG_DIR/"
echo "Heartbeats en: $HEARTBEAT_DIR/"
echo "========================================="
echo ""

# Función para log con timestamp
log() {
    echo "[SUPERVISOR] [$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Función para verificar si un proceso está corriendo
is_running() {
    local process_pattern=$1
    pgrep -f "$process_pattern" > /dev/null 2>&1
    return $?
}

# Función para iniciar un proceso
start_process() {
    local name=$1
    local command=$2
    local log_file="$LOG_DIR/${name}.log"
    
    log "Iniciando $name..."
    
    # Ejecutar comando en background con logs
    nohup bash -c "$command" >> "$log_file" 2>&1 &
    
    # Esperar un momento para verificar inicio
    sleep 2
    
    # Obtener patrón de proceso según el nombre
    local pattern
    case $name in
        "express")
            pattern="node dist/index.js"
            ;;
        "worker_submit")
            pattern="worker_submit.py"
            ;;
        "worker_monitor")
            pattern="worker_monitor.py"
            ;;
    esac
    
    if is_running "$pattern"; then
        local pid=$(pgrep -f "$pattern" | head -1)
        log "✅ $name iniciado correctamente (PID: $pid)"
    else
        log "❌ Error al iniciar $name - revisar logs en $log_file"
    fi
}

# Función para verificar y reiniciar si es necesario
check_and_restart() {
    local name=$1
    local process_pattern=$2
    local command=$3
    
    if is_running "$process_pattern"; then
        local pid=$(pgrep -f "$process_pattern" | head -1)
        log "✅ $name está corriendo (PID: $pid)"
    else
        log "⚠️  $name NO está corriendo. Reiniciando..."
        start_process "$name" "$command"
    fi
}

# Función para cleanup al salir
cleanup() {
    log "Señal de terminación recibida. Deteniendo procesos..."
    
    # Matar procesos hijos
    pkill -P $$ 2>/dev/null || true
    
    # Matar procesos específicos
    pkill -f "node dist/index.js" 2>/dev/null || true
    pkill -f "worker_submit.py" 2>/dev/null || true
    pkill -f "worker_monitor.py" 2>/dev/null || true
    
    log "Todos los procesos detenidos"
    exit 0
}

# Capturar señales de terminación
trap cleanup SIGTERM SIGINT

# ====== INICIALIZACIÓN ======

log "Iniciando todos los procesos..."

# Iniciar Express (Node.js)
start_process "express" "NODE_ENV=production node dist/index.js"

# Iniciar Worker Submit (Python)
start_process "worker_submit" "python3 -u worker_submit.py"

# Iniciar Worker Monitor (Python)
start_process "worker_monitor" "python3 -u worker_monitor.py"

echo ""
log "Todos los procesos iniciados. Entrando en modo supervisión..."
echo ""

# ====== LOOP DE SUPERVISIÓN ======

while true; do
    log "--- Verificación de procesos ---"
    
    # Verificar Express
    check_and_restart "express" "node dist/index.js" "NODE_ENV=production node dist/index.js"
    
    # Verificar Worker Submit
    check_and_restart "worker_submit" "worker_submit.py" "python3 -u worker_submit.py"
    
    # Verificar Worker Monitor
    check_and_restart "worker_monitor" "worker_monitor.py" "python3 -u worker_monitor.py"
    
    echo ""
    log "Próxima verificación en ${CHECK_INTERVAL} segundos..."
    echo ""
    
    sleep "$CHECK_INTERVAL"
done
