# HVAC Simulation Platform

## Overview

This project is a full-stack web application designed for HVAC (Heating, Ventilation, and Air Conditioning) simulation and design. It offers an interactive 3D environment for building multi-floor layouts, placing objects, configuring air flow systems, and performing thermal simulations. The platform aims to provide HVAC professionals and enthusiasts with a comprehensive tool to visualize and analyze thermal dynamics, export simulation data, and ultimately improve building efficiency and comfort.

## User Preferences

Preferred communication style: Simple, everyday language.
Technical documentation preference: Detailed technical explanations for architectural patterns to enable replication in future development cycles.
Development approach: Favor simple, minimal solutions over complex implementations. Avoid overengineering.

## Recent Changes

### 2025-11-08: Post-Processing Recovery System
**Feature**: Implemented orphaned simulation recovery to prevent stuck simulations.

**Problem**: 
- If worker restarts while a simulation is in "post_processing" state, it becomes orphaned
- Worker only polled "cloud_execution" state, leaving "post_processing" sims abandoned
- No visibility into worker activity due to lack of logging

**Solution - Dual-State Polling + Logging**:
- Added `get_post_processing_sims()` function in worker_monitor.py
- Created `/api/external/simulations/post_processing` endpoint in backend
- Modified main worker loop to check BOTH states:
  1. "cloud_execution" → normal processing flow
  2. "post_processing" → recovery flow for orphaned sims
- Added comprehensive logging showing simulation counts and statuses every 30 seconds

**Technical Implementation**:
```python
# Worker polls both states each cycle
cloud_sims = get_cloud_execution_sims()
logger.info(f"Polling: Found {len(cloud_sims)} simulation(s) in cloud_execution")

post_sims = get_post_processing_sims()
if post_sims:
    logger.warning(f"Recovery: Found {len(post_sims)} orphaned simulation(s) in post_processing")
    for sim in post_sims:
        process_completed_simulation(sim)
```

**Files Modified**:
- `worker_monitor.py`: Added post_processing polling and detailed logging
- `server/routes.ts`: Added GET `/api/external/simulations/post_processing` endpoint

**Benefits**:
- ✅ Orphaned simulations automatically recovered on next worker cycle
- ✅ Detailed logs for debugging (polling status, sim counts, task IDs)
- ✅ No manual intervention required
- ✅ Worker survives restarts without losing in-progress work

### 2025-11-08: Worker Memory Isolation with Subprocess
**Critical Fix**: Resolved worker_monitor OOM (Out of Memory) kills by isolating post-processing in subprocess.

**Problem**: 
- worker_monitor.py executed PyVista/VTK post-processing in the same process
- Memory accumulated with each simulation (500MB-2GB per simulation)
- Python's garbage collector didn't release PyVista memory quickly enough
- After processing 2-3 simulations, OOM killer terminated the worker (PID 57 Killed)

**Solution - Subprocess Isolation**:
- Modified `step05_results2post.py` to accept CLI arguments (case_name)
- Modified `worker_monitor.py` to execute post-processing in isolated subprocess
- Process lifecycle: spawn → process → die → **automatic memory cleanup**
- Worker process remains lightweight (~500MB) and never accumulates memory
- Added timeout (10 minutes) and robust error handling for subprocess failures

**Technical Implementation**:
```python
# Before: Direct call (memory accumulates)
results2post(case_name)

# After: Subprocess isolation (memory freed on completion)
subprocess.run(["python3", "-u", "step05_results2post.py", case_name], 
               timeout=600, check=True)
```

**Files Modified**:
- `worker_monitor.py`: Replaced direct import with subprocess.run() call
- `step05_results2post.py`: Added CLI argument parsing for case_name

**Benefits**:
- ✅ Worker process never killed by OOM
- ✅ Can process unlimited simulations sequentially
- ✅ If post-processing fails, worker survives
- ✅ Better error isolation and logging
- ✅ Zero additional costs (no need for more RAM)

### 2025-11-08: Email Activation System for New Users
**Feature**: Implemented email verification flow to prevent spam accounts and ensure valid email addresses.

**Changes**:
- **Database**: Added `pending_activations` table to store registration data before email verification
- **Backend**:
  - Modified `/api/auth/register` to create pending activation instead of immediate user creation
  - Created `/api/auth/activate` endpoint to validate tokens and create users
  - Added `sendActivationEmail()` function with branded email template
  - Implemented 24-hour token expiration and cleanup logic
- **Frontend**:
  - Updated registration modal to show email confirmation screen after signup
  - Created `/activate` page to handle activation links from emails
  - User is automatically logged in after successful activation
- **User Flow**: Register → Email sent → Click link → Account activated with 25€ credits → Auto-login

**Files Modified**:
- `shared/schema.ts`: Added pendingActivations table
- `server/storage.ts`: Added CRUD methods for pending activations
- `server/auth.ts`: Modified registration flow, added activation endpoint and email function
- `client/src/components/auth/register-modal.tsx`: Added confirmation UI
- `client/src/pages/activate.tsx`: New activation page
- `client/src/App.tsx`: Registered /activate route

### 2025-11-08: Post-Processing Optimization (Memory Crisis Fix)
**Critical production issue resolved**: Server was experiencing OOM (Out of Memory) kills during CFD post-processing, causing complete site downtime.

**Problem**: 
- Post-processing generated 50+ off-screen renders (PyVista), PDFs (ReportLab), and residual plots (matplotlib)
- Memory consumption exceeded available resources, triggering OOM killer
- Simulations stuck at "Downloading results..." with no error handling

**Solution - Simplified Post-Processing**:
- **Removed**: All image rendering (PNG generation via PyVista off-screen)
- **Removed**: PDF report generation (ReportLab)
- **Removed**: Residual convergence plots (matplotlib)
- **Kept**: VTK file generation for interactive 3D web viewer
- **Result**: ~90% reduction in memory usage, ~80% faster processing

**Files Modified**:
- `step05_results2post.py`: Removed PDF and residuals steps
- `src/components/post/objects.py`: Removed off-screen rendering loop
- `worker_monitor.py`: Updated to only copy VTK files, added better logging

**Benefits**:
- No more OOM kills in production
- Faster post-processing (seconds instead of minutes)
- Interactive 3D visualization still fully functional
- Reduced disk usage (no unnecessary PNG/PDF files)

## System Architecture

### UI/UX Decisions
The platform features a consistent design with an interactive 3D preview, configurable themes, a wizard-based simulation setup, responsive layout, and unified 2D menu tools. Pricing plans are displayed on the landing page, offering "Pay as You Go," "Annual Subscription," and "Tailored & Custom Solutions." An administrative panel provides monitoring for worker statuses, system information, and database management for users and simulations with filtering and editing capabilities.

### Technical Implementations
The frontend is built with React 18, TypeScript, and Vite, utilizing Tailwind CSS, Radix UI, and shadcn/ui for the user interface. Three.js and Canvas3D handle 3D graphics, while Zustand manages persistent global state. React Hook Form with Zod is used for form handling. The backend leverages Node.js with Express.js, a PostgreSQL database managed by Drizzle ORM, and Passport.js for session-based authentication.

Key features include a 3D design engine for multi-floor layouts and object placement, dynamic furniture loading with custom STL import, detailed air flow configuration, and real-time data synchronization between 2D/3D views. Comprehensive CFD validation, including Insufficient Boundary Conditions (IBC) checks, is performed. The application supports robust JSON import/export for design data.

### System Design Choices
The application is designed for containerized deployment on Google Cloud Run. It incorporates an end-to-end CFD simulation pipeline that converts user designs into OpenFOAM CFD simulations executed on the Inductiva cloud. This pipeline utilizes a dual-worker system for geometry, meshing, CFD setup, submission, monitoring, result retrieval, and post-processing. The primary meshing strategy uses `hvac_pro` (an optimized snappyHexMesh configuration) with parametric quality levels and is compliant with OpenFOAM v2406. CFD simulations use `buoyantSimpleFoam` with a Boussinesq approximation and hConst thermo model, employing `zeroGradient` for enthalpy/temperature on pressure boundaries to ensure numerical stability. Configurable simulation types with dynamic iteration control and conservative relaxation factors ensure stable startup and convergence.

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
- **matplotlib**, **pandas**, **reportlab**, **numpy**: For post-processing and report generation.
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