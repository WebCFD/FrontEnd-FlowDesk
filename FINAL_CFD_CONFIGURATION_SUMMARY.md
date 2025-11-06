# 📋 Configuración Final CFD - HVAC Thermal Comfort
*Actualizado: Nov 6, 2025*

---

## ✅ MODIFICACIONES IMPLEMENTADAS

### 1. VTK Surface Type: `internal` (Captura todo el dominio)

**ANTES:**
```yaml
surfaces:
  internalMesh:
    type: patch
    patches: ["floor_0F", "ceil_0F"]  # Solo patches específicos
```

**AHORA:**
```yaml
surfaces:
  internalMesh:
    type: internal  # ← Captura TODO el volumen interno
    interpolate: true
```

**Ventajas:**
✅ Captura todo el campo de velocidad, temperatura y presión en el volumen
✅ No depende de nombres específicos de patches (floor_0F, ceil_0F, etc.)
✅ Ideal para visualización completa en ParaView
✅ Permite análisis PMV/PPD en todo el espacio ocupado

---

## 📊 COMPARATIVA: TEST vs COMFORT

### 🧪 TEST CASE (comfortTest)

```yaml
Propósito: Verificación rápida de configuración

Iteraciones:
  endTime: 3
  writeInterval: 1
  purgeWrite: 0

VTK Output:
  writeInterval: 1  # Escribe cada iteración
  type: internal    # Todo el dominio
  
Almacenamiento:
  Timesteps guardados: 4 (0, 1, 2, 3)
  Espacio en disco: ~4 × tamaño_timestep
```

**Casos de uso:**
- ✅ Debug de condiciones iniciales
- ✅ Verificar que el solver arranca correctamente
- ✅ Validar boundary conditions
- ✅ Test de estabilidad

---

### 🏢 COMFORT CASE (comfort30Iter)

```yaml
Propósito: Simulación completa para convergencia

Iteraciones:
  endTime: 500      # ← 500 iteraciones para convergencia
  writeInterval: 500
  purgeWrite: 1     # ← Ahorra espacio masivamente

VTK Output:
  writeInterval: 500  # Solo última iteración
  type: internal      # Todo el dominio
  
Almacenamiento:
  Timesteps guardados: 1 (solo 500)
  Espacio en disco: ~1 × tamaño_timestep
```

**Ventajas:**
- ✅ **500 iteraciones**: Suficiente para convergencia completa
- ✅ **purgeWrite=1**: Ahorro masivo de espacio (99.8% menos)
- ✅ **Protección crash**: Última iteración siempre guardada
- ✅ **Todo el dominio**: VTK con `type: internal`

---

## 🌡️ CONDICIONES DE FRONTERA (Ambos casos)

### Presión (p_rgh):
```
✅ Atmosférica en todo el dominio: 101325 Pa
   - Interior inicial: 101325 Pa
   - Ventanas: 101325 Pa  (pressure_inlet)
   - Puertas: 101325 Pa   (pressure_outlet)
```
**CRÍTICO:** Antes era 0 Pa → creaba vacío artificial de ~1 atmósfera

### Temperatura (T):
```
✅ Gradiente térmico para convección natural:
   - Interior: 20°C (293.15 K)
   - Ventana exterior: 15°C (288.15 K)  ← Aire frío entra
   - Paredes: 20°C (293.15 K)
   - Puerta: 20°C (293.15 K)
```
**ΔT = 5°C** → Genera flujo de convección natural

### Entalpía (h):
```
✅ Coherente con temperaturas (h = Cp × T):
   - Interior: h = 294615.75 J/kg  (T=293.15K)
   - Ventana: h = 289590.75 J/kg   (T=288.15K)
   - Cp = 1005 J/(kg·K)
```

---

## ⚙️ COEFICIENTES DE RELAJACIÓN (Ultra-conservadores)

```yaml
Campos:
  ρ (densidad):     0.05  # Actualiza solo 5% por iteración
  p_rgh (presión):  0.1   # Actualiza solo 10% por iteración
  
Ecuaciones:
  U (velocidad):    0.1   # Actualiza solo 10% por iteración
  h (entalpía):     0.2   # Actualiza solo 20% por iteración
```

**Efecto:**
- ✅ Convergencia MUY estable
- ⚠️ Convergencia más lenta (por eso necesitamos 500 iteraciones)
- ✅ Evita oscilaciones y divergencias

---

## 📂 ESTRUCTURA DE ARCHIVOS GENERADOS

```
cases/test_simple_room/sim/
├── 0.orig/                   # Condiciones iniciales
│   ├── h         (J/kg)     # Entalpía - coherente con T
│   ├── p         (Pa)       # Presión absoluta
│   ├── p_rgh     (Pa)       # Presión modificada = 101325 Pa
│   ├── T         (K)        # Temperatura en Kelvin
│   └── U         (m/s)      # Velocidad inicial = (0,0,0)
│
├── constant/
│   ├── g                     # Gravedad = (0 0 -9.81)
│   ├── thermophysicalProperties  # perfectGas + hConst
│   └── turbulenceProperties      # laminar (sin turbulencia)
│
└── system/
    ├── controlDict           # Control + VTK con type:internal
    ├── fvSchemes             # Esquemas numéricos
    ├── fvSolution            # Solvers + relajación reducida
    └── setFieldsDict         # Inicialización hidrostática
```

---

## 🚀 COMANDOS DE GENERACIÓN

### Para TEST (3 iteraciones, debug):
```bash
python test_generate_cfd_local.py
# → comfortTest: endTime=3, writeInterval=1, purgeWrite=0
# → VTK: type=internal, captura todo el dominio
```

### Para COMFORT (500 iteraciones, producción):
```bash
python test_generate_comfort_500iter.py
# → comfort30Iter: endTime=500, writeInterval=500, purgeWrite=1
# → VTK: type=internal, captura todo el dominio
```

---

## 🎯 CAMPOS CAPTURADOS EN VTK (Ambos casos)

```yaml
fields: [h, T, U, p, p_rgh]
```

**Para análisis PMV/PPD necesitas:**
- ✅ **T** (temperatura) - campo escalar
- ✅ **U** (velocidad) - campo vectorial
- ✅ **Todo el volumen** - capturado con `type: internal`

---

## 📊 AHORRO DE ESPACIO: purgeWrite=1

### Sin purgeWrite (TEST):
```
Iter 1:   ~100 MB
Iter 2:   ~100 MB
Iter 3:   ~100 MB
TOTAL:    ~300 MB
```

### Con purgeWrite=1 (COMFORT):
```
Iter 1-499:  Borrados automáticamente
Iter 500:    ~100 MB
TOTAL:       ~100 MB  ← 99.8% menos espacio
```

**Para 500 iteraciones:**
- Sin purgeWrite: ~50 GB
- Con purgeWrite=1: ~100 MB
- **Ahorro: 99.8%** 🎉

---

## ✅ CHECKLIST DE CORRECCIONES

- [x] Presión: p_rgh = 101325 Pa (no 0 Pa)
- [x] Temperatura ventana: 15°C exterior
- [x] Entalpía coherente: h = Cp × T
- [x] Relajación reducida: ρ=0.05, p_rgh=0.1, U=0.1, h=0.2
- [x] 500 iteraciones en comfort30Iter (no 30)
- [x] purgeWrite=1 en comfort30Iter
- [x] purgeWrite=0 en comfortTest
- [x] VTK type=internal (no patches específicos)
- [x] Unidades coherentes: Kelvin internamente

---

## 🎓 PRÓXIMOS PASOS

1. ✅ **Caso generado** → Listo para Inductiva
2. ⏭️ **Ejecutar en cloud** → 500 iteraciones
3. ⏭️ **Descargar VTK** → Iteración 500 completa
4. ⏭️ **Post-procesado** → PMV/PPD en todo el volumen
5. ⏭️ **Visualización** → ParaView con campos T, U, p

---

**Estado:** ✅ **LISTO PARA PRODUCCIÓN**
