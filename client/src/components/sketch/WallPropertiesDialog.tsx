import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Info } from "lucide-react";
import { Wall } from "@/types";

interface WallPropertiesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  wall: Wall | null;
  onSave: (wallId: string, temperature: number, material: string, emissivity: number) => void;
}

const materialDefinitions = {
  default: { name: "Default", emissivity: 0.90 },
  wood: { name: "Wood", emissivity: 0.90 },
  metal: { name: "Metal (Steel)", emissivity: 0.25 },
  glass: { name: "Glass", emissivity: 0.92 },
  fabric: { name: "Fabric/Textile", emissivity: 0.90 },
  plastic: { name: "Plastic", emissivity: 0.90 },
  ceramic: { name: "Ceramic/Tile", emissivity: 0.90 },
  concrete: { name: "Concrete", emissivity: 0.90 },
  custom: { name: "Custom", emissivity: 0.90 }
};

export default function WallPropertiesDialog({
  isOpen,
  onClose,
  wall,
  onSave,
}: WallPropertiesDialogProps) {
  const [temperature, setTemperature] = useState("20");
  const [material, setMaterial] = useState("default");
  const [customEmissivity, setCustomEmissivity] = useState(0.90);

  const getCurrentEmissivity = () => {
    return material === 'custom' 
      ? customEmissivity 
      : materialDefinitions[material as keyof typeof materialDefinitions]?.emissivity || 0.90;
  };

  useEffect(() => {
    if (wall) {
      setTemperature(wall.properties.temperature?.toString() || "20");
      setMaterial(wall.properties.material || "default");
      setCustomEmissivity(wall.properties.emissivity || 0.90);
    }
  }, [wall]);

  const handleSave = () => {
    if (wall) {
      const temp = parseFloat(temperature);
      if (!isNaN(temp) && temp >= -50 && temp <= 100) {
        onSave(wall.id, temp, material, getCurrentEmissivity());
        onClose();
      } else {
        alert("Por favor ingresa una temperatura válida entre -50°C y 100°C");
      }
    }
  };

  const handleClose = () => {
    if (wall) {
      setTemperature(wall.properties.temperature?.toString() || "20");
      setMaterial(wall.properties.material || "default");
      setCustomEmissivity(wall.properties.emissivity || 0.90);
    }
    onClose();
  };

  if (!isOpen || !wall) return null;

  return (
    <div className="fixed top-4 right-4 z-50 w-96">
      <Card className="shadow-lg border border-gray-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              Propiedades de la Pared
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Edita las propiedades térmicas de la pared {wall.id}
          </p>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wall-id" className="text-sm font-medium">
              ID de Pared
            </Label>
            <Input
              id="wall-id"
              value={wall.id}
              disabled
              className="bg-gray-50"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="floor" className="text-sm font-medium">
              Planta
            </Label>
            <Input
              id="floor"
              value={wall.floor}
              disabled
              className="bg-gray-50"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="temperature" className="text-sm font-medium">
              Temperatura (°C)
            </Label>
            <Input
              id="temperature"
              type="number"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="20.0"
              min="-50"
              max="100"
              step="0.1"
            />
          </div>
          
          {/* Material / Emissivity Section */}
          <div className="space-y-2">
            <TooltipProvider>
              <div className="flex items-center gap-1">
                <Label htmlFor="wall-material" className="text-sm font-medium">
                  Material
                </Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-64">
                      Material type determines emissivity/absorptivity (grey body assumption).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
            <Select value={material} onValueChange={(value) => setMaterial(value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select material" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(materialDefinitions).map(([key, { name, emissivity }]) => (
                  <SelectItem key={key} value={key}>
                    {name} {key !== 'custom' && `(ε = ${emissivity})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Custom Emissivity Input - only shown when 'custom' is selected */}
          {material === 'custom' && (
            <div className="space-y-2">
              <TooltipProvider>
                <div className="flex items-center gap-1">
                  <Label htmlFor="custom-emissivity" className="text-sm font-medium">
                    Custom Emissivity (ε)
                  </Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-64">
                        Enter a custom emissivity value between 0 and 1.
                        For grey bodies, emissivity equals absorptivity.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
              <Input
                id="custom-emissivity"
                type="number"
                value={customEmissivity}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value >= 0 && value <= 1) {
                    setCustomEmissivity(value);
                  }
                }}
                placeholder="0.90"
                min="0"
                max="1"
                step="0.01"
              />
            </div>
          )}
          
          {/* Display current emissivity */}
          <div className="text-sm text-gray-600 bg-blue-50 p-2 rounded border border-blue-100">
            <strong>Current Emissivity:</strong> ε = {getCurrentEmissivity().toFixed(2)}
          </div>
          
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
            <p><strong>Punto inicial:</strong> ({wall.startPoint.x.toFixed(1)}, {wall.startPoint.y.toFixed(1)})</p>
            <p><strong>Punto final:</strong> ({wall.endPoint.x.toFixed(1)}, {wall.endPoint.y.toFixed(1)})</p>
          </div>
          
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleSave} className="flex-1">
              Guardar Cambios
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}