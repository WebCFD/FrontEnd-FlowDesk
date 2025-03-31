import { useState } from "react";
import Canvas3DMinimal from "@/components/Canvas3DMinimal";
import { Slider } from "@/components/ui/slider";

export default function Canvas3DTest() {
  const [wallTransparency, setWallTransparency] = useState(0.5);
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Canvas3D Test Page</h1>
      
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Wall Transparency</h2>
        <Slider
          min={0}
          max={1}
          step={0.1}
          value={[wallTransparency]}
          onValueChange={(values) => setWallTransparency(values[0])}
          className="max-w-md"
        />
        <p className="text-sm text-gray-500 mt-1">
          Value: {wallTransparency.toFixed(1)}
        </p>
      </div>
      
      <div className="mt-6">
        <Canvas3DMinimal 
          wallTransparency={wallTransparency} 
        />
      </div>
    </div>
  );
}