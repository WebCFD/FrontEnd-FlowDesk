#!/bin/bash

# Production Supervisor - Auto-restart para Express + Workers Python
# Este script supervisa y reinicia automáticamente los procesos si fallan

set -e

# ✅ CRITICAL: Export NODE_ENV globally so ALL processes see it
export NODE_ENV=production

# ✅ CRITICAL: Force Python to use UTF-8 encoding (fixes Cloud Run locale issues)
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8
export LANG=C.UTF-8

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
    
    # Ejecutar comando en background: tee a log file Y a stdout del supervisor
    # (stdout del supervisor es capturado por Cloud Run → visible en deployment logs)
    ( bash -c "$command" 2>&1 | tee -a "$log_file" ) &
    
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

# ── Python environment check ───────────────────────────────────────────────
log "Verificando entorno Python (pyvista, scipy, numpy)..."
if python3 -c "import pyvista, scipy, numpy" 2>/dev/null; then
    log "✅ Python: pyvista, scipy, numpy disponibles"
else
    log "⚠️  Paquetes Python faltantes — instalando (esto puede tardar varios minutos)..."
    if python3 -m pip install --quiet --no-warn-script-location \
        "pyvista>=0.44.0" "scipy>=1.11.0" "numpy>=1.26.0" \
        "pandas>=2.2.0" "requests>=2.32.5" "pillow>=11.3.0" \
        "reportlab>=4.4.4" "matplotlib>=3.10.7" "boto3>=1.41.5" \
        "pythermalcomfort>=3.8.0" "botocore>=1.41.5" 2>&1; then
        # Re-validate after install — confirm packages are actually importable
        if python3 -c "import pyvista, scipy, numpy" 2>/dev/null; then
            log "✅ Python packages instalados y verificados correctamente"
        else
            log "❌ CRÍTICO: pip install OK pero import sigue fallando — step05 fallará para todas las simulaciones"
        fi
    else
        log "❌ CRÍTICO: pip install falló — step05 fallará para todas las simulaciones"
    fi
fi

# Iniciar Express (Node.js)
start_process "express" "node dist/index.js"

# Iniciar Worker Submit (Python)
start_process "worker_submit" "python3 -u worker_submit.py"

# Iniciar Worker Monitor (Python)
start_process "worker_monitor" "python3 -u worker_monitor.py"

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
    check_and_restart "express" "node dist/index.js" "node dist/index.js"
    
    # Verificar Worker Submit
    check_and_restart "worker_submit" "worker_submit.py" "python3 -u worker_submit.py"
    
    # Verificar Worker Monitor
    check_and_restart "worker_monitor" "worker_monitor.py" "python3 -u worker_monitor.py"
    
    # Incrementar contador y resetear cada hora
    CHECK_COUNT=$((CHECK_COUNT + 1))
    if [ $CHECK_COUNT -ge $CHECKS_PER_HOUR ]; then
        CHECK_COUNT=0
        log "📊 Verificación horaria completada. Todo operativo."
        echo ""
    fi
    
    sleep "$CHECK_INTERVAL"
done
