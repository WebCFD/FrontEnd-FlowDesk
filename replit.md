# HVAC Simulation Platform

## Overview

This is a comprehensive HVAC simulation platform built with a modern TypeScript stack. The application allows users to design room layouts using 2D/3D tools and run thermal comfort simulations. It features a React frontend with Three.js for 3D visualization, an Express.js backend with PostgreSQL database, and Drizzle ORM for database management.

## System Architecture

### Full-Stack Application Structure
- **Frontend**: React with TypeScript, Vite build system
- **Backend**: Express.js with Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **3D Graphics**: Three.js for Canvas3D rendering
- **UI Components**: Radix UI with shadcn/ui components
- **State Management**: Zustand stores for client-side state
- **Deployment**: Replit with Cloud Run deployment target

### Development Environment
- Node.js 20 runtime
- PostgreSQL 16 database
- Vite development server with HMR
- TypeScript compilation and type checking

## Key Components

### Authentication System
- Passport.js with local strategy for user authentication
- Session-based authentication with PostgreSQL session store
- Password hashing using Node.js crypto scrypt function
- Protected routes with anonymous user fallback

### 3D Design Tools
- **Canvas3D**: Core Three.js-based 3D rendering component
- **RoomSketchPro**: Advanced room design interface
- **GeometryEngine**: Shared geometry utilities and calculations
- **FurnitureSystem**: Dynamic furniture placement and management
- Support for multiple floor levels with stair connections

### Simulation Data Management
- **Room Store**: Zustand-based state management for room data
- **Simulation Data Converter**: Transforms design data for simulation processing
- **Custom Furniture Store**: Manages user-uploaded 3D models
- Wall, window, door, and vent property tracking

### Database Schema
- **Users**: Authentication and profile management
- **Simulations**: Tracking simulation projects and status
- **Contact Messages**: Legacy contact form storage (deprecated)

## Data Flow

### Design Workflow
1. User creates room layout using 2D/3D tools
2. Furniture and HVAC components are placed in 3D space
3. Material properties and simulation parameters are configured
4. Design data is converted to simulation format
5. Simulation is executed and results are processed

### State Management Flow
- Client-side state managed through Zustand stores
- 3D scene state handled by SceneContext
- Room geometry and furniture tracked in room-store
- Persistent settings stored in sketch-store

### Authentication Flow
- Login/logout handled by Express authentication middleware
- Protected routes redirect anonymous users appropriately
- Session persistence across browser sessions

## External Dependencies

### Core Framework Stack
- React 18 with TypeScript for UI components
- Three.js for 3D graphics and WebGL rendering
- Express.js for REST API backend
- Drizzle ORM with PostgreSQL driver (@neondatabase/serverless)

### UI and Design System
- Radix UI primitives for accessible components
- Tailwind CSS for styling with custom theme system
- React Hook Form with Zod validation
- Lucide React for icons

### Development and Build Tools
- Vite for frontend build and development server
- esbuild for backend bundling in production
- TypeScript compiler for type checking
- PostCSS with Tailwind for CSS processing

### Third-Party Integrations
- Google Analytics (React GA4) for user tracking
- Analytics event tracking system for user behavior

## Deployment Strategy

### Replit Cloud Run Deployment
- **Build Command**: `npm run build` (builds both frontend and backend)
- **Start Command**: `npm run start` (runs production server)
- **Development**: `npm run dev` (runs development server with HMR)

### Database Configuration
- PostgreSQL database provisioned through Replit
- Connection string configured via DATABASE_URL environment variable
- Drizzle migrations stored in `/migrations` directory
- Database push command: `npm run db:push`

### Static Asset Handling
- Frontend assets built to `dist/public`
- Backend bundle output to `dist/index.js`
- Static file serving from `/public` directory in production

### Environment Configuration
- Development mode uses Vite dev server with middleware
- Production mode serves pre-built static assets
- Database credentials managed through environment variables
- Google Analytics ID configured server-side

## Changelog

- June 23, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.