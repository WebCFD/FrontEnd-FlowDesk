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
import { useState } from "react";

interface AirEntryDialogProps {
  type: 'window' | 'door' | 'vent';
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  }) => void;
}

export default function AirEntryDialog({ type, isOpen, onClose, onConfirm }: AirEntryDialogProps) {
  const defaultValues = {
    window: { width: 50, height: 50, distanceToFloor: 120 },
    door: { width: 75, height: 190 },
    vent: { width: 50, height: 50, distanceToFloor: 120 }
  };

  const [dimensions, setDimensions] = useState(defaultValues[type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(dimensions);
    onClose();
  };

  const titles = {
    window: "Window Dimensions",
    door: "Door Dimensions",
    vent: "Vent Grid Dimensions"
  };

  const descriptions = {
    window: "Set the dimensions for the window",
    door: "Set the dimensions for the door",
    vent: "Set the dimensions for the ventilation grid"
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{titles[type]}</DialogTitle>
          <DialogDescription>{descriptions[type]}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="width" className="text-right">
                Width
              </Label>
              <Input
                id="width"
                type="number"
                value={dimensions.width}
                onChange={(e) => setDimensions(prev => ({ ...prev, width: Number(e.target.value) }))}
                className="col-span-3"
              />
              <span className="text-sm">cm</span>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="height" className="text-right">
                Height
              </Label>
              <Input
                id="height"
                type="number"
                value={dimensions.height}
                onChange={(e) => setDimensions(prev => ({ ...prev, height: Number(e.target.value) }))}
                className="col-span-3"
              />
              <span className="text-sm">cm</span>
            </div>
            {type !== 'door' && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="distance" className="text-right">
                  Distance to Floor
                </Label>
                <Input
                  id="distance"
                  type="number"
                  value={dimensions.distanceToFloor}
                  onChange={(e) => setDimensions(prev => ({ ...prev, distanceToFloor: Number(e.target.value) }))}
                  className="col-span-3"
                />
                <span className="text-sm">cm</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="submit">Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}