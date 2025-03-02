import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls';

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
  airEntries: AirEntry[];
  height?: number;
}

const ROOM_HEIGHT = 210; // Room height in cm
const PIXELS_TO_CM = 25 / 20; // 25cm = 20px ratio
const GRID_SIZE = 1000; // Size of the grid in cm
const GRID_DIVISIONS = 40; // Number of divisions in the grid

const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  // Get the base dimensions for center calculation
  const dimensions = { width: 800, height: 600 }; // Default dimensions
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;

  // Calculate relative coordinates from center (similar to 2D view)
  const relativeX = point.x - centerX;
  const relativeY = centerY - point.y; // Invert Y to match mathematical coordinates

  const vector = new THREE.Vector3(
    relativeX * PIXELS_TO_CM,    // Convert to cm and keep X direction
    relativeY * PIXELS_TO_CM,    // Convert to cm and keep Y inverted
    height      // Z coordinate (height)
  );

  console.log('Transform 2D → 3D:');
  console.log(`Screen coords: (${point.x}, ${point.y})`);
  console.log(`Relative to center: (${relativeX}, ${relativeY})`);
  console.log(`Final 3D (in cm): (${vector.x}, ${vector.y}, ${vector.z})`);

  return vector;
};

export default function Canvas3D({ lines, airEntries, height = 600 }: Canvas3DProps) {
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
  }, [height]);

  // Effect to update geometry when lines or airEntries change
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

    // Add floor surface
    const floorGeometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
    const floorMaterial = new THREE.MeshPhongMaterial({
      color: 0x808080, // Medium gray
      opacity: 0.3,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // Rotate to lie flat on XY plane
    floor.position.set(0, 0, 0);
    sceneRef.current.add(floor);

    // Add roof surface
    const roofGeometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
    const roofMaterial = new THREE.MeshPhongMaterial({
      color: 0xE0E0E0, // Light gray
      opacity: 0.2,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.rotation.x = -Math.PI / 2; // Same rotation as floor
    roof.position.set(0, 0, ROOM_HEIGHT);
    sceneRef.current.add(roof);

    // Add ambient and directional lights back
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    sceneRef.current.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    sceneRef.current.add(directionalLight);

    // Add coordinate system axes with labels
    const axesHelper = new THREE.AxesHelper(200);
    sceneRef.current.add(axesHelper);

    // Create text sprites for axis labels
    const createTextSprite = (text: string, color: string) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return null;

      canvas.width = 64;
      canvas.height = 64;

      context.font = "48px Arial";
      context.fillStyle = color;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, 32, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      return new THREE.Sprite(spriteMaterial);
    };

    // Create and position labels
    const xLabel = createTextSprite("X", "#ff0000");
    const yLabel = createTextSprite("Y", "#00ff00");
    const zLabel = createTextSprite("Z", "#0000ff");

    if (xLabel && yLabel && zLabel) {
      xLabel.position.set(220, 0, 0);
      yLabel.position.set(0, 220, 0);
      zLabel.position.set(0, 0, 220);

      xLabel.scale.set(20, 20, 1);
      yLabel.scale.set(20, 20, 1);
      zLabel.scale.set(20, 20, 1);

      sceneRef.current.add(xLabel);
      sceneRef.current.add(yLabel);
      sceneRef.current.add(zLabel);
    }

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

      console.log('Creating wall with vertices:');
      console.log(`Start bottom: (${start_bottom.x}, ${start_bottom.y}, ${start_bottom.z})`);
      console.log(`End bottom: (${end_bottom.x}, ${end_bottom.y}, ${end_bottom.z})`);
      console.log(`Start top: (${start_top.x}, ${start_top.y}, ${start_top.z})`);
      console.log(`End top: (${end_top.x}, ${end_top.y}, ${end_top.z})`);

      // Create vertices array from transformed points
      const vertices = new Float32Array([
        start_bottom.x, start_bottom.y, start_bottom.z, // bottom start
        end_bottom.x, end_bottom.y, end_bottom.z,       // bottom end
        start_top.x, start_top.y, start_top.z,         // top start
        end_top.x, end_top.y, end_top.z               // top end
      ]);

      // Create faces indices
      const indices = new Uint16Array([
        0, 1, 2,  // first triangle
        1, 3, 2   // second triangle
      ]);

      // Create the wall geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals(); // Compute normals for proper lighting

      // Create the wall mesh
      const wall = new THREE.Mesh(geometry, wallMaterial);
      sceneRef.current.add(wall);
    });

    // Transform air entries to match the new coordinate system
    airEntries.forEach(entry => {
      const color = entry.type === 'window'
        ? 0x3b82f6  // Blue
        : entry.type === 'door'
          ? 0xb45309  // Brown
          : 0x22c55e; // Green

      const material = new THREE.MeshPhongMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });

      const width = entry.dimensions.width;
      const height = entry.dimensions.height || 50;
      const distanceToFloor = entry.dimensions.distanceToFloor || 0;

      const geometry = new THREE.PlaneGeometry(width, height);
      const mesh = new THREE.Mesh(geometry, material);

      // Position the air entry using transformed coordinates
      const position = transform2DTo3D(entry.position, distanceToFloor + height / 2);
      console.log(`Creating air entry (${entry.type}) at:`);
      console.log(`Original 2D position: (${entry.position.x}, ${entry.position.y})`);
      console.log(`Transformed 3D position: (${position.x}, ${position.y}, ${position.z})`);

      mesh.position.set(position.x, position.y, position.z);

      // Calculate rotation to align with wall
      const normal = calculateNormal(entry.line);
      const angle = Math.atan2(normal.y, normal.x);
      mesh.rotation.z = angle;

      sceneRef.current.add(mesh);
    });

  }, [lines, airEntries]);

  const calculateNormal = (line: Line): { x: number; y: number } => {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    return {
      x: dx / length,
      y: dy / length
    };
  };

  return <div ref={containerRef} style={{ height }} />;
}