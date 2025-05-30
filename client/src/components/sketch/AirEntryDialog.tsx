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

// Props para entrada de aire (compatibilidad hacia atrás)
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

// Props para propiedades de pared
interface WallPropertiesDialogProps {
  type: 'wall';
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (temperature: number) => void;
  isEditing?: boolean;
  initialValues?: {
    temperature: number;
  };
}

// Tipo unión para ambos casos
type PropertyDialogProps = AirEntryDialogProps | WallPropertiesDialogProps;

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

const wallDefaults = {
  temperature: 20
};

export default function AirEntryDialog(props: PropertyDialogProps) {
  const { type, isOpen, onClose, isEditing = false } = props;
  
  // Estado unificado para manejar tanto dimensiones como temperatura
  const [values, setValues] = useState(getDefaultValues());
  const [position, setPosition] = useState(() => {
    // Calcular posición inicial centrada horizontalmente en la parte superior
    const dialogWidth = 425;
    const centerX = typeof window !== 'undefined' ? (window.innerWidth - dialogWidth) / 2 : 0;
    return { x: centerX, y: 40 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [hasBeenDragged, setHasBeenDragged] = useState(true); // Activar desde el inicio
  const draggingRef = useRef(false);
  

  function getDefaultValues() {
    // Obtener valores iniciales según el tipo de props
    const initialValues = props.type === 'wall' 
      ? props.initialValues 
      : props.initialValues;

    if (initialValues) return initialValues;

    switch (type) {
      case 'window':
        return { ...windowDefaults };
      case 'door':
        return { ...doorDefaults };
      case 'vent':
        return { ...ventDefaults };
      case 'wall':
        return { ...wallDefaults };
      default:
        return { ...windowDefaults };
    }
  }

  // Reset values when dialog opens with new type or initialValues
  useEffect(() => {
    if (isOpen) {
      setValues(getDefaultValues());
    }
  }, [isOpen, type, props]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (props.type === 'wall') {
      props.onConfirm((values as { temperature: number }).temperature);
    } else {
      props.onConfirm(values as { width: number; height: number; distanceToFloor?: number });
    }
    onClose();
  };

  const titles = {
    window: isEditing ? "Edit Window" : "Window Dimensions",
    door: isEditing ? "Edit Door" : "Door Dimensions",
    vent: isEditing ? "Edit Vent" : "Vent Grid Dimensions",
    wall: isEditing ? "Edit Wall Properties" : "Wall Properties"
  };

  const descriptions = {
    window: isEditing ? "Modify the dimensions for this window" : "Set the dimensions for the window",
    door: isEditing ? "Modify the dimensions for this door" : "Set the dimensions for the door",
    vent: isEditing ? "Modify the dimensions for this vent" : "Set the dimensions for the ventilation grid",
    wall: isEditing ? "Modify the temperature for this wall" : "Set the temperature for the wall"
  };

  // Handle dragging start
  // FIND THIS SECTION in AirEntryDialog.tsx - The handleDragStart function

  const handleDragStart = (e: React.MouseEvent) => {
    // Only allow dragging from header
    const header = (e.target as Element).closest('[data-drag-handle]');

    if (!header) {
      return;
    }

    // Prevent text selection during drag
    e.preventDefault();

    // Get the dialog element (directly from current target)
    const dialogElement = (e.currentTarget as HTMLElement);
    if (!dialogElement) {
      return;
    }

    const dialogRect = dialogElement.getBoundingClientRect();

    // Calculate mouse offset from dialog's top-left corner
    const offsetX = e.clientX - dialogRect.left;
    const offsetY = e.clientY - dialogRect.top;

    // If this is the first drag, initialize position
    if (!hasBeenDragged) {
      setPosition({ x: dialogRect.left, y: dialogRect.top });
    }

    // Start tracking the drag
    draggingRef.current = true;
    setIsDragging(true);

    // Function to handle mouse movement during drag
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current) return;

      // Calculate new position
      const newX = moveEvent.clientX - offsetX;
      const newY = moveEvent.clientY - offsetY;

      // Use requestAnimationFrame for smoother animation
      requestAnimationFrame(() => {
        setPosition({ x: newX, y: newY });
        setHasBeenDragged(true);
      });
    };

    // Function to handle the end of dragging
    const handleMouseUp = () => {
      draggingRef.current = false;
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // Add global event listeners
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
            {type === 'wall' ? (
              // Campos para propiedades de pared
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="temperature" className="text-right">
                  Temperature
                </Label>
                <Input
                  id="temperature"
                  type="number"
                  value={(values as { temperature: number }).temperature}
                  onChange={(e) => setValues(prev => ({ ...prev, temperature: Number(e.target.value) }))}
                  className="col-span-3"
                />
                <span className="text-sm">°C</span>
              </div>
            ) : (
              // Campos existentes para entradas de aire
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="width" className="text-right">
                    Width
                  </Label>
                  <Input
                    id="width"
                    type="number"
                    value={(values as { width: number }).width}
                    onChange={(e) => setValues(prev => ({ ...prev, width: Number(e.target.value) }))}
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
                    value={(values as { height: number }).height}
                    onChange={(e) => setValues(prev => ({ ...prev, height: Number(e.target.value) }))}
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
                      value={(values as { distanceToFloor?: number }).distanceToFloor || 0}
                      onChange={(e) => setValues(prev => ({ ...prev, distanceToFloor: Number(e.target.value) }))}
                      className="col-span-3"
                    />
                    <span className="text-sm">cm</span>
                  </div>
                )}
              </>
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