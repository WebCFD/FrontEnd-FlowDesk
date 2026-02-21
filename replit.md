# HVAC Simulation Platform

## Overview
This project is a full-stack web application for HVAC simulation and design. It provides an interactive 3D environment for building multi-floor layouts, placing objects, configuring air flow systems, and performing thermal simulations. The platform aims to offer HVAC professionals and enthusiasts a comprehensive tool to visualize and analyze thermal dynamics, export simulation data, and improve building efficiency and comfort. The business vision is to provide a leading solution in the HVAC design software market, enabling significant advancements in sustainable building practices.

## User Preferences
Preferred communication style: Simple, everyday language.
Technical documentation preference: Detailed technical explanations for architectural patterns to enable replication in future development cycles.
Development approach: Favor simple, minimal solutions over complex implementations. Avoid overengineering.

## System Architecture

### UI/UX Decisions
The platform features a consistent design with an interactive 3D preview, configurable themes, a wizard-based simulation setup, responsive layout, and unified 2D menu tools. Pricing plans are displayed on the landing page, offering "Pay as You Go," "Annual Subscription," and "Tailored & Custom Solutions." An administrative panel provides monitoring for worker statuses, system information, and database management for users and simulations with filtering and editing capabilities.

### Technical Implementations
The frontend is built with React 18, TypeScript, and Vite, utilizing Tailwind CSS, Radix UI, and shadcn/ui for the user interface. Three.js and Canvas3D handle 3D graphics, while Zustand manages persistent global state. React Hook Form with Zod is used for form handling. The backend leverages Node.js with Express.js, a PostgreSQL database managed by Drizzle ORM, and Passport.js for session-based authentication.

Key features include a 3D design engine for multi-floor layouts and object placement, dynamic furniture loading with custom STL import, detailed air flow configuration, and real-time data synchronization between 2D/3D views. Comprehensive CFD validation, including Insufficient Boundary Conditions (IBC) checks, is performed. The application supports robust JSON import/export for design data. An email verification system ensures valid user registrations, integrating with a `pending_activations` table and a `sendActivationEmail()` function. Memory management enhancements and subprocess isolation prevent Out of Memory (OOM) kills during post-processing by limiting simultaneous simulation processing and enforcing garbage collection.

**Persistent VTK Storage**: Production deployment uses **Cloudflare R2** for persistent VTK file storage, solving the ephemeral filesystem issue on Cloud Run. After post-processing, `worker_monitor.py` calls `upload_vtk_to_r2.py` to upload all `.vtkjs` files to R2 using the S3-compatible API. Express endpoints (`GET /api/simulations/:id/vtk-files` and `GET /api/simulations/:id/vtk/:filename`) serve VTK files from R2 with automatic fallback to local filesystem for development compatibility. The `server/r2Storage.ts` service manages R2 operations using boto3 (Python) and @aws-sdk/client-s3 (Node.js). R2 credentials are stored as secrets: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, and `R2_BUCKET_NAME`.

### System Design Choices
The application is designed for containerized deployment on Google Cloud Run. It incorporates an end-to-end CFD simulation pipeline that converts user designs into OpenFOAM CFD simulations executed on the Inductiva cloud.

**Pipeline Architecture (4 steps):**
1. **JSON → Geometry** (`step01_json2geo.py`): Local conversion of design data to 3D geometry
2. **Geometry → Mesh Config** (`step02_geo2mesh.py`): Local preparation of mesh configuration files (generates Allmesh script)
3. **Mesh Config → CFD Setup** (`step03_mesh2cfd.py`): Local CFD case configuration (generates Allrun script)
4. **Inductiva Execution** (`step04_cfd2result.py`): Upload case to Inductiva → Execute Allmesh (mesh generation) + Allrun (CFD solve) → Download results

The system utilizes a dual-worker architecture for parallel processing of geometry preparation (local) and simulation execution (Inductiva cloud). The primary meshing strategy uses **cfMesh** (OpenFOAM ESI v2412 with cartesianMesh automatic meshing) executed on Inductiva via `inductiva/kutu:openfoam-cfmesh_v2412_dev`, providing 2-5x faster mesh generation with automatic robust boundary layers (>90% coverage) and differentiated refinement for pressure boundaries. cfMesh does not require blockMesh as cartesianMesh generates the base mesh automatically. Alternative meshing strategies include `hvac_pro` (optimized snappyHexMesh configuration) and `snappy` (basic snappyHexMesh), both compliant with OpenFOAM v2406. 

CFD simulations use `buoyantSimpleFoam` with a Boussinesq approximation and hConst thermo model, employing `zeroGradient` for enthalpy/temperature on pressure boundaries to ensure numerical stability. Configurable simulation types with dynamic iteration control and conservative relaxation factors ensure stable startup and convergence. An orphaned simulation recovery system ensures that simulations stuck in "post_processing" are automatically resumed. Post-processing has been optimized by removing image rendering, PDF report generation, and residual convergence plots to reduce memory usage, focusing instead on VTK file generation for interactive 3D web viewing.

A transactional email system for the landing page contact form is integrated using the Resend API, featuring real-time submission, validation, and notifications. The admin panel includes SHA-256 hashed password authentication for security.

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
- **Resend**: Transactional email service.

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

## Recent Changes (February 2026)

### Face-Based Rack JSON Export (2026-02-21)
Racks are now exported as face-based geometry instead of position/rotation/dimensions. Each rack has 6 faces (front, back, left, right, top, bottom), each defined by 4 vertices in global coordinates (meters). Inlet/outlet faces carry server properties (`rackDensity`, `thermalPower_kW`, `airFlow`), wall faces carry chassis properties (`material`, `emissivity`). The `thermalPower` field was renamed to `thermalPower_kW`. Load path supports both face-based format and legacy position/dimensions format for backwards compatibility.

**Files Modified**: `client/src/lib/simulationDataConverter.ts`, `client/src/pages/dashboard/wizard-design.tsx`, `client/src/components/sketch/FurnitureDialog.tsx`, `shared/furniture-types.ts`

## Recent Changes (November 2025)

### Production Encoding Fix (2025-11-30)
**Problem**: Cloud Run container rebuild changed default locale from UTF-8 to ASCII, breaking Python imports of files containing degree symbols (°C). Simulations failed during post-processing with `'ascii' codec can't decode byte 0xc2` errors.

**Solution**: Multi-layered UTF-8 enforcement:
1. Added `# -*- coding: utf-8 -*-` headers to all Python files in post-processing pipeline
2. Configured `TextIOWrapper` with `errors='replace'` for stdout/stderr in `step05_results2post.py`
3. Set `PYTHONIOENCODING=utf-8`, `LC_ALL=C.UTF-8`, `LANG=C.UTF-8` in subprocess environment
4. Replaced special characters (°C → degC) in data labels for ASCII safety

**Files Modified**: `step05_results2post.py`, `src/components/post/objects.py`, `src/components/post/calculate_comfort.py`, `src/components/tools/export_debug.py`

### OOM Prevention in Post-Processing (2025-11-30)
**Problem**: PyVista loading full OpenFOAM cases caused silent OOM kills on Cloud Run (SIGKILL -9/137) during mesh loading.

**Solution**: 
1. **Memory-efficient loading**: Modified `load_foam_results()` to first attempt loading pre-generated VTK files from `sim/VTK/` directory (created by foamToVTK on Inductiva), falling back to FOAM reader only if VTK files unavailable
2. **OOM detection**: Added SIGKILL detection in `worker_monitor.py` to display clear "Out of Memory" error message instead of cryptic failures
3. **Memory monitoring**: Added psutil-based memory tracking to log RAM usage during mesh loading for diagnostics

**Files Modified**: `src/components/tools/export_debug.py`, `worker_monitor.py`

### MVP Status
The HVAC simulation platform is now fully functional with:
- End-to-end CFD simulation pipeline (JSON → Geometry → Mesh → CFD → Results)
- cfMesh integration for fast automatic meshing
- PMV/PPD thermal comfort calculations
- VTK visualization with R2 persistent storage
- Production-ready deployment on Cloud Run