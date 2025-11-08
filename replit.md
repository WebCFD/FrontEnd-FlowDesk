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

### Admin Database Panel (Updated Nov 8, 2024)

**Overview**: Unified administrative interface at `/admindatabase` for monitoring system health and managing database records.

**Features**:
- **Workers Monitoring** (auto-refresh every 10s):
  - Express server status and uptime
  - Worker Submit process status (PID, health)
  - Worker Monitor process status (PID, health)
  - System Info: Memory (used/total MB), Disk (used/total GB), Node version
- **Database Management**:
  - View all users with filterable table (username, email, fullName)
  - Edit user credits and fullName
  - Delete users with confirmation
  - View all simulations with advanced filters (name, status, type, user)
  - Edit simulation status, cost, and public visibility
  - Delete simulations with confirmation
- **Statistics Dashboard**: Real-time metrics for users, simulations, and credits used

**Architecture**:
- **Authentication**: SHA-256 hashed password ("flowerpower") with Bearer token
  - Password is hashed client-side using WebCrypto SHA-256 before transmission
  - Backend compares SHA-256 hashes (no plain text passwords stored or transmitted)
  - Hash: `b49f2bc773151f63cead40e9fb5bf30a70dbe79e2fdbef56ebe64d3db2f6a536`
  - Same security pattern as simulation launch password ("jrm2025")
- **Backend Endpoints**:
  - `GET /api/admindatabase/workers` - Workers health status with system metrics (protected)
  - `GET /api/admindatabase/users` - List all users (protected)
  - `PATCH /api/admindatabase/users/:id` - Update user (protected)
  - `DELETE /api/admindatabase/users/:id` - Delete user (protected)
  - `GET /api/admindatabase/simulations` - List all simulations (protected)
  - `PATCH /api/admindatabase/simulations/:id` - Update simulation (protected)
  - `DELETE /api/admindatabase/simulations/:id` - Delete simulation (protected)
  - `GET /api/admindatabase/stats` - Database statistics (protected)
- **Frontend**: React with shadcn/ui, TanStack Query for data fetching, auto-refresh for workers status
- **Removed**: Public `/api/health/workers` endpoint (moved to protected admin panel)

**Security Improvements Implemented (Nov 8, 2024)**:
- ✅ SHA-256 password hashing (client-side and server-side comparison)
- ✅ No plain text password transmission
- ✅ Bearer token authentication with hash verification

**Known Limitations**:
- ⚠️ Hash stored in client-side code (future: move to server-side env config)
- ⚠️ No rate limiting on authentication attempts
- ⚠️ No session expiration or refresh tokens
- ⚠️ No audit logging of admin actions
- ⚠️ Disk usage via `df` command (may fail on non-Unix systems)

**Future Security Enhancements** (Optional):
- Move password hash to server-side environment variables
- Implement rate limiting (express-rate-limit)
- Add session management with JWT tokens
- Implement audit logging for all admin actions
- Add graceful error handling for disk usage on Windows/non-Unix platforms

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

## Known Issues

### PMV/PPD Thermal Comfort Visualization (Nov 7, 2024)

**Issue**: PMV (Predicted Mean Vote) and PPD (Predicted Percentage Dissatisfied) fields are not displaying in the VTK visualizer despite being present in the VTKJS files.

**Root Cause**: Data type mismatch between storage and rendering pipeline:
- PMV/PPD are written as **cell data** (values per cell center) by the Python post-processing script
- VTKJS export preserves them in `cellData` section
- VTKViewer cutting plane logic only reads from `pointData.getArrayByName()`, which returns `null` for cell-based arrays
- Result: Visualizer silently falls back to pressure field when PMV/PPD buttons are clicked

**Current State**:
- ✅ `calculate_comfort.py` generates PMV/PPD fields with proper validation
- ✅ Values outside theoretical ranges (PMV: -3 to +3, PPD: 0-100%) are marked as -1000 sentinel
- ✅ VTKJS files contain PMV/PPD arrays (verified in `public/uploads/sim_*/vtk/`)
- ✅ Frontend buttons and UI controls exist for PMV/PPD selection
- ❌ VTKViewer cannot access the data (wrong data location in pipeline)

**Solution Required**:
Convert cell data to point data before visualization using one of:
1. Add `vtkCellDataToPointData` filter in VTK pipeline before mapper
2. Change mapper to `setScalarModeToUseCellFieldData` and read from `cellData` directly
3. Modify Python export script to interpolate to point data during VTKJS conversion

**Files Involved**:
- `src/components/post/calculate_comfort.py` - PMV/PPD calculation (writes cell data)
- `src/components/tools/vtk_to_vtkjs.py` - VTK to VTKJS converter
- `client/src/components/visualization/VTKViewer.tsx` - Frontend visualizer (reads point data only)

**Workaround**: None available. PMV/PPD visualization is currently non-functional.

**Note**: This issue only affects visualization. PMV/PPD fields are correctly calculated and stored in OpenFOAM format and can be accessed via ParaView or other VTK-compatible tools.