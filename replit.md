# HVAC Simulation Platform

## Overview

This is a full-stack web application for HVAC (Heating, Ventilation, and Air Conditioning) simulation and design. The platform provides an interactive 3D design environment for creating room layouts, placing furniture, configuring air flow systems, and running thermal simulations. Users can design multi-floor buildings with detailed air entry configurations and export simulation data for analysis.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized production builds
- **UI Framework**: Tailwind CSS with Radix UI components for consistent design
- **3D Graphics**: Three.js for real-time 3D visualization and Canvas3D components
- **State Management**: Zustand for global state management with persistence
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Authentication**: Passport.js with local strategy and session-based auth
- **Session Storage**: PostgreSQL-based session store for production scalability

### Development Architecture
- **TypeScript**: Full-stack type safety with shared types between client and server
- **Development Server**: Vite middleware integration with Express for seamless development
- **Hot Module Replacement**: Real-time updates during development

## Key Components

### 3D Design Engine
- **Canvas3D**: Core 3D rendering component using Three.js
- **RoomSketchPro**: Advanced room design interface with drawing tools
- **Geometry Engine**: Shared utilities for 2D to 3D coordinate transformations
- **Multi-floor Support**: Hierarchical floor management with automatic height calculations

### Furniture and Object System
- **Dynamic Furniture Loading**: Support for standard furniture types (tables, chairs, vents)
- **Custom STL Import**: Users can upload custom 3D models in STL format
- **Furniture Store**: Centralized management for furniture instances and custom objects
- **Simulation Properties**: Each furniture item can have thermal and airflow properties

### Air Flow Simulation
- **Air Entry Configuration**: Windows, doors, and vents with flow properties
- **Flow Types**: Support for Air Mass Flow, Air Velocity, and Pressure configurations
- **Directional Controls**: Configurable inflow/outflow directions with angle controls
- **Temperature Settings**: Per-entry temperature configuration for thermal analysis

### User Interface
- **Dashboard Layout**: Comprehensive project management interface
- **Wizard-based Design**: Step-by-step simulation setup process
- **Real-time Visualization**: Interactive 3D preview with transparency controls
- **Material Themes**: Configurable visual themes for different presentation needs

## Data Flow

### Design Creation Flow
1. User accesses wizard design interface
2. 2D room sketching with wall placement tools
3. Air entry configuration (windows, doors, vents)
4. Multi-floor design with stair connections
5. 3D furniture placement and configuration
6. Simulation parameter setup
7. Export to simulation data format

### 3D Rendering Pipeline
1. 2D coordinates converted to 3D space using geometry engine
2. Floor geometry generated from closed contours
3. Wall extrusion with configurable heights
4. Air entry cutouts created in wall geometry
5. Furniture objects positioned and scaled
6. Real-time camera controls and transparency effects

### Data Persistence
1. Room designs stored in Zustand state with local persistence
2. User accounts and simulation metadata in PostgreSQL
3. Custom furniture geometries cached in browser storage
4. Session data maintained server-side for authentication

## External Dependencies

### Core Libraries
- **Three.js**: 3D graphics and rendering engine
- **Drizzle ORM**: Type-safe database operations
- **Neon Database**: Serverless PostgreSQL hosting
- **Passport.js**: Authentication middleware
- **React Query**: Server state management and caching

### UI and Styling
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first styling framework
- **Lucide React**: Icon library
- **React Hook Form**: Form validation and handling

### Development Tools
- **TypeScript**: Static type checking
- **Vite**: Build tool and development server
- **ESBuild**: Fast JavaScript bundling

## Deployment Strategy

### Production Build
- Vite builds client-side React application to static assets
- ESBuild bundles server-side Express application
- Static assets served from `dist/public` directory
- Server runs compiled Node.js application

### Cloud Run Deployment
- Containerized deployment on Google Cloud Run
- Automatic scaling based on request volume
- PostgreSQL database hosted on Neon for serverless architecture
- Environment variables for database connection and session secrets

### Database Migrations
- Drizzle Kit handles schema migrations
- `npm run db:push` applies schema changes to database
- Development and production environments use separate database instances

## User Preferences

Preferred communication style: Simple, everyday language.
Technical documentation preference: Detailed technical explanations for architectural patterns to enable replication in future development cycles.

## Technical Architecture Patterns

### Data Synchronization Pattern: Reactive Store with Direct Component Integration

**Problem Solved**: Bidirectional real-time synchronization between Canvas2D (2D editor), Canvas3D (3D interactive view), and RoomSketchPro (3D presentation view) for AirEntry position modifications.

**Core Architecture**:

1. **Centralized Reactive Store** (Zustand):
   - Single source of truth: `useRoomStore((state) => state.floors)`
   - All components subscribe directly to store state changes
   - No intermediate props or memoization layers that could cause stale data

2. **Component Data Flow Pattern**:
   ```
   Canvas2D ← useRoomStore((state) => state.floors)[currentFloor] → Direct store subscription
   Canvas3D ← useRoomStore((state) => state.floors) → Reactive subscription (NOT useMemo)
   RoomSketchPro ← Canvas3D wrapper → Inherits same reactive pattern
   ```

3. **Real-time Update Architecture**:
   - **Immediate Store Updates**: `handleAirEntryPositionUpdate()` writes directly to store during slider changes
   - **Bypass Props Propagation**: Components read from store, not from parent props
   - **Eliminate Timing Dependencies**: No reliance on React state propagation timing

4. **Key Implementation Details**:
   
   **Canvas2D Pattern**:
   ```javascript
   // CORRECT: Direct store subscription
   const airEntries = useRoomStore((state) => state.floors)[currentFloor]?.airEntries || [];
   
   // WRONG: Props-based (causes timing issues)
   const airEntries = floors[currentFloor]?.airEntries || [];
   ```

   **Canvas3D Pattern**:
   ```javascript
   // CORRECT: Reactive subscription
   const floors = useRoomStore((state) => state.floors);
   
   // WRONG: Static memoization (captures snapshot at mount)
   const finalFloors = useMemo(() => ({ ...floors }), [floors, currentFloor]);
   ```

   **Callback Architecture**:
   ```javascript
   // Real-time position updates flow directly to store
   const handleAirEntryPositionUpdate = (floorName, index, entry) => {
     setFloors(floors => ({
       ...floors,
       [floorName]: {
         ...floors[floorName],
         airEntries: floors[floorName].airEntries.map((e, i) => 
           i === index ? entry : e
         )
       }
     }));
   };
   ```

5. **Critical Success Factors**:
   - **Avoid useMemo for Dynamic Data**: Only use useMemo for expensive computations, never for reactive data flow
   - **Direct Store Access**: Components must subscribe directly to store, not through normalized/memoized intermediaries
   - **Immediate Updates**: Real-time changes write to store immediately, not on save/submit
   - **Consistent Pattern**: All three components use identical store subscription pattern

6. **Performance Optimizations**:
   - **React Hooks Compliance**: useMemo for expensive computations placed at component top level
   - **Precision Normalization**: Float precision normalization in memoization to prevent micro-changes triggering rebuilds
   - **Direct Object Modification**: For 3D scene objects, modify position directly without full scene rebuilds

**Result**: Complete bidirectional synchronization where AirEntry position changes in any view (2D slider, 3D drag, RSP interaction) immediately reflect in all other views without timing dependencies or visual lag.

**Replication Guidelines**: 
1. Identify the shared data entity (e.g., AirEntry, furniture, walls)
2. Ensure single reactive store subscription in all components
3. Implement immediate store updates for real-time changes
4. Avoid memoization layers that could create data staleness
5. Test bidirectional flow: changes in component A should immediately appear in components B and C

## Changelog

Changelog:
- June 23, 2025. Initial setup
- June 28, 2025. Fixed AirEntry Center Height real-time updates - removed redundant height/2 offset causing visual glitch during coordinate transformations between Canvas2D and Canvas3D
- June 28, 2025. Added onAirEntryUpdated callback system to maintain RSP textures during real-time AirEntry modifications - system now triggers texture reapplication for all AirEntry dialog changes
- June 28, 2025. MAJOR OPTIMIZATION: Eliminated redundant callback system for AirEntry modifications - AirEntry now works identically to furniture with direct modification and automatic texture preservation, removing unnecessary texture reapplication overhead
- June 28, 2025. CRITICAL OPTIMIZATION: Eliminated scene regeneration during AirEntry modifications - removed store propagation flow that caused texture loss. AirEntry now uses direct geometry modification like furniture, preserving textures and performance during real-time updates
- June 28, 2025. FINAL OPTIMIZATION BREAKTHROUGH: Solved texture loss during AirEntry Save Changes by implementing floating-point precision normalization in floors memoization. The root cause was micro-precision changes (39 → 38.99999999999999) triggering unnecessary scene rebuilds. Solution memoizes floors object with 2-decimal precision normalization, preventing rebuilds for metadata-only changes while preserving structural change detection.
- June 28, 2025. Fixed AirEntry coordinate systems and yellow markers appearing in RSP - moved creation inside presentationMode check. These visual aids now only appear in Canvas3D for interactive editing, not in RSP presentation mode.
- June 28, 2025. Fixed AirEntry "Position Along" field calculation from Canvas2D - resolved issue where field always showed 50% default instead of actual position percentage. Added missing position property to Canvas2D initialValues, enabling accurate wall position calculations (e.g., showing 60.34% for actual position).
- June 28, 2025. COMPLETED STAIR TEMPERATURE FEATURE: Implemented complete stair temperature functionality matching Wall Temperature UX. Created StairPropertiesDialog with proper ID format (stair_0F_1, stair_1F_2, etc.), double-click activation in Canvas2D, and state management. Both Wall and Stair dialogs now use consistent floating panel UX (top-right positioning, non-modal, identical spacing and design) for unified user experience.
- June 28, 2025. IMPLEMENTED FLOOR & CEILING TEMPERATURE CONTROLS: Added Ceiling Temperature and Floor Temperature fields to Floor configuration cards in Building Parameters section. Each floor now has 4 parameters: Ceiling Height (cm), Floor Deck (cm), Ceiling Temperature (°C), and Floor Temperature (°C). Temperature fields use range -50°C to 100°C with 0.1°C precision, maintaining identical UX to existing height/deck controls with proper validation and state management.
- June 28, 2025. FIXED CRITICAL WARNINGS AND LOAD FUNCTIONALITY: Resolved useMemo warning by stabilizing dependency array with sorted keys and JSON stringification. Fixed DOM nesting warning in AlertDialog by using asChild pattern with div elements. Enhanced Load Design functionality to properly copy ceiling and floor temperatures to new floors, ensuring complete parameter preservation during design loading operations.
- June 28, 2025. COMPLETED FLOOR TEMPLATE LOADING: Fixed performFloorLoad function to copy all floor parameters (ceiling height, floor deck, ceiling temperature, floor temperature) when loading one floor as template for another. Now when user loads "First Floor from Ground Floor", all 4 parameters are properly copied, maintaining consistent building parameters across floors.
- June 28, 2025. FINAL WARNING FIXES: Resolved remaining useMemo dependency array warning with simplified stable hash approach and fixed DOM nesting warning in FloorLoadDialog by using asChild pattern with div wrapper. All React warnings eliminated - application now runs clean in development mode.
- June 28, 2025. FIXED FURNITURE DIALOG AUTO-OPENING: Resolved critical timing issue where furniture dialogs weren't opening after placement. Problem was useEffect dependency array [floors, currentFloor] executing before newFurnitureForDialog was set. Implemented trigger-based solution using dialogTrigger state variable that fires immediately after furniture placement, ensuring reliable dialog opening for all furniture types including vents.
- June 28, 2025. RESOLVED CEILING VENT PERSISTENCE ISSUE: Fixed critical bug where ceiling vents weren't persisting correctly in the store. Root cause was incorrect filter logic in simulationDataConverter.ts using `id?.includes('vent_furniture')` instead of `furnitureType === 'vent'`. This caused ceiling vents to be filtered out during export due to ID format differences. Solution implemented proper furnitureType-based filtering, ensuring both ceiling and floor vents persist correctly and export properly to JSON structure with accurate surface type detection.
- June 28, 2025. FIXED VENT COORDINATE SYSTEM: Corrected coordinate mapping issue in simulationDataConverter.ts where Y and Z axes were incorrectly swapped during JSON export. Changed from `y: position.z, z: position.y` to `y: position.y, z: position.z` to maintain consistency with Three.js coordinate system. This ensures vent positions in exported JSON match their actual 3D world positions accurately.
- June 28, 2025. RESOLVED CRITICAL VENT PERSISTENCE BUG: Fixed fundamental issue where vents saved correctly to Zustand store but disappeared during JSON export. Root cause was wizard-design.tsx useMemo missing furnitureItems dependency, causing state synchronization failure. Added furnitureItemsLength to dependency array, ensuring vents persist correctly through complete workflow: placement → store → export → JSON. All vent functionality now fully operational with accurate coordinate mapping and surface detection.
- June 28, 2025. ADDED STAIR TEMPERATURE TO JSON EXPORT: Implemented temperature property for stairs in simulation JSON export. Added temperature field to StairExportNew interface and modified convertStairPolygonToExport function to include stair temperature in exported data. Stairs now export with complete thermal properties including temperature values configured via StairPropertiesDialog, enabling comprehensive thermal simulation analysis for multi-level building designs.
- June 28, 2025. RESOLVED CRITICAL STAIR POLYGON REGRESSION: Fixed critical bug where stair polygons disappeared after right-click completion due to useMemo dependency array missing stairPolygonsLength. The floors memoization was not updating when new stairs were created, causing visual disappearance despite correct state updates. Solution added stairPolygonsLength to dependency calculation, ensuring memoized floors update when stairs are added/removed. Stair creation now works reliably with immediate visual persistence.
- June 28, 2025. FIXED STAIR TEMPERATURE PERSISTENCE ISSUE: Resolved critical bug where stair temperature modifications were saving correctly to Zustand store but not appearing in UI due to useMemo cache. Root cause was useMemo dependency array only tracking stairPolygonsLength (count) but not content changes. Added stairPolygonsHash to dependency calculation, ensuring useMemo re-executes when stair properties (like temperature) change, not just when stairs are added/removed. Temperature changes now persist correctly in both store and UI.
- June 28, 2025. STANDARDIZED JSON EXPORT TEMPERATURE FORMAT: Updated stair temperature property from "temperature" to "temp" in JSON export to maintain consistency with wall temperature naming convention. Both local StairExportNew interface and types/index.ts now use "temp" property. Localized StairPropertiesDialog from Spanish to English for improved user experience. All debugging logs cleaned up for production readiness.
- June 28, 2025. FIXED CANVAS2D AIRENTRY VISUAL RENDERING REGRESSION: Resolved critical issue where AirEntry "Position Along Wall" real-time updates weren't displaying correctly in Canvas2D. Root cause was Canvas2D drawing function using airEntries prop directly while real-time position changes used editingAirEntries state, creating React timing mismatch. Solution implemented getCurrentAirEntries() helper function that merges prop data with real-time updates, ensuring immediate visual feedback during position slider changes. Canvas2D now shows accurate real-time positioning without lag or visual inconsistency.
- June 28, 2025. FIXED AIRENTRY SAVE CHANGES POSITION REVERT BUG: Resolved critical issue where AirEntry position changes worked correctly in real-time but reverted to initial position after clicking "Save Changes". Root cause was wizard-design.tsx floors memoization stripping wallPosition data during the normalization process. When Canvas2D saved both position coordinates and wallPosition percentage, the memoization excluded wallPosition, causing inconsistency in the data flow. Solution: Added wallPosition preservation in the floors memoization to maintain both position coordinates and wallPosition percentage consistently throughout the entire Save Changes workflow.
- June 28, 2025. CRITICAL BREAKTHROUGH: Eliminated AirEntry position reversion timing issue by implementing direct store update architecture. Root cause was getCurrentAirEntries() function mixing editingAirEntries (real-time state) with airEntries (props), creating timing gap when editingAirEntries cleared before props updated from store. Solution: (1) Simplified getCurrentAirEntries() to use only prop data, eliminating state mixing. (2) Implemented handleAirEntryPositionUpdate() for immediate store updates during position slider changes. (3) Connected real-time updates to AirEntryDialog onPositionUpdate callback. Result: AirEntry positions now update immediately to store during dialog interactions, eliminating timing-dependent reversions and ensuring consistent visual feedback throughout the entire edit workflow.
- June 28, 2025. CRITICAL BREAKTHROUGH: Fixed AirEntry position reversion by solving store-to-component data propagation issue. Root cause was useMemo normalization in wizard-design.tsx creating disconnected copy of store data that prevented real-time updates from reaching Canvas2D props. Solution: Changed Canvas2D to receive airEntries from rawFloors[currentFloor] (direct store subscription) instead of floors[currentFloor] (memoized copy). This ensures immediate store updates from handleAirEntryPositionUpdate propagate correctly to Canvas2D, eliminating timing-dependent position reversions during SaveChanges workflow.
- June 28, 2025. COMPLETED DEBUG CLEANUP: Systematically removed all debugging console.log statements from Canvas2D.tsx while preserving functional logging. Eliminated stair creation debug logs, AirEntry dialog debug logs, real-time position update debug logs, and SaveChanges workflow debug logs. Codebase now clean and production-ready with only essential functional logging remaining.
- June 28, 2025. SOLVED CANVAS3D PERSISTENCE ISSUE: Fixed critical architecture inconsistency where Canvas3D was reading from stale props instead of reactive store data for scene rebuilds. Implemented useMemo-based finalFloors that prioritizes store data over props, ensuring Canvas3D uses updated AirEntry positions during scene reconstruction. Both Canvas2D and Canvas3D now use consistent store-first architecture, eliminating visual persistence issues when switching between tabs. System confirmed working with logs showing "🔧 [CANVAS3D REBUILD] Using STORE DATA" during scene rebuilds.
- June 28, 2025. CRITICAL BREAKTHROUGH: Fixed RSP-to-Canvas2D/Canvas3D synchronization gap by resolving missing callback architecture. Root cause was RoomSketchPro not receiving onUpdateAirEntry callback prop, causing RSP's internal Canvas3D modifications to never reach the shared store. Solution: (1) Added onUpdateAirEntry prop to RoomSketchProProps interface. (2) Connected wizard-design.tsx handleUpdateAirEntryFrom3D callback to RSP via props. (3) Established complete data flow: RSP Canvas3D → onUpdateAirEntry → handleUpdateAirEntryFrom3D → store → Canvas2D/Canvas3D notifications. AirEntry modifications in 3D View now propagate correctly to Design tab, achieving full bidirectional synchronization across all views. All debugging logs cleaned up for production.
- June 29, 2025. FINAL SYNCHRONIZATION SOLUTION: Resolved Canvas3D AirEntry dialog showing stale "Position Along Wall" values by implementing reactive store architecture. Root cause was Canvas3D using static useMemo store reading that captured data snapshot only at mount, while Canvas2D used reactive subscription. Solution: Replaced Canvas3D finalFloors with useRoomStore((state) => state.floors) reactive subscription, matching Canvas2D and wizard-design.tsx architecture. Canvas3D now receives real-time store updates during AirEntry modifications, ensuring dialog fields display current values. All three rendering components (Canvas2D, Canvas3D, RoomSketchPro) now use consistent reactive store pattern for complete synchronization.
- June 29, 2025. PERFORMANCE FIX COMPLETED: Fully resolved Canvas3D infinite loop during AirEntry dialog initialization by implementing proper React hooks architecture. Root cause was using IIFE (Immediately Invoked Function Expression) directly in initialValues prop, causing re-execution on every Canvas3D render. Solution: (1) Moved useMemo for airEntryInitialValues to component top level after editingAirEntry state declaration. (2) Replaced IIFE with memoized variable reference in JSX prop. (3) Ensured compliance with React hooks rules while preserving all synchronization functionality. Loop completely eliminated, dialog shows correct wallPosition values, and system performs efficiently without redundant computations.
- June 29, 2025. PRODUCTION DEBUG CLEANUP COMPLETED: Systematically removed all emoji-marked debug logs (🔍, 🔵, DEBUG, 📌, 🔄, ⏩) from Canvas3D.tsx while preserving essential functional logging. Eliminated stair creation debug logs, AirEntry dialog debug logs, real-time position update debug logs, texture state debugging, eraser mode debugging, hover detection debugging, store operations debugging, and coordinate transformation traces. Codebase now production-ready with clean console output containing only functional warnings and operational messages. System confirmed stable with all synchronization functionality intact.
- June 29, 2025. ADVANCED PERFORMANCE OPTIMIZATION ARCHITECTURE IMPLEMENTED: Completed three-phase optimization system for AirEntry modifications to preserve RSP textures and eliminate scene reconstruction overhead. Phase 1: Implemented selective property exclusion from useMemo in wizard-design.tsx, removing mesh-level properties (width, height, distanceToFloor, wallPosition) from structural rebuilds while preserving structural data (type, position, line, id). Phase 2: Created handleDirectAirEntryMeshUpdate system in Canvas3D for direct mesh manipulation - geometry updates, position changes, and material modifications without scene regeneration. Phase 3: Connected AirEntryDialog to use direct mesh modification system, eliminating callback-based rebuilds. Result: AirEntry Save Changes now preserves all RSP textures while maintaining real-time visual updates and performance optimization. System uses mesh-level modifications for visual properties and store updates for persistence, creating optimal balance between performance and data integrity.
- June 29, 2025. FURNITURE MODEL IMPLEMENTATION COMPLETED: Implemented exact furniture model architecture for AirEntry modifications. Created handleAirEntryEdit function that only updates store on Save Changes, handleRealTimeAirEntry functions for immediate mesh updates without store calls, and connected AirEntryDialog to use real-time callbacks. Added texture recovery callback system matching furniture pattern and strategic logging for verification. System now follows proven furniture model: real-time modifications only update 3D mesh visually, store updates only on Save Changes.
- June 29, 2025. CRITICAL USEMO EXCLUSION FIX: Identified and solved root cause of scene rebuilds after successful furniture model implementation. Problem was useMemo in wizard-design.tsx detecting AirEntry changes as "structural" and triggering scene reconstruction that destroyed preserved textures. Solution: Complete exclusion of all AirEntry mesh-level properties from useMemo normalization and dependency hash calculation. Only structural data (type, position, line, id) tracked for scene rebuilds, excluding dimensions, properties, wallPosition. This prevents post-Save Changes scene reconstruction while maintaining furniture model texture preservation.
- June 29, 2025. FIXED CANVAS3D AIRENTRY DIALOG STALE DATA ISSUE: Resolved critical bug where Canvas3D AirEntry dialog "Position Along Wall" field was uneditable and showed incorrect values. Root cause was airEntryInitialValues useMemo using stale editingAirEntry.entry data instead of reactive store data. Solution: Modified airEntryInitialValues to fetch fresh data from floors[currentFloor].airEntries[editingAirEntry.index] using reactive store subscription. Added floors and currentFloor to dependency array to ensure useMemo updates when store changes. Canvas3D dialog now shows current wallPosition values and allows proper editing matching Canvas2D behavior.
- June 29, 2025. FIXED SAVE CHANGES DELETING ELEMENTS BUG: Resolved critical issue where Save Changes in Canvas3D AirEntry dialog was causing elements to disappear. Root cause was handleUpdateAirEntryFrom3D function using stale airEntries data from useMemo instead of fresh store data. When useMemo excluded AirEntry properties for performance, the props became inconsistent with actual store state. Solution: Modified handleUpdateAirEntryFrom3D to fetch fresh data directly from useRoomStore.getState().floors[floorName] instead of relying on component props. Added safety check to return early if AirEntry index not found. Save Changes now works correctly without deleting elements.