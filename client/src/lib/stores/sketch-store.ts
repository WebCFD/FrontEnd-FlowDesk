import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SketchState {
  snapDistance: number;
  showCursorCoordinates: boolean;
  setSnapDistance: (value: number) => void;
  setShowCursorCoordinates: (value: boolean) => void;
}

export const useSketchStore = create<SketchState>()(
  persist(
    (set) => ({
      snapDistance: 5, // Default value
      showCursorCoordinates: false, // Default disabled for performance
      setSnapDistance: (value: number) => set({ snapDistance: value }),
      setShowCursorCoordinates: (value: boolean) => set({ showCursorCoordinates: value }),
    }),
    {
      name: 'sketch-store',
    }
  )
);
