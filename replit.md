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

## Changelog

Changelog:
- June 23, 2025. Initial setup