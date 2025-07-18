import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SketchState {
  snapDistance: number;
  showCursorCoordinates: boolean;
  fontScale: number;
  viewportOffset: number;
  gridSize: number;
  canvasHeightPercentage: number;
  setSnapDistance: (value: number) => void;
  setShowCursorCoordinates: (value: boolean) => void;
  setFontScale: (value: number) => void;
  setViewportOffset: (value: number) => void;
  setGridSize: (value: number) => void;
  setCanvasHeightPercentage: (value: number) => void;
}

export const useSketchStore = create<SketchState>()(
  persist(
    (set) => ({
      snapDistance: 5, // Default value
      showCursorCoordinates: false, // Default disabled for performance
      fontScale: 1.0, // Default 100% font size
      viewportOffset: 300, // Default viewport offset for layout
      gridSize: 20, // Default grid size in pixels
      canvasHeightPercentage: 55, // Default 55% of viewport height
      setSnapDistance: (value: number) => set({ snapDistance: value }),
      setShowCursorCoordinates: (value: boolean) => set({ showCursorCoordinates: value }),
      setFontScale: (value: number) => set({ fontScale: value }),
      setViewportOffset: (value: number) => set({ viewportOffset: Math.max(150, Math.min(700, value)) }),
      setGridSize: (value: number) => set({ gridSize: Math.max(10, Math.min(50, value)) }),
      setCanvasHeightPercentage: (value: number) => set({ canvasHeightPercentage: Math.max(20, Math.min(80, value)) }),
    }),
    {
      name: 'sketch-store',
    }
  )
);
