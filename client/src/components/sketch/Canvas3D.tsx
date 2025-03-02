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

    // Convert 2D lines to 3D walls
    const wallMaterial = new THREE.MeshPhongMaterial({
      color: 0x808080,
      side: THREE.DoubleSide,
    });

    lines.forEach(line => {
      const start = new THREE.Vector3(line.start.x, line.start.y, 0);
      const end = new THREE.Vector3(line.end.x, line.end.y, 0);

      // Create wall geometry
      const wallShape = new THREE.Shape();
      wallShape.moveTo(0, 0);
      wallShape.lineTo(0, ROOM_HEIGHT);
      
      const extrudeSettings = {
        steps: 1,
        depth: 10, // Wall thickness
        bevelEnabled: false,
      };

      const wallGeometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);

      // Position and rotate the wall
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.position.set(start.x, start.y, 0);

      // Calculate rotation to align with wall direction
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      wall.rotation.z = angle;

      sceneRef.current.add(wall);
    });

    // Add air entries
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

      // Position the air entry
      mesh.position.set(
        entry.position.x,
        entry.position.y,
        distanceToFloor
      );

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
