/**
 * useAirEntryController - React hook for AirEntry management
 * 
 * This hook provides:
 * - Reactive access to AirEntry data
 * - CRUD operations with proper state management
 * - Real-time synchronization across views
 * - Edit session management
 * - Conflict resolution
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ControlledAirEntry, 
  AirEntryUpdate,
  airEntryController 
} from '../lib/controllers/AirEntryController';
import { 
  ViewUpdateEvent,
  ViewSyncState,
  viewSynchronizer 
} from '../lib/controllers/ViewSynchronizer';
import { storeAdapter } from '../lib/controllers/StoreAdapter';

export interface UseAirEntryControllerOptions {
  viewName: string; // Unique name for this view (e.g., 'canvas2d', 'canvas3d', 'rsp')
  floorName?: string; // Optional floor filter
  autoInitialize?: boolean; // Whether to auto-initialize the adapter
}

export interface AirEntryControllerState {
  entries: ControlledAirEntry[];
  isLoading: boolean;
  error: string | null;
  syncState: ViewSyncState;
  stats: {
    totalEntries: number;
    entriesForFloor: number;
  };
}

export interface AirEntryControllerActions {
  // CRUD operations
  createEntry: (
    floorName: string,
    type: 'window' | 'door' | 'vent',
    position: { x: number; y: number; z?: number },
    dimensions: { width: number; height: number; distanceToFloor?: number; shape?: 'rectangular' | 'circular' },
    line: { start: { x: number; y: number }; end: { x: number; y: number } },
    properties?: any
  ) => Promise<ControlledAirEntry | null>;
  
  updateEntry: (entryId: string, updates: AirEntryUpdate) => Promise<ControlledAirEntry | null>;
  deleteEntry: (entryId: string) => Promise<boolean>;
  getEntry: (entryId: string) => ControlledAirEntry | null;
  
  // Edit session management
  startEdit: (entryId: string) => Promise<boolean>;
  endEdit: () => void;
  canEdit: (entryId: string) => boolean;
  
  // Real-time updates
  propagateUpdate: (
    entryId: string,
    updateType: 'position' | 'dimensions' | 'properties' | 'complete',
    data: AirEntryUpdate,
    immediate?: boolean
  ) => void;
  
  // Utility
  refresh: () => Promise<void>;
  forceResync: () => Promise<void>;
}

/**
 * Main hook for AirEntry controller integration
 */
export function useAirEntryController(options: UseAirEntryControllerOptions): {
  state: AirEntryControllerState;
  actions: AirEntryControllerActions;
} {
  const { viewName, floorName, autoInitialize = true } = options;

  // State
  const [entries, setEntries] = useState<ControlledAirEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<ViewSyncState>({
    activeEditor: null,
    editingEntryId: null,
    isolationActive: false,
    lastUpdate: 0
  });

  // Initialize adapter
  useEffect(() => {
    if (autoInitialize) {
      initializeAdapter();
    }
  }, [autoInitialize]);

  const initializeAdapter = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await storeAdapter.initialize();
      
      // Initial data load
      loadEntries();
      
      console.log(`AirEntryController: ${viewName} initialized successfully`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error(`AirEntryController: ${viewName} initialization failed:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [viewName]);

  // Load entries based on floor filter
  const loadEntries = useCallback(() => {
    try {
      const allEntries = floorName 
        ? airEntryController.getEntriesForFloor(floorName)
        : airEntryController.getAllEntries();
      
      setEntries(allEntries);
    } catch (err) {
      console.error('Failed to load entries:', err);
      setError('Failed to load entries');
    }
  }, [floorName]);

  // Setup view synchronization
  useEffect(() => {
    // Register with view synchronizer
    const unregisterView = viewSynchronizer.registerView(viewName, (event: ViewUpdateEvent) => {
      // Handle view updates from other views
      if (!floorName || event.floorName === floorName) {
        loadEntries(); // Reload entries when updates come from other views
      }
    });

    // Subscribe to sync state changes
    const unsubscribeState = viewSynchronizer.subscribeToState((state: ViewSyncState) => {
      setSyncState(state);
    });

    // Subscribe to controller changes
    const unsubscribeController = airEntryController.subscribe((event) => {
      if (!floorName || event.floorName === floorName) {
        loadEntries();
      }
    });

    return () => {
      unregisterView();
      unsubscribeState();
      unsubscribeController();
    };
  }, [viewName, floorName, loadEntries]);

  // Actions
  const actions: AirEntryControllerActions = useMemo(() => ({
    createEntry: async (floorName, type, position, dimensions, line, properties = {}) => {
      try {
        setError(null);
        
        const entry = airEntryController.createEntry(
          floorName,
          type,
          { x: position.x, y: position.y, z: position.z || 0 },
          dimensions,
          line,
          properties
        );
        
        return entry;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create entry';
        setError(errorMessage);
        console.error('Failed to create entry:', err);
        return null;
      }
    },

    updateEntry: async (entryId, updates) => {
      try {
        setError(null);
        
        const entry = airEntryController.updateEntry(entryId, updates);
        return entry;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update entry';
        setError(errorMessage);
        console.error('Failed to update entry:', err);
        return null;
      }
    },

    deleteEntry: async (entryId) => {
      try {
        setError(null);
        
        const success = airEntryController.deleteEntry(entryId);
        return success;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete entry';
        setError(errorMessage);
        console.error('Failed to delete entry:', err);
        return false;
      }
    },

    getEntry: (entryId) => {
      return airEntryController.getEntry(entryId);
    },

    startEdit: async (entryId) => {
      return viewSynchronizer.startEditSession(viewName, entryId);
    },

    endEdit: () => {
      viewSynchronizer.endEditSession(viewName);
    },

    canEdit: (entryId) => {
      return viewSynchronizer.canEdit(viewName, entryId);
    },

    propagateUpdate: (entryId, updateType, data, immediate = false) => {
      viewSynchronizer.propagateUpdate(viewName, entryId, updateType, data, immediate);
    },

    refresh: async () => {
      loadEntries();
    },

    forceResync: async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        await storeAdapter.forceResync();
        loadEntries();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to resync';
        setError(errorMessage);
        console.error('Failed to force resync:', err);
      } finally {
        setIsLoading(false);
      }
    }
  }), [viewName, loadEntries]);

  // Compute stats
  const stats = useMemo(() => {
    const controllerStats = airEntryController.getStats();
    const entriesForFloor = floorName ? entries.length : controllerStats.totalEntries;
    
    return {
      totalEntries: controllerStats.totalEntries,
      entriesForFloor
    };
  }, [entries, floorName]);

  const state: AirEntryControllerState = {
    entries,
    isLoading,
    error,
    syncState,
    stats
  };

  return { state, actions };
}

/**
 * Hook for simplified AirEntry access (read-only)
 */
export function useAirEntries(floorName?: string): {
  entries: ControlledAirEntry[];
  isLoading: boolean;
  error: string | null;
} {
  const { state } = useAirEntryController({
    viewName: 'readonly',
    floorName,
    autoInitialize: true
  });

  return {
    entries: state.entries,
    isLoading: state.isLoading,
    error: state.error
  };
}

/**
 * Hook for AirEntry editing with automatic session management
 */
export function useAirEntryEditor(viewName: string): {
  editingEntry: ControlledAirEntry | null;
  canEdit: (entryId: string) => boolean;
  startEdit: (entry: ControlledAirEntry) => Promise<boolean>;
  endEdit: () => void;
  updateEntry: (updates: AirEntryUpdate) => Promise<ControlledAirEntry | null>;
  isEditing: boolean;
} {
  const [editingEntry, setEditingEntry] = useState<ControlledAirEntry | null>(null);
  
  const { state, actions } = useAirEntryController({
    viewName,
    autoInitialize: true
  });

  const startEdit = useCallback(async (entry: ControlledAirEntry) => {
    const success = await actions.startEdit(entry.id);
    if (success) {
      setEditingEntry(entry);
    }
    return success;
  }, [actions]);

  const endEdit = useCallback(() => {
    actions.endEdit();
    setEditingEntry(null);
  }, [actions]);

  const updateEntry = useCallback(async (updates: AirEntryUpdate) => {
    if (!editingEntry) {
      return null;
    }
    
    const updatedEntry = await actions.updateEntry(editingEntry.id, updates);
    if (updatedEntry) {
      setEditingEntry(updatedEntry);
    }
    return updatedEntry;
  }, [editingEntry, actions]);

  // Clear editing state if session ends externally
  useEffect(() => {
    if (state.syncState.activeEditor !== viewName) {
      setEditingEntry(null);
    }
  }, [state.syncState.activeEditor, viewName]);

  return {
    editingEntry,
    canEdit: actions.canEdit,
    startEdit,
    endEdit,
    updateEntry,
    isEditing: !!editingEntry && state.syncState.activeEditor === viewName
  };
}