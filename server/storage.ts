import { users, simulations, type User, type InsertUser, type Simulation, type InsertSimulation, type UpdateSimulationStatus } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserCredits(userId: number, credits: string): Promise<void>;
  debitUserCredits(userId: number, amount: number): Promise<boolean>;

  // Simulation methods
  createSimulation(simulation: InsertSimulation & { userId: number }): Promise<Simulation>;
  getSimulationsByUserId(userId: number): Promise<Simulation[]>;
  getSimulation(id: number): Promise<Simulation | undefined>;
  updateSimulationStatus(id: number, status: UpdateSimulationStatus): Promise<Simulation>;
  getCompletedSimulationsByUserId(userId: number): Promise<Simulation[]>;
  deleteSimulation(id: number, userId: number): Promise<boolean>;

  // Admin methods
  getAllUsers(): Promise<User[]>;
  getAllSimulations(): Promise<(Simulation & { user: { username: string; email: string } })[]>;
  getAdminStats(): Promise<{
    totalUsers: number;
    totalSimulations: number;
    completedSimulations: number;
    processingSimulations: number;
    failedSimulations: number;
    totalCreditsUsed: number;
  }>;

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
        name: simulation.name,
        filePath: simulation.filePath,
        status: simulation.status,
        simulationType: simulation.simulationType,
        packageType: simulation.packageType,
        cost: simulation.cost.toString(),
        isPublic: simulation.isPublic,
        jsonConfig: simulation.jsonConfig,
        userId: simulation.userId,
      })
      .returning();
    return newSimulation;
  }

  async updateUserCredits(userId: number, credits: string): Promise<void> {
    await db
      .update(users)
      .set({ credits })
      .where(eq(users.id, userId));
  }

  async debitUserCredits(userId: number, amount: number): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;
    
    const currentCredits = parseFloat(user.credits);
    if (currentCredits < amount) return false;
    
    const newCredits = (currentCredits - amount).toFixed(2);
    await this.updateUserCredits(userId, newCredits);
    return true;
  }

  async updateSimulationStatus(id: number, statusUpdate: UpdateSimulationStatus): Promise<Simulation> {
    const [simulation] = await db
      .update(simulations)
      .set(statusUpdate)
      .where(eq(simulations.id, id))
      .returning();
    return simulation;
  }

  async getCompletedSimulationsByUserId(userId: number): Promise<Simulation[]> {
    return db
      .select()
      .from(simulations)
      .where(and(eq(simulations.userId, userId), eq(simulations.status, 'completed')))
      .orderBy(desc(simulations.createdAt));
  }

  async getSimulationsByUserId(userId: number): Promise<Simulation[]> {
    return db
      .select()
      .from(simulations)
      .where(eq(simulations.userId, userId))
      .orderBy(desc(simulations.createdAt));
  }

  async getSimulation(id: number): Promise<Simulation | undefined> {
    const [simulation] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, id));
    return simulation;
  }

  async deleteSimulation(id: number, userId: number): Promise<boolean> {
    try {
      // Verify the simulation belongs to the user
      const simulation = await db
        .select()
        .from(simulations)
        .where(and(eq(simulations.id, id), eq(simulations.userId, userId)));
      
      if (simulation.length === 0) {
        return false; // Simulation not found or doesn't belong to user
      }

      // Delete the simulation from database
      await db
        .delete(simulations)
        .where(and(eq(simulations.id, id), eq(simulations.userId, userId)));
      
      return true;
    } catch (error) {
      console.error('Error deleting simulation from database:', error);
      return false;
    }
  }

  async getAllUsers(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt));
  }

  async getAllSimulations(): Promise<(Simulation & { user: { username: string; email: string } })[]> {
    const result = await db
      .select({
        id: simulations.id,
        userId: simulations.userId,
        name: simulations.name,
        filePath: simulations.filePath,
        status: simulations.status,
        simulationType: simulations.simulationType,
        packageType: simulations.packageType,
        cost: simulations.cost,
        isPublic: simulations.isPublic,
        jsonConfig: simulations.jsonConfig,
        createdAt: simulations.createdAt,
        completedAt: simulations.completedAt,
        updatedAt: simulations.updatedAt,
        user: {
          username: users.username,
          email: users.email,
        },
      })
      .from(simulations)
      .innerJoin(users, eq(simulations.userId, users.id))
      .orderBy(desc(simulations.createdAt));
    
    return result;
  }

  async getAdminStats(): Promise<{
    totalUsers: number;
    totalSimulations: number;
    completedSimulations: number;
    processingSimulations: number;
    failedSimulations: number;
    totalCreditsUsed: number;
  }> {
    // Get user count
    const userCountResult = await db.select({ count: users.id }).from(users);
    const totalUsers = userCountResult.length;

    // Get all simulations for statistics
    const allSimulations = await db.select().from(simulations);
    const totalSimulations = allSimulations.length;
    
    const completedSimulations = allSimulations.filter(s => s.status === 'completed').length;
    const processingSimulations = allSimulations.filter(s => s.status === 'processing').length;
    const failedSimulations = allSimulations.filter(s => s.status === 'failed').length;
    
    // Calculate total credits used from simulations cost
    const totalCreditsUsed = allSimulations.reduce((sum, sim) => {
      return sum + parseFloat(sim.cost || '0');
    }, 0);

    return {
      totalUsers,
      totalSimulations,
      completedSimulations,
      processingSimulations,
      failedSimulations,
      totalCreditsUsed,
    };
  }
}

export const storage = new DatabaseStorage();