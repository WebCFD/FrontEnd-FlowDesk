import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { insertRoomSchema } from "@shared/schema";

export async function registerRoutes(app: Express) {
  app.get("/api/rooms", async (_req, res) => {
    const rooms = await storage.getRooms();
    res.json(rooms);
  });

  app.get("/api/rooms/:id", async (req, res) => {
    const room = await storage.getRoom(Number(req.params.id));
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    res.json(room);
  });

  app.post("/api/rooms", async (req, res) => {
    const parsed = insertRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid room data" });
      return;
    }
    const room = await storage.createRoom(parsed.data);
    res.json(room);
  });

  app.put("/api/rooms/:id", async (req, res) => {
    const parsed = insertRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid room data" });
      return;
    }
    const room = await storage.updateRoom(Number(req.params.id), parsed.data);
    res.json(room);
  });

  app.delete("/api/rooms/:id", async (req, res) => {
    await storage.deleteRoom(Number(req.params.id));
    res.status(204).send();
  });

  return createServer(app);
}
