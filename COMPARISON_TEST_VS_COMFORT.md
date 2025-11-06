# 🔄 Comparación: TEST vs COMFORT
*Diccionarios CFD Generados - Nov 6, 2025*

---

## 📋 PARÁMETROS DE SIMULACIÓN

| Parámetro | TEST (comfortTest) | COMFORT (comfort30Iter) |
|-----------|-------------------|------------------------|
| **endTime** | `3` | `500` |
| **writeInterval** | `1` | `500` |
| **purgeWrite** | `0` (guarda todos) | `1` (solo último) |
| **VTK writeInterval** | `1` | `500` |
| **VTK type** | `internal` | `internal` |
| **Timesteps guardados** | 4 (0, 1, 2, 3) | 1 (solo 500) |
| **Espacio estimado** | ~400 MB | ~100 MB |

---

## 🎯 VTK CONFIGURATION (Idéntica para ambos)

```yaml
functions:
  writeVTK:
    type: surfaces
    libs: "libsampling.so"
    writeControl: timeStep
    writeInterval: [1 o 500 según caso]
    
    surfaceFormat: vtk
    fields: [h, T, U, p, p_rgh]
    
    interpolationScheme: cellPoint
    
    surfaces:
      internalMesh:
        type: internal        # ← TODO EL DOMINIO INTERNO
        interpolate: true
```

**Ventajas de `type: internal`:**
- ✅ Captura todo el volumen (no solo patches específicos)
- ✅ Ideal para análisis PMV/PPD en todo el espacio
- ✅ No depende de nombres de patches (floor_0F, ceil_0F, etc.)
- ✅ Visualización completa en ParaView

---

## 🌡️ CONDICIONES DE FRONTERA (Idénticas)

### Presión atmosférica:
```
p_rgh = 101325 Pa en todo el dominio
  ├─ Interior inicial: 101325 Pa
  ├─ Ventana (pressure_inlet): 101325 Pa
  └─ Puerta (pressure_outlet): 101325 Pa
```

### Temperatura:
```
T_interior = 20°C (293.15 K)
T_ventana = 15°C (288.15 K)  ← Gradiente térmico de 5°C
```

### Entalpía (h = Cp × T):
```
h_interior = 294615.75 J/kg  (Cp=1005, T=293.15K)
h_ventana = 289590.75 J/kg   (Cp=1005, T=288.15K)
```

---

## ⚙️ COEFICIENTES DE RELAJACIÓN (Idénticos)

```yaml
relaxationFactors:
  fields:
    rho: 0.05        # Densidad
    p_rgh: 0.1       # Presión modificada
    
  equations:
    U: 0.1           # Velocidad
    h: 0.2           # Entalpía
```

**Ultra-conservadores para máxima estabilidad**

---

## 💾 COMPARACIÓN DE ALMACENAMIENTO

### TEST (purgeWrite=0):
```
📁 0/         ~100 MB
📁 1/         ~100 MB
📁 2/         ~100 MB
📁 3/         ~100 MB
────────────────────────
TOTAL:        ~400 MB
```
✅ Útil para debug (ver evolución paso a paso)

### COMFORT (purgeWrite=1):
```
📁 1-499/     BORRADOS automáticamente
📁 500/       ~100 MB  ← Solo este permanece
────────────────────────
TOTAL:        ~100 MB
```
✅ Ahorro de 99.8% de espacio
✅ Suficiente para análisis de convergencia

---

## 🔍 CAMPOS CAPTURADOS EN VTK

Ambos casos exportan los mismos campos:

```
h       → Entalpía [J/kg]
T       → Temperatura [K]
U       → Velocidad [m/s] (vectorial)
p       → Presión absoluta [Pa]
p_rgh   → Presión modificada [Pa]
```

**Todo el volumen interno** gracias a `type: internal`

---

## 🚀 COMANDOS DE GENERACIÓN

### TEST (Debug):
```bash
python test_generate_cfd_local.py
```
**Output:** cases/test_simple_room/sim/ con 3 iteraciones

### COMFORT (Producción):
```bash
python test_generate_comfort_500iter.py
```
**Output:** cases/test_simple_room/sim/ con 500 iteraciones

---

## 📊 CUÁNDO USAR CADA UNO

### 🧪 TEST (comfortTest)
**Usar cuando:**
- ✅ Necesitas verificar boundary conditions
- ✅ Quieres debug de campos iniciales
- ✅ Test de estabilidad del solver
- ✅ Verificación rápida (< 1 minuto)

**NO usar cuando:**
- ❌ Necesitas resultados convergidos
- ❌ Análisis PMV/PPD final
- ❌ Producción

### 🏢 COMFORT (comfort30Iter)
**Usar cuando:**
- ✅ Necesitas convergencia completa
- ✅ Análisis PMV/PPD final
- ✅ Visualización de resultados
- ✅ Producción
- ✅ Necesitas ahorrar espacio

**NO usar cuando:**
- ❌ Solo quieres test rápido
- ❌ Debug de configuración inicial

---

## ✅ VERIFICACIÓN

### Ambos casos tienen:
- [x] p_rgh = 101325 Pa (no 0 Pa)
- [x] T_ventana = 15°C exterior
- [x] h coherente con T (h = Cp × T)
- [x] VTK type = internal
- [x] Relajación reducida
- [x] Unidades coherentes (Kelvin)

### Diferencias clave:
- [x] TEST: 3 iter, guarda todo (debug)
- [x] COMFORT: 500 iter, guarda solo último (producción)

---

**✅ AMBOS CASOS LISTOS PARA USO**
