import React from 'react';
import AirEntryDialog from './AirEntryDialog';
import type { FurnitureItem } from '@shared/furniture-types';

interface UnifiedVentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  onConfirm: (data: {
    name: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    properties?: {
      temperature?: number;
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
}

export default function UnifiedVentDialog(props: UnifiedVentDialogProps) {
  // Map FurnitureItem simulationProperties to AirEntry properties format
  const mapToAirEntryFormat = () => {
    const simProps = props.initialValues?.simulationProperties;
    
    return {
      width: 50, // Default vent dimensions (not used in 3D, but required by AirEntryDialog)
      height: 50,
      distanceToFloor: 120, // Default (not used in 3D)
      shape: 'rectangular' as const,
      properties: {
        state: simProps?.state || 'open',
        temperature: simProps?.airTemperature || 20,
        flowType: simProps?.flowType || 'Air Mass Flow',
        flowIntensity: simProps?.flowIntensity || 'medium',
        airOrientation: simProps?.airOrientation || 'inflow',
        customIntensityValue: simProps?.customIntensityValue || 0.5,
        // For AirEntryDialog, we need to include vertical/horizontal angles in a way it understands
        // The angles will be handled internally by the AirEntryDialog's vent logic
      }
    };
  };

  // Map AirEntry format back to FurnitureItem format
  const mapFromAirEntryFormat = (airEntryData: any) => {
    const furnitureData = {
      name: props.initialValues?.name || 'Vent',
      position: props.initialValues?.position || { x: 0, y: 0, z: 0 },
      rotation: props.initialValues?.rotation || { x: 0, y: 0, z: 0 },
      scale: props.initialValues?.scale || { x: 1, y: 1, z: 1 },
      properties: {
        temperature: airEntryData.properties?.temperature || 20
      },
      simulationProperties: {
        flowType: airEntryData.properties?.flowType || 'Air Mass Flow',
        flowValue: airEntryData.properties?.customIntensityValue || 0.5,
        flowIntensity: airEntryData.properties?.flowIntensity || 'medium',
        airOrientation: airEntryData.properties?.airOrientation || 'inflow',
        state: airEntryData.properties?.state || 'open',
        customIntensityValue: airEntryData.properties?.customIntensityValue || 0.5,
        verticalAngle: 0, // Will be set by AirEntryDialog's internal logic
        horizontalAngle: 0, // Will be set by AirEntryDialog's internal logic
        airTemperature: airEntryData.properties?.temperature || 20,
        normalVector: props.initialValues?.simulationProperties?.normalVector || { x: 0, y: 0, z: 1 }
      }
    };

    return furnitureData;
  };

  return (
    <AirEntryDialog
      type="vent"
      isOpen={props.isOpen}
      onClose={props.onClose}
      onCancel={props.onCancel}
      isCreating={props.isCreationMode}
      isEditing={props.isEditing}
      onConfirm={(data) => {
        const furnitureData = mapFromAirEntryFormat(data);
        props.onConfirm(furnitureData);
      }}
      initialValues={mapToAirEntryFormat()}
      // For 3D vents, we don't need wall context, but AirEntryDialog expects it
      // We'll provide minimal context to avoid errors
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