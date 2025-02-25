import { pgTable, text, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const pointSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const wallSchema = z.object({
  start: pointSchema,
  end: pointSchema
});

export const doorWindowSchema = z.object({
  type: z.enum(['door', 'window', 'grid']),
  position: pointSchema,
  width: z.number(),
  height: z.number(),
  zPosition: z.number(), // Height from floor
  rotation: z.number()
});

export const roomSchema = z.object({
  walls: z.array(wallSchema),
  doors: z.array(doorWindowSchema.extend({
    type: z.literal('door')
  })),
  windows: z.array(doorWindowSchema.extend({
    type: z.literal('window')
  })),
  gridPoints: z.array(doorWindowSchema.extend({
    type: z.literal('grid')
  })),
  gridSize: z.number(),
  width: z.number(),
  height: z.number()
});

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  data: jsonb("data").$type<z.infer<typeof roomSchema>>().notNull()
});

export const insertRoomSchema = createInsertSchema(rooms);

export type Point = z.infer<typeof pointSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type DoorWindow = z.infer<typeof doorWindowSchema>;
export type Room = z.infer<typeof roomSchema>;
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type RoomWithId = typeof rooms.$inferSelect;