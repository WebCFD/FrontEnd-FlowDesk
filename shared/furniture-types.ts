/**
 * Shared furniture types and interfaces
 * Used across Canvas3D, RoomSketchPro, and all furniture-related components
 */

export interface FurnitureItem {
  id: string;
  type: 'table' | 'person' | 'armchair' | 'car' | 'block' | 'vent' | 'custom';
  name: string;
  floorName: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  dimensions: { width: number; height: number; depth: number };
  
  // Fields for furniture dialog
  information?: string;
  simulationProperties?: Record<string, any>;
  
  // Internal tracking
  meshId?: string; // THREE.js mesh UUID for scene identification
  createdAt?: number;
  updatedAt?: number;
}

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