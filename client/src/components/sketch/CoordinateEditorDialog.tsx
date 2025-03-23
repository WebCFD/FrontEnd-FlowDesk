import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Point } from "@/types";

interface CoordinateEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (coordinates: Point) => void;
  initialCoordinates: Point;
  // These coordinates are in centimeters
  relativeCoordinates: { x: number; y: number };
}

export default function CoordinateEditorDialog({
  isOpen,
  onClose,
  onConfirm,
  initialCoordinates,
  relativeCoordinates,
}: CoordinateEditorDialogProps) {
  const [x, setX] = React.useState(relativeCoordinates.x.toString());
  const [y, setY] = React.useState(relativeCoordinates.y.toString());

  const handleXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setX(e.target.value);
  };

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setY(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Parse the values, defaulting to original if invalid
    const parsedX = parseFloat(x);
    const parsedY = parseFloat(y);

    if (isNaN(parsedX) || isNaN(parsedY)) {
      return; // Don't submit if values are invalid
    }

    // We don't need to convert back to pixels here - the parent component will handle that
    onConfirm({ x: parsedX, y: parsedY });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} modal={false}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Point Coordinates</DialogTitle>
          <DialogDescription>
            Enter the exact coordinates in centimeters.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="x-coordinate" className="text-right">
                X Coordinate (cm)
              </Label>
              <Input
                id="x-coordinate"
                value={x}
                onChange={handleXChange}
                className="col-span-3"
                type="number"
                step="0.1"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="y-coordinate" className="text-right">
                Y Coordinate (cm)
              </Label>
              <Input
                id="y-coordinate"
                value={y}
                onChange={handleYChange}
                className="col-span-3"
                type="number"
                step="0.1"
              />
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              <p>Current canvas coordinates: ({Math.round(initialCoordinates.x)}, {Math.round(initialCoordinates.y)})</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Apply</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}