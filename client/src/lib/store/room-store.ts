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

interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  measurements: Measurement[];
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

        copyFloorAs: (sourceName, targetName) => set((state) => ({
          floors: {
            ...state.floors,
            [targetName]: {
              ...state.floors[sourceName],
              name: targetName,
              templateSource: sourceName
            }
          }
        })),

        reset: () => set({
          floors: {
            ground: {
              lines: [],
              airEntries: [],
              measurements: [],
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