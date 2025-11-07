# Cómo Reducir el Tamaño del Deployment (< 8GB)

## Problema
El deployment falla con error: "The deployment image size exceeds the 8 GiB limit"

## Solución: Configurar Exclusiones en `.replit`

### Paso 1: Editar `.replit` Manualmente

Abre el archivo `.replit` y agrega esta configuración **ANTES** de la sección `[deployment]`:

```toml
# Excluir directorios grandes del deployment
[packager]
ignoredPaths = [
  ".git",
  ".cache",
  ".pythonlibs",
  "node_modules",
  "cases",
  "inductiva_output",
  "simulations",
  "worker_logs",
  "production_logs",
  "attached_assets",
  "src",
  "client/src"
]
```

### Paso 2: Archivo `.gcloudignore` (Ya Creado)

El archivo `.gcloudignore` ya está configurado para excluir:
- Archivos de desarrollo (src/, client/src/, tests/)
- Resultados de simulación (cases/, inductiva_output/, simulations/)
- Logs (*.log, worker_logs/, production_logs/)
- Cache de Python (.pythonlibs/, .cache/, __pycache__/)

### Paso 3: Verificar Limpieza

Directorios limpiados automáticamente:
- ✅ `./cases/` - 6.9GB eliminados
- ✅ `./inductiva_output/` - 552KB eliminados
- ✅ `public/uploads/sim_*/` - 4.7GB eliminados
- ✅ `worker_logs/` - 14MB limpiados
- ✅ `production_logs/` - limpiados

### Paso 4: Re-Deployar

Una vez configurado `packager.ignoredPaths` en `.replit`:

1. Guarda el archivo `.replit`
2. Haz click en "Deploy" nuevamente
3. El deployment solo incluirá:
   - `dist/` (código compilado)
   - `public/` (assets estáticos, sin resultados)
   - Scripts de producción (`start-production.sh`, `worker_*.py`)
   - Configuración necesaria

## ¿Por Qué es Necesario?

El deployment a Google Cloud Run tiene un límite de **8GB** para la imagen del contenedor. Los paquetes de desarrollo y resultados de simulación no son necesarios en producción:

| Directorio | Tamaño | Necesario en Producción |
|------------|--------|-------------------------|
| `.cache` | ~1.2GB | ❌ No (solo desarrollo) |
| `node_modules` | 558MB | ⚠️ Solo para build |
| `.pythonlibs` | 38MB | ⚠️ Solo runtime Python |
| `cases/` | 0MB | ❌ No (eliminado) |
| `inductiva_output/` | 0MB | ❌ No (eliminado) |
| `attached_assets/` | 88MB | ❌ No (solo ejemplos) |

## Resultado Esperado

Después de configurar `packager.ignoredPaths`, el deployment debería:
- ✅ Tamaño de imagen < 2GB
- ✅ Build exitoso
- ✅ Workers iniciándose correctamente
- ✅ `/api/health/workers` mostrando 3 procesos running

## Nota Importante

Los resultados de simulación se generarán **dinámicamente en producción** cuando los usuarios ejecuten simulaciones. No necesitas incluir resultados de prueba en el deployment.
