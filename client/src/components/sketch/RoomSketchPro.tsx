import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useCanvas3DGeometry } from "@/hooks/useCanvas3DGeometry";
import { 
  Point, 
  Line, 
  AirEntry, 
  FloorData,
  GeometryConfig 
} from "@/lib/geometryEngine";

interface FurnitureItem {
  id: string;
  name: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

interface RoomSketchProProps {
  width?: number;
  height?: number;
  instanceId?: string;
  lines?: Line[];
  airEntries?: AirEntry[];
  roomHeight?: number;
  onFurnitureAdd?: (item: FurnitureItem) => void;
  wallTransparency: number;
  onWallTransparencyChange: (value: number) => void;
  currentFloor?: string;
  floors?: Record<string, FloorData>;
  onComponentMount?: () => void;
}

export function RoomSketchPro({
  width = 800,
  height = 600,
  instanceId = "default",
  lines = [],
  airEntries = [],
  roomHeight = 2.5,
  onFurnitureAdd,
  wallTransparency,
  onWallTransparencyChange,
  currentFloor,
  floors,
  onComponentMount,
}: RoomSketchProProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Resolve geometry data based on current floor or direct props
  const resolveGeometryData = (): Record<string, FloorData> => {
    if (floors && currentFloor && floors[currentFloor]) {
      return floors;
    }
    
    // Fallback: create floor data from direct props
    const fallbackFloor: FloorData = {
      lines: lines,
      airEntries: airEntries,
      hasClosedContour: lines.length > 2,
      name: currentFloor || 'default'
    };
    
    return {
      [currentFloor || 'default']: fallbackFloor
    };
  };

  // Prepare geometry configuration
  const geometryConfig: GeometryConfig = {
    currentFloor: currentFloor || 'default',
    wallTransparency,
    defaultCeilingHeight: roomHeight,
    defaultFloorDeck: 0,
    presentationMode: true, // This is the key difference - RSP is in presentation mode
    floorParameters: {
      [currentFloor || 'default']: {
        ceilingHeight: roomHeight,
        floorDeck: 0
      }
    }
  };

  // Use the shared Canvas3D geometry hook
  const {
    scene,
    camera,
    renderer,
    controls,
    objects,
    updateGeometry,
    cleanup
  } = useCanvas3DGeometry({
    floors: resolveGeometryData(),
    config: geometryConfig,
    containerRef,
    width,
    height,
    presentationMode: true
  });

  // Enhanced materials for presentation mode
  const enhancePresentationMaterials = () => {
    if (!scene) return;

    objects.forEach(obj => {
      if (obj instanceof THREE.Mesh) {
        const material = obj.material as THREE.MeshStandardMaterial;
        
        // Enhanced materials for better presentation
        switch (obj.userData?.type) {
          case 'wall':
            material.color.setHex(0xf5f5f5); // Light gray
            material.roughness = 0.8;
            material.metalness = 0.1;
            break;
          case 'floor':
            material.color.setHex(0xe0e0e0); // Darker gray
            material.roughness = 0.9;
            material.metalness = 0.05;
            break;
          case 'window':
            material.color.setHex(0x87CEEB); // Sky blue
            material.transparent = true;
            material.opacity = 0.6;
            material.roughness = 0.1;
            material.metalness = 0.9;
            break;
          case 'door':
            material.color.setHex(0x8B4513); // Saddle brown
            material.roughness = 0.7;
            material.metalness = 0.2;
            break;
          case 'vent':
            material.color.setHex(0x696969); // Dim gray
            material.roughness = 0.3;
            material.metalness = 0.8;
            break;
        }
      }
    });
  };

  // Apply enhanced materials when objects change
  useEffect(() => {
    enhancePresentationMaterials();
  }, [objects]);

  // Update wall transparency when prop changes
  useEffect(() => {
    if (!scene) return;
    
    objects.forEach(obj => {
      if (obj instanceof THREE.Mesh && obj.userData?.type === 'wall') {
        const material = obj.material as THREE.MeshStandardMaterial;
        material.transparent = wallTransparency < 1;
        material.opacity = wallTransparency;
      }
    });
  }, [wallTransparency, objects, scene]);

  // Add drag and drop support for furniture
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !scene) return;

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const itemData = event.dataTransfer?.getData("application/json");
      if (itemData) {
        const item = JSON.parse(itemData);
        addFurnitureToScene(item);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    };

    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("drop", handleDrop);

    return () => {
      container.removeEventListener("dragover", handleDragOver);
      container.removeEventListener("drop", handleDrop);
    };
  }, [scene]);

  // Call onComponentMount when ready
  useEffect(() => {
    if (scene && onComponentMount) {
      onComponentMount();
    }
  }, [scene, onComponentMount]);

  // Helper function to add furniture to the scene
  const addFurnitureToScene = (item: FurnitureItem) => {
    if (!scene || !onFurnitureAdd) return;
    onFurnitureAdd(item);
  };

  // Component render
  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-gray-100"
      style={{ minHeight: '400px' }}
    >
      {/* Wall transparency controls */}
      <div className="absolute top-2 right-2 z-10 bg-white p-2 rounded shadow">
        <label className="block text-xs mb-1">Wall Transparency</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={wallTransparency}
          onChange={(e) => onWallTransparencyChange(parseFloat(e.target.value))}
          className="w-20"
        />
      </div>
    </div>
  );
}

export default RoomSketchPro;