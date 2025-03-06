import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

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
    height,
    relativeY * PIXELS_TO_CM,
  );
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
  const controlsRef = useRef<OrbitControls | null>(null);

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

  // Create air entries (doors, windows, vents)
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
        entry.dimensions.width / 100, // Convert cm to meters
        entry.dimensions.height / 100,
        0.1
      );

      const mesh = new THREE.Mesh(geometry, material);

      // Position the air entry
      mesh.position.set(
        entry.position.x,
        (entry.dimensions.distanceToFloor || 0) / 100 + entry.dimensions.height / 200,
        entry.position.y
      );

      // Calculate rotation based on the wall line
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

    // Initialize camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    // Initialize renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 3;
    controls.maxDistance = 20;
    controlsRef.current = controls;

    // Load saved camera state
    loadCameraState();

    // Add event listener for camera changes
    controls.addEventListener('change', saveCameraState);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x94a3b8, 0xe2e8f0);
    scene.add(gridHelper);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    // Add directional light with shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Add ground plane with texture
    const textureLoader = new THREE.TextureLoader();
    const floorTexture = textureLoader.load('/textures/floor.jpg', () => {
      floorTexture.wrapS = THREE.RepeatWrapping;
      floorTexture.wrapT = THREE.RepeatWrapping;
      floorTexture.repeat.set(4, 4);
      renderer.render(scene, camera);
    });

    const floorGeometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
      map: floorTexture,
      roughness: 0.8,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

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