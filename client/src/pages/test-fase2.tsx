import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import Canvas3D from "@/components/sketch/Canvas3D";
import { RoomSketchPro } from "@/components/sketch/RoomSketchPro";
import { SceneProvider } from "@/contexts/SceneContext";

// Test data identical for both components
const testFloors = {
  "ground": {
    name: "ground",
    lines: [
      { start: { x: 50, y: 50 }, end: { x: 250, y: 50 } },
      { start: { x: 250, y: 50 }, end: { x: 250, y: 200 } },
      { start: { x: 250, y: 200 }, end: { x: 50, y: 200 } },
      { start: { x: 50, y: 200 }, end: { x: 50, y: 50 } }
    ],
    airEntries: [
      {
        type: "window" as const,
        position: { x: 150, y: 50 },
        dimensions: { width: 80, height: 120 },
        line: { start: { x: 50, y: 50 }, end: { x: 250, y: 50 } }
      }
    ],
    hasClosedContour: true
  }
};

export default function TestFase2() {
  const [wallTransparency, setWallTransparency] = useState(0.7);

  return (
    <SceneProvider>
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Test Fase 2: RSP como Wrapper de Canvas3D</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="transparency">Transparencia:</label>
              <input
                id="transparency"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={wallTransparency}
                onChange={(e) => setWallTransparency(Number(e.target.value))}
                className="w-20"
              />
              <span>{wallTransparency}</span>
            </div>

            <div className="bg-blue-50 p-4 rounded-md">
              <h3 className="font-semibold mb-2">Tests de Fase 2:</h3>
              <ul className="text-sm space-y-1">
                <li>• <strong>Test 1:</strong> RSP muestra exactamente la misma geometría que Canvas3D</li>
                <li>• <strong>Test 2:</strong> Props (transparencia, floors) se pasan correctamente</li>
                <li>• <strong>Test 3:</strong> RSP no tiene funcionalidades de edición</li>
                <li>• <strong>Test 4:</strong> Comparación visual pixel-perfect entre ambos</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-6">
          {/* Canvas3D Original en modo presentación */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Canvas3D (Modo Presentación)</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-96 border border-gray-200 rounded">
                <Canvas3D
                  floors={testFloors}
                  currentFloor="ground"
                  wallTransparency={wallTransparency}
                  presentationMode={true}
                  isMeasureMode={false}
                  isEraserMode={false}
                />
              </div>
            </CardContent>
          </Card>

          {/* RSP Wrapper */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">RoomSketchPro (Wrapper)</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-96 border border-gray-200 rounded">
                <RoomSketchPro
                  width={800}
                  height={400}
                  floors={testFloors}
                  currentFloor="ground"
                  wallTransparency={wallTransparency}
                  onWallTransparencyChange={setWallTransparency}
                  roomHeight={250}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Resultados esperados */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">Resultados esperados:</h3>
            <div className="text-sm space-y-1">
              <div>✅ Ambas visualizaciones deben ser idénticas</div>
              <div>✅ RSP no debe responder a clics de edición</div>
              <div>✅ Navegación de cámara debe funcionar en ambos</div>
              <div>✅ Cambios de transparencia se reflejan en tiempo real</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SceneProvider>
  );
}