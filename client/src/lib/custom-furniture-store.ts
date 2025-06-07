import * as THREE from 'three';
import { FurnitureMenuItemData } from '@shared/furniture-types';

export interface CustomFurnitureData {
  id: string;
  name: string;
  geometry: THREE.BufferGeometry;
  originalFile: File;
  dimensions: { width: number; height: number; depth: number };
  createdAt: number;
}

class CustomFurnitureStore {
  private customFurniture: Map<string, CustomFurnitureData> = new Map();
  private listeners: Set<() => void> = new Set();
  private objectCounter: number = 0;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  addCustomFurniture(data: {
    name: string;
    geometry: THREE.BufferGeometry;
    originalFile: File;
  }): string {
    // Calculate dimensions from geometry bounding box
    data.geometry.computeBoundingBox();
    const boundingBox = data.geometry.boundingBox!;
    
    const width = Math.abs(boundingBox.max.x - boundingBox.min.x);
    const height = Math.abs(boundingBox.max.y - boundingBox.min.y);
    const depth = Math.abs(boundingBox.max.z - boundingBox.min.z);

    // Normalize dimensions to reasonable furniture scale (similar to table: 120x75x80)
    const maxDimension = Math.max(width, height, depth);
    const scaleFactor = maxDimension > 200 ? 120 / maxDimension : 1;

    const normalizedDimensions = {
      width: Math.round(width * scaleFactor),
      height: Math.round(height * scaleFactor),
      depth: Math.round(depth * scaleFactor)
    };

    // Increment counter and generate sequential name
    this.objectCounter++;
    const objectName = `Obj ${this.objectCounter}`;

    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const customData: CustomFurnitureData = {
      id,
      name: objectName,
      geometry: data.geometry.clone(), // Clone to avoid reference issues
      originalFile: data.originalFile,
      dimensions: normalizedDimensions,
      createdAt: Date.now()
    };

    this.customFurniture.set(id, customData);
    
    console.log('Custom Furniture Store: Added new item', {
      id,
      name: data.name,
      dimensions: normalizedDimensions,
      totalItems: this.customFurniture.size
    });
    
    this.notify();
    
    return id;
  }

  getCustomFurniture(id: string): CustomFurnitureData | undefined {
    return this.customFurniture.get(id);
  }

  getAllCustomFurniture(): CustomFurnitureData[] {
    return Array.from(this.customFurniture.values());
  }

  removeCustomFurniture(id: string): boolean {
    const success = this.customFurniture.delete(id);
    if (success) {
      this.notify();
    }
    return success;
  }

  // Convert custom furniture to menu items for the furniture menu
  getCustomFurnitureMenuItems(): FurnitureMenuItemData[] {
    return this.getAllCustomFurniture().map(item => ({
      id: item.id,
      name: item.name,
      icon: this.generateCustomIcon(item.name),
      defaultDimensions: item.dimensions
    }));
  }

  private generateCustomIcon(name: string): string {
    // Extract the object number from the name (e.g., "Obj 1" -> "1")
    const objectNumber = name.replace('Obj ', '');
    
    return `
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="32" height="32" rx="4" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>
        <text x="20" y="26" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#475569">${objectNumber}</text>
        <circle cx="32" cy="8" r="3" fill="#10b981"/>
      </svg>
    `;
  }

  clear() {
    this.customFurniture.clear();
    this.notify();
  }

  getCount(): number {
    return this.customFurniture.size;
  }
}

// Singleton instance
export const customFurnitureStore = new CustomFurnitureStore();