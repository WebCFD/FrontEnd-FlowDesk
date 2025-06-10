/**
 * Shared furniture types and interfaces
 * Used across Canvas3D, RoomSketchPro, and all furniture-related components
 */

export interface FurnitureItem {
  id: string;
  type: 'table' | 'person' | 'armchair' | 'car' | 'block' | 'vent' | 'custom';
  name: string; // Computed property that returns id - kept for backward compatibility
  floorName: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  dimensions: { width: number; height: number; depth: number };
  
  // Fields for furniture dialog
  information?: string;
  properties?: {
    material?: string;
    temperature?: number;
    thermalConductivity?: number;
    density?: number;
    heatCapacity?: number;
    emissivity?: number;
  };
  simulationProperties?: Record<string, any>; // Legacy field for backward compatibility
  
  // Internal tracking
  meshId?: string; // THREE.js mesh UUID for scene identification
  createdAt?: number;
  updatedAt?: number;
}

// Helper function to create furniture item with computed name
export const createFurnitureItem = (data: Omit<FurnitureItem, 'name'> & { name?: string }): FurnitureItem => ({
  ...data,
  name: data.name || data.id, // Name defaults to ID if not provided
});

export interface FurnitureMenuItemData {
  id: string;
  name: string;
  icon: string;
  defaultDimensions: { width: number; height: number; depth: number };
}

export interface FurnitureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  furnitureItem: FurnitureItem | null;
  onUpdate: (item: FurnitureItem) => void;
  onDelete: (itemId: string) => void;
}

export interface FurnitureCallbacks {
  onFurnitureAdd?: (item: FurnitureItem) => void;
  onUpdateFurniture?: (item: FurnitureItem) => void;
  onDeleteFurniture?: (itemId: string) => void;
}