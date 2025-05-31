import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useCanvas3DGeometry } from "@/hooks/useCanvas3DGeometry";
import { 
  Point, 
  Line, 
  AirEntry, 
  FloorData,
  GeometryConfig 
} from "@/lib/geometryEngine";

interface FurnitureItem {
  id: string;
  name: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

interface RoomSketchProProps {
  width?: number;
  height?: number;
  instanceId?: string;
  lines?: Line[];
  airEntries?: AirEntry[];
  roomHeight?: number;
  onFurnitureAdd?: (item: FurnitureItem) => void;
  wallTransparency: number;
  onWallTransparencyChange: (value: number) => void;
  currentFloor?: string;
  floors?: Record<string, FloorData>;
  onComponentMount?: () => void;
}

export function RoomSketchPro({
  width = 800,
  height = 600,
  instanceId = "default",
  lines = [],
  airEntries = [],
  roomHeight = 2.5,
  onFurnitureAdd,
  wallTransparency,
  onWallTransparencyChange,
  currentFloor,
  floors,
  onComponentMount,
}: RoomSketchProProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Resolve geometry data based on current floor or direct props
  const resolveGeometryData = (): Record<string, FloorData> => {
    if (floors && currentFloor && floors[currentFloor]) {
      return floors;
    }
    
    // Fallback: create floor data from direct props
    const fallbackFloor: FloorData = {
      lines: lines,
      airEntries: airEntries,
      hasClosedContour: lines.length > 2,
      name: currentFloor || 'default'
    };
    
    return {
      [currentFloor || 'default']: fallbackFloor
    };
  };

  // Prepare geometry configuration
  const geometryConfig: GeometryConfig = {
    currentFloor: currentFloor || 'default',
    wallTransparency,
    defaultCeilingHeight: roomHeight,
    defaultFloorDeck: 0,
    presentationMode: true, // This is the key difference - RSP is in presentation mode
    floorParameters: {
      [currentFloor || 'default']: {
        ceilingHeight: roomHeight,
        floorDeck: 0
      }
    }
  };

  // Use the shared Canvas3D geometry hook
  const {
    scene,
    camera,
    renderer,
    controls,
    objects,
    updateGeometry,
    cleanup
  } = useCanvas3DGeometry({
    floors: resolveGeometryData(),
    config: geometryConfig,
    containerRef,
    width,
    height,
    presentationMode: true
  });

  // Enhanced materials for presentation mode
  const enhancePresentationMaterials = () => {
    if (!scene) return;

    objects.forEach(obj => {
      if (obj instanceof THREE.Mesh) {
        const material = obj.material as THREE.MeshStandardMaterial;
        
        // Enhanced materials for better presentation
        switch (obj.userData?.type) {
          case 'wall':
            material.color.setHex(0xf5f5f5); // Light gray
            material.roughness = 0.8;
            material.metalness = 0.1;
            break;
          case 'floor':
            material.color.setHex(0xe0e0e0); // Darker gray
            material.roughness = 0.9;
            material.metalness = 0.05;
            break;
          case 'window':
            material.color.setHex(0x87CEEB); // Sky blue
            material.transparent = true;
            material.opacity = 0.6;
            material.roughness = 0.1;
            material.metalness = 0.9;
            break;
          case 'door':
            material.color.setHex(0x8B4513); // Saddle brown
            material.roughness = 0.7;
            material.metalness = 0.2;
            break;
          case 'vent':
            material.color.setHex(0x696969); // Dim gray
            material.roughness = 0.3;
            material.metalness = 0.8;
            break;
        }
      }
    });
  };

  // Main useEffect for setting up the 3D scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    console.log("RoomSketchPro - Setting up 3D scene with shared Canvas3D geometry");

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(DEFAULTS.BACKGROUND_COLOR);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Append canvas to container
    container.appendChild(renderer.domElement);

    // Setup scene, camera, and lighting
    const scene = setupScene();
    sceneRef.current = scene;

    const camera = setupCamera();
    cameraRef.current = camera;

    setupRenderer();

    // Setup controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.2;
    controlsRef.current = controls;

    // Create walls and geometry using shared Canvas3D functions
    createWalls(scene, renderer, camera);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      
      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
      
      rendererRef.current.setSize(newWidth, newHeight);
    };
    
    window.addEventListener('resize', handleResize);

    // Add drag and drop support for furniture
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const itemData = event.dataTransfer?.getData("application/json");
      if (itemData) {
        const item = JSON.parse(itemData);
        addFurnitureToScene(item);
      }
    };

    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    });
    container.addEventListener("drop", handleDrop);

    // Call onComponentMount if provided
    if (onComponentMount) {
      onComponentMount();
    }

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (container) {
        container.removeEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer!.dropEffect = "copy";
        });
        container.removeEventListener("drop", handleDrop);
      }
      
      if (renderer) {
        renderer.dispose();
        if (containerRef.current) {
          containerRef.current.removeChild(renderer.domElement);
        }
      }
    };
  }, [width, height, currentFloor, floors, roomHeight, onComponentMount]);

  // Wall transparency effect
  useEffect(() => {
    if (wallMaterialRef.current) {
      wallMaterialRef.current.transparent = wallTransparency < 1;
      wallMaterialRef.current.opacity = wallTransparency;
    }
  }, [wallTransparency]);

  // Helper function to add furniture to the scene
  const addFurnitureToScene = (item: FurnitureItem) => {
    if (!sceneRef.current) return;
    console.log("RoomSketchPro - Adding furniture item:", item);
    // Implementation for adding furniture would go here
    if (onFurnitureAdd) {
      onFurnitureAdd(item);
    }
  };

  // Component render
  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-gray-100"
      style={{ minHeight: '400px' }}
    >
      {/* Wall transparency controls */}
      <div className="absolute top-2 right-2 z-10 bg-white p-2 rounded shadow">
        <label className="block text-xs mb-1">Wall Transparency</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={wallTransparency}
          onChange={(e) => onWallTransparencyChange(parseFloat(e.target.value))}
          className="w-20"
        />
      </div>
    </div>
  );
}