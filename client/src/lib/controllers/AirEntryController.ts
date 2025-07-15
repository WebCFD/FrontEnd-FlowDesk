/**
 * AirEntryController - Single Source of Truth for AirEntry Management
 * 
 * This controller centralizes all AirEntry operations, providing:
 * - Immutable ID generation and management
 * - State consistency across all views
 * - Observer pattern for reactive updates
 * - Conflict resolution between simultaneous edits
 * - Validation and transformation logic
 */

import { v4 as uuidv4 } from 'uuid';

// Types
export interface AirEntryPosition {
  x: number;
  y: number;
  z?: number;
}

export interface AirEntryDimensions {
  width: number;
  height: number;
  distanceToFloor?: number;
  shape?: 'rectangular' | 'circular';
}

export interface AirEntrySimulationProperties {
  elementState?: 'open' | 'closed';
  airTemperature?: number;
  airDirection?: 'inflow' | 'outflow';
  flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
  flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
  customIntensity?: number;
  verticalAngle?: number;
  horizontalAngle?: number;
  material?: string;
  temperature?: number;
  emissivity?: number;
}

export interface AirEntryLine {
  start: AirEntryPosition;
  end: AirEntryPosition;
}

export interface ControlledAirEntry {
  // Immutable Properties
  readonly id: string;
  readonly floorName: string;
  readonly createdAt: number;
  
  // Mutable Properties
  type: 'window' | 'door' | 'vent';
  position: AirEntryPosition;
  dimensions: AirEntryDimensions;
  line: AirEntryLine;
  properties: AirEntrySimulationProperties;
  
  // Metadata
  wallPosition?: number; // Position along wall as percentage
  lastModified: number;
  
  // Legacy data mapping for backward compatibility
  readonly legacyData: {
    id: string;
    type: 'window' | 'door' | 'vent';
    position: { x: number; y: number; z?: number };
    dimensions: {
      width: number;
      height: number;
      distanceToFloor?: number;
      shape?: 'rectangular' | 'circular';
    };
    line: { start: { x: number; y: number }; end: { x: number; y: number } };
    properties?: any;
    wallPosition?: number;
  };
}

export interface AirEntryUpdate {
  position?: Partial<AirEntryPosition>;
  dimensions?: Partial<AirEntryDimensions>;
  properties?: Partial<AirEntrySimulationProperties>;
  wallPosition?: number;
}

export type AirEntryChangeEvent = {
  type: 'create' | 'update' | 'delete';
  floorName: string;
  entryId: string;
  entry?: ControlledAirEntry;
  oldEntry?: ControlledAirEntry;
};

export type AirEntryObserver = (event: AirEntryChangeEvent) => void;

/**
 * Central controller for all AirEntry operations
 */
export class AirEntryController {
  private entries = new Map<string, ControlledAirEntry>();
  private floorEntries = new Map<string, Set<string>>();
  private observers = new Set<AirEntryObserver>();
  private idCounters = new Map<string, number>();

  constructor() {
    // Initialize with proper error handling
    this.validateState();
  }

  // ==================== CORE CRUD OPERATIONS ====================

  /**
   * Creates a new AirEntry with guaranteed unique ID
   */
  createEntry(
    floorName: string,
    type: 'window' | 'door' | 'vent',
    position: AirEntryPosition,
    dimensions: AirEntryDimensions,
    line: AirEntryLine,
    properties: AirEntrySimulationProperties = {}
  ): ControlledAirEntry {
    const id = this.generateImmutableId(floorName, type);
    const now = Date.now();

    const entry: ControlledAirEntry = {
      id,
      floorName,
      createdAt: now,
      type,
      position: { ...position },
      dimensions: { ...dimensions },
      line: { ...line },
      properties: { ...properties },
      lastModified: now,
      get legacyData() {
        return {
          id: this.id,
          type: this.type,
          position: { x: this.position.x, y: this.position.y, z: this.position.z },
          dimensions: {
            width: this.dimensions.width,
            height: this.dimensions.height,
            distanceToFloor: this.dimensions.distanceToFloor,
            shape: this.dimensions.shape
          },
          line: {
            start: { x: this.line.start.x, y: this.line.start.y },
            end: { x: this.line.end.x, y: this.line.end.y }
          },
          properties: { ...this.properties },
          wallPosition: this.wallPosition
        };
      }
    };

    // Store entry
    this.entries.set(id, entry);
    
    // Update floor index
    if (!this.floorEntries.has(floorName)) {
      this.floorEntries.set(floorName, new Set());
    }
    this.floorEntries.get(floorName)!.add(id);

    // Notify observers
    this.notifyObservers({
      type: 'create',
      floorName,
      entryId: id,
      entry: { ...entry }
    });

    return this.copyEntryWithLegacyData(entry);
  }

  /**
   * Updates an existing AirEntry with validation
   */
  updateEntry(entryId: string, updates: AirEntryUpdate): ControlledAirEntry | null {
    const entry = this.entries.get(entryId);
    if (!entry) {
      console.error(`AirEntryController: Entry ${entryId} not found`);
      return null;
    }

    const oldEntry = { ...entry };
    const now = Date.now();

    // Apply updates with deep cloning to prevent shared references
    const updatedEntry: ControlledAirEntry = {
      ...entry,
      position: updates.position ? { ...entry.position, ...updates.position } : { ...entry.position },
      dimensions: updates.dimensions ? { ...entry.dimensions, ...updates.dimensions } : { ...entry.dimensions },
      properties: updates.properties ? { ...entry.properties, ...updates.properties } : { ...entry.properties },
      wallPosition: updates.wallPosition !== undefined ? updates.wallPosition : entry.wallPosition,
      lastModified: now,
      get legacyData() {
        return {
          id: this.id,
          type: this.type,
          position: { x: this.position.x, y: this.position.y, z: this.position.z },
          dimensions: {
            width: this.dimensions.width,
            height: this.dimensions.height,
            distanceToFloor: this.dimensions.distanceToFloor,
            shape: this.dimensions.shape
          },
          line: {
            start: { x: this.line.start.x, y: this.line.start.y },
            end: { x: this.line.end.x, y: this.line.end.y }
          },
          properties: { ...this.properties },
          wallPosition: this.wallPosition
        };
      }
    };

    // Validate update
    if (!this.validateEntry(updatedEntry)) {
      console.error('AirEntryController: Update validation failed');
      return null;
    }

    // Store updated entry
    this.entries.set(entryId, updatedEntry);

    // Notify observers
    this.notifyObservers({
      type: 'update',
      floorName: entry.floorName,
      entryId,
      entry: { ...updatedEntry },
      oldEntry
    });

    return this.copyEntryWithLegacyData(updatedEntry);
  }

  /**
   * Deletes an AirEntry
   */
  deleteEntry(entryId: string): boolean {
    const entry = this.entries.get(entryId);
    if (!entry) {
      return false;
    }

    // Remove from storage
    this.entries.delete(entryId);
    
    // Update floor index
    const floorSet = this.floorEntries.get(entry.floorName);
    if (floorSet) {
      floorSet.delete(entryId);
      if (floorSet.size === 0) {
        this.floorEntries.delete(entry.floorName);
      }
    }

    // Notify observers
    this.notifyObservers({
      type: 'delete',
      floorName: entry.floorName,
      entryId,
      oldEntry: entry
    });

    return true;
  }

  // ==================== QUERY OPERATIONS ====================

  /**
   * Helper method to create a proper copy with legacyData getter
   */
  private copyEntryWithLegacyData(entry: ControlledAirEntry): ControlledAirEntry {
    return {
      ...entry,
      get legacyData() {
        return {
          id: this.id,
          type: this.type,
          position: { x: this.position.x, y: this.position.y, z: this.position.z },
          dimensions: {
            width: this.dimensions.width,
            height: this.dimensions.height,
            distanceToFloor: this.dimensions.distanceToFloor,
            shape: this.dimensions.shape
          },
          line: {
            start: { x: this.line.start.x, y: this.line.start.y },
            end: { x: this.line.end.x, y: this.line.end.y }
          },
          properties: { ...this.properties },
          wallPosition: this.wallPosition
        };
      }
    };
  }

  /**
   * Gets a specific AirEntry by ID
   */
  getEntry(entryId: string): ControlledAirEntry | null {
    const entry = this.entries.get(entryId);
    return entry ? this.copyEntryWithLegacyData(entry) : null;
  }

  /**
   * Gets all AirEntries for a specific floor
   */
  getEntriesForFloor(floorName: string): ControlledAirEntry[] {
    const entryIds = this.floorEntries.get(floorName);
    if (!entryIds) {
      return [];
    }

    return Array.from(entryIds)
      .map(id => this.entries.get(id))
      .filter(entry => entry !== undefined)
      .map(entry => this.copyEntryWithLegacyData(entry!));
  }

  /**
   * Gets all AirEntries across all floors
   */
  getAllEntries(): ControlledAirEntry[] {
    return Array.from(this.entries.values()).map(entry => this.copyEntryWithLegacyData(entry));
  }

  /**
   * Gets all floor names that have AirEntries
   */
  getFloorsWithEntries(): string[] {
    return Array.from(this.floorEntries.keys());
  }

  // ==================== ID MANAGEMENT ====================

  /**
   * Generates an immutable, globally unique ID
   */
  private generateImmutableId(floorName: string, type: 'window' | 'door' | 'vent'): string {
    const floorPrefix = this.getFloorPrefix(floorName);
    const counterKey = `${floorName}_${type}`;
    
    // Get current counter for this floor+type combination
    const currentCounter = this.idCounters.get(counterKey) || 0;
    const newCounter = currentCounter + 1;
    
    // Update counter
    this.idCounters.set(counterKey, newCounter);
    
    // Generate deterministic but unique ID
    const timestamp = Date.now();
    const uuid = uuidv4().slice(0, 8); // Short UUID for readability
    
    return `${type}_${floorPrefix}_${newCounter}_${uuid}`;
  }

  private getFloorPrefix(floorName: string): string {
    const prefixMap: { [key: string]: string } = {
      'ground': '0F',
      'first': '1F',
      'second': '2F',
      'third': '3F',
      'fourth': '4F',
      'fifth': '5F'
    };
    return prefixMap[floorName] || '0F';
  }

  // ==================== OBSERVER PATTERN ====================

  /**
   * Subscribes to AirEntry changes
   */
  subscribe(observer: AirEntryObserver): () => void {
    this.observers.add(observer);
    
    return () => {
      this.observers.delete(observer);
    };
  }

  /**
   * Notifies all observers of changes
   */
  private notifyObservers(event: AirEntryChangeEvent): void {
    this.observers.forEach(observer => {
      try {
        observer(event);
      } catch (error) {
        console.error('AirEntryController: Observer error:', error);
      }
    });
  }

  // ==================== VALIDATION ====================

  /**
   * Validates an AirEntry
   */
  private validateEntry(entry: ControlledAirEntry): boolean {
    // ID validation
    if (!entry.id || typeof entry.id !== 'string') {
      return false;
    }

    // Floor name validation
    if (!entry.floorName || typeof entry.floorName !== 'string') {
      return false;
    }

    // Type validation
    if (!['window', 'door', 'vent'].includes(entry.type)) {
      return false;
    }

    // Position validation
    if (!entry.position || typeof entry.position.x !== 'number' || typeof entry.position.y !== 'number') {
      return false;
    }

    // Dimensions validation
    if (!entry.dimensions || typeof entry.dimensions.width !== 'number' || typeof entry.dimensions.height !== 'number') {
      return false;
    }

    return true;
  }

  /**
   * Validates controller state
   */
  private validateState(): void {
    // Ensure data structure integrity
    if (!(this.entries instanceof Map)) {
      throw new Error('AirEntryController: Invalid entries structure');
    }
    
    if (!(this.floorEntries instanceof Map)) {
      throw new Error('AirEntryController: Invalid floorEntries structure');
    }
    
    if (!(this.observers instanceof Set)) {
      throw new Error('AirEntryController: Invalid observers structure');
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Clears all entries (for testing or reset)
   */
  clear(): void {
    this.entries.clear();
    this.floorEntries.clear();
    this.idCounters.clear();
    
    // Notify observers of mass deletion
    this.observers.forEach(observer => {
      try {
        observer({
          type: 'delete',
          floorName: 'all',
          entryId: 'all'
        });
      } catch (error) {
        console.error('AirEntryController: Observer error during clear:', error);
      }
    });
  }

  /**
   * Gets controller statistics
   */
  getStats(): {
    totalEntries: number;
    entriesPerFloor: { [floorName: string]: number };
    entriesPerType: { [type: string]: number };
  } {
    const stats = {
      totalEntries: this.entries.size,
      entriesPerFloor: {} as { [floorName: string]: number },
      entriesPerType: {} as { [type: string]: number }
    };

    // Calculate entries per floor
    this.floorEntries.forEach((entryIds, floorName) => {
      stats.entriesPerFloor[floorName] = entryIds.size;
    });

    // Calculate entries per type
    this.entries.forEach(entry => {
      stats.entriesPerType[entry.type] = (stats.entriesPerType[entry.type] || 0) + 1;
    });

    return stats;
  }
}

// Singleton instance
export const airEntryController = new AirEntryController();