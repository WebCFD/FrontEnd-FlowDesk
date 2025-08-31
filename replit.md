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