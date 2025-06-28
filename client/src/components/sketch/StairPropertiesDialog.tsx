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
import { StairPolygon } from "@/types";

interface StairPropertiesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  stair: StairPolygon | null;
  onSave: (stairId: string, temperature: number) => void;
}

export default function StairPropertiesDialog({
  isOpen,
  onClose,
  stair,
  onSave,
}: StairPropertiesDialogProps) {
  const [temperature, setTemperature] = useState(
    stair?.temperature?.toString() || "20"
  );

  const handleSave = () => {
    if (stair) {
      const temp = parseFloat(temperature);
      if (!isNaN(temp) && temp >= -50 && temp <= 100) {
        onSave(stair.id, temp);
        onClose();
      } else {
        alert("Por favor ingresa una temperatura válida entre -50°C y 100°C");
      }
    }
  };

  const handleClose = () => {
    if (stair) {
      setTemperature(stair.temperature?.toString() || "20");
    }
    onClose();
  };

  if (!stair) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Propiedades de la Escalera</DialogTitle>
          <DialogDescription>
            Edita las propiedades térmicas de la escalera {stair.id}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="stair-id" className="text-right">
              ID de Escalera:
            </Label>
            <Input
              id="stair-id"
              value={stair.id}
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
              value={stair.floor}
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
            <p><strong>Puntos de la escalera:</strong> {stair.points.length} puntos</p>
            {stair.connectsTo && (
              <p><strong>Conecta con:</strong> {stair.connectsTo}</p>
            )}
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