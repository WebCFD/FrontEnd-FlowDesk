import { useRef, useEffect, useState } from "react";
import Canvas3D from "./Canvas3D";
import { Point, Line, AirEntry, FloorData } from "@/lib/geometryEngine";
import * as THREE from "three";

interface RoomSketchProProps {
  width?: number;
  height?: number;
  instanceId?: string;
  lines?: Line[];
  airEntries?: AirEntry[];
  roomHeight?: number;
  wallTransparency: number;
  onWallTransparencyChange: (value: number) => void;
  currentFloor?: string;
  floors?: Record<string, FloorData>;
  onComponentMount?: () => void;
  materialTheme?: "modern" | "classic" | "industrial";
}

/**
 * RoomSketchPro Fase 3 - Enhanced Materials
 * 
 * Wrapper sobre Canvas3D que aplica materiales mejorados después del render
 */
export function RoomSketchPro({
  width = 800,
  height = 600,
  instanceId = "default",
  lines = [],
  airEntries = [],
  roomHeight = 250,
  wallTransparency,
  onWallTransparencyChange,
  currentFloor = "ground",
  floors,
  onComponentMount,
  materialTheme = "modern"
}: RoomSketchProProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvas3DRef = useRef<any>(null);
  const [canvas3DScene, setCanvas3DScene] = useState<THREE.Scene | null>(null);

  // Convert props to Canvas3D format
  const canvas3DFloors = floors || {
    [currentFloor]: {
      name: currentFloor,
      lines: lines,
      airEntries: airEntries,
      hasClosedContour: lines.length > 2
    }
  };

  // Material themes
  const materialThemes = {
    modern: {
      wall: {
        color: 0xf5f5f5,
        roughness: 0.8,
        metalness: 0.1,
        emissive: 0x0a0a0a
      },
      floor: {
        color: 0x8b7355,
        roughness: 0.9,
        metalness: 0.0
      },
      airEntry: {
        window: { color: 0x87ceeb, roughness: 0.1, metalness: 0.9 },
        door: { color: 0x8b4513, roughness: 0.7, metalness: 0.0 },
        vent: { color: 0x696969, roughness: 0.3, metalness: 0.8 }
      }
    },
    classic: {
      wall: {
        color: 0xfaebd7,
        roughness: 0.9,
        metalness: 0.0
      },
      floor: {
        color: 0x654321,
        roughness: 0.8,
        metalness: 0.0
      },
      airEntry: {
        window: { color: 0x4682b4, roughness: 0.2, metalness: 0.7 },
        door: { color: 0x8b4513, roughness: 0.8, metalness: 0.0 },
        vent: { color: 0x2f4f4f, roughness: 0.4, metalness: 0.6 }
      }
    },
    industrial: {
      wall: {
        color: 0x708090,
        roughness: 0.6,
        metalness: 0.3
      },
      floor: {
        color: 0x2f4f4f,
        roughness: 0.4,
        metalness: 0.1
      },
      airEntry: {
        window: { color: 0x000000, roughness: 0.0, metalness: 1.0 },
        door: { color: 0x4a4a4a, roughness: 0.5, metalness: 0.8 },
        vent: { color: 0x2f4f4f, roughness: 0.2, metalness: 0.9 }
      }
    }
  };

  // Apply enhanced materials to Canvas3D scene
  const applyEnhancedMaterials = (scene: THREE.Scene) => {
    if (!scene) return;

    const theme = materialThemes[materialTheme];

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const userData = object.userData;
        
        if (userData.type === 'wall') {
          object.material = new THREE.MeshPhysicalMaterial({
            color: theme.wall.color,
            roughness: theme.wall.roughness,
            metalness: theme.wall.metalness,
            transparent: true,
            opacity: wallTransparency,
            emissive: theme.wall.emissive || 0x000000,
            emissiveIntensity: 0.02
          });
        } else if (userData.type === 'floor') {
          object.material = new THREE.MeshPhysicalMaterial({
            color: theme.floor.color,
            roughness: theme.floor.roughness,
            metalness: theme.floor.metalness
          });
        } else if (['window', 'door', 'vent'].includes(userData.type)) {
          const entryTheme = theme.airEntry[userData.type as keyof typeof theme.airEntry];
          object.material = new THREE.MeshPhysicalMaterial({
            color: entryTheme.color,
            roughness: entryTheme.roughness,
            metalness: entryTheme.metalness,
            transparent: userData.type === 'window',
            opacity: userData.type === 'window' ? 0.3 : 1.0
          });
        }
      }
    });
  };

  // Monitor Canvas3D scene changes
  useEffect(() => {
    if (canvas3DScene) {
      applyEnhancedMaterials(canvas3DScene);
    }
  }, [canvas3DScene, materialTheme, wallTransparency]);

  useEffect(() => {
    if (onComponentMount) {
      onComponentMount();
    }
  }, [onComponentMount]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full"
      style={{ width, height }}
    >
      <Canvas3D
        ref={canvas3DRef}
        floors={canvas3DFloors}
        currentFloor={currentFloor}
        ceilingHeight={roomHeight}
        wallTransparency={wallTransparency}
        presentationMode={true}
        isMeasureMode={false}
        isEraserMode={false}
        onUpdateAirEntry={undefined}
        onDeleteAirEntry={undefined}
        // Callback para acceder a la escena 3D
        onViewChange={(callback) => {
          // Acceder a la escena interna de Canvas3D
          if (canvas3DRef.current && canvas3DRef.current.sceneRef?.current) {
            setCanvas3DScene(canvas3DRef.current.sceneRef.current);
          }
        }}
      />
      
      {/* Enhanced controls */}
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-95 rounded p-3 shadow-lg space-y-2">
        <div>
          <label className="text-xs block">Tema:</label>
          <select
            value={materialTheme}
            onChange={(e) => {
              // Trigger material theme change
              const newTheme = e.target.value as typeof materialTheme;
              // This would need to be passed up to parent component
            }}
            className="text-xs w-full"
          >
            <option value="modern">Moderno</option>
            <option value="classic">Clásico</option>
            <option value="industrial">Industrial</option>
          </select>
        </div>
        
        <div>
          <label className="text-xs block">Transparencia:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={wallTransparency}
            onChange={(e) => onWallTransparencyChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

export default RoomSketchPro;