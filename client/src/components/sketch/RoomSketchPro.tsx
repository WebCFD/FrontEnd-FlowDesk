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

  // Initialize scene
  useEffect(() => {
    console.log("RoomSketchPro - Initialization effect running");
    console.log("RoomSketchPro - Floors in context:", geometryData?.floors);
    
    if (!containerRef.current) {
      console.error("RoomSketchPro - Container ref is null, cannot initialize");
      return;
    }

    // Setup scene
    const scene = setupScene();
    if (!scene) {
      console.error("RoomSketchPro - Scene setup failed");
      return;
    }
    sceneRef.current = scene;
    console.log("RoomSketchPro - Scene initialized successfully");

    // Setup camera
    const camera = setupCamera();
    cameraRef.current = camera;

    // Setup renderer
    const renderer = setupRenderer();
    // No need to set renderer properties again, already done in setupRenderer()
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Setup controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.keys = ["KeyA", "KeyS", "KeyD"];
    controlsRef.current = controls;

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
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

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
      controls.dispose();
      renderer.dispose();
      window.removeEventListener('resize', handleResize);
      container.removeEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "copy";
      });
      container.removeEventListener("drop", handleDrop);
    };
  }, [width, height, geometryData?.floors, currentFloor, floors, roomHeight]);
  
  // Function to create multifloor visualization
  const createMultiFloorVisualization = (scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => {
    console.log("RoomSketchPro - Creating multifloor visualization");
    
    // Get the full list of floors from both props and context
    const floorsFromProps = floors ? Object.keys(floors) : [];
    const floorsFromContext = geometryData?.floors ? Object.keys(geometryData.floors) : [];
    const allFloorNames = [...new Set([...floorsFromProps, ...floorsFromContext])].sort();
    
    console.log("🏢 DEBUG - MultifloorViz - Available floors:", {
      fromProps: floorsFromProps,
      fromContext: floorsFromContext,
      combined: allFloorNames
    });
    
    // Add more detailed logging about floor data structure
    console.log("🏢 DETAILED FLOOR DATA:");
    if (floors) {
      Object.keys(floors).forEach(floorKey => {
        console.log(`Floor [${floorKey}] from props:`, {
          lines: floors[floorKey]?.lines?.length || 0,
          airEntries: floors[floorKey]?.airEntries?.length || 0,
          stairs: floors[floorKey]?.stairPolygons?.length || 0,
          linesExample: floors[floorKey]?.lines?.slice(0, 1) || 'none',
          airEntriesExample: floors[floorKey]?.airEntries?.slice(0, 1) || 'none',
          stairsExample: floors[floorKey]?.stairPolygons?.slice(0, 1) || 'none'
        });
      });
    }
    
    if (geometryData?.floors) {
      Object.keys(geometryData.floors).forEach(floorKey => {
        console.log(`Floor [${floorKey}] from context:`, {
          lines: geometryData.floors[floorKey]?.lines?.length || 0,
          airEntries: geometryData.floors[floorKey]?.airEntries?.length || 0,
          stairs: geometryData.floors[floorKey]?.stairPolygons?.length || 0
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
      console.log(`🏢 RoomSketchPro - Creating floor ${floorName} at z=${zPosition}`);
      
      // Create a group for this floor
      const floorGroup = new THREE.Group();
      floorGroup.name = `floor_${floorName}`;
      floorGroup.position.z = zPosition;
      
      // Get floor data from either props or context
      const floorDataFromProps = floors && floors[floorName];
      const floorDataFromContext = geometryData?.floors && geometryData.floors[floorName];
      const floorData = floorDataFromProps || floorDataFromContext;
      
      console.log(`🏢 Floor [${floorName}] data sources:`, {
        fromProps: !!floorDataFromProps,
        fromContext: !!floorDataFromContext,
        hasData: !!floorData,
        dataSource: floorDataFromProps ? 'props' : (floorDataFromContext ? 'context' : 'none')
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
      const floorGroup = createFloorFromData(floorName, zPosition);
      multiFloorGroup.add(floorGroup);
    });
    
    // Connect floors with stairs if stair data is available
    console.log("🪜 Starting stair connections between floors...");
    allFloorNames.forEach((floorName) => {
      // Get floor data from either props or context
      const floorDataFromProps = floors && floors[floorName];
      const floorDataFromContext = geometryData?.floors && geometryData.floors[floorName];
      const floorData = floorDataFromProps || floorDataFromContext;
      
      console.log(`🪜 Checking for stairs in floor [${floorName}]:`, {
        hasStairsData: !!floorData?.stairPolygons,
        stairCount: floorData?.stairPolygons?.length || 0,
        dataSource: floorDataFromProps ? 'props' : (floorDataFromContext ? 'context' : 'none')
      });
      
      if (floorData?.stairPolygons && floorData.stairPolygons.length > 0) {
        console.log(`🪜 Adding ${floorData.stairPolygons.length} stairs for floor ${floorName}:`);
        
        // Log stair data in a detailed format
        floorData.stairPolygons.forEach((stairData: any, index: number) => {
          console.log(`Stair #${index} data:`, {
            position: stairData.position ? `(${stairData.position.x}, ${stairData.position.y})` : 'undefined',
            hasDirection: !!stairData.direction,
            direction: stairData.direction,
            width: stairData.width,
            depth: stairData.depth
          });
        });
        
        // Process each stair polygon
        floorData.stairPolygons.forEach((stairData: any, stairIndex: number) => {
          // Create stair visualization
          createStairsVisualization(stairData, floorName, stairIndex, multiFloorGroup, floorGroups);
        });
      } else {
        console.log(`ℹ️ No stairs found for floor [${floorName}]`);
      }
    });
    
    // Add the multi-floor group to the scene
    scene.add(multiFloorGroup);
    
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
  
  // Function to create stair visualization between floors
  const createStairsVisualization = (
    stairData: any, 
    floorName: string, 
    stairIndex: number, 
    multiFloorGroup: THREE.Group,
    floorGroups: Record<string, THREE.Group>
  ) => {
    console.log(`Starting stair visualization for floor "${floorName}" stair #${stairIndex}:`, stairData);
    
    // Get floor indices
    const floorNames = Object.keys(floorGroups).sort();
    const currentFloorIndex = floorNames.indexOf(floorName);
    
    console.log(`Floor index info:`, {
      floorName,
      currentFloorIndex,
      availableFloors: floorNames,
      totalFloors: floorNames.length,
      stairDirection: stairData.direction
    });
    
    // Determine connected floor based on stair direction
    let connectedFloorName: string | null = null;
    
    // If stair direction is specified, use it to determine the connected floor
    if (stairData.direction) {
      if (stairData.direction === 'up') {
        // If direction is up, we're connecting from this floor to the one above
        const floorIndex = currentFloorIndex - 1; // Floor above has lower index in the array
        connectedFloorName = floorIndex >= 0 ? floorNames[floorIndex] : null;
        
        console.log(`Stair goes UP from ${floorName} to ${connectedFloorName || 'nowhere'}`);
      } 
      else if (stairData.direction === 'down') {
        // If direction is down, we're connecting from this floor to the one below
        const floorIndex = currentFloorIndex + 1; // Floor below has higher index in the array
        connectedFloorName = floorIndex < floorNames.length ? floorNames[floorIndex] : null;
        
        console.log(`Stair goes DOWN from ${floorName} to ${connectedFloorName || 'nowhere'}`);
      }
    } 
    // Fallback to default behavior if no direction is specified
    else if (currentFloorIndex < floorNames.length - 1) {
      connectedFloorName = floorNames[currentFloorIndex + 1];
      console.log(`No direction specified, defaulting to connect ${floorName} to ${connectedFloorName}`);
    }
    
    // Check if we have a valid connected floor
    if (!connectedFloorName) {
      console.warn(`Cannot create stairs for "${floorName}": No valid connected floor for direction ${stairData.direction}`);
      return;
    }
    
    // For simplicity in the rest of the code, standardize terminology:
    // The current floor where the stair starts is sourceFloor
    // The floor where the stair leads to is targetFloor
    const sourceFloorName = floorName;
    const targetFloorName = connectedFloorName;
    
    console.log(`Stair will connect:`, {
      sourceFloor: sourceFloorName,
      targetFloor: targetFloorName,
      hasSourceFloorGroup: !!floorGroups[sourceFloorName],
      hasTargetFloorGroup: !!floorGroups[targetFloorName],
      stairData: {
        hasPosition: !!stairData.position,
        position: stairData.position ? `(${stairData.position.x}, ${stairData.position.y})` : 'undefined',
        direction: stairData.direction || 'none'
      }
    });
    
    if (!sourceFloorName || !targetFloorName || !floorGroups[sourceFloorName] || !floorGroups[targetFloorName]) {
      console.warn("Cannot create stairs, missing floor groups:", {
        sourceFloorName,
        targetFloorName,
        availableGroups: Object.keys(floorGroups)
      });
      return;
    }
    
    console.log(`Creating stairs from ${sourceFloorName} to ${targetFloorName}`);
    
    // Create stair material
    const stairMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.7,
      metalness: 0.2
    });
    
    // Constants for stair dimensions
    const STAIR_RISE = 20; // Height of each step (cm)
    const STAIR_RUN = 25;  // Depth of each step (cm)
    const STAIR_WIDTH = 100; // Width of stairs (cm)
    
    // Get floor heights - using our new sourceFloor and targetFloor variables
    const sourceFloorHeight = floorGroups[sourceFloorName].position.z;
    const targetFloorHeight = floorGroups[targetFloorName].position.z;
    const heightDifference = targetFloorHeight - sourceFloorHeight;
    
    // Calculate number of steps based on height
    const numSteps = Math.floor(Math.abs(heightDifference) / STAIR_RISE);
    
    if (numSteps <= 0) {
      console.warn("Cannot create stairs, invalid height difference:", heightDifference);
      return;
    }
    
    // Create stair group
    const stairGroup = new THREE.Group();
    stairGroup.name = `stairs_${sourceFloorName}_to_${targetFloorName}_${stairIndex}`;
    
    // Get stair position from stair data
    const stairPosition = transform2DTo3D(stairData.position || { x: 0, y: 0 });
    
    // Create each step
    for (let i = 0; i < numSteps; i++) {
      const stepGeometry = new THREE.BoxGeometry(STAIR_WIDTH, STAIR_RUN, STAIR_RISE);
      const step = new THREE.Mesh(stepGeometry, stairMaterial);
      
      // Determine step position based on direction
      let stepZPosition;
      if (heightDifference > 0) {
        // Going up from source to target
        stepZPosition = sourceFloorHeight + (i + 0.5) * STAIR_RISE;
      } else {
        // Going down from source to target
        stepZPosition = sourceFloorHeight - (i + 0.5) * STAIR_RISE;
      }
      
      // Position step
      step.position.set(
        0, // Center on X
        i * STAIR_RUN, // Position along Y based on step number
        stepZPosition // Position Z based on step height and direction
      );
      
      step.name = `step_${i}`;
      stairGroup.add(step);
    }
    
    // Position the stair group based on stair data
    stairGroup.position.copy(stairPosition);
    
    // Add to the multi-floor group
    multiFloorGroup.add(stairGroup);
  };
  
  // Add a new effect to respond to current floor changes in context or from props
  useEffect(() => {
    // Check both context data and direct props
    const contextFloor = geometryData?.currentFloor;
    console.log("RoomSketchPro - Current floor changed to:", currentFloor || contextFloor);
    console.log("RoomSketchPro - Available floors in context:", Object.keys(geometryData?.floors || {}));
    console.log("RoomSketchPro - Available floors from props:", floors ? Object.keys(floors) : []);
    
    // Only rebuild scene if we already have one
    if (sceneRef.current && rendererRef.current && cameraRef.current) {
      console.log("RoomSketchPro - Rebuilding scene for floor change");
      
      // Clear existing scene objects except lights and grid
      if (sceneRef.current) {
        // Get a list of all objects to remove
        const objectsToRemove: THREE.Object3D[] = [];
        sceneRef.current.traverse((object) => {
          // Skip lights, camera, and grid - only remove walls and air entries
          if (object.type !== 'DirectionalLight' && 
              object.type !== 'AmbientLight' &&
              object.type !== 'PerspectiveCamera' &&
              object.type !== 'GridHelper' &&
              object.type !== 'Scene') {
            objectsToRemove.push(object);
          }
        });
        
        // Remove the objects
        objectsToRemove.forEach(obj => {
          sceneRef.current?.remove(obj);
        });
        
        // Check if we should display multiple floors
        const floorsFromProps = floors ? Object.keys(floors) : [];
        const floorsFromContext = geometryData?.floors ? Object.keys(geometryData.floors) : [];
        const allFloors = [...new Set([...floorsFromProps, ...floorsFromContext])];
        
        console.log("DEBUG - Multi-floor check:", {
          floorsFromProps,
          floorsFromContext,
          allFloors,
          hasFloorsProps: !!floors,
          floorsLength: floors ? Object.keys(floors).length : 0,
          geometryDataFloors: geometryData?.floors
        });
        
        // Force multifloor visualization whenever we have more than one floor in floors prop
        if (floors && Object.keys(floors).length > 1) {
          // Extra debug to see exact floor data structure
          console.log("🌈 FLOORS STRUCTURE DEBUG:");
          Object.keys(floors).forEach(floorKey => {
            console.log(`Floor [${floorKey}]:`, {
              lineCount: floors[floorKey]?.lines?.length || 0,
              airEntryCount: floors[floorKey]?.airEntries?.length || 0,
              hasStairs: !!floors[floorKey]?.stairPolygons?.length,
              stairCount: floors[floorKey]?.stairPolygons?.length || 0
            });
          });
          
          console.log("RoomSketchPro - Creating multifloor visualization with floors:", Object.keys(floors));
          createMultiFloorVisualization(sceneRef.current, rendererRef.current, cameraRef.current);
        } else {
          // Otherwise just build the current floor
          console.log("RoomSketchPro - Creating single floor view - multifloor condition not met");
          console.log("🔎 SINGLE FLOOR DEBUG - floors object:", floors);
          console.log("🔎 SINGLE FLOOR DEBUG - currentFloor:", currentFloor);
          createWalls(sceneRef.current, rendererRef.current, cameraRef.current);
          createAirEntries(sceneRef.current);
        }
        
        // Render the updated scene
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }
  }, [geometryData?.currentFloor, currentFloor, floors]);

  // Extract perimeter points using useMemo to avoid recalculation
  // Use geometryData.lines from the context if available, otherwise fall back to lines prop
  const perimeter = useMemo(
    () => roomUtils.createRoomPerimeter(geometryData?.lines || lines),
    [geometryData?.lines, lines],
  );

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
    // First, check if we have direct floors and currentFloor props
    const currentFloorFromProps = currentFloor && floors && floors[currentFloor];
    
    // If direct props are available, use them; otherwise, try to get them from the context
    const useDirectProps = currentFloorFromProps && floors && currentFloor;
    const currentFloorName = useDirectProps ? currentFloor : geometryData?.currentFloor;
    const currentFloorData = useDirectProps 
        ? floors[currentFloorName] 
        : geometryData?.floors?.[geometryData?.currentFloor];
        
    // Get lines for the current floor - first from props, then from context if needed
    const contextLines = currentFloorData?.lines || geometryData?.lines || [];
    const linesToUse = lines.length > 0 ? lines : contextLines;
    
    console.log("RoomSketchPro - Current floor:", currentFloorName);
    console.log("RoomSketchPro - Using direct props:", useDirectProps);
    console.log("RoomSketchPro - Using lines data:", linesToUse);
    
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

    // First, check if we have direct floors and currentFloor props
    const currentFloorFromProps = currentFloor && floors && floors[currentFloor];
    
    // If direct props are available, use them; otherwise, try to get them from the context
    const useDirectProps = currentFloorFromProps && floors && currentFloor;
    const currentFloorName = useDirectProps ? currentFloor : geometryData?.currentFloor;
    const currentFloorData = useDirectProps 
        ? floors[currentFloorName] 
        : geometryData?.floors?.[geometryData?.currentFloor];
        
    // Get air entries for the current floor - first from props, then from context if needed
    const contextAirEntries = currentFloorData?.airEntries || geometryData?.airEntries || [];
    const entriesData = airEntries.length > 0 ? airEntries : contextAirEntries;
    
    console.log("RoomSketchPro - Current floor for air entries:", currentFloorName);
    console.log("RoomSketchPro - Using direct props for air entries:", useDirectProps);
    console.log("RoomSketchPro - Using air entries data:", entriesData);
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