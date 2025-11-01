import { pgTable, text, serial, integer, boolean, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  credits: decimal("credits", { precision: 10, scale: 2 }).default("500.00").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  filePath: text("file_path").notNull(),
  status: text("status").notNull(), // 'pending', 'processing', 'geometry', 'meshing', 'cfd_setup', 'cloud_execution', 'post_processing', 'completed', 'failed'
  simulationType: text("simulation_type").notNull(), // 'comfortTest', 'comfort30Iter', 'test_calculation'
  packageType: text("package_type").notNull(), // 'basic', 'professional', 'enterprise'
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  jsonConfig: jsonb("json_config"), // Complete simulation configuration or parameters for test
  result: jsonb("result"), // Result from external processing (e.g., Inductiva API)
  taskId: text("task_id"),
  progress: integer("progress").default(0),
  currentStep: text("current_step"),
  errorMessage: text("error_message"),
  failedStep: text("failed_step"), // Pipeline step where failure occurred: 'geometry', 'meshing', 'cfd_setup', 'cloud_execution'
  errorType: text("error_type"), // Exception class name for categorization
  failureDetails: jsonb("failure_details"), // Detailed error context from PipelineStepError
  suggestion: text("suggestion"), // User-facing suggestion for fixing the error
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
export const insertSimulationSchema = createInsertSchema(simulations)
  .pick({
    name: true,
    filePath: true,
    status: true,
    simulationType: true,
    packageType: true,
    cost: true,
    isPublic: true,
    jsonConfig: true,
  })
  .extend({
    status: z.enum([
      'pending',
      'processing',
      'geometry',
      'meshing',
      'cfd_setup',
      'cloud_execution',
      'post_processing',
      'completed',
      'failed'
    ]),
    simulationType: z.enum(['comfortTest', 'comfort30Iter', 'test_calculation']),
    packageType: z.enum(['basic', 'professional', 'enterprise']),
    cost: z.string().transform(val => parseFloat(val)),
  });

// Schema for updating simulation status
export const updateSimulationStatusSchema = z.object({
  status: z.enum([
    'pending', 'processing', 'geometry', 'meshing',
    'cfd_setup', 'cloud_execution', 'post_processing',
    'completed', 'failed'
  ]).optional(),
  taskId: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  currentStep: z.string().optional(),
  errorMessage: z.string().optional(),
  failedStep: z.enum(['geometry', 'meshing', 'cfd_setup', 'cloud_execution', 'post_processing', 'unknown']).optional(),
  errorType: z.string().optional(),
  failureDetails: z.any().optional(), // JSONB field for detailed error context
  suggestion: z.string().optional(),
  result: z.any().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
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
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
export type UpdateSimulationStatus = z.infer<typeof updateSimulationStatusSchema>;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = z.infer<typeof contactMessageSchema>;

// Simulation data types
export type AirOrientation = z.infer<typeof airOrientationSchema>;
export type AirEntry = z.infer<typeof airEntrySchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type SimulationData = z.infer<typeof simulationDataSchema>;