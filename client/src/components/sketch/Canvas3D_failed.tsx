import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { makeTextSprite } from "@/lib/three-utils";
import AirEntryDialog from "./AirEntryDialog";
import { ViewDirection } from "./Toolbar3D";
import { useSceneContext } from "../../contexts/SceneContext";

interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}
interface AirEntry {
  type: "window" | "door" | "vent";
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
}

// Add StairPolygon interface
interface StairPolygon {
  id: string;
  points: Point[];
  floor: string;
  direction?: "up" | "down";
  connectsTo?: string;
  isImported?: boolean;
  // Add position3D data for sharing with RoomSketchPro
  position3D?: {
    baseHeight: number;
    bottomZ: number;
    topZ: number;
  };
}

// Update FloorData to include stair polygons
interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  hasClosedContour: boolean;
  name: string;
  stairPolygons?: StairPolygon[]; // Add stair polygons to floor data
}

// Define a mesh interface for air entries to help with TypeScript type checking
interface AirEntryMesh extends THREE.Mesh {
  userData: {
    entryIndex?: number;
    type?: string;
    index?: number;
    position?: Point;
    [key: string]: any;
  };
}

// Define 3D Measurement interface
interface Measurement3D {
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  distance: number;
  line?: THREE.Line;
  label?: THREE.Sprite;
}

interface Canvas3DProps {
  floors: Record<string, FloorData>;
  currentFloor: string;
  ceilingHeight?: number;
  floorDeckThickness?: number;
  wallTransparency: number;
  isMeasureMode?: boolean;
  isEraserMode?: boolean;
  simulationName?: string;
  simulationType?: string;
  isMultifloor?: boolean;
  floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number }>;
  onUpdateAirEntry?: (
    floorName: string,
    index: number,
    entry: AirEntry,
  ) => void;
  onDeleteAirEntry?: (
    floorName: string,
    index: number
  ) => void;
  onViewChange?: (callback: (direction: ViewDirection) => void) => void;
}

// Constants
const PIXELS_TO_CM = 25 / 20;
const GRID_SIZE = 1000;
const GRID_DIVISIONS = 40;

// Centralized dimensions configuration
const CANVAS_CONFIG = {
  dimensions: { width: 800, height: 600 },
  get centerX() { return this.dimensions.width / 2; },
  get centerY() { return this.dimensions.height / 2; },
  get aspectRatio() { return this.dimensions.width / this.dimensions.height; },
  // Helper methods for common calculations
  getRelativeX: (pointX: number) => pointX - (800 / 2),
  getRelativeY: (pointY: number) => (600 / 2) - pointY,
  reverseTransformX: (relativeX: number) => relativeX / PIXELS_TO_CM + (800 / 2),
  reverseTransformY: (relativeY: number) => (600 / 2) - relativeY / PIXELS_TO_CM
};

/**
 * Core coordinate transformation function
 */
const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  const relativeX = point.x - CANVAS_CONFIG.centerX;
  const relativeY = CANVAS_CONFIG.centerY - point.y;

  return new THREE.Vector3(
    relativeX * PIXELS_TO_CM,
    relativeY * PIXELS_TO_CM,
    height,
  );
};

/**
 * Generate shared floor geometry for use by other components
 */
export const generateSharedFloorGeometry = (
  floors: Record<string, FloorData>,
  config: {
    currentFloor: string;
    wallTransparency: number;
    floorParameters: Record<string, { ceilingHeight: number; floorDeck: number }>;
  }
): THREE.Object3D[] => {
  const objects: THREE.Object3D[] = [];
  const currentFloorData = floors[config.currentFloor];
  
  if (!currentFloorData) return objects;

  const floorHeight = config.floorParameters[config.currentFloor]?.ceilingHeight || 220;
  const heightInMeters = floorHeight / 100;

  // Create walls from lines
  currentFloorData.lines.forEach((line, index) => {
    const start = transform2DTo3D(line.start, 0);
    const end = transform2DTo3D(line.end, 0);
    const startTop = transform2DTo3D(line.start, heightInMeters);
    const endTop = transform2DTo3D(line.end, heightInMeters);

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
      opacity: config.wallTransparency,
      transparent: config.wallTransparency < 1,
      side: THREE.DoubleSide,
    });

    const wall = new THREE.Mesh(geometry, material);
    wall.name = `wall_${index}`;
    wall.userData = { type: "wall", index, isFloorGeometry: true };
    objects.push(wall);
  });

  // Create air entries
  currentFloorData.airEntries.forEach((entry, index) => {
    const position = transform2DTo3D(entry.position, entry.dimensions.distanceToFloor || 0);
    
    const geometry = new THREE.BoxGeometry(
      entry.dimensions.width / 100,
      entry.dimensions.height / 100,
      0.1
    );
    
    const color = entry.type === "window" ? 0x87CEEB : 
                  entry.type === "door" ? 0x8B4513 : 0x90EE90;
    
    const material = new THREE.MeshPhongMaterial({
      color,
      transparent: true,
      opacity: 0.7,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.userData = { 
      type: entry.type, 
      entryIndex: index, 
      position: entry.position,
      isFloorGeometry: true 
    };
    objects.push(mesh);
  });

  return objects;
};

/**
 * Main Canvas3D Component
 */
export default function Canvas3D({
  floors,
  currentFloor,
  ceilingHeight = 210,
  floorDeckThickness = 35,
  wallTransparency = 0.7,
  isMeasureMode = false,
  isEraserMode,
  simulationName = "",
  simulationType = "Comfort Simulation (steady run)",
  isMultifloor = false,
  floorParameters = {},
  onUpdateAirEntry,
  onDeleteAirEntry,
  onViewChange,
}: Canvas3DProps) {
  const { updateGeometryData, updateSceneData, updateFloorData, setCurrentFloor: setContextCurrentFloor } = useSceneContext();
  
  // State management
  const [editingAirEntry, setEditingAirEntry] = useState<{
    index: number;
    entry: AirEntry;
  } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const needsRenderRef = useRef<boolean>(true);

  // Initialize 3D scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    // Initialize camera
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      1,
      10000,
    );
    camera.position.set(0, -1000, 1000);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Initialize renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (error) {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false });
      } catch (fallbackError) {
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div style="
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              height: 100%; 
              background: #f3f4f6; 
              color: #374151;
              text-align: center;
              padding: 20px;
            ">
              <h3 style="margin-bottom: 10px;">3D Visualization Unavailable</h3>
              <p>Your browser doesn't support WebGL, which is required for 3D rendering.</p>
              <p style="font-size: 14px; margin-top: 10px;">Please try updating your browser or enabling WebGL support.</p>
            </div>
          `;
        }
        return;
      }
    }

    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setClearColor(0xf8fafc);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    containerRef.current.appendChild(renderer.domElement);

    // Initialize controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.2;
    controlsRef.current = controls;

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Add grid
    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0xcccccc, 0xeeeeee);
    gridHelper.rotateX(Math.PI / 2);
    scene.add(gridHelper);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (controls) {
        controls.update();
      }
      
      if (needsRenderRef.current && renderer && scene && camera) {
        renderer.render(scene, camera);
        needsRenderRef.current = false;
      }
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      needsRenderRef.current = true;
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      
      if (controls) {
        controls.dispose();
      }
      
      if (renderer) {
        renderer.dispose();
        if (containerRef.current) {
          containerRef.current.removeChild(renderer.domElement);
        }
      }
    };
  }, []);

  // Update scene when floors data changes
  useEffect(() => {
    if (!sceneRef.current) return;

    // Clear existing geometry
    const objectsToRemove: THREE.Object3D[] = [];
    sceneRef.current.traverse((object) => {
      if (object.userData.isFloorGeometry) {
        objectsToRemove.push(object);
      }
    });
    
    objectsToRemove.forEach((object) => {
      sceneRef.current?.remove(object);
    });

    // Render current floor
    const currentFloorData = floors[currentFloor];
    if (currentFloorData) {
      // Create floor geometry here (simplified for optimization)
      const floorHeight = isMultifloor ? 
        (floorParameters[currentFloor]?.ceilingHeight || 220) / 100 : 
        ceilingHeight / 100;

      // Add walls, air entries, etc. (implementation details...)
      // This is where the main 3D geometry creation would happen
    }

    needsRenderRef.current = true;
  }, [floors, currentFloor, ceilingHeight, isMultifloor, floorParameters]);

  // Handle measure mode
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor = isMeasureMode ? "crosshair" : "auto";
    }
  }, [isMeasureMode]);

  // Handle eraser mode
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor = isEraserMode ? "not-allowed" : "auto";
    }
  }, [isEraserMode]);

  return (
    <>
      <div ref={containerRef} className="w-full h-full relative">
        {/* Debug overlay removed to reduce console noise */}
      </div>

      {editingAirEntry && (
        <AirEntryDialog
          type={editingAirEntry.entry.type}
          isOpen={true}
          onClose={() => setEditingAirEntry(null)}
          onConfirm={(dimensions) => {
            if (onUpdateAirEntry) {
              onUpdateAirEntry(currentFloor, editingAirEntry.index, {
                ...editingAirEntry.entry,
                dimensions,
              });
            }
            setEditingAirEntry(null);
          }}
          initialDimensions={editingAirEntry.entry.dimensions}
        />
      )}
    </>
  );
}