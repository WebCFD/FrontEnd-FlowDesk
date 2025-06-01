import { useRef, useEffect } from "react";
import Canvas3D from "./Canvas3D";
import { Point, Line, AirEntry, FloorData } from "@/lib/geometryEngine";

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
}

/**
 * RoomSketchPro Fase 2 - Wrapper sobre Canvas3D
 * 
 * Esta versión simplificada usa Canvas3D internamente con presentationMode=true
 * eliminando toda la duplicación de lógica de Three.js
 */
export function RoomSketchPro({
  width = 800,
  height = 600,
  instanceId = "default",
  lines = [],
  airEntries = [],
  roomHeight = 250, // Default in cm
  wallTransparency,
  onWallTransparencyChange,
  currentFloor = "ground",
  floors,
  onComponentMount,
}: RoomSketchProProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert props to Canvas3D format
  const canvas3DFloors = floors || {
    [currentFloor]: {
      name: currentFloor,
      lines: lines,
      airEntries: airEntries,
      hasClosedContour: lines.length > 2
    }
  };

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
        floors={canvas3DFloors}
        currentFloor={currentFloor}
        ceilingHeight={roomHeight}
        wallTransparency={wallTransparency}
        presentationMode={true} // Clave: modo presentación activado
        // Desactivar todas las herramientas de edición
        isMeasureMode={false}
        isEraserMode={false}
        // Sin callbacks de edición en modo presentación
        onUpdateAirEntry={undefined}
        onDeleteAirEntry={undefined}
      />
      
      {/* Overlay opcional para controles específicos de RSP */}
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 rounded p-2 shadow">
        <label className="text-xs">Transparencia:</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={wallTransparency}
          onChange={(e) => onWallTransparencyChange(Number(e.target.value))}
          className="w-16 ml-2"
        />
      </div>
    </div>
  );
}

export default RoomSketchPro;