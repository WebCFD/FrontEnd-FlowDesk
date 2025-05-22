import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [temperature, setTemperature] = useState(
    wall?.properties.temperature?.toString() || "20"
  );

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

  if (!wall) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Propiedades de la Pared</DialogTitle>
          <DialogDescription>
            Edita las propiedades térmicas de la pared {wall.id}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="wall-id" className="text-right">
              ID de Pared:
            </Label>
            <Input
              id="wall-id"
              value={wall.id}
              className="col-span-3"
              disabled
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="floor" className="text-right">
              Planta:
            </Label>
            <Input
              id="floor"
              value={wall.floor}
              className="col-span-3"
              disabled
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="temperature" className="text-right">
              Temperatura (°C):
            </Label>
            <Input
              id="temperature"
              type="number"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="col-span-3"
              placeholder="20.0"
              min="-50"
              max="100"
              step="0.1"
            />
          </div>
          <div className="text-sm text-gray-600 col-span-4">
            <p><strong>Punto inicial:</strong> ({wall.startPoint.x.toFixed(1)}, {wall.startPoint.y.toFixed(1)})</p>
            <p><strong>Punto final:</strong> ({wall.endPoint.x.toFixed(1)}, {wall.endPoint.y.toFixed(1)})</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="submit" onClick={handleSave}>
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}