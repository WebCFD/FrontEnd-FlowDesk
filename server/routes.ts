import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertSimulationSchema, updateSimulationStatusSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth } from "./auth";
import { promises as fs } from "fs";
import path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
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
      const validTypes = ['comfort', 'renovation'];
      if (!validTypes.includes(simulationType)) {
        return res.status(400).json({ message: "Invalid simulation type" });
      }

      // Validation 3: Check status
      const validStatuses = ['completed', 'processing', 'failed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid simulation status" });
      }

      // Validation 4: Check if user has enough credits - dynamic pricing
      const simulationCost = simulationType === 'comfort' ? 10 : 12; // Steady: €10, Air Renovation: €12
      const hasEnoughCredits = await storage.debitUserCredits(req.user.id, simulationCost);
      
      if (!hasEnoughCredits) {
        return res.status(400).json({ 
          message: `Insufficient credits. You need at least €${simulationCost} to run this simulation.` 
        });
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

  const httpServer = createServer(app);
  return httpServer;
}