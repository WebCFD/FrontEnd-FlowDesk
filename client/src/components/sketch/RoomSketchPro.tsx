import React, { useEffect, useState, useRef, useMemo } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { useSceneContext } from "@/contexts/SceneContext";
import { Line, AirEntry, FurnitureItem, Point } from "@/lib/types";

// Constants that match Canvas3D settings
const DEFAULTS = {
  ROOM_HEIGHT: 210,
  PIXELS_TO_CM: 25 / 20,
  GRID_SIZE: 1000,
  GRID_DIVISIONS: 40,
  BACKGROUND_COLOR: 0xf8fafc,
  WALL_COLOR: 0x3b82f6,
  FLOOR_COLOR: 0x808080,
  ROOF_COLOR: 0xe0e0e0,
};

interface RoomSketchProProps {
  width?: number;
  height?: number;
  instanceId?: string;
  lines?: Line[];
  airEntries?: AirEntry[];
  roomHeight?: number;
  onFurnitureAdd?: (item: FurnitureItem) => void;
  wallTransparency: number;
  onWallTransparencyChange: (value: number) => void;
  currentFloor?: string;
  floors?: Record<string, {
    lines: Line[];
    airEntries: AirEntry[];
    stairPolygons?: any[];
  }>;
  onComponentMount?: () => void;
}

// Helper function to transform 2D point to 3D space
const transform2DTo3D = (point: Point, height: number = 0, width: number = 800, height2d: number = 600): THREE.Vector3 => {
  const centerX = width / 2;
  const centerY = height2d / 2;

  const relativeX = point.x - centerX;
  const relativeY = centerY - point.y;

  return new THREE.Vector3(
    relativeX * DEFAULTS.PIXELS_TO_CM,
    height,
    relativeY * DEFAULTS.PIXELS_TO_CM, 
  );
};

export function RoomSketchPro({
  width = 800,
  height = 600,
  instanceId = "default",
  lines = [],
  airEntries = [],
  roomHeight = DEFAULTS.ROOM_HEIGHT,
  wallTransparency = 0.8,
  onWallTransparencyChange,
  currentFloor,
  floors,
  onComponentMount,
}: RoomSketchProProps) {
  // Get data from SceneContext
  const { geometryData } = useSceneContext();
  
  // Set up refs
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);

  // Determine current floor data (from props or context)
  const currentFloorName = currentFloor || geometryData?.currentFloor || "ground";
  const currentFloorData = useMemo(() => {
    if (floors && currentFloor && floors[currentFloor]) {
      return floors[currentFloor];
    } else if (geometryData?.floors && geometryData.currentFloor) {
      return geometryData.floors[geometryData.currentFloor];
    }
    return { lines: lines || [], airEntries: airEntries || [] };
  }, [floors, currentFloor, geometryData, lines, airEntries]);
  
  // Set up Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    console.log("RoomSketchPro - Initializing with current floor:", currentFloorName);
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(DEFAULTS.BACKGROUND_COLOR);
    sceneRef.current = scene;
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
    camera.position.set(0, 1000, 1000); // Position camera at an angle looking down
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    
    // Add renderer to the container
    containerRef.current.appendChild(renderer.domElement);
    
    // Create controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controlsRef.current = controls;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Create walls, floor, and ceiling
    createRoom(scene, currentFloorData.lines || [], roomHeight, wallTransparency);
    
    // Create air entries (windows, doors, vents)
    createAirEntries(scene, currentFloorData.airEntries || [], roomHeight);
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    
    animate();
    
    // Handle window resize
    const handleResize = () => {
      if (cameraRef.current && rendererRef.current && containerRef.current) {
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;
        
        cameraRef.current.aspect = newWidth / newHeight;
        cameraRef.current.updateProjectionMatrix();
        
        rendererRef.current.setSize(newWidth, newHeight);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Call onComponentMount callback if provided
    if (onComponentMount) {
      onComponentMount();
    }
    
    // Cleanup
    return () => {
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      
      window.removeEventListener('resize', handleResize);
      
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [width, height, currentFloorName, roomHeight, wallTransparency, onComponentMount]);
  
  // Function to create walls, floor, and ceiling
  const createRoom = (scene: THREE.Scene, roomLines: Line[], height: number, transparency: number) => {
    // Clear existing walls
    scene.children = scene.children.filter(child => 
      !(child.userData && (child.userData.type === 'wall' || child.userData.type === 'floor' || child.userData.type === 'ceiling')));
    
    // Create floor
    const floorGeometry = new THREE.PlaneGeometry(DEFAULTS.GRID_SIZE, DEFAULTS.GRID_SIZE);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
      color: DEFAULTS.FLOOR_COLOR,
      side: THREE.DoubleSide,
      transparent: false,
      opacity: 1.0
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    floor.userData = { type: 'floor' };
    scene.add(floor);
    
    // Create ceiling
    const ceilingGeometry = new THREE.PlaneGeometry(DEFAULTS.GRID_SIZE, DEFAULTS.GRID_SIZE);
    const ceilingMaterial = new THREE.MeshStandardMaterial({ 
      color: DEFAULTS.ROOF_COLOR,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3
    });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, height, 0);
    ceiling.userData = { type: 'ceiling' };
    scene.add(ceiling);
    
    // Create walls from lines
    roomLines.forEach((line, index) => {
      const startPoint = transform2DTo3D(line.start, 0, width, height);
      const endPoint = transform2DTo3D(line.end, 0, width, height);
      
      // Calculate wall dimensions
      const wallLength = new THREE.Vector2(
        endPoint.x - startPoint.x,
        endPoint.z - startPoint.z
      ).length();
      
      // Create wall geometry
      const wallGeometry = new THREE.BoxGeometry(wallLength, height, 20);
      const wallMaterial = new THREE.MeshStandardMaterial({
        color: DEFAULTS.WALL_COLOR,
        transparent: true,
        opacity: transparency
      });
      
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.castShadow = true;
      wall.receiveShadow = true;
      
      // Position and rotate wall
      const wallCenter = new THREE.Vector3(
        (startPoint.x + endPoint.x) / 2,
        height / 2,
        (startPoint.z + endPoint.z) / 2
      );
      
      wall.position.copy(wallCenter);
      
      // Calculate rotation angle
      const angle = Math.atan2(
        endPoint.z - startPoint.z,
        endPoint.x - startPoint.x
      );
      
      wall.rotation.y = angle + Math.PI / 2;
      wall.userData = { 
        type: 'wall',
        lineIndex: index,
        startPoint: { x: line.start.x, y: line.start.y },
        endPoint: { x: line.end.x, y: line.end.y }
      };
      
      scene.add(wall);
    });
  };
  
  // Function to create air entries (windows, doors, vents)
  const createAirEntries = (scene: THREE.Scene, entries: AirEntry[], roomHeight: number) => {
    // Clear existing air entries
    scene.children = scene.children.filter(child => 
      !(child.userData && ['window', 'door', 'vent'].includes(child.userData.type)));
    
    // Create each air entry
    entries.forEach((entry, index) => {
      // Determine entry dimensions and position
      const width = entry.dimensions?.width || 100;
      const height = entry.dimensions?.height || 150;
      const entryPosition = transform2DTo3D(entry.position, 0, width, height);
      
      // Different materials for different entry types
      const material = new THREE.MeshStandardMaterial({
        color: entry.type === 'window' ? 0x87ceeb : 
               entry.type === 'door' ? 0x8b4513 : 0xcccccc,
        transparent: true,
        opacity: entry.type === 'window' ? 0.4 : 0.9
      });
      
      // Determine z position based on type
      let zPosition = 0;
      if (entry.type === 'window') {
        zPosition = roomHeight / 2; // Windows in the middle of the wall
      } else if (entry.type === 'vent') {
        zPosition = roomHeight * 0.8; // Vents near the top
      }
      
      // Create geometry
      const geometry = new THREE.BoxGeometry(width, height, 10);
      const mesh = new THREE.Mesh(geometry, material);
      
      // Position the entry
      mesh.position.set(
        entryPosition.x,
        zPosition + (entry.type === 'door' ? height / 2 : 0), // Doors start from the ground
        entryPosition.z
      );
      
      // Set metadata
      mesh.userData = {
        type: entry.type,
        entryIndex: index,
        dimensions: entry.dimensions,
        position: entry.position
      };
      
      // Add to scene
      scene.add(mesh);
    });
  };
  
  // Handle wall transparency changes
  const handleWallTransparencyChange = (value: number) => {
    if (onWallTransparencyChange) {
      onWallTransparencyChange(value);
    }
    
    // Update materials of existing walls
    if (sceneRef.current) {
      sceneRef.current.traverse((object) => {
        if (object instanceof THREE.Mesh && 
            object.userData && 
            object.userData.type === 'wall' &&
            object.material instanceof THREE.MeshStandardMaterial) {
          object.material.opacity = value;
        }
      });
    }
  };
  
  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative"
    />
  );
}