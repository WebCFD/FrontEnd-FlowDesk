import type { ReactNode } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRoomStore } from "@/lib/store/room-store";

// Props para entrada de aire (compatibilidad hacia atrás)
interface AirEntryDialogProps {
  type: 'window' | 'door' | 'vent';
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void; // Optional separate handler for X button
  isCreating?: boolean; // Indicates if this is creating a new element vs editing existing
  mode?: 'airEntry' | 'furnVent'; // New: Mode to distinguish between 2D air entries and 3D furniture vents
  onConfirm: (data: {
    width: number;
    height: number;
    distanceToFloor?: number;
    shape?: 'rectangular' | 'circular';
    properties?: {
      state?: 'open' | 'closed';
      temperature?: number;
      material?: string;
      emissivity?: number;
      flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
      flowValue?: number;
      flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
      airOrientation?: 'inflow' | 'outflow' | 'equilibrium' | 'closed';
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
      material?: string;
      emissivity?: number;
      flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
      flowValue?: number;
      flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
      airOrientation?: 'inflow' | 'outflow' | 'equilibrium' | 'closed';
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
  onPositionUpdate?: (newPosition: { x: number; y: number }) => void | ((newPosition: { x: number; y: number; z: number }) => void);
  onRotationUpdate?: (newRotation: { x: number; y: number; z: number }) => void;
  onDimensionsUpdate?: (newDimensions: { width?: number; height?: number; distanceToFloor?: number }) => void;
  onPropertiesUpdate?: (properties: {
    state?: 'open' | 'closed';
    temperature?: number;
    material?: string;
    emissivity?: number;
    airOrientation?: 'inflow' | 'outflow' | 'equilibrium' | 'closed';
    flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
    flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
    customIntensityValue?: number;
    verticalAngle?: number;
    horizontalAngle?: number;
    ventRotation?: number;
  }) => void;
  // 3D specific props for furnVent mode
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  floorContext?: {
    floorName: string;
    floorHeight: number;
    clickPosition: { x: number; y: number; z: number };
  };
  // Campos necesarios para persistir propiedades
  airEntryIndex?: number;
  currentFloor?: string;
  // Phase 3: Dialog positioning
  dialogPosition?: { x: number; y: number };
  // Optional custom title override (e.g. "Vent Top Box" for topVentBox furniture)
  dialogTitle?: string;
  // Optional extra content rendered at the top of the form (before vent simulation sections)
  topSectionContent?: ReactNode;
  // Hide the Dimensions section (shape/width/height/rotation) — e.g. for topVentBox which handles dims separately
  hideDimensionsSection?: boolean;
}

// Props para propiedades de pared
interface WallPropertiesDialogProps {
  type: 'wall';
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (temperature: number, material: string, emissivity: number) => void;
  isEditing?: boolean;
  initialValues?: {
    temperature: number;
    material?: string;
    emissivity?: number;
  };
}

// Tipo unión para ambos casos
type PropertyDialogProps = AirEntryDialogProps | WallPropertiesDialogProps;

const windowDefaults = {
  width: 120,
  height: 120,
  distanceToFloor: 150
};

const doorDefaults = {
  width: 72.5,
  height: 203
};

const ventDefaults = {
  width: 50,
  height: 50,
  distanceToFloor: 120
};

const wallDefaults = {
  temperature: 20,
  material: 'default',
  emissivity: 0.90
};

// Material definitions for closed elements (solid surfaces)
const closedMaterialDefinitions = {
  default: { name: "Default", emissivity: 0.90 },
  wood: { name: "Wood", emissivity: 0.90 },
  metal: { name: "Metal (Steel)", emissivity: 0.25 },
  glass: { name: "Glass", emissivity: 0.92 },
  fabric: { name: "Fabric/Textile", emissivity: 0.90 },
  plastic: { name: "Plastic", emissivity: 0.90 },
  ceramic: { name: "Ceramic/Tile", emissivity: 0.90 },
  concrete: { name: "Concrete", emissivity: 0.90 },
  custom: { name: "Custom", emissivity: 0.90 }
};

// Material definitions for open elements (air/gas flow - very low emissivity)
const openMaterialDefinitions = {
  air: { name: "Air (Standard)", emissivity: 0.05 },
  air_humid: { name: "Air (Humid)", emissivity: 0.08 },
  air_hot: { name: "Hot Air", emissivity: 0.10 },
  custom: { name: "Custom", emissivity: 0.05 }
};

// Legacy alias for compatibility
const wallMaterialDefinitions = closedMaterialDefinitions;

export default function AirEntryDialog(props: PropertyDialogProps) {
  const { type, isOpen: dialogOpen, onClose, isEditing = false } = props;
  const onCancel = 'onCancel' in props ? props.onCancel : undefined;
  const isCreating = 'isCreating' in props ? props.isCreating : false;
  const mode = (props as AirEntryDialogProps).mode || 'airEntry'; // Default to airEntry for backward compatibility
  const { updateAirEntryProperties, floors } = useRoomStore();
  
  // Estado unificado para manejar tanto dimensiones como temperatura
  const [values, setValues] = useState(getDefaultValues());
  const [position, setPosition] = useState(() => {
    // Use provided position or calculate default
    if (props.type !== 'wall' && 'dialogPosition' in props && props.dialogPosition) {
      return props.dialogPosition;
    }
    // Default position calculation
    const dialogWidth = 425;
    const rightOffset = 20;
    const topOffset = 40;
    const rightX = typeof window !== 'undefined' ? (window.innerWidth - dialogWidth - rightOffset) : 0;
    return { x: rightX, y: topOffset };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [hasBeenDragged, setHasBeenDragged] = useState(true); // Activar desde el inicio
  const draggingRef = useRef(false);
  
  // Estado para las coordenadas del elemento en el canvas
  const [elementPosition, setElementPosition] = useState({ x: 0, y: 0 });
  
  // Estado para las coordenadas 3D del elemento (para modo furnVent)
  const [element3DPosition, setElement3DPosition] = useState(() => {
    if (mode === 'furnVent' && (props as AirEntryDialogProps).position) {
      return (props as AirEntryDialogProps).position!;
    }
    return { x: 0, y: 0, z: 0 };
  });
  
  const [element3DRotation, setElement3DRotation] = useState(() => {
    if (mode === 'furnVent' && (props as AirEntryDialogProps).rotation) {
      return (props as AirEntryDialogProps).rotation!;
    }
    return { x: 0, y: 0, z: 0 };
  });
  
  // Estado para la posición a lo largo del wall (0-100%)
  const [wallPosition, setWallPosition] = useState(50);
  
  // Estado para el tipo de forma (rectangular/circular)
  const [shapeType, setShapeType] = useState<'rectangular' | 'circular'>('rectangular');
  

  
  // Estado para la distancia al suelo
  const [distanceToFloor, setDistanceToFloor] = useState(0);



  // Effect to ensure callback connections are re-established when props change
  useEffect(() => {
    // Callback monitoring removed to prevent infinite loop
    // The real-time position system works independently of this useEffect
  }, [mode]);
  
  // Estados para condiciones de simulación
  // Default is 'open' because the default Element Action is 'equilibrium' (open element)
  const [elementState, setElementState] = useState<'open' | 'closed'>('open');
  const [elementTemperature, setElementTemperature] = useState(20);
  // Material and emissivity - defaults depend on element type and state
  // For closed: glass for windows, wood for doors, default for vents
  // For open: air (very low emissivity)
  const getDefaultMaterial = (state: 'open' | 'closed' = 'open') => {
    if (state === 'open') return 'air';
    if (type === 'window') return 'glass';
    if (type === 'door') return 'wood';
    return 'default';
  };
  const getDefaultEmissivity = (state: 'open' | 'closed' = 'open') => {
    if (state === 'open') return openMaterialDefinitions.air.emissivity;
    const mat = getDefaultMaterial('closed');
    return closedMaterialDefinitions[mat as keyof typeof closedMaterialDefinitions]?.emissivity || 0.90;
  };
  const [elementMaterial, setElementMaterial] = useState(getDefaultMaterial('open'));
  const [elementEmissivity, setElementEmissivity] = useState(getDefaultEmissivity('open'));
  const [airDirection, setAirDirection] = useState<'inflow' | 'outflow' | 'equilibrium' | 'closed'>('equilibrium');
  const [intensityLevel, setIntensityLevel] = useState<'high' | 'medium' | 'low' | 'custom'>('medium');
  const [customIntensity, setCustomIntensity] = useState(0.5);
  
  // Estados específicos para vents
  const [ventMeasurementType, setVentMeasurementType] = useState<'massflow' | 'velocity' | 'pressure'>('massflow');
  const [verticalAngle, setVerticalAngle] = useState(0);
  const [horizontalAngle, setHorizontalAngle] = useState(0);
  const [ventRotation, setVentRotation] = useState(0);
  
  // Estados locales para dimensiones (igual que wallPosition para tiempo real)
  const [localWidth, setLocalWidth] = useState(50);
  const [localHeight, setLocalHeight] = useState(50);

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
    
    if (newPosition) {
      // Update form values for persistence
      setValues(prev => {
        const newValues = { 
          ...prev, 
          position: newPosition,
          wallPosition: newPercentage 
        };

        return newValues;
      });
      
      // Trigger real-time position updates
      if (props.type !== 'wall' && 'onPositionUpdate' in props && props.onPositionUpdate) {
        props.onPositionUpdate(newPosition);
      }
    }
  };

  // Función para manejar cambios de Width (similar a handleWallPositionChange)
  const handleWidthChange = (newWidth: number) => {
    setLocalWidth(newWidth);
    
    // Update form values for persistence
    setValues(prev => ({ ...prev, width: newWidth }));
    
    // Trigger real-time dimension updates - PASS BOTH DIMENSIONS LIKE POSITION
    if (props.type !== 'wall' && 'onDimensionsUpdate' in props && props.onDimensionsUpdate) {
      props.onDimensionsUpdate({ width: newWidth, height: localHeight });
    }
  };

  // Función para manejar cambios de Height (similar a handleWallPositionChange)
  const handleHeightChange = (newHeight: number) => {
    setLocalHeight(newHeight);
    
    // Update form values for persistence
    setValues(prev => ({ ...prev, height: newHeight }));
    
    // Trigger real-time dimension updates - PASS BOTH DIMENSIONS LIKE POSITION
    if (props.type !== 'wall' && 'onDimensionsUpdate' in props && props.onDimensionsUpdate) {
      props.onDimensionsUpdate({ width: localWidth, height: newHeight });
    }
  };

  // Funciones para manejar cambios de Simulation Conditions en tiempo real
  const handleAirDirectionChange = (newDirection: 'inflow' | 'outflow' | 'equilibrium' | 'closed') => {
    setAirDirection(newDirection);

    let newState: 'open' | 'closed';
    let newMaterial: string;
    let newEmissivity: number;

    if (newDirection === 'closed') {
      newState = 'closed';
      newMaterial = type === 'window' ? 'glass' : type === 'door' ? 'wood' : 'default';
      newEmissivity = closedMaterialDefinitions[newMaterial as keyof typeof closedMaterialDefinitions]?.emissivity || 0.90;
    } else {
      newState = 'open';
      newMaterial = 'air';
      newEmissivity = openMaterialDefinitions.air.emissivity;
    }

    setElementState(newState);
    setElementMaterial(newMaterial);
    setElementEmissivity(newEmissivity);

    setValues(prev => ({ ...prev, state: newState, material: newMaterial, emissivity: newEmissivity, airOrientation: newDirection }));

    if (props.type !== 'wall' && 'onPropertiesUpdate' in props && props.onPropertiesUpdate) {
      props.onPropertiesUpdate({ state: newState, material: newMaterial, emissivity: newEmissivity, airOrientation: newDirection as any });
    }
  };

  const handleTemperatureChange = (newTemperature: number) => {
    setElementTemperature(newTemperature);
    
    // Update form values for persistence
    setValues(prev => ({ ...prev, temperature: newTemperature }));
    
    // Trigger real-time properties update
    if (props.type !== 'wall' && 'onPropertiesUpdate' in props && props.onPropertiesUpdate) {
      props.onPropertiesUpdate({ temperature: newTemperature });
    }
  };

  const handleFlowIntensityChange = (newIntensity: 'low' | 'medium' | 'high' | 'custom') => {
    setIntensityLevel(newIntensity);
    
    // Update form values for persistence
    setValues(prev => ({ ...prev, flowIntensity: newIntensity }));
    
    // Trigger real-time properties update
    if (props.type !== 'wall' && 'onPropertiesUpdate' in props && props.onPropertiesUpdate) {
      props.onPropertiesUpdate({ flowIntensity: newIntensity });
    }
  };

  const handleCustomIntensityChange = (newValue: number) => {
    setCustomIntensity(newValue);
    
    // Update form values for persistence
    setValues(prev => ({ ...prev, customIntensityValue: newValue }));
    
    // Trigger real-time properties update
    if (props.type !== 'wall' && 'onPropertiesUpdate' in props && props.onPropertiesUpdate) {
      props.onPropertiesUpdate({ customIntensityValue: newValue });
    }
  };

  const handleFlowTypeChange = (newFlowType: 'massflow' | 'velocity' | 'pressure') => {
    setVentMeasurementType(newFlowType);
    
    // Convert to proper format for properties
    const flowTypeMapping = {
      'massflow': 'Air Mass Flow',
      'velocity': 'Air Velocity',
      'pressure': 'Pressure'
    } as const;
    
    // Update form values for persistence
    setValues(prev => ({ ...prev, flowType: flowTypeMapping[newFlowType] }));
    
    // Trigger real-time properties update
    if (props.type !== 'wall' && 'onPropertiesUpdate' in props && props.onPropertiesUpdate) {
      props.onPropertiesUpdate({ flowType: flowTypeMapping[newFlowType] });
    }
  };

  const handleVerticalAngleChange = (newAngle: number) => {
    setVerticalAngle(newAngle);
    
    // Update form values for persistence
    setValues(prev => ({ ...prev, verticalAngle: newAngle }));
    
    // Trigger real-time properties update
    if (props.type !== 'wall' && 'onPropertiesUpdate' in props && props.onPropertiesUpdate) {
      props.onPropertiesUpdate({ verticalAngle: newAngle });
    }
  };

  const handleHorizontalAngleChange = (newAngle: number) => {
    setHorizontalAngle(newAngle);
    
    // Update form values for persistence
    setValues(prev => ({ ...prev, horizontalAngle: newAngle }));
    
    // Trigger real-time properties update
    if (props.type !== 'wall' && 'onPropertiesUpdate' in props && props.onPropertiesUpdate) {
      props.onPropertiesUpdate({ horizontalAngle: newAngle });
    }
  };

  const handleVentRotationChange = (newRotation: number) => {
    const clamped = Math.min(360, Math.max(0, newRotation));
    setVentRotation(clamped);
    
    // Update form values for persistence
    setValues(prev => ({ ...prev, ventRotation: clamped }));
    
    // Trigger real-time visual update (dimensions update carries rotation for wall air entries)
    if (props.type !== 'wall' && 'onDimensionsUpdate' in props && props.onDimensionsUpdate) {
      props.onDimensionsUpdate({ ventRotation: clamped } as any);
    }
    
    // Also trigger properties update (for furniture vents)
    if (props.type !== 'wall' && 'onPropertiesUpdate' in props && props.onPropertiesUpdate) {
      props.onPropertiesUpdate({ ventRotation: clamped });
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
      const doorHeight = (values as any).height || 203; // Default 203cm (EN 14351-1)
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
          const initialDistanceToFloor = airEntryProps.initialValues.distanceToFloor || 0;
          setDistanceToFloor(initialDistanceToFloor);
          
          // Initialize local dimensions states
          const initialWidth = airEntryProps.initialValues.width || 50;
          const initialHeight = airEntryProps.initialValues.height || 50;
          setLocalWidth(initialWidth);
          setLocalHeight(initialHeight);
          
          // Check if we have a saved wallPosition value from properties
          const savedWallPosition = (airEntryProps.initialValues as any).properties?.wallPosition || 
                                  (airEntryProps.initialValues as any).wallPosition;
          

          
          // Set form values for persistence
          setValues(prev => ({ 
            ...prev, 
            width: initialWidth,
            height: initialHeight,
            distanceToFloor: initialDistanceToFloor,
            wallPosition: savedWallPosition 
          }));
          
          // If we have a saved wallPosition, use it directly
          if (savedWallPosition !== undefined && savedWallPosition !== null) {
            setWallPosition(savedWallPosition);
          }
          // Otherwise, calculate from current position
          else if (airEntryProps.wallContext && airEntryProps.initialValues.position) {
            const { wallStart, wallEnd } = airEntryProps.wallContext;
            const currentPosition = airEntryProps.initialValues.position;
            
            const wallLength = Math.sqrt(
              Math.pow(wallEnd.x - wallStart.x, 2) + Math.pow(wallEnd.y - wallStart.y, 2)
            );
            
            // Usar la posición ACTUAL del air entry, no la clickPosition original
            const currentDistance = Math.sqrt(
              Math.pow(currentPosition.x - wallStart.x, 2) + Math.pow(currentPosition.y - wallStart.y, 2)
            );
            
            // Ajustar el cálculo considerando el ancho del elemento
            const elementWidth = airEntryProps.initialValues.width || 50;
            const PIXELS_TO_CM = 1.25;
            const elementWidthPixels = elementWidth / PIXELS_TO_CM;
            const halfElementWidth = elementWidthPixels / 2;
            
            // Calcular la longitud efectiva disponible para el elemento
            const effectiveLength = Math.max(0, wallLength - elementWidthPixels);
            
            // Convertir la distancia actual a porcentaje efectivo
            const adjustedDistance = Math.max(halfElementWidth, Math.min(wallLength - halfElementWidth, currentDistance));
            const effectiveDistance = adjustedDistance - halfElementWidth;
            const percentage = effectiveLength > 0 ? (effectiveDistance / effectiveLength) * 100 : 0;
            
            const finalPercentage = Math.min(100, Math.max(0, percentage));
            setWallPosition(finalPercentage);
            
            // Also set in form values for persistence
            setValues(prev => ({ 
              ...prev, 
              wallPosition: finalPercentage,
              position: currentPosition 
            }));
          } else {
            setWallPosition(50); // Default center
            setValues(prev => ({ ...prev, wallPosition: 50 }));
          }
        }
      } else {
        // En modo creación, calcular valores iniciales
        const initialWallPos = calculateInitialWallPosition();
        const initialDistToFloor = calculateInitialDistanceToFloor();
        
        setWallPosition(initialWallPos);
        setDistanceToFloor(initialDistToFloor);
        
        // Also set in form values for persistence
        setValues(prev => ({ 
          ...prev, 
          distanceToFloor: initialDistToFloor,
          wallPosition: initialWallPos 
        }));
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

  // Sincronización bidireccional: actualizar estados locales cuando cambien los props externos
  useEffect(() => {
    if (isEditing && props.type !== 'wall' && 'initialValues' in props && props.initialValues) {
      const airEntryProps = props as AirEntryDialogProps;
      
      // Actualizar localWidth y localHeight cuando cambien externamente
      if (airEntryProps.initialValues.width !== undefined) {
        setLocalWidth(airEntryProps.initialValues.width);
      }
      if (airEntryProps.initialValues.height !== undefined) {
        setLocalHeight(airEntryProps.initialValues.height);
      }
      
      // Actualizar wallPosition cuando cambie externamente
      const externalWallPosition = (airEntryProps.initialValues as any).properties?.wallPosition || 
                                   (airEntryProps.initialValues as any).wallPosition;
      if (externalWallPosition !== undefined && externalWallPosition !== null) {
        setWallPosition(externalWallPosition);
      }
    }
  }, [isEditing, props.type, 'initialValues' in props ? props.initialValues?.width : null, 'initialValues' in props ? props.initialValues?.height : null, 'initialValues' in props ? (props.initialValues as any)?.wallPosition : null, 'initialValues' in props ? (props.initialValues as any)?.properties?.wallPosition : null]);

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
      
      // Reset simulation state to defaults when creating a new element
      if (!isEditing) {
        setElementState('open');
        setAirDirection('equilibrium');
        setElementMaterial(getDefaultMaterial('open'));
        setElementEmissivity(getDefaultEmissivity('open'));
        setIntensityLevel('medium');
        setCustomIntensity(0.5);
      }

      // Load saved simulation properties when editing
      if (isEditing && props.type !== 'wall' && 'initialValues' in props && props.initialValues?.properties) {
        const savedProps = props.initialValues.properties;
        
        // Load shape
        if (props.initialValues.shape) {
          setShapeType(props.initialValues.shape);
        }
        
        // Load common properties
        const loadedState = savedProps.state || 'closed';
        if (savedProps.state !== undefined) {
          setElementState(savedProps.state);
        }
        if (savedProps.temperature !== undefined) {
          setElementTemperature(savedProps.temperature);
        }
        // Load material and emissivity - validate against correct material list for the state
        const materialDefs = loadedState === 'open' ? openMaterialDefinitions : closedMaterialDefinitions;
        if (savedProps.material !== undefined && savedProps.material in materialDefs) {
          // Material is valid for current state
          setElementMaterial(savedProps.material);
          if (savedProps.emissivity !== undefined) {
            setElementEmissivity(savedProps.emissivity);
          }
        } else {
          // Material not valid for state - use appropriate default
          const defaultMat = getDefaultMaterial(loadedState);
          const defaultEmis = getDefaultEmissivity(loadedState);
          setElementMaterial(defaultMat);
          setElementEmissivity(defaultEmis);
        }
        
        // Load flow properties for all types
        if (savedProps.flowIntensity) {
          setIntensityLevel(savedProps.flowIntensity);
        }
        // Load airDirection (Element Action): supports new values 'equilibrium'|'closed' and legacy 'inflow'|'outflow'
        if (savedProps.airOrientation) {
          setAirDirection(savedProps.airOrientation as 'inflow' | 'outflow' | 'equilibrium' | 'closed');
        } else {
          // Backward compatibility: derive from state
          setAirDirection(loadedState === 'closed' ? 'closed' : 'equilibrium');
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
          
          // CRITICAL FIX: Load vertical and horizontal angles for persistence
          if (savedProps.verticalAngle !== undefined) {
            setVerticalAngle(savedProps.verticalAngle);
          }
          if (savedProps.horizontalAngle !== undefined) {
            setHorizontalAngle(savedProps.horizontalAngle);
          }
          if ((savedProps as any).ventRotation !== undefined) {
            setVentRotation((savedProps as any).ventRotation);
          }
        }
      }
    }
  }, [dialogOpen, type, isEditing]);

  const handleSubmit = (e: React.FormEvent) => {

    
    e.preventDefault();
    if (props.type === 'wall') {
      const wallValues = values as { temperature: number; material: string; emissivity: number };
      const currentMaterial = wallValues.material || 'default';
      const currentEmissivity = currentMaterial === 'custom' 
        ? wallValues.emissivity 
        : (wallMaterialDefinitions[currentMaterial as keyof typeof wallMaterialDefinitions]?.emissivity || 0.90);
      props.onConfirm(wallValues.temperature, currentMaterial, currentEmissivity);
    } else {

      
      // Collect all air entry data for JSON structure
      const airEntryData = {
        // Basic dimensions
        width: shapeType === 'rectangular' ? (values as any).width : null,
        height: shapeType === 'rectangular' ? (values as any).height : null,
        diameter: shapeType === 'circular' ? (values as any).width : null,
        distanceToFloor: (values as any).distanceToFloor || distanceToFloor,
        
        // Extended properties for JSON
        shape: shapeType,
        isOpen: elementState === 'open',
        temperature: elementTemperature,
        material: elementMaterial,
        emissivity: elementEmissivity,
        airDirection: airDirection,
        flowIntensity: intensityLevel,
        customIntensityValue: intensityLevel === 'custom' ? customIntensity : null,
        ventFlowType: type === 'vent' ? ventMeasurementType : null,
        airOrientation: (type === 'vent' && airDirection !== 'closed') ? {
          verticalAngle: verticalAngle,
          horizontalAngle: horizontalAngle,
          rotation: ventRotation
        } : null,
        
        // Position data will be calculated by parent component
        wallPosition: (values as any).wallPosition || wallPosition,
        position: (values as any).position
      };
      
      // Final airEntryData prepared for submission
      
      // Persist simulation properties in the store if we have the necessary info
      if ((props.type === 'window' || props.type === 'door' || props.type === 'vent') && 'airEntryIndex' in props && props.airEntryIndex !== undefined && props.currentFloor) {
        const simulationProperties: any = {};
        
        // Common properties for ALL types (replicando patrón de temperature)
        simulationProperties.state = elementState;
        simulationProperties.temperature = elementTemperature;
        simulationProperties.material = elementMaterial;
        simulationProperties.emissivity = elementEmissivity;
        simulationProperties.airOrientation = airDirection;
        
        // Type-specific properties for vents  
        if (props.type === 'vent') {
          simulationProperties.flowType = ventMeasurementType;
          simulationProperties.flowValue = customIntensity;
          simulationProperties.flowIntensity = intensityLevel === 'custom' ? 'medium' : intensityLevel;
          // CRITICAL FIX: Save vertical and horizontal angles to store for persistence
          simulationProperties.verticalAngle = verticalAngle;
          simulationProperties.horizontalAngle = horizontalAngle;
          simulationProperties.ventRotation = ventRotation;
          simulationProperties.shape = shapeType;
        } else {
          // For windows and doors, save flowIntensity only when inflow/outflow
          if (airDirection === 'inflow' || airDirection === 'outflow') {
            simulationProperties.flowIntensity = intensityLevel;
          }
        }
        
        // Always save wallPosition for all air entry types
        simulationProperties.wallPosition = (values as any).wallPosition || wallPosition;
        
        // Save simulation properties to store
        
        // Store the properties
        updateAirEntryProperties(props.currentFloor, props.airEntryIndex, simulationProperties);
      }
      
      // Transform data to match Canvas2D expectations
      

      

      
      const canvasData = {
        // CRITICAL FIX: Always preserve the original entry ID and essential properties
        id: props.initialValues?.id,
        type: props.type, // Also preserve the type
        line: props.initialValues?.line, // Preserve the line reference
        width: shapeType === 'rectangular' ? (values as any).width : (values as any).width, // For circular, width = diameter
        height: shapeType === 'rectangular' ? (values as any).height : (values as any).width, // For circular, height = diameter
        distanceToFloor: distanceToFloor,
        shape: shapeType,
        wallPosition: (values as any).wallPosition || wallPosition, // Include wallPosition for Canvas3D
        // Include the calculated position from values (updated by real-time changes)
        position: (values as any).position,
        // Include position and rotation for 3D furniture vents (furnVent mode)
        ...(mode === 'furnVent' && {
          position: element3DPosition,
          rotation: element3DRotation,
        }),
        properties: {
          state: elementState,
          temperature: elementTemperature,
          material: elementMaterial,
          emissivity: elementEmissivity,
          flowIntensity: intensityLevel as 'low' | 'medium' | 'high' | 'custom',
          airOrientation: airDirection as 'inflow' | 'outflow' | 'equilibrium' | 'closed',
          ...(intensityLevel === 'custom' && {
            customIntensityValue: customIntensity,
          }),
          ...(type === 'vent' && {
            flowType: (ventMeasurementType === 'massflow' ? 'Air Mass Flow' : ventMeasurementType === 'velocity' ? 'Air Velocity' : 'Pressure') as 'Air Mass Flow' | 'Air Velocity' | 'Pressure',
            flowValue: customIntensity,
            // CRITICAL FIX: Include angles in properties object for Canvas2D/Canvas3D persistence
            verticalAngle: verticalAngle,
            horizontalAngle: horizontalAngle,
            ventRotation: ventRotation,
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
    <Dialog open={dialogOpen} modal={false} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-[425px] [&>button]:hidden"
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
          className="cursor-grab select-none relative"
          title="Drag to move"
        >
          {/* Visual drag indicator */}
          <div 
            className="absolute top-3 left-3 h-1 w-8 bg-muted-foreground/20 rounded-sm" 
            style={{ pointerEvents: 'none' }}
          />
          <DialogTitle>{(props as AirEntryDialogProps).dialogTitle || (mode === 'furnVent' ? 'Vent Furniture Properties' : titles[type])}</DialogTitle>
          <DialogDescription>{mode === 'furnVent' ? 'Configure 3D vent furniture simulation properties' : descriptions[type]}</DialogDescription>
          {onCancel && (
            <button
              className="absolute -right-2 -top-2 rounded-sm opacity-70 hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 bg-white border border-red-200 hover:border-red-300 shadow-sm"
              onClick={() => {
                if (isCreating) {
                  // Create mode: Delete element and close dialog
                  onCancel();
                } else {
                  // Edit mode: Just close dialog, preserve element
                  onClose();
                }
              }}
              type="button"
              style={{ zIndex: 60 }}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4 max-h-[70vh] overflow-y-auto pr-2">
            {(props as AirEntryDialogProps).topSectionContent}
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
                
                {/* Material Selector */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="wall-material" className="text-right">
                    Material
                  </Label>
                  <div className="col-span-3">
                    <Select 
                      value={(values as { material?: string }).material || 'default'} 
                      onValueChange={(value) => setValues(prev => ({ ...prev, material: value }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(wallMaterialDefinitions).map(([key, { name, emissivity }]) => (
                          <SelectItem key={key} value={key}>
                            {name} {key !== 'custom' && `(ε = ${emissivity})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Custom Emissivity Input - only shown when 'custom' is selected */}
                {(values as { material?: string }).material === 'custom' && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="custom-emissivity" className="text-right">
                      Custom ε
                    </Label>
                    <Input
                      id="custom-emissivity"
                      type="number"
                      value={(values as { emissivity?: number }).emissivity || 0.90}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        if (!isNaN(value) && value >= 0 && value <= 1) {
                          setValues(prev => ({ ...prev, emissivity: value }));
                        }
                      }}
                      className="col-span-3"
                      min={0}
                      max={1}
                      step={0.01}
                      placeholder="0.90"
                    />
                  </div>
                )}
                
                {/* Display current emissivity */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <span className="text-right text-sm text-gray-500">Current ε</span>
                  <div className="col-span-3 text-sm text-blue-600 font-medium">
                    {(() => {
                      const mat = (values as { material?: string }).material || 'default';
                      if (mat === 'custom') {
                        return ((values as { emissivity?: number }).emissivity || 0.90).toFixed(2);
                      }
                      return (wallMaterialDefinitions[mat as keyof typeof wallMaterialDefinitions]?.emissivity || 0.90).toFixed(2);
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              // Nueva estructura con secciones variables según el modo
              <>
                {/* 1. INFORMATION SECTION - Only show for furnVent mode */}
                {mode === 'furnVent' && (
                  <div className="border rounded-lg p-4 bg-slate-50/50">
                    <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">Information</h4>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right text-sm">Furniture ID</label>
                        <div className="col-span-3 px-3 py-2 bg-gray-100 rounded text-sm text-gray-700 font-mono">
                          {(props as AirEntryDialogProps).initialValues?.name || 'Vent'}
                        </div>
                      </div>
                      
                      {(props as AirEntryDialogProps).floorContext && (
                        <div className="p-2 bg-gray-100 rounded text-xs text-gray-600">
                          <div>Floor: {(props as AirEntryDialogProps).floorContext.floorName}</div>
                          <div>Floor Height: {(props as AirEntryDialogProps).floorContext.floorHeight}cm</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. POSITION & TRANSFORM SECTION - Only show for furnVent mode */}
                {mode === 'furnVent' && (
                  <div className="border rounded-lg p-4 bg-slate-50/50">
                    <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">Position & Transform</h4>
                    
                    <div className="space-y-4">
                      {/* Position */}
                      <div>
                        <label className="text-xs text-slate-600 mb-2 block">Position (cm)</label>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs">X</label>
                            <Input
                              type="number"
                              step="1"
                              value={Math.round(element3DPosition.x * 100) / 100}
                              onChange={(e) => {
                                const newX = Number(e.target.value);
                                const newPosition = { ...element3DPosition, x: newX };
                                setElement3DPosition(newPosition);
                                
                                if ('onPositionUpdate' in props && props.onPositionUpdate) {
                                  (props.onPositionUpdate as (pos: { x: number; y: number; z: number }) => void)(newPosition);
                                }
                              }}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs">Y</label>
                            <Input
                              type="number"
                              step="1"
                              value={Math.round(element3DPosition.y * 100) / 100}
                              onChange={(e) => {
                                const newY = Number(e.target.value);
                                const newPosition = { ...element3DPosition, y: newY };
                                setElement3DPosition(newPosition);
                                
                                if ('onPositionUpdate' in props && props.onPositionUpdate) {
                                  (props.onPositionUpdate as (pos: { x: number; y: number; z: number }) => void)(newPosition);
                                }
                              }}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs">Z</label>
                            <Input
                              type="number"
                              step="1"
                              value={Math.round(element3DPosition.z * 100) / 100}
                              onChange={(e) => {
                                const newZ = Number(e.target.value);
                                const newPosition = { ...element3DPosition, z: newZ };
                                setElement3DPosition(newPosition);
                                
                                if ('onPositionUpdate' in props && props.onPositionUpdate) {
                                  (props.onPositionUpdate as (pos: { x: number; y: number; z: number }) => void)(newPosition);
                                }
                              }}
                              className="text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Rotation X/Y/Z */}
                      <div>
                        <label className="text-xs text-slate-600 mb-2 block">Rotation (degrees)</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['x', 'y', 'z'] as const).map((axis) => (
                            <div key={axis}>
                              <label className="text-xs uppercase">{axis}</label>
                              <Input
                                type="number"
                                step="1"
                                value={Math.round(element3DRotation[axis] * 180 / Math.PI)}
                                onChange={(e) => {
                                  const deg = Number(e.target.value);
                                  const rad = deg * Math.PI / 180;
                                  const newRotation = { ...element3DRotation, [axis]: rad };
                                  setElement3DRotation(newRotation);
                                  if ('onRotationUpdate' in props && props.onRotationUpdate) {
                                    props.onRotationUpdate!(newRotation);
                                  }
                                }}
                                className="text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      
                    </div>
                  </div>
                )}

                {/* 3. POSITION SECTION - Only show for airEntry mode */}
                {mode === 'airEntry' && (
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
                          <div>{type === 'window' ? 'Window' : type === 'door' ? 'Door' : 'Vent'} ID: {
                            // ✅ FIX: Use useMemo to prevent infinite loop and calculate ID once
                            (() => {
                              // Get current entry from store
                              if (!airEntryProps.currentFloor) return `${type}_1`;
                              const currentFloorData = floors[airEntryProps.currentFloor];
                              if (!currentFloorData) return `${type}_1`;
                              
                              const currentEntry = currentFloorData.airEntries[airEntryProps.airEntryIndex || 0];
                              
                              // Use existing ID if available, otherwise calculate fallback
                              if ((currentEntry as any)?.id) {
                                return (currentEntry as any).id;
                              } else {
                                // Calculate type-based index
                                let typeCount = 0;
                                for (let i = 0; i <= (airEntryProps.airEntryIndex || 0); i++) {
                                  if (currentFloorData.airEntries[i]?.type === type) {
                                    typeCount++;
                                  }
                                }
                                return `${type}_${typeCount}`;
                              }
                            })()
                          }</div>
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
                    {/* CENTER HEIGHT - NEW IMPLEMENTATION BASED ON POSITION ALONG WALL PATTERN */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="center-height" className="text-xs text-slate-600">
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
                          id="center-height"
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={distanceToFloor}
                          onChange={(e) => {
                            if (type !== 'door') {
                              const value = Number(e.target.value);
                              const rounded = Math.round(value * 100) / 100;
                              setDistanceToFloor(rounded);
                              
                              // Update form values for persistence
                              setValues(prev => {
                                const newValues = { ...prev, distanceToFloor: rounded };
                                return newValues;
                              });
                              
                              // Real-time callback for Canvas2D updates - following Position Along Wall pattern
                              if (props.type !== 'wall' && 'onDimensionsUpdate' in props && props.onDimensionsUpdate) {
                                props.onDimensionsUpdate({ distanceToFloor: rounded });
                              }
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
                          step="any"
                          inputMode="decimal"
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
                )}

                {/* 4. DIMENSIONS SECTION - Show for both airEntry and furnVent modes (unless hidden, e.g. topVentBox) */}
                {(mode === 'airEntry' || mode === 'furnVent') && !(props as AirEntryDialogProps).hideDimensionsSection && (
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
                              onChange={() => {
                                setShapeType('rectangular');
                                if ('onDimensionsUpdate' in props && props.onDimensionsUpdate) {
                                  props.onDimensionsUpdate({ shape: 'rectangular' } as any);
                                }
                              }}
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
                              onChange={() => {
                                setShapeType('circular');
                                const currentW = (values as any).width || 60;
                                if ('onDimensionsUpdate' in props && props.onDimensionsUpdate) {
                                  props.onDimensionsUpdate({ shape: 'circular', width: currentW, height: currentW } as any);
                                }
                              }}
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
                              value={localWidth}
                              onChange={(e) => {
                                const newWidth = Number(e.target.value);
                                handleWidthChange(newWidth);
                              }}
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
                              value={localHeight}
                              onChange={(e) => {
                                const newHeight = Number(e.target.value);
                                handleHeightChange(newHeight);
                              }}
                              className="h-8 text-sm"
                            />
                            <span className="text-xs text-slate-500">cm</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Rotation - Solo para vents rectangulares */}
                    {type === 'vent' && shapeType === 'rectangular' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="vent-rotation" className="text-xs text-slate-600">Rotation</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="right" sideOffset={5}>
                                <p className="text-xs max-w-48">
                                  Rotate the vent around its normal axis. 0° is the default orientation; 90° turns a horizontal vent vertical.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Input
                            id="vent-rotation"
                            type="number"
                            min="0"
                            max="360"
                            step="1"
                            value={ventRotation}
                            onChange={(e) => handleVentRotationChange(Number(e.target.value))}
                            className="h-8 text-sm"
                            placeholder="0"
                          />
                          <span className="text-xs text-slate-500">degrees</span>
                        </div>
                        <p className="text-xs text-gray-500">
                          0° to 360° around vent normal
                        </p>
                      </div>
                    )}

                    {/* EN 14351-1 note for doors */}
                    {type === 'door' && (
                      <p className="text-xs text-slate-400 mt-1">
                        Default: 72.5 × 203 cm — EN 14351-1 (Europe): standard leaf widths 62.5, 72.5, 82.5, 92.5 cm · standard height 203 cm
                      </p>
                    )}

                    {/* EN 14351-1 note for windows */}
                    {type === 'window' && (
                      <p className="text-xs text-slate-400 mt-1">
                        Default: 120 × 120 cm — EN 14351-1 (Europe): standard modular widths 60, 90, 120, 150, 180 cm · standard heights 60, 90, 120, 150 cm
                      </p>
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
                              
                              // Real-time dimension updates for circular elements
                              if ('onDimensionsUpdate' in props && props.onDimensionsUpdate) {
                                props.onDimensionsUpdate({ shape: 'circular', width: diameter, height: diameter } as any);
                              }
                            }}
                            className="h-8 text-sm"
                          />
                          <span className="text-xs text-slate-500">cm</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* 5. SIMULATION CONDITIONS SECTION */}
                <div className="border rounded-lg p-4 bg-slate-50/50">
                  <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">Simulation Conditions</h4>
                  <div className="space-y-4">
                    
                    {/* Element Action selector - always visible */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-1">
                        <Label className="text-xs text-slate-600">Element Action</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={5}>
                              <div className="text-xs max-w-56 space-y-1.5">
                                <p><span className="font-semibold">Pressure Equilibrium:</span> The element is open but with no net forced flow. Air naturally equalizes through pressure differences — ideal for openings exposed to the outdoor environment.</p>
                                <p><span className="font-semibold">Closed:</span> The element is shut — no airflow passes through. It behaves as a solid surface with thermal properties.</p>
                                <p><span className="font-semibold">Inflow:</span> The element acts as an air inlet, forcing air into the room at a defined intensity.</p>
                                <p><span className="font-semibold">Outflow:</span> The element acts as an air outlet, extracting air from the room at a defined intensity.</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Select value={airDirection} onValueChange={(value: 'inflow' | 'outflow' | 'equilibrium' | 'closed') => handleAirDirectionChange(value)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select action" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equilibrium">
                            <div className="flex items-center space-x-2">
                              <span className="text-blue-500 text-base">⇌</span>
                              <span>Pressure Equilibrium</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="closed">
                            <div className="flex items-center space-x-2">
                              <span className="text-slate-500 text-base">✕</span>
                              <span>Closed</span>
                            </div>
                          </SelectItem>
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

                    {/* Temperatura del elemento */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-1">
                        <Label htmlFor="element-temperature" className="text-xs text-slate-600">
                          {elementState === 'open'
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
                                {elementState === 'open'
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
                          onChange={(e) => handleTemperatureChange(Number(e.target.value))}
                          className="h-8 text-sm"
                          placeholder="20.0"
                        />
                        <span className="text-xs text-slate-500">°C</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {elementState === 'open'
                          ? "Temperature of air entering the room"
                          : `Temperature on the ${type === 'window' ? 'window' : type === 'door' ? 'door' : 'vent'} surface`
                        }
                      </p>
                    </div>

                    {/* Material and Emissivity selector - always visible (required for P1 radiation model in OpenFOAM) */}
                    <div className="space-y-3 border-t pt-3">
                      {/* Material Selector - different options based on element state */}
                      <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                          <Label className="text-xs text-slate-600">
                            {elementState === 'open' ? 'Air Type' : 'Surface Material'}
                          </Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="right" sideOffset={5}>
                                <p className="text-xs max-w-48">
                                  {elementState === 'open' 
                                    ? "Air/gas type for the inlet boundary. Open elements have very low emissivity (ε ≈ 0.05-0.10)."
                                    : "Material determines emissivity for thermal radiation calculations. Grey body assumption: emissivity equals absorptivity."
                                  }
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <Select 
                          key={`material-select-${elementState}`}
                          value={elementMaterial} 
                          onValueChange={(value) => {
                            setElementMaterial(value);
                            if (value !== 'custom') {
                              const materialDefs = elementState === 'open' ? openMaterialDefinitions : closedMaterialDefinitions;
                              const matDef = materialDefs[value as keyof typeof materialDefs];
                              if (matDef) {
                                setElementEmissivity(matDef.emissivity);
                              }
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={elementState === 'open' ? "Select air type" : "Select material"} />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(elementState === 'open' ? openMaterialDefinitions : closedMaterialDefinitions).map(([key, { name, emissivity }]) => (
                              <SelectItem key={key} value={key}>
                                <div className="flex justify-between items-center w-full">
                                  <span>{name}</span>
                                  <span className="text-xs text-gray-500 ml-2">ε={emissivity.toFixed(2)}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Custom Emissivity Input - only for custom material */}
                      {elementMaterial === 'custom' && (
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-600">Custom Emissivity</Label>
                          <div className="flex items-center space-x-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="1"
                              value={elementEmissivity}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                if (!isNaN(value) && value >= 0 && value <= 1) {
                                  setElementEmissivity(value);
                                }
                              }}
                              className="h-8 text-sm"
                              placeholder="0.90"
                            />
                          </div>
                        </div>
                      )}

                      {/* Display current emissivity */}
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Current Emissivity (ε)</span>
                        <span className="text-blue-600 font-medium">{elementEmissivity.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Campos condicionales que aparecen solo cuando está abierto con inflow/outflow */}
                    {(airDirection === 'inflow' || airDirection === 'outflow' || (type === 'vent' && airDirection !== 'closed')) && (
                      <div className="space-y-4 border-t pt-4">
                        {/* Air Orientation - Para vents en cualquier estado excepto closed */}
                        {type === 'vent' && airDirection !== 'closed' && (
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
                                  onChange={(e) => handleVerticalAngleChange(Number(e.target.value))}
                                  className="h-8 text-sm"
                                  placeholder="0"
                                />
                                <span className="text-xs text-slate-500">degrees</span>
                              </div>
                              <p className="text-xs text-gray-500">
                                Up -45° to Down +45°
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
                                  onChange={(e) => handleHorizontalAngleChange(Number(e.target.value))}
                                  className="h-8 text-sm"
                                  placeholder="0"
                                />
                                <span className="text-xs text-slate-500">degrees</span>
                              </div>
                              <p className="text-xs text-gray-500">
                                Left +45° to Right -45°
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Tipo de flujo para vents - oculto cuando equilibrium */}
                        {type === 'vent' && airDirection !== 'equilibrium' && (
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
                                  onChange={(e) => handleFlowTypeChange(e.target.value as 'massflow' | 'velocity' | 'pressure')}
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
                                  onChange={(e) => handleFlowTypeChange(e.target.value as 'massflow' | 'velocity' | 'pressure')}
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
                                  onChange={(e) => handleFlowTypeChange(e.target.value as 'massflow' | 'velocity' | 'pressure')}
                                  className="w-4 h-4 text-blue-600"
                                />
                                <Label htmlFor="pressure" className="text-xs">Pressure</Label>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Intensidad del flujo - solo para inflow/outflow (no equilibrium) */}
                        {(airDirection === 'inflow' || airDirection === 'outflow') && <div className="space-y-2">
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
                          <Select value={intensityLevel} onValueChange={(value: 'high' | 'medium' | 'low' | 'custom') => handleFlowIntensityChange(value)}>
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
                                onChange={(e) => handleCustomIntensityChange(Number(e.target.value))}
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
                        </div>}
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