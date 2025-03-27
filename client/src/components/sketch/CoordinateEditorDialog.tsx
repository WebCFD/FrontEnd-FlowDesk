import React, { useState, useCallback, useEffect, useRef } from "react";

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
  console.log('[DIALOG-DEBUG] Rendering CoordinateEditorDialog, isOpen:', isOpen);

  const [x, setX] = useState(relativeCoordinates.x.toString());
  const [y, setY] = useState(relativeCoordinates.y.toString());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasBeenDragged, setHasBeenDragged] = useState(false);
  const draggingRef = useRef(false);

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
    console.log('[DIALOG-DEBUG] Submitting coordinates:', { x: parsedX, y: parsedY });
    onConfirm({ x: parsedX, y: parsedY });
  };

  // Handle dragging start
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    console.log('[DRAG-DEBUG] Mouse down event', {
      x: e.clientX,
      y: e.clientY,
      target: e.target,
      currentTarget: e.currentTarget
    });

    // Only allow dragging from header
    const header = (e.target as Element).closest('[data-drag-handle]');
    console.log('[DRAG-DEBUG] Is header element found?', !!header);

    if (!header) {
      console.log('[DRAG-DEBUG] Not on header, ignoring');
      return;
    }

    // Prevent text selection during drag
    e.preventDefault();

    // Get the dialog element (this is the most direct way)
    const dialogElement = (e.currentTarget as HTMLElement);
    if (!dialogElement) {
      console.error('[DRAG-DEBUG] Dialog element not found');
      return;
    }

    const dialogRect = dialogElement.getBoundingClientRect();
    console.log('[DRAG-DEBUG] Dialog rect:', dialogRect);

    // Calculate mouse offset from dialog's top-left corner
    const offsetX = e.clientX - dialogRect.left;
    const offsetY = e.clientY - dialogRect.top;
    console.log('[DRAG-DEBUG] Offsets:', { offsetX, offsetY });

    // If this is the first drag, initialize position
    if (!hasBeenDragged) {
      setPosition({ x: dialogRect.left, y: dialogRect.top });
      console.log('[DRAG-DEBUG] Setting initial position:', { x: dialogRect.left, y: dialogRect.top });
    }

    // Start tracking the drag - MODIFY THESE TWO LINES
    draggingRef.current = true; // Add this line 
    setIsDragging(true);
    console.log('[DRAG-DEBUG] Started dragging');

    // Function to handle mouse movement during drag
    const handleMouseMove = (moveEvent: MouseEvent) => {
      console.log('[DRAG-DEBUG] Mouse move event', { 
        x: moveEvent.clientX, 
        y: moveEvent.clientY, 
        isDragging: draggingRef.current // Change this to use the ref
      });

      // MODIFY THIS LINE to use the ref
      if (!draggingRef.current) return;

      // Calculate new position
      const newX = moveEvent.clientX - offsetX;
      const newY = moveEvent.clientY - offsetY;
      console.log('[DRAG-DEBUG] New position:', { x: newX, y: newY });

      // Use requestAnimationFrame for smoother animation
      requestAnimationFrame(() => {
        setPosition({ x: newX, y: newY });
        setHasBeenDragged(true);
        console.log('[DRAG-DEBUG] Position updated');
      });
    };

    
    // Function to handle the end of dragging
    const handleMouseUp = () => {
      console.log('[DRAG-DEBUG] Mouse up event, isDragging:', draggingRef.current);
      draggingRef.current = false;
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // Add global event listeners
    console.log('[DRAG-DEBUG] Adding document event listeners');
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    }, [isDragging, hasBeenDragged, position]);



    
  // Log current state on each render
  useEffect(() => {
    console.log('[DIALOG-DEBUG] Current state:', {
      isDragging,
      hasBeenDragged,
      position,
      isOpen
    });
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      console.log('[DIALOG-DEBUG] Dialog onOpenChange:', open);
      if (!open) onClose();
    }} modal={false}>
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
            <Button type="button" variant="outline" onClick={() => {
              console.log('[DIALOG-DEBUG] Cancel button clicked');
              onClose();
            }}>
              Cancel
            </Button>
            <Button type="submit" onClick={() => console.log('[DIALOG-DEBUG] Submit button clicked')}>
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}