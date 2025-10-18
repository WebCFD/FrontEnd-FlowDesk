#!/bin/bash

# Detener todos los workers y el supervisor
echo "Deteniendo workers y supervisor..."

# Detener supervisor
if pgrep -f "supervisor_workers.sh" > /dev/null; then
    echo "Deteniendo supervisor..."
    pkill -f "supervisor_workers.sh"
    echo "✅ Supervisor detenido"
fi

# Detener workers
if pgrep -f "python3 worker_" > /dev/null; then
    echo "Deteniendo workers..."
    pkill -f "python3 worker_"
    sleep 2
    echo "✅ Workers detenidos"
else
    echo "ℹ️  No hay workers corriendo"
fi

echo ""
echo "Todos los procesos detenidos"
