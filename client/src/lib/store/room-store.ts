import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { syncWallsWithLines } from '../simulationDataConverter';
import type { FurnitureItem } from '@shared/furniture-types';

interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

// Propiedades base compartidas
interface BaseSimulationProperties {
  state?: 'open' | 'closed';
  temperature?: number;
}

// Propiedades específicas para vents
interface VentSimulationProperties {
  flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
  flowValue?: number;
  flowIntensity?: 'low' | 'medium' | 'high';
  airOrientation?: 'inflow' | 'outflow';
  verticalAngle?: number;
  horizontalAngle?: number;
}

// Propiedades unificadas que incluyen todos los campos posibles
interface SimulationProperties extends BaseSimulationProperties, VentSimulationProperties {}

interface AirEntry {
  type: 'window' | 'door' | 'vent';
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
    shape?: 'rectangular' | 'circular';
  };
  properties?: SimulationProperties;
  line: Line;
  id?: string; // Optional for backward compatibility, required for new entries
}

interface Measurement {
  start: Point;
  end: Point;
  distance: number;
}

interface StairPolygon {
  id: string;
  points: Point[];
  floor: string; // The floor this stair belongs to
  direction?: 'up' | 'down'; // Direction of the stairs
  connectsTo?: string; // The floor this stair connects to
  isImported?: boolean; // Whether this stair was imported from another floor
}

interface Wall {
  id: string;
  uuid: string;
  floor: string;
  lineRef: string;
  startPoint: Point;
  endPoint: Point;
  properties: {
    temperature: number;
  };
}

interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  walls: Wall[];
  measurements: Measurement[];
  stairPolygons: StairPolygon[]; // Add stairs to floor data
  furnitureItems: FurnitureItem[]; // FASE 5A: Add furniture support
  hasClosedContour: boolean;
  name: string;
  templateSource?: string; // Name of the floor this was copied from
}

// AirEntry change notification system
type AirEntryChangeListener = (floorName: string, index: number, entry: AirEntry) => void;

interface RoomState {
  floors: Record<string, FloorData>;
  currentFloor: string;
  setFloors: (floors: Record<string, FloorData>) => void;
  setCurrentFloor: (floorName: string) => void;
  // Current floor operations
  setLines: (lines: Line[]) => void;
  setAirEntries: (entries: AirEntry[]) => void;
  setWalls: (walls: Wall[]) => void;
  setMeasurements: (measurements: Measurement[]) => void;
  setStairPolygons: (polygons: StairPolygon[]) => void;
  addStairPolygon: (polygon: StairPolygon) => void;
  removeStairPolygon: (id: string) => void;
  // FASE 5A: Furniture operations
  setFurnitureItems: (items: FurnitureItem[]) => void;
  addFurnitureToFloor: (floorName: string, item: FurnitureItem) => void;
  updateFurnitureInFloor: (floorName: string, itemId: string, item: FurnitureItem) => void;
  deleteFurnitureFromFloor: (floorName: string, itemId: string) => void;
  setHasClosedContour: (hasContour: boolean) => void;
  // Floor management
  addFloor: (name: string, template?: string) => void;
  removeFloor: (name: string) => void;
  copyFloorAs: (sourceName: string, targetName: string) => void;
  updateFloor: (floorName: string, floorData: FloorData) => void;
  syncWallsForCurrentFloor: () => void;
  updateAirEntryProperties: (floorName: string, index: number, properties: SimulationProperties) => void;
  // Reactive AirEntry synchronization system
  updateAirEntry: (floorName: string, index: number, entry: AirEntry) => void;
  subscribeToAirEntryChanges: (listener: AirEntryChangeListener) => () => void;
  // Silent update functions for real-time changes (no global notifications)
  updateAirEntryPropertiesSilent: (floorName: string, index: number, properties: SimulationProperties) => void;
  updateAirEntrySilent: (floorName: string, index: number, entry: AirEntry) => void;
  // Centralized ID management system
  generateAirEntryId: (floorName: string, type: 'window' | 'door' | 'vent') => string;
  addAirEntryToFloor: (floorName: string, entry: Omit<AirEntry, 'id'>) => string;
  
  // FASE 1: Data Migration & Validation
  migrateExistingData: () => { success: boolean; migratedCount: number; errors: string[] };
  validateAirEntryId: (id: string) => boolean;
  backupData: () => string;
  restoreFromBackup: (backupData: string) => boolean;
  
  // FASE 1: Enhanced CRUD Operations with validation
  updateAirEntryById: (id: string, updates: Partial<AirEntry>) => boolean;
  deleteAirEntryById: (id: string) => boolean;
  findAirEntryById: (id: string) => { entry: AirEntry; floorName: string; index: number } | null;
  
  // FASE 6: Enhanced Floor Copy with complete independence
  copyFloorWithNewIds: (sourceFloorName: string, targetFloorName: string) => { success: boolean; newIds: string[] };
  
  reset: () => void;
}

// Global listeners array for AirEntry change notifications
let airEntryChangeListeners: AirEntryChangeListener[] = [];

// GLOBAL SOLUTION: Deep clone function to prevent shared references
const deepCloneFloors = (floors: Record<string, FloorData>): Record<string, FloorData> => {
  const cloned: Record<string, FloorData> = {};
  
  Object.keys(floors).forEach(floorKey => {
    const floor = floors[floorKey];
    cloned[floorKey] = {
      ...floor,
      lines: floor.lines ? [...floor.lines] : [],
      walls: floor.walls ? floor.walls.map(wall => ({ ...wall })) : [],
      measurements: floor.measurements ? [...floor.measurements] : [],
      stairPolygons: floor.stairPolygons ? floor.stairPolygons.map(stair => ({ ...stair })) : [],
      furnitureItems: floor.furnitureItems ? floor.furnitureItems.map(item => ({ ...item })) : [],
      // CRITICAL: Deep clone all AirEntries to prevent shared references
      airEntries: floor.airEntries ? floor.airEntries.map(entry => ({
        ...entry,
        position: { ...entry.position },
        line: {
          ...entry.line,
          start: { ...entry.line.start },
          end: { ...entry.line.end }
        },
        properties: entry.properties ? { ...entry.properties } : undefined,
        simulationProperties: entry.simulationProperties ? { ...entry.simulationProperties } : undefined
      })) : []
    };
  });
  
  return cloned;
};

export const useRoomStore = create<RoomState>()(
  devtools(
    persist(
      (set, get) => ({
        floors: {
          ground: {
            lines: [],
            airEntries: [],
            walls: [],
            measurements: [],
            stairPolygons: [], // Add empty stair polygons array
            furnitureItems: [], // FASE 5A: Initialize empty furniture array
            hasClosedContour: false,
            name: 'Ground Floor'
          }
        },
        currentFloor: 'ground',

        setFloors: (floors) => set({ 
          floors: deepCloneFloors(floors) // CRITICAL: Always deep clone when setting floors
        }),
        setCurrentFloor: (floorName) => set({ currentFloor: floorName }),

        // Current floor operations
        setLines: (lines) => set((state) => {
          const currentFloorData = state.floors[state.currentFloor];
          const floorName = currentFloorData.name || state.currentFloor;
          
          // Synchronize walls with the new lines
          const synchronizedWalls = syncWallsWithLines(
            lines, 
            currentFloorData.walls || [], 
            floorName
          );
          
          return {
            floors: {
              ...state.floors,
              [state.currentFloor]: {
                ...currentFloorData,
                lines,
                walls: synchronizedWalls
              }
            }
          };
        }),

        setAirEntries: (airEntries) => {
          return set((state) => {
            return {
              floors: {
                ...state.floors,
                [state.currentFloor]: {
                  ...state.floors[state.currentFloor],
                  airEntries
                }
              }
            };
          });
        },

        setWalls: (walls) => set((state) => ({
          floors: {
            ...state.floors,
            [state.currentFloor]: {
              ...state.floors[state.currentFloor],
              walls
            }
          }
        })),

        setMeasurements: (measurements) => set((state) => ({
          floors: {
            ...state.floors,
            [state.currentFloor]: {
              ...state.floors[state.currentFloor],
              measurements
            }
          }
        })),

        setHasClosedContour: (hasClosedContour) => set((state) => ({
          floors: {
            ...state.floors,
            [state.currentFloor]: {
              ...state.floors[state.currentFloor],
              hasClosedContour
            }
          }
        })),

        // FASE 5A: Furniture operations
        setFurnitureItems: (items) => set((state) => ({
          floors: {
            ...state.floors,
            [state.currentFloor]: {
              ...state.floors[state.currentFloor],
              furnitureItems: items
            }
          }
        })),

        addFurnitureToFloor: (floorName, item) => set((state) => {
          // Clean existing array - remove any invalid items (strings, nulls, etc.)
          const existingItems = state.floors[floorName]?.furnitureItems || [];
          
          const cleanedItems = existingItems.filter(furnitureItem => 
            furnitureItem && 
            typeof furnitureItem === 'object' && 
            furnitureItem.type && 
            furnitureItem.position
          );
          
          const newItems = [...cleanedItems, item];
          
          return {
            floors: {
              ...state.floors,
              [floorName]: {
                ...state.floors[floorName],
                furnitureItems: newItems
              }
            }
          };
        }),

        updateFurnitureInFloor: (floorName, itemId, item) => set((state) => {
          const updatedItems = state.floors[floorName]?.furnitureItems?.map(existing => {
            if (existing.id === itemId) {
              return { ...existing, ...item, updatedAt: Date.now() };
            }
            return existing;
          }) || [];
          
          return {
            floors: {
              ...state.floors,
              [floorName]: {
                ...state.floors[floorName],
                furnitureItems: updatedItems
              }
            }
          };
        }),

        deleteFurnitureFromFloor: (floorName, itemId) => set((state) => ({
          floors: {
            ...state.floors,
            [floorName]: {
              ...state.floors[floorName],
              furnitureItems: state.floors[floorName]?.furnitureItems?.filter(item => item.id !== itemId) || []
            }
          }
        })),

        // Floor management
        addFloor: (name, template) => set((state) => {
          const newFloor: FloorData = template 
            ? { ...state.floors[template], name, templateSource: template }
            : {
                lines: [],
                airEntries: [],
                walls: [],
                measurements: [],
                stairPolygons: [], // Include empty stairPolygons array
                furnitureItems: [], // FASE 5A: Include empty furniture array
                hasClosedContour: false,
                name
              };

          return {
            floors: {
              ...state.floors,
              [name]: newFloor
            }
          };
        }),

        removeFloor: (name) => set((state) => {
          const { [name]: removed, ...remainingFloors } = state.floors;
          return {
            floors: remainingFloors,
            currentFloor: name === state.currentFloor ? 'ground' : state.currentFloor
          };
        }),

        // Modified copyFloorAs function for room-store.js
        copyFloorAs: (sourceName, targetName) => set((state) => {
          const sourceData = state.floors[sourceName];

          // Create the new floor data
          const newFloorData = {
            ...sourceData,
            name: targetName,
            templateSource: sourceName,
            lines: [...sourceData.lines],
            airEntries: [...sourceData.airEntries],
            walls: [...(sourceData.walls || [])],
            measurements: [...sourceData.measurements],
            hasClosedContour: sourceData.hasClosedContour,
            // Handle stairs with special logic
            stairPolygons: [...(sourceData.stairPolygons || [])]
          };

          return {
            floors: {
              ...state.floors,
              [targetName]: newFloorData
            }
          };
        }),

        // Stair polygon methods
        setStairPolygons: (stairPolygons) => set((state) => ({
          floors: {
            ...state.floors,
            [state.currentFloor]: {
              ...state.floors[state.currentFloor],
              stairPolygons
            }
          }
        })),

        addStairPolygon: (polygon) => set((state) => {
          // Get current floor's stair polygons
          const currentStairPolygons = state.floors[state.currentFloor].stairPolygons || [];
          
          return {
            floors: {
              ...state.floors,
              [state.currentFloor]: {
                ...state.floors[state.currentFloor],
                stairPolygons: [...currentStairPolygons, polygon]
              }
            }
          };
        }),

        removeStairPolygon: (id) => set((state) => {
          const currentStairPolygons = state.floors[state.currentFloor].stairPolygons || [];
          
          return {
            floors: {
              ...state.floors,
              [state.currentFloor]: {
                ...state.floors[state.currentFloor],
                stairPolygons: currentStairPolygons.filter((poly) => poly.id !== id)
              }
            }
          };
        }),

        updateFloor: (floorName, floorData) => set((state) => ({
          floors: {
            ...state.floors,
            [floorName]: floorData
          }
        })),

        syncWallsForCurrentFloor: (defaultTemperature: number = 20) => set((state) => {
          const currentFloorData = state.floors[state.currentFloor];
          const floorName = currentFloorData.name || state.currentFloor;
          
          // Synchronize walls with current lines
          const synchronizedWalls = syncWallsWithLines(
            currentFloorData.lines || [], 
            currentFloorData.walls || [], 
            floorName,
            defaultTemperature
          );
          
          return {
            floors: {
              ...state.floors,
              [state.currentFloor]: {
                ...currentFloorData,
                walls: synchronizedWalls
              }
            }
          };
        }),

        // Function to update air entry properties with hybrid mesh/store persistence
        updateAirEntryProperties: (floorName: string, index: number, properties: SimulationProperties) => set((state) => {
          const currentFloors = { ...state.floors };
          
          if (currentFloors[floorName]?.airEntries && currentFloors[floorName].airEntries[index]) {
            const updatedAirEntries = [...currentFloors[floorName].airEntries];
            
            // CRITICAL FIX: Create deep clone to prevent shared references
            updatedAirEntries[index] = {
              ...updatedAirEntries[index],
              properties: JSON.parse(JSON.stringify(properties))
            };
            
            currentFloors[floorName] = {
              ...currentFloors[floorName],
              airEntries: updatedAirEntries
            };
          }
          
          return { floors: currentFloors };
        }),

        // SILENT version for real-time updates (no notifications)
        updateAirEntryPropertiesSilent: (floorName: string, index: number, properties: SimulationProperties) => set((state) => {
          const currentFloors = { ...state.floors };
          
          if (currentFloors[floorName]?.airEntries && currentFloors[floorName].airEntries[index]) {
            const updatedAirEntries = [...currentFloors[floorName].airEntries];
            
            // CRITICAL FIX: Create deep clone to prevent shared references
            updatedAirEntries[index] = {
              ...updatedAirEntries[index],
              properties: JSON.parse(JSON.stringify(properties))
            };
            
            currentFloors[floorName] = {
              ...currentFloors[floorName],
              airEntries: updatedAirEntries
            };
          }
          
          return { floors: currentFloors };
        }),

        // Reactive AirEntry synchronization system
        updateAirEntry: (floorName: string, index: number, entry: AirEntry) => {
          set((state) => {
            const updatedFloors = { ...state.floors };
            
            if (updatedFloors[floorName]?.airEntries && updatedFloors[floorName].airEntries[index]) {
              const updatedAirEntries = [...updatedFloors[floorName].airEntries];
              // CRITICAL FIX: Create deep clone to prevent shared references
              updatedAirEntries[index] = JSON.parse(JSON.stringify(entry));
              
              updatedFloors[floorName] = {
                ...updatedFloors[floorName],
                airEntries: updatedAirEntries
              };
              
              // Notify all listeners about the change
              airEntryChangeListeners.forEach((listener) => {
                try {
                  listener(floorName, index, entry);
                } catch (error) {
                  console.error('Error in AirEntry change listener:', error);
                }
              });
            }
            
            return { floors: updatedFloors };
          });

          // Notify all subscribed listeners about the change
          airEntryChangeListeners.forEach(listener => {
            try {
              listener(floorName, index, entry);
            } catch (error) {
              console.error('Error in AirEntry change listener:', error);
            }
          });
        },

        // SILENT version for real-time updates (no notifications)
        updateAirEntrySilent: (floorName: string, index: number, entry: AirEntry) => {
          set((state) => {
            const updatedFloors = { ...state.floors };
            
            if (updatedFloors[floorName]?.airEntries && updatedFloors[floorName].airEntries[index]) {
              const updatedAirEntries = [...updatedFloors[floorName].airEntries];
              
              // CRITICAL FIX: Create deep clone to prevent shared references
              updatedAirEntries[index] = JSON.parse(JSON.stringify(entry));
              
              updatedFloors[floorName] = {
                ...updatedFloors[floorName],
                airEntries: updatedAirEntries
              };
              
              // NO NOTIFICATIONS - This is the key difference for real-time updates
            }
            
            return { floors: updatedFloors };
          });
          // NO LISTENER NOTIFICATIONS - Prevents cross-floor contamination
        },

        subscribeToAirEntryChanges: (listener: AirEntryChangeListener) => {
          airEntryChangeListeners.push(listener);
          
          // Return unsubscribe function
          return () => {
            const index = airEntryChangeListeners.indexOf(listener);
            if (index > -1) {
              airEntryChangeListeners.splice(index, 1);
            }
          };
        },

        // Centralized ID Generation System - Single Source of Truth
        generateAirEntryId: (floorName: string, type: 'window' | 'door' | 'vent') => {
          const state = get();
          const floorPrefix = floorName === 'ground' ? '0F' : 
                             floorName === 'first' ? '1F' :
                             floorName === 'second' ? '2F' :
                             floorName === 'third' ? '3F' :
                             floorName === 'fourth' ? '4F' :
                             floorName === 'fifth' ? '5F' : '0F';
          
          // Count only existing entries for THIS floor - prevent cross-floor contamination
          const floorData = state.floors[floorName];
          const existingEntries = floorData?.airEntries || [];
          
          let maxCounter = 0;
          existingEntries.forEach(entry => {
            const anyEntry = entry as any;
            if (anyEntry.id) {
              // Only match IDs for this specific floor and type
              const match = anyEntry.id.match(new RegExp(`^${type}_${floorPrefix}_(\\d+)$`));
              if (match) {
                const num = parseInt(match[1]); // FIX: Use match[1] not match[2]
                if (num > maxCounter) {
                  maxCounter = num;
                }
              }
            }
          });
          
          const generatedId = `${type}_${floorPrefix}_${maxCounter + 1}`;
          return generatedId;
        },

        addAirEntryToFloor: (floorName: string, entryWithoutId: Omit<AirEntry, 'id'>) => {
          const generatedId = get().generateAirEntryId(floorName, entryWithoutId.type);
          const entryWithId = { ...entryWithoutId, id: generatedId } as any;
          
          set((state) => ({
            floors: {
              ...state.floors,
              [floorName]: {
                ...state.floors[floorName],
                airEntries: [...(state.floors[floorName]?.airEntries || []), entryWithId]
              }
            }
          }));
          
          return generatedId;
        },


        // FASE 1: Data Migration & Validation Functions
        migrateExistingData: () => {
          const state = get();
          const errors: string[] = [];
          let migratedCount = 0;
          
          try {
            // Create backup before migration
            const backupData = JSON.stringify(state.floors);
            
            const updatedFloors = { ...state.floors };
            
            // Migrate each floor
            Object.keys(updatedFloors).forEach(floorKey => {
              const floor = updatedFloors[floorKey];
              if (floor && floor.airEntries) {
                const updatedAirEntries = floor.airEntries.map((entry, index) => {
                  // Check if entry has ID
                  if (!entry.id) {
                    // Generate new ID for legacy entry
                    const newId = get().generateAirEntryId(floorKey, entry.type);
                    migratedCount++;
                    
                    return {
                      ...entry,
                      id: newId
                    };
                  }
                  
                  // Validate existing ID format
                  if (!get().validateAirEntryId(entry.id)) {
                    errors.push(`Invalid ID format: ${entry.id} in floor ${floorKey}`);
                  }
                  
                  return entry;
                });
                
                updatedFloors[floorKey] = {
                  ...floor,
                  airEntries: updatedAirEntries
                };
              }
            });
            
            // Apply migration if successful
            set({ floors: deepCloneFloors(updatedFloors) });
            
            return {
              success: errors.length === 0,
              migratedCount,
              errors
            };
            
          } catch (error) {
            errors.push(`Migration failed: ${error.message}`);
            return {
              success: false,
              migratedCount: 0,
              errors
            };
          }
        },
        
        validateAirEntryId: (id: string) => {
          // Expected format: tipo_piso_numero (e.g., window_0F_1, door_1F_2, vent_ground_3)
          const pattern = /^(window|door|vent)_(ground|\d+F|first|second|third)_\d+$/;
          return pattern.test(id);
        },
        
        backupData: () => {
          const state = get();
          return JSON.stringify({
            floors: state.floors,
            currentFloor: state.currentFloor,
            timestamp: Date.now(),
            version: '1.0'
          });
        },
        
        restoreFromBackup: (backupData: string) => {
          try {
            const parsed = JSON.parse(backupData);
            if (parsed.floors && parsed.currentFloor) {
              set({
                floors: deepCloneFloors(parsed.floors),
                currentFloor: parsed.currentFloor
              });
              return true;
            }
            return false;
          } catch (error) {
            console.error('Backup restoration failed:', error);
            return false;
          }
        },
        
        // FASE 1: Enhanced CRUD Operations with validation
        updateAirEntryById: (id: string, updates: Partial<AirEntry>) => {
          const found = get().findAirEntryById(id);
          if (!found) return false;
          
          try {
            get().updateAirEntry(found.floorName, found.index, {
              ...found.entry,
              ...updates
            });
            return true;
          } catch (error) {
            console.error('Update by ID failed:', error);
            return false;
          }
        },
        
        deleteAirEntryById: (id: string) => {
          const found = get().findAirEntryById(id);
          if (!found) return false;
          
          try {
            set((state) => {
              const updatedFloors = { ...state.floors };
              const floor = { ...updatedFloors[found.floorName] };
              
              floor.airEntries = floor.airEntries.filter(entry => entry.id !== id);
              updatedFloors[found.floorName] = floor;
              
              return { floors: deepCloneFloors(updatedFloors) };
            });
            return true;
          } catch (error) {
            console.error('Delete by ID failed:', error);
            return false;
          }
        },
        
        findAirEntryById: (id: string) => {
          const state = get();
          
          for (const [floorName, floor] of Object.entries(state.floors)) {
            if (floor.airEntries) {
              const index = floor.airEntries.findIndex(entry => entry.id === id);
              if (index !== -1) {
                return {
                  entry: floor.airEntries[index],
                  floorName,
                  index
                };
              }
            }
          }
          
          return null;
        },
        
        // FASE 6: Enhanced Floor Copy with complete independence
        copyFloorWithNewIds: (sourceFloorName: string, targetFloorName: string) => {
          const state = get();
          const sourceFloor = state.floors[sourceFloorName];
          
          if (!sourceFloor) {
            return { success: false, newIds: [] };
          }
          
          try {
            const newIds: string[] = [];
            
            // Handle name conflicts
            let finalTargetName = targetFloorName;
            let counter = 1;
            while (state.floors[finalTargetName]) {
              finalTargetName = `${targetFloorName}_copy${counter}`;
              counter++;
            }
            
            // Deep copy with ID regeneration
            const newAirEntries = sourceFloor.airEntries?.map(entry => {
              const newId = get().generateAirEntryId(finalTargetName, entry.type);
              newIds.push(newId);
              
              return {
                ...JSON.parse(JSON.stringify(entry)), // Deep clone
                id: newId,
                // Update internal references if they exist
                line: entry.line ? {
                  ...entry.line,
                  start: { ...entry.line.start },
                  end: { ...entry.line.end }
                } : entry.line
              };
            }) || [];
            
            // Copy walls with new references
            const newWalls = sourceFloor.walls?.map(wall => ({
              ...wall,
              id: `wall_${finalTargetName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              uuid: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              floor: finalTargetName
            })) || [];
            
            // Copy stairs with new IDs
            const newStairPolygons = sourceFloor.stairPolygons?.map(stair => ({
              ...stair,
              id: `stair_${finalTargetName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              floor: finalTargetName
            })) || [];
            
            // Copy furniture with new IDs
            const newFurnitureItems = sourceFloor.furnitureItems?.map(item => ({
              ...JSON.parse(JSON.stringify(item)), // Deep clone
              id: `${item.type}_${finalTargetName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            })) || [];
            
            const newFloor: FloorData = {
              ...JSON.parse(JSON.stringify(sourceFloor)), // Deep clone structure
              name: finalTargetName,
              airEntries: newAirEntries,
              walls: newWalls,
              stairPolygons: newStairPolygons,
              furnitureItems: newFurnitureItems,
              templateSource: sourceFloorName
            };
            
            set((state) => ({
              floors: {
                ...state.floors,
                [finalTargetName]: newFloor
              }
            }));
            
            return {
              success: true,
              newIds,
              actualTargetName: finalTargetName
            };
            
          } catch (error) {
            console.error('Floor copy failed:', error);
            return { success: false, newIds: [] };
          }
        },
        
        reset: () => set({
          floors: {
            ground: {
              lines: [],
              airEntries: [],
              walls: [],
              measurements: [],
              stairPolygons: [],
              furnitureItems: [], // FASE 5A: Include empty furniture array
              hasClosedContour: false,
              name: 'Ground Floor'
            }
          },
          currentFloor: 'ground'
        }),
      }),
      {
        name: 'room-storage',
        onRehydrateStorage: () => (state) => {
          if (state) {
            // Clean corrupted furniture data automatically
            const cleanedFloors = { ...state.floors };
            
            Object.keys(cleanedFloors).forEach(floorName => {
              const floor = cleanedFloors[floorName];
              if (floor && floor.furnitureItems) {
                const cleanedItems = floor.furnitureItems.filter(item => 
                  item && 
                  typeof item === 'object' && 
                  item.type && 
                  item.position
                );
                
                if (cleanedItems.length !== floor.furnitureItems.length) {
                  cleanedFloors[floorName] = {
                    ...floor,
                    furnitureItems: cleanedItems
                  };
                }
              }
            });
            
            state.floors = cleanedFloors;
            
            // FASE 1: Auto-migrate existing data on rehydration
            setTimeout(() => {
              try {
                const migrationResult = useRoomStore.getState().migrateExistingData();
                if (migrationResult.migratedCount > 0) {
                  console.log(`[MIGRATION] Auto-migrated ${migrationResult.migratedCount} AirEntry items with IDs`);
                }
                if (migrationResult.errors.length > 0) {
                  console.warn('[MIGRATION] Errors during migration:', migrationResult.errors);
                }
              } catch (error) {
                console.error('[MIGRATION] Auto-migration failed:', error);
              }
            }, 100); // Small delay to ensure store is fully initialized
          }
        },
      }
    )
  )
);