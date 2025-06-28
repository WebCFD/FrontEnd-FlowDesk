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
  reset: () => void;
}

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

        setFloors: (floors) => set({ floors }),
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

        setAirEntries: (airEntries) => set((state) => ({
          floors: {
            ...state.floors,
            [state.currentFloor]: {
              ...state.floors[state.currentFloor],
              airEntries
            }
          }
        })),

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
          console.log(`🏪 STORE addFurnitureToFloor called:`, { floorName, itemType: item.type, itemId: item.id });
          
          // Clean existing array - remove any invalid items (strings, nulls, etc.)
          const existingItems = state.floors[floorName]?.furnitureItems || [];
          console.log(`🏪 STORE existing items count:`, existingItems.length);
          
          const cleanedItems = existingItems.filter(furnitureItem => 
            furnitureItem && 
            typeof furnitureItem === 'object' && 
            furnitureItem.type && 
            furnitureItem.position
          );
          console.log(`🏪 STORE cleaned items count:`, cleanedItems.length);
          
          const newItems = [...cleanedItems, item];
          console.log(`🏪 STORE new items total:`, newItems.length);
          console.log(`🏪 STORE item being added:`, { type: item.type, id: item.id, position: item.position });
          
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

        // Function to update air entry properties
        updateAirEntryProperties: (floorName: string, index: number, properties: SimulationProperties) => set((state) => {
          const currentFloors = { ...state.floors };
          
          if (currentFloors[floorName]?.airEntries && currentFloors[floorName].airEntries[index]) {
            const updatedAirEntries = [...currentFloors[floorName].airEntries];
            updatedAirEntries[index] = {
              ...updatedAirEntries[index],
              properties: properties
            };
            
            currentFloors[floorName] = {
              ...currentFloors[floorName],
              airEntries: updatedAirEntries
            };
          }
          
          return { floors: currentFloors };
        }),
        
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
          }
        },
      }
    )
  )
);