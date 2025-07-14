import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { makeTextSprite } from "@/lib/three-utils";
import AirEntryDialog from "./AirEntryDialog";
import { useRoomStore } from "@/lib/store/room-store";
import type { Point, Line, AirEntry } from "@/types";

interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  hasClosedContour: boolean;
  name: string;
}

interface Canvas3DProps {
  floors: Record<string, FloorData>;
  currentFloor: string;
  ceilingHeight?: number;
  floorDeckThickness?: number;
  wallTransparency: number;
  onUpdateAirEntry?: (floorName: string, index: number, entry: AirEntry) => void;
  onDeleteAirEntry?: (floorName: string, index: number) => void;
  onPropertiesUpdate?: (
    floorName: string,
    index: number,
    properties: {
      state?: 'open' | 'closed';
      temperature?: number;
      airOrientation?: 'inflow' | 'outflow';
      flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
      flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
      customIntensityValue?: number;
      verticalAngle?: number;
      horizontalAngle?: number;
    }
  ) => void;
  onDimensionsUpdate?: (
    floorName: string,
    index: number,
    dimensions: {
      width?: number;
      height?: number;
      distanceToFloor?: number;
    }
  ) => void;
  onPositionUpdate?: (
    floorName: string,
    index: number,
    position: Point
  ) => void;
}

const PIXELS_TO_CM = 25 / 20; // 1.25 - Canvas2D standard conversion
const CANVAS_CONFIG = {
  dimensions: { width: 800, height: 600 },
  get centerX() { return this.dimensions.width / 2; },
  get centerY() { return this.dimensions.height / 2; }
};

// ID Generation System
const generateAirEntryId = (type: string, floorName: string, existingEntries: AirEntry[]): string => {
  // Floor prefixes for ID generation
  const floorPrefixes: Record<string, string> = {
    'ground': '0F',
    'first': '1F', 
    'second': '2F',
    'third': '3F',
    'fourth': '4F',
    'fifth': '5F'
  };
  
  const prefix = floorPrefixes[floorName] || '0F';
  
  // Count existing elements of same type on this floor
  const sameTypeCount = existingEntries.filter(entry => 
    entry.type === type && entry.id?.includes(prefix)
  ).length;
  
  return `${type}_${prefix}_${sameTypeCount + 1}`;
};

// Core coordinate transformation
const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  const relativeX = point.x - CANVAS_CONFIG.centerX;
  const relativeY = CANVAS_CONFIG.centerY - point.y;

  return new THREE.Vector3(
    relativeX * PIXELS_TO_CM,
    relativeY * PIXELS_TO_CM,
    height,
  );
};

// Floor name normalization for consistent matching
const normalizeFloorName = (floorName: string): string => {
  return floorName.toLowerCase()
                 .replace(/\s+/g, '')
                 .replace('floor', '')
                 .replace(/st|nd|rd|th/g, '')
                 .trim();
};

// Room perimeter creation
const createRoomPerimeter = (lines: Line[]): Point[] => {
  if (lines.length === 0) return [];

  const perimeter: Point[] = [];
  const visited = new Set<string>();
  const pointToString = (p: Point) => `${p.x},${p.y}`;

  const connections = new Map<string, Point[]>();
  lines.forEach((line) => {
    const startKey = pointToString(line.start);
    const endKey = pointToString(line.end);

    if (!connections.has(startKey)) connections.set(startKey, []);
    if (!connections.has(endKey)) connections.set(endKey, []);

    connections.get(startKey)!.push(line.end);
    connections.get(endKey)!.push(line.start);
  });

  let currentPoint = lines[0].start;
  perimeter.push(currentPoint);
  visited.add(pointToString(currentPoint));

  while (perimeter.length < lines.length) {
    const currentKey = pointToString(currentPoint);
    const connectedPoints = connections.get(currentKey) || [];
    
    let nextPoint: Point | null = null;
    for (const point of connectedPoints) {
      const pointKey = pointToString(point);
      if (!visited.has(pointKey)) {
        nextPoint = point;
        break;
      }
    }

    if (!nextPoint) break;
    
    perimeter.push(nextPoint);
    visited.add(pointToString(nextPoint));
    currentPoint = nextPoint;
  }

  return perimeter;
};

export default function Canvas3D({
  floors,
  currentFloor,
  ceilingHeight = 210,
  floorDeckThickness = 35,
  wallTransparency = 0.7,
  onUpdateAirEntry,
  onDeleteAirEntry,
  onPropertiesUpdate,
  onDimensionsUpdate,
  onPositionUpdate
}: Canvas3DProps) {
  // Store integration
  const storeFloors = useRoomStore((state) => state.floors);
  const { updateAirEntry, findAirEntryById } = useRoomStore();
  
  // Use store data if available, fallback to props
  const finalFloors = useMemo(() => {
    const floorsToUse = Object.keys(storeFloors).length > 0 ? storeFloors : floors;
    
    // Ensure all AirEntries have IDs
    const processedFloors: Record<string, FloorData> = {};
    Object.entries(floorsToUse).forEach(([floorName, floorData]) => {
      processedFloors[floorName] = {
        ...floorData,
        airEntries: floorData.airEntries.map(entry => {
          if (!entry.id) {
            return {
              ...entry,
              id: generateAirEntryId(entry.type, floorName, floorData.airEntries)
            };
          }
          return entry;
        })
      };
    });
    
    return processedFloors;
  }, [storeFloors, floors]);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const needsRenderRef = useRef<boolean>(true);
  
  // Dialog state
  const [editingAirEntryId, setEditingAirEntryId] = useState<string | null>(null);

  // Find AirEntry by ID across all floors
  const findAirEntryById = useCallback((id: string) => {
    for (const [floorName, floorData] of Object.entries(finalFloors)) {
      const entryIndex = floorData.airEntries.findIndex(entry => entry.id === id);
      if (entryIndex !== -1) {
        return {
          entry: floorData.airEntries[entryIndex],
          floorName,
          index: entryIndex
        };
      }
    }
    return null;
  }, [finalFloors]);

  // Dialog initial values
  const airEntryInitialValues = useMemo(() => {
    if (!editingAirEntryId) return null;
    
    const result = findAirEntryById(editingAirEntryId);
    if (!result) return null;
    
    const { entry } = result;
    return {
      ...entry.dimensions,
      properties: entry.properties || {},
      position: entry.position,
      wallPosition: entry.wallPosition || 50,
      _airEntryId: editingAirEntryId,
      _floorName: result.floorName,
      _index: result.index
    };
  }, [editingAirEntryId, findAirEntryById]);

  // Real-time update handlers
  const handleAirEntryPositionUpdate = useCallback((newPosition: Point) => {
    if (!editingAirEntryId) return;
    
    const result = findAirEntryById(editingAirEntryId);
    if (!result) return;
    
    const { entry, floorName, index } = result;
    
    // Update store immediately for real-time sync
    const updatedEntry = { ...entry, position: newPosition };
    updateAirEntry(floorName, index, updatedEntry);
    
    // Update 3D scene
    const mesh = findAirEntryMesh(floorName, index);
    if (mesh) {
      const position3D = transform2DTo3D(newPosition);
      mesh.position.set(position3D.x, position3D.y, mesh.position.z);
      mesh.userData.position = newPosition;
      needsRenderRef.current = true;
    }
    
    // Notify parent
    if (onPositionUpdate) {
      onPositionUpdate(floorName, index, newPosition);
    }
  }, [editingAirEntryId, findAirEntryById, updateAirEntry, onPositionUpdate]);

  const handleAirEntryDimensionsUpdate = useCallback((newDimensions: any) => {
    if (!editingAirEntryId) return;
    
    const result = findAirEntryById(editingAirEntryId);
    if (!result) return;
    
    const { entry, floorName, index } = result;
    
    // Update store immediately
    const updatedEntry = { ...entry, dimensions: { ...entry.dimensions, ...newDimensions } };
    updateAirEntry(floorName, index, updatedEntry);
    
    // Update 3D scene
    const mesh = findAirEntryMesh(floorName, index);
    if (mesh && mesh.geometry instanceof THREE.PlaneGeometry) {
      // Recreate geometry with new dimensions
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(
        newDimensions.width || entry.dimensions.width,
        newDimensions.height || entry.dimensions.height
      );
      needsRenderRef.current = true;
    }
    
    // Notify parent
    if (onDimensionsUpdate) {
      onDimensionsUpdate(floorName, index, newDimensions);
    }
  }, [editingAirEntryId, findAirEntryById, updateAirEntry, onDimensionsUpdate]);

  const handleAirEntryPropertiesUpdate = useCallback((newProperties: any) => {
    if (!editingAirEntryId) return;
    
    const result = findAirEntryById(editingAirEntryId);
    if (!result) return;
    
    const { entry, floorName, index } = result;
    
    // Update store immediately
    const updatedEntry = { 
      ...entry, 
      properties: { ...entry.properties, ...newProperties } 
    };
    updateAirEntry(floorName, index, updatedEntry);
    
    // Notify parent
    if (onPropertiesUpdate) {
      onPropertiesUpdate(floorName, index, newProperties);
    }
  }, [editingAirEntryId, findAirEntryById, updateAirEntry, onPropertiesUpdate]);

  // Find mesh by floor and index
  const findAirEntryMesh = useCallback((floorName: string, entryIndex: number): THREE.Mesh | null => {
    if (!sceneRef.current) return null;
    
    let foundMesh: THREE.Mesh | null = null;
    
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && 
          object.userData?.type && 
          ["door", "window", "vent"].includes(object.userData.type) &&
          object.userData.floorName === floorName &&
          object.userData.entryIndex === entryIndex) {
        foundMesh = object;
      }
    });
    
    return foundMesh;
  }, []);

  // Create floor objects (walls, floors, air entries)
  const createFloorObjects = useCallback((floorName: string, floorData: FloorData, baseHeight: number): THREE.Object3D[] => {
    const objects: THREE.Object3D[] = [];
    
    if (!floorData.hasClosedContour || floorData.lines.length === 0) {
      return objects;
    }

    // Create room perimeter
    const perimeter = createRoomPerimeter(floorData.lines);
    if (perimeter.length === 0) return objects;

    // Create floor geometry
    const floorShape = new THREE.Shape();
    const firstPoint = transform2DTo3D(perimeter[0]);
    floorShape.moveTo(firstPoint.x, firstPoint.y);
    
    for (let i = 1; i < perimeter.length; i++) {
      const point = transform2DTo3D(perimeter[i]);
      floorShape.lineTo(point.x, point.y);
    }
    floorShape.closePath();

    // Floor mesh
    const floorGeometry = new THREE.ShapeGeometry(floorShape);
    const floorMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xcccccc,
      transparent: true,
      opacity: 0.8
    });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.position.z = baseHeight;
    floorMesh.userData = { type: 'floor', floorName };
    objects.push(floorMesh);

    // Ceiling mesh
    const ceilingMesh = new THREE.Mesh(floorGeometry.clone(), floorMaterial.clone());
    ceilingMesh.position.z = baseHeight + ceilingHeight;
    ceilingMesh.userData = { type: 'ceiling', floorName };
    objects.push(ceilingMesh);

    // Walls
    for (let i = 0; i < perimeter.length; i++) {
      const start = perimeter[i];
      const end = perimeter[(i + 1) % perimeter.length];
      
      const start3D = transform2DTo3D(start);
      const end3D = transform2DTo3D(end);
      
      const wallLength = start3D.distanceTo(end3D);
      const wallGeometry = new THREE.PlaneGeometry(wallLength, ceilingHeight);
      const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: wallTransparency,
        side: THREE.DoubleSide
      });
      
      const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
      
      // Position wall
      const midpoint = new THREE.Vector3().addVectors(start3D, end3D).multiplyScalar(0.5);
      wallMesh.position.set(midpoint.x, midpoint.y, baseHeight + ceilingHeight / 2);
      
      // Rotate wall to face correctly
      const direction = new THREE.Vector3().subVectors(end3D, start3D).normalize();
      const angle = Math.atan2(direction.y, direction.x);
      wallMesh.rotation.z = angle;
      
      wallMesh.userData = { type: 'wall', floorName };
      objects.push(wallMesh);
    }

    // Air entries
    if (floorData.airEntries) {
      floorData.airEntries.forEach((entry: AirEntry, index: number) => {
        const width = entry.dimensions.width;
        const height = entry.dimensions.height;
        const distanceToFloor = entry.dimensions.distanceToFloor || 0;
        const zPosition = baseHeight + (entry.type === "door" ? height / 2 : distanceToFloor + height / 2);

        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshPhongMaterial({
          color: entry.type === "window" ? 0x3b82f6 : entry.type === "door" ? 0xb45309 : 0x22c55e,
          opacity: 0.7,
          transparent: true,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        const position = transform2DTo3D(entry.position);
        mesh.position.set(position.x, position.y, zPosition);
        mesh.userData = { 
          type: entry.type, 
          entryIndex: index, 
          position: entry.position,
          floorName,
          airEntryId: entry.id
        };
        objects.push(mesh);
      });
    }

    return objects;
  }, [ceilingHeight, wallTransparency]);

  // Setup scene
  const setupScene = useCallback(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      10000
    );
    camera.position.set(200, 200, 300);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setClearColor(0xf0f0f0);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Double-click handler for AirEntry editing
    const handleDoubleClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      const intersects = raycaster.intersectObjects(scene.children, true);
      
      for (const intersect of intersects) {
        const object = intersect.object;
        if (object instanceof THREE.Mesh && 
            object.userData?.type &&
            ["door", "window", "vent"].includes(object.userData.type) &&
            object.userData.airEntryId) {
          
          console.log("Opening AirEntry dialog for ID:", object.userData.airEntryId);
          setEditingAirEntryId(object.userData.airEntryId);
          break;
        }
      }
    };

    renderer.domElement.addEventListener('dblclick', handleDoubleClick);

    // Render loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (needsRenderRef.current) {
        controls.update();
        renderer.render(scene, camera);
        needsRenderRef.current = false;
      }
    };
    animate();

    // Cleanup function
    return () => {
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update scene when floors change
  useEffect(() => {
    if (!sceneRef.current) return;

    // Clear existing objects
    const objectsToRemove: THREE.Object3D[] = [];
    sceneRef.current.traverse((object) => {
      if (object.userData?.type && 
          ['floor', 'ceiling', 'wall', 'door', 'window', 'vent'].includes(object.userData.type)) {
        objectsToRemove.push(object);
      }
    });
    
    objectsToRemove.forEach(obj => {
      sceneRef.current!.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) {
          obj.material.dispose();
        }
      }
    });

    // Add new objects
    let currentHeight = 0;
    const floorOrder = ['ground', 'first', 'second', 'third', 'fourth', 'fifth'];
    
    for (const floorName of floorOrder) {
      if (finalFloors[floorName]?.hasClosedContour) {
        const objects = createFloorObjects(floorName, finalFloors[floorName], currentHeight);
        objects.forEach(obj => sceneRef.current!.add(obj));
        currentHeight += ceilingHeight + floorDeckThickness;
      }
    }

    needsRenderRef.current = true;
  }, [finalFloors, createFloorObjects, ceilingHeight, floorDeckThickness]);

  // Initialize scene
  useEffect(() => {
    const cleanup = setupScene();
    return cleanup;
  }, [setupScene]);

  // Handle dialog close
  const handleDialogClose = useCallback(() => {
    setEditingAirEntryId(null);
  }, []);

  // Handle dialog save
  const handleDialogSave = useCallback((data: any) => {
    if (!editingAirEntryId) return;
    
    const result = findAirEntryById(editingAirEntryId);
    if (!result) return;
    
    const { entry, floorName, index } = result;
    
    // Update entry with all changes
    const updatedEntry = {
      ...entry,
      dimensions: {
        width: data.width,
        height: data.height,
        distanceToFloor: data.distanceToFloor
      },
      position: data.position || entry.position,
      properties: data.properties || entry.properties,
      wallPosition: data.wallPosition
    };
    
    // Update store
    updateAirEntry(floorName, index, updatedEntry);
    
    // Notify parent
    if (onUpdateAirEntry) {
      onUpdateAirEntry(floorName, index, updatedEntry);
    }
    
    // Close dialog
    setEditingAirEntryId(null);
    needsRenderRef.current = true;
  }, [editingAirEntryId, findAirEntryById, updateAirEntry, onUpdateAirEntry]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      
      {editingAirEntryId && airEntryInitialValues && (
        <AirEntryDialog
          isOpen={true}
          onClose={handleDialogClose}
          onConfirm={handleDialogSave}
          initialValues={airEntryInitialValues}
          onPositionUpdate={handleAirEntryPositionUpdate}
          onDimensionsUpdate={handleAirEntryDimensionsUpdate}
          onPropertiesUpdate={handleAirEntryPropertiesUpdate}
          wallContext={{
            wallId: `${airEntryInitialValues._floorName}_wall_${airEntryInitialValues._index}`,
            floorName: airEntryInitialValues._floorName,
            wallStart: { x: 0, y: 0 },
            wallEnd: { x: 100, y: 0 },
            clickPosition: airEntryInitialValues.position,
            ceilingHeight: ceilingHeight * 100
          }}
        />
      )}
    </div>
  );
}