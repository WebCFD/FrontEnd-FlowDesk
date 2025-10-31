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

### CFD Configuration & Physics (Updated October 31, 2025)

**Thermophysical Model:**
- **Solver**: buoyantSimpleFoam with Boussinesq approximation
- **Energy Field**: Sensible enthalpy (h) as primary solved variable
- **Temperature Reference**: T_ref = 293.15 K (20°C) for Boussinesq approximation
- **Enthalpy Formulation**: h = Cp × (T - T_ref), where h = 0 at reference temperature
- **Fluid Properties**: Air with Cp = 1005 J/(kg·K), Pr = 0.7, ρ₀ = 1.225 kg/m³

**Boundary Conditions for HVAC Applications:**
- **Walls**: fixedValue for temperature and enthalpy, fixedFluxPressure for p_rgh
- **Windows/Doors (pressure boundaries)**: 
  - p_rgh: fixedFluxPressure (allows natural pressure adjustment)
  - U: pressureInletOutletVelocity (inlet) or inletOutlet (outlet)
  - h: fixedValue (inlet) or inletOutlet (outlet) with Boussinesq reference
  - Critical: NEVER use fixedValue for p_rgh on openings - prevents natural flow development
- **Mass Flow Inlets**: flowRateInletVelocity for velocity-driven boundaries

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

**Key Design Decisions:**
- Enthalpy as energy variable ensures stability and compatibility with Boussinesq density model
- fixedFluxPressure on openings allows natural pressure field development in buoyancy-driven flows
- Comprehensive debug logging at initialization enables rapid troubleshooting of boundary conditions
- checkMesh validation prevents mesh quality issues before expensive solver runs

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