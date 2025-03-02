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

interface RoomState {
  lines: Line[];
  airEntries: AirEntry[];
  hasClosedContour: boolean;
  setLines: (lines: Line[]) => void;
  setAirEntries: (entries: AirEntry[]) => void;
  setHasClosedContour: (hasContour: boolean) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>()(
  devtools(
    persist(
      (set) => ({
        lines: [],
        airEntries: [],
        hasClosedContour: false,
        setLines: (lines) => set({ lines }),
        setAirEntries: (airEntries) => set({ airEntries }),
        setHasClosedContour: (hasClosedContour) => set({ hasClosedContour }),
        reset: () => set({ lines: [], airEntries: [], hasClosedContour: false }),
      }),
      {
        name: 'room-storage',
      }
    )
  )
);
