# HVAC Simulation Platform

## Overview

This project is a full-stack web application designed for HVAC (Heating, Ventilation, and Air Conditioning) simulation and design. It offers an interactive 3D environment for building multi-floor layouts, placing objects, configuring air flow systems, and performing thermal simulations. The platform aims to provide HVAC professionals and enthusiasts with a comprehensive tool to visualize and analyze thermal dynamics, export simulation data, and ultimately improve building efficiency and comfort.

## User Preferences

Preferred communication style: Simple, everyday language.
Technical documentation preference: Detailed technical explanations for architectural patterns to enable replication in future development cycles.
Development approach: Favor simple, minimal solutions over complex implementations. Avoid overengineering.

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