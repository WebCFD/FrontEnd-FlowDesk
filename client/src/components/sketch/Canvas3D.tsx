import { useEffect, useRef } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";

// Add texture URLs
const TEXTURES = {
  floor: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/hardwood2_diffuse.jpg",
  wall: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/brick_diffuse.jpg",
  door: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/door/color.jpg",
  window: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/glass/glass_diffuse.jpg",
  vent: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/metal/metal_diffuse.jpg"
};

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

interface Canvas3DProps {
  lines: Line[];
  airEntries?: AirEntry[];
  height?: number;
}

const ROOM_HEIGHT = 210; // Room height in cm
const PIXELS_TO_CM = 25 / 20; // 25cm = 20px ratio
const GRID_SIZE = 1000; // Size of the grid in cm
const GRID_DIVISIONS = 40; // Number of divisions in the grid

// Helper function to load textures
const loadTexture = (url: string): THREE.Texture => {
  const texture = new THREE.TextureLoader().load(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4); // Repeat texture 4 times
  return texture;
};

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

// Utility function to find connected points and create a perimeter
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

const calculateNormal = (line: Line): Point => {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  return {
    x: -dy / length, // Perpendicular vector calculation
    y: dx / length, // This ensures outward-facing normals
  };
};

export default function Canvas3D({
  lines,
  airEntries = [],
  height = 600,
}: Canvas3DProps) {
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

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Load textures
    const textures = {
      floor: loadTexture(TEXTURES.floor),
      wall: loadTexture(TEXTURES.wall),
      door: loadTexture(TEXTURES.door),
      window: loadTexture(TEXTURES.window),
      vent: loadTexture(TEXTURES.vent)
    };

    // Add grid helper
    const gridHelper = new THREE.GridHelper(
      GRID_SIZE,
      GRID_DIVISIONS,
      0x000000,
      0x000000,
    );
    gridHelper.position.set(0, 0, 0);
    gridHelper.rotation.x = -Math.PI / 2;
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

      // Create floor with texture
      const floorGeometry = new THREE.ShapeGeometry(shape);
      const floorMaterial = new THREE.MeshPhongMaterial({
        map: textures.floor,
        side: THREE.DoubleSide,
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.set(0, 0, 0);
      scene.add(floor);

      // Create roof (no texture needed as it's usually not visible)
      const roofGeometry = new THREE.ShapeGeometry(shape);
      const roofMaterial = new THREE.MeshPhongMaterial({
        color: 0xe0e0e0,
        opacity: 0.2,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.set(0, 0, ROOM_HEIGHT);
      scene.add(roof);

      // Create walls with brick texture
      lines.forEach((line) => {
        const start_bottom = transform2DTo3D(line.start);
        const end_bottom = transform2DTo3D(line.end);
        const start_top = transform2DTo3D(line.start, ROOM_HEIGHT);
        const end_top = transform2DTo3D(line.end, ROOM_HEIGHT);

        const wallPoints = [
          new THREE.Vector3(start_bottom.x, start_bottom.y, start_bottom.z),
          new THREE.Vector3(end_bottom.x, end_bottom.y, end_bottom.z),
          new THREE.Vector3(end_top.x, end_top.y, end_top.z),
          new THREE.Vector3(start_top.x, start_top.y, start_top.z),
        ];

        const wallGeometry = new THREE.BufferGeometry().setFromPoints(wallPoints);
        wallGeometry.setIndex([0, 1, 2, 0, 2, 3]);

        // Calculate UV coordinates for proper texture mapping
        const wallLength = Math.sqrt(
          Math.pow(end_bottom.x - start_bottom.x, 2) +
          Math.pow(end_bottom.y - start_bottom.y, 2)
        );
        const uvs = new Float32Array([
          0, 0,
          wallLength / 100, 0,
          wallLength / 100, ROOM_HEIGHT / 100,
          0, ROOM_HEIGHT / 100,
        ]);
        wallGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

        const wallMaterial = new THREE.MeshPhongMaterial({
          map: textures.wall,
          side: THREE.DoubleSide,
        });
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        scene.add(wall);
      });

      // Add air entries with appropriate textures
      airEntries.forEach((entry) => {
        const texture = entry.type === 'window' ? textures.window :
          entry.type === 'door' ? textures.door : textures.vent;

        const material = new THREE.MeshPhongMaterial({
          map: texture,
          transparent: entry.type === 'window',
          opacity: entry.type === 'window' ? 0.6 : 1,
          side: THREE.DoubleSide,
        });

        const geometry = new THREE.PlaneGeometry(
          entry.dimensions.width,
          entry.dimensions.height
        );

        const mesh = new THREE.Mesh(geometry, material);
        const position = transform2DTo3D(entry.position);
        const zPosition = entry.type === 'door' ?
          entry.dimensions.height / 2 :
          entry.dimensions.distanceToFloor || 0;

        mesh.position.set(position.x, position.y, zPosition);

        // Calculate and apply proper rotation
        const wallDirection = new THREE.Vector3()
          .subVectors(
            transform2DTo3D(entry.line.end),
            transform2DTo3D(entry.line.start)
          )
          .normalize();

        const worldUpVector = new THREE.Vector3(0, 0, 1);
        const wallNormalVector = new THREE.Vector3()
          .crossVectors(wallDirection, worldUpVector)
          .normalize();

        const up = new THREE.Vector3(0, 0, 1);
        const right = new THREE.Vector3()
          .crossVectors(up, wallNormalVector)
          .normalize();

        const rotationMatrix = new THREE.Matrix4()
          .makeBasis(right, up, wallNormalVector);
        mesh.setRotationFromMatrix(rotationMatrix);

        scene.add(mesh);
      });
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
      Object.values(textures).forEach(texture => texture.dispose());
    };
  }, [lines, height, airEntries]);

  return <div ref={containerRef} style={{ height }} />;
}