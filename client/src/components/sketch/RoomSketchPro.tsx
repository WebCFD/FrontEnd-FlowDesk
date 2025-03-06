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

  // Create walls from lines
  const createWalls = (scene: THREE.Scene) => {
    const wallHeight = 3;
    const wallThickness = 0.2;
    const wallMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xcccccc,
      roughness: 0.7,
      metalness: 0.2
    });

    lines.forEach(line => {
      // Log wall vectors for debugging
      console.log('Wall vectors:', {
        start: `(${line.start.x}, ${line.start.y})`,
        end: `(${line.end.x}, ${line.end.y})`,
        direction: new THREE.Vector3(
          line.end.x - line.start.x,
          0,
          line.end.y - line.start.y
        ).normalize().toArray().map(v => v.toFixed(4)).join(', '),
        normal: new THREE.Vector3(
          -(line.end.y - line.start.y),
          0,
          line.end.x - line.start.x
        ).normalize().toArray().map(v => v.toFixed(4)).join(', ')
      });

      const dx = line.end.x - line.start.x;
      const dy = line.end.y - line.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      const wallGeometry = new THREE.BoxGeometry(length / 100, wallHeight, wallThickness);
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);

      wall.position.set(
        (line.start.x + line.end.x) / 200, // Convert to meters
        wallHeight / 2,
        (line.start.y + line.end.y) / 200  // Convert to meters
      );
      wall.rotation.y = angle;
      wall.castShadow = true;
      wall.receiveShadow = true;

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
    const size = 20;
    const divisions = 20;
    const gridHelper = new THREE.GridHelper(size, divisions, 0x94a3b8, 0xe2e8f0);
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

    const floorGeometry = new THREE.PlaneGeometry(size, size);
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