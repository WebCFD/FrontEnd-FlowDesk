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

  // Air entries creation (doors, windows, vents)
  const createAirEntries = (scene: THREE.Scene) => {
    airEntries.forEach(entry => {
      // Set color and material based on entry type
      let material;
      if (entry.type === "window") {
        // Create glass material with realistic properties
        material = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0.1,
          roughness: 0.05,
          transmission: 0.95, // High transparency
          thickness: 0.5,
          opacity: 0.3,
          transparent: true,
          side: THREE.DoubleSide,
          clearcoat: 1.0,
          clearcoatRoughness: 0.1,
          envMapIntensity: 1.5
        });
      } else if (entry.type === "door") {
        // Create texture loader and load door texture
        const textureLoader = new THREE.TextureLoader();
        const doorTexture = textureLoader.load(
          'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/hardwood2_diffuse.jpg',
          (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 1);
          }
        );

        material = new THREE.MeshPhongMaterial({
          map: doorTexture,
          color: 0xffffff,
          opacity: 1.0,
          transparent: false,
          side: THREE.DoubleSide,
        });
      } else { // vent
        material = new THREE.MeshPhongMaterial({
          color: 0x22c55e,
          opacity: 0.8,
          transparent: true,
          side: THREE.DoubleSide,
        });
      }

      const width = entry.dimensions.width * DEFAULTS.PIXELS_TO_CM;
      const height = entry.dimensions.height * DEFAULTS.PIXELS_TO_CM;

      // Calculate Z position based on entry type and convert to proper scale
      const zPosition =
        entry.type === "door"
          ? height / 2  // Center the door vertically
          : (entry.dimensions.distanceToFloor || 0) * DEFAULTS.PIXELS_TO_CM;

      // Calculate wall direction and normal vectors using the same method as walls
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

      // For windows, create a more sophisticated structure
      if (entry.type === "window") {
        const windowDepth = 8; // Total window depth
        const frameThickness = 4; // Thickness of the frame
        const glassOffset = 2; // Offset of glass from frame
        const position = transform2DTo3D(entry.position);

        // Adjust position to be slightly in front of the wall
        position.x += wallNormalVector.x * windowDepth/2;
        position.y += wallNormalVector.y * windowDepth/2;

        // Create rotation matrix
        const forward = wallNormalVector.clone();
        const up = new THREE.Vector3(0, 0, 1);
        const right = new THREE.Vector3().crossVectors(up, forward).normalize();
        forward.crossVectors(right, up).normalize();
        const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, forward);

        // Create outer frame
        const outerFrameGeometry = new THREE.BoxGeometry(
          width + frameThickness*2,
          height + frameThickness*2,
          windowDepth
        );
        const frameMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x4a5568,
          metalness: 0.5,
          roughness: 0.5,
          envMapIntensity: 1.0
        });
        const outerFrame = new THREE.Mesh(outerFrameGeometry, frameMaterial);
        outerFrame.position.copy(position);
        outerFrame.position.z = zPosition;
        outerFrame.setRotationFromMatrix(rotationMatrix);
        scene.add(outerFrame);

        // Create glass panes (2x2 grid)
        const paneWidth = width/2 - frameThickness;
        const paneHeight = height/2 - frameThickness;
        const panePositions = [
          [-width/4, height/4],
          [width/4, height/4],
          [-width/4, -height/4],
          [width/4, -height/4]
        ];

        panePositions.forEach(([x, y]) => {
          const paneGeometry = new THREE.BoxGeometry(paneWidth, paneHeight, 0.2);
          const glassPane = new THREE.Mesh(paneGeometry, material);
          const panePosition = position.clone();

          // Position relative to window center
          panePosition.x += right.x * x + forward.x * glassOffset;
          panePosition.y += right.y * x + forward.y * glassOffset;
          panePosition.z = zPosition + y;

          glassPane.position.copy(panePosition);
          glassPane.setRotationFromMatrix(rotationMatrix);
          scene.add(glassPane);
        });

        // Create cross frame (vertical and horizontal dividers)
        const dividerWidth = frameThickness;
        const dividerDepth = windowDepth - 2;

        // Horizontal divider
        const horizontalDividerGeometry = new THREE.BoxGeometry(
          width,
          dividerWidth,
          dividerDepth
        );
        const horizontalDivider = new THREE.Mesh(horizontalDividerGeometry, frameMaterial);
        horizontalDivider.position.copy(position);
        horizontalDivider.position.z = zPosition;
        horizontalDivider.setRotationFromMatrix(rotationMatrix);
        scene.add(horizontalDivider);

        // Vertical divider
        const verticalDividerGeometry = new THREE.BoxGeometry(
          dividerWidth,
          height,
          dividerDepth
        );
        const verticalDivider = new THREE.Mesh(verticalDividerGeometry, frameMaterial);
        verticalDivider.position.copy(position);
        verticalDivider.position.z = zPosition;
        verticalDivider.setRotationFromMatrix(rotationMatrix);
        scene.add(verticalDivider);

      } else {
        // For doors and vents, keep the simple geometry
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
      }
    });
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

    // Create floor and roof surfaces using the room perimeter
    createFloorAndRoof(scene, renderer, camera);


    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Create walls and air entries
    createWalls(scene, renderer, camera);
    createAirEntries(scene);

    // Animation loop
    let animationFrameId: number;
    function animate() {
      if (!scene || !camera || !renderer || !controls) return;

      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Handle resize
    const handleResize = () => {
      if (!camera || !renderer || !containerRef.current) return;

      const newWidth = containerRef.current.clientWidth;
      const newHeight = height;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('change', saveCameraState);
      cancelAnimationFrame(animationFrameId);

      if (renderer && containerRef.current && containerRef.current.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }

      // Dispose of geometries and materials
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) object.geometry.dispose();

          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else if (object.material) {
            object.material.dispose();
          }
        }
      });

      if (renderer) renderer.dispose();
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

  // Render component
  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: `${height}px`,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '0.5rem',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      }}
    />
  );
}