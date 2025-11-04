# Plan de Implementación: Overset Mesh para HVAC

## Resumen Ejecutivo

**Objetivo**: Lograr ortogonalidad perfecta (<5°) en patches que actúan como boundary conditions usando estrategia overset mesh.

**Ventaja clave**: Patches rectangulares hacen overset IDEAL - component meshes triviales (blockMesh simple).

**Timeline**: 2.5-3 días de desarrollo

**Resultado esperado**:
- Non-orthogonality: 66° → <5°
- Concave cells: 773 → 0
- Hexahedra: 80% → >98%
- Mesh quality: INSERVIBLE → PERFECTA

---

## Arquitectura

### Concepto

```
┌─────────────────────────────────────────────────┐
│           BACKGROUND MESH                       │
│    (Cartesiana simple - toda habitación)        │
│                                                 │
│    ┏━━━━━━━┓  ← Component mesh (inlet)         │
│    ┃ ████  ┃     Box ortogonal 100%             │
│    ┗━━━━━━━┛     Extrude perpendicular          │
│                                                 │
│                      ┏━━━━━━━┓                 │
│                      ┃ ████  ┃ ← Outlet         │
│                      ┗━━━━━━━┛                 │
└─────────────────────────────────────────────────┘
```

### Componentes

1. **Background mesh**: blockMesh cartesiano simple (toda habitación)
2. **Component meshes**: Un box ortogonal por cada BC crítico (pressure_inlet, pressure_outlet)
3. **Overset interpolation**: OpenFOAM interpola automáticamente en overlap zones

---

## Implementación - 6 Pasos

### PASO 1: Identificación de Patches (2 horas)

**Input**: `geo_df` (CSV con patch_info)

**Código**:
```python
def identify_component_patches(geo_df):
    critical_bcs = ['pressure_inlet', 'pressure_outlet']
    
    components = []
    for idx, row in geo_df.iterrows():
        if row['bc_type'] in critical_bcs:
            bounds = extract_patch_bounds(geo_mesh, row['patch_name'])
            components.append({
                'name': row['patch_name'],
                'center': bounds['center'],
                'normal': bounds['normal'],
                'width': bounds['width'],
                'height': bounds['height'],
                'extrude_distance': 0.5  # 50cm hacia interior
            })
    
    return components
```

**Output**: Lista de patches que necesitan component meshes

---

### PASO 2: Background Mesh (4 horas)

**Método**: blockMesh (NO snappyHexMesh)

**Características**:
- Hexahedra puros 100%
- Refinamiento uniforme: dx=10cm base
- Cubre toda la habitación con margin

**Template**: `data/settings/mesh/overset/blockMeshDict_background`

```openfoam
blocks
(
    hex (0 1 2 3 4 5 6 7)
    (55 33 23)  // cells en X, Y, Z
    simpleGrading (1 1 1)
);

boundary
(
    walls { type wall; }
    overset { type overset; faces (); }
);
```

**Código**:
```python
def generate_background_mesh(case_name, geo_mesh):
    bounds = geo_mesh.bounds
    margin = 0.2
    
    # Calculate dimensions
    dx = 0.1  # 10cm cells
    nx = int((bounds[1] - bounds[0]) / dx)
    ny = int((bounds[3] - bounds[2]) / dx)
    nz = int((bounds[5] - bounds[4]) / dx)
    
    # Generate blockMeshDict from template
    ...
```

---

### PASO 3: Component Meshes (6 horas)

**Para cada patch rectangular crítico**:

1. Crear box ortogonal que extrude desde el patch
2. Usar blockMesh con grading para boundary layers
3. 100% hexahedra ortogonales GARANTIZADO

**Geometría del component**:
- Width/Height: Mismo que el patch rectangular
- Depth: 0.5m hacia interior (configurable)
- Grading: Fino cerca del BC, grueso lejos

**Template**: `data/settings/mesh/overset/blockMeshDict_component`

```openfoam
vertices
(
    // Face en el patch
    (x0 y0 z0) (x1 y0 z0) (x1 y1 z0) (x0 y1 z0)
    
    // Face interior (extrude)
    (x0+d*nx y0 z0) ... // d=extrude distance, nx=normal
);

blocks
(
    hex (0 1 2 3 4 5 6 7)
    (20 10 15)  // width, height, depth cells
    simpleGrading
    (
        1  // uniform width
        1  // uniform height
        ((0.1 0.3 5) (0.9 0.7 1))  // grading depth (fino cerca BC)
    )
);

boundary
(
    inlet { type patch; faces ((0 3 2 1)); }  // BC real
    overset { type overset; faces (...); }     // Resto
);
```

**Código**:
```python
def generate_component_mesh(comp_info, case_name):
    # 1. Calculate local coordinate system
    u, v = get_patch_axes(comp_info['normal'])
    
    # 2. Calculate 8 vertices del box
    center = comp_info['center']
    width = comp_info['width']
    height = comp_info['height']
    extrude = comp_info['extrude_distance']
    
    v0 = center - (width/2)*u - (height/2)*v
    v1 = center + (width/2)*u - (height/2)*v
    # ... v2-v7
    
    # 3. Cell count
    n_width = int(width / 0.05)   # 5cm cells
    n_height = int(height / 0.05)
    n_depth = 15
    
    # 4. Generate blockMeshDict
    ...
```

---

### PASO 4: Setup Overset (4 horas)

**Archivos necesarios**:

1. **topoSetDict**: Define cellZones
```openfoam
actions
(
    { name background; type cellZoneSet; ... }
    { name inlet_comp; type cellZoneSet; ... }
    { name outlet_comp; type cellZoneSet; ... }
);
```

2. **dynamicMeshDict**: Config overset
```openfoam
dynamicFvMesh   staticOversetFvMesh;
solver          multiDimOverset;
interpolationMethod cellVolumeWeight;
```

3. **fvSchemes**: Interpolation schemes
```openfoam
oversetInterpolation
{
    method cellVolumeWeight;
    searchBox (-1 -1 -1) (1 1 1);
}
```

---

### PASO 5: Workflow de Ejecución (2 horas)

**Bash script generado**:
```bash
# 1. Generate background
cd background && blockMesh && cd ..

# 2. Generate components
for comp in components/*/; do
    cd $comp && blockMesh && cd ../..
done

# 3. Merge meshes
mergeMeshes . background -overwrite
for comp in components/*/; do
    mergeMeshes . $comp -overwrite
done

# 4. Create cellZones
topoSet

# 5. Create overset patches
createPatch -overwrite

# 6. Identify overset cells
oversetMesh -checkOverlap

# 7. Check mesh
checkMesh -allTopology -allGeometry

# 8. Run solver
buoyantSimpleFoam
```

---

### PASO 6: Integración (4 horas)

**Modificaciones al código**:

1. `step02_geo2mesh.py`:
```python
def run(case_name, geo_mesh, geo_df, type="overset", quality_level=1):
    if type == "overset":
        from src.components.mesh.overset import generate_overset_mesh
        return generate_overset_mesh(...)
```

2. Nuevo: `src/components/mesh/overset.py`
```python
def generate_overset_mesh(case_name, geo_mesh, geo_df, quality_level):
    components = identify_component_patches(geo_df)
    generate_background_mesh(case_name, geo_mesh)
    for comp in components:
        generate_component_mesh(comp, case_name)
    generate_overset_config(case_name, components)
    return generate_overset_script(case_name)
```

3. `mesher_config.py`:
```python
AVAILABLE_MESHERS = ["snappy", "hvac_pro", "overset"]
DEFAULT_MESHER = "overset"  # Cuando esté listo
```

---

## Timeline Detallado

| Día | Horas | Tareas | Output |
|-----|-------|--------|--------|
| **1** | 4-6h | Pasos 1-2 | Background mesh funcionando |
| **2** | 4-6h | Paso 3 | Component meshes funcionando |
| **3** | 4-6h | Pasos 4-5 | Overset merge + test local |
| **4** | 2-4h | Paso 6 + test Inductiva | Producción ready |

**Total**: 14-22 horas (2.5-3 días)

---

## Resultado Esperado

### checkMesh Predicción

| Métrica | Actual | Overset | Mejora |
|---------|--------|---------|--------|
| **Non-orthogonality** | 66.3° | <5° | 13x mejor |
| **Concave cells** | 773 (5.2%) | 0 | ∞ mejor |
| **Polyhedra** | 15.4% | <1% | 15x mejor |
| **Hexahedra** | 80% | >98% | 1.2x mejor |
| **Skewness** | 2.33 | <0.5 | 4.6x mejor |

### Por Qué Funcionará

1. **Background mesh**: blockMesh cartesiano → 100% ortogonal
2. **Component meshes**: blockMesh con grading simple → 100% ortogonal
3. **No snappyHexMesh**: Evita layers colapsando
4. **Patches rectangulares**: Geometría trivial para blockMesh

---

## Archivos a Crear

### Templates
- `data/settings/mesh/overset/blockMeshDict_background`
- `data/settings/mesh/overset/blockMeshDict_component`
- `data/settings/mesh/overset/topoSetDict`
- `data/settings/mesh/overset/dynamicMeshDict`
- `data/settings/mesh/overset/fvSchemes_overset`

### Código
- `src/components/mesh/overset.py` (nuevo)
- `src/utils/patch_geometry.py` (nuevo - cálculos geométricos)

### Scripts
- `generate_overset_mesh.sh` (template)

---

## Riesgos y Mitigación

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Inductiva no soporta oversetMesh | Baja | Verificar disponibilidad día 1 |
| Interpolación inestable | Baja | Usar cellVolumeWeight (estándar) |
| Overlap mal configurado | Media | Tests exhaustivos día 3 |
| Performance degradation | Baja | <5% overhead típico |

---

## ¿Siguiente Paso?

Empezar implementación día 1 con:
1. Estructura de directorios
2. Templates blockMeshDict
3. Función identify_component_patches()
4. Test: Background mesh de sim_184

---

**Status**: Plan aprobado - Listo para implementación
**Creado**: Nov 4, 2025
