import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertSimulationSchema, updateSimulationStatusSchema, simulations, users } from "@shared/schema";
import { z } from "zod";
import { setupAuth } from "./auth";
import { promises as fs } from "fs";
import * as fsSync from "fs";
import path from "path";
import JSZip from "jszip";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
      googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID || ''
    });
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

      const { name, simulationType, status, jsonConfig } = req.body;

      // Validation 1: Check simulation name
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "Simulation name is required" });
      }

      if (name.trim().length < 3 || name.trim().length > 100) {
        return res.status(400).json({ message: "Simulation name must be between 3 and 100 characters" });
      }

      // Validation 2: Check simulation type
      const validTypes = ['comfort', 'renovation', 'test_calculation'];
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
        simulationCost = simulationType === 'comfort' ? 10 : 12; // Steady: €10, Air Renovation: €12
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

      // Save JSON file
      try {
        await fs.writeFile(filePath, JSON.stringify(jsonConfig, null, 2));
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
        jsonConfig,
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
        simulationType: 'comfort',
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
      const vtkDir = path.join(process.cwd(), 'public', 'uploads', `sim_${simulationId}`, 'vtk');
      
      // Check if directory exists
      if (!fsSync.existsSync(vtkDir)) {
        return res.json({ files: [] });
      }
      
      // List all .vtkjs files
      const files = fsSync.readdirSync(vtkDir)
        .filter(f => f.endsWith('.vtkjs'))
        .map(filename => {
          const stats = fsSync.statSync(path.join(vtkDir, filename));
          
          // Parse OpenFOAM files to extract timestep and type
          let timestep = null;
          let type = 'slice';
          
          if (filename.startsWith('openfoam_')) {
            // Check if it's a boundary surface
            if (filename.includes('boundary_')) {
              type = 'boundary';
            } else if (filename.includes('internal')) {
              type = 'volume_internal';
            } else {
              type = 'volume';
            }
            
            // Extract timestep from filename like: openfoam_artifacts_5_internal.vtkjs
            const match = filename.match(/artifacts_(\d+)/);
            if (match) {
              timestep = parseFloat(match[1]);
            }
          }
          
          return {
            filename,
            path: `/uploads/sim_${simulationId}/vtk/${filename}`,
            type,
            timestep,
            size: stats.size,
            modified: stats.mtime
          };
        })
        .sort((a, b) => {
          // Sort: boundary > volume > volume_internal > slices, then by timestep
          const typeOrder: Record<string, number> = { boundary: 0, volume: 1, volume_internal: 2, slice: 3 };
          const orderDiff = (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
          if (orderDiff !== 0) return orderDiff;
          
          // Within same type, sort by timestep (descending)
          if (a.timestep !== null && b.timestep !== null) {
            return b.timestep - a.timestep;
          }
          return a.filename.localeCompare(b.filename);
        });
      
      // Get latest volume file (prioritize volume_internal which contains full geometry)
      const latestVolume = files.find(f => f.type === 'volume_internal' || f.type === 'volume');
      
      res.json({ 
        files,
        latestVolume: latestVolume || null,
        count: files.length
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to list VTK files", error: error.message });
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

    // Map to actual .vtkjs file location
    let vtkjsPath;
    if (simulationId === 33 && filename === 'result') {
      vtkjsPath = path.join(process.cwd(), 'client', 'public', 'cfd-data.vtkjs');
    } else {
      const uploadsPath = process.env.NODE_ENV === 'production' 
        ? path.join('/app/uploads', id) 
        : path.join(process.cwd(), 'client', 'public');
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

    // En producción, usar path absoluto; en dev, relativo
    const uploadsPath = process.env.NODE_ENV === 'production' 
      ? path.join('/app/uploads', id) // Ajustar según tu deploy
      : path.join(process.cwd(), 'client', 'public'); // Por ahora usar public para pruebas
      
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

    const token = authHeader.split(' ')[1];
    if (token !== 'flowerpower') {
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
      const validStatuses = ['pending', 'processing', 'geometry', 'meshing', 'cfd_setup', 'cloud_execution', 'post_processing', 'completed', 'failed'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ 
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
      }

      // Prepare status update
      const statusUpdate: any = { status };
      if (result !== undefined) {
        statusUpdate.result = result; // Store result from external processing (e.g., Inductiva)
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
        statusUpdate.completedAt = new Date(); // Auto-set completion time
      }
      
      console.log('[EXPRESS] Updating simulation status:', { id, status, hasResult: !!result });
      const simulation = await storage.updateSimulationStatus(id, statusUpdate);
      
      if (!simulation) {
        return res.status(404).json({ message: "Simulation not found" });
      }

      res.json({ 
        success: true, 
        message: `Simulation ${id} status updated to ${status}`,
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

  const httpServer = createServer(app);
  return httpServer;
}