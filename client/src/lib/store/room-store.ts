import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

interface AirEntry {
  type: 'window' | 'door' | 'vent';
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
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
}

interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  measurements: Measurement[];
  stairPolygons: StairPolygon[]; // Add stairs to floor data
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
  setMeasurements: (measurements: Measurement[]) => void;
  setStairPolygons: (polygons: StairPolygon[]) => void;
  addStairPolygon: (polygon: StairPolygon) => void;
  removeStairPolygon: (id: string) => void;
  setHasClosedContour: (hasContour: boolean) => void;
  // Floor management
  addFloor: (name: string, template?: string) => void;
  removeFloor: (name: string) => void;
  copyFloorAs: (sourceName: string, targetName: string) => void;
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
            measurements: [],
            stairPolygons: [], // Add empty stair polygons array
            hasClosedContour: false,
            name: 'Ground Floor'
          }
        },
        currentFloor: 'ground',

        setFloors: (floors) => set({ floors }),
        setCurrentFloor: (floorName) => set({ currentFloor: floorName }),

        // Current floor operations
        setLines: (lines) => set((state) => ({
          floors: {
            ...state.floors,
            [state.currentFloor]: {
              ...state.floors[state.currentFloor],
              lines
            }
          }
        })),

        setAirEntries: (airEntries) => set((state) => ({
          floors: {
            ...state.floors,
            [state.currentFloor]: {
              ...state.floors[state.currentFloor],
              airEntries
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

        // Floor management
        addFloor: (name, template) => set((state) => {
          const newFloor: FloorData = template 
            ? { ...state.floors[template], name, templateSource: template }
            : {
                lines: [],
                airEntries: [],
                measurements: [],
                stairPolygons: [], // Include empty stairPolygons array
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
        copyFloorAs: (sourceName, targetName, options = {}) => set((state) => {
          const sourceData = state.floors[sourceName];

          // Create the new floor data
          const newFloorData = {
            ...sourceData,
            name: targetName,
            templateSource: sourceName,
            lines: [...sourceData.lines],
            airEntries: [...sourceData.airEntries],
            measurements: [...sourceData.measurements],
            hasClosedContour: sourceData.hasClosedContour,
            // Handle stairs with special logic
            stairPolygons: options && options.preserveStairs 
              ? options.stairPolygons || [] 
              : [...(sourceData.stairPolygons || [])]
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

        reset: () => set({
          floors: {
            ground: {
              lines: [],
              airEntries: [],
              measurements: [],
              stairPolygons: [],
              hasClosedContour: false,
              name: 'Ground Floor'
            }
          },
          currentFloor: 'ground'
        }),
      }),
      {
        name: 'room-storage',
      }
    )
  )
);