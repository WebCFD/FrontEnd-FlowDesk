import * as THREE from 'three';
import { FurnitureMenuItemData, FurnitureItem } from '@shared/furniture-types';

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
  
  // Phase 5.3: Geometry caching and memory optimization
  private geometryCache: Map<string, THREE.BufferGeometry> = new Map();
  private usageCounter: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup every 5 minutes
    this.startPeriodicCleanup();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  // Phase 5.3: Memory optimization methods
  private startPeriodicCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupUnusedGeometries();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private generateGeometryKey(geometry: THREE.BufferGeometry): string {
    // Generate a unique key based on geometry properties
    const positionArray = geometry.getAttribute('position').array;
    const hash = Array.from(positionArray.slice(0, 12)).join(','); // Use first 12 vertices for hash
    return `geom_${hash}_${positionArray.length}`;
  }

  addCustomFurniture(
    data: {
      name: string;
      geometry: THREE.BufferGeometry;
      originalFile: File;
      dimensions?: { width: number; height: number; depth: number };
    },
    floorContext: {
      floorName: string;
      existingFurniture: FurnitureItem[];
    }
  ): string {
    // Phase 5.3: Implement geometry caching
    const geometryKey = this.generateGeometryKey(data.geometry);
    let cachedGeometry = this.geometryCache.get(geometryKey);
    
    if (!cachedGeometry) {
      // Cache new geometry
      cachedGeometry = data.geometry.clone();
      this.geometryCache.set(geometryKey, cachedGeometry);
      this.usageCounter.set(geometryKey, 1);
      console.log('Custom Furniture Store: Cached new geometry', geometryKey);
    } else {
      // Increment usage counter for existing geometry
      const currentUsage = this.usageCounter.get(geometryKey) || 0;
      this.usageCounter.set(geometryKey, currentUsage + 1);
      console.log('Custom Furniture Store: Reusing cached geometry', geometryKey, 'usage:', currentUsage + 1);
    }
    
    // Use provided dimensions if available, otherwise calculate from geometry
    let normalizedDimensions;
    
    if (data.dimensions) {
      // Use the dimensions provided by STL processor (already in cm)
      normalizedDimensions = data.dimensions;
    } else {
      // Fallback: Calculate dimensions from geometry bounding box
      cachedGeometry.computeBoundingBox();
      const boundingBox = cachedGeometry.boundingBox!;
      
      const width = Math.abs(boundingBox.max.x - boundingBox.min.x);
      const height = Math.abs(boundingBox.max.y - boundingBox.min.y);
      const depth = Math.abs(boundingBox.max.z - boundingBox.min.z);

      // Treat 1 unit = 1 cm
      normalizedDimensions = {
        width: Math.round(width * 100),
        height: Math.round(height * 100),
        depth: Math.round(depth * 100)
      };
    }

    // PHASE 3: Generate floor-aware ID using same system as standard furniture
    const getFloorPrefix = (floorName: string): string => {
      switch (floorName) {
        case 'ground': return '0F';
        case 'first': return '1F';
        case 'second': return '2F';
        case 'third': return '3F';
        case 'fourth': return '4F';
        case 'fifth': return '5F';
        default: return '0F';
      }
    };

    const generateCustomId = (floorName: string, existingFurniture: FurnitureItem[]): string => {
      const floorPrefix = getFloorPrefix(floorName);
      
      // Count existing custom furniture on this floor
      const customCount = existingFurniture.filter(item => 
        item.type === 'custom' && item.floorName === floorName
      ).length + 1;
      
      return `Obj ${floorPrefix}-${customCount}`;
    };

    const id = generateCustomId(floorContext.floorName, floorContext.existingFurniture);
    const objectName = id; // Name is same as ID
    
    const customData: CustomFurnitureData = {
      id,
      name: objectName,
      geometry: cachedGeometry, // Use cached geometry
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
    this.objectCounter = 0; // Reset counter on full clear
    this.notify();
  }

  // Phase 5: Cleanup methods for different application states
  
  // DelFurn Tool: Only remove specific furniture instance, preserve definitions
  removeInstanceOnly(id: string): boolean {
    // For DelFurn, we don't remove from the store - just from scene
    // The custom furniture definition remains available for reuse
    console.log('Custom Furniture Store: DelFurn - preserving definition for', id);
    return true;
  }
  
  // Memory optimization: Clean up unused geometries
  cleanupUnusedGeometries() {
    const geometriesToRemove: string[] = [];
    let cleanedCount = 0;
    
    // Find geometries with zero usage
    for (const [key, usage] of this.usageCounter.entries()) {
      if (usage <= 0) {
        const geometry = this.geometryCache.get(key);
        if (geometry) {
          geometry.dispose(); // Dispose Three.js geometry
          geometriesToRemove.push(key);
          cleanedCount++;
        }
      }
    }
    
    // Remove from cache and usage counter
    geometriesToRemove.forEach(key => {
      this.geometryCache.delete(key);
      this.usageCounter.delete(key);
    });
    
    const totalCached = this.geometryCache.size;
    console.log(`Custom Furniture Store: Memory cleanup completed. Cleaned ${cleanedCount} geometries, ${totalCached} remaining in cache`);
    
    return { cleaned: cleanedCount, remaining: totalCached };
  }

  // Enhanced removal method with proper usage tracking
  removeCustomFurniture(id: string): boolean {
    const item = this.customFurniture.get(id);
    if (!item) return false;
    
    // Decrement usage counter for the geometry
    const geometryKey = this.generateGeometryKey(item.geometry);
    const currentUsage = this.usageCounter.get(geometryKey) || 0;
    
    if (currentUsage > 0) {
      this.usageCounter.set(geometryKey, currentUsage - 1);
      console.log(`Custom Furniture Store: Decremented usage for geometry ${geometryKey}, new usage: ${currentUsage - 1}`);
    }
    
    const success = this.customFurniture.delete(id);
    if (success) {
      this.notify();
    }
    return success;
  }

  // Erase Design: Clear all custom furniture definitions and reset counter
  clearAllDefinitions() {
    console.log('Custom Furniture Store: Clearing all definitions (Erase Design)');
    
    // Dispose all cached geometries
    for (const geometry of this.geometryCache.values()) {
      geometry.dispose();
    }
    
    this.customFurniture.clear();
    this.geometryCache.clear();
    this.usageCounter.clear();
    this.objectCounter = 0;
    this.notify();
  }

  // Logout: Complete reset including all data and counter
  reset() {
    console.log('Custom Furniture Store: Complete reset (Logout)');
    
    // Stop cleanup interval
    this.stopPeriodicCleanup();
    
    // Dispose all cached geometries
    for (const geometry of this.geometryCache.values()) {
      geometry.dispose();
    }
    
    this.customFurniture.clear();
    this.geometryCache.clear();
    this.usageCounter.clear();
    this.objectCounter = 0;
    
    // Restart cleanup interval
    this.startPeriodicCleanup();
    
    this.notify();
  }

  // Memory diagnostic methods for validation
  getMemoryStats() {
    return {
      customFurnitureCount: this.customFurniture.size,
      cachedGeometriesCount: this.geometryCache.size,
      totalUsageCount: Array.from(this.usageCounter.values()).reduce((sum, usage) => sum + usage, 0),
      unusedGeometriesCount: Array.from(this.usageCounter.values()).filter(usage => usage <= 0).length
    };
  }

  // Force cleanup validation - useful for debugging memory leaks
  validateMemoryIntegrity(): boolean {
    const stats = this.getMemoryStats();
    console.log('Custom Furniture Store: Memory integrity check', stats);
    
    // Check for orphaned geometries
    const hasOrphanedGeometries = stats.unusedGeometriesCount > 0;
    if (hasOrphanedGeometries) {
      console.warn('Custom Furniture Store: Found orphaned geometries, triggering cleanup');
      this.cleanupUnusedGeometries();
    }
    
    return !hasOrphanedGeometries;
  }

  // Complete system validation and cleanup
  performSystemCleanup(): { 
    memoryStats: ReturnType<typeof this.getMemoryStats>;
    cleanupResults: ReturnType<typeof this.cleanupUnusedGeometries>;
    integrityValid: boolean;
  } {
    console.log('Custom Furniture Store: Performing comprehensive system cleanup');
    
    const initialStats = this.getMemoryStats();
    const cleanupResults = this.cleanupUnusedGeometries();
    const finalIntegrity = this.validateMemoryIntegrity();
    const finalStats = this.getMemoryStats();
    
    return {
      memoryStats: finalStats,
      cleanupResults,
      integrityValid: finalIntegrity
    };
  }

  getCount(): number {
    return this.customFurniture.size;
  }
}

// Singleton instance
export const customFurnitureStore = new CustomFurnitureStore();