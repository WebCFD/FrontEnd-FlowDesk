import { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { makeTextSprite } from "@/lib/three-utils";
import { createTableModel, createPersonModel, createArmchairModel } from "./furniture-models";
import { useSceneContext } from "../../contexts/SceneContext";

// Types
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
  onComponentMount?: () => void; // New prop for tracking data flow
}

// Constants
const DEFAULTS = {
  ROOM_HEIGHT: 210,
  PIXELS_TO_CM: 25 / 20,
  GRID_SIZE: 1000, // Match Canvas3D grid size
  GRID_DIVISIONS: 40, // Match Canvas3D grid divisions
  BACKGROUND_COLOR: 0xf8fafc,
  WALL_COLOR: 0x3b82f6,
  FLOOR_COLOR: 0x808080, // Original floor color
  ROOF_COLOR: 0xe0e0e0,
};

// Helper functions
const roomUtils = {
  // Transform 2D point to 3D space (XY plane as ground, Z as height)
  transform2DTo3D: (point: Point, height: number = 0): THREE.Vector3 => {
    // Access the component's props through width and height parameters
    // from the parent component (value is set in the RoomSketchPro component props)
    const centerX = 800 / 2; // Use the same dimensions as Canvas2D/3D
    const centerY = 600 / 2; // Use the same dimensions as Canvas2D/3D

    const relativeX = point.x - centerX;
    const relativeY = centerY - point.y;

    return new THREE.Vector3(
      relativeX * DEFAULTS.PIXELS_TO_CM,
      relativeY * DEFAULTS.PIXELS_TO_CM,
      height, // Z is height
    );
  },

  // Create a closed polygon from line segments using proper graph traversal
  createRoomPerimeter: (lines: Line[]): Point[] => {
    if (lines.length === 0) return [];

    // Function to check if two points are approximately equal
    const arePointsEqual = (p1: Point, p2: Point, tolerance = 1): boolean => {
      const dx = Math.abs(p1.x - p2.x);
      const dy = Math.abs(p1.y - p2.y);
      return dx <= tolerance && dy <= tolerance;
    };

    // Function to get a unique point identifier
    const pointToString = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;

    // Create a graph of connected points
    const pointGraph = new Map<string, Point[]>();
    const allPoints = new Set<string>();

    lines.forEach((line) => {
      const startKey = pointToString(line.start);
      const endKey = pointToString(line.end);

      allPoints.add(startKey);
      allPoints.add(endKey);

      if (!pointGraph.has(startKey)) pointGraph.set(startKey, []);
      if (!pointGraph.has(endKey)) pointGraph.set(endKey, []);

      // Don't add duplicate connections
      const startConnections = pointGraph.get(startKey)!;
      if (!startConnections.some((p) => pointToString(p) === endKey)) {
        startConnections.push(line.end);
      }

      const endConnections = pointGraph.get(endKey)!;
      if (!endConnections.some((p) => pointToString(p) === startKey)) {
        endConnections.push(line.start);
      }
    });

    // Find points with only one connection (likely perimeter endpoints)
    const findEndpoints = (): Point[] => {
      const endpoints: Point[] = [];
      pointGraph.forEach((connections, pointKey) => {
        if (connections.length <= 1) {
          const [x, y] = pointKey.split(",").map(Number);
          endpoints.push({ x, y });
        }
      });
      return endpoints;
    };

    // Start from a perimeter endpoint if available, otherwise use first point
    const endpoints = findEndpoints();
    let startPoint: Point;

    if (endpoints.length > 0) {
      startPoint = endpoints[0];
    } else {
      // If no endpoints, use a point with the fewest connections
      let minConnections = Infinity;
      let minPoint: Point | null = null;

      pointGraph.forEach((connections, pointKey) => {
        if (connections.length < minConnections) {
          const [x, y] = pointKey.split(",").map(Number);
          minPoint = { x, y };
          minConnections = connections.length;
        }
      });

      startPoint = minPoint || lines[0].start;
    }

    // Trace the perimeter using graph traversal
    const perimeter: Point[] = [startPoint];
    const visited = new Set<string>([pointToString(startPoint)]);
    let currentPoint = startPoint;

    while (true) {
      const currentKey = pointToString(currentPoint);
      const neighbors = pointGraph.get(currentKey) || [];

      // Find unvisited neighbor
      const nextPoint = neighbors.find((p) => !visited.has(pointToString(p)));

      if (!nextPoint) {
        // Try to close the loop if possible
        if (
          perimeter.length > 2 &&
          arePointsEqual(perimeter[0], neighbors[0]) &&
          perimeter.length !== neighbors.length + 1
        ) {
          perimeter.push(perimeter[0]); // Close the loop
        }
        break;
      }

      perimeter.push(nextPoint);
      visited.add(pointToString(nextPoint));
      currentPoint = nextPoint;
    }

    // Verify we created a closed loop
    if (
      perimeter.length > 2 &&
      !arePointsEqual(perimeter[0], perimeter[perimeter.length - 1])
    ) {
      perimeter.push(perimeter[0]); // Ensure loop is closed
    }

    return perimeter;
  },

  // Create a THREE.Shape from perimeter points (in XY plane)
  createShapeFromPerimeter: (perimeter: Point[]): THREE.Shape | null => {
    if (perimeter.length < 3) return null;

    const shape = new THREE.Shape();
    const firstPoint = roomUtils.transform2DTo3D(perimeter[0]);

    shape.moveTo(firstPoint.x, firstPoint.y); // Using X and Y for the shape

    for (let i = 1; i < perimeter.length; i++) {
      const point = roomUtils.transform2DTo3D(perimeter[i]);
      shape.lineTo(point.x, point.y);
    }

    return shape;
  },

  // Calculate angle between two points (for air entry rotation)
  getAngleBetweenPoints: (start: Point, end: Point): number => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return Math.atan2(dy, dx);
  },
};

const transform2DTo3D = roomUtils.transform2DTo3D;
const createRoomPerimeter = roomUtils.createRoomPerimeter;
const ROOM_HEIGHT = DEFAULTS.ROOM_HEIGHT;

// Utility function to normalize floor names consistently across application
const normalizeFloorName = (floorName: string): string => {
  // Convert to lowercase and remove spaces - ensure consistent keys
  return floorName.toLowerCase().replace(/\s+/g, '');
};

export function RoomSketchPro({
  width = 800,  // Set default width to match Canvas3D
  height = 600, // Set default height to match Canvas3D
  instanceId = "default",
  lines = [],
  airEntries = [],
  roomHeight = DEFAULTS.ROOM_HEIGHT,
  onFurnitureAdd,
  wallTransparency = 0.8,
  onWallTransparencyChange,
  currentFloor,
  floors,
  onComponentMount,
}: RoomSketchProProps) {
  // Get data from SceneContext
  const { geometryData } = useSceneContext();
  
  // Add logging to debug the component
  console.log("RoomSketchPro - Component Props:", { 
    width, height, instanceId, lines, airEntries, roomHeight, wallTransparency, currentFloor, floors
  });
  console.log("RoomSketchPro - SceneContext geometryData:", geometryData);
  
  // Monitor geometryData changes
  useEffect(() => {
    console.log("RoomSketchPro - geometryData changed in context:", geometryData);
    
    if (!geometryData) {
      console.warn("RoomSketchPro - geometryData is null or undefined in context");
    } else {
      console.log(`RoomSketchPro - geometryData contains ${geometryData.lines?.length || 0} lines and ${geometryData.airEntries?.length || 0} air entries`);
    }
    
    // Check if we have a valid scene to update
    if (sceneRef.current && rendererRef.current && cameraRef.current && geometryData) {
      console.log("RoomSketchPro - Attempting to update scene with new geometryData");
      // We could trigger redrawing walls and air entries here if needed
    }
  }, [geometryData]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);

  // Refs for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const floorRef = useRef<THREE.Mesh | null>(null);
  const wallMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const animationRef = useRef<boolean>(false);
  const animationFrameIdRef = useRef<number>();

  // Setup scene and lighting
  const setupScene = () => {
    if (!containerRef.current) return null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add directional light
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 100, 100);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Add floor plane for reference grid - use floor size from context if available, otherwise use default (1000x1000)
    const floorSize = geometryData?.floorSize || 1000;
    const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc, // Keep original color
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.z = 0; // Place at z=0
    floor.receiveShadow = true;
    scene.add(floor);
    floorRef.current = floor;

    // Removed grid helper as requested
    
    // Use both props and context to get a complete list of floors
    const floorsFromProps = floors ? Object.keys(floors) : [];
    const floorsFromContext = geometryData?.floors ? Object.keys(geometryData.floors) : [];
    const allFloors = [...new Set([...floorsFromProps, ...floorsFromContext])];
    
    console.log("RoomSketchPro - Setting up multifloor visualization for floors:", allFloors);
    
    // Add floor planes for each floor level (will be properly positioned in createMultiFloor)
    if (allFloors.length > 1) {
      console.log("RoomSketchPro - Setting up multifloor visualization");
    }

    return scene;
  };

  // Setup camera function with settings matching Canvas3D
  const setupCamera = () => {
    const camera = new THREE.PerspectiveCamera(
      45,  // Match Canvas3D's field of view
      width / height,
      1,
      10000  // Match Canvas3D's far plane
    );
    camera.position.set(0, 0, 1000); // Match Canvas3D's camera position
    camera.lookAt(0, 0, 0);
    return camera;
  };

  // Add the setupRenderer function after setupCamera
  const setupRenderer = () => {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Make the renderer's DOM element fill its container, similar to Canvas3D
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block'; // Ensures no extra space
    
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return renderer;
  };

  // Handle furniture drop with updated plane intersection
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    console.log("Drop event triggered");

    if (
      !sceneRef.current ||
      !cameraRef.current ||
      !rendererRef.current ||
      !floorRef.current
    ) {
      console.error("Required refs not initialized");
      return;
    }

    const itemData = e.dataTransfer?.getData("application/json");
    if (!itemData) {
      console.error("No item data in drop event");
      return;
    }

    const item = JSON.parse(itemData);
    console.log("Processing dropped item:", item);

    // Get drop coordinates
    const rect = containerRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    console.log("Normalized coordinates:", { x, y });

    // Setup raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    // Cast ray to floor
    const intersects = raycaster.intersectObject(floorRef.current);

    if (intersects.length > 0) {
      const intersectionPoint = intersects[0].point;
      console.log("Intersection point:", intersectionPoint);

      // Create debug sphere at intersection point
      const debugSphere = new THREE.Mesh(
        new THREE.SphereGeometry(2),
        new THREE.MeshBasicMaterial({ color: 0xff0000 }),
      );
      debugSphere.position.copy(intersectionPoint);
      sceneRef.current.add(debugSphere);

      // Create furniture based on type
      let model: THREE.Object3D | null = null;
      switch (item.id) {
        case "table":
          model = createTableModel();
          break;
        case "person":
          model = createPersonModel();
          break;
        case "armchair":
          model = createArmchairModel();
          break;
        default:
          console.error("Unknown furniture type:", item.id);
          return;
      }

      if (model) {
        // Position model at intersection point
        model.position.copy(intersectionPoint);
        model.castShadow = true;
        model.receiveShadow = true;

        // Add to scene
        sceneRef.current.add(model);
        console.log(`Added ${item.id} to scene at:`, model.position);

        // Update furniture state
        const newItem: FurnitureItem = {
          id: item.id,
          name: item.name,
          position: intersectionPoint.clone(),
          rotation: new THREE.Euler(),
        };

        setFurniture((prev) => [...prev, newItem]);
        onFurnitureAdd?.(newItem);

        // Force a render update
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    } else {
      console.log("No intersection with floor");
    }
  };

  // Consolidated data resolution function
  const resolveGeometryData = () => {
    // Get floors data - prioritize props over context
    const floorsData = floors || geometryData?.floors || {};
    
    // Get current floor data
    const currentFloorName = currentFloor || geometryData?.currentFloor || "ground";
    const currentFloorData = (currentFloor && floors && floors[currentFloor]) || 
                          (geometryData?.currentFloor && geometryData?.floors && 
                          geometryData.floors[geometryData?.currentFloor]);
    
    // Get lines for current floor
    const currentLines = (currentFloorData?.lines?.length > 0) 
      ? currentFloorData.lines 
      : (lines?.length > 0 ? lines : geometryData?.lines || []);
    
    // Get air entries for current floor
    const currentAirEntries = (currentFloorData?.airEntries?.length > 0)
      ? currentFloorData.airEntries
      : (airEntries?.length > 0 ? airEntries : geometryData?.airEntries || []);
    
    // Get all floor names for multifloor visualization
    const allFloorNames = Object.keys(floorsData);
    
    return {
      floorsData,
      currentFloorName,
      currentFloorData,
      currentLines,
      currentAirEntries,
      allFloorNames,
      hasMultipleFloors: allFloorNames.length > 1
    };
  };

  // Initialize scene
  useEffect(() => {
    console.log("RoomSketchPro - Initialization effect running");
    
    // Get resolved geometry data
    const { currentFloorName, hasMultipleFloors, allFloorNames } = resolveGeometryData();
    console.log("RoomSketchPro - Floors in context:", geometryData?.floors);
    console.log("RoomSketchPro - Resolved floors:", allFloorNames);
    
    // Call onComponentMount callback if provided
    if (onComponentMount) {
      console.log("RoomSketchPro - Calling onComponentMount callback");
      onComponentMount();
    }
    
    if (!containerRef.current) {
      console.error("RoomSketchPro - Container ref is null, cannot initialize");
      return;
    }

    // Only create a new scene if one doesn't exist yet
    if (!sceneRef.current) {
      console.log("RoomSketchPro - Creating new scene - first initialization");
      const scene = setupScene();
      if (!scene) {
        console.error("RoomSketchPro - Scene setup failed");
        return;
      }
      sceneRef.current = scene;
      console.log("RoomSketchPro - Scene initialized successfully");
    } else {
      console.log("RoomSketchPro - Reusing existing scene - prevent recreation");
    }

    // Setup camera if not already set up
    if (!cameraRef.current) {
      const camera = setupCamera();
      cameraRef.current = camera;
    }

    // Setup renderer if not already set up
    if (!rendererRef.current) {
      const renderer = setupRenderer();
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;
    }

    // Setup controls if not already set up
    if (!controlsRef.current && cameraRef.current && rendererRef.current) {
      const controls = new TrackballControls(cameraRef.current, rendererRef.current.domElement);
      controls.rotateSpeed = 1.0;
      controls.zoomSpeed = 1.2;
      controls.panSpeed = 0.8;
      controls.keys = ["KeyA", "KeyS", "KeyD"];
      controlsRef.current = controls;
    }

    // Handle window resize - makes the component responsive like Canvas3D
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      
      // Get container's current dimensions
      const { width: containerWidth, height: containerHeight } = containerRef.current.getBoundingClientRect();
      
      // Update camera aspect ratio
      cameraRef.current.aspect = containerWidth / containerHeight;
      cameraRef.current.updateProjectionMatrix();
      
      // Resize renderer to match container dimensions
      rendererRef.current.setSize(containerWidth, containerHeight, false);
      
      // Tell controls to update
      if (controlsRef.current) {
        controlsRef.current.update();
      }
    };

    // Add resize listener
    window.addEventListener('resize', handleResize);
    
    // Animation loop
    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      if (controlsRef.current && rendererRef.current && sceneRef.current && cameraRef.current) {
        controlsRef.current.update();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    
    // Check if we already have an animation frame running
    if (!animationRef.current) {
      console.log("RoomSketchPro - Starting animation loop");
      animationRef.current = true;
      animate();
    } else {
      console.log("RoomSketchPro - Animation loop already running, skipping initialization");
    }

    // Add drag and drop handlers
    const container = containerRef.current;
    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    });
    container.addEventListener("drop", handleDrop);

    // Initial resize
    handleResize();

    // Cleanup
    return () => {
      // Cancel animation frame if it exists
      if (animationFrameIdRef.current) {
        console.log("RoomSketchPro - Cancelling animation frame");
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = undefined;
      }
      
      // Keep animation flag as true to prevent duplicate animations on remount
      // This is important since we're preserving the scene
      
      // Dispose of controls and renderer if they exist
      if (controlsRef.current) controlsRef.current.dispose();
      if (rendererRef.current) rendererRef.current.dispose();
      
      // Remove event listeners
      window.removeEventListener('resize', handleResize);
      container.removeEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "copy";
      });
      container.removeEventListener("drop", handleDrop);
    };
  }, [width, height, geometryData?.floors, currentFloor, floors, roomHeight, onComponentMount]);
  
  // Function to create multifloor visualization
  const createMultiFloorVisualization = (scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => {
    console.log("RoomSketchPro - Creating multifloor visualization - SIMPLIFIED");
    
    // Check if a multiFloorGroup already exists in the scene
    let existingMultiFloorGroup: THREE.Group | undefined;
    scene.traverse((object) => {
      if (object.name === 'multiFloorGroup') {
        existingMultiFloorGroup = object as THREE.Group;
      }
    });
    
    if (existingMultiFloorGroup) {
      console.log("♻️ REUSING: Existing multiFloorGroup found, will skip full rebuild");
      // Return early if we already have a multiFloorGroup
      // This prevents rebuilding the entire scene on every sync with Canvas3D
      return;
    }
    
    // Use the consolidated data resolution function
    const { floorsData, allFloorNames } = resolveGeometryData();
    
    console.log("🏢 SIMPLIFIED VISUALIZATION - Using resolved floor data:", allFloorNames);
    
    // Standard floor ordering
    allFloorNames.sort((a, b) => {
      const floorOrder = ["ground", "first", "second", "third", "fourth", "fifth"];
      return floorOrder.indexOf(a) - floorOrder.indexOf(b);
    });
    
    // Add detailed logging about floor data structure
    console.log("🏢 FLOOR DATA MIRROR FROM CANVAS3D:");
    if (floors) {
      Object.keys(floors).forEach(floorKey => {
        console.log(`Floor [${floorKey}] mirrored from Canvas3D:`, {
          lines: floors[floorKey]?.lines?.length || 0,
          airEntries: floors[floorKey]?.airEntries?.length || 0,
          stairs: floors[floorKey]?.stairPolygons?.length || 0
        });
      });
    }
    
    if (allFloorNames.length <= 1) {
      console.log("RoomSketchPro - Only one floor, skipping multifloor visualization");
      return;
    }
    
    console.log("RoomSketchPro - Visualizing multiple floors:", allFloorNames);
    
    // Constants for floor rendering
    const FLOOR_HEIGHT = DEFAULTS.ROOM_HEIGHT; // Height between floors 
    const FLOOR_THICKNESS = 20; // Thickness of the floor/ceiling
    
    // Create materials
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.8,
      roughness: 0.7,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    
    // Create group to hold all floors
    const multiFloorGroup = new THREE.Group();
    multiFloorGroup.name = "multiFloorGroup";
    
    // Track created floors for stair connections
    const floorGroups: Record<string, THREE.Group> = {};
    
    // Function to create a floor section from floors data
    const createFloorFromData = (floorName: string, zPosition: number) => {
      // Normalize the floor name for consistency
      const normalizedFloorName = normalizeFloorName(floorName);
      console.log(`🏢 RoomSketchPro - Creating floor ${floorName} at z=${zPosition} (normalized: ${normalizedFloorName})`);
      
      // Create a group for this floor
      const floorGroup = new THREE.Group();
      floorGroup.name = `floor_${floorName}`;
      floorGroup.position.z = zPosition;
      
      // Use the consolidated data resolution function
      const { floorsData } = resolveGeometryData();
      const floorData = floorsData[floorName];
      
      console.log(`🏢 Floor [${floorName}] data via resolveGeometryData():`, {
        hasData: !!floorData
      });
      
      if (!floorData) {
        console.warn(`⚠️ RoomSketchPro - No data for floor ${floorName}`);
        return floorGroup;
      }
      
      // Extract floor lines
      const floorLines = floorData.lines || [];
      
      console.log(`🏢 Floor [${floorName}] content:`, {
        lineCount: floorLines.length,
        airEntryCount: floorData.airEntries?.length || 0,
        stairCount: floorData.stairPolygons?.length || 0
      });
      
      if (floorLines.length === 0) {
        console.warn(`⚠️ RoomSketchPro - No walls for floor ${floorName}`);
        return floorGroup;
      }
      
      // Add walls for this floor
      floorLines.forEach((line, lineIndex) => {
        const start_bottom = transform2DTo3D(line.start, 0); // Start at 0 relative to floor position
        const end_bottom = transform2DTo3D(line.end, 0);
        const start_top = transform2DTo3D(line.start, FLOOR_HEIGHT);
        const end_top = transform2DTo3D(line.end, FLOOR_HEIGHT);
  
        const vertices = new Float32Array([
          start_bottom.x, start_bottom.y, start_bottom.z,
          end_bottom.x, end_bottom.y, end_bottom.z,
          start_top.x, start_top.y, start_top.z,
          end_top.x, end_top.y, end_top.z,
        ]);
  
        const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
        const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();
  
        // Use the same wall material as the main view
        const wallMaterial = wallMaterialRef.current || new THREE.MeshStandardMaterial({
          color: 0xffffff,
          opacity: wallTransparency,
          transparent: true,
          side: THREE.DoubleSide,
        });
        
        const wall = new THREE.Mesh(geometry, wallMaterial);
        wall.name = `wall_${floorName}_${lineIndex}`;
        
        // Add userData to the wall for identification and manipulation
        wall.userData = {
          type: "wall",
          floor: floorName,
          index: lineIndex,
          line: line,
          isSelectable: true
        };
        
        floorGroup.add(wall);
      });
      
      // Add floor/ceiling planes using the room perimeter
      if (floorLines.length > 2) {
        try {
          // Try to create perimeter and shape
          const floorPerimeter = roomUtils.createRoomPerimeter(floorLines);
          const floorShape = roomUtils.createShapeFromPerimeter(floorPerimeter);
          
          if (floorShape) {
            // Create ceiling for this floor (also serves as floor for above level)
            const floorGeometry = new THREE.ShapeGeometry(floorShape);
            
            // Create floor/ceiling
            const floorPlane = new THREE.Mesh(floorGeometry, floorMaterial);
            floorPlane.position.z = FLOOR_HEIGHT; // Top of this floor level
            floorPlane.name = `ceiling_${floorName}`;
            floorGroup.add(floorPlane);
            
            // If not ground floor, add floor plane
            if (floorName !== 'ground') {
              const floorBottomPlane = new THREE.Mesh(floorGeometry, floorMaterial);
              floorBottomPlane.position.z = 0; // Bottom of this floor
              floorBottomPlane.name = `floor_bottom_${floorName}`;
              floorGroup.add(floorBottomPlane);
            }
          }
        } catch (error) {
          console.warn(`RoomSketchPro - Error creating floor planes for ${floorName}:`, error);
        }
      }
      
      // Add air entries for this floor
      const airEntries = floorData.airEntries || [];
      airEntries.forEach(entry => {
        if (entry.type === 'window' || entry.type === 'door' || entry.type === 'vent') {
          // Position will be handled by the air entry creation function
          // Just pass the entry as is
          createAirEntryForMultifloor(entry, floorGroup);
        }
      });
      
      // Store this floor group for later stair connections
      floorGroups[floorName] = floorGroup;
      
      return floorGroup;
    };
    
    // Determine floor placement in 3D space
    const floorSpacing = FLOOR_HEIGHT + FLOOR_THICKNESS;
    
    // Create each floor at the appropriate Z position
    allFloorNames.forEach((floorName, index) => {
      // Calculate z position based on floor index (ground floor at z=0)
      const zPosition = index * floorSpacing;
      
      // Use the original floor name for display purposes but normalize for internal storage
      const floorGroup = createFloorFromData(floorName, zPosition);
      
      // Store normalized floor name for consistent lookups
      const normalizedFloorName = normalizeFloorName(floorName);
      console.log(`🏢 Floor storage mapping: "${floorName}" (original) -> "${normalizedFloorName}" (normalized)`);
      
      // Store the floor group under both the original and normalized names for better compatibility
      floorGroups[normalizedFloorName] = floorGroup;
      
      multiFloorGroup.add(floorGroup);
    });
    
    // Process and create stairs with the same texture as walls
    console.log("🪜 DATA FLOW: Canvas3D -> RSP - Processing stairs from Canvas3D data and applying wall textures");
    let totalStairsProcessed = 0;
    
    allFloorNames.forEach((floorName) => {
      // Use the consolidated data resolution function
      const { floorsData } = resolveGeometryData();
      const floorData = floorsData[floorName];
      
      console.log(`🪜 DATA INSPECTION: Stairs in floor [${floorName}]:`, {
        hasStairsData: !!floorData?.stairPolygons,
        stairCount: floorData?.stairPolygons?.length || 0,
        stairData: floorData?.stairPolygons ? floorData.stairPolygons.map(s => ({ 
          id: s.id, 
          pointCount: s.points?.length || 0,
          direction: s.direction
        })) : 'none'
      });
      
      if (floorData?.stairPolygons && floorData.stairPolygons.length > 0) {
        totalStairsProcessed += floorData.stairPolygons.length;
        console.log(`🪜 MIRRORING STAIRS: Found ${floorData.stairPolygons.length} stairs in floor ${floorName} from Canvas3D`);
        
        // Process each stair polygon and create them with wall texture
        floorData.stairPolygons.forEach((stairData: any, stairIndex: number) => {
          // Process and visualize the stairs with wall texture using our new function
          processStairsFromCanvas3D(stairData, floorName, stairIndex, multiFloorGroup, floorGroups);
        });
      } else {
        console.log(`ℹ️ No stairs found for floor [${floorName}]`);
      }
    });
    
    console.log(`🪜 STAIR SUMMARY: Processed ${totalStairsProcessed} stairs total from Canvas3D data`);
    
    // DEBUG: Verify all stairs are still in their floor groups before adding to scene
    console.log(`🔍 STAIR_DEBUG: FINAL CHECK BEFORE ADDING MULTIFLOOR GROUP TO SCENE`);
    let finalStairsFound = 0;
    
    allFloorNames.forEach((floorName) => {
      const floorGroup = floorGroups[floorName];
      if (floorGroup) {
        let stairsInThisFloor = 0;
        floorGroup.traverse((child) => {
          if (child.name?.includes('stair_')) {
            stairsInThisFloor++;
            finalStairsFound++;
            console.log(`🔍 STAIR_DEBUG: Found stair "${child.name}" in floor group "${floorName}" before scene add`);
          }
        });
        console.log(`🔍 STAIR_DEBUG: Floor "${floorName}" has ${stairsInThisFloor} stairs before scene add`);
      }
    });
    
    console.log(`🔍 STAIR_DEBUG: Total stairs found in all floor groups before scene add: ${finalStairsFound}`);
    
    // Add the multi-floor group to the scene
    scene.add(multiFloorGroup);
    
    // DEBUG: Check that stairs are still present after adding to scene
    console.log(`🔍 STAIR_DEBUG: VERIFICATION AFTER ADDING TO SCENE`);
    let stairsAfterSceneAdd = 0;
    scene.traverse((object) => {
      if (object.name?.includes('stair_')) {
        stairsAfterSceneAdd++;
        console.log(`🔍 STAIR_DEBUG: Found stair "${object.name}" in scene traverse after adding multiFloorGroup`);
      }
    });
    console.log(`🔍 STAIR_DEBUG: Total stairs found in scene after adding multiFloorGroup: ${stairsAfterSceneAdd}`);
    
    // Set camera to see all floors
    if (allFloorNames.length > 1) {
      // Position camera to see all floors
      const totalHeight = (allFloorNames.length * floorSpacing) + 100;
      camera.position.set(0, -totalHeight, totalHeight);
      camera.lookAt(0, 0, totalHeight / 2);
      
      // Update controls target
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, totalHeight / 2);
        controlsRef.current.update();
      }
      
      // Render the updated view
      renderer.render(scene, camera);
    }
  };
  
  // Function to create an air entry (door, window, vent) for multifloor visualization
  const createAirEntryForMultifloor = (entry: AirEntry, floorGroup: THREE.Group) => {
    // Create simplified air entry representation
    const width = entry.dimensions.width * DEFAULTS.PIXELS_TO_CM;
    const height = entry.dimensions.height * DEFAULTS.PIXELS_TO_CM;
    
    // Calculate Z position based on entry type
    const zPosition =
      entry.type === "door"
        ? height / 2 // Center the door vertically
        : (entry.dimensions.distanceToFloor || 0) * DEFAULTS.PIXELS_TO_CM;
    
    // Calculate wall normal for proper orientation
    const wallDirection = new THREE.Vector3()
      .subVectors(
        transform2DTo3D(entry.line.end),
        transform2DTo3D(entry.line.start),
      )
      .normalize();
    
    const worldUpVector = new THREE.Vector3(0, 0, 1);
    const wallNormalVector = new THREE.Vector3()
      .crossVectors(wallDirection, worldUpVector)
      .normalize();
    
    // Create appropriate geometry based on type
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;
    let color: number;
    
    switch (entry.type) {
      case "window":
        geometry = new THREE.PlaneGeometry(width, height);
        color = 0x88ccff;
        material = new THREE.MeshBasicMaterial({ 
          color, 
          transparent: true, 
          opacity: 0.6,
          side: THREE.DoubleSide 
        });
        break;
      case "door":
        geometry = new THREE.BoxGeometry(width, height, 5);
        color = 0x8b4513;
        material = new THREE.MeshBasicMaterial({ color });
        break;
      case "vent":
        geometry = new THREE.PlaneGeometry(width, height);
        color = 0x888888;
        material = new THREE.MeshBasicMaterial({ color });
        break;
      default:
        // Fallback
        geometry = new THREE.PlaneGeometry(width, height);
        color = 0xcccccc;
        material = new THREE.MeshBasicMaterial({ color });
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    const position = transform2DTo3D(entry.position);
    mesh.position.set(position.x, position.y, zPosition);
    
    // Apply rotation to face properly
    const forward = wallNormalVector.clone();
    const up = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    forward.crossVectors(right, up).normalize();
    
    const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, forward);
    mesh.setRotationFromMatrix(rotationMatrix);
    
    // Add to floor group
    mesh.name = `${entry.type}_${position.x.toFixed(0)}_${position.y.toFixed(0)}`;
    floorGroup.add(mesh);
  };
  
  // Process stairs data from Canvas3D and apply RSP textures
  const processStairsFromCanvas3D = (
    stairData: any, 
    floorName: string, 
    stairIndex: number, 
    multiFloorGroup: THREE.Group,
    floorGroups: Record<string, THREE.Group>
  ) => {
    // Get the floor group where this stair belongs
    const floorGroup = floorGroups[floorName];
    if (!floorGroup) {
      console.warn(`⚠️ Cannot find floor group for stairs: ${floorName}`);
      return;
    }

    console.log(`🪜 PROCESSING STAIRS - Canvas3D to RSP - Stair #${stairIndex} on floor ${floorName}:`, stairData);
    
    // Extract stair data
    const points = stairData.points;
    if (!points || points.length < 3) {
      console.warn(`⚠️ Invalid stair data: need at least 3 points, got ${points?.length || 0}`);
      return;
    }

    console.log(`🔄 DATA FLOW: Canvas3D stairs -> RSP - Creating stair with ${points.length} points and wall texture`);
    
    // Create a shape from the points
    const stairShape = new THREE.Shape();
    const firstPoint = transform2DTo3D(points[0]);
    stairShape.moveTo(firstPoint.x, firstPoint.y);
    
    // Add remaining points to shape
    for (let i = 1; i < points.length; i++) {
      const point = transform2DTo3D(points[i]);
      stairShape.lineTo(point.x, point.y);
    }
    
    // Close the shape
    stairShape.closePath();
    
    // Create geometry from shape
    const stairGeometry = new THREE.ShapeGeometry(stairShape);
    
    // Use the same wall material as the walls for consistency
    const stairMaterial = wallMaterialRef.current || new THREE.MeshStandardMaterial({
      color: 0xffffff,
      opacity: wallTransparency,
      transparent: true,
      side: THREE.DoubleSide,
    });

    // Create the mesh
    const stairMesh = new THREE.Mesh(stairGeometry, stairMaterial);
    stairMesh.name = `stair_${floorName}_${stairIndex}`;
    
    // Set position - stairs are at the floor level by default
    if (stairData.direction === "down") {
      // For downward stairs, position them lower
      stairMesh.position.z = 10; // Slightly above the floor
    } else {
      // For upward stairs, position them higher
      stairMesh.position.z = 50; // Mid-level height
    }
    
    // Add userData for identification
    stairMesh.userData = {
      type: "stair",
      floor: floorName,
      index: stairIndex,
      data: stairData,
      isSelectable: true
    };
    
    // Add to floor group
    floorGroup.add(stairMesh);
    console.log(`✅ Added stair #${stairIndex} to floor ${floorName} with wall texture`);
    
    // DEBUG: Log stair mesh details for troubleshooting
    console.log(`🔍 STAIR_DEBUG: Stair mesh created - ID: ${stairMesh.id}, Name: ${stairMesh.name}`);
    console.log(`🔍 STAIR_DEBUG: Parent floor group - Name: ${floorGroup.name}, Children: ${floorGroup.children.length}`);
    
    // Log floor group hierarchy
    console.log(`🔍 STAIR_DEBUG: Floor group structure after adding stair:`);
    let stairFound = false;
    floorGroup.traverse((child) => {
      if (child.name === stairMesh.name) {
        stairFound = true;
        console.log(`🔍 STAIR_DEBUG: Found stair mesh "${child.name}" in floor group traverse`);
      }
    });
  };
  
  // Track the last floor data to minimize unnecessary rebuilds
  const lastFloorsRef = useRef<typeof floors | null>(null);
  const lastCurrentFloorRef = useRef<string | null | undefined>(null);
  const sceneRebuildCountRef = useRef(0);
  
  // Optimized effect to sync with Canvas3D content only when necessary
  useEffect(() => {
    // Only rebuild scene if we already have one
    if (sceneRef.current && rendererRef.current && cameraRef.current) {
      // Check if we actually need to update (has the data really changed?)
      const floorsChanged = JSON.stringify(lastFloorsRef.current) !== JSON.stringify(floors);
      const currentFloorChanged = lastCurrentFloorRef.current !== currentFloor;
      
      // Track rebuild attempts to prevent excessive rebuilds
      sceneRebuildCountRef.current++;
      const rebuildCount = sceneRebuildCountRef.current;
      
      if (!floorsChanged && !currentFloorChanged && rebuildCount > 1) {
        console.log("🔄 OPTIMIZATION: Skipping unnecessary scene rebuild - no data changes detected");
        return; // Skip rebuild when data hasn't changed
      }
      
      // Update refs with current data
      lastFloorsRef.current = floors;
      lastCurrentFloorRef.current = currentFloor;
      
      console.log(`RoomSketchPro - SYNC: Mirroring Canvas3D content (rebuild #${rebuildCount})`);
      
      try {
        // Preserve any existing multifloor groups since they contain our stairs
        let existingMultiFloorGroup: THREE.Group | null = null;
        
        // Identify any existing multiFloorGroup
        sceneRef.current.traverse((object) => {
          if (object.name === 'multiFloorGroup') {
            existingMultiFloorGroup = object as THREE.Group;
            console.log("🔍 FOUND: Existing multiFloorGroup in scene");
          }
        });
        
        // Clear existing scene objects except lights, grid, and multiFloorGroup if it exists
        if (sceneRef.current) {
          // Get a list of all objects to remove (except multiFloorGroup)
          const objectsToRemove: THREE.Object3D[] = [];
          
          // Before removal, log stair objects for debugging
          console.log("🔍 STAIR_DEBUG: CHECKING FOR STAIRS BEFORE SCENE CLEANUP");
          let stairsBeforeCleanup = 0;
          sceneRef.current.traverse((object) => {
            if (object.name?.includes('stair_')) {
              stairsBeforeCleanup++;
              console.log(`🔍 STAIR_DEBUG: Found stair object before cleanup: ${object.name}, Parent: ${object.parent?.name || 'none'}`);
            }
          });
          console.log(`🔍 STAIR_DEBUG: Total stairs found before cleanup: ${stairsBeforeCleanup}`);
          
          sceneRef.current.traverse((object) => {
            // Skip lights, camera, grid, and scene
            const isBasicSceneElement = 
              object.type === 'DirectionalLight' || 
              object.type === 'AmbientLight' ||
              object.type === 'PerspectiveCamera' ||
              object.type === 'GridHelper' ||
              object.type === 'Scene';
            
            // If we've decided to keep the multiFloorGroup, skip it too
            const isMultiFloorGroup = existingMultiFloorGroup && 
              (object === existingMultiFloorGroup || isDescendantOf(object, existingMultiFloorGroup));
              
            // Helper function to check if an object is a descendant of another
            function isDescendantOf(obj: THREE.Object3D, parent: THREE.Object3D): boolean {
              let current = obj.parent;
              while (current) {
                if (current === parent) return true;
                current = current.parent;
              }
              return false;
            }
            
            if (!isBasicSceneElement && !isMultiFloorGroup) {
              // Don't log every removal, that's too verbose
              if (object.name && (object.name.includes('stair_') || object.name.includes('floor_'))) {
                console.log(`🧹 CLEANUP: Removing object ${object.name}`);
              }
              objectsToRemove.push(object);
            }
          });
          
          // Remove the objects
          objectsToRemove.forEach(obj => {
            sceneRef.current?.remove(obj);
          });
          
          // Log whether we're reusing multiFloorGroup or creating a new visualization
          if (existingMultiFloorGroup && floors && Object.keys(floors).length > 0) {
            console.log("♻️ REUSING: Keeping existing multiFloorGroup and updating visualizations as needed");
            
            // We may need to update specific parts of the visualization based on what changed
            if (currentFloorChanged) {
              console.log(`🔄 UPDATING: Current floor changed from ${lastCurrentFloorRef.current} to ${currentFloor}`);
              // Apply any current floor specific updates here if needed
            }
          } 
          // Create new visualization if we don't have one or if we explicitly want a fresh rebuild
          else if (floors && Object.keys(floors).length > 0) {
            console.log("🆕 CREATING: New multiFloorVisualization with data from Canvas3D");
            createMultiFloorVisualization(sceneRef.current, rendererRef.current, cameraRef.current);
          } else {
            console.warn("⚠️ No floor data available from Canvas3D to mirror");
          }
          
          // Always render the updated scene
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      } catch (error) {
        console.error("❌ ERROR during RSP scene synchronization:", error);
      }
    }
  }, [floors, currentFloor]);

  // Extract perimeter points using resolveGeometryData for better consistency
  const perimeter = useMemo(() => {
    const { currentLines } = resolveGeometryData();
    return roomUtils.createRoomPerimeter(currentLines);
  }, [geometryData?.lines, lines, currentFloor, floors]);

  // Create shape from perimeter
  const shape = useMemo(
    () => roomUtils.createShapeFromPerimeter(perimeter),
    [perimeter],
  );


  // Wall creation
  const createWalls = (
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
  ) => {
    console.log("RoomSketchPro - createWalls called with scene:", scene);
    // Use resolveGeometryData to get current lines
    const { currentLines, currentFloorName } = resolveGeometryData();
    const linesToUse = currentLines;
    
    console.log("RoomSketchPro - Current floor:", currentFloorName);
    console.log("RoomSketchPro - Using lines data from resolveGeometryData:", linesToUse);
    
    const textureLoader = new THREE.TextureLoader();
    const brickTexture = textureLoader.load(
      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/brick_diffuse.jpg",
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 1);
        renderer.render(scene, camera);
        console.log("RoomSketchPro - Brick texture loaded successfully");
      },
    );

    // Create wall material with brick texture
    const wallMaterial = new THREE.MeshStandardMaterial({
      map: brickTexture,
      color: 0xffffff,
      opacity: wallTransparency,
      transparent: true,
      side: THREE.DoubleSide,
    });
    wallMaterialRef.current = wallMaterial;
    console.log("RoomSketchPro - Wall material created with transparency:", wallTransparency);

    // Check if we need to display multifloor visualization
    if (floors && Object.keys(floors).length > 1) {
      console.log("🏢 MULTIFLOOR MODE DETECTED - Using createMultiFloorVisualization for all floors");
      // We have multiple floors, use the multifloor visualization
      createMultiFloorVisualization(scene, renderer, camera);
      return; // Exit early as multifloor visualization handles all rendering
    }
    
    // Always use lines from props if available, fallback to context only if needed
    const linesData = linesToUse; // Use the lines we prepared above
    console.log(`RoomSketchPro - Creating walls from ${linesData.length} lines`);
    
    if (linesData.length === 0) {
      console.warn("RoomSketchPro - No lines data available to create walls");
      return; // Exit early if no lines
    }
    
    linesData.forEach((line, lineIndex) => {
      const start_bottom = transform2DTo3D(line.start);
      const end_bottom = transform2DTo3D(line.end);
      const start_top = transform2DTo3D(line.start, DEFAULTS.ROOM_HEIGHT);
      const end_top = transform2DTo3D(line.end, DEFAULTS.ROOM_HEIGHT);

      const vertices = new Float32Array([
        start_bottom.x,
        start_bottom.y,
        start_bottom.z,
        end_bottom.x,
        end_bottom.y,
        end_bottom.z,
        start_top.x,
        start_top.y,
        start_top.z,
        end_top.x,
        end_top.y,
        end_top.z,
      ]);

      const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
      const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();

      const wall = new THREE.Mesh(geometry, wallMaterial);
      wall.name = "wall";
      
      // Add userData to the wall for identification and manipulation
      wall.userData = {
        type: "wall",
        index: lineIndex,
        line: line,
        isSelectable: true
      };
      
      scene.add(wall);
    });
  };

  // Enhanced air entries creation (doors, windows, vents)
  const createAirEntries = (scene: THREE.Scene) => {
    // Create and add a simple environment map for reflections
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
    const cubeCamera = new THREE.CubeCamera(1, 1000, cubeRenderTarget);
    scene.add(cubeCamera);

    // Create texture loader for all materials
    const textureLoader = new THREE.TextureLoader();

    // Enhanced glass material for windows with subtle blue tint and realistic properties
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xdcf5ff), // Very slight blue tint
      metalness: 0.1,
      roughness: 0.03,
      transmission: 0.96, // High transmission for transparency
      thickness: 0.5,
      ior: 1.5, // Index of refraction for glass
      reflectivity: 0.3,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMap: cubeRenderTarget.texture,
      envMapIntensity: 1.8,
    });

    // Load wood texture for window frames
    const woodTexture = textureLoader.load(
      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/hardwood2_diffuse.jpg",
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
      },
    );

    // Create enhanced frame material
    const frameMaterial = new THREE.MeshPhysicalMaterial({
      map: woodTexture,
      color: 0xdddddd, // Light color to show wood grain
      metalness: 0.2,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });

    // Door material with wood texture
    const doorMaterial = new THREE.MeshPhongMaterial({
      map: woodTexture,
      color: 0xffffff,
      opacity: 1.0,
      transparent: false,
      side: THREE.DoubleSide,
    });

    // Use resolveGeometryData to get current air entries and floor data
    const { currentAirEntries, currentFloorName } = resolveGeometryData();
    
    // Check if multifloor visualization has already been created
    // If so, we don't need to create air entries here as they're already in the multifloor groups
    if (scene.children.find(child => child.name === "multiFloorGroup")) {
      console.log("🏢 MULTIFLOOR MODE ACTIVE - Air entries already created in floor groups");
      return; // Exit early since multifloor visualization includes air entries
    }
    
    // Use the resolved air entries
    const entriesData = currentAirEntries;
    
    console.log("RoomSketchPro - Current floor for air entries:", currentFloorName);
    console.log("RoomSketchPro - Using air entries data from resolveGeometryData:", entriesData);
    entriesData.forEach((entry) => {
      // Set material based on entry type
      let material;
      if (entry.type === "window") {
        // Windows are handled specially with the enhanced window creation
        createDetailedWindow(entry, frameMaterial, glassMaterial, scene);
        return; // Skip the default creation for windows
      } else if (entry.type === "door") {
        // Calculate dimensions first to avoid scoping issues
        const doorWidth = entry.dimensions.width * DEFAULTS.PIXELS_TO_CM;
        const doorHeight = entry.dimensions.height * DEFAULTS.PIXELS_TO_CM;
        const doorDepth = 6; // Door thickness
        const frameThickness = 5; // Frame thickness
        const frameDepth = 8; // Frame depth
        const position = transform2DTo3D(entry.position);
        const doorZPosition = doorHeight / 2; // Center the door vertically

        // Calculate wall direction and normal vectors
        const wallDirection = new THREE.Vector3()
          .subVectors(
            transform2DTo3D(entry.line.end),
            transform2DTo3D(entry.line.start),
          )
          .normalize();

        // Calculate proper wall normal using cross product
        const worldUpVector = new THREE.Vector3(0, 0, 1);
        const wallNormalVector = new THREE.Vector3()
          .crossVectors(wallDirection, worldUpVector)
          .normalize();

        // Create door group
        const doorGroup = new THREE.Group();

        // Create texture loader and load wood texture
        const textureLoader = new THREE.TextureLoader();
        const woodTexture = textureLoader.load(
          "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/hardwood2_diffuse.jpg",
          (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 2); // Adjust for door proportions
          },
        );

        // Create door frame material
        const frameMaterial = new THREE.MeshPhysicalMaterial({
          color: "#8b4513",
          metalness: 0.2,
          roughness: 0.8,
        });

        // Create door panel material
        const doorMaterial = new THREE.MeshPhysicalMaterial({
          map: woodTexture,
          color: "#ffffff",
          metalness: 0.1,
          roughness: 0.6,
          side: THREE.DoubleSide,
        });

        // Door panel
        const doorGeometry = new THREE.BoxGeometry(
          doorWidth - frameThickness,
          doorHeight - frameThickness,
          doorDepth,
        );
        const doorPanel = new THREE.Mesh(doorGeometry, doorMaterial);

        // Create frame parts
        // Top frame
        const topFrame = new THREE.Mesh(
          new THREE.BoxGeometry(
            doorWidth + frameThickness,
            frameThickness,
            frameDepth,
          ),
          frameMaterial,
        );
        topFrame.position.y = doorHeight / 2;

        // Bottom frame
        const bottomFrame = new THREE.Mesh(
          new THREE.BoxGeometry(
            doorWidth + frameThickness,
            frameThickness,
            frameDepth,
          ),
          frameMaterial,
        );
        bottomFrame.position.y = -doorHeight / 2;

        // Left frame
        const leftFrame = new THREE.Mesh(
          new THREE.BoxGeometry(
            frameThickness,
            doorHeight + frameThickness,
            frameDepth,
          ),
          frameMaterial,
        );
        leftFrame.position.x = -doorWidth / 2;

        // Right frame
        const rightFrame = new THREE.Mesh(
          new THREE.BoxGeometry(
            frameThickness,
            doorHeight + frameThickness,
            frameDepth,
          ),
          frameMaterial,
        );
        rightFrame.position.x = doorWidth / 2;

        // Door handle
        const handleMaterial = new THREE.MeshPhysicalMaterial({
          color: "#c0c0c0",
          metalness: 0.9,
          roughness: 0.2,
        });

        // Handle base
        const handleBaseGeometry = new THREE.CylinderGeometry(2, 2, 12, 16);
        const handleBase = new THREE.Mesh(handleBaseGeometry, handleMaterial);
        handleBase.rotation.z = Math.PI / 2;
        handleBase.position.set(doorWidth / 3, 0, doorDepth / 2 + 2);

        // Handle grip
        const handleGripGeometry = new THREE.CylinderGeometry(1, 1, 15, 16);
        const handleGrip = new THREE.Mesh(handleGripGeometry, handleMaterial);
        handleGrip.position.set(doorWidth / 3, -5, doorDepth / 2 + 4);

        // Create hinges
        const hingeGeometry = new THREE.BoxGeometry(2, 8, 2);
        const hingeMaterial = new THREE.MeshPhysicalMaterial({
          color: "#808080",
          metalness: 0.8,
          roughness: 0.2,
        });

        // Add hinges
        const topHinge = new THREE.Mesh(hingeGeometry, hingeMaterial);
        topHinge.position.set(-doorWidth / 2 + 1, doorHeight / 3, 0);

        const bottomHinge = new THREE.Mesh(hingeGeometry, hingeMaterial);
        bottomHinge.position.set(-doorWidth / 2 + 1, -doorHeight / 3, 0);

        // Add all parts to door group
        doorGroup.add(doorPanel);
        doorGroup.add(topFrame);
        doorGroup.add(bottomFrame);
        doorGroup.add(leftFrame);
        doorGroup.add(rightFrame);
        doorGroup.add(handleBase);
        doorGroup.add(handleGrip);
        doorGroup.add(topHinge);
        doorGroup.add(bottomHinge);

        // Position and rotate the door group
        doorGroup.position.set(position.x, position.y, doorZPosition);

        // Apply Wall's Local Coordinate System approach
        const forward = wallNormalVector.clone();
        const up = new THREE.Vector3(0, 0, 1);
        const right = new THREE.Vector3().crossVectors(up, forward).normalize();
        forward.crossVectors(right, up).normalize();
        const rotationMatrix = new THREE.Matrix4().makeBasis(
          right,
          up,
          forward,
        );
        doorGroup.setRotationFromMatrix(rotationMatrix);

        // Offset slightly to prevent z-fighting with wall
        doorGroup.position.x += (wallNormalVector.x * frameDepth) / 2;
        doorGroup.position.y += (wallNormalVector.y * frameDepth) / 2;

        scene.add(doorGroup);
        return; // Skip the default creation for doors
      } else {
        // vent
        // Calculate dimensions first to avoid scoping issues
        const ventWidth = entry.dimensions.width * DEFAULTS.PIXELS_TO_CM;
        const ventHeight = entry.dimensions.height * DEFAULTS.PIXELS_TO_CM;
        const ventDepth = 12; // Total vent depth in cm
        const frameThickness = 2;
        const mullionThickness = frameThickness * 0.7;
        const gridSpacing = 5; // Space between grid bars
        const position = transform2DTo3D(entry.position);
        const ventZPosition =
          (entry.dimensions.distanceToFloor || 0) * DEFAULTS.PIXELS_TO_CM;

        // Calculate wall direction and normal vectors
        const wallDirection = new THREE.Vector3()
          .subVectors(
            transform2DTo3D(entry.line.end),
            transform2DTo3D(entry.line.start),
          )
          .normalize();

        // Calculate proper wall normal using cross product
        const worldUpVector = new THREE.Vector3(0, 0, 1);
        const wallNormalVector = new THREE.Vector3()
          .crossVectors(wallDirection, worldUpVector)
          .normalize();

        // Create vent group
        const ventGroup = new THREE.Group();

        // Create metallic materials
        const ventFrameMaterial = new THREE.MeshPhysicalMaterial({
          color: "#4a5568",
          metalness: 0.5,
          roughness: 0.5,
          envMapIntensity: 1.0,
        });

        const ventGridMaterial = new THREE.MeshPhysicalMaterial({
          color: "#71717a",
          metalness: 0.9,
          roughness: 0.3,
          side: THREE.DoubleSide,
        });

        // Create main vent frame
        const frameGeometry = new THREE.BoxGeometry(
          ventWidth + frameThickness * 2,
          ventHeight + frameThickness * 2,
          ventDepth,
        );
        const frame = new THREE.Mesh(frameGeometry, ventFrameMaterial);
        ventGroup.add(frame);

        // Create horizontal grid bars
        const numHorizontalBars = Math.floor(ventHeight / gridSpacing) - 1;
        for (let i = 0; i < numHorizontalBars; i++) {
          const y = -ventHeight / 2 + (i + 1) * gridSpacing;
          const barGeometry = new THREE.BoxGeometry(
            ventWidth - frameThickness * 2,
            1,
            ventDepth / 2,
          );
          const bar = new THREE.Mesh(barGeometry, ventGridMaterial);
          bar.position.set(0, y, ventDepth / 4);
          ventGroup.add(bar);
        }

        // Create vertical grid bars
        const numVerticalBars = Math.floor(ventWidth / gridSpacing) - 1;
        for (let i = 0; i < numVerticalBars; i++) {
          const x = -ventWidth / 2 + (i + 1) * gridSpacing;
          const barGeometry = new THREE.BoxGeometry(
            1,
            ventHeight - frameThickness * 2,
            ventDepth / 2,
          );
          const bar = new THREE.Mesh(barGeometry, ventGridMaterial);
          bar.position.set(x, 0, ventDepth / 4);
          ventGroup.add(bar);
        }

        // Create glass panes - four panes due to the cross pattern
        const paneWidth = ventWidth / 2 - mullionThickness / 2;
        const paneHeight = ventHeight / 2 - mullionThickness / 2;
        const glassInset = ventDepth * 0.2; // Inset glass from front of frame

        // Define the positions for the four panes (top-left, top-right, bottom-left, bottom-right)
        const panePositions = [
          [-ventWidth / 4, ventHeight / 4, -glassInset],
          [ventWidth / 4, ventHeight / 4, -glassInset],
          [-ventWidth / 4, -ventHeight / 4, -glassInset],
          [ventWidth / 4, -ventHeight / 4, -glassInset],
        ];

        // Create the glass panes with subtle variations
        const paneVariation = 0.02; // Small random variation
        const paneOpacity = 0.9 - Math.random() * 0.1; // Slight opacity variation

        // Clone the glass material to make variations
        panePositions.forEach((pos) => {
          const paneGlassMaterial = (glassMaterial as THREE.MeshPhysicalMaterial).clone();
          paneGlassMaterial.opacity = paneOpacity;

          // Add subtle imperfections to glass with different transmission values
          paneGlassMaterial.transmission = 0.92 + Math.random() * 0.06;

          // Create glass pane with slight thickness
          const glassPane = new THREE.Mesh(
            new THREE.BoxGeometry(
              paneWidth - frameThickness * paneVariation,
              paneHeight - frameThickness * paneVariation,
              0.4, // Very thin glass
            ),
            paneGlassMaterial,
          );

          glassPane.position.set(pos[0], pos[1], pos[2]); // Fix the syntax error
          ventGroup.add(glassPane);
        });
        // Position and rotate the vent group
        ventGroup.position.set(position.x, position.y, ventZPosition);
        // Apply Wall's Local Coordinate System approach
        const forward = wallNormalVector.clone();
        const up = new THREE.Vector3(0, 0, 1);
        const right = new THREE.Vector3().crossVectors(up, forward).normalize();
        forward.crossVectors(right, up).normalize();
        const rotationMatrix = new THREE.Matrix4().makeBasis(
          right,
          up,
          forward,
        );
        ventGroup.setRotationFromMatrix(rotationMatrix);

        // Offset slightly from wall to prevent z-fighting
        ventGroup.position.x += (wallNormalVector.x * ventDepth) / 2;
        ventGroup.position.y += (wallNormalVector.y * ventDepth) / 2;

        scene.add(ventGroup);
        return; //Skip default creation for vents
      }

      // For doors and vents, keep the simple geometry
      const width = entry.dimensions.width * DEFAULTS.PIXELS_TO_CM;
      const height = entry.dimensions.height * DEFAULTS.PIXELS_TO_CM;

      // Calculate Z position based on entry type
      const zPosition =
        entry.type === "door"
          ? height / 2 // Center the door vertically
          : (entry.dimensions.distanceToFloor || 0) * DEFAULTS.PIXELS_TO_CM;

      // Calculate wall direction and normal vectors
      const wallDirection = new THREE.Vector3()
        .subVectors(
          transform2DTo3D(entry.line.end),
          transform2DTo3D(entry.line.start),
        )
        .normalize();

      // Calculate proper wall normal using cross product
      const worldUpVector = new THREE.Vector3(0, 0, 1);
      const wallNormalVector = new THREE.Vector3()
        .crossVectors(wallDirection, worldUpVector)
        .normalize();

      const geometry = new THREE.PlaneGeometry(width, height);
      material = entry.type === "door" ? doorMaterial : new THREE.MeshBasicMaterial({ color: 0x808080 }); // Assign material based on entry type
      const mesh = new THREE.Mesh(geometry, material);
      const position = transform2DTo3D(entry.position);
      mesh.position.set(position.x, position.y, zPosition);

      // Apply rotation
      const forward = wallNormalVector.clone();
      const up = new THREE.Vector3(0, 0, 1);
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      forward.crossVectors(right, up).normalize();
      const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, forward);
      mesh.setRotationFromMatrix(rotationMatrix);

      // Add a small marker at the air entry position for debugging
      const markerGeometry = new THREE.SphereGeometry(3, 8, 8);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(mesh.position);
      scene.add(marker);

      console.log(
        `Creating coordinate label for ${entry.type} at:`,
        marker.position,
      ); // Added logging

      // Add coordinate label
      const coordinates = marker.position;
      const coordText = `(${coordinates.x.toFixed(
        1,
      )}, ${coordinates.y.toFixed(1)}, ${coordinates.z.toFixed(1)}) cm`;
      console.log(`Creating coordinate label for ${entry.type}:`, {
        position: `(${coordinates.x.toFixed(1)}, ${coordinates.y.toFixed(
          1,
        )}, ${coordinates.z.toFixed(1)})`,
        text: coordText,
      });
      const label = makeTextSprite(coordText, marker.position);
      label.name = `${entry.type}_label_${coordinates.x.toFixed(
        0,
      )}_${coordinates.y.toFixed(0)}`;
      scene.add(label);
      console.log(`Added label to scene: ${label.name}`);

      scene.add(mesh);
    });
  };

  // New function to create highly detailed windows
  const createDetailedWindow = (
    entry: AirEntry,
    frameMaterial: THREE.Material,
    glassMaterial: THREE.Material,
    scene: THREE.Scene,
  ) => {
    const width = entry.dimensions.width * DEFAULTS.PIXELS_TO_CM;
    const height = entry.dimensions.height * DEFAULTS.PIXELS_TO_CM;
    const windowDepth = 12; // Total window depth in cm

    // Calculate Z position and wall normal
    const zPosition =
      (entry.dimensions.distanceToFloor || 100) * DEFAULTS.PIXELS_TO_CM;

    // Calculate wall direction and normal vectors
    const wallDirection = new THREE.Vector3()
      .subVectors(
        transform2DTo3D(entry.line.end),
        transform2DTo3D(entry.line.start),
      )
      .normalize();

    // Calculate proper wall normal using cross product
    const worldUpVector = new THREE.Vector3(0, 0, 1);
    const wallNormalVector = new THREE.Vector3()
      .crossVectors(wallDirection, worldUpVector)
      .normalize();

    // Set up orientation vectors for the window
    const forward = wallNormalVector.clone();
    const up = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    // Create rotation matrix
    const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, forward);

    // Create window group to hold all window elements
    const windowGroup = new THREE.Group();

    // Get base position from entry
    const basePosition = transform2DTo3D(entry.position);
    windowGroup.position.set(basePosition.x, basePosition.y, zPosition);
    windowGroup.setRotationFromMatrix(rotationMatrix);

    // Frame parameters
    const frameThickness = width * 0.06; // Frame thickness proportional to window width
    const frameDepth = windowDepth;
    const sillDepth = windowDepth * 1.2; // Slightly deeper than window
    const sillHeight = frameThickness * 1.5;

    // Create outer frame (top, bottom, left, right)
    // Top frame
    const topFrame = new THREE.Mesh(
      new THREE.BoxGeometry(
        width + frameThickness * 2,
        frameThickness,
        frameDepth,
      ),
      frameMaterial,
    );
    topFrame.position.set(0, height / 2 + frameThickness / 2, 0);
    windowGroup.add(topFrame);

    // Bottom frame with sill
    const bottomFrame = new THREE.Mesh(
      new THREE.BoxGeometry(
        width + frameThickness * 2,
        frameThickness,
        frameDepth,
      ),
      frameMaterial,
    );
    bottomFrame.position.set(0, -height / 2 - frameThickness / 2, 0);
    windowGroup.add(bottomFrame);

    // Window sill (extends outward from the bottom frame)
    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(width + frameThickness * 3, sillHeight, sillDepth),
      frameMaterial,
    );
    sill.position.set(
      0,
      -height / 2 - frameThickness - sillHeight / 2,
      sillDepth / 2 - frameDepth / 2,
    );
    windowGroup.add(sill);

    // Left frame
    const leftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, height, frameDepth),
      frameMaterial,
    );
    leftFrame.position.set(-width / 2 - frameThickness / 2, 0, 0);
    windowGroup.add(leftFrame);

    // Right frame
    const rightFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, height, frameDepth),
      frameMaterial,
    );
    rightFrame.position.set(width / 2 + frameThickness / 2, 0, 0);
    windowGroup.add(rightFrame);

    // Create mullions (cross pattern dividers) - thinner than the main frame
    const mullionThickness = frameThickness * 0.7;
    const mullionDepth = frameDepth * 0.9;

    // Horizontal mullion
    const horizontalMullion = new THREE.Mesh(
      new THREE.BoxGeometry(width, mullionThickness, mullionDepth),
      frameMaterial,
    );
    horizontalMullion.position.set(0, 0, 0); // Center of window
    windowGroup.add(horizontalMullion);

    // Vertical mullion
    const verticalMullion = new THREE.Mesh(
      new THREE.BoxGeometry(mullionThickness, height, mullionDepth),
      frameMaterial,
    );
    verticalMullion.position.set(0, 0, 0); // Center of window
    windowGroup.add(verticalMullion);

    // Create beveled corner details for the frame
    // Add bevels or corner details if desired

    // Create glass panes - four panes due to the cross pattern
    const paneWidth = width / 2 - mullionThickness / 2;
    const paneHeight = height / 2 - mullionThickness / 2;
    const glassInset = frameDepth * 0.2; // Inset glass from front of frame

    // Define the positions for the four panes (top-left, top-right, bottom-left, bottom-right)
    const panePositions = [
      [-width / 4, height / 4, -glassInset],
      [width / 4, height / 4, -glassInset],
      [-width / 4, -height / 4, -glassInset],
      [width / 4, -height / 4, -glassInset],
    ];

    // Create the glass panes
    panePositions.forEach((pos, index) => {
      // Create subtle variation in each pane
      const paneVariation = 0.02; // Small random variation
      const paneOpacity = 0.9 - Math.random() * 0.1; // Slight opacity variation

      // Clone the glass material to make variations
      const paneGlassMaterial = (
        glassMaterial as THREE.MeshPhysicalMaterial
      ).clone();
      paneGlassMaterial.opacity = paneOpacity;

      // Add subtle imperfections to glass with different transmission values
      paneGlassMaterial.transmission = 0.92 + Math.random() * 0.06;

      // Create glass pane with slight thickness
      const glassPane = new THREE.Mesh(
        new THREE.BoxGeometry(
          paneWidth - frameThickness * paneVariation,
          paneHeight - frameThickness * paneVariation,
          0.4, // Very thin glass
        ),
        paneGlassMaterial,
      );

      glassPane.position.set(pos[0], pos[1], pos[2]);
      windowGroup.add(glassPane);
    });

    // Add window hardware (handle) to one of the panes
    const handleBaseGeometry = new THREE.BoxGeometry(
      frameThickness * 1.5,
      frameThickness * 1.5,
      frameThickness * 0.5,
    );
    const handleBaseMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x777777,
      metalness: 0.8,
      roughness: 0.2,
    });

    const handleBase = new THREE.Mesh(handleBaseGeometry, handleBaseMaterial);
    handleBase.position.set(
      width / 4,
      0,
      -frameDepth / 2 - frameThickness * 0.25,
    );
    windowGroup.add(handleBase);

    // Create the handle lever
    const handleLeverGeometry = new THREE.CylinderGeometry(
      frameThickness * 0.3,
      frameThickness * 0.3,
      frameThickness * 3,
      16,
    );
    const handleLever = new THREE.Mesh(handleLeverGeometry, handleBaseMaterial);
    handleLever.rotation.set(0, 0, Math.PI / 2);
    handleLever.position.set(
      width / 4,
      -frameThickness * 1.5,
      -frameDepth / 2 - frameThickness * 0.5,
    );
    windowGroup.add(handleLever);

    // Add subtle shadow catching surfaces near the window
    // This would typically be done with proper lighting, but here's a placeholder
    const shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(
        width + frameThickness * 4,
        height + frameThickness * 4,
      ),
      new THREE.MeshPhongMaterial({
        color: 0x000000,
        opacity: 0.1,
        transparent: true,
        side: THREE.FrontSide,
      }),
    );
    shadowCatcher.position.set(0, 0, frameDepth / 2 + 0.1);
    windowGroup.add(shadowCatcher);

    // Add userData to the window group for identification and manipulation
    windowGroup.userData = {
      type: "window",
      position: entry.position,
      dimensions: entry.dimensions,
      line: entry.line,
      isSelectable: true
    };
    
    // Set name for easier identification
    windowGroup.name = "window";
    
    // Add the entire window group to the scene
    scene.add(windowGroup);

    return windowGroup;
  };

  // Create floor and roof
  const createFloorAndRoof = (
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
  ) => {
    // Use the geometryData.lines if available, otherwise fall back to props 
    const linesData = geometryData?.lines || lines;
    const perimeterPoints = roomUtils.createRoomPerimeter(linesData);
    
    if (perimeterPoints.length > 2) {
      // Create shape from perimeter points
      const shape = new THREE.Shape();
      const firstPoint = roomUtils.transform2DTo3D(perimeterPoints[0]);
      shape.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < perimeterPoints.length; i++) {
        const point = roomUtils.transform2DTo3D(perimeterPoints[i]);
        shape.lineTo(point.x, point.y);
      }
      shape.lineTo(firstPoint.x, firstPoint.y);

      // Create floor geometry and mesh
      const floorGeometry = new THREE.ShapeGeometry(shape);

      // Create texture loader and load wood texture from an external source
      const textureLoader = new THREE.TextureLoader();
      const woodTexture = textureLoader.load(
        "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/hardwood2_diffuse.jpg",
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(5, 5); // Adjust the repeat scale for better visual
          renderer.render(scene, camera);
        },
      );

      const floorMaterial = new THREE.MeshPhongMaterial({
        map: woodTexture,
        color: 0xffffff, // White to show texture properly
        opacity: 0.8,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.set(0, 0, 0); // Place at Z=0
      floor.name = "floor";
      
      // Add userData to the floor for identification and manipulation
      floor.userData = {
        type: "floor",
        index: 0,
        isSelectable: true,
        lines: linesData, // Store the lines data used to create this floor
        perimeterPoints: perimeterPoints // Store the perimeter points
      };
      
      scene.add(floor);
      // Store the floor mesh in the ref for later access
      floorRef.current = floor;

      // Create roof geometry and mesh
      const roofGeometry = new THREE.ShapeGeometry(shape);
      const roofMaterial = new THREE.MeshPhongMaterial({
        color: DEFAULTS.ROOF_COLOR,
        opacity: 0.2,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.set(0, 0, DEFAULTS.ROOM_HEIGHT); // Place at Z=ROOM_HEIGHT
      roof.name = "roof";
      
      // Add userData to the roof for identification and manipulation
      roof.userData = {
        type: "roof",
        index: 0,
        isSelectable: true,
        lines: linesData // Store the lines data used to create this roof
      };
      
      scene.add(roof);
    }
  };

  // Add furniture creation functions
  const createFurnitureMesh = (type: string): THREE.Object3D => {
    console.log("Creating furniture mesh of type:", type);

    switch (type) {
      case "table": {
        const model = createTableModel();
        console.log("Created table model");
        return model;
      }
      case "person": {
        const model = createPersonModel();
        console.log("Created person model");
        return model;
      }
      case "armchair": {
        const model = createArmchairModel();
        console.log("Created armchair model");
        return model;
      }
      default: {
        console.log("Creating default mesh");
        const defaultGeometry = new THREE.BoxGeometry(50, 50, 50);
        const defaultMaterial = new THREE.MeshStandardMaterial({
          color: 0x808080,
        });
        return new THREE.Mesh(defaultGeometry, defaultMaterial);
      }
    }
  };

  // Add lighting setup
  const setupLights = (scene: THREE.Scene) => {
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Directional light for shadows and depth
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 100, 50);
    scene.add(dirLight);

    // Additional point lights for better object visibility
    const pointLight1 = new THREE.PointLight(0xffffff, 0.5);
    pointLight1.position.set(-100, 100, 100);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xffffff, 0.3);
    pointLight2.position.set(100, 100, -100);
    scene.add(pointLight2);
  };

  // Main scene setup effect
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous scene
    if (
      rendererRef.current &&
      containerRef.current.contains(rendererRef.current.domElement)
    ) {
      containerRef.current.removeChild(rendererRef.current.domElement);
    }

    // Initialize scene
    const scene = setupScene();
    if (!scene) return;
    sceneRef.current = scene;

    // Initialize camera
    const camera = setupCamera();
    cameraRef.current = camera;

    // Initialize renderer with antialiasing and shadow support
    const renderer = setupRenderer();
    rendererRef.current = renderer;
    containerRef.current.appendChild(renderer.domElement);

    // Add lights
    setupLights(scene);

    // Initialize TrackballControls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;
    controlsRef.current = controls;

    // Load saved camera state
    // loadCameraState(); //Removed as it's not essential for this modification

    // Add event listener for camera changes
    // controls.addEventListener("change", saveCameraState); //Removed as it's not essential for this modification

    // Add coordinate system axes with labels
    const axesHelper = new THREE.AxesHelper(200);
    scene.add(axesHelper);

    createWalls(scene, renderer, camera);
    createAirEntries(scene);
    createFloorAndRoof(scene, renderer, camera);

    // Add furniture to the scene
    furniture.forEach((item) => {
      const furnitureMesh = createFurnitureMesh(item.id);
      furnitureMesh.position.copy(item.position);
      furnitureMesh.rotation.copy(item.rotation);
      scene.add(furnitureMesh);
    });

    // Count and log all labels in the scene for debugging
    const countLabelsInScene = () => {
      let labelCount = 0;
      scene.traverse((object) => {
        if (object.type === "Sprite" && object.name.includes("label")) {
          labelCount++;
          console.log(`Found label in scene: ${object.name}`, {
            position: `(${object.position.x.toFixed(
              1,
            )}, ${object.position.y.toFixed(1)}, ${object.position.z.toFixed(
              1,
            )})`,
          });
        }
      });
      console.log(`Total labels in scene: ${labelCount}`);
      return labelCount;
    };

    // Call once after setup
    setTimeout(() => {
      countLabelsInScene();
    }, 1000);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return;

      const newWidth = containerRef.current.clientWidth;

      if (cameraRef.current) {
        cameraRef.current.aspect = newWidth / height;
        cameraRef.current.updateProjectionMatrix();
      }

      if (rendererRef.current) {
        rendererRef.current.setSize(newWidth, height);
      }
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);

      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }

      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [
    width,
    height,
    instanceId,
    lines,
    airEntries,
    perimeter,
    shape,
    roomHeight,
    furniture,
  ]);

  // Update effect for wall transparency with detailed logging
  useEffect(() => {
    console.log("=== Wall Transparency Effect ===");
    console.log("Transparency value:", wallTransparency);
    console.log("Wall material ref exists:", !!wallMaterialRef.current);

    if (wallMaterialRef.current && typeof wallTransparency === "number") {
      console.log("Updating wall material:");
      console.log("- Current opacity:", wallMaterialRef.current.opacity);
      console.log("- New opacity:", wallTransparency);

      wallMaterialRef.current.opacity = wallTransparency;
      wallMaterialRef.current.needsUpdate = true;

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        console.log("Rendering scene with new transparency");
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      } else {
        console.warn("Missing required refs for rendering:", {
          renderer: !!rendererRef.current,
          scene: !!sceneRef.current,
          camera: !!cameraRef.current
        });
      }
    } else {
      console.warn("Cannot update wall transparency:", {
        materialExists: !!wallMaterialRef.current,
        transparencyValue: wallTransparency,
        transparencyType: typeof wallTransparency
      });
    }
  }, [wallTransparency]);

  // Add an effect to log the scene contents after each render
  useEffect(() => {
    if (sceneRef.current) {
      // Add a slight delay to ensure the scene is fully rendered
      const timeoutId = setTimeout(() => {
        console.log("🔍 RSP SCENE CONTENTS:");
        let objectCount = 0;
        let floorGroups = 0;
        let wallCount = 0;
        let stairCount = 0;
        let airEntryCount = 0;
        
        sceneRef.current.traverse((object) => {
          if (object.type !== 'Scene' && object.type !== 'PerspectiveCamera' && 
              object.type !== 'DirectionalLight' && object.type !== 'AmbientLight' &&
              object.type !== 'GridHelper') {
            objectCount++;
            
            // Count object types
            if (object.name.includes('floor_')) floorGroups++;
            if (object.name.includes('wall')) wallCount++;
            if (object.name.includes('stair')) stairCount++;
            if (object.name.includes('window') || object.name.includes('door') || object.name.includes('vent')) airEntryCount++;
            
            console.log(`Object #${objectCount}: Name=${object.name}, Type=${object.type}, Visible=${object.visible}, Position=(${object.position.x.toFixed(1)}, ${object.position.y.toFixed(1)}, ${object.position.z.toFixed(1)})`);
          }
        });
        
        console.log(`RSP Scene Summary: Total objects=${objectCount}, Floors=${floorGroups}, Walls=${wallCount}, Stairs=${stairCount}, AirEntries=${airEntryCount}`);
      }, 1000); // 1 second delay
      
      return () => clearTimeout(timeoutId);
    }
  }, [floors, currentFloor]);

  // Handle wall transparency changes with logging
  const handleWallTransparencyChange = (value: number) => {
    console.log("=== Handle Wall Transparency Change ===");
    console.log("New value received:", value);
    console.log("Current wallTransparency:", wallTransparency);
    console.log("Wall material exists:", !!wallMaterialRef.current);

    // Update wall material directly for immediate feedback
    if (wallMaterialRef.current) {
      console.log("Updating wall material directly:");
      console.log("- Current opacity:", wallMaterialRef.current.opacity);
      console.log("- New opacity:", value);

      wallMaterialRef.current.opacity = value;
      wallMaterialRef.current.needsUpdate = true;

      // Render the scene to show changes
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        console.log("Rendering scene with new transparency");
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      } else {
        console.warn("Missing required refs for rendering:", {
          renderer: !!rendererRef.current,
          scene: !!sceneRef.current,
          camera: !!cameraRef.current
        });
      }
    } else {
      console.warn("Wall material ref is not available for direct update");
    }

    // Notify parent component if callback exists
    if (onWallTransparencyChange) {
      console.log("Calling parent onWallTransparencyChange with value:", value);
      onWallTransparencyChange(value);
    }
  };

  const handleDragStart = (item: FurnitureItem) => {
    console.log("Drag started:", item);
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative"
    >
      {/* This div is intentionally empty. The Three.js canvas will be rendered here via DOM insertion */}
    </div>
  );
}