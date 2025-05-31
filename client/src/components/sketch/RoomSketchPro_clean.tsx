import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { Canvas3D } from "./Canvas3D";

// Import types and constants
interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

interface AirEntry {
  type: "vent" | "door" | "window";
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
}

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
  floors?: Record<string, {
    lines: Line[];
    airEntries: AirEntry[];
    stairPolygons?: any[];
  }>;
  onComponentMount?: () => void;
}

const DEFAULTS = {
  ROOM_HEIGHT: 2.5,
  PIXELS_TO_CM: 1,
  BACKGROUND_COLOR: 0xf0f0f0,
};

export function RoomSketchPro({
  width = 800,
  height = 600,
  instanceId = "default",
  lines = [],
  airEntries = [],
  roomHeight = DEFAULTS.ROOM_HEIGHT,
  onFurnitureAdd,
  wallTransparency,
  onWallTransparencyChange,
  currentFloor,
  floors,
  onComponentMount,
}: RoomSketchProProps) {
  // Refs for Three.js objects
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const wallMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Helper function to transform 2D to 3D coordinates
  const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
    return new THREE.Vector3(
      point.x * DEFAULTS.PIXELS_TO_CM,
      height,
      -point.y * DEFAULTS.PIXELS_TO_CM
    );
  };

  // Resolve geometry data based on current floor or direct props
  const resolveGeometryData = () => {
    if (floors && currentFloor && floors[currentFloor]) {
      const floorData = floors[currentFloor];
      return {
        currentLines: floorData.lines || [],
        currentAirEntries: floorData.airEntries || [],
      };
    }
    return {
      currentLines: lines,
      currentAirEntries: airEntries,
    };
  };

  // Setup scene
  const setupScene = () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(DEFAULTS.BACKGROUND_COLOR);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    return scene;
  };

  // Setup camera
  const setupCamera = () => {
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    return camera;
  };

  // Setup renderer
  const setupRenderer = () => {
    if (!containerRef.current || !rendererRef.current) return;
    
    rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    rendererRef.current.setClearColor(DEFAULTS.BACKGROUND_COLOR);
    rendererRef.current.shadowMap.enabled = true;
    rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;
  };

  // Create walls using shared Canvas3D geometry generation
  const createWalls = (scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => {
    if (!scene) return;

    const { currentLines, currentAirEntries } = resolveGeometryData();

    // Use Canvas3D's generateSharedFloorGeometry for identical representation
    try {
      const geometryData = Canvas3D.generateSharedFloorGeometry(currentLines, currentAirEntries, roomHeight);
      
      // Create walls from geometry data
      if (geometryData.walls) {
        geometryData.walls.forEach((wallData, index) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wallData.vertices), 3));
          geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(wallData.uvs), 2));
          geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(wallData.indices), 1));
          geometry.computeVertexNormals();

          const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            opacity: wallTransparency,
            transparent: wallTransparency < 1,
            side: THREE.DoubleSide,
          });

          if (!wallMaterialRef.current) {
            wallMaterialRef.current = material;
          }

          const wall = new THREE.Mesh(geometry, wallMaterialRef.current);
          wall.name = `wall_${index}`;
          wall.userData = { type: "wall", index };
          scene.add(wall);
        });
      }

      // Create floor
      if (geometryData.floor) {
        const floorGeometry = new THREE.BufferGeometry();
        floorGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(geometryData.floor.vertices), 3));
        floorGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometryData.floor.uvs), 2));
        floorGeometry.setIndex(new THREE.BufferAttribute(new Uint16Array(geometryData.floor.indices), 1));
        floorGeometry.computeVertexNormals();

        const floorMaterial = new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          side: THREE.DoubleSide,
        });

        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.name = 'floor';
        floor.userData = { type: "floor" };
        scene.add(floor);
      }

      // Create air entries
      if (geometryData.airEntries) {
        geometryData.airEntries.forEach((entryData, index) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(entryData.vertices), 3));
          geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(entryData.uvs), 2));
          geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(entryData.indices), 1));
          geometry.computeVertexNormals();

          const material = new THREE.MeshStandardMaterial({
            color: entryData.type === 'door' ? 0x8B4513 : entryData.type === 'window' ? 0x87CEEB : 0x808080,
            opacity: entryData.type === 'window' ? 0.7 : 1.0,
            transparent: entryData.type === 'window',
          });

          const airEntry = new THREE.Mesh(geometry, material);
          airEntry.name = `${entryData.type}_${index}`;
          airEntry.userData = { type: entryData.type, index };
          scene.add(airEntry);
        });
      }

    } catch (error) {
      console.warn('RoomSketchPro - Error creating walls with shared geometry:', error);
      
      // Fallback to simple wall creation if shared geometry fails
      currentLines.forEach((line, index) => {
        const start = transform2DTo3D(line.start, 0);
        const end = transform2DTo3D(line.end, 0);
        const startTop = transform2DTo3D(line.start, roomHeight);
        const endTop = transform2DTo3D(line.end, roomHeight);

        const vertices = new Float32Array([
          start.x, start.y, start.z,
          end.x, end.y, end.z,
          startTop.x, startTop.y, startTop.z,
          endTop.x, endTop.y, endTop.z,
        ]);

        const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
        const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          opacity: wallTransparency,
          transparent: wallTransparency < 1,
          side: THREE.DoubleSide,
        });

        const wall = new THREE.Mesh(geometry, material);
        wall.name = `wall_${index}`;
        scene.add(wall);
      });
    }
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