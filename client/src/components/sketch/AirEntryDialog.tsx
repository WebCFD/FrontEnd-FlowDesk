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
import { useEffect, useState } from "react";

interface AirEntryDialogProps {
  type: 'window' | 'door' | 'vent';
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  }) => void;
  initialDimensions?: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
}

const windowDefaults = {
  width: 50,
  height: 50,
  distanceToFloor: 120
};

const doorDefaults = {
  width: 75,
  height: 190
};

const ventDefaults = {
  width: 50,
  height: 50,
  distanceToFloor: 120
};

export default function AirEntryDialog({ type, isOpen, onClose, onConfirm, initialDimensions }: AirEntryDialogProps) {
  const getDefaultValues = () => {
    if (initialDimensions) {
      return initialDimensions;
    }

    switch (type) {
      case 'window':
        return windowDefaults;
      case 'door':
        return doorDefaults;
      case 'vent':
        return ventDefaults;
      default:
        return windowDefaults;
    }
  };

  const [dimensions, setDimensions] = useState(getDefaultValues());

  // Reset dimensions when dialog opens with new type or initialDimensions
  useEffect(() => {
    if (isOpen) {
      setDimensions(getDefaultValues());
    }
  }, [isOpen, type, initialDimensions]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(dimensions);
    onClose();
  };

  const titles = {
    window: initialDimensions ? "Edit Window" : "Window Dimensions",
    door: initialDimensions ? "Edit Door" : "Door Dimensions",
    vent: initialDimensions ? "Edit Vent Grid" : "Vent Grid Dimensions"
  };

  const descriptions = {
    window: initialDimensions ? "Modify the dimensions of this window" : "Set the dimensions for the window",
    door: initialDimensions ? "Modify the dimensions of this door" : "Set the dimensions for the door",
    vent: initialDimensions ? "Modify the dimensions of this ventilation grid" : "Set the dimensions for the ventilation grid"
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