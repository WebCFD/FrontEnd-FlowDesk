# Resumen de Configuraciones CFD - HVAC Thermal Comfort

## 📋 Tipos de Simulación

### 1️⃣ Thermal Comfort TEST (comfortTest)

**Propósito:** Test rápido para verificar configuración

```yaml
Iteraciones: 3
writeInterval: 1
purgeWrite: 0
```

**Comportamiento:**
- ✅ Escribe resultados en iteraciones: 0, 1, 2, 3
- ✅ Mantiene TODOS los timesteps (4 directorios)
- ✅ Útil para depuración y verificación
- 💾 Espacio en disco: ~4 × tamaño_timestep

---

### 2️⃣ Thermal Comfort (comfort30Iter)

**Propósito:** Simulación completa para convergencia

```yaml
Iteraciones: 500  # ← CAMBIADO desde 30
writeInterval: 500
purgeWrite: 1
```

**Comportamiento:**
- ✅ Escribe resultados SOLO en iteración 500
- ✅ Mantiene SOLO el último timestep escrito
- ✅ Ahorro masivo de espacio en disco
- ✅ Protección contra crash: siempre hay un timestep guardado
- 💾 Espacio en disco: ~1 × tamaño_timestep

**Ventaja de purgeWrite=1:**
Si la simulación falla en iteración 487, el timestep 500 (del ciclo anterior si existe) 
o el último escrito permanece en disco para diagnóstico.

---

## ⚙️ Coeficientes de Relajación (Reducidos para Estabilidad)

```yaml
Campos:
  ρ (densidad):     0.05  # Muy conservador
  p_rgh (presión):  0.1   # Drásticamente reducido
  
Ecuaciones:
  U (velocidad):    0.1   # Drásticamente reducido
  h (entalpía):     0.2   # Drásticamente reducido
```

**Efecto:** 
- Convergencia más lenta pero mucho más estable
- Cada iteración actualiza solo 5-20% del valor
- Reduce oscilaciones y divergencias

---

## 🌡️ Condiciones de Frontera Corregidas

### Presión (p_rgh):
```
Interior:           101325 Pa  (presión atmosférica)
Ventanas/Puertas:   101325 Pa  (presión atmosférica)
```
✅ **CORREGIDO** - Antes era 0 Pa → creaba vacío de ~1 atmósfera

### Temperatura (T):
```
Interior inicial:   20°C (293.15 K)
Ventana exterior:   15°C (288.15 K)  ← Aire frío
Paredes:           20°C (293.15 K)
Puerta:            20°C (293.15 K)
```
✅ **IMPLEMENTADO** - Gradiente térmico de 5°C genera convección natural

### Entalpía (h):
```
h = Cp × T  (para perfectGas)
Cp = 1005 J/(kg·K)

Interior:   h = 294615.75 J/kg  (T=293.15K)
Ventana:    h = 289590.75 J/kg  (T=288.15K)
```
✅ **COHERENTE** - Todas las conversiones °C → K correctas

---

## 📂 Estructura del Caso Generado

```
cases/test_simple_room/sim/
├── 0.orig/              # Condiciones iniciales
│   ├── h                # Entalpía [J/kg]
│   ├── p                # Presión absoluta [Pa]
│   ├── p_rgh            # Presión modificada [Pa]
│   ├── T                # Temperatura [K]
│   └── U                # Velocidad [m/s]
├── constant/            # Propiedades físicas
│   ├── g                # Gravedad
│   ├── thermophysicalProperties
│   └── turbulenceProperties
└── system/              # Configuración del solver
    ├── controlDict      # Control de simulación
    ├── fvSchemes        # Esquemas numéricos
    ├── fvSolution       # Solvers y relajación
    └── setFieldsDict    # Inicialización hidrostática
```

---

## 🚀 Casos de Uso

### Para Debugging / Desarrollo:
```bash
python test_generate_cfd_local.py
# → comfortTest: 3 iter, guarda todas
```

### Para Simulación de Producción:
```bash
python test_generate_comfort_500iter.py
# → comfort30Iter: 500 iter, guarda solo última
```

---

## ✅ Correcciones Implementadas (Nov 6, 2025)

1. ✅ **Presión atmosférica corregida**: p_rgh = 101325 Pa en ventanas/puertas
2. ✅ **Temperatura exterior aplicada**: fixedValue en lugar de zeroGradient
3. ✅ **Coherencia de unidades**: °C → K en todas las conversiones
4. ✅ **Coeficientes de relajación reducidos**: Mayor estabilidad
5. ✅ **purgeWrite configurado**: Ahorro de espacio en simulaciones largas
6. ✅ **500 iteraciones**: Aumentado desde 30 para convergencia completa
