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

### Replit /tmp Disk Quota Fix (Nov 2, 2025)

**Issue**: Replit imposes strict disk quotas on `/tmp` directory, causing `tsx` and Inductiva to fail with "[Errno 122] Disk quota exceeded" errors.

**Solution**: Custom `TMPDIR` redirection to workspace directory:

1. **TSX Wrapper** (`node_modules/.bin/tsx.wrapper`): Intercepts `tsx` binary and sets `TMPDIR=/home/runner/workspace/.tmp_inductiva` before launching, preventing `/tmp` usage during TypeScript compilation.

2. **Worker Configuration** (`worker_submit.py`): Sets custom temp directory at import time for Python workers handling Inductiva cloud submissions.

3. **Server Configuration** (`server/index.ts`): Sets environment variables at startup (redundant with TSX wrapper, but kept for consistency).

**Implementation**:
- Custom temp directory: `/home/runner/workspace/.tmp_inductiva/`
- Environment variables set: `TMPDIR`, `TEMP`, `TMP`, `TSX_CACHE_DIR`, `XDG_CACHE_HOME`
- TSX binary replaced with wrapper via symlink in `node_modules/.bin/tsx`

**Impact**: Enables seamless operation on Replit despite `/tmp` quotas. No `.replit` modifications required.

### CFD Meshing Strategy (⭐ HVAC Professional - Nov 2, 2025)

**Active Configuration**: `hvac_pro` (snappyHexMesh optimized from scratch with parametric quality levels)

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