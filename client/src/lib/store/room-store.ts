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

interface RoomState {
  lines: Line[];
  airEntries: AirEntry[];
  measurements: Measurement[];
  hasClosedContour: boolean;
  setLines: (lines: Line[]) => void;
  setAirEntries: (entries: AirEntry[]) => void;
  setMeasurements: (measurements: Measurement[]) => void;
  setHasClosedContour: (hasContour: boolean) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>()(
  devtools(
    persist(
      (set) => ({
        lines: [],
        airEntries: [],
        measurements: [],
        hasClosedContour: false,
        setLines: (lines) => set({ lines }),
        setAirEntries: (airEntries) => set({ airEntries }),
        setMeasurements: (measurements) => set({ measurements }),
        setHasClosedContour: (hasClosedContour) => set({ hasClosedContour }),
        reset: () => set({ lines: [], airEntries: [], measurements: [], hasClosedContour: false }),
      }),
      {
        name: 'room-storage',
      }
    )
  )
);