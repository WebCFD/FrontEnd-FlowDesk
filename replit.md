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
  - p_rgh: fixedFluxPressure (allows natural pressure adjustment)
  - U: pressureInletOutletVelocity (inlet) or inletOutlet (outlet)
  - h: inletOutlet with inletValue = Cp×293.15 (allows bidirectional flow, backflow at 20°C)
  - T: inletOutlet with inletValue = 293.15K (allows bidirectional flow, backflow at 20°C)
  - Note: With Boussinesq, energy equation is linear (h = Cp×T) so numerical stability is much better than perfectGas
- **Velocity/Mass Flow Inlets**: fixedValue for h and T (flow direction known, no backflow possible)

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

**Numerical Stability & Solver Configuration (Boussinesq - Nov 1, 2025):**
- **Relaxation Factors (Moderate for Boussinesq Stability)**: 
  - rho: 0.7 (much higher than perfectGas 0.005 - Boussinesq is stable)
  - p_rgh: 0.3
  - U: 0.7
  - h: 0.9 (enthalpy equation is linear with Boussinesq)
  - k/epsilon/omega: 0.7
  - Note: Higher relaxation factors possible because Boussinesq eliminates p-ρ coupling instability
- **Discretization Schemes (Balanced Accuracy/Stability)**:
  - div(phi,U): bounded Gauss linearUpwind (2nd order for momentum)
  - div(phi,h): bounded Gauss upwind (1st order for energy - conservative)
  - gradSchemes limiter: 0.5 (balanced)
  - laplacianSchemes limiter: 0.5 (balanced)
  - snGradSchemes: limited 0.5 (handles non-orthogonality well)
- **SIMPLE Settings**: nNonOrthogonalCorrectors = 3, consistent = yes
- **Residual Control**: p_rgh, U, h all converge to 1e-4

**Key Design Decisions:**
- **Migration to Boussinesq (Nov 1, 2025)**: After systematic debugging, perfectGas + pressure boundaries showed fundamental instability (exponential divergence in density despite ultra-conservative settings). Boussinesq approximation (incompressiblePerfectGas + hConst) eliminates p-ρ coupling, providing numerical stability for HVAC applications with ΔT <50°C
- hConst thermo model with sensibleEnthalpy variable (h = Cp×T) provides linear energy equation
- Density calculation ρ = pRef/(R×T) uses constant reference pressure, breaking the circular dependency between pressure field and density that caused perfectGas divergence
- inletOutlet boundary type for h/T fields on pressure boundaries allows bidirectional flow while maintaining thermodynamic consistency
- fixedFluxPressure on openings allows natural pressure field development in buoyancy-driven flows
- Higher relaxation factors (rho=0.7, h=0.9) possible with Boussinesq due to linear coupling
- Comprehensive debug logging at initialization enables rapid troubleshooting of boundary conditions
- checkMesh validation prevents mesh quality issues before expensive solver runs  
- Dynamic controlDict patch generation automatically updates VTK sampling surfaces based on actual floor/ceiling patches from mesh (floor_0F, ceil_1F, etc.) preventing patch naming mismatches
- Configurable iterations via simulationType parameter with fail-safe defaults ensures graceful degradation if type is missing
- **perfectGas Lessons Learned**: perfectGas with pressure boundaries creates exponential divergence due to p-ρ-T coupling; no amount of conservative discretization (upwind) or relaxation (rho=0.005) can stabilize this fundamental numerical instability

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