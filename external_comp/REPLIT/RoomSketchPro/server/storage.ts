import { rooms, type RoomWithId, type InsertRoom } from "@shared/schema";

export interface IStorage {
  getRooms(): Promise<RoomWithId[]>;
  getRoom(id: number): Promise<RoomWithId | undefined>;
  createRoom(room: InsertRoom): Promise<RoomWithId>;
  updateRoom(id: number, room: InsertRoom): Promise<RoomWithId>;
  deleteRoom(id: number): Promise<void>;
}

export class MemStorage implements IStorage {
  private rooms: Map<number, RoomWithId>;
  private currentId: number;

  constructor() {
    this.rooms = new Map();
    this.currentId = 1;
  }

  async getRooms(): Promise<RoomWithId[]> {
    return Array.from(this.rooms.values());
  }

  async getRoom(id: number): Promise<RoomWithId | undefined> {
    return this.rooms.get(id);
  }

  async createRoom(room: InsertRoom): Promise<RoomWithId> {
    const id = this.currentId++;
    const newRoom = { ...room, id };
    this.rooms.set(id, newRoom);
    return newRoom;
  }

  async updateRoom(id: number, room: InsertRoom): Promise<RoomWithId> {
    const updatedRoom = { ...room, id };
    this.rooms.set(id, updatedRoom);
    return updatedRoom;
  }

  async deleteRoom(id: number): Promise<void> {
    this.rooms.delete(id);
  }
}

export const storage = new MemStorage();
