# Guía para Eliminar la Protección Temporal con Contraseña

## ⚠️ IMPORTANTE
Esta funcionalidad es **TEMPORAL** y debe ser eliminada próximamente.

## ¿Qué hace esta funcionalidad?
Requiere que los usuarios introduzcan la contraseña "jrm2025" antes de lanzar cualquier simulación (test o normal).

## ¿Cómo eliminarla?

### 1. Frontend (client/src/pages/dashboard/wizard-design.tsx)

Buscar y eliminar todos los bloques marcados con:
```
// ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
```

**Específicamente:**

#### A. Eliminar el estado de contraseña (línea ~327):
```typescript
// ELIMINAR ESTAS LÍNEAS:
// ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
// Estado para la contraseña de lanzamiento de simulaciones
// Esta funcionalidad será eliminada próximamente
const [simulationPassword, setSimulationPassword] = useState("");
```

#### B. Eliminar el reset de contraseña en handleStartSimulation (línea ~2807-2809):
```typescript
// ELIMINAR ESTAS LÍNEAS:
// ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
// Limpiar contraseña cuando se abre el diálogo
setSimulationPassword("");
```

#### C. Eliminar el password del body en handleCreateHVACSimulation (línea ~2821-2835):
```typescript
// CAMBIAR ESTO:
body: JSON.stringify({
  name: `HVAC ${selectedSimulationType === 'comfortTest' ? 'Comfort TEST' : 'Comfort 30 ITERATIONS'} - ${simulationData.case_name}`,
  simulationType: selectedSimulationType,
  status: "pending",
  jsonConfig: simulationData,
  password: simulationPassword, // TEMPORARY: contraseña de lanzamiento
}),

// POR ESTO:
body: JSON.stringify({
  name: `HVAC ${selectedSimulationType === 'comfortTest' ? 'Comfort TEST' : 'Comfort 30 ITERATIONS'} - ${simulationData.case_name}`,
  simulationType: selectedSimulationType,
  status: "pending",
  jsonConfig: simulationData,
}),
```

#### D. Eliminar el reset de contraseña en el finally de handleCreateHVACSimulation (línea ~2872-2874):
```typescript
// ELIMINAR ESTAS LÍNEAS:
// ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
// Limpiar contraseña después de intentar crear la simulación
setSimulationPassword("");
```

#### E. Eliminar el password del body en handleConfirmCreateSimulation (línea ~3097-3111):
```typescript
// CAMBIAR ESTO:
body: JSON.stringify({
  name: simulationName,
  simulationType,
  status: simulationStatus,
  jsonConfig: exportData,
  password: simulationPassword, // TEMPORARY: contraseña de lanzamiento
}),

// POR ESTO:
body: JSON.stringify({
  name: simulationName,
  simulationType,
  status: simulationStatus,
  jsonConfig: exportData,
}),
```

#### F. Eliminar el reset de contraseña en el finally de handleConfirmCreateSimulation (línea ~3161-3163):
```typescript
// ELIMINAR ESTAS LÍNEAS:
// ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
// Limpiar contraseña después de intentar crear la simulación
setSimulationPassword("");
```

#### G. Eliminar el campo de contraseña del diálogo (línea ~4242-4243 y 4277-4288):
```typescript
// ELIMINAR ESTAS LÍNEAS:
{/* ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ========== */}
{/* Este diálogo incluye un campo de contraseña temporal que será eliminado próximamente */}

// Y TAMBIÉN ELIMINAR:
{/* TEMPORARY: Campo de contraseña - será eliminado próximamente */}
<div className="space-y-2 mt-4">
  <Label htmlFor="simulation-password">Launch Password</Label>
  <Input
    id="simulation-password"
    type="password"
    value={simulationPassword}
    onChange={(e) => setSimulationPassword(e.target.value)}
    placeholder="Enter password to launch simulation"
    data-testid="input-simulation-password"
  />
</div>
```

### 2. Backend (server/routes.ts)

Buscar y eliminar todos los bloques marcados con:
```
// ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
```

**Específicamente:**

#### A. Eliminar el import de crypto (líneas ~12-15):
```typescript
// ELIMINAR ESTAS LÍNEAS:
// ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
// Importar crypto para validación de contraseña con hash SHA-256
// Esta funcionalidad será eliminada próximamente
import crypto from "crypto";
```

#### B. Eliminar la validación de contraseña en /api/simulations/create (líneas ~102-131):
```typescript
// ELIMINAR TODO ESTE BLOQUE:
// ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
// Validar contraseña de lanzamiento de simulaciones
// Esta funcionalidad será eliminada próximamente
// CÓMO ELIMINAR: Borrar este bloque completo (líneas con comentario TEMPORARY PASSWORD PROTECTION)
const { password } = req.body;

// Hash SHA-256 de la contraseña correcta "jrm2025"
const CORRECT_PASSWORD_HASH = "8f3b46c3ef573e0ee44dd2ac6f60ec30b72e05f0e7d14ba68b5f3b3d7c3e8a8d";

// Validar que se proporcionó una contraseña
if (!password || typeof password !== 'string') {
  console.log('[EXPRESS] Password validation failed: No password provided');
  return res.status(403).json({ 
    message: "Simulation launch password is required" 
  });
}

// Calcular hash de la contraseña proporcionada
const providedPasswordHash = crypto.createHash('sha256').update(password).digest('hex');

// Comparar hashes
if (providedPasswordHash !== CORRECT_PASSWORD_HASH) {
  console.log('[EXPRESS] Password validation failed: Incorrect password');
  return res.status(403).json({ 
    message: "Incorrect simulation launch password" 
  });
}

console.log('[EXPRESS] Password validation successful');
// ========== FIN DE TEMPORARY PASSWORD PROTECTION ==========
```

### 3. Documentación (ESTE ARCHIVO)

Eliminar el archivo completo:
```bash
rm TEMPORARY_PASSWORD_REMOVAL_GUIDE.md
```

## Resumen rápido

**Total de cambios necesarios:**
- Frontend: 7 secciones a eliminar en `client/src/pages/dashboard/wizard-design.tsx`
- Backend: 2 secciones a eliminar en `server/routes.ts`
- Documentación: Eliminar este archivo

**Tiempo estimado:** 10-15 minutos

## Verificación

Después de eliminar todo, verificar que:
1. ✅ Las simulaciones se pueden lanzar sin pedir contraseña
2. ✅ No quedan referencias a "password" en los bodies de las peticiones
3. ✅ No hay errores de compilación en TypeScript
4. ✅ La aplicación se reinicia correctamente

## Datos técnicos (para referencia)

- **Contraseña original:** jrm2025
- **Hash SHA-256:** 8191b44b3d4d4ff5e364574f5d8e08ad6d59a9f8fa6706ea7d4b137d8a683719
- **Método de validación:** Comparación de hashes en el backend
- **Endpoint afectado:** POST /api/simulations/create
