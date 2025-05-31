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

interface StairPolygon {
  id: string;
  points: Point[];
  floor: string;
  direction?: "up" | "down";
  connectsTo?: string;
  isImported?: boolean;
  position3D?: {
    baseHeight: number;
    bottomZ: number;
    topZ: number;
  };
}

interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  hasClosedContour: boolean;
  name: string;
  stairPolygons?: StairPolygon[];
}

interface AirEntryMesh extends THREE.Mesh {
  userData: {
    entryIndex?: number;
    type?: string;
    index?: number;
    position?: Point;
    [key: string]: any;
  };
}

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
  getRelativeX: (pointX: number) => pointX - (800 / 2),
  getRelativeY: (pointY: number) => (600 / 2) - pointY,
  reverseTransformX: (relativeX: number) => relativeX / PIXELS_TO_CM + (800 / 2),
  reverseTransformY: (relativeY: number) => (600 / 2) - relativeY / PIXELS_TO_CM
};

// Centralized raycaster configuration
const RAYCASTER_CONFIG = {
  default: {
    Line: { threshold: 1.0 },
    Points: { threshold: 1.0 }
  },
  precision: {
    Line: { threshold: 0.5 },
    Points: { threshold: 0.5 }
  },
  hover: {
    Line: { threshold: 0.5 },
    Points: { threshold: 0.5 }
  }
};

// Debug configuration - disabled for production to keep console clean
const DEBUG_CONFIG = {
  enabled: false,
  categories: {
    mouseEvents: false,
    airEntryCreation: false,
    positionTracking: false,
    measurementMode: false,
    eraserMode: false,
    intersections: false,
    floorState: false
  }
};

// Core utility functions
const normalizeFloorName = (floorName: string): string => {
  return floorName.toLowerCase().replace(/\s+/g, '');
};

const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  const relativeX = point.x - CANVAS_CONFIG.centerX;
  const relativeY = CANVAS_CONFIG.centerY - point.y;

  return new THREE.Vector3(
    relativeX * PIXELS_TO_CM,
    relativeY * PIXELS_TO_CM,
    height,
  );
};

const applyRaycasterConfig = (raycaster: THREE.Raycaster, configType: keyof typeof RAYCASTER_CONFIG = 'default') => {
  const config = RAYCASTER_CONFIG[configType];
  raycaster.params.Line = config.Line;
  raycaster.params.Points = config.Points;
};

const debugLog = (category: keyof typeof DEBUG_CONFIG.categories, message: string, ...args: any[]) => {
  if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.categories[category]) {
    console.log(`[${category.toUpperCase()}] ${message}`, ...args);
  }
};

const createRoomPerimeter = (lines: Line[]): Point[] => {
  if (lines.length === 0) return [];

  const perimeter: Point[] = [];
  const pointToString = (p: Point) => `${p.x},${p.y}`;
  const arePointsEqual = (p1: Point, p2: Point, tolerance = 0.1) =>
    Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;

  const visited = new Set<string>();
  let currentPoint = lines[0].start;
  perimeter.push({ ...currentPoint });
  visited.add(pointToString(currentPoint));

  while (perimeter.length <= lines.length) {
    let nextPoint: Point | null = null;
    for (const line of lines) {
      if (arePointsEqual(line.start, currentPoint) && !visited.has(pointToString(line.end))) {
        nextPoint = line.end;
        break;
      } else if (arePointsEqual(line.end, currentPoint) && !visited.has(pointToString(line.start))) {
        nextPoint = line.start;
        break;
      }
    }

    if (!nextPoint || arePointsEqual(nextPoint, perimeter[0])) break;

    perimeter.push({ ...nextPoint });
    visited.add(pointToString(nextPoint));
    currentPoint = nextPoint;
  }

  return perimeter;
};

export default function Canvas3D({
  floors,
  currentFloor,
  ceilingHeight = 2.2,
  floorDeckThickness = 0.2,
  wallTransparency = 0.8,
  isMeasureMode = false,
  isEraserMode = false,
  simulationName,
  simulationType,
  isMultifloor = false,
  floorParameters,
  onUpdateAirEntry,
  onDeleteAirEntry,
  onViewChange
}: Canvas3DProps) {
  // Refs and state management
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const needsRenderRef = useRef(true);

  // State for interactions
  const [editingAirEntry, setEditingAirEntry] = useState<{
    index: number;
    entry: AirEntry;
  } | null>(null);

  const [debugInfo, setDebugInfo] = useState({
    mousePosition: "(0, 0)",
    eraserMode: false,
    hovering: false,
    lastIntersection: "none"
  });

  // Initialize 3D scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.2;
    controlsRef.current = controls;

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add grid
    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS);
    scene.add(gridHelper);

    // Render loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }

      if (needsRenderRef.current && rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        needsRenderRef.current = false;
      }
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      needsRenderRef.current = true;
    };
    
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Render floor data
  useEffect(() => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;
    
    // Clear existing geometry
    const objectsToRemove = scene.children.filter(child => 
      child.userData.type === 'wall' || 
      child.userData.type === 'floor' ||
      child.userData.type === 'air-entry'
    );
    objectsToRemove.forEach(obj => scene.remove(obj));

    // Render current floor
    const floorData = floors[currentFloor];
    if (!floorData || !floorData.hasClosedContour) return;

    const perimeter = createRoomPerimeter(floorData.lines);
    if (perimeter.length < 3) return;

    // Create floor geometry
    const floorShape = new THREE.Shape();
    const firstPoint = transform2DTo3D(perimeter[0]);
    floorShape.moveTo(firstPoint.x, firstPoint.y);
    
    for (let i = 1; i < perimeter.length; i++) {
      const point = transform2DTo3D(perimeter[i]);
      floorShape.lineTo(point.x, point.y);
    }

    // Create floor mesh
    const floorGeometry = new THREE.ShapeGeometry(floorShape);
    const floorMaterial = new THREE.MeshLambertMaterial({ 
      color: 0xcccccc,
      transparent: true,
      opacity: 0.8
    });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.userData.type = 'floor';
    scene.add(floorMesh);

    // Create walls
    floorData.lines.forEach((line) => {
      const start3D = transform2DTo3D(line.start);
      const end3D = transform2DTo3D(line.end);
      
      const wallLength = start3D.distanceTo(end3D);
      const wallGeometry = new THREE.BoxGeometry(wallLength, ceilingHeight, 0.1);
      const wallMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x8B4513,
        transparent: true,
        opacity: wallTransparency
      });
      
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      const midPoint = start3D.clone().add(end3D).multiplyScalar(0.5);
      wall.position.copy(midPoint);
      wall.position.z = ceilingHeight / 2;
      
      const angle = Math.atan2(end3D.y - start3D.y, end3D.x - start3D.x);
      wall.rotation.z = angle;
      wall.userData.type = 'wall';
      scene.add(wall);
    });

    // Create air entries
    floorData.airEntries.forEach((entry, index) => {
      const position3D = transform2DTo3D(entry.position);
      
      let geometry;
      let material;
      let height = entry.dimensions.height / 100;
      
      switch (entry.type) {
        case 'window':
          geometry = new THREE.BoxGeometry(
            entry.dimensions.width / 100,
            0.05,
            height
          );
          material = new THREE.MeshLambertMaterial({ color: 0x87CEEB, transparent: true, opacity: 0.7 });
          break;
        case 'door':
          geometry = new THREE.BoxGeometry(
            entry.dimensions.width / 100,
            0.05,
            height
          );
          material = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
          break;
        case 'vent':
          geometry = new THREE.BoxGeometry(
            entry.dimensions.width / 100,
            0.05,
            height
          );
          material = new THREE.MeshLambertMaterial({ color: 0x708090 });
          break;
        default:
          return;
      }
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position3D);
      mesh.position.z = (entry.dimensions.distanceToFloor || 0) / 100 + height / 2;
      mesh.userData = {
        type: entry.type,
        index,
        position: entry.position,
        entryIndex: index
      };
      scene.add(mesh);
    });

    needsRenderRef.current = true;
  }, [floors, currentFloor, ceilingHeight, wallTransparency]);

  return (
    <>
      <div ref={containerRef} className="w-full h-full relative">
        <div 
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: 'rgba(0,0,0,0.5)',
            color: 'white',
            padding: 10,
            borderRadius: 5,
            fontSize: 14,
            zIndex: 1000,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
        >
          <div><strong>DEBUG INFO</strong></div>
          <div>Mouse: {debugInfo.mousePosition}</div>
          <div>Eraser Mode: {debugInfo.eraserMode ? 'Active' : 'Inactive'}</div>
          <div>Hovering: {debugInfo.hovering ? 'YES' : 'no'}</div>
          <div>Last Intersection: {debugInfo.lastIntersection}</div>
        </div>
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
                dimensions
              });
            }
            setEditingAirEntry(null);
          }}
          initialValues={editingAirEntry.entry.dimensions}
          isEditing={true}
        />
      )}
    </>
  );
}

// Export shared geometry generation function
export const generateSharedFloorGeometry = (
  floors: Record<string, FloorData>,
  currentFloor: string,
  floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number }>
) => {
  const floorData = floors[currentFloor];
  if (!floorData || !floorData.hasClosedContour) {
    return { walls: [], airEntries: [], stairs: [] };
  }

  const localTransform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
    const relativeX = point.x - CANVAS_CONFIG.centerX;
    const relativeY = CANVAS_CONFIG.centerY - point.y;
    return new THREE.Vector3(relativeX * PIXELS_TO_CM, relativeY * PIXELS_TO_CM, height);
  };

  const walls: any[] = [];
  const airEntries: any[] = [];
  const stairs: any[] = [];

  // Generate walls
  floorData.lines.forEach((line: Line) => {
    const start3D = localTransform2DTo3D(line.start);
    const end3D = localTransform2DTo3D(line.end);
    walls.push({ start: start3D, end: end3D, line });
  });

  // Generate air entries
  floorData.airEntries.forEach((entry: AirEntry, index: number) => {
    const position3D = localTransform2DTo3D(entry.position);
    airEntries.push({ position: position3D, entry, index });
  });

  return { walls, airEntries, stairs };
};