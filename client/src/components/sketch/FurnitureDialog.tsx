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
      material: "wood",
      temperature: 20,
      thermalConductivity: 0.12,
      density: 600,
      heatCapacity: 1200
    }
  },
  armchair: {
    name: "Chair",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    properties: {
      material: "wood",
      temperature: 20,
      thermalConductivity: 0.12,
      density: 600,
      heatCapacity: 1200
    }
  },
  person: {
    name: "Person",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    properties: {
      material: "human",
      temperature: 37,
      thermalConductivity: 0.5,
      density: 1000,
      heatCapacity: 3500
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
      thermalConductivity: 45,
      density: 2700,
      heatCapacity: 900
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
      thermalConductivity: 1.4,
      density: 2400,
      heatCapacity: 880
    }
  },
  custom: {
    name: "Custom Object",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    dimensions: { width: 100, height: 100, depth: 100 },
    properties: {
      material: "mixed",
      temperature: 20,
      thermalConductivity: 1.0,
      density: 1500,
      heatCapacity: 1000
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
  const [materialType, setMaterialType] = useState("wood");
  const [temperature, setTemperature] = useState(20);
  const [thermalProperties, setThermalProperties] = useState({
    thermalConductivity: 0.12,
    density: 600,
    heatCapacity: 1200
  });
  
  // Estado para dimensiones (especialmente para objetos custom)
  const [dimensions, setDimensions] = useState({
    width: 100,
    height: 100,
    depth: 100
  });

  function getDefaultValues() {
    if (props.initialValues) return props.initialValues;
    return (furnitureDefaults as any)[type] || furnitureDefaults.table;
  }

  // Reset values when dialog opens with new type or initialValues
  useEffect(() => {
    if (dialogOpen) {
      const defaults = getDefaultValues();
      setValues(defaults);
      setFurnitureName(defaults.name);
      setMaterialType(defaults.properties?.material || "wood");
      setTemperature(defaults.properties?.temperature || 20);
      setThermalProperties({
        thermalConductivity: defaults.properties?.thermalConductivity || 0.12,
        density: defaults.properties?.density || 600,
        heatCapacity: defaults.properties?.heatCapacity || 1200
      });
      
      // Initialize dimensions for custom objects
      if (type === 'custom' && (defaults as any).dimensions) {
        setDimensions((defaults as any).dimensions);
      }
      
      if (defaults.position) {
        setElementPosition(defaults.position);
      }
    }
  }, [dialogOpen, type, isEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const furnitureData = {
      name: furnitureName,
      position: elementPosition,
      rotation: values.rotation,
      scale: values.scale,
      ...(type === 'custom' && { dimensions: dimensions }),
      properties: {
        material: materialType,
        temperature: temperature,
        thermalConductivity: thermalProperties.thermalConductivity,
        density: thermalProperties.density,
        heatCapacity: thermalProperties.heatCapacity
      }
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
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold capitalize">
                {isEditing ? `Edit ${type}` : `Add ${type}`}
              </h3>
              {/* Phase 5: Mode indicator enhancement */}
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                props.isCreationMode 
                  ? 'bg-green-100 text-green-700 border border-green-200' 
                  : 'bg-blue-100 text-blue-700 border border-blue-200'
              }`}>
                {props.isCreationMode ? 'Creating' : 'Editing'}
              </span>
            </div>
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
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="furniture-type" className="text-right">
                    Type
                  </Label>
                  <div className="col-span-3 px-3 py-2 bg-gray-100 rounded text-sm text-gray-600 capitalize">
                    {type}
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
                        value={elementPosition.x}
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
                        value={elementPosition.y}
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
                        value={elementPosition.z}
                        onChange={(e) => {
                          const newZ = Number(e.target.value);
                          const newPosition = { ...elementPosition, z: newZ };
                          setElementPosition(newPosition);
                          // Real-time update
                          if (onPositionUpdate) {
                            onPositionUpdate(newPosition);
                          }
                        }}
                        className="text-sm"
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
                        value={values.rotation.x * (180 / Math.PI)}
                        onChange={(e) => {
                          const newRotationX = Number(e.target.value) * (Math.PI / 180);
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
                        value={values.rotation.y * (180 / Math.PI)}
                        onChange={(e) => {
                          const newRotationY = Number(e.target.value) * (Math.PI / 180);
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
                        value={values.rotation.z * (180 / Math.PI)}
                        onChange={(e) => setValues(prev => ({
                          ...prev,
                          rotation: {
                            ...prev.rotation,
                            z: Number(e.target.value) * (Math.PI / 180)
                          }
                        }))}
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
                        value={values.scale.x}
                        onChange={(e) => setValues(prev => ({
                          ...prev,
                          scale: {
                            ...prev.scale,
                            x: Number(e.target.value)
                          }
                        }))}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="scale-y" className="text-xs">Y</Label>
                      <Input
                        id="scale-y"
                        type="number"
                        step="0.1"
                        value={values.scale.y}
                        onChange={(e) => setValues(prev => ({
                          ...prev,
                          scale: {
                            ...prev.scale,
                            y: Number(e.target.value)
                          }
                        }))}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="scale-z" className="text-xs">Z</Label>
                      <Input
                        id="scale-z"
                        type="number"
                        step="0.1"
                        value={values.scale.z}
                        onChange={(e) => setValues(prev => ({
                          ...prev,
                          scale: {
                            ...prev.scale,
                            z: Number(e.target.value)
                          }
                        }))}
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
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="material" className="text-right">
                    Material
                  </Label>
                  <Select value={materialType} onValueChange={setMaterialType}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wood">Wood</SelectItem>
                      <SelectItem value="metal">Metal</SelectItem>
                      <SelectItem value="plastic">Plastic</SelectItem>
                      <SelectItem value="fabric">Fabric</SelectItem>
                      <SelectItem value="glass">Glass</SelectItem>
                      <SelectItem value="human">Human Body</SelectItem>
                      <SelectItem value="concrete">Concrete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="thermal-conductivity" className="text-right">
                    Thermal Conductivity
                  </Label>
                  <Input
                    id="thermal-conductivity"
                    type="number"
                    step="0.01"
                    value={thermalProperties.thermalConductivity}
                    onChange={(e) => setThermalProperties(prev => ({
                      ...prev,
                      thermalConductivity: Number(e.target.value)
                    }))}
                    className="col-span-2"
                  />
                  <span className="text-sm">W/m·K</span>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="density" className="text-right">
                    Density
                  </Label>
                  <Input
                    id="density"
                    type="number"
                    value={thermalProperties.density}
                    onChange={(e) => setThermalProperties(prev => ({
                      ...prev,
                      density: Number(e.target.value)
                    }))}
                    className="col-span-2"
                  />
                  <span className="text-sm">kg/m³</span>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="heat-capacity" className="text-right">
                    Heat Capacity
                  </Label>
                  <Input
                    id="heat-capacity"
                    type="number"
                    value={thermalProperties.heatCapacity}
                    onChange={(e) => setThermalProperties(prev => ({
                      ...prev,
                      heatCapacity: Number(e.target.value)
                    }))}
                    className="col-span-2"
                  />
                  <span className="text-sm">J/kg·K</span>
                </div>
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