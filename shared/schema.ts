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

// Simulation data schemas - Updated to match actual JSON export format
export const airOrientationSchema = z.object({
  verticalAngle: z.number().min(-45).max(45),
  horizontalAngle: z.number().min(-45).max(45),
}).nullable();

export const simulationPropertiesSchema = z.object({
  state: z.enum(['open', 'closed']).optional(),
  temperature: z.number().optional(),
  flowIntensity: z.enum(['low', 'medium', 'high', 'custom']).optional(),
  airDirection: z.enum(['inflow', 'outflow']).optional(),
  customValue: z.number().optional(),
  flowType: z.enum(['massFlow', 'velocity', 'pressure']).optional(),
  airOrientation: airOrientationSchema.optional(),
});

export const airEntryExportSchema = z.object({
  id: z.string(),
  type: z.enum(['window', 'door', 'vent']),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    normal: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    }),
  }),
  dimensions: z.union([
    z.object({
      width: z.number(),
      height: z.number(),
      shape: z.literal('rectangular'),
    }),
    z.object({
      diameter: z.number(),
      shape: z.literal('circular'),
    }),
  ]),
  simulation: simulationPropertiesSchema,
});

export const stairLineSchema = z.object({
  id: z.string(),
  start: z.object({
    x: z.number(),
    y: z.number(),
  }),
  end: z.object({
    x: z.number(),
    y: z.number(),
  }),
});

export const stairSchema = z.object({
  id: z.string(),
  lines: z.array(stairLineSchema),
  connectsTo: z.string().optional(),
});

export const wallExportSchema = z.object({
  id: z.string(),
  start: z.object({
    x: z.number(),
    y: z.number(),
  }),
  end: z.object({
    x: z.number(),
    y: z.number(),
  }),
  temp: z.number(),
  airEntries: z.array(airEntryExportSchema),
});

export const furnitureExportSchema = z.object({
  id: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  rotation: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  scale: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  state: z.string().optional(),
  simulationProperties: z.object({
    flowType: z.string().optional(),
    flowValue: z.number().optional(),
    flowIntensity: z.string().optional(),
    airOrientation: z.string().optional(),
    state: z.string().optional(),
    customIntensityValue: z.number().optional(),
    verticalAngle: z.number().optional(),
    horizontalAngle: z.number().optional(),
    airTemperature: z.number().optional(),
    normalVector: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    }).optional(),
  }).optional(),
});

export const floorExportSchema = z.object({
  height: z.number(),
  floorDeck: z.number(),
  ceilingTemperature: z.number().optional(),
  floorTemperature: z.number().optional(),
  walls: z.array(wallExportSchema),
  stairs: z.array(stairSchema),
  furniture: z.array(furnitureExportSchema),
});

export const simulationExportSchema = z.object({
  version: z.string(),
  floors: z.record(z.string(), floorExportSchema),
});

// Legacy schemas for backward compatibility
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

// Export format types
export type AirOrientation = z.infer<typeof airOrientationSchema>;
export type SimulationProperties = z.infer<typeof simulationPropertiesSchema>;
export type AirEntryExport = z.infer<typeof airEntryExportSchema>;
export type StairLine = z.infer<typeof stairLineSchema>;
export type Stair = z.infer<typeof stairSchema>;
export type WallExport = z.infer<typeof wallExportSchema>;
export type FurnitureExport = z.infer<typeof furnitureExportSchema>;
export type FloorExport = z.infer<typeof floorExportSchema>;
export type SimulationExport = z.infer<typeof simulationExportSchema>;

// Legacy types (for backward compatibility)
export type AirEntry = z.infer<typeof airEntrySchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type SimulationData = z.infer<typeof simulationDataSchema>;