import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { 
  generateFloorGeometry, 
  GeometryConfig, 
  FloorData, 
  GEOMETRY_CONFIG 
} from "@/lib/geometryEngine";

export interface UseCanvas3DGeometryOptions {
  floors: Record<string, FloorData>;
  config: GeometryConfig;
  containerRef: React.RefObject<HTMLDivElement>;
  width?: number;
  height?: number;
  presentationMode?: boolean;
}

export interface Canvas3DGeometryReturn {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: TrackballControls | null;
  objects: THREE.Object3D[];
  updateGeometry: () => void;
  cleanup: () => void;
}

/**
 * Shared hook for Canvas3D geometry and Three.js setup
 * Used by both Canvas3D and RoomSketchPro for consistent rendering
 */
export function useCanvas3DGeometry(
  options: UseCanvas3DGeometryOptions
): Canvas3DGeometryReturn {
  const {
    floors,
    config,
    containerRef,
    width = 800,
    height = 600,
    presentationMode = false
  } = options;

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const animationIdRef = useRef<number | null>(null);

  // Geometry objects state
  const [objects, setObjects] = useState<THREE.Object3D[]>([]);

  // Memoize geometry generation to avoid unnecessary recalculations
  const geometryObjects = useMemo(() => {
    return generateFloorGeometry(floors, {
      ...config,
      presentationMode
    });
  }, [floors, config, presentationMode]);

  // Setup Three.js scene
  const setupScene = (): THREE.Scene => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add grid helper for reference
    const gridHelper = new THREE.GridHelper(1000, 40, 0xcccccc, 0xcccccc);
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    return scene;
  };

  // Setup camera
  const setupCamera = (): THREE.PerspectiveCamera => {
    const camera = new THREE.PerspectiveCamera(
      75,
      width / height,
      0.1,
      10000
    );
    
    if (presentationMode) {
      // Better default position for presentation
      camera.position.set(300, 400, 300);
    } else {
      // Standard position for editing
      camera.position.set(200, 300, 200);
    }
    
    camera.lookAt(0, 0, 0);
    return camera;
  };

  // Setup renderer
  const setupRenderer = (): THREE.WebGLRenderer => {
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true
    });
    
    renderer.setSize(width, height);
    renderer.setClearColor(0xf0f0f0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    return renderer;
  };

  // Setup controls
  const setupControls = (camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): TrackballControls => {
    const controls = new TrackballControls(camera, renderer.domElement);
    
    if (presentationMode) {
      // Smoother controls for presentation
      controls.rotateSpeed = 1.5;
      controls.zoomSpeed = 1.0;
      controls.panSpeed = 0.6;
    } else {
      // Standard controls for editing
      controls.rotateSpeed = 2.0;
      controls.zoomSpeed = 1.2;
      controls.panSpeed = 0.8;
    }
    
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.2;
    
    return controls;
  };

  // Update geometry in scene
  const updateGeometry = () => {
    if (!sceneRef.current) return;

    // Remove existing geometry objects
    const objectsToRemove = sceneRef.current.children.filter(
      child => child.userData?.type === 'wall' || 
               child.userData?.type === 'floor' || 
               child.userData?.type === 'window' ||
               child.userData?.type === 'door' ||
               child.userData?.type === 'vent'
    );

    objectsToRemove.forEach(obj => {
      sceneRef.current!.remove(obj);
      // Dispose geometry and materials
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    // Add new geometry objects
    geometryObjects.forEach(obj => {
      sceneRef.current!.add(obj);
    });

    setObjects([...geometryObjects]);
  };

  // Animation loop
  const animate = () => {
    if (controlsRef.current) {
      controlsRef.current.update();
    }
    
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
    
    animationIdRef.current = requestAnimationFrame(animate);
  };

  // Cleanup function
  const cleanup = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }

    if (rendererRef.current && containerRef.current) {
      containerRef.current.removeChild(rendererRef.current.domElement);
      rendererRef.current.dispose();
    }

    // Dispose all geometry and materials
    objects.forEach(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    sceneRef.current = null;
    cameraRef.current = null;
    rendererRef.current = null;
    controlsRef.current = null;
  };

  // Handle window resize
  const handleResize = () => {
    if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
    
    const newWidth = containerRef.current.clientWidth;
    const newHeight = containerRef.current.clientHeight;
    
    cameraRef.current.aspect = newWidth / newHeight;
    cameraRef.current.updateProjectionMatrix();
    
    rendererRef.current.setSize(newWidth, newHeight);
  };

  // Initialize Three.js setup
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Setup Three.js components
    const scene = setupScene();
    const camera = setupCamera();
    const renderer = setupRenderer();
    const controls = setupControls(camera, renderer);

    // Store refs
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    // Append canvas to container
    container.appendChild(renderer.domElement);

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Start animation loop
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cleanup();
    };
  }, [width, height, containerRef]);

  // Update geometry when data changes
  useEffect(() => {
    updateGeometry();
  }, [geometryObjects]);

  return {
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    objects,
    updateGeometry,
    cleanup
  };
}