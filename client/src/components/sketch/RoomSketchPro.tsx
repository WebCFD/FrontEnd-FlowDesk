import { useState } from "react";
import Canvas3D from "./Canvas3D";
import { useSceneContext } from "@/contexts/SceneContext";

interface RoomSketchProProps {
  className?: string;
}

export default function RoomSketchPro({ className = "" }: RoomSketchProProps) {
  const { geometryData } = useSceneContext();
  const floors = geometryData.floors;
  const currentFloor = geometryData.currentFloor;
  const [wallTransparency, setWallTransparency] = useState(0.3);

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

      {/* Canvas3D in Presentation Mode - Uses exact same geometry as Canvas3D */}
      <Canvas3D
        floors={floors}
        currentFloor={currentFloor}
        wallTransparency={wallTransparency}
        presentationMode={true}
        isMeasureMode={false}
        isEraserMode={false}
      />
    </div>
  );
}