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

**Thermophysical Model:**
- **Solver**: buoyantSimpleFoam with perfectGas equation of state
- **Equation of State**: perfectGas (ideal gas law: ρ = p/(R×T)) - supports large temperature differences (20-40°C)
- **Thermo Model**: eConst (constant internal energy) - required for perfectGas compatibility
- **Energy Variable**: sensibleInternalEnergy (e = Cv×T internally, h = e + p/ρ for boundary conditions)
- **Enthalpy Formulation**: h = Cp × T (absolute enthalpy, referenced to T=0K)
- **Fluid Properties**: Air with Cv = 718 J/(kg·K), Cp = 1005 J/(kg·K), Pr = 0.7, molecular weight = 28.9 g/mol
- **Temperature Limits**: Tlow = 200K (-73°C), Thigh = 400K (127°C) - hard clamps prevent negative temperatures
- **Initial Conditions**: 
  - e = 210501.7 J/kg (Cv×T = 718×293.15 for eConst)
  - h = 294515.75 J/kg (Cp×T = 1005×293.15, calculated from e)
  - T = 293.15K (calculated from e: T = e/Cv)
- **Critical**: hConst + perfectGas is incompatible; eConst ensures correct temperature calculation
- **Field 'e' Required**: buoyantSimpleFoam with eConst solves internal energy e, not enthalpy h
- **Temperature Clamping**: OpenFOAM enforces T ∈ [Tlow, Thigh] via limit() function in eConst source code

**Boundary Conditions for HVAC Applications:**
- **Walls**: fixedValue for temperature (T in Kelvin), enthalpy (h = Cp×T), and internal energy (e = Cv×T); fixedFluxPressure for p_rgh
- **Windows/Doors (pressure boundaries - pressure_inlet and pressure_outlet)**: 
  - p_rgh: fixedFluxPressure (allows natural pressure adjustment)
  - U: pressureInletOutletVelocity (inlet) or inletOutlet (outlet)
  - e: inletOutlet with inletValue = Cv×293.15 (allows bidirectional flow, backflow at 20°C)
  - h: inletOutlet with inletValue = Cp×293.15 (allows bidirectional flow, backflow at 20°C)
  - T: inletOutlet with inletValue = 293.15K (allows bidirectional flow, backflow at 20°C)
  - Critical: NEVER use fixedValue for e/h/T on pressure boundaries - creates thermodynamic inconsistency (e=Cv×T must hold) causing divergence
  - Critical: NEVER use fixedValue for p_rgh on openings - prevents natural flow development
- **Velocity/Mass Flow Inlets**: fixedValue for e, h, T (flow direction known, no backflow possible)

**Mesh Generation & Validation Pipeline (Allrun):**
1. surfaceFeatureExtract - Extract geometry features for snapping
2. blockMesh - Create background mesh
3. snappyHexMesh - Refined mesh generation (parallel execution in cloud)
4. Python validation - Verify watertight geometry (no background patches)
5. checkMesh - Validate mesh quality (skewness, aspect ratio, non-orthogonality)
6. Initial conditions preparation - Copy 0.orig to 0
7. Debug logging - Print h, p_rgh, U, and thermophysical properties to log
8. decomposePar - Decompose for parallel execution
9. Debug files copy - Copy processor0 files for inspection
10. buoyantSimpleFoam - Parallel CFD solver execution
11. Post-processing - Reconstruct and export VTK results

**Numerical Stability & Solver Configuration:**
- **Relaxation Factors (Ultra-Conservative for perfectGas Stability - Nov 1, 2025)**: 
  - rho: 0.01 (was 0.1 - drastically reduced to prevent density oscillations)
  - p_rgh: 0.2 (was 0.3 - reduced for stability)
  - U: 0.3 (was 0.5 - reduced)
  - e: 0.1 (was 0.3 - ultra-conservative to prevent temperature oscillations)
  - h: 0.3 (was 0.5 - reduced)
  - Note: These very low values sacrifice convergence speed for stability to test numerical hypothesis
- **Energy Bounds**: eMin = 100,000 J/kg (prevents negative internal energy, ~-110°C safety limit)
- **SIMPLE Settings**: nNonOrthogonalCorrectors = 3, consistent = yes
- **Residual Control**: p_rgh, U, h, e all converge to 1e-4

**Key Design Decisions:**
- eConst thermo model ensures correct temperature calculation with perfectGas (hConst + perfectGas is incompatible)
- Tlow/Thigh temperature limits (200K-400K) act as validators that ABORT if violated, NOT as active clamps (discovered Nov 1, 2025)
- inletOutlet boundary type for e/h/T fields on pressure boundaries (pressure_inlet/pressure_outlet) prevents numerical divergence by:
  - Allowing bidirectional energy flow consistent with free pressure field
  - Maintaining thermodynamic consistency: e = Cv×T must hold at boundaries
  - Preventing oscillations from over-constrained boundary conditions
- fixedValue for e/h/T on pressure boundaries causes fatal thermodynamic conflict: with eConst model, e=Cv×T is enforced, so fixing both e and T independently creates inconsistency → oscillations → negative e values → crash (bugs fixed Nov 1, 2025)
- **Hydrostatic pressure initialization (Nov 1, 2025)**: Field `p` uses `calculated` with `$internalField` on pressure boundaries, allowing solver to compute p = p_rgh + ρ·g·h + p_ref automatically, preventing hydrostatic inconsistency that caused iteration-2 crashes with negative density
- Enthalpy as energy variable ensures stability and compatibility with perfectGas equation of state
- fixedFluxPressure on openings allows natural pressure field development in buoyancy-driven flows
- eMin bound in fvSolution prevents numerical divergence to negative internal energy during solver iterations
- Ultra-conservative relaxation factors (rho=0.01, e=0.1) prevent oscillations with perfectGas EOS
- Comprehensive debug logging at initialization enables rapid troubleshooting of boundary conditions
- checkMesh validation prevents mesh quality issues before expensive solver runs
- Dynamic controlDict patch generation automatically updates VTK sampling surfaces based on actual floor/ceiling patches from mesh (floor_0F, ceil_1F, etc.) preventing patch naming mismatches
- Configurable iterations via simulationType parameter with fail-safe defaults ensures graceful degradation if type is missing

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