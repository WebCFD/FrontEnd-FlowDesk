import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoomSketchPro } from "@/components/sketch/RoomSketchPro";
import { SceneProvider } from "@/contexts/SceneContext";

// Test data
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
      },
      {
        type: "door" as const,
        position: { x: 50, y: 125 },
        dimensions: { width: 60, height: 200 },
        line: { start: { x: 50, y: 200 }, end: { x: 50, y: 50 } }
      }
    ],
    hasClosedContour: true
  }
};

export default function TestFase3() {
  const [wallTransparency, setWallTransparency] = useState(0.7);
  const [materialTheme, setMaterialTheme] = useState("modern");

  return (
    <SceneProvider>
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Test Fase 3: Sistema de Materiales Mejorados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label htmlFor="theme">Tema de Materiales:</label>
                <Select value={materialTheme} onValueChange={setMaterialTheme}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modern">Moderno</SelectItem>
                    <SelectItem value="classic">Clásico</SelectItem>
                    <SelectItem value="industrial">Industrial</SelectItem>
                  </SelectContent>
                </Select>
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

            <div className="bg-green-50 p-4 rounded-md">
              <h3 className="font-semibold mb-2">Tests de Fase 3:</h3>
              <ul className="text-sm space-y-1">
                <li>• <strong>Test 1:</strong> Materiales se aplican correctamente sin afectar geometría</li>
                <li>• <strong>Test 2:</strong> Cambios de tema se reflejan inmediatamente</li>
                <li>• <strong>Test 3:</strong> Performance no se degrada significativamente</li>
                <li>• <strong>Test 4:</strong> Diferentes temas se pueden cambiar dinámicamente</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-4">
          {/* Tema Moderno */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tema Moderno</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="h-64 border border-gray-200 rounded">
                <RoomSketchPro
                  width={300}
                  height={250}
                  floors={testFloors}
                  currentFloor="ground"
                  wallTransparency={materialTheme === "modern" ? wallTransparency : 0.7}
                  onWallTransparencyChange={setWallTransparency}
                  roomHeight={250}
                />
              </div>
              <div className="mt-2 text-xs">
                <div className="bg-gray-100 p-2 rounded">
                  <div>Paredes: Blanco moderno</div>
                  <div>Piso: Madera clara</div>
                  <div>Ventanas: Azul metálico</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tema Clásico */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tema Clásico</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="h-64 border border-gray-200 rounded">
                <RoomSketchPro
                  width={300}
                  height={250}
                  floors={testFloors}
                  currentFloor="ground"
                  wallTransparency={materialTheme === "classic" ? wallTransparency : 0.7}
                  onWallTransparencyChange={setWallTransparency}
                  roomHeight={250}
                />
              </div>
              <div className="mt-2 text-xs">
                <div className="bg-gray-100 p-2 rounded">
                  <div>Paredes: Beige clásico</div>
                  <div>Piso: Madera oscura</div>
                  <div>Ventanas: Azul tradicional</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tema Industrial */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tema Industrial</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="h-64 border border-gray-200 rounded">
                <RoomSketchPro
                  width={300}
                  height={250}
                  floors={testFloors}
                  currentFloor="ground"
                  wallTransparency={materialTheme === "industrial" ? wallTransparency : 0.7}
                  onWallTransparencyChange={setWallTransparency}
                  roomHeight={250}
                />
              </div>
              <div className="mt-2 text-xs">
                <div className="bg-gray-100 p-2 rounded">
                  <div>Paredes: Gris metálico</div>
                  <div>Piso: Concreto</div>
                  <div>Ventanas: Negro mate</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Resultado actual */}
        <Card>
          <CardHeader>
            <CardTitle>Visualización con Tema: {materialTheme}</CardTitle>
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

        {/* Status */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">Estado Fase 3:</h3>
            <div className="text-sm space-y-1">
              <div>Tema actual: {materialTheme}</div>
              <div>Transparencia: {wallTransparency}</div>
              <div>✅ RSP usa Canvas3D como base</div>
              <div>🚧 Sistema de materiales: En desarrollo</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SceneProvider>
  );
}