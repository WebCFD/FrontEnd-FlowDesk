# Diagnóstico: SIGFPE en deltaCoeffs (kOmegaSST) — caso MySim

**Fecha:** 22 Jun 2026
**Caso:** `PYTHON_STEPS/cases/MySim/sim` (datacenter, 8.83M celdas, 131 patches)
**Síntoma:** El solver crashea con SIGFPE en el constructor del modelo de turbulencia:
`kOmegaSST → eddyViscosity → RASModel → surfaceInterpolation::deltaCoeffs → divide(1/0)`

---

## Cadena de evidencias

### 1. La superficie STL de entrada está LIMPIA ✅
`analyze_mesh_quality.py` sobre `constant/triSurface/geometry.stl`:
- 131 patches, área mínima **0.033 m²**, aspect ratio máximo **72**, **0 slivers**.
- El fix de slivers en triangulación (snap a 1 mm + filtrado) **funciona correctamente**.
- => El problema NO se hereda de la malla de superficie.

### 2. checkMesh sobre la malla de VOLUMEN está ROTO ❌
`log.checkMesh`:
```
***High aspect ratio cells: Max 2.36705e+142, 265 cells
***Zero or negative face area: Minimum 0  → 56 zero-area faces
***Zero or negative cell volume: Min -2.1276e-24, 141 negative-volume cells
***Max skewness = 1.06581e+126, 175 highly skew faces
Mesh non-orthogonality Max: 163.732 → 363 non-orthogonality errors
***Error in face pyramids: 4 faces incorrectly oriented
Failed 6 mesh checks.
```
Las **141 celdas de volumen negativo / 56 caras de área 0** son la causa directa del
SIGFPE: `deltaCoeffs = 1/dist` con `dist=0`.

### 3. cfMesh NO converge durante el untangling ❌ (causa raíz)
`log.cartesianMesh`:
```
--> FOAM Warning : Mesh has 32 unconnected regions
... decenas de "Starting untangling the surface of the volume mesh"
... "Smoothing remaining inverted vertices" repetido
Iteration N. Number of bad faces is 1307 → 250  (NO baja de ahí)
--> Error in non-orthogonality detected
--> Error in face pyramids: 2 faces pointing the wrong way!
--> FOAM Warning : Cell subset badCells already exists!
Finished untangling the mesh   ← cfMesh SE RINDE y escribe celdas inválidas
```

---

## Conclusión

La geometría contiene **objetos solapados / coplanares** que cfMesh no puede mallar:
- Muchos patches `*_bottom`, `*_front` de racks/ventBox aparecen con **0 caras** en
  checkMesh → esas caras están **enterradas dentro de una pared o del suelo**
  (objeto pegado/solapado con la superficie del recinto).
- `32 unconnected regions` = trozos de dominio que quedan aislados por estos solapes.
- cfMesh intenta destrabar (untangle) y al no lograrlo deja `badCells` con volumen ≤ 0.

**No es un problema de triangulación de superficie** (ya resuelto), sino de
**posicionamiento/solape de objetos 3D (racks, ventBox, blocks) contra las paredes/suelo.**

---

## Vías de solución (a decidir)

### A. Detección temprana (barato, no arregla pero evita el crash ciego)
- Parsear `log.checkMesh` tras el mallado y **abortar** si hay
  `negative cell volume` / `zero area faces` con mensaje claro,
  en vez de dejar morir al solver con un stack trace.

### B. Saneamiento geométrico (ataca la causa)
1. **Separar objetos de las paredes**: aplicar un pequeño offset (gap mínimo,
   p.ej. 1-2 cm) a racks/ventBox/blocks que estén coplanares o solapados con
   paredes/suelo, para que cfMesh tenga celdas reales entre ambos.
2. **Detección de solapes en la fase de geometría** (`create_face_based_mesh` /
   `create_block_mesh`): avisar/corregir cuando un objeto intersecta una pared.

### C. Robustez del mallador (paliativo)
- Endurecer `meshQualitySettings` en `meshDict` y/o post-proceso con
  `collapseEdges`/`checkMesh -allTopology` + eliminación de badCells.

### Recomendado
- **A + B**: detector que aborta limpio (A) **y** separación automática de objetos
  pegados a superficies (B), que es la causa real de las 32 regiones inconexas.
