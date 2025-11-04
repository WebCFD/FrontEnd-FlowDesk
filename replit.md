# HVAC Simulation Platform

## Overview

This project is a full-stack web application for HVAC (Heating, Ventilation, and Air Conditioning) simulation and design. It provides an interactive 3D environment for creating multi-floor building layouts, placing furniture, configuring air flow systems, and running thermal simulations. The platform aims to offer HVAC professionals and enthusiasts a comprehensive tool for visualizing and analyzing thermal dynamics and exporting simulation data for further analysis, contributing to improved building efficiency and comfort.

## User Preferences

Preferred communication style: Simple, everyday language.
Technical documentation preference: Detailed technical explanations for architectural patterns to enable replication in future development cycles.
Development approach: Favor simple, minimal solutions over complex implementations. Avoid overengineering.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite
- **UI**: Tailwind CSS, Radix UI, shadcn/ui
- **3D Graphics**: Three.js, Canvas3D
- **State Management**: Zustand (persistent global state)
- **Routing**: Wouter
- **Form Handling**: React Hook Form with Zod
- **UI/UX Decisions**: Consistent design, interactive 3D preview, configurable themes, wizard-based simulation setup, responsive layout, unified 2D menu tools.

### Backend
- **Runtime**: Node.js with Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js (local strategy, session-based)
- **Session Storage**: PostgreSQL

### CFD Meshing Strategy (⭐ HVAC Professional - Nov 4, 2024)

**Active Configuration**: `hvac_pro` (snappyHexMesh optimized from scratch with parametric quality levels)

**Latest Update (Nov 4, 2024)**: Conservative Isotropic Strategy (Quality Level 1)
- **Objective**: Non-orthogonality < 65° at boundaries WITHOUT boundary layers
- **Strategy**: Isotropic refinement only, NO boundary layers
  - Boundary layers: `None` (disabled completely)
  - Surface refinement: level 4 (0.625cm cells, up from level 3)
  - Volumetric zones: 4 zones (0-8cm, 8-20cm, 20-40cm, 40-60cm at levels 4,3,2,1)
  - Feature edge refinement: Disabled
  - Quality controls: Strict (`maxNonOrtho: 65°`, `maxBoundarySkewness: 20`, `nCellsBetweenLevels: 4`)
- **Expected**: maxNonOrtho < 65°, 0 concave cells, <5% polyhedra, ~200-300k cells, 1-2 min mesh time
- **Modified**: `src/components/mesh/hvac_pro.py` (Level 1 config + `generate_hvac_boundary_layers()`)

**Critical Fixes Applied (Nov 4, 2024)**: Added OpenFOAM v2406 compliance
- Added `nSurfaceLayers` to each patch in boundary layer configuration
- Added global fallback parameters (`expansionRatio`, `firstLayerThickness`) required by OpenFOAM
- Increased `nSmoothThickness` from 20 to 40 for smooth layer transitions
- Fixed typo: `minMedianAxisAngle` → `minMedialAxisAngle` (OpenFOAM correct spelling)
- Ensures compatibility with Inductiva's OpenFOAM v2406 environment

**Design Philosophy**: Physics-based mesh sizing derived from:
- Jet resolution requirements (10-15 cells across jet diameter)
- Boundary layer theory (y+ < 30 for wall functions)
- Thermal stratification (15-20 cells per floor height)
- Numerical stability (smooth transitions, strict quality controls)

**Parametric Quality Levels** (configure in `mesher_config.py`):
```
Level 1 (Coarse):  ~50k cells    - Fast validation (~2 min mesh, ~5 min CFD)
Level 2 (Medium):  ~500k cells   - Production quality (~10 min mesh, ~30 min CFD) ⭐ DEFAULT
Level 3 (Fine):    ~5M cells     - Research grade (~30 min mesh, ~4 hours CFD)
```

**Example: Level 2 (Medium) Configuration**:

*Refinement Levels* (cell size = 0.25m / 2^level):
```
Level 6 (4mm):  Pressure inlets    → Jet core capture
Level 5 (8mm):  Pressure outlets   → Return flow patterns
Level 3 (3cm):  Walls               → Thermal boundary layer
Level 2 (6cm):  Floor/Ceiling      → Vertical stratification
```

*Volumetric Refinement* (Multi-zone around pressure boundaries):
```
Zone 1 (0-0.3m):   Level 5 → Jet expansion and mixing
Zone 2 (0.3-1.0m): Level 4 → Deceleration and entrainment
Zone 3 (1.0-2.0m): Level 3 → Flow development
```

*Boundary Layers*:
```
Pressure boundaries: 7 layers, first cell 1mm (y+ ≈ 20-30), ratio 1.15
Walls:              5 layers, first cell 2mm (thermal BL), ratio 1.2
Target coverage:    >95% pressure boundaries, >90% walls
```

*Quality Controls*:
```
maxNonOrtho: 55 (strict), maxSkewness: 12 (boundary) / 2.5 (internal)
```

**Alternative Configurations**:
- `snappy`: Basic snappyHexMesh (level 0-4 refinement, basic layers)
- `cfmesh`: Automatic mesher (NOT available on Inductiva platform)

**Files**: 
- Configuration: `mesher_config.py` (set DEFAULT_QUALITY_LEVEL = 1, 2, or 3)
- Implementation: `src/components/mesh/hvac_pro.py` (parametric system)
- Documentation: `data/settings/mesh/hvac_pro/README.md` (detailed guide)

### Core Features & Design Patterns
- **3D Design Engine**: Three.js-based, supporting multi-floor designs, 2D to 3D transformations, and wall extrusion.
- **Furniture and Object System**: Dynamic loading, custom STL import, thermal/airflow property management.
- **Air Flow Configuration**: Detailed settings for air entries (windows, doors, vents) including flow type, direction, and temperature.
- **Data Synchronization**: Zustand ensures real-time bidirectional synchronization across 2D/3D views.
- **Simulation Validation**: Comprehensive CFD validation, including Insufficient Boundary Conditions (IBC) checks.
- **JSON Import/Export**: Robust handling of complex designs, ensuring data preservation and accurate unit conversions.
- **Containerized Deployment**: Application is containerized for Google Cloud Run.
- **CFD Simulation Pipeline**: End-to-end pipeline for converting user designs into OpenFOAM CFD simulations executed on Inductiva cloud, with results visualized in the web UI. This involves a dual-worker system for geometry, mesh, CFD setup, submission, monitoring, result download, and post-processing.
- **Meshing Strategy**: Supports both snappyHexMesh and cfMesh, with snappyHexMesh currently active. cfMesh is implemented and ready for use when available in Inductiva's OpenFOAM containers, offering automatic boundary layers and differentiated refinement for HVAC applications.
- **CFD Configuration & Physics**: Uses buoyantSimpleFoam with Boussinesq approximation for numerical stability in HVAC applications (ΔT <50°C). Employs hConst thermo model with sensibleEnthalpy. Critical fix involves using `zeroGradient` for enthalpy/temperature on pressure boundaries to prevent over-constrained systems.
- **Simulation Types**: Configurable simulation types (e.g., "Thermal Comfort TEST" for fast validation, "Thermal Comfort 30 ITERATIONS" for full convergence) with dynamic iteration control.
- **Numerical Stability**: Conservative relaxation factors and 1st order discretization schemes are used for stable startup and convergence, along with strict residual control.

## External Dependencies

### Core Libraries
- **Three.js**: 3D graphics and rendering.
- **Drizzle ORM**: Type-safe database operations.
- **Neon Database**: Serverless PostgreSQL hosting.
- **Passport.js**: Authentication middleware.
- **inductiva**: Cloud simulation platform integration.
- **foamlib**: OpenFOAM Python library.
- **pymeshlab**: Mesh processing.
- **pyvista**: 3D visualization.
- **matplotlib**, **pandas**, **reportlab**, **numpy**: For post-processing and report generation.

### UI and Styling
- **Radix UI**: Accessible component primitives.
- **Tailwind CSS**: Utility-first styling.
- **Lucide React**: Icon library.
- **React Hook Form**: Form validation and handling.
- **shadcn/ui**: UI components.
- **react-resizable-panels**: For resizable UI components.

### Development Tools
- **TypeScript**: Static type checking.
- **Vite**: Build tool and development server.