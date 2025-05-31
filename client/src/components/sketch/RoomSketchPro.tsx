import { useState, useCallback, useRef, useEffect } from "react";
import * as THREE from "three";
import Canvas3D from "./Canvas3D";
import { useSceneContext } from "@/contexts/SceneContext";

interface MaterialConfig {
  wall?: THREE.Material;
  floor?: THREE.Material;
  ceiling?: THREE.Material;
  door?: THREE.Material;
  window?: THREE.Material;
  stairs?: THREE.Material;
}

interface RoomSketchProProps {
  className?: string;
}

export default function RoomSketchPro({ className = "" }: RoomSketchProProps) {
  const { geometryData } = useSceneContext();
  const floors = geometryData.floors;
  const currentFloor = geometryData.currentFloor;
  const [wallTransparency, setWallTransparency] = useState(0.3);
  const applyMaterialsRef = useRef<((materials: MaterialConfig) => void) | null>(null);

  // Create enhanced materials for presentation
  const createEnhancedMaterials = useCallback((): MaterialConfig => {
    return {
      wall: new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: wallTransparency,
        side: THREE.DoubleSide,
        shininess: 30,
      }),
      floor: new THREE.MeshPhongMaterial({
        color: 0x8b7355,
        shininess: 20,
        transparent: false,
      }),
      ceiling: new THREE.MeshPhongMaterial({
        color: 0xf5f5f5,
        shininess: 10,
        transparent: false,
      }),
      door: new THREE.MeshPhongMaterial({
        color: 0x8B4513,
        shininess: 25,
        transparent: false,
      }),
      window: new THREE.MeshPhongMaterial({
        color: 0x87CEEB,
        transparent: true,
        opacity: 0.6,
        shininess: 100,
      }),
      stairs: new THREE.MeshPhongMaterial({
        color: 0x696969,
        shininess: 15,
        transparent: false,
      }),
    };
  }, [wallTransparency]);

  // Handle materials ready callback from Canvas3D
  const handleMaterialsReady = useCallback((applyFn: (materials: MaterialConfig) => void) => {
    applyMaterialsRef.current = applyFn;
    // Apply initial materials
    const materials = createEnhancedMaterials();
    applyFn(materials);
  }, [createEnhancedMaterials]);

  // Update materials when transparency changes
  useEffect(() => {
    if (applyMaterialsRef.current) {
      const materials = createEnhancedMaterials();
      applyMaterialsRef.current(materials);
    }
  }, [wallTransparency, createEnhancedMaterials]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Wall Transparency Controls */}
      <div className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">
            Wall Transparency
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={wallTransparency}
            onChange={(e) => setWallTransparency(parseFloat(e.target.value))}
            className="w-32"
          />
          <span className="text-xs text-gray-500">
            {Math.round(wallTransparency * 100)}%
          </span>
        </div>
      </div>

      {/* Canvas3D in Presentation Mode */}
      <Canvas3D
        floors={floors}
        currentFloor={currentFloor}
        wallTransparency={wallTransparency}
        presentationMode={true}
        onMaterialsReady={handleMaterialsReady}
        // Disable all interactive features
        isMeasureMode={false}
        isEraserMode={false}
      />
    </div>
  );
}