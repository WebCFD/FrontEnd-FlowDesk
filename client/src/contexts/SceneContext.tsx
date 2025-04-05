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
  };
  updateGeometryData: (data: Partial<SceneContextType['geometryData']>) => void;
}

const SceneContext = createContext<SceneContextType | undefined>(undefined);

export const SceneProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [sceneData, setSceneData] = useState<SceneContextType['sceneData']>({});
  const [geometryData, setGeometryData] = useState<SceneContextType['geometryData']>({
    lines: [],
    airEntries: [],
    floorSize: 1000,
    gridSize: 20
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

  return (
    <SceneContext.Provider value={{
      sceneData,
      updateSceneData,
      getSceneObject,
      geometryData,
      updateGeometryData
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