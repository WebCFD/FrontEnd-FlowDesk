import React, { useState, useCallback, useEffect } from 'react';
import AirEntryDialog from './AirEntryDialog';
import type { FurnitureItem } from '@shared/furniture-types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface UnifiedVentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  furnitureType?: string;
  onConfirm: (data: {
    name: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    properties?: {
      temperature?: number;
      material?: string;
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
      ventRotation?: number;
      shape?: 'rectangular' | 'circular';
      airTemperature?: number;
      normalVector?: { x: number; y: number; z: number };
    };
  }) => void;
  isCreationMode?: boolean;
  isEditing?: boolean;
  initialValues?: {
    name: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    properties?: {
      temperature?: number;
      material?: string;
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
      ventRotation?: number;
      shape?: 'rectangular' | 'circular';
      diameter?: number;
      airTemperature?: number;
      normalVector?: { x: number; y: number; z: number };
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
  onPropertiesUpdate?: (properties: {
    state?: 'open' | 'closed';
    temperature?: number;
    airOrientation?: 'inflow' | 'outflow';
    flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
    flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
    customIntensityValue?: number;
    verticalAngle?: number;
    horizontalAngle?: number;
    ventRotation?: number;
    airTemperature?: number;
  }) => void;
  debugKey?: string;
}

const BOX_BASE = { width: 500, height: 1500, depth: 500 };

const CHASSIS_EMISSIVITY: Record<string, number> = {
  default: 0.90,
  wood: 0.90,
  metal: 0.25,
  glass: 0.84,
  concrete: 0.91,
  painted: 0.92,
};

export default function UnifiedVentDialog(props: UnifiedVentDialogProps) {
  const {
    onPositionUpdate,
    onRotationUpdate,
    onScaleUpdate,
    onPropertiesUpdate,
    debugKey,
    furnitureType
  } = props;

  const isTopVentBox = furnitureType === 'topVentBox';

  // Stable callback references to prevent stale closures
  const stableOnPositionUpdate = useCallback((position: { x: number; y: number; z: number }) => {
    if (onPositionUpdate) {
      onPositionUpdate(position);
    }
  }, [onPositionUpdate]);

  const stableOnRotationUpdate = useCallback((rotation: { x: number; y: number; z: number }) => {
    if (onRotationUpdate) {
      onRotationUpdate(rotation);
    }
  }, [onRotationUpdate]);

  const stableOnScaleUpdate = useCallback((scale: { x: number; y: number; z: number }) => {
    if (onScaleUpdate) {
      onScaleUpdate(scale);
    }
  }, [onScaleUpdate]);

  const stableOnPropertiesUpdate = useCallback((properties: {
    state?: 'open' | 'closed';
    temperature?: number;
    airOrientation?: 'inflow' | 'outflow';
    flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
    flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
    customIntensityValue?: number;
    verticalAngle?: number;
    horizontalAngle?: number;
    ventRotation?: number;
    airTemperature?: number;
  }) => {
    if (onPropertiesUpdate) {
      onPropertiesUpdate(properties);
    }
  }, [onPropertiesUpdate]);

  useEffect(() => {
    // Callback monitoring for debugging
  }, [onPositionUpdate, onRotationUpdate, onScaleUpdate, onPropertiesUpdate, debugKey]);

  // State to track current dimensions for accurate real-time updates
  const [currentDimensions, setCurrentDimensions] = useState(() => {
    const scale = props.initialValues?.scale || { x: 1, y: 1, z: 1 };
    return {
      width: scale.x * 50,
      height: scale.y * 50
    };
  });

  // State to track vent rotation (degrees, 0-360)
  const [currentVentRotation, setCurrentVentRotation] = useState(() => {
    return props.initialValues?.simulationProperties?.ventRotation || 0;
  });

  // State to track vent shape
  const [currentShape, setCurrentShape] = useState<'rectangular' | 'circular'>(() => {
    return props.initialValues?.simulationProperties?.shape || 'rectangular';
  });

  // State to track current position and rotation for accurate real-time updates
  const [currentPosition, setCurrentPosition] = useState(() => {
    return props.initialValues?.position || { x: 0, y: 0, z: 0 };
  });
  
  const [currentRotation, setCurrentRotation] = useState(() => {
    const rotation = props.initialValues?.rotation || { x: 0, y: 0, z: 0 };
    console.log('🔄 [DIALOG INIT] UnifiedVentDialog rotation radians:', rotation);
    console.log('🔄 [DIALOG INIT] UnifiedVentDialog rotation degrees:', {
      x: rotation.x * 180 / Math.PI,
      y: rotation.y * 180 / Math.PI,
      z: rotation.z * 180 / Math.PI
    });
    return rotation;
  });

  // ── TopVentBox-specific state ─────────────────────────────────────────────

  const [boxDims, setBoxDims] = useState(() => {
    if (isTopVentBox && props.initialValues?.scale) {
      const s = props.initialValues.scale;
      return {
        width: Math.round(s.x * BOX_BASE.width),
        height: Math.round(s.z * BOX_BASE.height),
        depth: Math.round(s.y * BOX_BASE.depth),
      };
    }
    return { ...BOX_BASE };
  });

  const [chassisTemp, setChassisTemp] = useState<number>(() => {
    return props.initialValues?.properties?.temperature ?? 40;
  });

  const [chassisMaterial, setChassisMaterial] = useState<string>(() => {
    return props.initialValues?.properties?.material || 'metal';
  });

  // ─────────────────────────────────────────────────────────────────────────

  // Map FurnitureItem simulationProperties to AirEntry properties format
  const mapToAirEntryFormat = () => {
    const simProps = props.initialValues?.simulationProperties;
    
    return {
      width: currentShape === 'circular' ? (simProps?.diameter || currentDimensions.width) : currentDimensions.width,
      height: currentShape === 'circular' ? (simProps?.diameter || currentDimensions.height) : currentDimensions.height,
      distanceToFloor: 120,
      position: currentPosition,
      rotation: currentRotation,
      shape: currentShape,
      properties: {
        state: simProps?.state || 'open',
        temperature: simProps?.airTemperature || 20,
        material: (simProps as any)?.material || (simProps?.state === 'open' ? 'air' : 'default'),
        emissivity: (simProps as any)?.emissivity ?? (simProps?.state === 'open' ? 0.05 : 0.90),
        flowType: simProps?.flowType || 'Air Mass Flow',
        flowIntensity: simProps?.flowIntensity || 'medium',
        airOrientation: simProps?.airOrientation || 'inflow',
        customIntensityValue: simProps?.customIntensityValue || 0.5,
        verticalAngle: simProps?.verticalAngle || 0,
        horizontalAngle: simProps?.horizontalAngle || 0,
        ventRotation: currentVentRotation,
      }
    };
  };

  // Map AirEntry format back to FurnitureItem format
  const mapFromAirEntryFormat = (airEntryData: any) => {
    let scale: { x: number; y: number; z: number };

    if (isTopVentBox) {
      scale = {
        x: boxDims.width / BOX_BASE.width,
        y: boxDims.depth / BOX_BASE.depth,
        z: boxDims.height / BOX_BASE.height,
      };
    } else {
      const newScaleX = (airEntryData.width || currentDimensions.width) / 50;
      const newScaleY = (airEntryData.height || currentDimensions.height) / 50;
      scale = {
        x: newScaleX,
        y: newScaleY,
        z: props.initialValues?.scale?.z || 1
      };
    }

    const defaultName = isTopVentBox ? 'Vent Top Box' : 'Vent';
    const chassisEmissivity = CHASSIS_EMISSIVITY[chassisMaterial] ?? 0.90;

    const furnitureData = {
      name: props.initialValues?.name || defaultName,
      position: airEntryData.position || currentPosition,
      rotation: currentRotation,
      scale,
      properties: isTopVentBox
        ? {
            temperature: chassisTemp,
            material: chassisMaterial,
            emissivity: chassisEmissivity,
          }
        : {
            temperature: airEntryData.properties?.temperature || 20,
            material: airEntryData.properties?.material || 'default',
            emissivity: airEntryData.properties?.emissivity ?? 0.90
          },
      simulationProperties: {
        flowType: airEntryData.properties?.flowType || 'Air Mass Flow',
        flowValue: airEntryData.properties?.customIntensityValue || 0.5,
        flowIntensity: airEntryData.properties?.flowIntensity || 'medium',
        airOrientation: airEntryData.properties?.airOrientation || 'inflow',
        state: airEntryData.properties?.state || 'open',
        material: airEntryData.properties?.material || (airEntryData.properties?.state === 'open' ? 'air' : 'default'),
        emissivity: airEntryData.properties?.emissivity ?? (airEntryData.properties?.state === 'open' ? 0.05 : 0.90),
        customIntensityValue: airEntryData.properties?.customIntensityValue || 0.5,
        verticalAngle: airEntryData.properties?.verticalAngle || 0,
        horizontalAngle: airEntryData.properties?.horizontalAngle || 0,
        ventRotation: airEntryData.properties?.ventRotation ?? currentVentRotation,
        shape: airEntryData.shape || currentShape,
        airTemperature: airEntryData.properties?.temperature || 20,
        normalVector: props.initialValues?.simulationProperties?.normalVector || { x: 0, y: 0, z: 1 }
      }
    };

    return furnitureData;
  };

  // ── TopVentBox extra sections (injected into AirEntryDialog) ─────────────

  const topSectionContent = isTopVentBox ? (
    <>
      {/* Box Dimensions */}
      <div className="border rounded-lg p-4 bg-slate-50/50">
        <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">
          Box Dimensions (mm)
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="box-width" className="text-xs">Width</Label>
            <Input
              id="box-width"
              type="number"
              step="10"
              min="100"
              value={boxDims.width}
              onChange={(e) => {
                const mm = Number(e.target.value);
                const updated = { ...boxDims, width: mm };
                setBoxDims(updated);
                stableOnScaleUpdate({
                  x: mm / BOX_BASE.width,
                  y: updated.depth / BOX_BASE.depth,
                  z: updated.height / BOX_BASE.height,
                });
              }}
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="box-height" className="text-xs">Height</Label>
            <Input
              id="box-height"
              type="number"
              step="10"
              min="100"
              value={boxDims.height}
              onChange={(e) => {
                const mm = Number(e.target.value);
                const updated = { ...boxDims, height: mm };
                setBoxDims(updated);
                stableOnScaleUpdate({
                  x: updated.width / BOX_BASE.width,
                  y: updated.depth / BOX_BASE.depth,
                  z: mm / BOX_BASE.height,
                });
              }}
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="box-depth" className="text-xs">Depth</Label>
            <Input
              id="box-depth"
              type="number"
              step="10"
              min="100"
              value={boxDims.depth}
              onChange={(e) => {
                const mm = Number(e.target.value);
                const updated = { ...boxDims, depth: mm };
                setBoxDims(updated);
                stableOnScaleUpdate({
                  x: updated.width / BOX_BASE.width,
                  y: mm / BOX_BASE.depth,
                  z: updated.height / BOX_BASE.height,
                });
              }}
              className="text-sm"
            />
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Default box: 500 × 1500 × 500 mm</p>
      </div>

      {/* Chassis Properties */}
      <div className="border rounded-lg p-4 bg-slate-50/50">
        <h4 className="font-medium text-sm mb-4 text-slate-700 border-b border-slate-200 pb-2">
          Simulation Chassis Properties
        </h4>
        <div className="space-y-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="chassis-temp" className="text-right text-sm">
              Temperature Chassis
            </Label>
            <Input
              id="chassis-temp"
              type="number"
              value={chassisTemp}
              onChange={(e) => setChassisTemp(Number(e.target.value))}
              className="col-span-2"
            />
            <span className="text-sm">°C</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="chassis-material" className="text-right text-sm">
              Material Chassis
            </Label>
            <Select value={chassisMaterial} onValueChange={setChassisMaterial}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select material" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default (ε = 0.90)</SelectItem>
                <SelectItem value="wood">Wood (ε = 0.90)</SelectItem>
                <SelectItem value="metal">Metal (Steel) (ε = 0.25)</SelectItem>
                <SelectItem value="glass">Glass (ε = 0.84)</SelectItem>
                <SelectItem value="concrete">Concrete (ε = 0.91)</SelectItem>
                <SelectItem value="painted">Painted Surface (ε = 0.92)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </>
  ) : undefined;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AirEntryDialog
      type="vent"
      mode="furnVent"
      isOpen={props.isOpen}
      onClose={props.onClose}
      onCancel={props.onCancel}
      isCreating={props.isCreationMode}
      isEditing={props.isEditing}
      dialogTitle={isTopVentBox ? 'Vent Top Box' : undefined}
      topSectionContent={topSectionContent}
      hideDimensionsSection={isTopVentBox}
      onConfirm={(data) => {
        const furnitureData = mapFromAirEntryFormat(data);
        props.onConfirm(furnitureData);
      }}
      initialValues={mapToAirEntryFormat()}
      position={currentPosition}
      rotation={currentRotation}
      onDimensionsUpdate={(newDimensions) => {
        if (isTopVentBox) return; // Dimensions handled via boxDims state for topVentBox
        const updatedDimensions = {
          width: newDimensions.width ?? currentDimensions.width,
          height: newDimensions.height ?? currentDimensions.height
        };
        
        setCurrentDimensions(updatedDimensions);
        
        const newScaleX = updatedDimensions.width / 50;
        const newScaleY = updatedDimensions.height / 50;
        
        stableOnScaleUpdate({
          x: newScaleX,
          y: newScaleY,
          z: props.initialValues?.scale?.z || 1
        });

        if ((newDimensions as any).shape) {
          const newShape = (newDimensions as any).shape as 'rectangular' | 'circular';
          setCurrentShape(newShape);
          stableOnPropertiesUpdate({ shape: newShape } as any);
        }
      }}
      onPositionUpdate={(newPosition) => {
        const pos3d = newPosition as { x: number; y: number; z: number };
        setCurrentPosition(pos3d);
        stableOnPositionUpdate(pos3d);
      }}
      onRotationUpdate={(newRotation) => {
        setCurrentRotation(newRotation);
        stableOnRotationUpdate(newRotation);
      }}
      onPropertiesUpdate={(newProperties) => {
        const mappedProperties = {
          state: newProperties.state,
          temperature: newProperties.temperature,
          material: (newProperties as any).material,
          emissivity: (newProperties as any).emissivity,
          airOrientation: newProperties.airOrientation as 'inflow' | 'outflow' | undefined,
          flowIntensity: newProperties.flowIntensity,
          flowType: newProperties.flowType,
          customIntensityValue: newProperties.customIntensityValue,
          verticalAngle: newProperties.verticalAngle,
          horizontalAngle: newProperties.horizontalAngle,
          airTemperature: newProperties.temperature,
        };
        
        stableOnPropertiesUpdate(mappedProperties);

        if (newProperties.ventRotation !== undefined) {
          setCurrentVentRotation(newProperties.ventRotation);
          const rotationRad = newProperties.ventRotation * Math.PI / 180;
          const newRotation = { ...currentRotation, z: rotationRad };
          setCurrentRotation(newRotation);
          stableOnRotationUpdate(newRotation);
        }
      }}
      floorContext={props.floorContext}
      wallContext={{
        wallId: `3d_vent_${props.floorContext?.floorName || 'unknown'}`,
        floorName: props.floorContext?.floorName || 'Ground Floor',
        wallStart: { x: 0, y: 0 },
        wallEnd: { x: 100, y: 0 },
        clickPosition: { 
          x: props.floorContext?.clickPosition?.x || 0, 
          y: props.floorContext?.clickPosition?.z || 0 
        },
        ceilingHeight: props.floorContext?.floorHeight || 220
      }}
    />
  );
}
