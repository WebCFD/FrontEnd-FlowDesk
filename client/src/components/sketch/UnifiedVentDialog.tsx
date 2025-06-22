import React, { useState } from 'react';
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
  // State to track current dimensions for accurate real-time updates
  const [currentDimensions, setCurrentDimensions] = useState(() => {
    const scale = props.initialValues?.scale || { x: 1, y: 1, z: 1 };
    return {
      width: scale.x * 50,
      height: scale.y * 50  // Corrected: Height maps to Y (vertical) not Z (depth)
    };
  });

  // State to track current position and rotation for accurate real-time updates
  const [currentPosition, setCurrentPosition] = useState(() => {
    return props.initialValues?.position || { x: 0, y: 0, z: 0 };
  });
  
  const [currentRotation, setCurrentRotation] = useState(() => {
    return props.initialValues?.rotation || { x: 0, y: 0, z: 0 };
  });

  // No useEffect needed - state is initialized correctly and should not reset to initial values
  // The currentDimensions state should maintain user changes, not be overridden by props

  // Map FurnitureItem simulationProperties to AirEntry properties format
  const mapToAirEntryFormat = () => {
    const simProps = props.initialValues?.simulationProperties;
    
    return {
      width: currentDimensions.width, // Use current state instead of initial values
      height: currentDimensions.height, // Use current state instead of initial values
      distanceToFloor: 120, // Default (not used in 3D)
      position: currentPosition, // Use current state instead of initial values
      rotation: currentRotation, // Use current state instead of initial values
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
    // Calculate scale from current dimensions state
    const newScaleX = (airEntryData.width || currentDimensions.width) / 50; // width to scale.x
    const newScaleY = (airEntryData.height || currentDimensions.height) / 50; // height to scale.y (corrected)
    
    const furnitureData = {
      name: props.initialValues?.name || 'Vent',
      position: airEntryData.position || currentPosition,
      rotation: airEntryData.rotation || currentRotation,
      scale: { 
        x: newScaleX, 
        y: newScaleY, // Height controls Y scale (vertical)
        z: props.initialValues?.scale?.z || 1  // Keep Z scale unchanged (depth)
      },
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
      mode="furnVent"
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
      // Add dimensions update callback for real-time updates
      onDimensionsUpdate={(newDimensions) => {
        // Update current dimensions state with proper fallbacks
        const updatedDimensions = {
          width: newDimensions.width ?? currentDimensions.width,
          height: newDimensions.height ?? currentDimensions.height
        };
        
        setCurrentDimensions(updatedDimensions);
        
        if (props.onScaleUpdate) {
          const newScaleX = updatedDimensions.width / 50;
          const newScaleY = updatedDimensions.height / 50;  // Corrected: Height to Y scale
          
          props.onScaleUpdate({
            x: newScaleX,
            y: newScaleY,  // Height controls Y scale (vertical)
            z: props.initialValues?.scale?.z || 1  // Keep Z scale unchanged (depth)
          });
        }
      }}
      // Add position and rotation update callbacks for real-time updates
      onPositionUpdate={(newPosition) => {
        setCurrentPosition(newPosition); // Update current state
        if (props.onPositionUpdate) {
          props.onPositionUpdate(newPosition);
        }
      }}
      onRotationUpdate={(newRotation) => {
        setCurrentRotation(newRotation); // Update current state
        if (props.onRotationUpdate) {
          props.onRotationUpdate(newRotation);
        }
      }}
      // Pass floor context for Information section
      floorContext={props.floorContext}
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