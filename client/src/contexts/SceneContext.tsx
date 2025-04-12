import React, { createContext, useContext, useState } from 'react';
import * as THREE from 'three';

// Import types from the component files
interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

interface AirEntry {
  type: "vent" | "door" | "window";
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
}

// Definir el tipo para StairPolygon
interface StairPolygon {
  id: string;
  points: Point[];
  floor: string;
  direction?: "up" | "down";
  connectsTo?: string;
  isImported?: boolean;
  // Añadir datos de posición 3D calculada
  position3D?: {
    baseHeight: number;
    bottomZ: number;
    topZ: number;
  };
}

// Definir el tipo para FloorData
interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  hasClosedContour: boolean;
  name: string;
  stairPolygons?: StairPolygon[];  // Ahora con tipo específico
}

interface SceneContextType {
  // Scene elements
  sceneData: {
    walls?: THREE.Object3D[];
    floor?: THREE.Object3D;
    airEntries?: THREE.Object3D[];
    gridHelper?: THREE.Object3D;
  };
  // Methods to update/access scene data
  updateSceneData: (data: Partial<SceneContextType['sceneData']>) => void;
  getSceneObject: (objectType: keyof SceneContextType['sceneData']) => THREE.Object3D[] | THREE.Object3D | undefined;
  // Geometric data
  geometryData: {
    lines: Line[];
    airEntries: AirEntry[];
    floorSize: number;
    gridSize: number;
    currentFloor: string;
    floors: Record<string, FloorData>;  // Ahora con tipo FloorData
  };
  updateGeometryData: (data: Partial<SceneContextType['geometryData']>) => void;
  // New methods for multifloor handling
  updateFloorData: (floorName: string, floorData: Partial<FloorData>) => void;
  setCurrentFloor: (floorName: string) => void;
}

const SceneContext = createContext<SceneContextType | undefined>(undefined);

export const SceneProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [sceneData, setSceneData] = useState<SceneContextType['sceneData']>({});
  const [geometryData, setGeometryData] = useState<SceneContextType['geometryData']>({
    lines: [],
    airEntries: [],
    floorSize: 1000,
    gridSize: 20,
    currentFloor: "ground",
    floors: {}
  });

  const updateSceneData = (data: Partial<SceneContextType['sceneData']>) => {
    setSceneData(prev => ({ ...prev, ...data }));
  };

  const getSceneObject = (objectType: keyof SceneContextType['sceneData']) => {
    return sceneData[objectType];
  };

  const updateGeometryData = (data: Partial<SceneContextType['geometryData']>) => {
    console.log("SceneContext - updateGeometryData called with:", data);
    setGeometryData(prev => {
      const newData = { ...prev, ...data };
      console.log("SceneContext - geometryData updated to:", newData);
      return newData;
    });
  };
  
  // New function to update multifloor data synchronously
  const updateFloorData = (floorName: string, floorData: Partial<FloorData>) => {
    console.log(`SceneContext - updateFloorData called for floor: ${floorName}`, floorData);
    setGeometryData(prev => {
      // Merge with existing data for the floor if it exists
      const existingFloorData = prev.floors[floorName] || {} as FloorData;
      const mergedFloorData = { ...existingFloorData, ...floorData };
      const updatedFloors = { ...prev.floors, [floorName]: mergedFloorData };

      return {
        ...prev,
        floors: updatedFloors,
        // If this is the current floor, also update the primary geometry data
        ...(floorName === prev.currentFloor ? {
          lines: mergedFloorData.lines || [],
          airEntries: mergedFloorData.airEntries || []
        } : {})
      };
    });
  };
  
  // New function to set the current floor
  const setCurrentFloor = (floorName: string) => {
    console.log(`SceneContext - setCurrentFloor: ${floorName}`);
    setGeometryData(prev => {
      // Get floor data for the specified floor
      const floorData = prev.floors[floorName] || { lines: [], airEntries: [] };
      return {
        ...prev,
        currentFloor: floorName,
        // Update primary geometry data with the selected floor's data
        lines: floorData.lines || [],
        airEntries: floorData.airEntries || []
      };
    });
  };

  return (
    <SceneContext.Provider value={{
      sceneData,
      updateSceneData,
      getSceneObject,
      geometryData,
      updateGeometryData,
      updateFloorData,
      setCurrentFloor
    }}>
      {children}
    </SceneContext.Provider>
  );
};

export const useSceneContext = () => {
  const context = useContext(SceneContext);
  if (context === undefined) {
    throw new Error('useSceneContext must be used within a SceneProvider');
  }
  return context;
};