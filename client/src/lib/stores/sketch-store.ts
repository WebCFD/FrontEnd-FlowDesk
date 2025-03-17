import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SketchState {
  snapDistance: number;
  setSnapDistance: (value: number) => void;
}

export const useSketchStore = create<SketchState>()(
  persist(
    (set) => ({
      snapDistance: 5, // Default value
      setSnapDistance: (value: number) => set({ snapDistance: value }),
    }),
    {
      name: 'sketch-store',
    }
  )
);
