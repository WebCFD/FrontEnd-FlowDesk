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
  type: 'window' | 'door' | 'vent';
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
}

interface Canvas3DProps {
  lines: Line[];
  airEntries?: AirEntry[];
  height?: number;
}

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
    height
  );
};

// Utility function to find connected points and create a perimeter
const createRoomPerimeter = (lines: Line[]): Point[] => {
  if (lines.length === 0) return [];

  const perimeter: Point[] = [];
  const visited = new Set<string>();
  const pointToString = (p: Point) => `${p.x},${p.y}`;

  // Create a map of points to their connected lines
  const connections = new Map<string, Point[]>();
  lines.forEach(line => {
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
    const nextPoint = connectedPoints.find(p => !visited.has(pointToString(p)));

    if (!nextPoint) break;

    perimeter.push(nextPoint);
    visited.add(pointToString(nextPoint));
    currentPoint = nextPoint;
  }

  return perimeter;
};

const calculateNormal = (line: Line): Point => {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  return {
    x: -dy / length,  // Perpendicular vector calculation
    y: dx / length    // This ensures outward-facing normals
  };
};

export default function Canvas3D({ lines, airEntries = [], height = 600 }: Canvas3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);

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
      10000
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

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x000000, 0x000000);
    gridHelper.position.set(0, 0, 0); // Position at origin
    gridHelper.rotation.x = -Math.PI / 2; // Rotate to lie flat on XY plane
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

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
        color: 0xE0E0E0, // Light gray
        opacity: 0.2,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.set(0, 0, ROOM_HEIGHT); // Place at Z=ROOM_HEIGHT
      scene.add(roof);
    }

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [lines, height]);

  useEffect(() => {
    if (!sceneRef.current) return;

    // Clear previous geometry
    sceneRef.current.clear();

    // Add grid helper again after clearing
    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x000000, 0x000000);
    gridHelper.position.set(0, 0, 0); // Position at origin
    gridHelper.rotation.x = -Math.PI / 2; // Rotate to lie flat on XY plane
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    sceneRef.current.add(gridHelper);

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
      sceneRef.current.add(floor);

      // Create roof geometry and mesh
      const roofGeometry = new THREE.ShapeGeometry(shape);
      const roofMaterial = new THREE.MeshPhongMaterial({
        color: 0xE0E0E0, // Light gray
        opacity: 0.2,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.set(0, 0, ROOM_HEIGHT); // Place at Z=ROOM_HEIGHT
      sceneRef.current.add(roof);
    }

    // Add ambient and directional lights back
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    sceneRef.current.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    sceneRef.current.add(directionalLight);

    // Add coordinate system axes with labels
    const axesHelper = new THREE.AxesHelper(200);
    sceneRef.current.add(axesHelper);

    // Create wall material
    const wallMaterial = new THREE.MeshPhongMaterial({
      color: 0x3b82f6, // Clear blue color
      opacity: 0.5,
      transparent: true,
      side: THREE.DoubleSide,
    });

    // Convert 2D lines to 3D walls using transformed coordinates
    lines.forEach(line => {
      // Create vertices for wall corners using the transformation
      const start_bottom = transform2DTo3D(line.start);
      const end_bottom = transform2DTo3D(line.end);
      const start_top = transform2DTo3D(line.start, ROOM_HEIGHT);
      const end_top = transform2DTo3D(line.end, ROOM_HEIGHT);

      // Calculate wall direction and normal vectors
      const wallDirection = new THREE.Vector3()
        .subVectors(end_bottom, start_bottom)
        .normalize();

      // Calculate proper wall normal using cross product
      const upVector = new THREE.Vector3(0, 0, 1);
      const wallNormalVector = new THREE.Vector3()
        .crossVectors(wallDirection, upVector)
        .normalize();

      // Log vectors for debugging
      console.log('Wall vectors:', {
        start: `(${line.start.x}, ${line.start.y})`,
        end: `(${line.end.x}, ${line.end.y})`,
        direction: `(${wallDirection.x.toFixed(4)}, ${wallDirection.y.toFixed(4)}, ${wallDirection.z.toFixed(4)})`,
        normal: `(${wallNormalVector.x.toFixed(4)}, ${wallNormalVector.y.toFixed(4)}, ${wallNormalVector.z.toFixed(4)})`
      });

      // Calculate wall midpoint for arrow visualization
      const wallMidPoint = new THREE.Vector3()
        .addVectors(start_bottom, end_bottom)
        .multiplyScalar(0.5)
        .setZ(ROOM_HEIGHT / 2);

      // Add debug arrow for wall normal (blue)
      const wallArrowHelper = new THREE.ArrowHelper(
        wallNormalVector,
        wallMidPoint,
        50,  // length
        0x3b82f6,  // blue color
        10,  // head length
        5    // head width
      );
      sceneRef.current.add(wallArrowHelper);

      // Create vertices array from transformed points
      const vertices = new Float32Array([
        start_bottom.x, start_bottom.y, start_bottom.z,
        end_bottom.x, end_bottom.y, end_bottom.z,
        start_top.x, start_top.y, start_top.z,
        end_top.x, end_top.y, end_top.z
      ]);

      // Create faces indices
      const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);

      // Create the wall geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();

      // Create the wall mesh
      const wall = new THREE.Mesh(geometry, wallMaterial);
      sceneRef.current.add(wall);
    });

    // Create air entries using the same normal calculations as the walls
    airEntries.forEach(entry => {
      const color = entry.type === 'window' ? 0x3b82f6 : entry.type === 'door' ? 0xb45309 : 0x22c55e;
      const material = new THREE.MeshPhongMaterial({
        color,
        opacity: 0.6,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const width = entry.dimensions.width;
      const height = entry.dimensions.height;

      // Calculate Z position based on entry type
      const zPosition = entry.type === 'door' ? height / 2 : (entry.dimensions.distanceToFloor || 0);

      // Use the same normal calculation as the wall
      const entryNormal = calculateNormal(entry.line);
      const normalVector = new THREE.Vector3(entryNormal.x, entryNormal.y, 0);

      // Create and position the air entry
      const geometry = new THREE.PlaneGeometry(width, height);
      const mesh = new THREE.Mesh(geometry, material);
      const position = transform2DTo3D(entry.position);
      mesh.position.set(position.x, position.y, zPosition);

      // Orient the mesh using the wall's normal
      const target = new THREE.Vector3(
        position.x + normalVector.x,
        position.y + normalVector.y,
        zPosition
      );

      mesh.lookAt(target);
      mesh.rotateY(Math.PI); // Make the mesh face outward

      sceneRef.current.add(mesh);

      // Debug arrow for air entry normal (black)
      const elementArrowHelper = new THREE.ArrowHelper(
        normalVector,
        new THREE.Vector3(position.x, position.y, zPosition),
        50,  // length
        0x000000,  // black color
        10,  // head length
        5    // head width
      );
      sceneRef.current.add(elementArrowHelper);
    });

  }, [lines, airEntries]);

  return <div ref={containerRef} style={{ height }} />;
}