import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

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
}

// Constants matching Canvas3D
const ROOM_HEIGHT = 210; // Room height in cm
const PIXELS_TO_CM = 25 / 20; // 25cm = 20px ratio
const GRID_SIZE = 1000; // Size of the grid in cm
const GRID_DIVISIONS = 40; // Number of divisions in the grid

const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  const dimensions = { width: 800, height: 600 };
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;

  const relativeX = point.x - centerX;
  const relativeY = centerY - point.y;

  return new THREE.Vector3(
    relativeX * PIXELS_TO_CM,
    relativeY * PIXELS_TO_CM,
    height,
  );
};

const createRoomPerimeter = (lines: Line[]): Point[] => {
  if (lines.length === 0) return [];

  const perimeter: Point[] = [];
  const visited = new Set<string>();
  const pointToString = (p: Point) => `${p.x},${p.y}`;

  // Create a map of points to their connected lines
  const connections = new Map<string, Point[]>();
  lines.forEach((line) => {
    const startKey = pointToString(line.start);
    const endKey = pointToString(line.end);

    if (!connections.has(startKey)) connections.set(startKey, []);
    if (!connections.has(endKey)) connections.set(endKey, []);

    connections.get(startKey)!.push(line.end);
    connections.get(endKey)!.push(line.start);
  });

  // Start with the first point
  const startPoint = lines[0].start;
  perimeter.push(startPoint);
  visited.add(pointToString(startPoint));

  // Find connected points
  let currentPoint = startPoint;
  while (true) {
    const connectedPoints = connections.get(pointToString(currentPoint)) || [];
    const nextPoint = connectedPoints.find(
      (p) => !visited.has(pointToString(p)),
    );

    if (!nextPoint) break;

    perimeter.push(nextPoint);
    visited.add(pointToString(nextPoint));
    currentPoint = nextPoint;
  }

  return perimeter;
};

export function RoomSketchPro({
  width,
  height,
  instanceId = 'default',
  lines = [],
  airEntries = []
}: RoomSketchProProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);

  // Store camera position in localStorage with instance-specific key
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

  // Load camera position from localStorage
  const loadCameraState = () => {
    const savedState = localStorage.getItem(`roomSketchPro-camera-${instanceId}`);
    if (savedState && cameraRef.current && controlsRef.current) {
      const state = JSON.parse(savedState);
      cameraRef.current.position.fromArray(state.position);
      controlsRef.current.target.fromArray(state.target);
      cameraRef.current.zoom = state.zoom;
      cameraRef.current.updateProjectionMatrix();
    }
  };

  // Create walls using the same method as Canvas3D
  const createWalls = (scene: THREE.Scene) => {
    // Create wall material
    const wallMaterial = new THREE.MeshPhongMaterial({
      color: 0x3b82f6,
      opacity: 0.5,
      transparent: true,
      side: THREE.DoubleSide,
    });

    // Convert 2D lines to 3D walls using transformed coordinates
    lines.forEach((line) => {
      // Create vertices for wall corners using the transformation
      const start_bottom = transform2DTo3D(line.start);
      const end_bottom = transform2DTo3D(line.end);
      const start_top = transform2DTo3D(line.start, ROOM_HEIGHT);
      const end_top = transform2DTo3D(line.end, ROOM_HEIGHT);

      // Calculate wall direction and normal vectors
      const wallDirection = new THREE.Vector3()
        .subVectors(end_bottom, start_bottom)
        .normalize();

      // Log vectors for debugging
      console.log("Wall vectors:", {
        start: `(${line.start.x}, ${line.start.y})`,
        end: `(${line.end.x}, ${line.end.y})`,
        direction: `(${wallDirection.x.toFixed(4)}, ${wallDirection.y.toFixed(4)}, ${wallDirection.z.toFixed(4)})`,
      });

      // Create vertices array from transformed points
      const vertices = new Float32Array([
        start_bottom.x, start_bottom.y, start_bottom.z,
        end_bottom.x, end_bottom.y, end_bottom.z,
        start_top.x, start_top.y, start_top.z,
        end_top.x, end_top.y, end_top.z,
      ]);

      // Create faces indices
      const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);

      // Create the wall geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();

      // Create the wall mesh
      const wall = new THREE.Mesh(geometry, wallMaterial);
      scene.add(wall);
    });
  };

  const createAirEntries = (scene: THREE.Scene) => {
    airEntries.forEach(entry => {
      const material = new THREE.MeshStandardMaterial({
        color: entry.type === 'door' ? 0x8b4513 :
          entry.type === 'window' ? 0x87ceeb :
            0x808080,
        roughness: 0.5,
        metalness: 0.2,
        transparent: entry.type === 'window',
        opacity: entry.type === 'window' ? 0.6 : 1
      });

      const geometry = new THREE.BoxGeometry(
        entry.dimensions.width / 100,
        entry.dimensions.height / 100,
        0.1
      );

      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.set(
        entry.position.x,
        (entry.dimensions.distanceToFloor || 0) / 100 + entry.dimensions.height / 200,
        entry.position.y
      );

      const dx = entry.line.end.x - entry.line.start.x;
      const dy = entry.line.end.y - entry.line.start.y;
      mesh.rotation.y = Math.atan2(dy, dx);

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    });
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    // Initialize camera with perspective matching 2D view
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / height,
      1,
      10000,
    );
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Initialize renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, height);
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

    // Add grid helper
    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x94a3b8, 0xe2e8f0);
    gridHelper.position.set(0, 0, 0); // Position at origin
    gridHelper.rotation.x = -Math.PI / 2; // Rotate to lie flat on XY plane
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Add coordinate system axes with labels
    const axesHelper = new THREE.AxesHelper(200);
    scene.add(axesHelper);

    // Create floor and roof surfaces using the room perimeter
    const perimeterPoints = createRoomPerimeter(lines);
    if (perimeterPoints.length > 2) {
      // Create shape from perimeter points
      const shape = new THREE.Shape();
      const firstPoint = transform2DTo3D(perimeterPoints[0]);
      shape.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < perimeterPoints.length; i++) {
        const point = transform2DTo3D(perimeterPoints[i]);
        shape.lineTo(point.x, point.y);
      }
      shape.lineTo(firstPoint.x, firstPoint.y);

      // Create floor geometry and mesh
      const floorGeometry = new THREE.ShapeGeometry(shape);
      const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0x808080, // Medium gray
        opacity: 0.3,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.set(0, 0, 0); // Place at Z=0
      scene.add(floor);

      // Create roof geometry and mesh
      const roofGeometry = new THREE.ShapeGeometry(shape);
      const roofMaterial = new THREE.MeshPhongMaterial({
        color: 0xe0e0e0, // Light gray
        opacity: 0.2,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.set(0, ROOM_HEIGHT, 0); // Place at Z=ROOM_HEIGHT
      scene.add(roof);
    }

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Create walls and air entries
    createWalls(scene);
    createAirEntries(scene);

    // Animation loop
    function animate() {
      if (!scene || !camera || !renderer || !controls) return;

      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Handle resize
    const handleResize = () => {
      if (!camera || !renderer || !containerRef.current) return;

      const container = containerRef.current;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('change', saveCameraState);

      if (renderer && containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
        renderer.dispose();
      }

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          }
        }
      });
    };
  }, [width, height, instanceId, lines, airEntries]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '0.5rem',
      }}
    />
  );
}