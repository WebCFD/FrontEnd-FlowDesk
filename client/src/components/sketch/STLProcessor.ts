import * as THREE from 'three';
import { customFurnitureStore } from '@/lib/custom-furniture-store';

export interface ProcessedSTLData {
  id: string;
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  mesh: THREE.Mesh;
  dimensions: { width: number; height: number; depth: number };
  thumbnail?: string;
}

export class STLProcessor {
  private static instance: STLProcessor;
  private renderer: THREE.WebGLRenderer | null = null;
  private thumbnailCamera: THREE.PerspectiveCamera;
  private thumbnailScene: THREE.Scene;

  constructor() {
    // Setup thumbnail generation components
    this.thumbnailCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.thumbnailScene = new THREE.Scene();
    this.thumbnailScene.background = new THREE.Color(0xf8f9fa);
    
    // Add lighting for thumbnail
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.thumbnailScene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    this.thumbnailScene.add(directionalLight);
  }

  static getInstance(): STLProcessor {
    if (!STLProcessor.instance) {
      STLProcessor.instance = new STLProcessor();
    }
    return STLProcessor.instance;
  }

  /**
   * Create a default matte material for STL objects (similar to Block element)
   */
  private createDefaultMaterial(): THREE.Material {
    return new THREE.MeshLambertMaterial({
      color: 0xf5f5f5, // Very light gray, almost white
      side: THREE.DoubleSide // Ensure visibility from both sides
    });
  }

  /**
   * Calculate dimensions treating 1 STL unit = 1 cm (no scaling applied)
   */
  private calculateDimensions(geometry: THREE.BufferGeometry): { 
    scaleFactor: number; 
    dimensions: { width: number; height: number; depth: number } 
  } {
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox!;
    
    const width = Math.abs(boundingBox.max.x - boundingBox.min.x);
    const height = Math.abs(boundingBox.max.y - boundingBox.min.y);
    const depth = Math.abs(boundingBox.max.z - boundingBox.min.z);

    // Treat 1 STL unit = 1 cm, no geometry scaling applied
    const dimensions = {
      width: Math.round(width * 100), // Convert to cm for storage
      height: Math.round(height * 100),
      depth: Math.round(depth * 100)
    };

    return { scaleFactor: 1, dimensions };
  }

  /**
   * Generate a thumbnail image for the STL object
   */
  private async generateThumbnail(mesh: THREE.Mesh): Promise<string> {
    try {
      // Initialize renderer if not already done
      if (!this.renderer) {
        this.renderer = new THREE.WebGLRenderer({ 
          antialias: true, 
          alpha: true,
          preserveDrawingBuffer: true
        });
        this.renderer.setSize(64, 64); // Small thumbnail size
        this.renderer.setClearColor(0xf8f9fa, 1);
      }

      // Clone mesh for thumbnail generation
      const thumbnailMesh = mesh.clone();
      this.thumbnailScene.add(thumbnailMesh);

      // Position camera to view the entire object
      const boundingBox = new THREE.Box3().setFromObject(thumbnailMesh);
      const center = boundingBox.getCenter(new THREE.Vector3());
      const size = boundingBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      this.thumbnailCamera.position.set(
        center.x + maxDim * 1.5,
        center.y + maxDim * 1.5,
        center.z + maxDim * 1.5
      );
      this.thumbnailCamera.lookAt(center);

      // Render thumbnail
      this.renderer.render(this.thumbnailScene, this.thumbnailCamera);
      
      // Extract image data
      const canvas = this.renderer.domElement;
      const thumbnailDataURL = canvas.toDataURL('image/png');

      // Cleanup
      this.thumbnailScene.remove(thumbnailMesh);

      return thumbnailDataURL;
    } catch (error) {
      console.warn('Thumbnail generation failed:', error);
      return ''; // Return empty string if thumbnail generation fails
    }
  }

  /**
   * Process STL geometry into a complete furniture object
   */
  async processSTLGeometry(
    geometry: THREE.BufferGeometry, 
    originalName: string,
    originalFile: File,
    floorContext?: {
      floorName: string;
      existingFurniture: any[];
    }
  ): Promise<ProcessedSTLData> {
    // Ensure geometry has proper normals
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    // Center the geometry at origin
    geometry.center();

    // Calculate dimensions without scaling
    const { scaleFactor, dimensions } = this.calculateDimensions(geometry);

    // Create material
    const material = this.createDefaultMaterial();

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);

    // Generate sequential name and add to store
    const storeId = customFurnitureStore.addCustomFurniture(
      {
        name: originalName,
        geometry: geometry.clone(),
        originalFile,
        dimensions: dimensions
      },
      floorContext || {
        floorName: 'ground', // Default to ground floor if no context provided
        existingFurniture: []
      }
    );

    // Get the actual assigned name from store (e.g., "Obj 1")
    const storeData = customFurnitureStore.getCustomFurniture(storeId);
    const assignedName = storeData?.name || originalName;

    // Generate thumbnail
    const thumbnail = await this.generateThumbnail(mesh);

    console.log('STL Processor: Completed processing', {
      name: assignedName,
      scaleFactor,
      dimensions,
      vertices: geometry.attributes.position.count,
      hasThumbnail: !!thumbnail
    });

    return {
      id: storeId,
      name: assignedName,
      geometry,
      material,
      mesh,
      dimensions,
      thumbnail
    };
  }

  /**
   * Create a mesh from stored STL data (for drag & drop)
   */
  createMeshFromStored(storeId: string): THREE.Mesh | null {
    const storeData = customFurnitureStore.getCustomFurniture(storeId);
    if (!storeData) {
      // Silently handle missing STL objects (likely from previous sessions)
      return null;
    }

    const material = this.createDefaultMaterial();
    const mesh = new THREE.Mesh(storeData.geometry.clone(), material);
    
    return mesh;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}