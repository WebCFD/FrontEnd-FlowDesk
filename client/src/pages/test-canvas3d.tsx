import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import Canvas3D from "@/components/sketch/Canvas3D";
import { SceneProvider } from "@/contexts/SceneContext";

// Test data for Canvas3D
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

export default function TestCanvas3D() {
  const [presentationMode, setPresentationMode] = useState(false);
  const [isMeasureMode, setIsMeasureMode] = useState(false);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [wallTransparency, setWallTransparency] = useState(0.7);

  return (
    <SceneProvider>
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Test Canvas3D - Fase 1: Modo Presentación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Controles de testing */}
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center space-x-2">
                <Switch
                  id="presentation-mode"
                  checked={presentationMode}
                  onCheckedChange={setPresentationMode}
                />
                <label htmlFor="presentation-mode">
                  Modo Presentación {presentationMode ? "(ACTIVADO)" : "(DESACTIVADO)"}
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="measure-mode"
                  checked={isMeasureMode}
                  onCheckedChange={setIsMeasureMode}
                  disabled={presentationMode}
                />
                <label htmlFor="measure-mode">
                  Modo Medición
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="eraser-mode"
                  checked={isEraserMode}
                  onCheckedChange={setIsEraserMode}
                  disabled={presentationMode}
                />
                <label htmlFor="eraser-mode">
                  Modo Borrador
                </label>
              </div>
              
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
            </div>

            {/* Tests para validar */}
            <div className="bg-yellow-50 p-4 rounded-md">
              <h3 className="font-semibold mb-2">Tests a realizar:</h3>
              <ul className="text-sm space-y-1">
                <li>• <strong>Test 1:</strong> Con modo presentación OFF, debe responder a clics/interacciones</li>
                <li>• <strong>Test 2:</strong> Con modo presentación ON, NO debe responder a clics/edición</li>
                <li>• <strong>Test 3:</strong> Navegación de cámara debe funcionar en ambos modos</li>
                <li>• <strong>Test 4:</strong> La geometría debe verse idéntica en ambos modos</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Canvas3D Component */}
        <Card>
          <CardContent className="p-4">
            <div className="h-96 border border-gray-200 rounded">
              <Canvas3D
                floors={testFloors}
                currentFloor="ground"
                wallTransparency={wallTransparency}
                isMeasureMode={isMeasureMode}
                isEraserMode={isEraserMode}
                presentationMode={presentationMode}
                onUpdateAirEntry={(floor, index, entry) => {
                  console.log("onUpdateAirEntry called:", { floor, index, entry });
                }}
                onDeleteAirEntry={(floor, index) => {
                  console.log("onDeleteAirEntry called:", { floor, index });
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Status display */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">Estado actual:</h3>
            <div className="text-sm space-y-1">
              <div>Modo Presentación: {presentationMode ? "✅ ACTIVADO" : "❌ DESACTIVADO"}</div>
              <div>Modo Medición: {isMeasureMode ? "✅ ACTIVADO" : "❌ DESACTIVADO"}</div>
              <div>Modo Borrador: {isEraserMode ? "✅ ACTIVADO" : "❌ DESACTIVADO"}</div>
              <div>Transparencia: {wallTransparency}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SceneProvider>
  );
}