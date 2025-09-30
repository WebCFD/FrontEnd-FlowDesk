# Sistema de Pruebas de Integración con Inductiva API

## Descripción General

Este sistema permite probar la comunicación entre la aplicación web FlowDesk y la API de Inductiva para ejecutar cálculos computacionales en la nube. El sistema incluye:

1. **Frontend (React)**: Formulario para ingresar dos números y crear simulaciones de prueba
2. **Backend (Express)**: Endpoints API para gestionar simulaciones
3. **Worker (Python)**: Proceso que consume simulaciones pendientes y las procesa con Inductiva API
4. **Base de Datos (PostgreSQL)**: Almacena simulaciones y resultados

## Arquitectura del Sistema

```
[Frontend React] 
    ↓ POST /api/simulations/create-test
[Backend Express] → [PostgreSQL Database]
    ↓ GET /api/external/simulations/pending (polling cada 30s)
[Worker Python + Inductiva API]
    ↓ PATCH /api/external/simulations/:id/status
[Backend Express] → [PostgreSQL Database]
    ↓ Actualiza UI automáticamente via React Query
[Frontend React - Dashboard]
```

## Componentes Implementados

### 1. Base de Datos (shared/schema.ts)

Se añadió soporte para:
- `simulationType`: Campo que distingue entre "cfd_simulation" y "test_calculation"
- `result`: Campo JSON para almacenar resultados de cálculos
- `jsonConfig`: Campo JSON para almacenar configuración (numberA, numberB)

### 2. Frontend - Botón de Simulación (client/src/pages/dashboard/wizard-design.tsx)

- Modificado el botón "Run Simulation" para mostrar un diálogo con dos inputs
- Los usuarios pueden ingresar Number A y Number B
- Crea simulaciones con `simulationType: "test_calculation"`
- **No debita créditos** (cost = 0)

### 3. Backend - Endpoints API (server/routes.ts)

#### Endpoint Interno:
- `POST /api/simulations/create-test`: Crea una simulación de prueba

#### Endpoints Externos (para worker):
- `GET /api/external/simulations/pending`: Retorna simulaciones con status "pending"
- `PATCH /api/external/simulations/:id/status`: Actualiza el estado de una simulación

**Autenticación Externa**: Los endpoints externos requieren header `x-api-key: flowerpower-external-api`

### 4. Worker Python (worker.py)

Características:
- Polling cada 30 segundos para simulaciones pendientes
- Integración con Inductiva API
- Cálculo: `(Number A + Number B)²`
- Fallback local si Inductiva no está disponible
- Logging detallado de todas las operaciones

### 5. UI - Dashboard (client/src/pages/dashboard/index.tsx)

- Badge "Test" para simulaciones de prueba
- Muestra resultados: `(5 + 10)² = 225` (en verde si exitoso)
- Muestra errores en rojo si la simulación falla
- Estados visuales: Pending (gris), Processing (azul), Completed (verde), Failed (rojo)

## Configuración

### Variables de Entorno Requeridas

```bash
INDUCTIVA_API_KEY=<tu_api_key_de_inductiva>
```

### Instalación de Dependencias

Las dependencias Python ya están instaladas:
- `requests`: Para llamadas HTTP
- `inductiva`: SDK de Inductiva API

## Uso del Sistema

### Opción 1: Servidor y Worker por Separado

**Terminal 1 - Servidor Express:**
```bash
npm run dev
```

**Terminal 2 - Worker Python:**
```bash
python3 worker.py
```

### Opción 2: Script All-in-One (Recomendado)

```bash
./start-all.sh
```

Este script inicia tanto el servidor Express como el worker Python en paralelo.

## Flujo de Prueba

1. **Usuario accede al Dashboard** → Clic en "Start New Simulation"
2. **Wizard de Diseño** → Clic en "Run Simulation"
3. **Diálogo de Prueba** aparece pidiendo Number A y Number B
4. **Usuario ingresa** (ej: 5 y 10) → Clic en "Create Test Calculation"
5. **Backend crea** simulación con status "pending"
6. **Worker detecta** simulación pendiente (max 30 segundos)
7. **Worker procesa** cálculo con Inductiva: `(5 + 10)² = 225`
8. **Worker actualiza** status a "completed" con resultado
9. **Dashboard actualiza** automáticamente mostrando: `(5 + 10)² = 225`

## Verificación Manual

### 1. Verificar Servidor Express

```bash
curl http://localhost:5000/api/health
```

### 2. Verificar Endpoint Externo (Simulaciones Pendientes)

```bash
curl -H "x-api-key: flowerpower-external-api" \
     http://localhost:5000/api/external/simulations/pending
```

Respuesta esperada:
```json
{
  "success": true,
  "count": 0,
  "simulations": []
}
```

### 3. Verificar Worker Python

```bash
python3 worker.py
```

Debe mostrar:
```
[WORKER] [2025-09-30 XX:XX:XX] Worker starting...
[WORKER] [2025-09-30 XX:XX:XX] Connected to Inductiva API successfully...
[WORKER] [2025-09-30 XX:XX:XX] Worker ready. Polling for pending simulations...
```

### 4. Verificar Conexión con Inductiva

El worker automáticamente verifica la conexión y muestra información de la cuenta:
```
Name: <tu_nombre>
Credits: 5.00 US$
Plan: Individual
```

## Troubleshooting

### Worker no se conecta al servidor

**Problema**: `ERROR: Failed to fetch pending simulations. Status: 400`
**Solución**: Verificar que el orden de las rutas en `server/routes.ts` sea correcto. La ruta `/pending` debe estar **ANTES** de `/:id`.

### Worker no detecta simulaciones

**Problema**: Worker dice "No pending simulations found" pero hay simulaciones en la base de datos
**Solución**: 
1. Verificar que la API key sea correcta
2. Verificar que el status de la simulación sea exactamente "pending"
3. Revisar logs del servidor Express

### Inductiva API no responde

**Problema**: Worker usa fallback local en lugar de Inductiva
**Solución**:
1. Verificar que `INDUCTIVA_API_KEY` esté configurada correctamente
2. Verificar conectividad a internet
3. Verificar que la cuenta de Inductiva tenga créditos disponibles

### Simulación queda en "Processing" indefinidamente

**Problema**: Simulación no completa nunca
**Solución**:
1. Verificar logs del worker: `tail -f /tmp/worker_output.log` (si se usó nohup)
2. Verificar que el worker esté ejecutándose: `ps aux | grep worker.py`
3. Reiniciar worker si es necesario

## Estructura de Datos

### Simulación de Prueba (Database)

```json
{
  "id": 123,
  "name": "Test Calculation - 5 + 10",
  "simulationType": "test_calculation",
  "status": "pending", // "processing", "completed", "failed"
  "cost": 0,
  "jsonConfig": {
    "numberA": 5,
    "numberB": 10
  },
  "result": null, // Se llena al completar
  "createdAt": "2025-09-30T19:30:00Z",
  "updatedAt": "2025-09-30T19:30:00Z"
}
```

### Resultado Completado

```json
{
  "result": {
    "calculatedValue": 225,
    "formula": "(5 + 10)²",
    "numberA": 5,
    "numberB": 10,
    "processedAt": "2025-09-30T19:30:15Z",
    "processedWith": "local_fallback" // o null si usó Inductiva
  },
  "status": "completed"
}
```

## Próximos Pasos

1. **Integración Real con CFD**: Adaptar el worker para ejecutar simulaciones OpenFOAM reales con Inductiva
2. **Manejo de Archivos**: Subir archivos de geometría y configuración a Inductiva
3. **Visualización de Resultados**: Descargar y visualizar resultados VTK de simulaciones CFD
4. **Queue Management**: Implementar cola de prioridades para simulaciones
5. **Notificaciones**: Enviar emails cuando simulaciones completen

## Notas de Desarrollo

- El worker usa **local fallback** por defecto para cálculos matemáticos simples
- Inductiva está optimizado para **simulaciones físicas complejas** (CFD, FEA, etc.)
- Para simulaciones reales, se usarían los simuladores de Inductiva: OpenFOAM, XBeach, FVCOM, etc.
- El sistema de test sirve para **verificar la comunicación** entre componentes

## Contacto y Soporte

Para problemas con:
- **FlowDesk**: Contactar al equipo de desarrollo
- **Inductiva API**: https://docs.inductiva.ai/ o support@inductiva.ai
