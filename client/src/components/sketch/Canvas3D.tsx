import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { makeTextSprite } from "@/lib/three-utils";
import AirEntryDialog from "./AirEntryDialog";
import { ViewDirection } from "./Toolbar3D";
import { useSceneContext } from "../../contexts/SceneContext";

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
  wallDirection?: "north" | "south" | "east" | "west";
}

interface Stair {
  id: string;
  position: Point;
  type: "straight" | "L-shaped" | "spiral";
  direction: "up" | "down";
  width: number;
  length: number;
  steps: number;
  angle?: number; // for L-shaped stairs
  targetFloor?: string; // destination floor
}

interface FloorData {
  id: string;
  name: string;
  level: number;
  height: number;
  floorDeck: number;
  walls: Line[];
  airEntries: AirEntry[];
  isGround?: boolean;
  stairs?: Stair[];
}

interface FloorParameters {
  [floorName: string]: {
    ceilingHeight: number;
    floorDeckThickness: number;
    wallTemperature: number;
  };
}

interface Canvas3DProps {
  floors: { [key: string]: FloorData };
  currentFloor: string;
  ceilingHeight?: number;
  floorDeckThickness?: number;
  wallTransparency?: number;
  isMeasureMode?: boolean;
  isEraserMode?: boolean;
  simulationName?: string;
  simulationType?: string;
  isMultifloor?: boolean;
  floorParameters?: FloorParameters;
  onUpdateAirEntry?: (floorName: string, index: number, entry: AirEntry) => void;
  onDeleteAirEntry?: (floorName: string, index: number) => void;
  onViewChange?: (direction: ViewDirection) => void;
}

export function generateSharedFloorGeometry(
  walls: Line[],
  airEntries: AirEntry[] = [],
  ceilingHeight: number = 2.2,
  floorDeckThickness: number = 0.35,
  currentLevel: number = 0,
  isMultifloor: boolean = false
) {
  const floorMeshes: THREE.Mesh[] = [];
  const wallMeshes: THREE.Mesh[] = [];
  const roofMeshes: THREE.Mesh[] = [];
  const airEntryMeshes: THREE.Mesh[] = [];

  if (walls.length === 0) {
    return { floorMeshes, wallMeshes, roofMeshes, airEntryMeshes };
  }

  // Create walls
  walls.forEach((wall, wallIndex) => {
    const wallLength = Math.sqrt(
      Math.pow(wall.end.x - wall.start.x, 2) + Math.pow(wall.end.y - wall.start.y, 2)
    );

    const wallGeometry = new THREE.BoxGeometry(wallLength, ceilingHeight, 0.2);
    const wallMaterial = new THREE.MeshLambertMaterial({ 
      color: 0xddd8d0,
      transparent: true,
      opacity: 0.8
    });
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);

    const centerX = (wall.start.x + wall.end.x) / 2;
    const centerY = (wall.start.y + wall.end.y) / 2;
    const yPosition = isMultifloor ? currentLevel * (ceilingHeight + floorDeckThickness) + ceilingHeight / 2 : ceilingHeight / 2;

    wallMesh.position.set(centerX, yPosition, centerY);

    const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
    wallMesh.rotation.y = angle;

    wallMesh.userData = { 
      type: 'wall', 
      wallIndex,
      floorLevel: currentLevel
    };

    wallMeshes.push(wallMesh);

    // Add air entries for this wall
    const wallAirEntries = airEntries.filter(entry => {
      const wallVector = new THREE.Vector2(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      const entryVector = new THREE.Vector2(entry.position.x - wall.start.x, entry.position.y - wall.start.y);
      
      const projection = entryVector.dot(wallVector) / wallVector.lengthSq();
      
      return projection >= 0 && projection <= 1;
    });

    wallAirEntries.forEach(entry => {
      const entryHeight = entry.dimensions.height / 100;
      const entryWidth = entry.dimensions.width / 100;
      const distanceToFloor = (entry.dimensions.distanceToFloor || 0) / 100;

      let entryGeometry: THREE.BufferGeometry;
      let entryMaterial: THREE.Material;

      if (entry.type === "window") {
        entryGeometry = new THREE.BoxGeometry(entryWidth, entryHeight, 0.1);
        entryMaterial = new THREE.MeshLambertMaterial({ 
          color: 0x87ceeb, 
          transparent: true, 
          opacity: 0.6 
        });
      } else if (entry.type === "door") {
        entryGeometry = new THREE.BoxGeometry(entryWidth, entryHeight, 0.15);
        entryMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
      } else {
        entryGeometry = new THREE.BoxGeometry(entryWidth, entryHeight, 0.05);
        entryMaterial = new THREE.MeshLambertMaterial({ color: 0x696969 });
      }

      const entryMesh = new THREE.Mesh(entryGeometry, entryMaterial);
      
      const entryYPosition = isMultifloor 
        ? currentLevel * (ceilingHeight + floorDeckThickness) + distanceToFloor + entryHeight / 2
        : distanceToFloor + entryHeight / 2;

      entryMesh.position.set(entry.position.x, entryYPosition, entry.position.y);
      entryMesh.rotation.y = angle;

      entryMesh.userData = { 
        type: 'airEntry', 
        entryType: entry.type,
        floorLevel: currentLevel
      };

      airEntryMeshes.push(entryMesh);
    });
  });

  // Create floor
  if (walls.length > 2) {
    const floorPoints = walls.map(wall => new THREE.Vector2(wall.start.x, wall.start.y));
    
    try {
      const floorShape = new THREE.Shape(floorPoints);
      const floorGeometry = new THREE.ShapeGeometry(floorShape);
      const floorMaterial = new THREE.MeshLambertMaterial({ color: 0xf5f5dc });
      const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
      
      const floorYPosition = isMultifloor ? currentLevel * (ceilingHeight + floorDeckThickness) : 0;
      floorMesh.position.y = floorYPosition;
      floorMesh.rotation.x = -Math.PI / 2;

      floorMesh.userData = { 
        type: 'floor',
        floorLevel: currentLevel
      };

      floorMeshes.push(floorMesh);

      // Create roof
      const roofGeometry = new THREE.ShapeGeometry(floorShape);
      const roofMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xe6e6e6,
        transparent: true,
        opacity: 0.7
      });
      const roofMesh = new THREE.Mesh(roofGeometry, roofMaterial);
      
      const roofYPosition = isMultifloor 
        ? currentLevel * (ceilingHeight + floorDeckThickness) + ceilingHeight
        : ceilingHeight;
      roofMesh.position.y = roofYPosition;
      roofMesh.rotation.x = -Math.PI / 2;

      roofMesh.userData = { 
        type: 'roof',
        floorLevel: currentLevel
      };

      roofMeshes.push(roofMesh);
    } catch (error) {
      console.error("Error creating floor geometry:", error);
    }
  }

  return { floorMeshes, wallMeshes, roofMeshes, airEntryMeshes };
}

export default function Canvas3D({
  floors,
  currentFloor,
  ceilingHeight = 210,
  floorDeckThickness = 35,
  wallTransparency = 0.7,
  isMeasureMode = false,
  isEraserMode,
  simulationName = "",
  simulationType = "Comfort Simulation (steady run)",
  isMultifloor = false,
  floorParameters = {},
  onUpdateAirEntry,
  onDeleteAirEntry,
  onViewChange,
}: Canvas3DProps) {
  const { updateGeometryData, updateSceneData, updateFloorData, setCurrentFloor: setContextCurrentFloor } = useSceneContext();
  
  const [editingAirEntry, setEditingAirEntry] = useState<{
    index: number;
    entry: AirEntry;
  } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const needsRenderRef = useRef<boolean>(true);

  const handleViewChange = useCallback((direction: ViewDirection) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    
    let newPosition: THREE.Vector3;
    let newTarget = new THREE.Vector3(0, 1, 0);

    switch (direction) {
      case "front":
        newPosition = new THREE.Vector3(0, 2, 8);
        break;
      case "back":
        newPosition = new THREE.Vector3(0, 2, -8);
        break;
      case "left":
        newPosition = new THREE.Vector3(-8, 2, 0);
        break;
      case "right":
        newPosition = new THREE.Vector3(8, 2, 0);
        break;
      case "top":
        newPosition = new THREE.Vector3(0, 10, 0);
        newTarget = new THREE.Vector3(0, 0, 0);
        break;
      case "isometric":
      default:
        newPosition = new THREE.Vector3(5, 5, 5);
        break;
    }

    camera.position.copy(newPosition);
    controls.target.copy(newTarget);
    controls.update();
    needsRenderRef.current = true;

    if (onViewChange) {
      try {
        onViewChange(direction);
      } catch (err) {
        console.error("Error calling onViewChange:", err);
      }
    }
  }, [onViewChange]);

  useEffect(() => {
    if (onViewChange && typeof onViewChange === "function") {
      try {
        onViewChange("isometric");
      } catch (err) {
        console.error("Error connecting view change handler:", err);
      }
    }
  }, [onViewChange, handleViewChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;
    controlsRef.current = controls;

    containerRef.current.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      if (needsRenderRef.current) {
        renderer.render(scene, camera);
        needsRenderRef.current = false;
      }
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      needsRenderRef.current = true;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;
    
    // Clear existing geometry
    const objectsToRemove = scene.children.filter(child => 
      child.userData.type === 'wall' || 
      child.userData.type === 'floor' || 
      child.userData.type === 'roof' || 
      child.userData.type === 'airEntry'
    );
    
    objectsToRemove.forEach(obj => {
      scene.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    if (isMultifloor) {
      Object.entries(floors).forEach(([floorName, floorData]) => {
        const effectiveCeilingHeight = (floorParameters[floorName]?.ceilingHeight || ceilingHeight) / 100;
        const effectiveFloorDeck = (floorParameters[floorName]?.floorDeckThickness || floorDeckThickness) / 100;
        
        const { floorMeshes, wallMeshes, roofMeshes, airEntryMeshes } = generateSharedFloorGeometry(
          floorData.walls,
          floorData.airEntries,
          effectiveCeilingHeight,
          effectiveFloorDeck,
          floorData.level,
          true
        );

        [...floorMeshes, ...wallMeshes, ...roofMeshes, ...airEntryMeshes].forEach(mesh => {
          scene.add(mesh);
        });
      });
    } else {
      const floorData = floors[currentFloor];
      if (floorData) {
        const { floorMeshes, wallMeshes, roofMeshes, airEntryMeshes } = generateSharedFloorGeometry(
          floorData.walls,
          floorData.airEntries,
          ceilingHeight / 100,
          floorDeckThickness / 100,
          0,
          false
        );

        [...floorMeshes, ...wallMeshes, ...roofMeshes, ...airEntryMeshes].forEach(mesh => {
          scene.add(mesh);
        });
      }
    }

    needsRenderRef.current = true;
  }, [floors, currentFloor, ceilingHeight, floorDeckThickness, isMultifloor, floorParameters]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      
      {editingAirEntry && (
        <AirEntryDialog
          entry={editingAirEntry.entry}
          onSave={(updatedEntry) => {
            if (onUpdateAirEntry) {
              onUpdateAirEntry(currentFloor, editingAirEntry.index, updatedEntry);
            }
            setEditingAirEntry(null);
          }}
          onDelete={() => {
            if (onDeleteAirEntry) {
              onDeleteAirEntry(currentFloor, editingAirEntry.index);
            }
            setEditingAirEntry(null);
          }}
          onClose={() => setEditingAirEntry(null)}
        />
      )}
    </div>
  );
}