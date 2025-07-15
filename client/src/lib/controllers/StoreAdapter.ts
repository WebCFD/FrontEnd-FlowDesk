/**
 * StoreAdapter - Bridges AirEntryController with existing Zustand store
 * 
 * This adapter provides:
 * - Seamless migration from old store structure to new controller
 * - Backward compatibility with existing components
 * - Automatic synchronization between controller and store
 * - Migration utilities for existing data
 */

import { 
  AirEntryController, 
  ControlledAirEntry, 
  AirEntryChangeEvent,
  airEntryController 
} from './AirEntryController';
import { ViewSynchronizer, viewSynchronizer } from './ViewSynchronizer';
import { useRoomStore } from '../store/room-store';

// Legacy types from existing store
interface LegacyAirEntry {
  type: 'window' | 'door' | 'vent';
  position: { x: number; y: number; z?: number };
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
    shape?: 'rectangular' | 'circular';
  };
  properties?: any;
  line: { start: { x: number; y: number }; end: { x: number; y: number } };
  id?: string;
  wallPosition?: number;
}

interface LegacyFloor {
  airEntries?: LegacyAirEntry[];
  [key: string]: any;
}

interface LegacyFloors {
  [floorName: string]: LegacyFloor;
}

/**
 * Adapts between AirEntryController and legacy Zustand store
 */
export class StoreAdapter {
  private controller: AirEntryController;
  private synchronizer: ViewSynchronizer;
  private isInitialized = false;
  private isSyncing = false;

  constructor(controller: AirEntryController, synchronizer: ViewSynchronizer) {
    this.controller = controller;
    this.synchronizer = synchronizer;
  }

  // ==================== INITIALIZATION ====================

  /**
   * Initializes the adapter and migrates existing store data
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('StoreAdapter: Initializing...');

    try {
      // Migrate existing store data to controller
      await this.migrateStoreToController();
      
      // Setup bidirectional synchronization
      this.setupStoreToControllerSync();
      this.setupControllerToStoreSync();
      
      this.isInitialized = true;
      console.log('StoreAdapter: Initialization complete');
    } catch (error) {
      console.error('StoreAdapter: Initialization failed:', error);
      throw error;
    }
  }

  // ==================== MIGRATION ====================

  /**
   * Migrates existing Zustand store data to controller
   */
  private async migrateStoreToController(): Promise<void> {
    const store = useRoomStore.getState();
    const floors = store.floors || {};

    console.log('StoreAdapter: Migrating store data to controller...');
    let migratedCount = 0;

    Object.entries(floors).forEach(([floorName, floorData]) => {
      const legacyFloor = floorData as LegacyFloor;
      const airEntries = legacyFloor.airEntries || [];

      airEntries.forEach(legacyEntry => {
        try {
          // Convert legacy entry to controller format
          const controlledEntry = this.legacyToController(legacyEntry, floorName);
          
          // Add to controller (this will generate new ID if needed)
          this.controller.createEntry(
            floorName,
            controlledEntry.type,
            controlledEntry.position,
            controlledEntry.dimensions,
            controlledEntry.line,
            controlledEntry.properties
          );
          
          migratedCount++;
        } catch (error) {
          console.error(`StoreAdapter: Failed to migrate entry in floor ${floorName}:`, error);
        }
      });
    });

    console.log(`StoreAdapter: Migrated ${migratedCount} AirEntries to controller`);
  }

  /**
   * Converts legacy AirEntry to controlled format
   */
  private legacyToController(legacy: LegacyAirEntry, floorName: string): Omit<ControlledAirEntry, 'id' | 'floorName' | 'createdAt' | 'lastModified'> {
    return {
      type: legacy.type,
      position: {
        x: legacy.position.x,
        y: legacy.position.y,
        z: legacy.position.z || 0
      },
      dimensions: {
        width: legacy.dimensions.width,
        height: legacy.dimensions.height,
        distanceToFloor: legacy.dimensions.distanceToFloor,
        shape: legacy.dimensions.shape || 'rectangular'
      },
      line: {
        start: { x: legacy.line.start.x, y: legacy.line.start.y },
        end: { x: legacy.line.end.x, y: legacy.line.end.y }
      },
      properties: legacy.properties || {},
      wallPosition: legacy.wallPosition
    };
  }

  /**
   * Converts controlled AirEntry to legacy format
   */
  private controllerToLegacy(controlled: ControlledAirEntry): LegacyAirEntry {
    return {
      id: controlled.id,
      type: controlled.type,
      position: {
        x: controlled.position.x,
        y: controlled.position.y,
        z: controlled.position.z
      },
      dimensions: {
        width: controlled.dimensions.width,
        height: controlled.dimensions.height,
        distanceToFloor: controlled.dimensions.distanceToFloor,
        shape: controlled.dimensions.shape
      },
      line: {
        start: { x: controlled.line.start.x, y: controlled.line.start.y },
        end: { x: controlled.line.end.x, y: controlled.line.end.y }
      },
      properties: controlled.properties,
      wallPosition: controlled.wallPosition
    };
  }

  // ==================== SYNCHRONIZATION ====================

  /**
   * Sets up store -> controller synchronization
   */
  private setupStoreToControllerSync(): void {
    // Subscribe to store changes
    useRoomStore.subscribe((state, prevState) => {
      if (this.isSyncing) return; // Prevent sync loops

      const currentFloors = state.floors || {};
      const previousFloors = prevState.floors || {};

      // Check for changes in AirEntries
      Object.keys({ ...currentFloors, ...previousFloors }).forEach(floorName => {
        const currentEntries = currentFloors[floorName]?.airEntries || [];
        const previousEntries = previousFloors[floorName]?.airEntries || [];

        if (this.hasAirEntriesChanged(currentEntries, previousEntries)) {
          this.syncFloorFromStore(floorName, currentEntries);
        }
      });
    });
  }

  /**
   * Sets up controller -> store synchronization
   */
  private setupControllerToStoreSync(): void {
    this.controller.subscribe((event: AirEntryChangeEvent) => {
      if (this.isSyncing) return; // Prevent sync loops

      this.isSyncing = true;
      try {
        this.syncEventToStore(event);
      } finally {
        this.isSyncing = false;
      }
    });
  }

  /**
   * Syncs a controller event to the store
   */
  private syncEventToStore(event: AirEntryChangeEvent): void {
    console.log(`StoreAdapter syncEventToStore: Received event type ${event.type} for floor ${event.floorName}`);
    
    const store = useRoomStore.getState();

    switch (event.type) {
      case 'create':
      case 'update':
        if (event.entry) {
          console.log(`StoreAdapter syncEventToStore: Processing ${event.type} for entry ${event.entry.id}`);
          this.updateStoreEntry(event.floorName, event.entry);
        }
        break;
        
      case 'delete':
        console.log(`StoreAdapter syncEventToStore: Processing delete for entry ${event.entryId}`);
        this.deleteStoreEntry(event.floorName, event.entryId);
        break;
    }
  }

  /**
   * Updates a specific entry in the store
   */
  private updateStoreEntry(floorName: string, entry: ControlledAirEntry): void {
    console.log(`StoreAdapter updateStoreEntry(${floorName}): Updating entry ${entry.id}`);
    
    const legacyEntry = this.controllerToLegacy(entry);
    const store = useRoomStore.getState();
    const floors = { ...store.floors };

    console.log(`StoreAdapter updateStoreEntry(${floorName}): Current store floors:`, Object.keys(floors));
    console.log(`StoreAdapter updateStoreEntry(${floorName}): Current airEntries for floor:`, floors[floorName]?.airEntries?.length || 0);

    if (!floors[floorName]) {
      floors[floorName] = { airEntries: [] };
    }

    const airEntries = [...(floors[floorName].airEntries || [])];
    const existingIndex = airEntries.findIndex(e => e.id === entry.id);

    if (existingIndex >= 0) {
      // Update existing entry
      console.log(`StoreAdapter updateStoreEntry(${floorName}): Updating existing entry at index ${existingIndex}`);
      airEntries[existingIndex] = legacyEntry;
    } else {
      // Add new entry
      console.log(`StoreAdapter updateStoreEntry(${floorName}): Adding new entry`);
      airEntries.push(legacyEntry);
    }

    floors[floorName] = {
      ...floors[floorName],
      airEntries
    };

    console.log(`StoreAdapter updateStoreEntry(${floorName}): About to update store with ${airEntries.length} entries`);
    
    // Update store
    store.setFloors(floors);
    
    console.log(`StoreAdapter updateStoreEntry(${floorName}): Store updated successfully`);
  }

  /**
   * Deletes an entry from the store
   */
  private deleteStoreEntry(floorName: string, entryId: string): void {
    const store = useRoomStore.getState();
    const floors = { ...store.floors };

    if (floors[floorName]?.airEntries) {
      const airEntries = floors[floorName].airEntries.filter(e => e.id !== entryId);
      
      floors[floorName] = {
        ...floors[floorName],
        airEntries
      };

      store.setFloors(floors);
    }
  }

  /**
   * Syncs a floor's AirEntries from store to controller
   */
  private syncFloorFromStore(floorName: string, storeEntries: LegacyAirEntry[]): void {
    const controllerEntries = this.controller.getEntriesForFloor(floorName);
    
    console.log(`StoreAdapter syncFloorFromStore(${floorName}): Store has ${storeEntries.length} entries`);
    console.log(`StoreAdapter syncFloorFromStore(${floorName}): Controller has ${controllerEntries.length} entries`);
    
    // Find entries to add, update, or remove
    const storeIds = new Set(storeEntries.map(e => e.id).filter(Boolean));
    const controllerIds = new Set(controllerEntries.map(e => e.id));

    console.log(`StoreAdapter syncFloorFromStore(${floorName}): Store IDs:`, Array.from(storeIds));
    console.log(`StoreAdapter syncFloorFromStore(${floorName}): Controller IDs:`, Array.from(controllerIds));

    // Remove entries that exist in controller but not in store
    controllerIds.forEach(id => {
      if (!storeIds.has(id)) {
        console.log(`StoreAdapter syncFloorFromStore(${floorName}): ⚠️ DELETING entry ${id} from controller (not found in store)`);
        this.controller.deleteEntry(id);
      }
    });

    // Add or update entries from store
    storeEntries.forEach(storeEntry => {
      if (storeEntry.id) {
        const existing = controllerEntries.find(e => e.id === storeEntry.id);
        if (existing) {
          // Update existing entry
          const updates = this.calculateUpdates(existing, storeEntry);
          if (Object.keys(updates).length > 0) {
            this.controller.updateEntry(storeEntry.id, updates);
          }
        } else {
          // Add new entry (though this shouldn't happen with proper ID management)
          const controlled = this.legacyToController(storeEntry, floorName);
          this.controller.createEntry(
            floorName,
            controlled.type,
            controlled.position,
            controlled.dimensions,
            controlled.line,
            controlled.properties
          );
        }
      }
    });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Checks if AirEntries have changed between two arrays
   */
  private hasAirEntriesChanged(current: LegacyAirEntry[], previous: LegacyAirEntry[]): boolean {
    if (current.length !== previous.length) {
      return true;
    }

    // Compare entries by ID and properties
    for (let i = 0; i < current.length; i++) {
      const curr = current[i];
      const prev = previous[i];
      
      if (curr.id !== prev.id ||
          JSON.stringify(curr.position) !== JSON.stringify(prev.position) ||
          JSON.stringify(curr.dimensions) !== JSON.stringify(prev.dimensions) ||
          JSON.stringify(curr.properties) !== JSON.stringify(prev.properties)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculates what needs to be updated between entries
   */
  private calculateUpdates(controlled: ControlledAirEntry, legacy: LegacyAirEntry): any {
    const updates: any = {};

    // Check position changes
    if (controlled.position.x !== legacy.position.x ||
        controlled.position.y !== legacy.position.y ||
        controlled.position.z !== legacy.position.z) {
      updates.position = {
        x: legacy.position.x,
        y: legacy.position.y,
        z: legacy.position.z
      };
    }

    // Check dimension changes
    if (controlled.dimensions.width !== legacy.dimensions.width ||
        controlled.dimensions.height !== legacy.dimensions.height ||
        controlled.dimensions.distanceToFloor !== legacy.dimensions.distanceToFloor) {
      updates.dimensions = {
        width: legacy.dimensions.width,
        height: legacy.dimensions.height,
        distanceToFloor: legacy.dimensions.distanceToFloor
      };
    }

    // Check property changes
    if (JSON.stringify(controlled.properties) !== JSON.stringify(legacy.properties)) {
      updates.properties = legacy.properties;
    }

    // Check wall position changes
    if (controlled.wallPosition !== legacy.wallPosition) {
      updates.wallPosition = legacy.wallPosition;
    }

    return updates;
  }

  /**
   * Gets adapter statistics
   */
  getStats(): {
    isInitialized: boolean;
    isSyncing: boolean;
    controllerEntries: number;
    storeEntries: number;
  } {
    const controllerStats = this.controller.getStats();
    const store = useRoomStore.getState();
    const floors = store.floors || {};
    
    const storeEntries = Object.values(floors).reduce((total, floor: any) => {
      return total + (floor.airEntries?.length || 0);
    }, 0);

    return {
      isInitialized: this.isInitialized,
      isSyncing: this.isSyncing,
      controllerEntries: controllerStats.totalEntries,
      storeEntries
    };
  }

  /**
   * Forces a complete resync between store and controller
   */
  async forceResync(): Promise<void> {
    console.log('StoreAdapter: Forcing complete resync...');
    console.log('StoreAdapter: ⚠️  WARNING - This will clear all controller entries!');
    
    // Clear controller
    this.controller.clear();
    
    // Re-migrate from store
    await this.migrateStoreToController();
    
    console.log('StoreAdapter: Force resync complete');
  }
}

// Singleton instance
export const storeAdapter = new StoreAdapter(airEntryController, viewSynchronizer);