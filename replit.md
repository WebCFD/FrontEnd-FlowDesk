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