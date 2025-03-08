import { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { makeTextSprite } from "@/lib/three-utils";
import { createTableModel, createPersonModel, createArmchairModel } from "./furniture-models";
import { FurnitureMenu } from "./FurnitureMenu"; // Import FurnitureMenu

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
  width: number;
  height: number;
  instanceId?: string;
  lines?: Line[];
  airEntries?: AirEntry[];
  roomHeight?: number;
  onFurnitureAdd?: (item: FurnitureItem) => void;
  wallTransparency: number;
  onWallTransparencyChange: (value: number) => void;
}

// Constants
const DEFAULTS = {
  ROOM_HEIGHT: 210,
  PIXELS_TO_CM: 25 / 20,
  GRID_SIZE: 1000,
  GRID_DIVISIONS: 40,
  BACKGROUND_COLOR: 0xf8fafc,
  WALL_COLOR: 0x3b82f6,
  FLOOR_COLOR: 0x808080,
  ROOF_COLOR: 0xe0e0e0,
};

// Helper functions
const roomUtils = {
  // Transform 2D point to 3D space (XY plane as ground, Z as height)
  transform2DTo3D: (point: Point, height: number = 0): THREE.Vector3 => {
    const dimensions = { width: 800, height: 600 };
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

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

export function RoomSketchPro({
  width,
  height,
  instanceId = "default",
  lines = [],
  airEntries = [],
  roomHeight = DEFAULTS.ROOM_HEIGHT,
  onFurnitureAdd,
  wallTransparency = 0.8,
  onWallTransparencyChange,
}: RoomSketchProProps) {
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

    // Add floor plane (in XY plane)
    const floorGeometry = new THREE.PlaneGeometry(500, 500);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.z = 0; // Place at z=0
    floor.receiveShadow = true;
    scene.add(floor);
    floorRef.current = floor;

    // Add grid helper aligned with floor in XY plane
    const gridHelper = new THREE.GridHelper(500, 20);
    gridHelper.rotation.x = Math.PI / 2; // Rotate to XY plane
    gridHelper.position.z = 0.1; // Slightly behind floor to avoid z-fighting
    scene.add(gridHelper);

    return scene;
  };

  // Setup camera function with better viewing angle for XY plane
  const setupCamera = () => {
    const camera = new THREE.PerspectiveCamera(
      60,
      width / height,
      1,
      2000,
    );
    camera.position.set(200, 200, 400); // Position for viewing XY plane
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
    if (!containerRef.current) return;

    // Setup scene
    const scene = setupScene();
    if (!scene) return;
    sceneRef.current = scene;

    // Setup camera
    const camera = setupCamera();
    cameraRef.current = camera;

    // Setup renderer
    const renderer = setupRenderer();
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Setup controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.keys = ["KeyA", "KeyS", "KeyD"];
    controlsRef.current = controls;

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

    // Cleanup
    return () => {
      controls.dispose();
      renderer.dispose();
      container.removeEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "copy";
      });
      container.removeEventListener("drop", handleDrop);
    };
  }, [width, height]);

  // Extract perimeter points using useMemo to avoid recalculation
  const perimeter = useMemo(
    () => roomUtils.createRoomPerimeter(lines),
    [lines],
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
    const textureLoader = new THREE.TextureLoader();
    const brickTexture = textureLoader.load(
      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/brick_diffuse.jpg",
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 1);
        renderer.render(scene, camera);
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

    // Convert 2D lines to 3D walls
    lines.forEach((line) => {
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

    airEntries.forEach((entry) => {
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

          glassPane.position.set(pos[0], pos[1], pos[2]);
          ventGroup.add(glassPane);
        });
        // Positionand rotate the vent group
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
    const sillDepth = windowDepth * 1.2; // Slightlydeeper than window
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

      glassPane.position.set(...pos);
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
    const perimeterPoints = roomUtils.createRoomPerimeter(lines);
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
      scene.add(floor);

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

  // Update effect for wall transparency
  useEffect(() => {
    if (wallMaterialRef.current) {
      wallMaterialRef.current.opacity = wallTransparency;
      wallMaterialRef.current.needsUpdate = true;
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }
  }, [wallTransparency]);

  const handleDragStart = (item: FurnitureItem) => {
    console.log("Drag started:", item);
  };

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          position: "relative",
        }}
      />
    </div>
  );
}