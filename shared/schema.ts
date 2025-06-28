import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(), // 'draft', 'running', 'completed'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// @deprecated - kept for backwards compatibility
export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Schema for user registration and update
export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
    email: true,
  })
  .extend({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
  });

// Schema for creating simulations
export const simulationSchema = createInsertSchema(simulations)
  .pick({
    name: true,
  });

// Schema for contact messages (deprecated)
export const contactMessageSchema = createInsertSchema(contactMessages)
  .pick({
    name: true,
    email: true,
    message: true,
  });

// Simulation data schemas
export const airOrientationSchema = z.object({
  verticalAngle: z.number().min(-45).max(45),
  horizontalAngle: z.number().min(-45).max(45),
}).nullable();

export const airEntrySchema = z.object({
  id: z.string(),
  type: z.enum(['window', 'door', 'vent']),
  position: z.object({
    x: z.number(),
    y: z.number(),
    centerHeight: z.number(),
  }),
  normal: z.object({
    x: z.number(),
    y: z.number(),
  }),
  shape: z.enum(['rectangular', 'circular']),
  width: z.number().nullable(),
  height: z.number().nullable(),
  diameter: z.number().nullable(),
  isOpen: z.boolean(),
  temperature: z.number(),
  airDirection: z.enum(['inflow', 'outflow']),
  flowIntensity: z.enum(['low', 'medium', 'high', 'custom']),
  customIntensityValue: z.number().nullable(),
  ventFlowType: z.enum(['massflow', 'velocity', 'pressure']).nullable(),
  airOrientation: airOrientationSchema,
});

export const wallSchema = z.object({
  id: z.string(),
  start: z.object({
    x: z.number(),
    y: z.number(),
  }),
  end: z.object({
    x: z.number(),
    y: z.number(),
  }),
  airEntries: z.array(airEntrySchema),
});

export const floorSchema = z.object({
  id: z.number(),
  height: z.number(),
  floorDeck: z.number(),
  walls: z.array(wallSchema),
});

export const simulationDataSchema = z.object({
  version: z.string(),
  floors: z.array(floorSchema),
});

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Simulation = typeof simulations.$inferSelect;
export type InsertSimulation = z.infer<typeof simulationSchema>;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = z.infer<typeof contactMessageSchema>;

// Simulation data types
export type AirOrientation = z.infer<typeof airOrientationSchema>;
export type AirEntry = z.infer<typeof airEntrySchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type SimulationData = z.infer<typeof simulationDataSchema>;