import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { contactMessageSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes and middleware
  setupAuth(app);

  app.post("/api/contact", async (req: Request, res: Response) => {
    try {
      const message = contactMessageSchema.parse(req.body);
      const savedMessage = await storage.createContactMessage(message);
      res.json({ success: true, message: "Message sent successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}