#!/bin/bash

# Production Supervisor - Auto-restart para Express + Workers Python
# Este script supervisa y reinicia automáticamente los procesos si fallan

set -e

LOG_DIR="production_logs"
HEARTBEAT_DIR="/tmp/worker_heartbeats"
CHECK_INTERVAL=60  # Verificar cada 60 segundos (1 minuto)
CHECKS_PER_HOUR=60  # Loguear solo cada hora (60 checks)

# Contador de checks y estado previo de procesos
CHECK_COUNT=0
declare -A PREV_STATE  # Track previous state: running/stopped

# Crear directorios necesarios
mkdir -p "$LOG_DIR"
mkdir -p "$HEARTBEAT_DIR"

echo "========================================="
echo "Production Supervisor v2.0 (Optimized Logging)"
echo "Intervalo de verificación: ${CHECK_INTERVAL}s (cada minuto)"
echo "Logs normales: Cada hora"
echo "Logs de crashes/reinicios: Inmediatos"
echo "Logs en: $LOG_DIR/"
echo "========================================="
echo ""

# Función para log con timestamp
log() {
    echo "[SUPERVISOR] [$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Función para log silencioso (solo si forzado o cada hora)
log_quiet() {
    local message=$1
    local force=${2:-false}  # Si es true, siempre loguea
    
    if [ "$force" = true ] || [ $CHECK_COUNT -eq 0 ]; then
        log "$message"
    fi
}

# Función para verificar si un proceso está corriendo
is_running() {
    local process_pattern=$1
    pgrep -f "$process_pattern" > /dev/null 2>&1
    return $?
}

# Función para matar procesos zombie con shutdown graceful
kill_process() {
    local process_pattern=$1
    local name=$2
    
    # Buscar procesos con el patrón
    local pids=$(pgrep -f "$process_pattern")
    
    if [ -n "$pids" ]; then
        log "🧹 Detectados procesos zombie de $name: $pids - intentando shutdown graceful..."
        
        # Paso 1: Intentar SIGTERM (graceful shutdown)
        pkill -TERM -f "$process_pattern" 2>/dev/null || true
        
        # Paso 2: Esperar 3 segundos para shutdown graceful
        sleep 3
        
        # Paso 3: Verificar si el proceso todavía existe
        local remaining_pids=$(pgrep -f "$process_pattern")
        
        if [ -n "$remaining_pids" ]; then
            log "⚠️  Procesos no respondieron a SIGTERM, escalando a SIGKILL: $remaining_pids"
            pkill -9 -f "$process_pattern" 2>/dev/null || true
            sleep 1  # Esperar a que se libere el puerto
        else
            log "✅ Shutdown graceful exitoso"
        fi
    fi
}

# Función para iniciar un proceso
start_process() {
    local name=$1
    local command=$2
    local log_file="$LOG_DIR/${name}.log"
    
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
    
    # IMPORTANTE: Matar procesos zombie ANTES de iniciar nuevo proceso
    kill_process "$pattern" "$name"
    
    log "Iniciando $name..."
    
    # Ejecutar comando en background con logs
    nohup bash -c "$command" >> "$log_file" 2>&1 &
    
    # Esperar un momento para verificar inicio
    sleep 2
    
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
    
    local current_state
    local prev_state="${PREV_STATE[$name]:-unknown}"
    
    if is_running "$process_pattern"; then
        local pid=$(pgrep -f "$process_pattern" | head -1)
        current_state="running"
        
        # Si estaba detenido y ahora corre → CRASH RECOVERY (loguear)
        if [ "$prev_state" = "stopped" ]; then
            log "🔄 $name se recuperó automáticamente (PID: $pid)"
        else
            # Estado normal: solo loguear cada hora
            log_quiet "✅ $name está corriendo (PID: $pid)"
        fi
    else
        current_state="stopped"
        
        # Si estaba corriendo y ahora NO → CRASH (loguear siempre)
        if [ "$prev_state" = "running" ] || [ "$prev_state" = "unknown" ]; then
            log "🚨 CRASH DETECTADO: $name NO está corriendo. Reiniciando..."
        fi
        
        start_process "$name" "$command"
    fi
    
    # Guardar estado actual para próxima verificación
    PREV_STATE[$name]=$current_state
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
start_process "worker_submit" "NODE_ENV=production python3 -u worker_submit.py"

# Iniciar Worker Monitor (Python)
start_process "worker_monitor" "NODE_ENV=production python3 -u worker_monitor.py"

echo ""
log "Todos los procesos iniciados. Entrando en modo supervisión..."
echo ""

# ====== LOOP DE SUPERVISIÓN ======

# Inicializar estados como "running" (acaban de iniciarse)
PREV_STATE["express"]="running"
PREV_STATE["worker_submit"]="running"
PREV_STATE["worker_monitor"]="running"

while true; do
    # Log de verificación solo cada hora
    if [ $CHECK_COUNT -eq 0 ]; then
        echo ""
        log "--- Verificación de procesos (log cada hora) ---"
    fi
    
    # Verificar Express
    check_and_restart "express" "node dist/index.js" "NODE_ENV=production node dist/index.js"
    
    # Verificar Worker Submit
    check_and_restart "worker_submit" "worker_submit.py" "NODE_ENV=production python3 -u worker_submit.py"
    
    # Verificar Worker Monitor
    check_and_restart "worker_monitor" "worker_monitor.py" "NODE_ENV=production python3 -u worker_monitor.py"
    
    # Incrementar contador y resetear cada hora
    CHECK_COUNT=$((CHECK_COUNT + 1))
    if [ $CHECK_COUNT -ge $CHECKS_PER_HOUR ]; then
        CHECK_COUNT=0
        log "📊 Verificación horaria completada. Todo operativo."
        echo ""
    fi
    
    sleep "$CHECK_INTERVAL"
done
