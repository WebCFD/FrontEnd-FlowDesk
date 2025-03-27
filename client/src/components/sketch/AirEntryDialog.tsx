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
import { useState, useEffect, useRef } from "react";

interface AirEntryDialogProps {
  type: 'window' | 'door' | 'vent';
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  }) => void;
  isEditing?: boolean;
  initialValues?: {
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

export default function AirEntryDialog({ 
  type, 
  isOpen, 
  onClose, 
  onConfirm,
  isEditing = false,
  initialValues 
}: AirEntryDialogProps) {
  const [dimensions, setDimensions] = useState(getDefaultValues());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasBeenDragged, setHasBeenDragged] = useState(false);
  const draggingRef = useRef(false);
  

  function getDefaultValues() {
    if (initialValues) return initialValues;

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
  }

  // Reset dimensions when dialog opens with new type or initialValues
  useEffect(() => {
    if (isOpen) {
      setDimensions(getDefaultValues());
    }
  }, [isOpen, type, initialValues]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(dimensions);
    onClose();
  };

  const titles = {
    window: isEditing ? "Edit Window" : "Window Dimensions",
    door: isEditing ? "Edit Door" : "Door Dimensions",
    vent: isEditing ? "Edit Vent" : "Vent Grid Dimensions"
  };

  const descriptions = {
    window: isEditing ? "Modify the dimensions for this window" : "Set the dimensions for the window",
    door: isEditing ? "Modify the dimensions for this door" : "Set the dimensions for the door",
    vent: isEditing ? "Modify the dimensions for this vent" : "Set the dimensions for the ventilation grid"
  };

  // Handle dragging start
  // FIND THIS SECTION in AirEntryDialog.tsx - The handleDragStart function

  const handleDragStart = (e: React.MouseEvent) => {
    console.log('[DRAG-DEBUG] AirEntry - Mouse down event', {
      x: e.clientX,
      y: e.clientY,
      target: e.target
    });

    // Only allow dragging from header
    const header = (e.target as Element).closest('[data-drag-handle]');
    console.log('[DRAG-DEBUG] AirEntry - Is header element found?', !!header);

    if (!header) {
      console.log('[DRAG-DEBUG] AirEntry - Not on header, ignoring');
      return;
    }

    // Prevent text selection during drag
    e.preventDefault();

    // Get the dialog element (directly from current target)
    const dialogElement = (e.currentTarget as HTMLElement);
    if (!dialogElement) {
      console.error('[DRAG-DEBUG] AirEntry - Dialog element not found');
      return;
    }

    const dialogRect = dialogElement.getBoundingClientRect();
    console.log('[DRAG-DEBUG] AirEntry - Dialog rect:', dialogRect);

    // Calculate mouse offset from dialog's top-left corner
    const offsetX = e.clientX - dialogRect.left;
    const offsetY = e.clientY - dialogRect.top;
    console.log('[DRAG-DEBUG] AirEntry - Offsets:', { offsetX, offsetY });

    // If this is the first drag, initialize position
    if (!hasBeenDragged) {
      setPosition({ x: dialogRect.left, y: dialogRect.top });
      console.log('[DRAG-DEBUG] AirEntry - Setting initial position:', { x: dialogRect.left, y: dialogRect.top });
    }

    // Start tracking the drag
    draggingRef.current = true;
    setIsDragging(true);
    console.log('[DRAG-DEBUG] AirEntry - Started dragging');

    // Function to handle mouse movement during drag
    const handleMouseMove = (moveEvent: MouseEvent) => {
      console.log('[DRAG-DEBUG] AirEntry - Mouse move', { 
        x: moveEvent.clientX, 
        y: moveEvent.clientY,
        isDragging: draggingRef.current
      });

      if (!draggingRef.current) return;

      // Calculate new position
      const newX = moveEvent.clientX - offsetX;
      const newY = moveEvent.clientY - offsetY;

      // Use requestAnimationFrame for smoother animation
      requestAnimationFrame(() => {
        setPosition({ x: newX, y: newY });
        setHasBeenDragged(true);
        console.log('[DRAG-DEBUG] AirEntry - Position updated', { x: newX, y: newY });
      });
    };

    // Function to handle the end of dragging
    const handleMouseUp = () => {
      console.log('[DRAG-DEBUG] AirEntry - Mouse up event, isDragging:', draggingRef.current);
      draggingRef.current = false;
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // Add global event listeners
    console.log('[DRAG-DEBUG] AirEntry - Adding document event listeners');
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };



  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal={false}>
      <DialogContent 
        className="sm:max-w-[425px]"
        style={{
          position: hasBeenDragged ? 'fixed' : undefined,
          top: hasBeenDragged ? `${position.y}px` : undefined,
          left: hasBeenDragged ? `${position.x}px` : undefined,
          transform: hasBeenDragged ? 'none' : undefined,
          margin: hasBeenDragged ? 0 : undefined,
          cursor: isDragging ? 'grabbing' : 'default',
          transition: isDragging ? 'none' : undefined,
          zIndex: 50
        }}
        onMouseDown={handleDragStart}
      >
        <DialogHeader 
          data-drag-handle
          className="cursor-grab select-none"
          title="Drag to move"
        >
          {/* Visual drag indicator */}
          <div 
            className="absolute top-3 left-3 h-1 w-8 bg-muted-foreground/20 rounded-sm" 
            style={{ pointerEvents: 'none' }}
          />
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
            <Button type="submit">{isEditing ? 'Save Changes' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}