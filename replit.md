# HVAC Simulation Platform

## Overview

This project is a full-stack web application designed for HVAC (Heating, Ventilation, and Air Conditioning) simulation and design. It offers an interactive 3D environment for creating room layouts, placing furniture, configuring air flow systems, and running thermal simulations for multi-floor buildings. The platform aims to provide HVAC professionals and enthusiasts with a comprehensive tool for visualizing and analyzing thermal dynamics and exporting simulation data for further analysis.

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

### Core Features & Design Patterns
- **3D Design Engine**: Three.js-based, supporting multi-floor designs, 2D to 3D transformations, and wall extrusion.
- **Furniture and Object System**: Dynamic loading, custom STL import, thermal/airflow property management.
- **Air Flow Configuration**: Detailed settings for air entries (windows, doors, vents) including flow type, direction, and temperature.
- **Data Synchronization**: Zustand serves as a reactive store for real-time bidirectional synchronization across 2D/3D views, ensuring immediate updates without complex memoization.
- **Dynamic Canvas Sizing**: Responsive canvas height with min/max limits.
- **Simulation Validation**: Comprehensive CFD validation, including Insufficient Boundary Conditions (IBC) checks.
- **Wall Line Restriction**: Enforces single closed contours per floor for well-defined rooms.
- **JSON Import/Export**: Robust handling of complex designs, ensuring data preservation and accurate unit conversions for perfect reversibility.
- **Containerized Deployment**: Application is containerized for Google Cloud Run.
- **CFD Simulation Pipeline**: End-to-end pipeline for converting user designs into OpenFOAM CFD simulations executed on Inductiva cloud, with results visualized in the web UI. This involves a dual-worker system (`worker_submit.py` for geometry, mesh, CFD setup, and submission; `worker_monitor.py` for monitoring, result download, and post-processing).
- **Dual Meshing Strategy (Nov 2, 2025)**: Supports both snappyHexMesh and cfMesh for mesh generation. cfMesh is recommended for HVAC applications with pressure boundaries (windows/doors/vents) due to superior automatic boundary layer generation (>90% coverage) and 2-5x faster meshing times. snappyHexMesh remains available for multi-region cases or rotating machinery.

### CFD Configuration & Physics (Updated November 1, 2025)

**Simulation Types & Iteration Configuration:**
- **Thermal Comfort TEST** (comfortTest): 3 iterations, €10 cost - Fast validation runs
- **Thermal Comfort 30 ITERATIONS** (comfort30Iter): 30 iterations, €12 cost - Full convergence simulations
- **Implementation**: End-to-end data flow from frontend → backend → worker → CFD setup
  - Frontend sends `simulationType` via wizard dialog
  - Backend validates and persists to PostgreSQL
  - Worker pipeline (`worker_submit.py` → `step03_mesh2cfd.py` → `hvac.setup()`) propagates type
  - `update_controldict_iterations()` dynamically modifies OpenFOAM controlDict endTime
- **Default Behavior**: Defaults to comfortTest (3 iterations) if simulationType is missing or invalid

**Thermophysical Model (Migrated to Boussinesq - Nov 1, 2025):**
- **Solver**: buoyantSimpleFoam with Boussinesq approximation
- **Equation of State**: incompressiblePerfectGas (ρ = pRef/(R×T) where pRef is constant) - decouples density from pressure field
- **Thermo Model**: hConst (constant enthalpy model)
- **Energy Variable**: sensibleEnthalpy (h = Cp×T)
- **Fluid Properties**: Air with Cp = 1005 J/(kg·K), Pr = 0.7, molecular weight = 28.9 g/mol, pRef = 101325 Pa
- **Temperature Limits**: Tlow = 200K (-73°C), Thigh = 400K (127°C) - safety limits for HVAC applications
- **Initial Conditions**: 
  - h = 294515.75 J/kg (Cp×T = 1005×293.15)
  - T = 293.15K (20°C reference temperature)
  - p_rgh = 0 Pa (hydrostatic pressure)
- **Boussinesq Benefits**: 
  - Density only depends on temperature (not pressure), eliminating p-ρ coupling instability
  - Linear density variation: ρ = pRef/(R×T) is evaluated at reference pressure
  - Numerically stable for temperature differences up to 50°C (HVAC range: 20-40°C)
  - Allows higher relaxation factors and faster convergence than perfectGas

**Boundary Conditions for HVAC Applications (Boussinesq):**
- **Walls**: fixedValue for temperature (T in Kelvin) and enthalpy (h = Cp×T); fixedFluxPressure for p_rgh
- **Windows/Doors (pressure boundaries - pressure_inlet and pressure_outlet)**: 
  - p_rgh: fixedValue 0 (atmospheric pressure reference)
  - U: pressureInletOutletVelocity (inlet) or inletOutlet (outlet)
  - h: zeroGradient (allows temperature to adapt to flow, prevents overconstraining)
  - T: zeroGradient (consistent with h boundary)
  - Critical fix (Nov 2, 2025):
    * zeroGradient h/T (not fixedValue) - fixedValue p_rgh + fixedValue h creates overconstrained system because p_rgh and h are coupled through equation of state (ρ = pRef/(R×T), h = Cp×T)
    * zeroGradient allows temperature/enthalpy to adapt to flow while pressure drives the solution
- **Velocity/Mass Flow Inlets**: fixedValue for h and T (flow direction known, no backflow possible)

**Mesh Generation & Validation Pipeline:**

**Option A - cfMesh (Recommended for HVAC):**
1. surfaceFeatureExtract - Extract geometry features
2. cartesianMesh - Single-command meshing with automatic:
   - Base cartesian mesh generation
   - Surface refinement (pressure boundaries get 2x finer cells)
   - Automatic boundary layer generation (5 layers on openings, 3 on walls)
   - Geometry snapping
3. Python validation - Verify watertight geometry (no background patches)
4. checkMesh - Validate mesh quality
5. Initial conditions preparation - Copy 0.orig to 0
6. decomposePar - Decompose for parallel execution
7. buoyantSimpleFoam - Parallel CFD solver execution
8. Post-processing - Reconstruct and export VTK results

**Option B - snappyHexMesh (For multi-region or rotating machinery):**
1. surfaceFeatureExtract - Extract geometry features for snapping
2. blockMesh - Create background mesh
3. snappyHexMesh - Refined mesh generation (parallel execution in cloud)
4. Python validation - Verify watertight geometry (no background patches)
5. checkMesh - Validate mesh quality (skewness, aspect ratio, non-orthogonality)
6. Initial conditions preparation - Copy 0.orig to 0 (CRITICAL - Nov 1, 2025)
7. decomposePar - Decompose for parallel execution
8. Debug files copy - Copy processor0 files for inspection
9. buoyantSimpleFoam - Parallel CFD solver execution
10. Post-processing - Reconstruct and export VTK results

**Numerical Stability & Solver Configuration (Boussinesq - Nov 1, 2025):**
- **Relaxation Factors (Conservative for Startup Stability)**: 
  - rho: 0.1 (conservative to prevent initial divergence)
  - p_rgh: 0.3
  - U: 0.3
  - h: 0.3 (conservative to prevent h<0 in early iterations)
  - k/epsilon/omega: 0.3
  - Note: Even with Boussinesq, conservative relaxation needed for stable startup
- **Discretization Schemes (Conservative 1st Order)**:
  - All divSchemes: bounded Gauss upwind (1st order, monotonic)
  - gradSchemes limiter: 0.5 (balanced)
  - laplacianSchemes limiter: 0.5 (balanced)
  - snGradSchemes: limited 0.5 (handles non-orthogonality well)
- **SIMPLE Settings**: nNonOrthogonalCorrectors = 3, consistent = yes
- **Residual Control**: p_rgh, U, h all converge to 1e-4

**Key Design Decisions:**
- **Migration to Boussinesq (Nov 1, 2025)**: After systematic debugging, perfectGas + pressure boundaries showed fundamental instability (exponential divergence in density despite ultra-conservative settings). Boussinesq approximation (incompressiblePerfectGas + hConst) eliminates p-ρ coupling, providing numerical stability for HVAC applications with ΔT <50°C
- hConst thermo model with sensibleEnthalpy variable (h = Cp×T) provides linear energy equation
- Density calculation ρ = pRef/(R×T) uses constant reference pressure, breaking the circular dependency between pressure field and density that caused perfectGas divergence
- **zeroGradient h/T on pressure boundaries (Critical Fix - Nov 2, 2025)**: fixedValue p_rgh + fixedValue h creates overconstrained system because p_rgh and h are coupled through equation of state (ρ = pRef/(R×T), h = Cp×T). Solution: Use zeroGradient for h and T on pressure_inlet/outlet, allowing temperature to adapt to flow while pressure drives the solution
- **cfMesh Implementation for HVAC (Nov 2, 2025)**: Implemented cfMesh as recommended meshing strategy for HVAC applications with pressure boundaries (windows/doors/vents). Key benefits:
  - **Automatic boundary layers**: >90% coverage vs <50% with snappyHexMesh, critical for accurate near-wall thermal/velocity profiles for PMV/PPD calculations
  - **Differentiated refinement**: Pressure boundaries automatically get 2x finer cells (5cm) than walls (10cm), resolving velocity/pressure gradients correctly without manual tuning
  - **2-5x faster**: Single-command workflow (`cartesianMesh`) vs multi-stage snappyHexMesh (blockMesh → surfaceFeatureExtract → snappyHexMesh)
  - **More robust**: Fewer parameters to tune, works "first try" in majority of HVAC cases
  - Implementation in `src/components/mesh/cfmesh.py` with templates in `data/settings/mesh/cfmesh/`
- **0.orig → 0 copy before decomposePar (Critical Fix - Nov 1, 2025)**: setup() writes fresh Boussinesq fields (h, T, p_rgh) to 0.orig/, but decomposePar was using stale 0/ directory with old perfectGas fields (e). This caused h<0 → ρ<0 crash from iteration 1. Explicit `rm -rf 0 && cp -r 0.orig 0` before decomposePar ensures fresh fields are used
- **Stability Test Mode for Debugging**: STABILITY_TEST_MODE flag (line 171 in hvac.py) forces all patches to wall BCs with uniform initial conditions, isolating whether crashes are BC-related or numerical-scheme-related. Wall-only test converged successfully (30 iterations), confirming solver is numerically stable and problem was in pressure boundary configuration
- Comprehensive debug logging at initialization enables rapid troubleshooting of boundary conditions
- checkMesh validation prevents mesh quality issues before expensive solver runs  
- Dynamic controlDict patch generation automatically updates VTK sampling surfaces based on actual floor/ceiling patches from mesh (floor_0F, ceil_1F, etc.) preventing patch naming mismatches
- Configurable iterations via simulationType parameter with fail-safe defaults ensures graceful degradation if type is missing
- **perfectGas Lessons Learned**: perfectGas with pressure boundaries creates exponential divergence due to p-ρ-T coupling; no amount of conservative discretization (upwind) or relaxation (rho=0.005) can stabilize this fundamental numerical instability
- **Overconstrained BCs Lessons Learned (Nov 2, 2025)**: In buoyantSimpleFoam with Boussinesq, cannot specify both p_rgh and h/T independently on same boundary because they are coupled via equation of state. fixedValue p_rgh + fixedValue h causes immediate crash (h<0 in iteration 1). Correct solution: fixedValue p_rgh + zeroGradient h/T
- **0.orig/ vs 0/ Lessons Learned**: decomposePar reads from 0/, not 0.orig/. If 0.orig/ is not copied to 0/ before decomposePar, the solver starts with stale/inconsistent fields, causing immediate crashes. Always copy 0.orig → 0 before decomposePar
- **Meshing Strategy Lessons Learned (Nov 2, 2025)**: snappyHexMesh with uniform refinement level (0 2) on all patches insufficient for HVAC pressure boundaries. Root cause: Pressure boundaries require finer mesh to resolve ∇p gradients correctly, preventing advection-driven instability (U·∇h producing h<0). cfMesh's automatic differentiated refinement (pressure boundaries 2x finer than walls) solves this inherently, while snappyHexMesh requires manual refinementRegions tuning

## External Dependencies

### Core Libraries
- **Three.js**: 3D graphics and rendering.
- **Drizzle ORM**: Type-safe database operations.
- **Neon Database**: Serverless PostgreSQL hosting.
- **Passport.js**: Authentication middleware.
- **React Query**: Server state management and caching.
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
- **shadcn/ui**: UI components for tables and modals.
- **react-resizable-panels**: For resizable UI components.

### Development Tools
- **TypeScript**: Static type checking.
- **Vite**: Build tool and development server.
- **ESBuild**: Fast JavaScript bundling.