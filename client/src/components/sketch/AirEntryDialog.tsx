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
import { useRoomStore } from "@/lib/store/room-store";

// Props para entrada de aire (compatibilidad hacia atrás)
interface AirEntryDialogProps {
  type: 'window' | 'door' | 'vent';
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    width: number;
    height: number;
    distanceToFloor?: number;
    shape?: 'rectangular' | 'circular';
    properties?: {
      state?: 'open' | 'closed';
      temperature?: number;
      flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
      flowValue?: number;
      flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
      airOrientation?: 'inflow' | 'outflow';
      customIntensityValue?: number;
    };
  }) => void;
  isEditing?: boolean;
  initialValues?: {
    width: number;
    height: number;
    distanceToFloor?: number;
    shape?: 'rectangular' | 'circular';
    properties?: {
      state?: 'open' | 'closed';
      temperature?: number;
      flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
      flowValue?: number;
      flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
      airOrientation?: 'inflow' | 'outflow';
      customIntensityValue?: number;
    };
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
  // Campos necesarios para persistir propiedades
  airEntryIndex?: number;
  currentFloor?: string;
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
  const { updateAirEntryProperties, floors } = useRoomStore();
  
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
  
  // Estado para el tipo de forma (rectangular/circular)
  const [shapeType, setShapeType] = useState<'rectangular' | 'circular'>('rectangular');
  

  
  // Estado para la distancia al suelo
  const [distanceToFloor, setDistanceToFloor] = useState(0);
  
  // Estados para condiciones de simulación
  const [isElementOpen, setIsElementOpen] = useState(true);
  const [elementTemperature, setElementTemperature] = useState(20);
  const [airDirection, setAirDirection] = useState<'inflow' | 'outflow'>('inflow');
  const [intensityLevel, setIntensityLevel] = useState<'high' | 'medium' | 'low' | 'custom'>('medium');
  const [customIntensity, setCustomIntensity] = useState(0.5);
  
  // Estados específicos para vents
  const [ventMeasurementType, setVentMeasurementType] = useState<'massflow' | 'velocity' | 'pressure'>('massflow');
  const [verticalAngle, setVerticalAngle] = useState(0);
  const [horizontalAngle, setHorizontalAngle] = useState(0);

  // Función para calcular la nueva posición basada en el porcentaje del wall
  const calculatePositionFromPercentage = (percentage: number) => {
    if (!('wallContext' in props) || !props.wallContext) return null;
    
    const { wallStart, wallEnd } = props.wallContext;
    
    // Obtener el ancho del elemento (solo para Air Entries)
    const elementWidth = props.type === 'window' || props.type === 'door' || props.type === 'vent' ? (values as any).width || 50 : 50; // Default 50cm
    
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
    
    // Para puertas, distancia = altura de la puerta / 2 (centro de la puerta)
    if (type === 'door') {
      const doorHeight = (values as any).height || 200; // Default 200cm
      return Math.round((doorHeight / 2) * 100) / 100;
    }
    
    // Para ventanas y vents, distancia = mitad de altura del wall, redondeado a 2 decimales
    return Math.round((ceilingHeight / 2) * 100) / 100;
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

  // Actualizar automáticamente Center Height para puertas cuando cambie la altura
  useEffect(() => {
    if (type === 'door' && (values as any).height !== undefined) {
      const doorHeight = (values as any).height;
      const newCenterHeight = Math.round((doorHeight / 2) * 100) / 100;
      setDistanceToFloor(newCenterHeight);
    }
  }, [(values as any).height, type]);

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
      
      // Load saved simulation properties when editing
      if (isEditing && props.type !== 'wall' && 'initialValues' in props && props.initialValues?.properties) {
        const savedProps = props.initialValues.properties;
        
        // Load shape
        if (props.initialValues.shape) {
          setShapeType(props.initialValues.shape);
        }
        
        // Load common properties
        if (savedProps.state !== undefined) {
          setIsElementOpen(savedProps.state === 'open');
        }
        if (savedProps.temperature !== undefined) {
          setElementTemperature(savedProps.temperature);
        }
        
        // Load flow properties for all types
        if (savedProps.flowIntensity) {
          setIntensityLevel(savedProps.flowIntensity);
        }
        if (savedProps.airOrientation) {
          setAirDirection(savedProps.airOrientation);
        }
        
        // Load custom intensity value for all element types
        if ((savedProps as any).customIntensityValue !== undefined) {
          setCustomIntensity((savedProps as any).customIntensityValue);
        }
        
        // Load vent-specific properties
        if (props.type === 'vent') {
          if (savedProps.flowType) {
            // Map stored values to dialog internal values
            const flowTypeMapping: Record<string, 'massflow' | 'velocity' | 'pressure'> = {
              'Air Mass Flow': 'massflow',
              'Air Velocity': 'velocity', 
              'Pressure': 'pressure'
            };
            setVentMeasurementType(flowTypeMapping[savedProps.flowType] || 'massflow');
          }
          // For vents, also check flowValue as fallback
          if (savedProps.flowValue !== undefined && savedProps.customIntensityValue === undefined) {
            setCustomIntensity(savedProps.flowValue);
          }
        }
      }
    }
  }, [dialogOpen, type, isEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (props.type === 'wall') {
      props.onConfirm((values as { temperature: number }).temperature);
    } else {
      // Collect all air entry data for JSON structure
      const airEntryData = {
        // Basic dimensions
        width: shapeType === 'rectangular' ? (values as any).width : null,
        height: shapeType === 'rectangular' ? (values as any).height : null,
        diameter: shapeType === 'circular' ? (values as any).width : null,
        distanceToFloor: distanceToFloor,
        
        // Extended properties for JSON
        shape: shapeType,
        isOpen: isElementOpen,
        temperature: elementTemperature,
        airDirection: airDirection,
        flowIntensity: intensityLevel,
        customIntensityValue: intensityLevel === 'custom' ? customIntensity : null,
        ventFlowType: type === 'vent' ? ventMeasurementType : null,
        airOrientation: (type === 'vent' && isElementOpen && airDirection === 'inflow') ? {
          verticalAngle: verticalAngle,
          horizontalAngle: horizontalAngle
        } : null,
        
        // Position data will be calculated by parent component
        wallPosition: wallPosition
      };
      
      // Persist simulation properties in the store if we have the necessary info
      if ((props.type === 'window' || props.type === 'door' || props.type === 'vent') && 'airEntryIndex' in props && props.airEntryIndex !== undefined && props.currentFloor) {
        const simulationProperties: any = {};
        
        // Properties for windows and doors
        if (props.type === 'window' || props.type === 'door') {
          simulationProperties.state = isElementOpen ? 'open' : 'closed';
          simulationProperties.temperature = elementTemperature;
        }
        
        // Properties for vents  
        if (props.type === 'vent') {
          simulationProperties.flowType = ventMeasurementType;
          simulationProperties.flowValue = customIntensity;
          simulationProperties.flowIntensity = intensityLevel === 'custom' ? 'medium' : intensityLevel;
          simulationProperties.airOrientation = airDirection;
        }
        
        // Store the properties
        updateAirEntryProperties(props.currentFloor, props.airEntryIndex, simulationProperties);
      }
      
      // Transform data to match Canvas2D expectations
      const canvasData = {
        width: shapeType === 'rectangular' ? (values as any).width : (values as any).width, // For circular, width = diameter
        height: shapeType === 'rectangular' ? (values as any).height : (values as any).width, // For circular, height = diameter
        distanceToFloor: distanceToFloor,
        shape: shapeType,
        properties: {
          state: (isElementOpen ? 'open' : 'closed') as 'open' | 'closed',
          temperature: elementTemperature,
          flowIntensity: intensityLevel as 'low' | 'medium' | 'high' | 'custom',
          airOrientation: airDirection as 'inflow' | 'outflow',
          ...(intensityLevel === 'custom' && {
            customIntensityValue: customIntensity,
          }),
          ...(type === 'vent' && {
            flowType: (ventMeasurementType === 'massflow' ? 'Air Mass Flow' : ventMeasurementType === 'velocity' ? 'Air Velocity' : 'Pressure') as 'Air Mass Flow' | 'Air Velocity' | 'Pressure',
            flowValue: customIntensity,
          })
        }
      };
      
      props.onConfirm(canvasData);
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
          <div className="space-y-6 py-4 max-h-[70vh] overflow-y-auto pr-2">
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
                          <div>{type === 'window' ? 'Window' : type === 'door' ? 'Door' : 'Vent'} ID: {(() => {
                            // Usar el ID real del elemento si existe
                            if (!airEntryProps.currentFloor) return `${type}_1`;
                            
                            // Obtener todas las air entries del piso actual
                            const currentFloorData = floors[airEntryProps.currentFloor];
                            if (!currentFloorData) return `${type}_1`;
                            
                            // Obtener el elemento actual
                            const currentEntry = currentFloorData.airEntries[airEntryProps.airEntryIndex || 0];
                            const entryWithId = currentEntry as any;
                            
                            // Si el elemento tiene ID, usarlo; si no, calcularlo
                            if (entryWithId?.id) {
                              return entryWithId.id;
                            } else {
                              // Fallback: calcular índice por tipo
                              let typeCount = 0;
                              for (let i = 0; i <= (airEntryProps.airEntryIndex || 0); i++) {
                                if (currentFloorData.airEntries[i]?.type === type) {
                                  typeCount++;
                                }
                              }
                              return `${type}_${typeCount}`;
                            }
                          })()}</div>
                          <div>Wall ID: {wallContext.wallId}</div>
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
                                {type === 'door' 
                                  ? "For doors, center height is automatically calculated as half the door height."
                                  : "Height from floor to the center of the element in the vertical axis of the space. Mounting height = Sill height + half element height."
                                }
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="distance-floor"
                          type="number"
                          step="0.01"
                          value={distanceToFloor}
                          onChange={(e) => {
                            if (type !== 'door') {
                              const value = Number(e.target.value);
                              // Redondear a 2 decimales máximo
                              const rounded = Math.round(value * 100) / 100;
                              setDistanceToFloor(rounded);
                            }
                          }}
                          className={`h-8 text-sm ${type === 'door' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                          placeholder="0"
                          disabled={type === 'door'}
                          readOnly={type === 'door'}
                        />
                        <span className="text-xs text-slate-500">cm</span>
                      </div>
                      {type === 'door' && (
                        <p className="text-xs text-gray-500 mt-1">
                          Half of the door height
                        </p>
                      )}
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
                                Horizontal position of the element center relative to the wall total length. 0% = start of wall, 100% = end of wall.
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
                          step="0.01"
                          value={parseFloat(wallPosition.toFixed(2))}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value)) {
                              // Permitir hasta 2 decimales
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
                  
                  {/* Shape selector - only for windows and vents, not doors */}
                  {type !== 'door' && (
                    <div className="mb-4">
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-600">Shape:</span>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="shape"
                              value="rectangular"
                              checked={shapeType === 'rectangular'}
                              onChange={() => setShapeType('rectangular')}
                              className="text-blue-600"
                            />
                            <span className="text-xs text-slate-600">Rectangular</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="shape"
                              value="circular"
                              checked={shapeType === 'circular'}
                              onChange={() => setShapeType('circular')}
                              className="text-blue-600"
                            />
                            <span className="text-xs text-slate-600">Circular</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    {/* Rectangular dimensions */}
                    {(type === 'door' || shapeType === 'rectangular') && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="width" className="text-xs text-slate-600">Width</Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={5}>
                                  <p className="text-xs max-w-48">
                                    Width of the element's open area for airflow calculations. If the element is partially open, enter the effective width.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
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
                          <div className="flex items-center gap-2">
                            <Label htmlFor="height" className="text-xs text-slate-600">Height</Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={5}>
                                  <p className="text-xs max-w-48">
                                    Height of the element's open area for airflow calculations. If the element is partially open, enter the effective height.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
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
                    )}
                    
                    {/* Circular dimensions */}
                    {type !== 'door' && shapeType === 'circular' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="diameter" className="text-xs text-slate-600">Diameter</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="right" sideOffset={5}>
                                <p className="text-xs max-w-48">
                                  Diameter of the element's open area for airflow calculations. If the element is partially open, enter the effective diameter.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Input
                            id="diameter"
                            type="number"
                            value={(values as { width: number }).width}
                            onChange={(e) => {
                              const diameter = Number(e.target.value);
                              setValues(prev => ({
                                ...prev,
                                width: diameter,
                                height: diameter // Set height equal to width for circular elements
                              }));
                            }}
                            className="h-8 text-sm"
                          />
                          <span className="text-xs text-slate-500">cm</span>
                        </div>
                      </div>
                    )}
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
                          {isElementOpen 
                            ? `${type === 'window' ? 'Window' : type === 'door' ? 'Door' : 'Vent'} is open and allows airflow` 
                            : `${type === 'window' ? 'Window' : type === 'door' ? 'Door' : 'Vent'} is closed, no airflow`
                          }
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
                      <div className="flex items-center space-x-1">
                        <Label htmlFor="element-temperature" className="text-xs text-slate-600">
                          {isElementOpen 
                            ? "Air Inflow Temperature"
                            : `${type === 'window' ? 'Window' : type === 'door' ? 'Door' : 'Vent'} Temperature`
                          }
                        </Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={5}>
                              <p className="text-xs max-w-48">
                                {isElementOpen
                                  ? "Valid for both inflow and backflow entering the interior domain. This temperature affects the comfort and energy balance when air passes through the opening."
                                  : "Surface temperature used to calculate heat transfer to the interior domain. This affects comfort through temperature gain or loss through the closed element."
                                }
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
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
                        {isElementOpen 
                          ? "Temperature of air entering the room"
                          : `Temperature on the ${type === 'window' ? 'window' : type === 'door' ? 'door' : 'vent'} surface`
                        }
                      </p>
                    </div>

                    {/* Campos condicionales que aparecen solo cuando está abierto */}
                    {isElementOpen && (
                      <div className="space-y-4 border-t pt-4">
                        {/* Dirección del flujo de aire */}
                        <div className="space-y-2">
                          <div className="flex items-center space-x-1">
                            <Label className="text-xs text-slate-600">Air Direction</Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={5}>
                                  <p className="text-xs max-w-48">
                                    Set whether air enters or exits through this element. For proper airflow simulation, you need at least one inflow and one outflow element to create continuous air circulation.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
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

                        {/* Air Orientation - Solo para vents con inflow */}
                        {type === 'vent' && isElementOpen && airDirection === 'inflow' && (
                          <div className="space-y-2 border-t pt-4">
                            <Label className="text-xs text-slate-600">Air Orientation</Label>
                            
                            {/* Vertical Angle */}
                            <div className="space-y-2">
                              <div className="flex items-center space-x-1">
                                <Label htmlFor="vertical-angle" className="text-xs text-slate-600">
                                  Vertical Angle
                                </Label>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" sideOffset={5}>
                                      <p className="text-xs max-w-48">
                                        Vertical airflow direction: positive values for upward flow (+45°), negative for downward flow (-45°).
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Input
                                  id="vertical-angle"
                                  type="number"
                                  min="-45"
                                  max="45"
                                  step="1"
                                  value={verticalAngle}
                                  onChange={(e) => setVerticalAngle(Number(e.target.value))}
                                  className="h-8 text-sm"
                                  placeholder="0"
                                />
                                <span className="text-xs text-slate-500">degrees</span>
                              </div>
                              <p className="text-xs text-gray-500">
                                Up +45° to Down -45°
                              </p>
                            </div>

                            {/* Horizontal Angle */}
                            <div className="space-y-2">
                              <div className="flex items-center space-x-1">
                                <Label htmlFor="horizontal-angle" className="text-xs text-slate-600">
                                  Horizontal Angle
                                </Label>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" sideOffset={5}>
                                      <p className="text-xs max-w-48">
                                        Horizontal airflow direction: negative values for left flow (-45°), positive for right flow (+45°).
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Input
                                  id="horizontal-angle"
                                  type="number"
                                  min="-45"
                                  max="45"
                                  step="1"
                                  value={horizontalAngle}
                                  onChange={(e) => setHorizontalAngle(Number(e.target.value))}
                                  className="h-8 text-sm"
                                  placeholder="0"
                                />
                                <span className="text-xs text-slate-500">degrees</span>
                              </div>
                              <p className="text-xs text-gray-500">
                                Left -45° to Right +45°
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Tipo de flujo para vents */}
                        {type === 'vent' && (
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-600">Flow Type</Label>
                            <div className="flex space-x-4">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="massflow"
                                  name="ventMeasurementType"
                                  value="massflow"
                                  checked={ventMeasurementType === 'massflow'}
                                  onChange={(e) => setVentMeasurementType(e.target.value as 'massflow' | 'velocity' | 'pressure')}
                                  className="w-4 h-4 text-blue-600"
                                />
                                <Label htmlFor="massflow" className="text-xs">Mass Flow</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="velocity"
                                  name="ventMeasurementType"
                                  value="velocity"
                                  checked={ventMeasurementType === 'velocity'}
                                  onChange={(e) => setVentMeasurementType(e.target.value as 'massflow' | 'velocity' | 'pressure')}
                                  className="w-4 h-4 text-blue-600"
                                />
                                <Label htmlFor="velocity" className="text-xs">Velocity</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="pressure"
                                  name="ventMeasurementType"
                                  value="pressure"
                                  checked={ventMeasurementType === 'pressure'}
                                  onChange={(e) => setVentMeasurementType(e.target.value as 'massflow' | 'velocity' | 'pressure')}
                                  className="w-4 h-4 text-blue-600"
                                />
                                <Label htmlFor="pressure" className="text-xs">Pressure</Label>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Intensidad del flujo */}
                        <div className="space-y-2">
                          <div className="flex items-center space-x-1">
                            <Label className="text-xs text-slate-600">Flow Intensity</Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={5}>
                                  <p className="text-xs max-w-48">
                                    {type === 'vent' 
                                      ? "Low, Medium, and High provide general airflow values. For accurate results, use Custom with manufacturer specifications from device (pump, air conditioner, fans, etc.) documentation."
                                      : "Use Low for typical conditions. Medium, High, and Custom options are available for specific flow studies and detailed analysis."
                                    }
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <Select value={intensityLevel} onValueChange={(value: 'high' | 'medium' | 'low' | 'custom') => setIntensityLevel(value)}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select intensity" />
                            </SelectTrigger>
                            <SelectContent>
                              {type === 'vent' ? (
                                // Opciones específicas para vents basadas en el tipo de medición
                                <>
                                  {ventMeasurementType === 'massflow' && (
                                    <>
                                      <SelectItem value="high">
                                        <div className="flex items-center justify-between w-full">
                                          <span>High</span>
                                          <span className="text-xs text-gray-500 ml-2">400 m³/h</span>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="medium">
                                        <div className="flex items-center justify-between w-full">
                                          <span>Medium</span>
                                          <span className="text-xs text-gray-500 ml-2">250 m³/h</span>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="low">
                                        <div className="flex items-center justify-between w-full">
                                          <span>Low</span>
                                          <span className="text-xs text-gray-500 ml-2">150 m³/h</span>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="custom">
                                        <span>Custom m³/h</span>
                                      </SelectItem>
                                    </>
                                  )}
                                  {ventMeasurementType === 'velocity' && (
                                    <>
                                      <SelectItem value="high">
                                        <div className="flex items-center justify-between w-full">
                                          <span>High</span>
                                          <span className="text-xs text-gray-500 ml-2">5 m/s</span>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="medium">
                                        <div className="flex items-center justify-between w-full">
                                          <span>Medium</span>
                                          <span className="text-xs text-gray-500 ml-2">2.5 m/s</span>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="low">
                                        <div className="flex items-center justify-between w-full">
                                          <span>Low</span>
                                          <span className="text-xs text-gray-500 ml-2">1 m/s</span>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="custom">
                                        <span>Custom m/s</span>
                                      </SelectItem>
                                    </>
                                  )}
                                  {ventMeasurementType === 'pressure' && (
                                    <>
                                      <SelectItem value="high">
                                        <div className="flex items-center justify-between w-full">
                                          <span>High</span>
                                          <span className="text-xs text-gray-500 ml-2">25 Pa</span>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="medium">
                                        <div className="flex items-center justify-between w-full">
                                          <span>Medium</span>
                                          <span className="text-xs text-gray-500 ml-2">5 Pa</span>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="low">
                                        <div className="flex items-center justify-between w-full">
                                          <span>Low</span>
                                          <span className="text-xs text-gray-500 ml-2">0.5 Pa</span>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="custom">
                                        <span>Custom Pa</span>
                                      </SelectItem>
                                    </>
                                  )}
                                </>
                              ) : (
                                // Opciones originales para windows y doors
                                <>
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
                                </>
                              )}
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
                              <span className="text-xs text-slate-500">
                                {type === 'vent' 
                                  ? ventMeasurementType === 'massflow' 
                                    ? 'm³/h' 
                                    : ventMeasurementType === 'velocity' 
                                      ? 'm/s' 
                                      : 'Pa'
                                  : 'm³/s'
                                }
                              </span>
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