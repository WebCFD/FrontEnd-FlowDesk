import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";
import { Wall } from "@/types";

interface WallPropertiesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  wall: Wall | null;
  onSave: (wallId: string, temperature: number) => void;
}

export default function WallPropertiesDialog({
  isOpen,
  onClose,
  wall,
  onSave,
}: WallPropertiesDialogProps) {
  const [temperature, setTemperature] = useState("20");

  useEffect(() => {
    if (wall) {
      setTemperature(wall.properties.temperature?.toString() || "20");
    }
  }, [wall]);

  const handleSave = () => {
    if (wall) {
      const temp = parseFloat(temperature);
      if (!isNaN(temp) && temp >= -50 && temp <= 100) {
        onSave(wall.id, temp);
        onClose();
      } else {
        alert("Por favor ingresa una temperatura válida entre -50°C y 100°C");
      }
    }
  };

  const handleClose = () => {
    if (wall) {
      setTemperature(wall.properties.temperature?.toString() || "20");
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