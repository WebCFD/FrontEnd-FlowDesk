import { users, simulations, type User, type InsertUser, type Simulation, type InsertSimulation } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Simulation methods
  createSimulation(simulation: InsertSimulation & { userId: number }): Promise<Simulation>;
  getSimulationsByUserId(userId: number): Promise<Simulation[]>;
  getSimulation(id: number): Promise<Simulation | undefined>;

  // Session store
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      conObject: {
        connectionString: process.env.DATABASE_URL,
      },
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createSimulation(simulation: InsertSimulation & { userId: number }): Promise<Simulation> {
    const [newSimulation] = await db
      .insert(simulations)
      .values({
        ...simulation,
        status: 'draft',
      })
      .returning();
    return newSimulation;
  }

  async getSimulationsByUserId(userId: number): Promise<Simulation[]> {
    return db
      .select()
      .from(simulations)
      .where(eq(simulations.userId, userId))
      .orderBy(simulations.createdAt);
  }

  async getSimulation(id: number): Promise<Simulation | undefined> {
    const [simulation] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, id));
    return simulation;
  }
}

export const storage = new DatabaseStorage();