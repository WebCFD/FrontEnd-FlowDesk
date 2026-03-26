import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertSimulationSchema, updateSimulationStatusSchema, updateUserSchema, updateSimulationAdminSchema, simulations, users, contactMessageSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth } from "./auth";
import { promises as fs } from "fs";
import * as fsSync from "fs";
import path from "path";
import JSZip from "jszip";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { r2Storage, R2NotFoundError } from "./r2Storage";
import { ConcurrentUpdateError } from "./storage";

// State machine: valid status transitions.
// Each key is a "from" status; the array lists all allowed "to" statuses.
// Progress-only updates (no status change) bypass this map entirely.
export const VALID_TRANSITIONS: Record<string, string[]> = {
  'pending':          ['processing', 'failed'],
  'processing':       ['geometry', 'failed'],
  'geometry':         ['meshing', 'failed'],
  'meshing':          ['cfd_setup', 'failed'],
  'cfd_setup':        ['cloud_execution', 'failed'],
  'cloud_execution':  ['post_processing', 'failed'],
  'post_processing':  ['completed', 'failed'],
  'completed':        [],           // terminal — no further transitions allowed
  'failed':           ['pending'],  // manual retry resets to pending
};
// ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
// Importar crypto para validación de contraseña con hash SHA-256
// Esta funcionalidad será eliminada próximamente
import crypto from "crypto";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import os from "os";
import { getUncachableResendClient } from "./resend";
import rateLimit from "express-rate-limit";

const execPromise = promisify(exec);

// Helper function to check worker health
function checkWorkerHealth(workerName: string): { status: string; lastSeen?: string; pid?: number } {
  try {
    // Intentar encontrar el proceso usando pgrep
    
    let processPattern: string;
    if (workerName === "worker_submit") {
      processPattern = "worker_submit.py";
    } else if (workerName === "worker_monitor") {
      processPattern = "worker_monitor.py";
    } else {
      return { status: "unknown" };
    }

    try {
      const pidOutput = execSync(`pgrep -f "${processPattern}"`, { encoding: 'utf-8' }).trim();
      const pid = parseInt(pidOutput.split('\n')[0]);
      
      if (pid && !isNaN(pid)) {
        return {
          status: "running",
          pid: pid,
          lastSeen: new Date().toISOString()
        };
      }
    } catch (pgrepError) {
      // pgrep returns exit code 1 if no process found
      return {
        status: "stopped",
        lastSeen: new Date().toISOString()
      };
    }

    return { status: "unknown" };
  } catch (error) {
    console.error(`[EXPRESS] Error checking ${workerName} health:`, error);
    return { 
      status: "error",
      lastSeen: new Date().toISOString()
    };
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ===== DEBUG MIDDLEWARE: Track all VTK requests =====
  app.use((req, res, next) => {
    if (req.path.includes('.vtkjs')) {
      console.log('🚀 VTK Request:', {
        method: req.method,
        path: req.path,
        url: req.url,
        headers: {
          accept: req.headers.accept,
          'content-type': req.headers['content-type']
        }
      });
    }
    next();
  });

  // ===== SOLUCIÓN: Force correct MIME type for .vtkjs files =====
  app.use((req, res, next) => {
    if (req.url.endsWith('.vtkjs') && !req.url.includes('/', req.url.indexOf('.vtkjs'))) {
      console.log('[Express] 🔧 FIXING Content-Type for .vtkjs file:', req.url);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
      res.setHeader('Cache-Control', 'no-cache');
      
      // Handle preflight OPTIONS requests
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
    }
    next();
  });

  // Set up authentication routes and middleware
  setupAuth(app);

  // API endpoint to check if user is authenticated
  app.get("/api/auth/check", (req, res) => {
    if (req.isAuthenticated()) {
      res.json({ authenticated: true });
    } else {
      res.status(401).json({ authenticated: false });
    }
  });
  
  // Endpoint para obtener configuración del cliente, incluyendo claves API
  app.get("/api/config", (req, res) => {
    res.json({
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || ''
    });
  });

  // Rate limiter for contact form - 5 messages per hour per IP
  const contactFormLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per hour
    message: {
      success: false,
      message: "Demasiados mensajes enviados. Por favor, espera una hora antes de intentarlo de nuevo."
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.log("[Express] 🚫 Rate limit exceeded for IP:", req.ip);
      res.status(429).json({
        success: false,
        message: "Demasiados mensajes enviados. Por favor, espera una hora antes de intentarlo de nuevo."
      });
    }
  });

  // Contact form endpoint - sends email via Resend
  app.post("/api/contact", contactFormLimiter, async (req, res) => {
    try {
      console.log("[Express] 📧 Contact form submission received");
      const contactData = contactMessageSchema.parse(req.body);
      console.log("[Express] ✅ Contact data validated:", { name: contactData.name, email: contactData.email });
      
      // Verify Cloudflare Turnstile token if provided
      if (contactData.turnstileToken && process.env.TURNSTILE_SECRET_KEY) {
        console.log("[Express] 🔒 Verifying Turnstile token...");
        const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            secret: process.env.TURNSTILE_SECRET_KEY,
            response: contactData.turnstileToken,
            remoteip: req.ip
          })
        });
        
        const turnstileResult = await turnstileResponse.json();
        
        if (!turnstileResult.success) {
          console.log("[Express] ❌ Turnstile verification failed:", turnstileResult);
          return res.status(400).json({
            success: false,
            message: "Verificación de seguridad fallida. Por favor, recarga la página e intenta de nuevo."
          });
        }
        
        console.log("[Express] ✅ Turnstile verification successful");
      }
      
      console.log("[Express] 🔑 Getting Resend client...");
      const { client, fromEmail } = await getUncachableResendClient();
      console.log("[Express] ✅ Resend client obtained, fromEmail:", fromEmail);
      
      console.log("[Express] 📤 Sending email to info@flowdesk.es...");
      const result = await client.emails.send({
        from: fromEmail,
        to: 'info@flowdesk.es',
        replyTo: contactData.email,
        subject: `FlowDesk Contact Form: ${contactData.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">New Contact Form Submission</h2>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>From:</strong> ${contactData.name}</p>
              <p><strong>Email:</strong> ${contactData.email}</p>
            </div>
            <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
              <h3 style="margin-top: 0;">Message:</h3>
              <p style="white-space: pre-wrap;">${contactData.message}</p>
            </div>
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
              This message was sent via the FlowDesk contact form at ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
            </p>
          </div>
        `
      });
      
      console.log("[Express] ✅ Email sent successfully! Result:", JSON.stringify(result));
      res.json({ success: true, message: "Message sent successfully" });
    } catch (error) {
      console.error("[Express] ❌ Contact form error:", error);
      console.error("[Express] ❌ Error details:", JSON.stringify(error, null, 2));
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid form data",
          errors: error.errors 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: "Failed to send message. Please try again later.",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Simulations API endpoints
  app.post("/api/simulations", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const simulationData = insertSimulationSchema.parse(req.body);
      const simulation = await storage.createSimulation({
        ...simulationData,
        userId: req.user.id,
      });

      res.status(201).json(simulation);
    } catch (error) {
      res.status(400).json({ message: "Invalid simulation data" });
    }
  });

  // New endpoint for creating simulations from wizard
  app.post("/api/simulations/create", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
      // Validar contraseña de lanzamiento de simulaciones
      // Esta funcionalidad será eliminada próximamente
      // CÓMO ELIMINAR: Borrar este bloque completo (líneas con comentario TEMPORARY PASSWORD PROTECTION)
      const { password } = req.body;
      
      // Hash SHA-256 de la contraseña correcta "jrm2025"
      const CORRECT_PASSWORD_HASH = "8191b44b3d4d4ff5e364574f5d8e08ad6d59a9f8fa6706ea7d4b137d8a683719";
      
      // Validar que se proporcionó una contraseña
      if (!password || typeof password !== 'string') {
        console.log('[EXPRESS] Password validation failed: No password provided');
        return res.status(403).json({ 
          message: "Simulation launch password is required" 
        });
      }
      
      // Calcular hash de la contraseña proporcionada
      const providedPasswordHash = crypto.createHash('sha256').update(password).digest('hex');
      
      // Comparar hashes
      if (providedPasswordHash !== CORRECT_PASSWORD_HASH) {
        console.log('[EXPRESS] Password validation failed: Incorrect password');
        return res.status(403).json({ 
          message: "Incorrect simulation launch password" 
        });
      }
      
      console.log('[EXPRESS] Password validation successful');
      // ========== FIN DE TEMPORARY PASSWORD PROTECTION ==========

      const { name, simulationType, status, jsonConfig } = req.body;

      // Validation 1: Check simulation name
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "Simulation name is required" });
      }

      if (name.trim().length < 3 || name.trim().length > 100) {
        return res.status(400).json({ message: "Simulation name must be between 3 and 100 characters" });
      }

      // Validation 2: Check simulation type
      const validTypes = ['SteadySim', 'TransientSim', 'test_calculation'];
      if (!validTypes.includes(simulationType)) {
        return res.status(400).json({ message: "Invalid simulation type" });
      }

      // Validation 3: Check status
      const validStatuses = ['pending', 'completed', 'processing', 'failed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid simulation status" });
      }

      // Validation 4: Check if user has enough credits - dynamic pricing
      // Test calculations are free (for testing Inductiva integration)
      let simulationCost = 0;
      if (simulationType === 'test_calculation') {
        simulationCost = 0; // Free for testing
        console.log('[EXPRESS] Test calculation - no credit debit');
      } else {
        simulationCost = simulationType === 'SteadySim' ? 9.99 : 12; // Steady Simulation TEST: €9.99, Transient: €12
        const hasEnoughCredits = await storage.debitUserCredits(req.user.id, simulationCost);
        
        if (!hasEnoughCredits) {
          return res.status(400).json({ 
            message: `Insufficient credits. You need at least €${simulationCost} to run this simulation.` 
          });
        }
      }

      // Create user folder if it doesn't exist
      const userFolderPath = path.join(process.cwd(), 'simulations', `user_${req.user.id}`);
      try {
        await fs.mkdir(userFolderPath, { recursive: true });
      } catch (error) {
        console.error('Error creating user folder:', error);
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${sanitizedName}_${timestamp}.json`;
      const filePath = path.join(userFolderPath, filename);

      // Add simulationType to jsonConfig before saving
      const enrichedJsonConfig = {
        ...jsonConfig,
        simulationType: simulationType
      };

      // Save JSON file
      try {
        await fs.writeFile(filePath, JSON.stringify(enrichedJsonConfig, null, 2));
      } catch (error) {
        console.error('Error saving simulation file:', error);
        return res.status(500).json({ message: "Error saving simulation file" });
      }

      // Create simulation record in database
      const relativePath = `/simulations/user_${req.user.id}/${filename}`;
      const simulation = await storage.createSimulation({
        name: name.trim(),
        filePath: relativePath,
        status,
        simulationType,
        packageType: 'basic',
        cost: simulationCost,
        isPublic: false,
        jsonConfig: enrichedJsonConfig,
        userId: req.user.id,
      });

      // Return success with simulation data
      res.status(201).json({
        success: true,
        simulation,
        message: `Simulation "${name}" created successfully. €${simulationCost} debited from your account.`
      });

    } catch (error) {
      console.error('Error creating simulation:', error);
      res.status(500).json({ message: "Error creating simulation" });
    }
  });

  // Sample case endpoint - no credit debit
  app.post("/api/simulations/sample", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { sampleCaseId } = req.body;

      // Validate sample case ID
      const validSampleCases = ['office-layout'];
      if (!validSampleCases.includes(sampleCaseId)) {
        return res.status(400).json({ message: "Invalid sample case ID" });
      }

      // Load sample case JSON from secure location
      const sampleCasePath = path.join(process.cwd(), 'server', 'sample-cases', `${sampleCaseId}.json`);
      let sampleData;
      try {
        const fileContent = await fs.readFile(sampleCasePath, 'utf8');
        sampleData = JSON.parse(fileContent);
      } catch (error) {
        console.error('Error loading sample case:', error);
        return res.status(500).json({ message: "Error loading sample case" });
      }

      // Create user folder if it doesn't exist
      const userFolderPath = path.join(process.cwd(), 'simulations', `user_${req.user.id}`);
      try {
        await fs.mkdir(userFolderPath, { recursive: true });
      } catch (error) {
        console.error('Error creating user folder:', error);
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sampleName = sampleData.metadata?.name || 'Sample Case';
      const sanitizedName = sampleName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${sanitizedName}_${timestamp}.json`;
      const filePath = path.join(userFolderPath, filename);

      // Copy sample case to user folder
      try {
        await fs.writeFile(filePath, JSON.stringify(sampleData, null, 2));
      } catch (error) {
        console.error('Error saving sample case file:', error);
        return res.status(500).json({ message: "Error saving sample case file" });
      }

      // Create simulation record in database (NO CREDIT DEBIT)
      const relativePath = `/simulations/user_${req.user.id}/${filename}`;
      const simulation = await storage.createSimulation({
        name: sampleName,
        filePath: relativePath,
        status: 'completed', // Sample cases are always completed
        simulationType: 'SteadySim',
        packageType: 'basic',
        cost: 0, // No cost for sample cases
        isPublic: false,
        jsonConfig: sampleData,
        userId: req.user.id,
      });

      // Return success with simulation data
      res.status(201).json({
        success: true,
        simulation,
        message: `Sample case "${sampleName}" loaded successfully. No credits charged for sample cases.`
      });

    } catch (error) {
      console.error('Error creating sample simulation:', error);
      res.status(500).json({ message: "Error creating sample simulation" });
    }
  });

  app.get("/api/simulations", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const simulations = await storage.getSimulationsByUserId(req.user.id);
      res.json(simulations);
    } catch (error) {
      console.error("[ERROR] Error fetching simulations:", error);
      res.status(500).json({ message: "Error fetching simulations" });
    }
  });

  app.get("/api/simulations/completed", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const simulations = await storage.getCompletedSimulationsByUserId(req.user.id);
      res.json(simulations);
    } catch (error) {
      console.error('Error in /api/simulations/completed:', error);
      res.status(500).json({ message: "Error fetching completed simulations" });
    }
  });

  app.patch("/api/simulations/:id/status", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const id = parseInt(req.params.id);
      const statusUpdate = updateSimulationStatusSchema.parse(req.body);
      
      const simulation = await storage.updateSimulationStatus(id, statusUpdate);
      res.json(simulation);
    } catch (error) {
      res.status(400).json({ message: "Invalid status update" });
    }
  });

  // Endpoint para listar archivos VTK disponibles de una simulación
  app.get("/api/simulations/:id/vtk-files", async (req, res) => {
    console.log('[VTK-FILES] Endpoint called for simulation:', req.params.id);
    try {
      const simulationId = parseInt(req.params.id);
      
      let files: any[] = [];
      let source = 'r2';
      
      // Try to read from Cloudflare R2 first (persistent external storage)
      try {
        const fileList = await r2Storage.listVtkFiles(simulationId);
        console.log('[VTK-FILES] Successfully listed files from R2:', fileList.length);
        
        if (fileList && fileList.length > 0) {
          console.log('[VTK-FILES] R2 File list:', fileList);
          // Convert filenames to file objects
          files = fileList.map(filename => {
            // Parse OpenFOAM files to extract timestep and type
            let timestep = null;
            let type = 'slice';
            
            // Detect file type and priority
            if (filename === 'surface_3d.vtk') {
              type = 'surface_3d';
              timestep = 0;
            } else if (filename === 'volume_internal.vtk') {
              type = 'volume_internal';
              timestep = 0;
            } else if (filename === 'internal_mesh_complete.vtkjs') {
              type = 'volume_complete';
              timestep = 0;
            } else if (filename.startsWith('openfoam_')) {
              if (filename.includes('boundary_')) {
                type = 'boundary';
              } else if (filename.includes('internal')) {
                type = 'volume_internal';
              } else {
                type = 'volume';
              }
              
              const match = filename.match(/artifacts_(\d+)/);
              if (match) {
                timestep = parseFloat(match[1]);
              }
            }
            
            return {
              filename,
              path: `/api/simulations/${simulationId}/vtk/${filename}`,
              type,
              timestep,
              size: 0, // Size not available from listing
              modified: new Date()
            };
          })
          .sort((a, b) => {
            // Sort: surface_3d > volume_complete > boundary > volume > volume_internal > slices
            const typeOrder: Record<string, number> = { 
              surface_3d: 0,
              volume_complete: 1, 
              boundary: 2, 
              volume: 3, 
              volume_internal: 4, 
              slice: 5 
            };
            const orderDiff = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
            if (orderDiff !== 0) return orderDiff;
            
            // Within same type, sort by timestep (descending)
            if (a.timestep !== null && b.timestep !== null) {
              return b.timestep - a.timestep;
            }
            return a.filename.localeCompare(b.filename);
          });
        }
      } catch (r2Error: any) {
        console.error('[VTK-FILES] R2 storage read failed:', r2Error.message);
        source = 'filesystem';
        
        // Log R2 error details for debugging
        console.error('[VTK-FILES] R2 error details:', {
          name: r2Error.name,
          message: r2Error.message
        });
      }
      
      // Fallback to filesystem if R2 is empty or failed
      if (files.length === 0) {
        const isProduction = process.env.NODE_ENV === 'production';

        // Directories to search, in priority order:
        // 1. cases/sim_{id}/post/vtk/  — where step05 saves plane VTK files (.vtk)
        // 2. public/uploads/sim_{id}/vtk/ — legacy converted .vtkjs files
        const localCandidates: Array<{ dir: string; extensions: string[] }> = [
          {
            dir: path.join(process.cwd(), 'cases', `sim_${simulationId}`, 'post', 'vtk'),
            extensions: ['.vtk', '.vtu', '.vtp'],
          },
          {
            dir: isProduction
              ? path.join('/tmp/uploads', `sim_${simulationId}`, 'vtk')
              : path.join(process.cwd(), 'public', 'uploads', `sim_${simulationId}`, 'vtk'),
            extensions: ['.vtkjs'],
          },
        ];

        for (const candidate of localCandidates) {
          if (!fsSync.existsSync(candidate.dir)) {
            console.log('[VTK-FILES] Directory not found, skipping:', candidate.dir);
            continue;
          }

          const found = fsSync.readdirSync(candidate.dir)
            .filter(f => candidate.extensions.some(ext => f.endsWith(ext)))
            .map(filename => {
              const stats = fsSync.statSync(path.join(candidate.dir, filename));

              let timestep = null;
              let type = 'slice';

              if (filename === 'surface_3d.vtk') {
                type = 'surface_3d';
                timestep = 0;
              } else if (filename === 'volume_internal.vtk') {
                type = 'volume_internal';
                timestep = 0;
              } else if (filename === 'internal_mesh_complete.vtkjs') {
                type = 'volume_complete';
                timestep = 0;
              } else if (filename.startsWith('openfoam_')) {
                if (filename.includes('boundary_')) {
                  type = 'boundary';
                } else if (filename.includes('internal')) {
                  type = 'volume_internal';
                } else {
                  type = 'volume';
                }
                const match = filename.match(/artifacts_(\d+)/);
                if (match) {
                  timestep = parseFloat(match[1]);
                }
              }

              return {
                filename,
                path: `/api/simulations/${simulationId}/vtk/${filename}`,
                type,
                timestep,
                size: stats.size,
                modified: stats.mtime,
              };
            });

          if (found.length > 0) {
            console.log(`[VTK-FILES] Found ${found.length} files in local dir: ${candidate.dir}`);
            files = found;
            break;
          }
        }

        if (files.length === 0) {
          console.log('[VTK-FILES] No VTK files found in R2 or local filesystem');
          if (isProduction) {
            console.warn('[VTK-FILES] PRODUCTION: No files found. Check R2 storage configuration.');
          }
          return res.json({ files: [], latestVolume: null, count: 0 });
        }

        files = files.sort((a, b) => {
          const typeOrder: Record<string, number> = {
            surface_3d: 0,
            volume_complete: 1,
            boundary: 2,
            volume: 3,
            volume_internal: 4,
            slice: 5,
          };
          const orderDiff = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
          if (orderDiff !== 0) return orderDiff;
          if (a.timestep !== null && b.timestep !== null) {
            return b.timestep - a.timestep;
          }
          return a.filename.localeCompare(b.filename);
        });
      }
      
      // Get latest volume file — prefer surface_3d (full 3D room) then older volume types
      const latestVolume = files.find(f =>
        f.type === 'surface_3d'
      ) || files.find(f =>
        f.type === 'volume_complete'
      ) || files.find(f =>
        f.type === 'volume_internal'
      ) || files.find(f =>
        f.type === 'volume'
      );
      
      res.json({ 
        files,
        latestVolume: latestVolume || null,
        count: files.length
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to list VTK files", error: error.message });
    }
  });

  // Isosurface extraction endpoint: runs PyVista contour() server-side and returns VTK ASCII
  app.post("/api/simulations/:id/isosurface", async (req, res) => {
    try {
      const simulationId = parseInt(req.params.id);
      const { filename, field, value } = req.body;

      if (!filename || !field || value === undefined || value === null) {
        return res.status(400).json({ message: "filename, field, and value are required" });
      }

      const numValue = Number(value);
      if (isNaN(numValue)) {
        return res.status(400).json({ message: "value must be a number" });
      }

      // Locate VTK file: local filesystem first, R2 fallback
      const localPath = path.join(process.cwd(), 'cases', `sim_${simulationId}`, 'post', 'vtk', filename);
      let vtkPath: string = localPath;
      let tempFile: string | null = null;

      if (!fsSync.existsSync(localPath)) {
        // Try R2
        try {
          const fileBuffer = await r2Storage.downloadToBuffer(simulationId, filename);
          tempFile = path.join(os.tmpdir(), `vtk_iso_${simulationId}_${Date.now()}_${filename}`);
          await fs.writeFile(tempFile, fileBuffer);
          vtkPath = tempFile;
        } catch (r2Err: any) {
          console.warn(`[ISOSURFACE] R2 download failed for ${filename}:`, r2Err.message);
          return res.status(404).json({ message: `VTK file not found: ${filename}` });
        }
      }

      const scriptPath = path.join(process.cwd(), 'server', 'isosurface.py');
      console.log(`[ISOSURFACE] sim=${simulationId} file=${filename} field=${field} value=${numValue}`);

      let vtkOutput = '';
      try {
        const { stdout, stderr } = await execPromise(
          `python3 "${scriptPath}" "${vtkPath}" "${field}" "${numValue}"`,
          { maxBuffer: 20 * 1024 * 1024, timeout: 30000 }
        );
        if (stderr) console.warn(`[ISOSURFACE] Python stderr:`, stderr.substring(0, 300));
        vtkOutput = stdout;
      } catch (execErr: any) {
        console.error('[ISOSURFACE] Python execution failed:', execErr.message);
        // Return empty VTK so frontend handles it gracefully
        vtkOutput = "# vtk DataFile Version 2.0\nEmpty\nASCII\nDATASET POLYDATA\nPOINTS 0 float\n";
      } finally {
        if (tempFile) { try { await fs.unlink(tempFile); } catch (e) {} }
      }

      res.setHeader('Content-Type', 'text/plain');
      res.send(vtkOutput);
    } catch (error: any) {
      console.error('[ISOSURFACE] Endpoint error:', error);
      res.status(500).json({ message: "Isosurface extraction failed", error: error.message });
    }
  });

  // Endpoint for Python workers to get presigned URL for uploading VTK files to R2
  app.post("/api/simulations/:id/vtk/upload-url", async (req, res) => {
    try {
      const simulationId = parseInt(req.params.id);
      const { filename } = req.body;

      if (!filename) {
        return res.status(400).json({ message: "filename is required" });
      }

      // Generate presigned URL for R2 upload
      const uploadUrl = await r2Storage.getUploadUrl(simulationId, filename);
      console.log(`[VTK-UPLOAD-URL] Generated R2 upload URL for sim ${simulationId}, file: ${filename}`);

      res.json({ uploadUrl });
    } catch (error: any) {
      console.error('[VTK-UPLOAD-URL] Error generating R2 upload URL:', error);
      res.status(500).json({ message: "Failed to generate upload URL", error: error.message });
    }
  });

  // Endpoint to download VTK files from Cloudflare R2 with filesystem fallback
  app.get("/api/simulations/:id/vtk/:filename", async (req, res) => {
    try {
      const simulationId = parseInt(req.params.id);
      const filename = req.params.filename;
      const isProduction = process.env.NODE_ENV === 'production';
      const envLabel = isProduction ? 'PROD' : 'DEV';

      console.log(`[VTK-DOWNLOAD] [${envLabel}] Request: sim=${simulationId}, file=${filename}`);
      
      // Try R2 first (persistent external storage)
      let r2Available = false;
      let r2Error: Error | null = null;
      
      try {
        console.log(`[VTK-DOWNLOAD] [${envLabel}] Checking R2 for file...`);
        const exists = await r2Storage.fileExists(simulationId, filename);
        if (exists) {
          console.log(`[VTK-DOWNLOAD] [${envLabel}] ✓ Found in R2, streaming to client`);
          console.log(`[VTK-DOWNLOAD] [${envLabel}] Source: Cloudflare R2 (PERSISTENT)`);
          await r2Storage.downloadToResponse(simulationId, filename, res);
          return;
        }
        console.log(`[VTK-DOWNLOAD] [${envLabel}] Not found in R2`);
        r2Available = true; // R2 is working, just file not found
      } catch (err: any) {
        r2Error = err;
        if (err instanceof R2NotFoundError) {
          console.log(`[VTK-DOWNLOAD] [${envLabel}] R2 returned 404 for: ${filename}`);
          r2Available = true;
        } else {
          console.warn(`[VTK-DOWNLOAD] [${envLabel}] ⚠️ R2 ERROR: ${err.message}`);
          console.warn(`[VTK-DOWNLOAD] [${envLabel}] R2 may be misconfigured or unavailable`);
          r2Available = false;
        }
      }
      
      // Fallback to local filesystem — check multiple locations in priority order:
      // 1. cases/sim_{id}/post/vtk/{filename}  — step05 output (plane .vtk files)
      // 2. public/uploads/sim_{id}/vtk/{filename} — legacy .vtkjs converted files
      const localCandidates = [
        path.join(process.cwd(), 'cases', `sim_${simulationId}`, 'post', 'vtk', filename),
        isProduction
          ? path.join('/tmp/uploads', `sim_${simulationId}`, 'vtk', filename)
          : path.join(process.cwd(), 'public', 'uploads', `sim_${simulationId}`, 'vtk', filename),
      ];

      let resolvedPath: string | null = null;
      for (const candidate of localCandidates) {
        console.log(`[VTK-DOWNLOAD] [${envLabel}] Checking filesystem: ${candidate}`);
        if (fsSync.existsSync(candidate)) {
          resolvedPath = candidate;
          break;
        }
      }

      if (!resolvedPath) {
        console.log(`[VTK-DOWNLOAD] [${envLabel}] NOT FOUND in filesystem`);
        console.log(`[VTK-DOWNLOAD] [${envLabel}] Summary: R2=${r2Available ? 'available but no file' : 'unavailable'}, Filesystem=not found`);

        if (isProduction && !r2Available) {
          console.warn(`[VTK-DOWNLOAD] [${envLabel}] PRODUCTION: File may have been lost due to container restart`);
          console.warn(`[VTK-DOWNLOAD] [${envLabel}] R2 upload may have failed during post-processing`);
        }

        return res.status(404).json({
          message: "VTK file not found",
          environment: envLabel,
          checked: {
            r2: r2Available ? "checked, not found" : `error: ${r2Error?.message || 'unknown'}`,
            filesystem: localCandidates,
          },
          hint: isProduction
            ? "File may have been lost if R2 upload failed and container restarted"
            : "Check if simulation completed successfully",
        });
      }

      const fileStats = fsSync.statSync(resolvedPath);
      console.log(`[VTK-DOWNLOAD] [${envLabel}] Found in filesystem: ${fileStats.size} bytes — ${resolvedPath}`);

      const contentType = filename.endsWith('.vtkjs')
        ? 'application/zip'
        : 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.sendFile(resolvedPath);
    } catch (error: any) {
      console.error('[VTK-DOWNLOAD] Unexpected error:', error);
      res.status(500).json({ message: "Failed to download VTK file", error: error.message });
    }
  });

  app.get("/api/simulations/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const id = parseInt(req.params.id);
      const simulation = await storage.getSimulation(id);
      
      if (!simulation) {
        return res.status(404).json({ message: "Simulation not found" });
      }

      res.json(simulation);
    } catch (error) {
      res.status(500).json({ message: "Error fetching simulation" });
    }
  });

  // Delete simulation endpoint
  app.delete("/api/simulations/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid simulation ID" });
      }

      // Get simulation details before deletion to get file path
      const simulation = await storage.getSimulation(id);
      if (!simulation) {
        return res.status(404).json({ message: "Simulation not found" });
      }

      // Verify the simulation belongs to the authenticated user
      if (simulation.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized to delete this simulation" });
      }

      // Delete from database
      const deleteSuccess = await storage.deleteSimulation(id, req.user.id);
      if (!deleteSuccess) {
        return res.status(500).json({ message: "Failed to delete simulation from database" });
      }

      // Delete JSON file from file system
      try {
        if (simulation.filePath) {
          const fullPath = path.join(process.cwd(), simulation.filePath);
          await fs.unlink(fullPath);
        }
      } catch (fileError) {
        console.warn('Warning: Could not delete simulation file:', fileError);
        // Continue even if file deletion fails - database cleanup is more important
      }

      res.json({ 
        success: true, 
        message: "Simulation deleted successfully" 
      });

    } catch (error) {
      console.error('Error deleting simulation:', error);
      res.status(500).json({ message: "Error deleting simulation" });
    }
  });

  // Endpoint to serve JSON files for design loading
  app.get("/api/files/*", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const filePath = (req.params as any)[0];
      if (!filePath) {
        return res.status(400).json({ message: "File path is required" });
      }

      // Find simulation to verify user owns the file
      const simulations = await storage.getSimulationsByUserId(req.user.id);
      
      // Normalize file paths for comparison (handle both /path and path formats)
      const normalizedRequestPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      const simulation = simulations.find(sim => {
        const normalizedDbPath = sim.filePath.startsWith('/') ? sim.filePath : `/${sim.filePath}`;
        return normalizedDbPath === normalizedRequestPath;
      });
      
      if (!simulation) {
        return res.status(403).json({ message: "Unauthorized to access this file" });
      }

      const fullPath = path.join(process.cwd(), filePath);
      
      // Check if file exists
      try {
        await fs.access(fullPath);
      } catch {
        return res.status(404).json({ message: "File not found" });
      }

      // Read and return JSON file
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      const jsonData = JSON.parse(fileContent);
      
      res.json(jsonData);
    } catch (error) {
      console.error('Error serving file:', error);
      res.status(500).json({ message: "Error reading file" });
    }
  });

  // ===== SOLUCIÓN 2: API específica para archivos .vtkjs (bypass Vite) =====
  app.get("/api/vtk/cfd-data.vtkjs", async (req, res) => {
    try {
      console.log('[Express] 🚀 SOLUCIÓN 2: Sirviendo .vtkjs via API específica');
      
      // Path to the .vtkjs file in public directory
      const vtkFilePath = path.join(process.cwd(), 'client', 'public', 'cfd-data.vtkjs');
      
      // Check if file exists
      try {
        await fs.access(vtkFilePath);
      } catch {
        return res.status(404).json({ message: "VTK file not found" });
      }

      // Set correct headers for binary .vtkjs file
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Disposition', 'inline; filename="cfd-data.vtkjs"');
      
      console.log('[Express] 🚀 Headers configured correctly for .vtkjs');
      
      // Stream the binary file directly
      const fileBuffer = await fs.readFile(vtkFilePath);
      console.log('[Express] 🚀 File loaded, size:', fileBuffer.length, 'bytes');
      res.send(fileBuffer);

    } catch (error) {
      console.error('[Express] Error serving VTK.js file via API:', error);
      res.status(500).json({ message: "Error serving VTK file" });
    }
  });

  // ✅ ENDPOINT PARA ARCHIVOS INTERNOS DEL ZIP
  app.get("/api/simulations/:id/results/:filename.vtkjs/:internalPath(*)", async (req, res) => {
    const { id, filename, internalPath } = req.params;
    const simulationId = parseInt(id);
    
    console.log('[Express] 🔍 Internal VTK request:', { 
      id, 
      filename, 
      internalPath,
      fullPath: req.path 
    });
    
    if (isNaN(simulationId)) {
      return res.status(400).json({ 
        error: 'Invalid simulation ID',
        simulation: id,
        filename: filename,
        internalPath: internalPath
      });
    }

    // ✅ SECURITY: Require authentication for internal files
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required for VTK internal files" });
    }

    // Map to actual .vtkjs file location (including sim_ID/vtk/ prefix)
    let vtkjsPath;
    if (simulationId === 33 && filename === 'result') {
      vtkjsPath = path.join(process.cwd(), 'client', 'public', 'cfd-data.vtkjs');
    } else {
      const uploadsPath = process.env.NODE_ENV === 'production' 
        ? path.join('/tmp', 'uploads', `sim_${id}`, 'vtk')
        : path.join(process.cwd(), 'client', 'public', 'uploads', `sim_${id}`, 'vtk');
      vtkjsPath = path.join(uploadsPath, `${filename}.vtkjs`);
    }
    
    console.log('[Express] Looking for VTK file:', vtkjsPath);
    
    try {
      await fs.access(vtkjsPath);
    } catch {
      console.log('[Express] ❌ VTK file not found:', vtkjsPath);
      return res.status(404).json({ error: 'VTK file not found' });
    }
    
    try {
      // ✅ LEER ARCHIVO - DETECTAR SI ES JSON O ZIP
      const fileBuffer = await fs.readFile(vtkjsPath);
      const fileContent = fileBuffer.toString('utf8');
      
      // Si parece ser un JSON simple (empieza con { o [), manejarlo directamente
      if (fileContent.trim().startsWith('{') || fileContent.trim().startsWith('[')) {
        console.log('[Express] 📄 Detected simple JSON file, serving directly');
        
        if (internalPath === 'index.json') {
          // Para index.json, servir el contenido completo
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache');
          return res.send(fileContent);
        } else {
          // Para otros paths internos en JSON simple, retornar error
          return res.status(404).json({ 
            error: 'Simple JSON files only support index.json',
            requested: internalPath,
            supported: ['index.json']
          });
        }
      }
      
      // Si no es JSON simple, procesar como ZIP
      const zip = await JSZip.loadAsync(fileBuffer);
      
      console.log('[Express] 📁 ZIP contains:', Object.keys(zip.files));
      
      // ✅ NORMALIZAR PATH (remover slashes iniciales/finales)
      const normalizedPath = internalPath.replace(/^\/+|\/+$/g, '');
      
      // ✅ BUSCAR ARCHIVO CON DIFERENTES VARIACIONES
      const searchPaths = [
        normalizedPath,
        `data/${normalizedPath}`,
        `scene/${normalizedPath}`,
        normalizedPath.replace(/^data\//, ''), // Remover data/ prefix si existe
        normalizedPath.replace(/^scene\//, ''), // Remover scene/ prefix si existe
      ];
      
      let file = null;
      let foundPath = '';
      
      for (const searchPath of searchPaths) {
        if (zip.files[searchPath] && !zip.files[searchPath].dir) {
          file = zip.files[searchPath];
          foundPath = searchPath;
          console.log('[Express] ✅ Found internal file:', foundPath);
          break;
        }
      }
      
      if (!file) {
        console.log('[Express] ❌ Internal file not found:', normalizedPath);
        console.log('[Express] Available files:', Object.keys(zip.files).filter(f => !zip.files[f].dir));
        return res.status(404).json({ 
          error: 'Internal file not found',
          requested: normalizedPath,
          available: Object.keys(zip.files).filter(f => !zip.files[f].dir)
        });
      }
      
      // ✅ EXTRAER CONTENIDO (diferencial por tipo)
      let content;
      let contentType = 'application/octet-stream';
      
      if (foundPath.endsWith('.json') || foundPath.endsWith('.txt') || foundPath.endsWith('.js')) {
        // Text content
        content = await file.async('text');
        console.log('[Express] 📄 Serving text file:', foundPath, 'Size:', content.length, 'chars');
        
        if (foundPath.endsWith('.json')) {
          contentType = 'application/json';
          // Validar que es JSON válido
          try {
            JSON.parse(content);
            console.log('[Express] ✅ Valid JSON confirmed');
          } catch (jsonError) {
            console.log('[Express] ⚠️ JSON validation failed:', (jsonError as Error).message);
          }
        } else if (foundPath.endsWith('.js')) {
          contentType = 'application/javascript';
        } else if (foundPath.endsWith('.txt')) {
          contentType = 'text/plain';
        }
      } else {
        // Binary content
        const filename = foundPath.split('/').pop() || '';
        
        // ✅ DETECTAR ARCHIVOS DE ARRAYS TIPADOS DE VTK.JS
        const typedArrayPattern = /^(Float(32|64)|Int(8|16|32)|Uint(8|16|32))_\d+/;
        const isTypedArrayFile = typedArrayPattern.test(filename);
        
        if (isTypedArrayFile) {
          // Archivos de datos VTK.js - usar nodebuffer para mejor control
          content = await file.async('nodebuffer');
          console.log('[Express] 🎯 Serving VTK typed array file:', foundPath, 'Size:', content.length, 'bytes');
          
          // ✅ ALINEACIÓN INTELIGENTE: Solo aplicar si es necesario
          const elementSize = filename.includes('64') ? 8 : 4;
          const isAligned = content.length % elementSize === 0;
          
          if (!isAligned) {
            // Solo padding para archivos que realmente necesitan alineación
            const paddedLength = Math.ceil(content.length / elementSize) * elementSize;
            const paddedBytes = paddedLength - content.length;
            console.log(`[Express] ⚠️ CRITICAL: Unaligned VTK data detected: ${filename} ${content.length} → ${paddedLength} bytes (+${paddedBytes})`);
            
            const aligned = Buffer.alloc(paddedLength);
            content.copy(aligned);
            content = aligned;
          } else {
            console.log(`[Express] ✅ VTK data properly aligned: ${filename} (${content.length} bytes, element size: ${elementSize})`);
          }
          
          contentType = 'application/octet-stream';
        } else {
          // Otros archivos binarios (.gz, .png, etc.)
          content = await file.async('arraybuffer');
          console.log('[Express] 📄 Serving binary file:', foundPath, 'Size:', content.byteLength, 'bytes');
          
          if (foundPath.endsWith('.gz')) {
            contentType = 'application/gzip';
          } else if (foundPath.endsWith('.png')) {
            contentType = 'image/png';
          } else if (foundPath.endsWith('.bin') || foundPath.endsWith('.raw')) {
            contentType = 'application/octet-stream';
          }
        }
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
      
      // ✅ HEADERS ESPECÍFICOS PARA DATOS VTK.JS
      const filename = foundPath.split('/').pop() || '';
      const typedArrayPattern = /^(Float(32|64)|Int(8|16|32)|Uint(8|16|32))_\d+/;
      if (typedArrayPattern.test(filename)) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Encoding', 'identity'); // Evitar compresión
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
      
      res.send(content);
      
    } catch (error) {
      console.error('[Express] ❌ Error processing ZIP:', error);
      res.status(500).json({ 
        error: 'Failed to extract internal file from VTK ZIP',
        details: (error as Error).message 
      });
    }
  });

  // ✅ ENDPOINT ROBUSTO PARA .vtkjs (dev + prod)
  app.get("/api/simulations/:id/results/:filename.vtkjs", async (req, res) => {
    const { id, filename } = req.params;
    const simulationId = parseInt(id);
    
    console.log('[Express] VTK request:', { id, filename, simulationId, env: process.env.NODE_ENV });
    
    if (isNaN(simulationId)) {
      return res.status(400).json({ 
        error: 'Invalid simulation ID',
        simulation: id,
        filename: filename 
      });
    }

    // Build correct path based on environment (including sim_ID/vtk/ prefix)
    const uploadsPath = process.env.NODE_ENV === 'production' 
      ? path.join('/tmp', 'uploads', `sim_${id}`, 'vtk')
      : path.join(process.cwd(), 'client', 'public', 'uploads', `sim_${id}`, 'vtk');
      
    // Map specific files for testing
    let actualFilePath;
    if (simulationId === 33 && filename === 'result') {
      actualFilePath = path.join(process.cwd(), 'client', 'public', 'cfd-data.vtkjs');
    } else {
      actualFilePath = path.join(uploadsPath, `${filename}.vtkjs`);
    }
    
    console.log('[Express] Looking for file:', actualFilePath);
    
    // Verificar si existe el archivo
    try {
      await fs.access(actualFilePath);
    } catch {
      console.error('[Express] File not found:', actualFilePath);
      return res.status(404).json({ 
        error: 'VTK file not found',
        simulation: id,
        filename: filename,
        path: process.env.NODE_ENV === 'development' ? actualFilePath : 'hidden'
      });
    }
    
    // ✅ HEADERS UNIVERSALES para VTK.js
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.vtkjs"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    try {
      const fileBuffer = await fs.readFile(actualFilePath);
      console.log('[Express] Sending VTK file:', fileBuffer.length, 'bytes');
      res.send(fileBuffer);
    } catch (error) {
      console.error('[Express] Error reading file:', error);
      res.status(500).json({ error: 'Failed to read VTK file' });
    }
  });

  // ✅ SIMPLE VTK FILE ENDPOINT (.vtk files - not .vtkjs)
  app.get('/api/simulations/:id/results/:filename.vtk', (req, res) => {
    const { id, filename } = req.params;
    const filePath = path.join(process.cwd(), 'uploads', id, `${filename}.vtk`);
    
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: 'VTK file not found' });
    }
    
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(path.resolve(filePath));
  });

  // User credits API endpoint
  app.patch("/api/user/credits", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { credits } = req.body;
      await storage.updateUserCredits(req.user.id, credits);
      res.json({ message: "Credits updated successfully" });
    } catch (error) {
      res.status(400).json({ message: "Invalid credits update" });
    }
  });

  // Admin API endpoints (legacy - requires user authentication)
  app.get("/api/admin/users", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  app.get("/api/admin/simulations", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const simulations = await storage.getAllSimulations();
      res.json(simulations);
    } catch (error) {
      console.error('Error fetching simulations:', error);
      res.status(500).json({ message: "Error fetching simulations" });
    }
  });

  app.get("/api/admin/stats", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      res.status(500).json({ message: "Error fetching admin stats" });
    }
  });

  // Database Admin API endpoints (requires special password authentication)
  const checkDatabaseAuth = (req: Request, res: Response, next: Function) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: "Database access token required" });
    }

    const providedPasswordHash = authHeader.split(' ')[1];
    
    // Hash SHA-256 de la contraseña correcta "flowerpower"
    const ADMIN_PASSWORD_HASH = "b49f2bc773151f63cead40e9fb5bf30a70dbe79e2fdbef56ebe64d3db2f6a536";
    
    // Comparar hashes
    if (providedPasswordHash !== ADMIN_PASSWORD_HASH) {
      return res.status(403).json({ message: "Invalid database access token" });
    }

    next();
  };

  app.get("/api/admindatabase/users", checkDatabaseAuth, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching database users:', error);
      res.status(500).json({ message: "Error fetching database users" });
    }
  });

  app.get("/api/admindatabase/simulations", checkDatabaseAuth, async (req, res) => {
    try {
      const simulations = await storage.getAllSimulations();
      res.json(simulations);
    } catch (error) {
      console.error('Error fetching database simulations:', error);
      res.status(500).json({ message: "Error fetching database simulations" });
    }
  });

  app.get("/api/admindatabase/stats", checkDatabaseAuth, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching database stats:', error);
      res.status(500).json({ message: "Error fetching database stats" });
    }
  });

  app.get("/api/admindatabase/workers", checkDatabaseAuth, async (req, res) => {
    try {
      // Get disk usage information
      let diskUsage = { used: 0, total: 0, unit: "GB" };
      try {
        const dfOutput = execSync('df -BG /').toString();
        console.log('[ADMIN] df output:', dfOutput);
        const lines = dfOutput.split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          console.log('[ADMIN] df parts:', parts);
          if (parts.length >= 4) {
            // Use parseFloat to handle decimal values, then round
            const totalStr = parts[1].replace('G', '').trim();
            const usedStr = parts[2].replace('G', '').trim();
            diskUsage.total = Math.round(parseFloat(totalStr));
            diskUsage.used = Math.round(parseFloat(usedStr));
            console.log('[ADMIN] Disk usage:', diskUsage);
          }
        }
      } catch (diskError) {
        console.error('[EXPRESS] Error getting disk usage:', diskError);
      }

      // Get uploads folder size (simulation results)
      let uploadsSize = { size: 0, unit: "MB" };
      try {
        const uploadsPath = path.join(process.cwd(), 'public', 'uploads');
        // Create directory if it doesn't exist
        if (!fsSync.existsSync(uploadsPath)) {
          fsSync.mkdirSync(uploadsPath, { recursive: true });
        }
        // Get size in MB
        const duOutput = execSync(`du -sm "${uploadsPath}"`).toString();
        console.log('[ADMIN] du output:', duOutput);
        const sizeMB = Math.round(parseFloat(duOutput.split(/\s+/)[0]));
        uploadsSize.size = sizeMB;
        console.log('[ADMIN] Uploads size:', uploadsSize);
      } catch (uploadError) {
        console.error('[EXPRESS] Error getting uploads size:', uploadError);
      }

      // Get system memory information (total system memory, not just Node.js heap)
      const totalMemoryMB = Math.round(os.totalmem() / 1024 / 1024);
      const freeMemoryMB = Math.round(os.freemem() / 1024 / 1024);
      const usedMemoryMB = totalMemoryMB - freeMemoryMB;

      const healthStatus = {
        express: {
          status: "running",
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        },
        worker_submit: checkWorkerHealth("worker_submit"),
        worker_monitor: checkWorkerHealth("worker_monitor"),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          memory: {
            used: usedMemoryMB,
            total: totalMemoryMB,
            unit: "MB"
          },
          disk: diskUsage,
          uploads: uploadsSize
        }
      };

      res.json(healthStatus);
    } catch (error) {
      console.error('[EXPRESS] Error fetching workers health:', error);
      res.status(500).json({ message: "Error fetching workers health" });
    }
  });

  app.patch("/api/admindatabase/users/:id", checkDatabaseAuth, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const updateData = updateUserSchema.parse(req.body);
      
      await db
        .update(users)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (updatedUser.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser[0]);
    } catch (error) {
      console.error('Error updating user:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      res.status(500).json({ message: "Error updating user" });
    }
  });

  app.delete("/api/admindatabase/users/:id", checkDatabaseAuth, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const result = await db
        .delete(users)
        .where(eq(users.id, userId))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ message: "User deleted successfully", deletedUser: result[0] });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: "Error deleting user" });
    }
  });

  app.patch("/api/admindatabase/simulations/:id", checkDatabaseAuth, async (req, res) => {
    try {
      const simulationId = parseInt(req.params.id);
      if (isNaN(simulationId)) {
        return res.status(400).json({ message: "Invalid simulation ID" });
      }

      const updateData = updateSimulationAdminSchema.parse(req.body);
      
      await db
        .update(simulations)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(simulations.id, simulationId));

      const updatedSimulation = await db
        .select()
        .from(simulations)
        .where(eq(simulations.id, simulationId))
        .limit(1);

      if (updatedSimulation.length === 0) {
        return res.status(404).json({ message: "Simulation not found" });
      }

      res.json(updatedSimulation[0]);
    } catch (error) {
      console.error('Error updating simulation:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid simulation data", errors: error.errors });
      }
      res.status(500).json({ message: "Error updating simulation" });
    }
  });

  app.delete("/api/admindatabase/simulations/:id", checkDatabaseAuth, async (req, res) => {
    try {
      const simulationId = parseInt(req.params.id);
      if (isNaN(simulationId)) {
        return res.status(400).json({ message: "Invalid simulation ID" });
      }

      const result = await db
        .delete(simulations)
        .where(eq(simulations.id, simulationId))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ message: "Simulation not found" });
      }

      res.json({ message: "Simulation deleted successfully", deletedSimulation: result[0] });
    } catch (error) {
      console.error('Error deleting simulation:', error);
      res.status(500).json({ message: "Error deleting simulation" });
    }
  });

  // External API to get pending simulations (for worker)
  // IMPORTANT: This route must come BEFORE /:id to avoid route conflicts
  app.get("/api/external/simulations/pending", async (req, res) => {
    try {
      // Check API key for external access
      const apiKey = req.headers['x-api-key'];
      if (!apiKey || apiKey !== 'flowerpower-external-api') {
        return res.status(401).json({ message: "Invalid API key" });
      }

      console.log('[EXPRESS] Fetching pending simulations...');

      // Get all simulations with status 'pending'
      const pendingSimulations = await db
        .select({
          id: simulations.id,
          userId: simulations.userId,
          name: simulations.name,
          filePath: simulations.filePath,
          status: simulations.status,
          simulationType: simulations.simulationType,
          packageType: simulations.packageType,
          cost: simulations.cost,
          jsonConfig: simulations.jsonConfig,
          createdAt: simulations.createdAt,
          updatedAt: simulations.updatedAt,
        })
        .from(simulations)
        .where(eq(simulations.status, 'pending'))
        .orderBy(simulations.createdAt);

      console.log('[EXPRESS] Found pending simulations:', pendingSimulations.length);

      res.json({
        success: true,
        count: pendingSimulations.length,
        simulations: pendingSimulations
      });
    } catch (error) {
      console.error('[EXPRESS] Error fetching pending simulations:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // External API to get cloud_execution simulations (for worker monitor)
  app.get("/api/external/simulations/cloud_execution", async (req, res) => {
    try {
      // Check API key for external access
      const apiKey = req.headers['x-api-key'];
      if (!apiKey || apiKey !== 'flowerpower-external-api') {
        return res.status(401).json({ message: "Invalid API key" });
      }

      console.log('[EXPRESS] Fetching cloud_execution simulations...');

      // Get all simulations with status 'cloud_execution'
      const cloudSimulations = await db
        .select({
          id: simulations.id,
          userId: simulations.userId,
          name: simulations.name,
          filePath: simulations.filePath,
          status: simulations.status,
          simulationType: simulations.simulationType,
          packageType: simulations.packageType,
          cost: simulations.cost,
          taskId: simulations.taskId,
          jsonConfig: simulations.jsonConfig,
          createdAt: simulations.createdAt,
          updatedAt: simulations.updatedAt,
        })
        .from(simulations)
        .where(eq(simulations.status, 'cloud_execution'))
        .orderBy(simulations.createdAt);

      console.log('[EXPRESS] Found cloud_execution simulations:', cloudSimulations.length);

      res.json({
        success: true,
        count: cloudSimulations.length,
        simulations: cloudSimulations
      });
    } catch (error) {
      console.error('[EXPRESS] Error fetching cloud_execution simulations:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // External API to get post_processing simulations (for worker monitor recovery)
  app.get("/api/external/simulations/post_processing", async (req, res) => {
    try {
      // Check API key for external access
      const apiKey = req.headers['x-api-key'];
      if (!apiKey || apiKey !== 'flowerpower-external-api') {
        return res.status(401).json({ message: "Invalid API key" });
      }

      console.log('[EXPRESS] Fetching post_processing simulations...');

      // Get all simulations with status 'post_processing' (orphaned simulations)
      const postProcessingSimulations = await db
        .select({
          id: simulations.id,
          userId: simulations.userId,
          name: simulations.name,
          filePath: simulations.filePath,
          status: simulations.status,
          simulationType: simulations.simulationType,
          packageType: simulations.packageType,
          cost: simulations.cost,
          taskId: simulations.taskId,
          jsonConfig: simulations.jsonConfig,
          createdAt: simulations.createdAt,
          updatedAt: simulations.updatedAt,
        })
        .from(simulations)
        .where(eq(simulations.status, 'post_processing'))
        .orderBy(simulations.createdAt);

      console.log('[EXPRESS] Found post_processing simulations:', postProcessingSimulations.length);

      res.json({
        success: true,
        count: postProcessingSimulations.length,
        simulations: postProcessingSimulations
      });
    } catch (error) {
      console.error('[EXPRESS] Error fetching post_processing simulations:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // External API to get simulation details with user info
  app.get("/api/external/simulations/:id", async (req, res) => {
    try {
      // Check API key for external access
      const apiKey = req.headers['x-api-key'];
      if (!apiKey || apiKey !== 'flowerpower-external-api') {
        return res.status(401).json({ message: "Invalid API key" });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid simulation ID" });
      }

      // Get simulation with user details
      const result = await db
        .select({
          // Simulation info
          id: simulations.id,
          name: simulations.name,
          filePath: simulations.filePath,
          status: simulations.status,
          simulationType: simulations.simulationType,
          packageType: simulations.packageType,
          cost: simulations.cost,
          isPublic: simulations.isPublic,
          createdAt: simulations.createdAt,
          completedAt: simulations.completedAt,
          updatedAt: simulations.updatedAt,
          // User info
          user: {
            id: users.id,
            username: users.username,
            email: users.email,
            fullName: users.fullName,
            credits: users.credits
          }
        })
        .from(simulations)
        .innerJoin(users, eq(simulations.userId, users.id))
        .where(eq(simulations.id, id))
        .limit(1);

      if (result.length === 0) {
        return res.status(404).json({ message: "Simulation not found" });
      }

      res.json({
        success: true,
        simulation: result[0]
      });
    } catch (error) {
      console.error('Error fetching simulation details:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // External API for simulation status updates (for external servers)
  app.patch("/api/external/simulations/:id/status", async (req, res) => {
    try {
      // Check API key for external access
      const apiKey = req.headers['x-api-key'];
      if (!apiKey || apiKey !== 'flowerpower-external-api') {
        return res.status(401).json({ message: "Invalid API key" });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid simulation ID" });
      }

      // Validate request body
      const { status, result, completedAt, taskId, progress, currentStep, errorMessage, startedAt } = req.body;
      const validStatuses = Object.keys(VALID_TRANSITIONS);

      // Status is optional for progress-only updates
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ 
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
      }

      // Prepare status update (status is optional for progress updates)
      const statusUpdate: any = {};
      if (status) {
        statusUpdate.status = status;
      }
      if (result !== undefined) {
        statusUpdate.result = result;
      }
      if (taskId !== undefined) {
        statusUpdate.taskId = taskId;
      }
      if (progress !== undefined) {
        statusUpdate.progress = progress;
      }
      if (currentStep !== undefined) {
        statusUpdate.currentStep = currentStep;
      }
      if (errorMessage !== undefined) {
        statusUpdate.errorMessage = errorMessage;
      }
      if (startedAt) {
        statusUpdate.startedAt = new Date(startedAt);
      }
      if (completedAt) {
        statusUpdate.completedAt = new Date(completedAt);
      } else if (status === 'completed') {
        statusUpdate.completedAt = new Date();
      }

      let simulation;

      if (status) {
        // State-machine path: read current status, validate transition, atomic CAS update.
        const current = await storage.getSimulation(id);
        if (!current) {
          return res.status(404).json({ message: "Simulation not found" });
        }

        const allowed = VALID_TRANSITIONS[current.status] ?? [];
        if (!allowed.includes(status)) {
          console.warn(
            `[STATE_MACHINE] Rejected transition for sim ${id}: '${current.status}' → '${status}'`
          );
          return res.status(409).json({
            message: `Invalid transition: ${current.status} → ${status}`,
            currentStatus: current.status,
            requestedStatus: status,
            allowedTransitions: allowed,
          });
        }

        console.log(`[STATE_MACHINE] sim ${id}: '${current.status}' → '${status}'`);
        try {
          simulation = await storage.updateSimulationStatusAtomic(id, current.status, statusUpdate);
        } catch (err) {
          if (err instanceof ConcurrentUpdateError) {
            console.warn(`[STATE_MACHINE] Concurrent update for sim ${id}: ${err.message}`);
            return res.status(409).json({
              message: 'Concurrent update detected',
              detail: err.message,
            });
          }
          throw err;
        }
      } else {
        // Progress-only path: no transition validation needed.
        console.log(`[EXPRESS] Progress update for sim ${id} (no status change)`);
        simulation = await storage.updateSimulationStatus(id, statusUpdate);
        if (!simulation) {
          return res.status(404).json({ message: "Simulation not found" });
        }
      }

      res.json({ 
        success: true, 
        message: status ? `Simulation ${id} status updated to ${status}` : `Simulation ${id} progress updated`,
        simulation: {
          id: simulation.id,
          name: simulation.name,
          status: simulation.status,
          completedAt: simulation.completedAt,
          updatedAt: simulation.updatedAt
        }
      });
    } catch (error) {
      console.error('Error updating simulation status externally:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // TEMPORARY DEBUG ENDPOINT - Get simulation JSON content
  app.get("/api/debug/simulation/:id/json", async (req, res) => {
    try {
      const simId = parseInt(req.params.id);
      const simulation = await storage.getSimulation(simId);
      
      if (!simulation) {
        return res.status(404).json({ message: "Simulation not found" });
      }

      const filePath = path.join(process.cwd(), simulation.filePath);
      
      try {
        const jsonContent = await fs.readFile(filePath, 'utf-8');
        const jsonData = JSON.parse(jsonContent);
        res.json({
          simulation: {
            id: simulation.id,
            name: simulation.name,
            status: simulation.status,
            errorMessage: simulation.errorMessage,
            filePath: simulation.filePath
          },
          jsonData
        });
      } catch (fileError) {
        console.error('[DEBUG] Error reading JSON file:', fileError);
        res.status(500).json({ 
          message: "Error reading simulation file",
          error: fileError instanceof Error ? fileError.message : String(fileError),
          filePath: simulation.filePath
        });
      }
    } catch (error) {
      console.error('[DEBUG] Error in debug endpoint:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}