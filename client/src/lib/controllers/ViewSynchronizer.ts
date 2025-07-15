/**
 * ViewSynchronizer - Coordinates AirEntry updates between Canvas2D, Canvas3D and RoomSketchPro
 * 
 * This synchronizer ensures:
 * - Real-time bidirectional synchronization between all views
 * - Conflict resolution when multiple views modify the same entry
 * - Proper isolation during editing to prevent cross-floor contamination
 * - Efficient updates without unnecessary re-renders
 */

import { 
  AirEntryController, 
  ControlledAirEntry, 
  AirEntryChangeEvent, 
  AirEntryUpdate,
  airEntryController 
} from './AirEntryController';

export interface ViewUpdateEvent {
  source: 'canvas2d' | 'canvas3d' | 'rsp' | 'dialog';
  entryId: string;
  floorName: string;
  updateType: 'position' | 'dimensions' | 'properties' | 'complete';
  data: AirEntryUpdate;
  timestamp: number;
}

export interface ViewSyncState {
  activeEditor: string | null; // Which view is currently editing
  editingEntryId: string | null; // Which entry is being edited
  isolationActive: boolean; // Whether isolation mode is active
  lastUpdate: number; // Timestamp of last update
}

export type ViewUpdateListener = (event: ViewUpdateEvent) => void;
export type StateChangeListener = (state: ViewSyncState) => void;

/**
 * Manages synchronization between different views of AirEntry data
 */
export class ViewSynchronizer {
  private controller: AirEntryController;
  private viewListeners = new Map<string, Set<ViewUpdateListener>>();
  private stateListeners = new Set<StateChangeListener>();
  
  private syncState: ViewSyncState = {
    activeEditor: null,
    editingEntryId: null,
    isolationActive: false,
    lastUpdate: 0
  };

  // Conflict resolution
  private pendingUpdates = new Map<string, ViewUpdateEvent[]>();
  private updateTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(controller: AirEntryController) {
    this.controller = controller;
    this.setupControllerSubscription();
  }

  // ==================== VIEW REGISTRATION ====================

  /**
   * Registers a view to receive synchronized updates
   */
  registerView(viewName: string, listener: ViewUpdateListener): () => void {
    if (!this.viewListeners.has(viewName)) {
      this.viewListeners.set(viewName, new Set());
    }
    
    this.viewListeners.get(viewName)!.add(listener);
    
    return () => {
      const listeners = this.viewListeners.get(viewName);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.viewListeners.delete(viewName);
        }
      }
    };
  }

  /**
   * Subscribes to synchronization state changes
   */
  subscribeToState(listener: StateChangeListener): () => void {
    this.stateListeners.add(listener);
    
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  // ==================== EDIT SESSION MANAGEMENT ====================

  /**
   * Starts an editing session for a specific entry
   */
  startEditSession(viewName: string, entryId: string): boolean {
    // Check if another view is already editing
    if (this.syncState.activeEditor && this.syncState.activeEditor !== viewName) {
      console.warn(`ViewSynchronizer: ${viewName} attempted to edit while ${this.syncState.activeEditor} is active`);
      return false;
    }

    // Update state
    this.syncState = {
      ...this.syncState,
      activeEditor: viewName,
      editingEntryId: entryId,
      isolationActive: true,
      lastUpdate: Date.now()
    };

    this.notifyStateListeners();
    return true;
  }

  /**
   * Ends the current editing session
   */
  endEditSession(viewName: string): void {
    if (this.syncState.activeEditor !== viewName) {
      console.warn(`ViewSynchronizer: ${viewName} attempted to end session but is not active editor`);
      return;
    }

    // Process any pending updates before ending session
    this.processPendingUpdates();

    // Clear state
    this.syncState = {
      activeEditor: null,
      editingEntryId: null,
      isolationActive: false,
      lastUpdate: Date.now()
    };

    this.notifyStateListeners();
  }

  /**
   * Checks if a view can edit a specific entry
   */
  canEdit(viewName: string, entryId: string): boolean {
    if (!this.syncState.activeEditor) {
      return true; // No active session
    }
    
    return this.syncState.activeEditor === viewName && this.syncState.editingEntryId === entryId;
  }

  // ==================== UPDATE PROPAGATION ====================

  /**
   * Propagates an update from one view to others
   */
  propagateUpdate(
    sourceView: string,
    entryId: string,
    updateType: 'position' | 'dimensions' | 'properties' | 'complete',
    data: AirEntryUpdate,
    immediate: boolean = false
  ): void {
    const entry = this.controller.getEntry(entryId);
    if (!entry) {
      console.error(`ViewSynchronizer: Entry ${entryId} not found`);
      return;
    }

    const updateEvent: ViewUpdateEvent = {
      source: sourceView as any,
      entryId,
      floorName: entry.floorName,
      updateType,
      data,
      timestamp: Date.now()
    };

    if (immediate || !this.syncState.isolationActive) {
      // Apply update immediately
      this.applyUpdate(updateEvent);
    } else {
      // Queue update for conflict resolution
      this.queueUpdate(updateEvent);
    }
  }

  /**
   * Applies an update immediately
   */
  private applyUpdate(event: ViewUpdateEvent): void {
    // Update controller
    const success = this.controller.updateEntry(event.entryId, event.data);
    if (!success) {
      console.error('ViewSynchronizer: Failed to apply update to controller');
      return;
    }

    // Propagate to all views except source
    this.viewListeners.forEach((listeners, viewName) => {
      if (viewName !== event.source) {
        listeners.forEach(listener => {
          try {
            listener(event);
          } catch (error) {
            console.error(`ViewSynchronizer: Error updating view ${viewName}:`, error);
          }
        });
      }
    });

    // Update sync state
    this.syncState.lastUpdate = event.timestamp;
  }

  /**
   * Queues an update for later processing
   */
  private queueUpdate(event: ViewUpdateEvent): void {
    const entryId = event.entryId;
    
    if (!this.pendingUpdates.has(entryId)) {
      this.pendingUpdates.set(entryId, []);
    }
    
    this.pendingUpdates.get(entryId)!.push(event);

    // Clear existing timeout and set new one
    const existingTimeout = this.updateTimeouts.get(entryId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Process updates after short delay to batch them
    const timeout = setTimeout(() => {
      this.processPendingUpdatesForEntry(entryId);
    }, 100);
    
    this.updateTimeouts.set(entryId, timeout);
  }

  /**
   * Processes pending updates for a specific entry
   */
  private processPendingUpdatesForEntry(entryId: string): void {
    const updates = this.pendingUpdates.get(entryId);
    if (!updates || updates.length === 0) {
      return;
    }

    // Sort by timestamp
    updates.sort((a, b) => a.timestamp - b.timestamp);

    // Merge updates by type to avoid conflicts
    const mergedUpdate: AirEntryUpdate = {};
    const latestEvent = updates[updates.length - 1];

    updates.forEach(update => {
      if (update.data.position) {
        mergedUpdate.position = { ...mergedUpdate.position, ...update.data.position };
      }
      if (update.data.dimensions) {
        mergedUpdate.dimensions = { ...mergedUpdate.dimensions, ...update.data.dimensions };
      }
      if (update.data.properties) {
        mergedUpdate.properties = { ...mergedUpdate.properties, ...update.data.properties };
      }
      if (update.data.wallPosition !== undefined) {
        mergedUpdate.wallPosition = update.data.wallPosition;
      }
    });

    // Apply merged update
    const finalEvent: ViewUpdateEvent = {
      ...latestEvent,
      updateType: 'complete',
      data: mergedUpdate
    };

    this.applyUpdate(finalEvent);

    // Clean up
    this.pendingUpdates.delete(entryId);
    this.updateTimeouts.delete(entryId);
  }

  /**
   * Processes all pending updates
   */
  private processPendingUpdates(): void {
    const entryIds = Array.from(this.pendingUpdates.keys());
    entryIds.forEach(entryId => {
      this.processPendingUpdatesForEntry(entryId);
    });
  }

  // ==================== CONTROLLER INTEGRATION ====================

  /**
   * Sets up subscription to controller changes
   */
  private setupControllerSubscription(): void {
    this.controller.subscribe((event: AirEntryChangeEvent) => {
      // Convert controller events to view events
      if (event.type === 'update' && event.entry) {
        const viewEvent: ViewUpdateEvent = {
          source: 'canvas3d', // Default source
          entryId: event.entryId,
          floorName: event.floorName,
          updateType: 'complete',
          data: {
            position: event.entry.position,
            dimensions: event.entry.dimensions,
            properties: event.entry.properties,
            wallPosition: event.entry.wallPosition
          },
          timestamp: Date.now()
        };

        // Notify all views of controller changes
        this.viewListeners.forEach((listeners) => {
          listeners.forEach(listener => {
            try {
              listener(viewEvent);
            } catch (error) {
              console.error('ViewSynchronizer: Error in controller change listener:', error);
            }
          });
        });
      }
    });
  }

  // ==================== STATE NOTIFICATION ====================

  /**
   * Notifies all state listeners of changes
   */
  private notifyStateListeners(): void {
    this.stateListeners.forEach(listener => {
      try {
        listener({ ...this.syncState });
      } catch (error) {
        console.error('ViewSynchronizer: Error in state listener:', error);
      }
    });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Gets current synchronization state
   */
  getState(): ViewSyncState {
    return { ...this.syncState };
  }

  /**
   * Gets statistics about the synchronizer
   */
  getStats(): {
    registeredViews: string[];
    pendingUpdates: number;
    activeTimeouts: number;
    stateListeners: number;
  } {
    return {
      registeredViews: Array.from(this.viewListeners.keys()),
      pendingUpdates: Array.from(this.pendingUpdates.values()).reduce((total, updates) => total + updates.length, 0),
      activeTimeouts: this.updateTimeouts.size,
      stateListeners: this.stateListeners.size
    };
  }

  /**
   * Cleans up all resources
   */
  dispose(): void {
    // Clear all timeouts
    this.updateTimeouts.forEach(timeout => clearTimeout(timeout));
    this.updateTimeouts.clear();
    
    // Clear pending updates
    this.pendingUpdates.clear();
    
    // Clear listeners
    this.viewListeners.clear();
    this.stateListeners.clear();
    
    // Reset state
    this.syncState = {
      activeEditor: null,
      editingEntryId: null,
      isolationActive: false,
      lastUpdate: 0
    };
  }
}

// Singleton instance
export const viewSynchronizer = new ViewSynchronizer(airEntryController);