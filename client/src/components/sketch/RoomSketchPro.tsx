import { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

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
  type: 'vent' | 'door' | 'window';
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
}

interface RoomSketchProProps {
  width: number;
  height: number;
  instanceId?: string;
  lines?: Line[];
  airEntries?: AirEntry[];
  roomHeight?: number;
  backgroundColor?: string;
  wallColor?: string;
  floorColor?: string;
  roofColor?: string;
}

// Constants
const DEFAULTS = {
  ROOM_HEIGHT: 210, // Room height in cm
  PIXELS_TO_CM: 25 / 20, // 25cm = 20px ratio
  GRID_SIZE: 1000, // Size of the grid in cm
  GRID_DIVISIONS: 40, // Number of divisions in the grid
  BACKGROUND_COLOR: 0xf8fafc,
  WALL_COLOR: 0x3b82f6,
  FLOOR_COLOR: 0x808080,
  ROOF_COLOR: 0xe0e0e0,
};

// Helper functions separated for better organization
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
      if (!startConnections.some(p => pointToString(p) === endKey)) {
        startConnections.push(line.end);
      }

      const endConnections = pointGraph.get(endKey)!;
      if (!endConnections.some(p => pointToString(p) === startKey)) {
        endConnections.push(line.start);
      }
    });

    // Find points with only one connection (likely perimeter endpoints)
    const findEndpoints = (): Point[] => {
      const endpoints: Point[] = [];
      pointGraph.forEach((connections, pointKey) => {
        if (connections.length <= 1) {
          const [x, y] = pointKey.split(',').map(Number);
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
          const [x, y] = pointKey.split(',').map(Number);
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
      const nextPoint = neighbors.find(p => !visited.has(pointToString(p)));

      if (!nextPoint) {
        // Try to close the loop if possible
        if (perimeter.length > 2 &&
          arePointsEqual(perimeter[0], neighbors[0]) &&
          perimeter.length !== neighbors.length + 1) {
          perimeter.push(perimeter[0]); // Close the loop
        }
        break;
      }

      perimeter.push(nextPoint);
      visited.add(pointToString(nextPoint));
      currentPoint = nextPoint;
    }

    // Verify we created a closed loop
    if (perimeter.length > 2 && !arePointsEqual(perimeter[0], perimeter[perimeter.length - 1])) {
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
  }
};

const transform2DTo3D = roomUtils.transform2DTo3D;

export function RoomSketchPro({
  width,
  height,
  instanceId = 'default',
  lines = [],
  airEntries = [],
  roomHeight = DEFAULTS.ROOM_HEIGHT,
  backgroundColor = DEFAULTS.BACKGROUND_COLOR,
  wallColor = DEFAULTS.WALL_COLOR,
  floorColor = DEFAULTS.FLOOR_COLOR,
  roofColor = DEFAULTS.ROOF_COLOR
}: RoomSketchProProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);

  // Extract perimeter points using useMemo to avoid recalculation
  const perimeter = useMemo(() => roomUtils.createRoomPerimeter(lines), [lines]);

  // Create shape from perimeter
  const shape = useMemo(() => roomUtils.createShapeFromPerimeter(perimeter), [perimeter]);

  // Camera state management
  const saveCameraState = () => {
    if (cameraRef.current && controlsRef.current) {
      const cameraState = {
        position: cameraRef.current.position.toArray(),
        target: controlsRef.current.target.toArray(),
        zoom: cameraRef.current.zoom
      };
      localStorage.setItem(`roomSketchPro-camera-${instanceId}`, JSON.stringify(cameraState));
    }
  };

  const loadCameraState = () => {
    const savedState = localStorage.getItem(`roomSketchPro-camera-${instanceId}`);
    if (savedState && cameraRef.current && controlsRef.current) {
      try {
        const state = JSON.parse(savedState);
        cameraRef.current.position.fromArray(state.position);
        controlsRef.current.target.fromArray(state.target);
        cameraRef.current.zoom = state.zoom;
        cameraRef.current.updateProjectionMatrix();
      } catch (error) {
        console.error('Failed to load camera state:', error);
      }
    }
  };

  // Wall creation
  const createWalls = (scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => {
    // Create texture loader and load brick texture
    const textureLoader = new THREE.TextureLoader();
    const brickTexture = textureLoader.load(
      'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/brick_diffuse.jpg',
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 1); // Adjust the repeat scale for better visual
        renderer.render(scene, camera);
      }
    );

    // Create wall material with brick texture
    const wallMaterial = new THREE.MeshPhongMaterial({
      map: brickTexture,
      color: 0xffffff, // White to show texture properly
      opacity: 0.8,
      transparent: true,
      side: THREE.DoubleSide,
    });

    // Convert 2D lines to 3D walls using transformed coordinates
    lines.forEach((line) => {
      // Create vertices for wall corners
      const start_bottom = transform2DTo3D(line.start);
      const end_bottom = transform2DTo3D(line.end);
      const start_top = transform2DTo3D(line.start, DEFAULTS.ROOM_HEIGHT);
      const end_top = transform2DTo3D(line.end, DEFAULTS.ROOM_HEIGHT);

      // Create vertices array from points
      const vertices = new Float32Array([
        start_bottom.x, start_bottom.y, start_bottom.z,
        end_bottom.x, end_bottom.y, end_bottom.z,
        start_top.x, start_top.y, start_top.z,
        end_top.x, end_top.y, end_top.z,
      ]);

      // Create faces indices (triangles)
      const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);

      // Create UV coordinates for proper texture mapping
      const uvs = new Float32Array([
        0, 0,  // bottom left
        1, 0,  // bottom right
        0, 1,  // top left
        1, 1   // top right
      ]);

      // Create the wall geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();

      // Create the wall mesh
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
      envMapIntensity: 1.8
    });

    // Load wood texture for window frames
    const woodTexture = textureLoader.load(
      'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/hardwood2_diffuse.jpg',
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
      }
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

    // Vent material
    const ventMaterial = new THREE.MeshPhongMaterial({
      color: 0x22c55e,
      opacity: 0.8,
      transparent: true,
      side: THREE.DoubleSide,
    });

    airEntries.forEach(entry => {
      // Set material based on entry type
      let material;
      if (entry.type === "window") {
        // Windows are handled specially with the enhanced window creation
        createDetailedWindow(entry, frameMaterial, glassMaterial, scene);
        return; // Skip the default creation for windows
      } else if (entry.type === "door") {
        material = doorMaterial;
      } else { // vent
        material = ventMaterial;
      }

      // For doors and vents, keep the simple geometry
      const width = entry.dimensions.width * DEFAULTS.PIXELS_TO_CM;
      const height = entry.dimensions.height * DEFAULTS.PIXELS_TO_CM;

      // Calculate Z position based on entry type
      const zPosition =
        entry.type === "door"
          ? height / 2  // Center the door vertically
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

      scene.add(mesh);
    });
  };

  // New function to create highly detailed windows
  const createDetailedWindow = (entry: AirEntry, frameMaterial: THREE.Material, glassMaterial: THREE.Material, scene: THREE.Scene) => {
    const width = entry.dimensions.width * DEFAULTS.PIXELS_TO_CM;
    const height = entry.dimensions.height * DEFAULTS.PIXELS_TO_CM;
    const windowDepth = 12; // Total window depth in cm

    // Calculate Z position and wall normal
    const zPosition = (entry.dimensions.distanceToFloor || 100) * DEFAULTS.PIXELS_TO_CM;

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
      new THREE.BoxGeometry(width + frameThickness * 2, frameThickness, frameDepth),
      frameMaterial
    );
    topFrame.position.set(0, height / 2 + frameThickness / 2, 0);
    windowGroup.add(topFrame);

    // Bottom frame with sill
    const bottomFrame = new THREE.Mesh(
      new THREE.BoxGeometry(width + frameThickness * 2, frameThickness, frameDepth),
      frameMaterial
    );
    bottomFrame.position.set(0, -height / 2 - frameThickness / 2, 0);
    windowGroup.add(bottomFrame);

    // Window sill (extends outward from the bottom frame)
    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(width + frameThickness * 3, sillHeight, sillDepth),
      frameMaterial
    );
    sill.position.set(0, -height / 2 - frameThickness - sillHeight / 2, sillDepth / 2 - frameDepth / 2);
    windowGroup.add(sill);

    // Left frame
    const leftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, height, frameDepth),
      frameMaterial
    );
    leftFrame.position.set(-width / 2 - frameThickness / 2, 0, 0);
    windowGroup.add(leftFrame);

    // Right frame
    const rightFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, height, frameDepth),
      frameMaterial
    );
    rightFrame.position.set(width / 2 + frameThickness / 2, 0, 0);
    windowGroup.add(rightFrame);

    // Create mullions (cross pattern dividers) - thinner than the main frame
    const mullionThickness = frameThickness * 0.7;
    const mullionDepth = frameDepth * 0.9;

    // Horizontal mullion
    const horizontalMullion = new THREE.Mesh(
      new THREE.BoxGeometry(width, mullionThickness, mullionDepth),
      frameMaterial
    );
    horizontalMullion.position.set(0, 0, 0); // Center of window
    windowGroup.add(horizontalMullion);

    // Vertical mullion
    const verticalMullion = new THREE.Mesh(
      new THREE.BoxGeometry(mullionThickness, height, mullionDepth),
      frameMaterial
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
      [width / 4, -height / 4, -glassInset]
    ];

    // Create the glass panes
    panePositions.forEach((pos, index) => {
      // Create subtle variation in each pane
      const paneVariation = 0.02; // Small random variation
      const paneOpacity = 0.9 - Math.random() * 0.1; // Slight opacity variation

      // Clone the glass material to make variations
      const paneGlassMaterial = (glassMaterial as THREE.MeshPhysicalMaterial).clone();
      paneGlassMaterial.opacity = paneOpacity;

      // Add subtle imperfections to glass with different transmission values
      paneGlassMaterial.transmission = 0.92 + Math.random() * 0.06;

      // Create glass pane with slight thickness
      const glassPane = new THREE.Mesh(
        new THREE.BoxGeometry(
          paneWidth - frameThickness * paneVariation,
          paneHeight - frameThickness * paneVariation,
          0.4 // Very thin glass
        ),
        paneGlassMaterial
      );

      glassPane.position.set(...pos);
      windowGroup.add(glassPane);
    });

    // Add window hardware (handle) to one of the panes
    const handleBaseGeometry = new THREE.BoxGeometry(frameThickness * 1.5, frameThickness * 1.5, frameThickness * 0.5);
    const handleBaseMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x777777,
      metalness: 0.8,
      roughness: 0.2
    });

    const handleBase = new THREE.Mesh(handleBaseGeometry, handleBaseMaterial);
    handleBase.position.set(width / 4, 0, -frameDepth / 2 - frameThickness * 0.25);
    windowGroup.add(handleBase);

    // Create the handle lever
    const handleLeverGeometry = new THREE.CylinderGeometry(frameThickness * 0.3, frameThickness * 0.3, frameThickness * 3, 16);
    const handleLever = new THREE.Mesh(handleLeverGeometry, handleBaseMaterial);
    handleLever.rotation.set(0, 0, Math.PI / 2);
    handleLever.position.set(width / 4, -frameThickness * 1.5, -frameDepth / 2 - frameThickness * 0.5);
    windowGroup.add(handleLever);

    // Add subtle shadow catching surfaces near the window
    // This would typically be done with proper lighting, but here's a placeholder
    const shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(width + frameThickness * 4, height + frameThickness * 4),
      new THREE.MeshPhongMaterial({
        color: 0x000000,
        opacity: 0.1,
        transparent: true,
        side: THREE.FrontSide,
      })
    );
    shadowCatcher.position.set(0, 0, frameDepth / 2 + 0.1);
    windowGroup.add(shadowCatcher);

    // Add the entire window group to the scene
    scene.add(windowGroup);

    return windowGroup;
  };

  // Create floor and roof
  const createFloorAndRoof = (scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => {
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
        'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/hardwood2_diffuse.jpg',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(5, 5); // Adjust the repeat scale for better visual
          renderer.render(scene, camera);
        }
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
        color: roofColor,
        opacity: 0.2,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.set(0, 0, DEFAULTS.ROOM_HEIGHT); // Place at Z=ROOM_HEIGHT
      scene.add(roof);
    }
  };

  // Main effect for scene setup
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous scene
    if (rendererRef.current && containerRef.current.contains(rendererRef.current.domElement)) {
      containerRef.current.removeChild(rendererRef.current.domElement);
    }

    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);
    sceneRef.current = scene;

    // Initialize camera
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / height,
      1,
      10000,
    );
    camera.position.set(0, 0, 1000); // Position camera along Z-axis looking at XY plane
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Initialize renderer with antialiasing and shadow support
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setSize(containerRef.current.clientWidth, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Initialize TrackballControls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;
    controlsRef.current = controls;

    // Load saved camera state
    loadCameraState();

    // Add event listener for camera changes
    controls.addEventListener('change', saveCameraState);

    // Add coordinate system axes with labels
    const axesHelper = new THREE.AxesHelper(200);
    scene.add(axesHelper);

    // Set up enhanced lighting for better shadows and reflections
    // Ambient light for general illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(500, 500, 500);
    directionalLight.castShadow = true;

    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 2000;
    directionalLight.shadow.bias = -0.0001;

    scene.add(directionalLight);

    createWalls(scene, renderer, camera);
    createAirEntries(scene);
    createFloorAndRoof(scene, renderer, camera);


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

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);

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
    backgroundColor,
    wallColor,
    floorColor,
    roofColor
  ]);

  return <div ref={containerRef} style={{ height }} />;
}