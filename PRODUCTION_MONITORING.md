# 📊 Production Monitoring & Deployment Guide

## 🎯 Overview

Este sistema implementa monitoreo y auto-restart para la aplicación en producción. Consta de 3 componentes principales que deben correr simultáneamente:

1. **Express Server** (Node.js) - Frontend + Backend API
2. **Worker Submit** (Python) - Procesa y envía simulaciones a Inductiva
3. **Worker Monitor** (Python) - Monitorea progreso de simulaciones en la nube

---

## 🏗️ Arquitectura de la Solución

### Componentes

```
┌─────────────────────────────────────────┐
│  start-production.sh (Supervisor)       │
│  - Auto-restart cada 30 segundos        │
│  - Logs separados por proceso           │
│  - Detección automática de fallos      │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
┌────────┐ ┌───────┐ ┌───────┐
│Express │ │Worker │ │Worker │
│        │ │Submit │ │Monitor│
└────────┘ └───────┘ └───────┘
```

### Características

✅ **Auto-restart automático** - Si un proceso falla, se reinicia en máximo 30 segundos  
✅ **Health check endpoint** - Verifica estado de todos los procesos vía HTTP  
✅ **Logs estructurados** - Cada proceso escribe con prefijo identificable  
✅ **Monitoreo desde navegador** - Sin necesidad de acceso SSH  
✅ **Alta disponibilidad** - Downtime mínimo en caso de fallos  

---

## 🚀 Configuración de Deployment

### Paso 1: Modificar `.replit`

**IMPORTANTE:** Debes modificar manualmente el archivo `.replit` para usar el script de producción:

```toml
[deployment]
deploymentTarget = "cloudrun"
build = ["npm", "run", "build"]
run = ["bash", "start-production.sh"]  # ← Cambiar esta línea
```

**Antes:**
```toml
run = ["npm", "run", "start"]
```

**Después:**
```toml
run = ["bash", "start-production.sh"]
```

### Paso 2: Verificar permisos

El script ya tiene permisos de ejecución, pero si tienes problemas ejecuta:

```bash
chmod +x start-production.sh
```

### Paso 3: Deploy

Una vez modificado `.replit`, publica normalmente:

1. Publishing tool → Overview
2. Click "Publish" o "Republish"
3. Espera 1-2 minutos

---

## 🔍 Cómo Monitorear en Producción

### Método 1: Health Check Endpoint (Recomendado) ⭐

**URL:** `https://tu-app.replit.app/api/health/workers`

**Respuesta cuando todo está OK (HTTP 200):**
```json
{
  "express": {
    "status": "running",
    "uptime": 3600.5,
    "timestamp": "2024-11-07T20:45:30.123Z"
  },
  "worker_submit": {
    "status": "running",
    "pid": 1234,
    "lastSeen": "2024-11-07T20:45:30.123Z"
  },
  "worker_monitor": {
    "status": "running",
    "pid": 1235,
    "lastSeen": "2024-11-07T20:45:30.123Z"
  },
  "system": {
    "nodeVersion": "v20.x.x",
    "platform": "linux",
    "memory": {
      "used": 150,
      "total": 512,
      "unit": "MB"
    }
  }
}
```

**Respuesta cuando hay problemas (HTTP 503):**
```json
{
  "express": {
    "status": "running",
    "uptime": 3600.5,
    "timestamp": "2024-11-07T20:45:30.123Z"
  },
  "worker_submit": {
    "status": "stopped",  // ← Worker caído
    "lastSeen": "2024-11-07T20:45:30.123Z"
  },
  "worker_monitor": {
    "status": "running",
    "pid": 1235,
    "lastSeen": "2024-11-07T20:45:30.123Z"
  },
  ...
}
```

**Estados posibles:**
- `running` - Proceso corriendo normalmente ✅
- `stopped` - Proceso caído, el supervisor lo reiniciará ⚠️
- `error` - Error al verificar estado ❌
- `unknown` - Estado desconocido ❓

---

### Método 2: Logs en Publishing Tool

**Acceso:** Workspace → Publishing tool → Logs tab

**Buscar por proceso:**

| Buscar | Para ver |
|--------|----------|
| `[EXPRESS]` | Logs del servidor Node.js |
| `[WORKER_SUBMIT]` | Logs del worker de envío |
| `[WORKER_MONITOR]` | Logs del worker de monitoreo |
| `[SUPERVISOR]` | Logs del supervisor (reinicio de procesos) |

**Ejemplo de logs normales:**
```
[SUPERVISOR] [2024-11-07 20:45:00] ✅ express está corriendo (PID: 1233)
[SUPERVISOR] [2024-11-07 20:45:00] ✅ worker_submit está corriendo (PID: 1234)
[SUPERVISOR] [2024-11-07 20:45:00] ✅ worker_monitor está corriendo (PID: 1235)
[WORKER_SUBMIT] [2024-11-07 20:45:05] INFO - Found 2 HVAC simulations to process
[WORKER_MONITOR] [2024-11-07 20:45:10] INFO - Checking task status for task_abc123
```

**Ejemplo de logs con reinicio automático:**
```
[SUPERVISOR] [2024-11-07 20:45:00] ⚠️ worker_submit NO está corriendo. Reiniciando...
[SUPERVISOR] [2024-11-07 20:45:02] ✅ worker_submit iniciado correctamente (PID: 1236)
[WORKER_SUBMIT] [2024-11-07 20:45:03] INFO - Worker Submit started
```

---

### Método 3: Monitoreo de Recursos

**Acceso:** Workspace → Publishing tool → Resources tab

**Indicadores de salud:**

- **CPU Utilization:** Debería estar entre 5-30% en estado normal
- **Memory Utilization:** Debería estar entre 100-400 MB
- **Picos de CPU/RAM:** Normales durante procesamiento de simulaciones

**🚨 Señales de alerta:**
- CPU al 100% sostenido → Posible loop infinito
- Memoria creciendo constantemente → Memory leak
- CPU/RAM en 0% → Todos los procesos caídos

---

## 🔧 Troubleshooting

### Problema: Workers no aparecen como "running"

**Síntomas:**
- Health check muestra `status: "stopped"`
- No hay logs con prefijo `[WORKER_SUBMIT]` o `[WORKER_MONITOR]`

**Solución:**
1. Verifica logs del supervisor: Busca `[SUPERVISOR]` en Logs tab
2. El supervisor los reiniciará automáticamente en 30 segundos
3. Si persiste, hacer "Republish"

---

### Problema: Simulaciones quedan en "pending"

**Síntomas:**
- Simulaciones creadas pero nunca avanzan
- Health check muestra `worker_submit` stopped

**Solución:**
1. Verifica health check: `/api/health/workers`
2. Si worker_submit está stopped, espera 30 segundos (auto-restart)
3. Verifica logs: Busca errores con `[WORKER_SUBMIT]`
4. Último recurso: Republish

---

### Problema: Simulaciones no completan

**Síntomas:**
- Simulaciones en "cloud_execution" pero nunca completan
- Health check muestra `worker_monitor` stopped

**Solución:**
1. Verifica health check: `/api/health/workers`
2. Si worker_monitor está stopped, espera 30 segundos
3. Verifica logs: Busca errores con `[WORKER_MONITOR]`

---

### Problema: Todo está caído

**Síntomas:**
- App no responde
- Health check endpoint no responde

**Solución:**
1. Ir a Publishing tool → Overview
2. Click "Republish"
3. Esperar 1-2 minutos
4. Verificar health check endpoint

---

## 📝 Logs Estructurados - Guía de Prefijos

Cada proceso escribe logs con un prefijo único para facilitar debugging:

| Prefijo | Proceso | Ejemplo |
|---------|---------|---------|
| `[EXPRESS]` | Servidor Node.js | `[EXPRESS] POST /api/simulations/create 201` |
| `[WORKER_SUBMIT]` | Worker de envío | `[WORKER_SUBMIT] [2024-11-07 20:45:05] INFO - Processing simulation 123` |
| `[WORKER_MONITOR]` | Worker de monitoreo | `[WORKER_MONITOR] [2024-11-07 20:45:10] INFO - Task completed` |
| `[SUPERVISOR]` | Script supervisor | `[SUPERVISOR] [2024-11-07 20:45:00] ✅ express está corriendo` |

---

## 🔄 Comportamiento de Auto-Restart

### Escenarios

**Escenario 1: Worker Submit se cae**
```
1. Worker Submit crash (por error en código, falta memoria, etc.)
2. Supervisor detecta ausencia en próxima verificación (máx 30s)
3. Supervisor ejecuta: python3 -u worker_submit.py
4. Worker Submit reinicia y continúa procesando
5. Total downtime: ~30 segundos
```

**Escenario 2: Express se cae**
```
1. Express crash
2. Supervisor detecta ausencia (máx 30s)
3. Supervisor ejecuta: node dist/index.js
4. Express reinicia
5. Total downtime: ~30 segundos
```

**Escenario 3: Todo se cae**
```
1. Deployment completo falla (out of memory, etc.)
2. Replit reinicia el deployment automáticamente
3. start-production.sh se ejecuta desde cero
4. Todos los procesos inician juntos
5. Total downtime: ~1-2 minutos
```

---

## 📊 Métricas de Rendimiento Esperadas

### En funcionamiento normal

| Métrica | Valor esperado |
|---------|----------------|
| Uptime Express | >99% |
| Tiempo de recuperación | <30 segundos |
| Uso CPU (idle) | 5-10% |
| Uso RAM (idle) | 100-200 MB |
| Uso CPU (procesando) | 20-50% |
| Uso RAM (procesando) | 200-400 MB |

---

## 🧪 Testing Local

Para probar el sistema localmente antes de deployment:

```bash
# 1. Build la aplicación
npm run build

# 2. Ejecutar el supervisor
./start-production.sh

# 3. En otra terminal, verificar health check
curl http://localhost:5000/api/health/workers

# 4. Verificar logs
tail -f production_logs/express.log
tail -f production_logs/worker_submit.log
tail -f production_logs/worker_monitor.log

# 5. Detener todo
# Presiona Ctrl+C en la terminal donde corre start-production.sh
```

---

## ⚠️ Limitaciones Conocidas

1. **No hay acceso SSH en deployments** - Solo puedes monitorear vía logs y health check
2. **Reinicio manual requiere Republish** - No hay botón de "restart" individual
3. **Logs limitados** - Replit solo muestra los logs más recientes (últimas horas/días)
4. **Sin alertas automáticas** - Debes verificar health check manualmente

---

## 💡 Mejores Prácticas

### Para Monitoreo Proactivo

1. **Check diario del health endpoint** - Añádelo a tus favoritos
2. **Revisar logs semanalmente** - Busca patrones de errores
3. **Monitorear Resources tab** - Detecta tendencias de uso
4. **Documentar incidentes** - Ayuda a identificar problemas recurrentes

### Para Desarrollo

1. **Probar localmente primero** - Usa `./start-production.sh` antes de deployar
2. **Logs estructurados** - Mantén los prefijos consistentes
3. **Testing de fallos** - Mata procesos manualmente para verificar auto-restart
4. **Versionado** - Documenta cambios en el supervisor

---

## 🔗 Enlaces Rápidos

- **Health Check:** `https://tu-app.replit.app/api/health/workers`
- **Publishing Tool:** Workspace → Publishing (Tool dock izquierdo)
- **Logs:** Publishing tool → Logs tab
- **Resources:** Publishing tool → Resources tab

---

## 📞 Soporte

Si encuentras problemas no cubiertos en esta guía:

1. Verifica logs con todos los prefijos (`[SUPERVISOR]`, `[WORKER_*]`, `[EXPRESS]`)
2. Revisa Resources tab para detectar problemas de recursos
3. Intenta Republish como último recurso
4. Contacta soporte de Replit si el problema persiste

---

**Última actualización:** 7 de Noviembre, 2024  
**Versión:** 1.0  
**Autor:** Sistema de monitoreo automático
