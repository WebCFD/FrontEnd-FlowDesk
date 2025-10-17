# HVAC Simulation Platform

## Overview

This is a full-stack web application for HVAC (Heating, Ventilation, and Air Conditioning) simulation and design. The platform provides an interactive 3D design environment for creating room layouts, placing furniture, configuring air flow systems, and running thermal simulations. Users can design multi-floor buildings with detailed air entry configurations and export simulation data for analysis. The project aims to provide a comprehensive tool for HVAC professionals and enthusiasts to visualize and analyze thermal dynamics within designed spaces.

## User Preferences

Preferred communication style: Simple, everyday language.
Technical documentation preference: Detailed technical explanations for architectural patterns to enable replication in future development cycles.
Development approach: Favor simple, minimal solutions over complex implementations. Avoid overengineering.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Framework**: Tailwind CSS with Radix UI components
- **3D Graphics**: Three.js for real-time 3D visualization and Canvas3D components
- **State Management**: Zustand for global state management with persistence
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation
- **UI/UX Decisions**:
    - Consistent design using Tailwind CSS and Radix UI.
    - Interactive 3D preview with transparency controls.
    - Configurable material themes for different presentation needs.
    - Wizard-based step-by-step simulation setup process.
    - Responsive layout with configurable canvas and menu panel sizing.
    - Unified button behavior for 2D menu tools.
    - Professional UI elements with shadcn/ui for tables and modals.

### Backend
- **Runtime**: Node.js with Express.js server
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js with local strategy and session-based authentication
- **Session Storage**: PostgreSQL-based session store

### Core Features & Design Patterns
- **3D Design Engine**: Core 3D rendering with Three.js, supporting multi-floor designs, 2D to 3D transformations, and wall extrusion.
- **Furniture and Object System**: Dynamic loading of standard furniture, custom STL import, and management of thermal/airflow properties for each item.
- **Air Flow Simulation**: Configuration of air entries (windows, doors, vents) with detailed properties like flow types (Air Mass Flow, Air Velocity, Pressure), directional controls, and temperature settings.
- **Data Synchronization Pattern (Reactive Store)**: Utilizes Zustand as a centralized reactive store for bidirectional real-time synchronization across 2D editor (Canvas2D), 3D interactive view (Canvas3D), and 3D presentation view (RoomSketchPro). Components subscribe directly to the store to avoid stale data and ensure immediate updates. This pattern emphasizes direct store access and avoids memoization for dynamic data to maintain real-time consistency.
- **Dynamic Canvas Sizing**: Canvas height is dynamically calculated as a percentage of viewport height, with min/max limits for optimal usability.
- **Simulation Validation**: Comprehensive validation for CFD (Computational Fluid Dynamics) simulation integrity, including Insufficient Boundary Conditions (IBC) checks with visual alerts and validation hierarchy.
- **Wall Line Restriction System**: Prevents multiple closed contours per floor, guiding users to create single, well-defined rooms.
- **JSON Import/Export Fidelity**: Robust handling of complex multi-floor designs, including stairs, air entries, and furniture, ensuring complete data preservation and accurate unit conversions (meters to centimeters and vice-versa) across import/export cycles. Achieves perfect reversibility of exported and re-imported designs.
- **Containerized Deployment**: Application is containerized for deployment on Google Cloud Run with automatic scaling.

## External Dependencies

### Core Libraries
- **Three.js**: 3D graphics and rendering engine.
- **Drizzle ORM**: Type-safe database operations.
- **Neon Database**: Serverless PostgreSQL hosting.
- **Passport.js**: Authentication middleware.
- **React Query**: Server state management and caching.

### UI and Styling
- **Radix UI**: Accessible component primitives.
- **Tailwind CSS**: Utility-first styling framework.
- **Lucide React**: Icon library.
- **React Hook Form**: Form validation and handling.
- **shadcn/ui**: UI components for dashboard tables and modals.
- **react-resizable-panels**: For resizable UI panels.

### Development Tools
- **TypeScript**: Static type checking.
- **Vite**: Build tool and development server.
- **ESBuild**: Fast JavaScript bundling.

## CFD Simulation Pipeline (HVAC Applications)

### Overview
Complete end-to-end pipeline for converting user-designed building layouts into OpenFOAM CFD simulations executed on Inductiva cloud, with full results visualization in the web UI.

### Architecture: Dual-Worker System

#### worker_submit.py (Pipeline Steps 1-4)
- **Purpose**: Process pending simulations through geometry, mesh, and CFD setup, then submit to Inductiva cloud
- **Polling Interval**: Every 10 seconds
- **Filter**: Only processes `simulationType='comfort'` or `'renovation'` (ignores other types)
- **Pipeline Steps**:
  1. **JSON → Geometry**: Converts jsonConfig to 3D geometry (VTK format)
  2. **Geometry → Mesh**: Creates snappyHexMesh from geometry
  3. **Mesh → CFD Setup**: Configures OpenFOAM case for HVAC simulation
  4. **Submit to Inductiva**: Uploads case and submits to cloud execution
- **Location**: `/worker_submit.py`

#### worker_monitor.py (Monitoring & Post-Processing)
- **Purpose**: Monitor cloud execution, download results, and run post-processing
- **Polling Interval**: Every 30 seconds
- **Process**:
  1. Query Inductiva API for task status
  2. Download results when task completes
  3. Run post-processing (residuals, VTK visualization, PDF reports)
  4. Copy results to `/public/uploads/{sim_id}/`
  5. Update DB with result paths
- **Location**: `/worker_monitor.py`

### Simulation States (9 Total)

1. **pending**: Initial state, waiting for worker_submit
2. **processing**: Worker_submit processing started
3. **geometry**: Generating 3D geometry
4. **meshing**: Creating mesh
5. **cfd_setup**: Configuring CFD case
6. **cloud_execution**: Running on Inductiva cloud
7. **post_processing**: Downloading and processing results
8. **completed**: Successfully finished with results
9. **failed**: Error occurred

### Database Schema Extensions

#### Simulations Table - New Fields
```typescript
taskId: string              // Inductiva task ID
progress: integer           // 0-100 progress percentage
currentStep: string         // Human-readable current step
errorMessage: string        // Error details if failed
startedAt: timestamp        // Execution start time
completedAt: timestamp      // Execution completion time
result: jsonb              // Result paths: {pdf, vtk, images}
```

### API Endpoints

#### External Endpoints (for workers)
- `GET /api/external/simulations/pending` - Get pending simulations
- `GET /api/external/simulations/cloud_execution` - Get cloud execution simulations
- `PATCH /api/external/simulations/:id` - Update simulation status/progress

### End-to-End Flow

```
1. User → Canvas Design
   ↓
2. Click "Start Simulation" → Select Type (Comfort/Renovation)
   ↓
3. DB: Create simulation with status='pending', jsonConfig={canvas data}
   ↓
4. worker_submit (polls every 10s)
   - Detects pending HVAC simulation
   - Executes pipeline: JSON→Geo→Mesh→CFD→Submit
   - Updates: status='cloud_execution', taskId, progress
   ↓
5. worker_monitor (polls every 30s)
   - Detects cloud_execution simulation
   - Checks Inductiva task status
   - When complete: downloads results
   - Runs post-processing
   - Copies to /public/uploads/
   - Updates: status='completed', result={paths}
   ↓
6. Frontend: Post & Analysis Dashboard
   - Query: GET /api/simulations/completed
   - Display results table
   - User clicks "View Results" → VTK visualization
```

### File Structure

```
cases/
  sim_{id}/
    input.json          # (Not used - DB stores jsonConfig)
    geo/
      geometry.vtk      # 3D geometry
      patch_info.csv    # Boundary patches
    sim/
      Allrun           # OpenFOAM run script
      0.orig/          # Initial conditions
      constant/        # Physical properties
      system/          # Solvers and controls
      output.zip       # Downloaded from Inductiva
    post/
      csv/
        residuals.csv  # Convergence data
      images/
        residuals_plot.png
      obj/             # VTK objects (if any)
      post_report.pdf  # Generated report

public/
  uploads/
    sim_{id}/
      report.pdf       # Copied from post/
      images/
        residuals_plot.png
      vtk/            # VTK files for visualization
```

### Running the Workers

**Important**: Workers must run in separate terminal sessions (not as background daemons)

```bash
# Terminal 1: Submit worker
python3 worker_submit.py

# Terminal 2: Monitor worker  
python3 worker_monitor.py
```

### Python Dependencies

#### Core Pipeline
- `inductiva`: Cloud simulation platform
- `foamlib`: OpenFOAM Python library
- `pymeshlab`: Mesh processing
- `pyvista`: 3D visualization

#### Post-Processing
- `matplotlib`: Plotting
- `pandas`: Data analysis
- `reportlab`: PDF generation
- `numpy`: Numerical operations

### Pipeline Components

#### Step 1: JSON → Geometry (`step01_json2geo.py`)
- Input: jsonConfig dict (from DB)
- Output: `geo/geometry.vtk`, `geo/patch_info.csv`
- Function: `json2geo(json_dict, output_dir)`

#### Step 2: Geometry → Mesh (`step02_geo2mesh.py`)
- Input: `geo/geometry.vtk`
- Output: OpenFOAM mesh in `sim/constant/polyMesh/`
- Function: `geo2mesh(geo_dir, output_dir, type="snappy")`

#### Step 3: Mesh → CFD (`step03_mesh2cfd.py`)
- Input: Meshed case
- Output: Complete OpenFOAM case with boundary conditions
- Function: `mesh2cfd(case_path, type="hvac")`

#### Step 4: Submit to Inductiva (`src/components/solve/inductiva.py`)
- Input: Complete OpenFOAM case
- Output: Inductiva task ID
- Function: `submit_to_inductiva(case_name, sim_path)`

### Post-Processing (`postpro.py`)

Automated post-processing includes:
1. **Residual Analysis**: Parse log files, generate convergence plots
2. **VTK Generation**: Create visualization objects from OpenFOAM results
3. **PDF Report**: Generate summary report with images and statistics
4. **File Organization**: Copy results to public folder for web access

### Verified Functionality ✅

1. **Canvas → jsonConfig**: ✅ Complete capture of design data (walls, airEntries, furniture)
2. **Simulation Creation**: ✅ UI creates simulations with correct status and type
3. **worker_submit**: ✅ Detects pending, executes pipeline, submits to Inductiva
4. **worker_monitor**: ✅ Monitors execution, downloads, post-processes, updates DB
5. **Post & Analysis UI**: ✅ Displays completed simulations with results
6. **Result Storage**: ✅ Files copied to /public/uploads/ and paths saved in DB

### Known Limitations

1. **Worker Execution**: Must run manually in terminal (not as background service)
2. **VTK Visualization**: Basic implementation exists, may need enhancements
3. **Error Handling**: Some edge cases may need additional validation

### Testing

Example test simulation (ID 53):
- Type: comfort
- Status: completed
- Task ID: ruscz6mat4iwwa0vfeod83yvj
- Result: PDF report, residuals plot, VTK files generated
- Visible in Post & Analysis dashboard ✅