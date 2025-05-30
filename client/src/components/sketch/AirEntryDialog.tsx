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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
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
  // Nuevos campos para información del wall
  wallContext?: {
    wallId: string;
    floorName: string;
    wallStart: { x: number; y: number };
    wallEnd: { x: number; y: number };
    clickPosition: { x: number; y: number };
    ceilingHeight: number;
  };
  // Callback para actualización en tiempo real
  onPositionUpdate?: (newPosition: { x: number; y: number }) => void;

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
  const { type, isOpen: dialogOpen, onClose, isEditing = false } = props;
  
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
  
  // Estado para las coordenadas del elemento en el canvas
  const [elementPosition, setElementPosition] = useState({ x: 0, y: 0 });
  
  // Estado para la posición a lo largo del wall (0-100%)
  const [wallPosition, setWallPosition] = useState(50);
  

  
  // Estado para la distancia al suelo
  const [distanceToFloor, setDistanceToFloor] = useState(0);
  
  // Estados para condiciones de simulación
  const [isElementOpen, setIsElementOpen] = useState(true);
  const [elementTemperature, setElementTemperature] = useState(20);
  const [airDirection, setAirDirection] = useState<'inflow' | 'outflow'>('inflow');
  const [intensityLevel, setIntensityLevel] = useState<'high' | 'medium' | 'low' | 'custom'>('medium');
  const [customIntensity, setCustomIntensity] = useState(0.5);

  // Función para calcular la nueva posición basada en el porcentaje del wall
  const calculatePositionFromPercentage = (percentage: number) => {
    if (!('wallContext' in props) || !props.wallContext) return null;
    
    const { wallStart, wallEnd } = props.wallContext;
    
    // Obtener el ancho del elemento (solo para Air Entries)
    const elementWidth = props.type !== 'wall' ? (values as any).width || 50 : 50; // Default 50cm
    
    // Calcular la longitud total del wall
    const wallLength = Math.sqrt(
      Math.pow(wallEnd.x - wallStart.x, 2) + Math.pow(wallEnd.y - wallStart.y, 2)
    );
    
    // Convertir ancho del elemento de cm a pixels (asumiendo PIXELS_TO_CM = 1.25)
    const PIXELS_TO_CM = 1.25;
    const elementWidthPixels = elementWidth / PIXELS_TO_CM;
    const halfElementWidth = elementWidthPixels / 2;
    
    // Calcular la longitud efectiva disponible (wall length - element width)
    const effectiveLength = Math.max(0, wallLength - elementWidthPixels);
    
    // Calcular la posición real: desde halfElementWidth hasta (wallLength - halfElementWidth)
    const t = percentage / 100;
    const actualDistance = halfElementWidth + (effectiveLength * t);
    
    // Normalizar la distancia respecto a la longitud total del wall
    const normalizedT = actualDistance / wallLength;
    
    return {
      x: wallStart.x + (wallEnd.x - wallStart.x) * normalizedT,
      y: wallStart.y + (wallEnd.y - wallStart.y) * normalizedT
    };
  };

  // Función para manejar el cambio de posición a lo largo del wall
  const handleWallPositionChange = (newPercentage: number) => {
    setWallPosition(newPercentage);
    
    // Calcular la nueva posición y actualizar en tiempo real
    const newPosition = calculatePositionFromPercentage(newPercentage);
    if (newPosition && props.type !== 'wall' && 'onPositionUpdate' in props && props.onPositionUpdate) {
      props.onPositionUpdate(newPosition);
    }
  };

  // Función para calcular la posición inicial a lo largo del wall basada en el clic
  const calculateInitialWallPosition = () => {
    if (!('wallContext' in props)) return 50;
    
    const airEntryProps = props as AirEntryDialogProps;
    if (!airEntryProps.wallContext) return 50;
    
    const { wallStart, wallEnd, clickPosition } = airEntryProps.wallContext;
    
    // Obtener el ancho del elemento para los cálculos
    const elementWidth = (values as any).width || 50; // Default 50cm
    const PIXELS_TO_CM = 1.25;
    const elementWidthPixels = elementWidth / PIXELS_TO_CM;
    const halfElementWidth = elementWidthPixels / 2;
    
    const wallLength = Math.sqrt(
      Math.pow(wallEnd.x - wallStart.x, 2) + Math.pow(wallEnd.y - wallStart.y, 2)
    );
    
    const clickDistance = Math.sqrt(
      Math.pow(clickPosition.x - wallStart.x, 2) + Math.pow(clickPosition.y - wallStart.y, 2)
    );
    
    // Calcular la longitud efectiva disponible para el elemento
    const effectiveLength = Math.max(0, wallLength - elementWidthPixels);
    
    // Ajustar la distancia del clic para que esté dentro de los límites válidos
    const adjustedClickDistance = Math.max(halfElementWidth, Math.min(wallLength - halfElementWidth, clickDistance));
    
    // Convertir a porcentaje basado en la posición efectiva
    const effectiveDistance = adjustedClickDistance - halfElementWidth;
    const percentage = effectiveLength > 0 ? (effectiveDistance / effectiveLength) * 100 : 50;
    
    return Math.min(100, Math.max(0, percentage));
  };

  // Función para calcular la distancia inicial al suelo
  const calculateInitialDistanceToFloor = () => {
    if (!('wallContext' in props)) return 0;
    
    const airEntryProps = props as AirEntryDialogProps;
    if (!airEntryProps.wallContext) return 0;
    
    const ceilingHeight = airEntryProps.wallContext.ceilingHeight;
    
    // Para puertas, distancia = 0 (van al suelo)
    if (type === 'door') return 0;
    
    // Para ventanas y vents, distancia = mitad de altura del wall
    return ceilingHeight / 2;
  };

  // Función para obtener la temperatura inicial de la pared
  const getInitialWallTemperature = () => {
    // Para air entries, intentar obtener la temperatura de la pared asociada
    // Por ahora retornamos un valor por defecto, pero esto se puede mejorar
    // cuando tengamos acceso a los datos de las paredes
    return 20;
  };

  // Inicializar valores cuando se abre el diálogo
  useEffect(() => {
    if (dialogOpen) {
      if (isEditing) {
        // En modo edición, usar los valores actuales del elemento
        const airEntryProps = props as AirEntryDialogProps;
        if (airEntryProps.initialValues) {
          setDistanceToFloor(airEntryProps.initialValues.distanceToFloor || 0);
          // Para calcular la posición en el wall basada en la posición actual
          if (airEntryProps.wallContext) {
            const { wallStart, wallEnd, clickPosition } = airEntryProps.wallContext;
            const wallLength = Math.sqrt(
              Math.pow(wallEnd.x - wallStart.x, 2) + Math.pow(wallEnd.y - wallStart.y, 2)
            );
            const clickDistance = Math.sqrt(
              Math.pow(clickPosition.x - wallStart.x, 2) + Math.pow(clickPosition.y - wallStart.y, 2)
            );
            const percentage = Math.min(100, Math.max(0, (clickDistance / wallLength) * 100));
            setWallPosition(percentage);
          } else {
            setWallPosition(50); // Default center
          }
        }
      } else {
        // En modo creación, calcular valores iniciales
        const initialWallPos = calculateInitialWallPosition();
        const initialDistToFloor = calculateInitialDistanceToFloor();
        
        setWallPosition(initialWallPos);
        setDistanceToFloor(initialDistToFloor);
      }
      
      // Inicializar temperatura del elemento
      setElementTemperature(getInitialWallTemperature());
    }
  }, [dialogOpen, props.type, isEditing]);

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
    if (dialogOpen) {
      setValues(getDefaultValues());
    }
  }, [dialogOpen, type, props]);

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
    window: isEditing ? "Edit Window Element Properties" : "Window Element Properties",
    door: isEditing ? "Edit Door Element Properties" : "Door Element Properties",
    vent: isEditing ? "Edit Vent Element Properties" : "Vent Element Properties",
    wall: isEditing ? "Edit Wall Properties" : "Wall Properties"
  };

  const descriptions = {
    window: "",
    door: "",
    vent: "",
    wall: ""
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
    <Dialog open={dialogOpen} onOpenChange={onClose} modal={false}>
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
          <div className="space-y-6 py-4">
            {type === 'wall' ? (
              // Campos para propiedades de pared
              <div className="space-y-4">
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
              </div>
            ) : (
              // Nueva estructura con 3 secciones para entradas de aire
              <>
                {/* 1. POSITION SECTION */}
                <div className="border rounded-lg p-4 bg-slate-50/50">
                  <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">Position</h4>
                  
                  {/* Information subsection */}
                  <div className="mb-4">
                    <Label className="text-xs text-slate-600">Information</Label>
                    {(() => {
                      const airEntryProps = props as AirEntryDialogProps;
                      const wallContext = airEntryProps.wallContext;
                      
                      return wallContext ? (
                        <div className="p-2 bg-gray-100 rounded text-xs text-gray-600">
                          <div>Floor: {wallContext.floorName}</div>
                          <div>{type === 'window' ? 'Window' : type === 'door' ? 'Door' : 'Vent'} ID: {wallContext.wallId}</div>
                          {(() => {
                            // Calcular coordenadas del centro de la ventana
                            const { wallStart, wallEnd } = wallContext;
                            
                            // Obtener el ancho del elemento
                            const elementWidth = (values as any).width || 50; // Default 50cm
                            const PIXELS_TO_CM_CONVERSION = 25 / 20; // 1.25 - para convertir cm a pixels
                            const elementWidthPixels = elementWidth / PIXELS_TO_CM_CONVERSION;
                            const halfElementWidth = elementWidthPixels / 2;
                            
                            // Calcular la longitud del wall
                            const wallLength = Math.sqrt(
                              Math.pow(wallEnd.x - wallStart.x, 2) + Math.pow(wallEnd.y - wallStart.y, 2)
                            );
                            
                            // Calcular la longitud efectiva disponible para posicionamiento
                            const effectiveLength = Math.max(0, wallLength - elementWidthPixels);
                            
                            // Calcular posición del centro del elemento
                            let centerX, centerY;
                            if (effectiveLength > 0) {
                              const effectiveRatio = wallPosition / 100;
                              const effectiveDistance = effectiveRatio * effectiveLength;
                              const actualDistance = effectiveDistance + halfElementWidth;
                              const actualRatio = actualDistance / wallLength;
                              
                              centerX = wallStart.x + (wallEnd.x - wallStart.x) * actualRatio;
                              centerY = wallStart.y + (wallEnd.y - wallStart.y) * actualRatio;
                            } else {
                              // Si el elemento es más grande que el wall, centrar
                              centerX = (wallStart.x + wallEnd.x) / 2;
                              centerY = (wallStart.y + wallEnd.y) / 2;
                            }
                            
                            // Usar el mismo sistema de coordenadas que Canvas2D
                            const PIXELS_TO_CM = 25 / 20; // 1.25 - misma constante que Canvas2D
                            const CANVAS_CENTER_X = 400;
                            const CANVAS_CENTER_Y = 300;
                            
                            // Convertir a coordenadas normalizadas (igual que normalizeCoordinates)
                            const userX = ((centerX - CANVAS_CENTER_X) * PIXELS_TO_CM).toFixed(1);
                            const userY = (-(centerY - CANVAS_CENTER_Y) * PIXELS_TO_CM).toFixed(1);
                            
                            return (
                              <div className="text-gray-500">
                                Position: ({userX}, {userY}) cm
                              </div>
                            );
                          })()}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  
                  <div className="space-y-3">
                    {/* Distancia al suelo */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="distance-floor" className="text-xs text-slate-600">
                          Center Height
                        </Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={5}>
                              <p className="text-xs max-w-48">
                                Height from floor to the center of the element in the vertical axis of the space. Mounting height = Sill height + half element height.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="distance-floor"
                          type="number"
                          value={distanceToFloor}
                          onChange={(e) => setDistanceToFloor(Number(e.target.value))}
                          className="h-8 text-sm"
                          placeholder="0"
                        />
                        <span className="text-xs text-slate-500">cm</span>
                      </div>
                    </div>
                    
                    {/* Posición a lo largo del wall */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="wall-position" className="text-xs text-slate-600">
                          Position along Wall
                        </Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={5}>
                              <p className="text-xs max-w-48">
                                Horizontal position relative to the wall length of the element center. 0% = start of wall, 100% = end of wall.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="wall-position"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={parseFloat(wallPosition.toFixed(2))}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value)) {
                              // Permitir hasta 3 decimales en entrada, pero redondear a 2 decimales para almacenamiento
                              const roundedValue = Math.round(value * 100) / 100;
                              handleWallPositionChange(roundedValue);
                            }
                          }}
                          className="h-8 text-sm"
                          placeholder="50.00"
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        0% = start of wall, 100% = end of wall
                      </div>
                    </div>
                  </div>
                  

                </div>

                {/* 2. DIMENSIONS SECTION */}
                <div className="border rounded-lg p-4 bg-slate-50/50">
                  <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">Dimensions</h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="width" className="text-xs text-slate-600">Width</Label>
                        <div className="flex items-center space-x-2">
                          <Input
                            id="width"
                            type="number"
                            value={(values as { width: number }).width}
                            onChange={(e) => setValues(prev => ({ ...prev, width: Number(e.target.value) }))}
                            className="h-8 text-sm"
                          />
                          <span className="text-xs text-slate-500">cm</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="height" className="text-xs text-slate-600">Height</Label>
                        <div className="flex items-center space-x-2">
                          <Input
                            id="height"
                            type="number"
                            value={(values as { height: number }).height}
                            onChange={(e) => setValues(prev => ({ ...prev, height: Number(e.target.value) }))}
                            className="h-8 text-sm"
                          />
                          <span className="text-xs text-slate-500">cm</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. SIMULATION CONDITIONS SECTION */}
                <div className="border rounded-lg p-4 bg-slate-50/50">
                  <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">Simulation Conditions</h4>
                  <div className="space-y-4">
                    
                    {/* Estado del elemento: Abierto/Cerrado */}
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium text-slate-700">Element Status</Label>
                        <p className="text-xs text-slate-500">
                          {isElementOpen ? 'Element is open and allows airflow' : 'Element is closed, no airflow'}
                        </p>
                      </div>
                      <Switch
                        checked={isElementOpen}
                        onCheckedChange={setIsElementOpen}
                        className="ml-4"
                      />
                    </div>

                    {/* Temperatura del elemento */}
                    <div className="space-y-2">
                      <Label htmlFor="element-temperature" className="text-xs text-slate-600">
                        Element Temperature
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="element-temperature"
                          type="number"
                          step="0.1"
                          value={elementTemperature}
                          onChange={(e) => setElementTemperature(Number(e.target.value))}
                          className="h-8 text-sm"
                          placeholder="20.0"
                        />
                        <span className="text-xs text-slate-500">°C</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Temperature at the element interface
                      </p>
                    </div>

                    {/* Campos condicionales que aparecen solo cuando está abierto */}
                    {isElementOpen && (
                      <div className="space-y-4 border-t pt-4">
                        {/* Dirección del flujo de aire */}
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-600">Air Direction</Label>
                          <Select value={airDirection} onValueChange={(value: 'inflow' | 'outflow') => setAirDirection(value)}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select direction" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inflow">
                                <div className="flex items-center space-x-2">
                                  <div className="flex items-center space-x-0.5">
                                    <span className="text-green-600 text-lg font-bold">→</span>
                                    <span style={{ fontSize: '12px', filter: 'grayscale(100%)' }}>🏠</span>
                                  </div>
                                  <span>Inflow (Air enters)</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="outflow">
                                <div className="flex items-center space-x-2">
                                  <div className="flex items-center space-x-0.5">
                                    <span style={{ fontSize: '12px', filter: 'grayscale(100%)' }}>🏠</span>
                                    <span className="text-red-600 text-lg font-bold">→</span>
                                  </div>
                                  <span>Outflow (Air exits)</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Intensidad del flujo */}
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-600">Flow Intensity</Label>
                          <Select value={intensityLevel} onValueChange={(value: 'high' | 'medium' | 'low' | 'custom') => setIntensityLevel(value)}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select intensity" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="high">
                                <div className="flex items-center justify-between w-full">
                                  <span>High</span>
                                  <span className="text-xs text-gray-500 ml-2">ΔP: 25 Pa, 5-10+ m/s</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="medium">
                                <div className="flex items-center justify-between w-full">
                                  <span>Medium</span>
                                  <span className="text-xs text-gray-500 ml-2">ΔP: 5 Pa, 2-5 m/s</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="low">
                                <div className="flex items-center justify-between w-full">
                                  <span>Low</span>
                                  <span className="text-xs text-gray-500 ml-2">ΔP: 0.3 Pa, 0.5-1 m/s</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="custom">
                                <span>Custom</span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          
                          {/* Campo personalizado que aparece solo cuando se selecciona Custom */}
                          {intensityLevel === 'custom' && (
                            <div className="flex items-center space-x-2 mt-2">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                value={customIntensity}
                                onChange={(e) => setCustomIntensity(Number(e.target.value))}
                                className="h-8 text-sm"
                                placeholder="0.5"
                              />
                              <span className="text-xs text-slate-500">m³/s</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button type="submit" className="w-full">
              {isEditing ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}