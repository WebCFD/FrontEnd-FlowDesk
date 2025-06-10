import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { X, Move } from "lucide-react";
import type { FurnitureItem } from "@shared/furniture-types";

type FurnitureType = 'table' | 'person' | 'armchair' | 'car' | 'block' | 'vent' | 'custom';

interface FurnitureDialogProps {
  type: FurnitureType;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    name: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    properties?: {
      material?: string;
      temperature?: number;
      thermalConductivity?: number;
      density?: number;
      heatCapacity?: number;
      emissivity?: number;
    };
    simulationProperties?: {
      flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
      flowValue?: number;
      flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
      airOrientation?: 'inflow' | 'outflow';
      state?: 'open' | 'closed';
      customIntensityValue?: number;
      verticalAngle?: number;
      horizontalAngle?: number;
    };
  }) => void;
  onCancel?: () => void; // New prop for cancel handling
  isEditing?: boolean;
  isCreationMode?: boolean; // Phase 1: Add mode detection flag
  initialValues?: {
    name: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    properties?: {
      material?: string;
      temperature?: number;
      thermalConductivity?: number;
      density?: number;
      heatCapacity?: number;
      emissivity?: number;
    };
    simulationProperties?: {
      flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
      flowValue?: number;
      flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
      airOrientation?: 'inflow' | 'outflow';
      state?: 'open' | 'closed';
      customIntensityValue?: number;
      verticalAngle?: number;
      horizontalAngle?: number;
      airTemperature?: number;
    };
  };
  floorContext?: {
    floorName: string;
    floorHeight: number;
    clickPosition: { x: number; y: number; z: number };
  };
  onPositionUpdate?: (newPosition: { x: number; y: number; z: number }) => void;
  onRotationUpdate?: (newRotation: { x: number; y: number; z: number }) => void;
  onScaleUpdate?: (newScale: { x: number; y: number; z: number }) => void;
  furnitureIndex?: number;
  currentFloor?: string;
}

// Default values for different furniture types
const furnitureDefaults = {
  table: {
    name: "Table",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    properties: {
      material: "default",
      temperature: 20,
      emissivity: 0.90
    }
  },
  armchair: {
    name: "Chair",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    properties: {
      material: "default",
      temperature: 20,
      emissivity: 0.90
    }
  },
  person: {
    name: "Person",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    properties: {
      material: "fabric",
      temperature: 37,
      emissivity: 0.90
    }
  },
  car: {
    name: "Car",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    properties: {
      material: "metal",
      temperature: 20,
      emissivity: 0.25
    }
  },
  block: {
    name: "Block",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    properties: {
      material: "concrete",
      temperature: 20,
      emissivity: 0.90
    }
  },
  custom: {
    name: "Custom Object",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    dimensions: { width: 100, height: 100, depth: 100 },
    properties: {
      material: "default",
      temperature: 20,
      emissivity: 0.90
    }
  },
  vent: {
    name: "Vent",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    properties: {
      material: "metal",
      temperature: 20,
      thermalConductivity: 45,
      density: 2700,
      heatCapacity: 900
    },
    simulationProperties: {
      flowType: "Air Mass Flow" as const,
      flowValue: 0.5,
      flowIntensity: "medium" as const,
      airOrientation: "inflow" as const,
      state: "open" as const,
      customIntensityValue: 0.5,
      verticalAngle: 0,
      horizontalAngle: 0,
      airTemperature: 20
    }
  }
};

export default function FurnitureDialog(props: FurnitureDialogProps) {
  const { 
    type, 
    isOpen: dialogOpen, 
    onClose, 
    onCancel,
    isEditing = false,
    onPositionUpdate,
    onRotationUpdate,
    onScaleUpdate
  } = props;

  // Helper function to truncate to 2 decimals
  const truncateToTwoDecimals = (value: number): number => {
    return Math.floor(value * 100) / 100;
  };

  // Helper function to format display value with 2 decimals
  const formatDisplayValue = (value: number): string => {
    return truncateToTwoDecimals(value).toFixed(2);
  };

  // Helper function to handle user input with decimal validation
  const handleDecimalInput = (inputValue: string, maxDecimals: number = 2): number => {
    const num = parseFloat(inputValue);
    if (isNaN(num)) return 0;
    
    // Truncate to specified decimals
    const factor = Math.pow(10, maxDecimals);
    return Math.floor(num * factor) / factor;
  };
  
  // Estado unificado para manejar todas las propiedades del furniture
  const [values, setValues] = useState(() => getDefaultValues());
  const [position, setPosition] = useState(() => {
    // Calcular posición inicial centrada horizontalmente en la parte superior
    const dialogWidth = 425;
    const centerX = typeof window !== 'undefined' ? (window.innerWidth - dialogWidth) / 2 : 0;
    return { x: centerX, y: 40 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [hasBeenDragged, setHasBeenDragged] = useState(true);
  const draggingRef = useRef(false);
  
  // Estado para las coordenadas del elemento en el canvas 3D
  const [elementPosition, setElementPosition] = useState({ x: 0, y: 0, z: 0 });
  
  // Estados para propiedades específicas del furniture
  const [furnitureName, setFurnitureName] = useState("");
  const [materialType, setMaterialType] = useState("default");
  const [temperature, setTemperature] = useState(20);
  const [customEmissivity, setCustomEmissivity] = useState(0.85);


  // Estados para propiedades de simulación de vents
  const [simulationProperties, setSimulationProperties] = useState({
    flowType: 'Air Mass Flow' as 'Air Mass Flow' | 'Air Velocity' | 'Pressure',
    flowValue: 0.5,
    flowIntensity: 'medium' as 'low' | 'medium' | 'high' | 'custom',
    airOrientation: 'inflow' as 'inflow' | 'outflow',
    state: 'open' as 'open' | 'closed',
    customIntensityValue: 0.5,
    verticalAngle: 0,
    horizontalAngle: 0,
    airTemperature: 20
  });

  // Material definitions with emissivity values (not applied to vents)
  const materialDefinitions = {
    default: { name: "Default", emissivity: 0.90 },
    wood: { name: "Wood", emissivity: 0.90 },
    metal: { name: "Metal (Steel)", emissivity: 0.25 },
    glass: { name: "Glass", emissivity: 0.92 },
    fabric: { name: "Fabric/Textile", emissivity: 0.90 },
    plastic: { name: "Plastic", emissivity: 0.90 },
    ceramic: { name: "Ceramic/Tile", emissivity: 0.90 },
    concrete: { name: "Concrete", emissivity: 0.90 },
    custom: { name: "Custom", emissivity: customEmissivity }
  };

  // Get current emissivity value (only for non-vent furniture)
  const getCurrentEmissivity = () => {
    if (type === 'vent') return undefined;
    return materialType === 'custom' ? customEmissivity : materialDefinitions[materialType as keyof typeof materialDefinitions]?.emissivity || 0.85;
  };
  
  // Estado para dimensiones (especialmente para objetos custom)
  const [dimensions, setDimensions] = useState({
    width: 100,
    height: 100,
    depth: 100
  });

  function getDefaultValues() {
    const baseDefaults = (furnitureDefaults as any)[type] || furnitureDefaults.table;
    
    if (props.initialValues) {
      // For vent types, ensure simulationProperties exist by merging with defaults
      if (type === 'vent' && !props.initialValues.simulationProperties) {
        return {
          ...props.initialValues,
          simulationProperties: baseDefaults.simulationProperties
        };
      }
      return props.initialValues;
    }
    
    return baseDefaults;
  }

  // Reset values when dialog opens with new type or initialValues
  useEffect(() => {
    if (dialogOpen) {
      const defaults = getDefaultValues();
      setValues(defaults);
      setFurnitureName(defaults.name);
      if (type !== 'vent') {
        setMaterialType(defaults.properties?.material || "default");
      }
      setTemperature(defaults.properties?.temperature || 20);
      
      // Initialize emissivity for non-vent furniture
      if (type !== 'vent' && defaults.properties?.emissivity !== undefined) {
        setCustomEmissivity(defaults.properties.emissivity);
      }
      
      // Initialize simulation properties for vent furniture
      if (type === 'vent') {
        const simProps = (defaults as any).simulationProperties;
        
        const newSimulationProperties = {
          flowType: simProps?.flowType || 'Air Mass Flow',
          flowValue: simProps?.flowValue || 0.5,
          flowIntensity: simProps?.flowIntensity || 'medium',
          airOrientation: simProps?.airOrientation || 'inflow',
          state: simProps?.state || 'open',
          customIntensityValue: simProps?.customIntensityValue || 0.5,
          verticalAngle: simProps?.verticalAngle || 0,
          horizontalAngle: simProps?.horizontalAngle || 0,
          airTemperature: simProps?.airTemperature || 20
        };
        
        setSimulationProperties(newSimulationProperties);
      }
      
      // Initialize dimensions for custom objects
      if (type === 'custom' && (defaults as any).dimensions) {
        setDimensions((defaults as any).dimensions);
      }
      
      if (defaults.position) {
        // Apply decimal truncation to initial position values
        setElementPosition({
          x: truncateToTwoDecimals(defaults.position.x),
          y: truncateToTwoDecimals(defaults.position.y),
          z: truncateToTwoDecimals(defaults.position.z)
        });
      }
    }
  }, [dialogOpen, type, isEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Build properties object based on furniture type
    const properties = type === 'vent' 
      ? {
          // Vent furniture: Only temperature needed
          temperature: temperature
        }
      : {
          // Non-vent furniture: Use material/emissivity system
          material: materialType,
          temperature: temperature,
          emissivity: getCurrentEmissivity()
        };
    
    const furnitureData = {
      name: furnitureName,
      position: elementPosition,
      rotation: values.rotation,
      scale: values.scale,
      ...(type === 'custom' && { dimensions: dimensions }),
      properties,
      ...(type === 'vent' && { 
        simulationProperties: {
          ...simulationProperties,
          // Only include angles if vent is open and airOrientation is inflow (mimicking AirEntry logic)
          ...(simulationProperties.state === 'open' && simulationProperties.airOrientation === 'inflow' ? {
            verticalAngle: simulationProperties.verticalAngle,
            horizontalAngle: simulationProperties.horizontalAngle
          } : {
            verticalAngle: 0,
            horizontalAngle: 0
          })
        }
      })
    };
    

    
    props.onConfirm(furnitureData);
    onClose();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.dialog-header')) {
      setIsDragging(true);
      draggingRef.current = true;
      setHasBeenDragged(true);
      
      const startX = e.clientX - position.x;
      const startY = e.clientY - position.y;

      const handleMouseMove = (e: MouseEvent) => {
        if (draggingRef.current) {
          setPosition({
            x: e.clientX - startX,
            y: e.clientY - startY
          });
        }
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        draggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  };

  if (!dialogOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="relative bg-white rounded-lg shadow-lg border border-gray-200"
        style={{
          left: position.x,
          top: position.y,
          width: '425px',
          maxHeight: '90vh',
          overflow: 'auto',
          pointerEvents: 'auto'
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Header */}
        <div className="dialog-header flex items-center justify-between p-4 border-b border-gray-200 cursor-move select-none">
          <div className="flex items-center gap-2">
            <Move className="h-4 w-4 text-gray-400" />
            <h3 className="text-lg font-semibold capitalize">
              {props.isCreationMode ? `Creation ${type}` : `Edit ${type}`}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-6">
            
            {/* 1. INFORMATION SECTION */}
            <div className="border rounded-lg p-4 bg-slate-50/50">
              <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">Information</h4>
              
              <div className="space-y-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="furniture-id" className="text-right">
                    Furniture ID
                  </Label>
                  <div className="col-span-3 px-3 py-2 bg-gray-100 rounded text-sm text-gray-700 font-mono">
                    {furnitureName}
                  </div>
                </div>

                {props.floorContext && (
                  <div className="p-2 bg-gray-100 rounded text-xs text-gray-600">
                    <div>Floor: {props.floorContext.floorName}</div>
                    <div>Floor Height: {props.floorContext.floorHeight}cm</div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. POSITION SECTION */}
            <div className="border rounded-lg p-4 bg-slate-50/50">
              <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">Position & Transform</h4>
              
              <div className="space-y-4">
                {/* Position */}
                <div>
                  <Label className="text-xs text-slate-600 mb-2 block">Position (cm)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="pos-x" className="text-xs">X</Label>
                      <Input
                        id="pos-x"
                        type="number"
                        step="1"
                        value={Math.round(elementPosition.x * 100) / 100}
                        onChange={(e) => {
                          const newX = Number(e.target.value);
                          const newPosition = { ...elementPosition, x: newX };
                          setElementPosition(newPosition);
                          // Real-time update
                          if (onPositionUpdate) {
                            onPositionUpdate(newPosition);
                          }
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pos-y" className="text-xs">Y</Label>
                      <Input
                        id="pos-y"
                        type="number"
                        step="1"
                        value={Math.round(elementPosition.y * 100) / 100}
                        onChange={(e) => {
                          const newY = Number(e.target.value);
                          const newPosition = { ...elementPosition, y: newY };
                          setElementPosition(newPosition);
                          // Real-time update
                          if (onPositionUpdate) {
                            onPositionUpdate(newPosition);
                          }
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pos-z" className="text-xs">Z</Label>
                      <Input
                        id="pos-z"
                        type="number"
                        step="1"
                        value={Math.round(elementPosition.z * 100) / 100}
                        onChange={(e) => {
                          const newZ = Number(e.target.value);
                          const newPosition = { ...elementPosition, z: newZ };
                          setElementPosition(newPosition);
                          // Real-time update
                          if (onPositionUpdate) {
                            onPositionUpdate(newPosition);
                          }
                        }}
                        disabled={type !== 'block' && type !== 'vent'}
                        className={`text-sm ${type !== 'block' && type !== 'vent' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Rotation */}
                <div>
                  <Label className="text-xs text-slate-600 mb-2 block">Rotation (degrees)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="rot-x" className="text-xs">X</Label>
                      <Input
                        id="rot-x"
                        type="number"
                        step="1"
                        value={Math.round((values.rotation.x * (180 / Math.PI)) * 100) / 100}
                        onChange={(e) => {
                          const degrees = Number(e.target.value);
                          const newRotationX = degrees * (Math.PI / 180);
                          const newRotation = { ...values.rotation, x: newRotationX };
                          setValues(prev => ({
                            ...prev,
                            rotation: newRotation
                          }));
                          // Real-time update
                          if (onRotationUpdate) {
                            onRotationUpdate(newRotation);
                          }
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="rot-y" className="text-xs">Y</Label>
                      <Input
                        id="rot-y"
                        type="number"
                        step="1"
                        value={Math.round((values.rotation.y * (180 / Math.PI)) * 100) / 100}
                        onChange={(e) => {
                          const degrees = Number(e.target.value);
                          const newRotationY = degrees * (Math.PI / 180);
                          const newRotation = { ...values.rotation, y: newRotationY };
                          setValues(prev => ({
                            ...prev,
                            rotation: newRotation
                          }));
                          // Real-time update
                          if (onRotationUpdate) {
                            onRotationUpdate(newRotation);
                          }
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="rot-z" className="text-xs">Z</Label>
                      <Input
                        id="rot-z"
                        type="number"
                        step="1"
                        value={Math.round((values.rotation.z * (180 / Math.PI)) * 100) / 100}
                        onChange={(e) => {
                          const degrees = Number(e.target.value);
                          const newRotationZ = degrees * (Math.PI / 180);
                          const newRotation = { ...values.rotation, z: newRotationZ };
                          setValues(prev => ({
                            ...prev,
                            rotation: newRotation
                          }));
                          // Real-time update
                          if (onRotationUpdate) {
                            onRotationUpdate(newRotation);
                          }
                        }}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Scale */}
                <div>
                  <Label className="text-xs text-slate-600 mb-2 block">Scale</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="scale-x" className="text-xs">X</Label>
                      <Input
                        id="scale-x"
                        type="number"
                        step="0.1"
                        value={Math.round(values.scale.x * 100) / 100}
                        onChange={(e) => {
                          const newScaleX = Number(e.target.value);
                          const newScale = { ...values.scale, x: newScaleX };
                          setValues(prev => ({
                            ...prev,
                            scale: newScale
                          }));
                          // Real-time update
                          if (onScaleUpdate) {
                            onScaleUpdate(newScale);
                          }
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="scale-y" className="text-xs">Y</Label>
                      <Input
                        id="scale-y"
                        type="number"
                        step="0.1"
                        value={Math.round(values.scale.y * 100) / 100}
                        onChange={(e) => {
                          const newScaleY = Number(e.target.value);
                          const newScale = { ...values.scale, y: newScaleY };
                          setValues(prev => ({
                            ...prev,
                            scale: newScale
                          }));
                          // Real-time update
                          if (onScaleUpdate) {
                            onScaleUpdate(newScale);
                          }
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="scale-z" className="text-xs">Z</Label>
                      <Input
                        id="scale-z"
                        type="number"
                        step="0.1"
                        value={Math.round(values.scale.z * 100) / 100}
                        onChange={(e) => {
                          const newScaleZ = Number(e.target.value);
                          const newScale = { ...values.scale, z: newScaleZ };
                          setValues(prev => ({
                            ...prev,
                            scale: newScale
                          }));
                          // Real-time update
                          if (onScaleUpdate) {
                            onScaleUpdate(newScale);
                          }
                        }}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Dimensions - Only for custom objects */}
                {type === 'custom' && (
                  <div>
                    <Label className="text-xs text-slate-600 mb-2 block">Dimensions (cm)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label htmlFor="dim-width" className="text-xs">Width</Label>
                        <Input
                          id="dim-width"
                          type="number"
                          value={dimensions.width}
                          onChange={(e) => setDimensions(prev => ({
                            ...prev,
                            width: Number(e.target.value)
                          }))}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dim-height" className="text-xs">Height</Label>
                        <Input
                          id="dim-height"
                          type="number"
                          value={dimensions.height}
                          onChange={(e) => setDimensions(prev => ({
                            ...prev,
                            height: Number(e.target.value)
                          }))}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dim-depth" className="text-xs">Depth</Label>
                        <Input
                          id="dim-depth"
                          type="number"
                          value={dimensions.depth}
                          onChange={(e) => setDimensions(prev => ({
                            ...prev,
                            depth: Number(e.target.value)
                          }))}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. SIMULATION PROPERTIES SECTION */}
            <div className="border rounded-lg p-4 bg-slate-50/50">
              <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">Simulation Properties</h4>
              
              <div className="space-y-4">
                {/* Temperature - Only for non-vent furniture */}
                {type !== 'vent' && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="temperature" className="text-right">
                      Temperature
                    </Label>
                    <Input
                      id="temperature"
                      type="number"
                      value={temperature}
                      onChange={(e) => setTemperature(Number(e.target.value))}
                      className="col-span-2"
                    />
                    <span className="text-sm">°C</span>
                  </div>
                )}

                {/* Material/Emissivity system for non-vent furniture */}
                {type !== 'vent' && (
                  <>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <div className="text-right flex items-center gap-2">
                        <Label htmlFor="material">Material</Label>
                        <div className="group relative">
                          <svg
                            className="w-4 h-4 text-gray-400 cursor-help"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                            <path d="M12 17h.01"></path>
                          </svg>
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none w-64 z-50">
                            <div className="text-center">
                              <strong>Emissivity (ε)</strong> controls how much thermal radiation the surface emits in CFD simulations. Higher values (0.8-0.95) represent better heat emission. Use Default (0.9) if unsure - it works well for most materials.
                            </div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                      <Select value={materialType} onValueChange={setMaterialType}>
                        <SelectTrigger className="col-span-3">
                          <SelectValue placeholder="Select material" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">
                            Default (ε = 0.90)
                          </SelectItem>
                          <SelectItem value="wood">
                            Wood (ε = 0.90)
                          </SelectItem>
                          <SelectItem value="metal">
                            Metal (Steel) (ε = 0.25)
                          </SelectItem>
                          <SelectItem value="glass">
                            Glass (ε = 0.92)
                          </SelectItem>
                          <SelectItem value="fabric">
                            Fabric/Textile (ε = 0.90)
                          </SelectItem>
                          <SelectItem value="plastic">
                            Plastic (ε = 0.90)
                          </SelectItem>
                          <SelectItem value="ceramic">
                            Ceramic/Tile (ε = 0.90)
                          </SelectItem>
                          <SelectItem value="concrete">
                            Concrete (ε = 0.90)
                          </SelectItem>
                          <SelectItem value="custom">
                            Custom
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Custom emissivity input when Custom material is selected */}
                    {materialType === 'custom' && (
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="custom-emissivity" className="text-right">
                          Emissivity
                        </Label>
                        <Input
                          id="custom-emissivity"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={Math.round(customEmissivity * 100) / 100}
                          onChange={(e) => setCustomEmissivity(Math.max(0, Math.min(1, Number(e.target.value))))}
                          className="col-span-2"
                        />
                        <span className="text-sm">ε (0.00-1.00)</span>
                      </div>
                    )}
                  </>
                )}

                {/* Vent-specific simulation properties only */}
                {type === 'vent' && (
                  <>
                    {/* Simulation Conditions section header */}
                    <div className="border-t border-slate-300 pt-4 mt-4">
                      <h5 className="font-medium text-sm mb-3 text-slate-600">Simulation Conditions</h5>
                    </div>

                    {/* Element Status */}
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="vent-state" className="text-right">
                        Element Status
                      </Label>
                      <Select value={simulationProperties.state} onValueChange={(value: 'open' | 'closed') => 
                        setSimulationProperties(prev => ({...prev, state: value}))}>
                        <SelectTrigger className="col-span-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Vent is open and allows airflow</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Air Inflow Temperature */}
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="air-temp" className="text-right">
                        Air Inflow Temperature
                      </Label>
                      <Input
                        id="air-temp"
                        type="number"
                        value={simulationProperties.airTemperature}
                        onChange={(e) => setSimulationProperties(prev => ({
                          ...prev, 
                          airTemperature: Number(e.target.value)
                        }))}
                        className="col-span-2"
                        placeholder="20"
                      />
                      <span className="text-sm">°C</span>
                    </div>
                    <p className="text-xs text-gray-500 col-span-4 text-right">
                      Temperature of air entering the room
                    </p>

                    {/* Air Direction */}
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="air-direction" className="text-right">
                        Air Direction
                      </Label>
                      <Select value={simulationProperties.airOrientation} onValueChange={(value: 'inflow' | 'outflow') => 
                        setSimulationProperties(prev => ({...prev, airOrientation: value}))}>
                        <SelectTrigger className="col-span-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inflow">Inflow (Air enters)</SelectItem>
                          <SelectItem value="outflow">Outflow (Air exits)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Air Orientation - Solo para vents con state open y airOrientation inflow */}
                    {simulationProperties.state === 'open' && simulationProperties.airOrientation === 'inflow' && (
                      <>
                        <div className="col-span-4 space-y-3 border-t border-slate-300 pt-3 mt-3">
                          <h6 className="font-medium text-sm text-slate-600">Air Orientation</h6>
                        </div>
                        
                        {/* Vertical Angle */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="vertical-angle" className="text-right">
                            Vertical Angle
                          </Label>
                          <Input
                            id="vertical-angle"
                            type="number"
                            min="-45"
                            max="45"
                            step="1"
                            value={simulationProperties.verticalAngle}
                            onChange={(e) => setSimulationProperties(prev => ({
                              ...prev, 
                              verticalAngle: Number(e.target.value)
                            }))}
                            className="col-span-2"
                            placeholder="0"
                          />
                          <span className="text-sm">degrees</span>
                        </div>
                        <p className="text-xs text-gray-500 col-span-4 text-right">
                          Up +45° to Down -45°
                        </p>

                        {/* Horizontal Angle */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="horizontal-angle" className="text-right">
                            Horizontal Angle
                          </Label>
                          <Input
                            id="horizontal-angle"
                            type="number"
                            min="-45"
                            max="45"
                            step="1"
                            value={simulationProperties.horizontalAngle}
                            onChange={(e) => setSimulationProperties(prev => ({
                              ...prev, 
                              horizontalAngle: Number(e.target.value)
                            }))}
                            className="col-span-2"
                            placeholder="0"
                          />
                          <span className="text-sm">degrees</span>
                        </div>
                        <p className="text-xs text-gray-500 col-span-4 text-right">
                          Left -45° to Right +45°
                        </p>
                      </>
                    )}

                    {/* Flow Type */}
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right text-xs text-slate-600">
                        Flow Type
                      </Label>
                      <div className="col-span-3 flex space-x-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="massflow"
                            name="flowType"
                            value="Air Mass Flow"
                            checked={simulationProperties.flowType === 'Air Mass Flow'}
                            onChange={(e) => setSimulationProperties(prev => ({...prev, flowType: e.target.value as 'Air Mass Flow' | 'Air Velocity' | 'Pressure'}))}
                            className="w-4 h-4 text-blue-600"
                          />
                          <Label htmlFor="massflow" className="text-xs">Mass Flow</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="velocity"
                            name="flowType"
                            value="Air Velocity"
                            checked={simulationProperties.flowType === 'Air Velocity'}
                            onChange={(e) => setSimulationProperties(prev => ({...prev, flowType: e.target.value as 'Air Mass Flow' | 'Air Velocity' | 'Pressure'}))}
                            className="w-4 h-4 text-blue-600"
                          />
                          <Label htmlFor="velocity" className="text-xs">Velocity</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="pressure"
                            name="flowType"
                            value="Pressure"
                            checked={simulationProperties.flowType === 'Pressure'}
                            onChange={(e) => setSimulationProperties(prev => ({...prev, flowType: e.target.value as 'Air Mass Flow' | 'Air Velocity' | 'Pressure'}))}
                            className="w-4 h-4 text-blue-600"
                          />
                          <Label htmlFor="pressure" className="text-xs">Pressure</Label>
                        </div>
                      </div>
                    </div>

                    {/* Flow Intensity */}
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="flow-intensity" className="text-right">
                        Flow Intensity
                      </Label>
                      <Select value={simulationProperties.flowIntensity} onValueChange={(value: 'low' | 'medium' | 'high' | 'custom') => 
                        setSimulationProperties(prev => ({...prev, flowIntensity: value}))}>
                        <SelectTrigger className="col-span-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {simulationProperties.flowType === 'Air Mass Flow' && (
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
                          {simulationProperties.flowType === 'Air Velocity' && (
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
                          {simulationProperties.flowType === 'Pressure' && (
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
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Custom Flow Value - only show when custom intensity is selected */}
                    {simulationProperties.flowIntensity === 'custom' && (
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="custom-flow-value" className="text-right">
                          Flow Value
                        </Label>
                        <Input
                          id="custom-flow-value"
                          type="number"
                          step="0.1"
                          value={simulationProperties.customIntensityValue}
                          onChange={(e) => setSimulationProperties(prev => ({
                            ...prev, 
                            customIntensityValue: Number(e.target.value)
                          }))}
                          className="col-span-2"
                        />
                        <span className="text-sm">
                          {simulationProperties.flowType === 'Air Mass Flow' ? 'm³/h' : 
                           simulationProperties.flowType === 'Air Velocity' ? 'm/s' : 'Pa'}
                        </span>
                      </div>
                    )}

                    {/* Air Orientation - Solo para vents con state open y airOrientation inflow */}
                    {simulationProperties.state === 'open' && simulationProperties.airOrientation === 'inflow' && (
                      <div className="col-span-4 space-y-3 border-t border-slate-300 pt-3 mt-3">
                        <h6 className="font-medium text-sm text-slate-600">Air Orientation</h6>
                        
                        {/* Vertical Angle */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="vertical-angle" className="text-right">
                            Vertical Angle
                          </Label>
                          <Input
                            id="vertical-angle"
                            type="number"
                            min="-45"
                            max="45"
                            step="1"
                            value={simulationProperties.verticalAngle}
                            onChange={(e) => setSimulationProperties(prev => ({
                              ...prev, 
                              verticalAngle: Number(e.target.value)
                            }))}
                            className="col-span-2"
                            placeholder="0"
                          />
                          <span className="text-sm">°</span>
                        </div>
                        <p className="text-xs text-gray-500 col-span-4 text-right">
                          Up +45° to Down -45°
                        </p>

                        {/* Horizontal Angle */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="horizontal-angle" className="text-right">
                            Horizontal Angle
                          </Label>
                          <Input
                            id="horizontal-angle"
                            type="number"
                            min="-45"
                            max="45"
                            step="1"
                            value={simulationProperties.horizontalAngle}
                            onChange={(e) => setSimulationProperties(prev => ({
                              ...prev, 
                              horizontalAngle: Number(e.target.value)
                            }))}
                            className="col-span-2"
                            placeholder="0"
                          />
                          <span className="text-sm">°</span>
                        </div>
                        <p className="text-xs text-gray-500 col-span-4 text-right">
                          Left -45° to Right +45°
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (onCancel) {
                  onCancel();
                }
                onClose();
              }}
            >
              {/* Phase 5: Adjust button labels based on mode */}
              {props.isCreationMode ? 'Cancel' : 'Close'}
            </Button>
            <Button type="submit">
              {isEditing ? 'Update' : 'Add'} {type}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}