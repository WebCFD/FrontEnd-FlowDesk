import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { makeTextSprite } from "@/lib/three-utils";
import AirEntryDialog from "./AirEntryDialog";
import FurnitureDialog from "./FurnitureDialog";
import UnifiedVentDialog from "./UnifiedVentDialog";
import { useRoomStore } from "@/lib/store/room-store";
import type { Point, Line, AirEntry } from "@/types";
import { FurnitureItem } from "@shared/furniture-types";
import { createTableModel, createPersonModel, createArmchairModel, createCarModel, createBlockModel } from "./furniture-models";
import { STLProcessor } from "./STLProcessor";
import { customFurnitureStore } from "@/lib/custom-furniture-store";

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
  isEraserMode?: boolean;
  isFurnitureEraserMode?: boolean;
  simulationName?: string;
  simulationType?: string;
  isMultifloor?: boolean;
  presentationMode?: boolean;
  allowAirEntryEditing?: boolean;
  lightingIntensity?: number;
  floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number }>;
  
  // AirEntry callbacks
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
  
  // Furniture callbacks
  onFurnitureAdd?: (floorName: string, item: FurnitureItem) => void;
  onUpdateFurniture?: (floorName: string, itemId: string, item: FurnitureItem) => void;
  onDeleteFurniture?: (floorName: string, itemId: string) => void;
  onFurnitureAdded?: () => void;
  onFurnitureDeleted?: () => void;
}

// Utility functions
const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  return new THREE.Vector3(point.x / 100, height / 100, -point.y / 100);
};

const createRoomPerimeter = (lines: Line[]): Point[] => {
  if (lines.length === 0) return [];
  
  const perimeter: Point[] = [];
  const tolerance = 0.1;
  
  perimeter.push(lines[0].start);
  perimeter.push(lines[0].end);
  
  for (let i = 1; i < lines.length; i++) {
    const lastPoint = perimeter[perimeter.length - 1];
    const currentLine = lines[i];
    
    const distToStart = Math.sqrt(
      Math.pow(lastPoint.x - currentLine.start.x, 2) + 
      Math.pow(lastPoint.y - currentLine.start.y, 2)
    );
    const distToEnd = Math.sqrt(
      Math.pow(lastPoint.x - currentLine.end.x, 2) + 
      Math.pow(lastPoint.y - currentLine.end.y, 2)
    );
    
    if (distToStart < tolerance) {
      perimeter.push(currentLine.end);
    } else if (distToEnd < tolerance) {
      perimeter.push(currentLine.start);
    } else {
      perimeter.push(currentLine.start);
      perimeter.push(currentLine.end);
    }
  }
  
  return perimeter;
};

export default function Canvas3D({
  floors,
  currentFloor,
  ceilingHeight = 250,
  floorDeckThickness = 15,
  wallTransparency,
  isEraserMode = false,
  isFurnitureEraserMode = false,
  simulationName,
  simulationType,
  isMultifloor = false,
  presentationMode = false,
  allowAirEntryEditing = true,
  lightingIntensity = 0.8,
  floorParameters,
  onUpdateAirEntry,
  onDeleteAirEntry,
  onPropertiesUpdate,
  onDimensionsUpdate,
  onPositionUpdate,
  onFurnitureAdd,
  onUpdateFurniture,
  onDeleteFurniture,
  onFurnitureAdded,
  onFurnitureDeleted
}: Canvas3DProps) {
  // Store integration
  const storeFloors = useRoomStore((state) => state.floors);
  const { 
    updateAirEntry, 
    findAirEntryById, 
    generateAirEntryId,
    addFurnitureToFloor,
    updateFurnitureInFloor,
    deleteFurnitureFromFloor
  } = useRoomStore();
  
  // Use store data if available, fallback to props
  const finalFloors = Object.keys(storeFloors).length > 0 ? storeFloors : floors;
  
  // Scene state
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const needsRenderRef = useRef(false);
  
  // Dialog state
  const [editingAirEntryId, setEditingAirEntryId] = useState<string | null>(null);
  const [editingFurniture, setEditingFurniture] = useState<{
    item: FurnitureItem;
    index: number;
    mode?: 'creation' | 'edit';
  } | null>(null);
  
  // Find air entry by ID
  const findAirEntryByIdLocal = useCallback((id: string) => {
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

  // Real-time update handlers
  const handleAirEntryPositionUpdate = useCallback((newPosition: Point) => {
    if (!editingAirEntryId) return;
    
    const result = findAirEntryByIdLocal(editingAirEntryId);
    if (!result) return;
    
    const { entry, floorName, index } = result;
    
    // Update store immediately for real-time sync
    const updatedEntry = { ...entry, position: newPosition };
    updateAirEntry(floorName, index, updatedEntry);
    
    // Notify parent
    if (onPositionUpdate) {
      onPositionUpdate(floorName, index, newPosition);
    }
  }, [editingAirEntryId, findAirEntryByIdLocal, updateAirEntry, onPositionUpdate]);

  const handleAirEntryDimensionsUpdate = useCallback((newDimensions: any) => {
    if (!editingAirEntryId) return;
    
    const result = findAirEntryByIdLocal(editingAirEntryId);
    if (!result) return;
    
    const { entry, floorName, index } = result;
    
    // Update store immediately
    const updatedEntry = { ...entry, dimensions: { ...entry.dimensions, ...newDimensions } };
    updateAirEntry(floorName, index, updatedEntry);
    
    // Notify parent
    if (onDimensionsUpdate) {
      onDimensionsUpdate(floorName, index, newDimensions);
    }
  }, [editingAirEntryId, findAirEntryByIdLocal, updateAirEntry, onDimensionsUpdate]);

  const handleAirEntryPropertiesUpdate = useCallback((newProperties: any) => {
    if (!editingAirEntryId) return;
    
    const result = findAirEntryByIdLocal(editingAirEntryId);
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
  }, [editingAirEntryId, findAirEntryByIdLocal, updateAirEntry, onPropertiesUpdate]);

  // Furniture generation and utilities
  const generateFurnitureId = useCallback((type: string, floorName: string): string => {
    const currentFloorData = finalFloors[floorName];
    const existingFurniture = currentFloorData?.furnitureItems || [];
    
    const floorPrefix = floorName === 'ground' ? '0F' : 
                       floorName === 'first' ? '1F' :
                       floorName === 'second' ? '2F' :
                       floorName === 'third' ? '3F' :
                       floorName === 'fourth' ? '4F' :
                       floorName === 'fifth' ? '5F' : '0F';
    
    const typeDisplayNames: Record<string, string> = {
      'table': 'Table',
      'armchair': 'Chair', 
      'person': 'Person',
      'car': 'Car',
      'block': 'Block',
      'vent': 'Vent',
      'custom': 'Obj'
    };
    
    const sameTypeCount = existingFurniture.filter(item => 
      item.type === type && item.floorName === floorName
    ).length + 1;
    
    const displayName = typeDisplayNames[type] || 'Item';
    return `${displayName} ${floorPrefix}-${sameTypeCount}`;
  }, [finalFloors]);

  // Create furniture models
  const createFurnitureModel = useCallback((furnitureItem: FurnitureItem): THREE.Object3D | null => {
    let model: THREE.Object3D | null = null;
    
    switch (furnitureItem.type) {
      case 'table':
        model = createTableModel();
        break;
      case 'person':
        model = createPersonModel();
        break;
      case 'armchair':
        model = createArmchairModel();
        break;
      case 'car':
        model = createCarModel();
        break;
      case 'block':
        model = createBlockModel();
        break;
      case 'custom':
        const processor = STLProcessor.getInstance();
        const customMesh = processor.createMeshFromStored(furnitureItem.id);
        if (customMesh) {
          model = new THREE.Group();
          model.add(customMesh);
        }
        break;
      case 'vent':
        model = new THREE.Group();
        const ventGeometry = new THREE.PlaneGeometry(0.8, 0.8);
        const ventMaterial = new THREE.MeshPhongMaterial({ 
          color: 0xffa500, 
          transparent: true, 
          opacity: 0.8 
        });
        const ventMesh = new THREE.Mesh(ventGeometry, ventMaterial);
        model.add(ventMesh);
        break;
    }
    
    if (model) {
      // Apply transformations
      model.position.set(
        furnitureItem.position.x / 100,
        furnitureItem.position.z / 100,
        furnitureItem.position.y / 100
      );
      
      if (furnitureItem.rotation) {
        model.rotation.set(
          furnitureItem.rotation.x,
          furnitureItem.rotation.y,
          furnitureItem.rotation.z
        );
      }
      
      if (furnitureItem.dimensions) {
        const scale = {
          x: furnitureItem.dimensions.width / 100,
          y: furnitureItem.dimensions.depth / 100,
          z: furnitureItem.dimensions.height / 100
        };
        model.scale.set(scale.x, scale.y, scale.z);
      }
      
      // Store metadata
      model.userData = {
        type: 'furniture',
        furnitureType: furnitureItem.type,
        id: furnitureItem.id,
        floorName: furnitureItem.floorName,
        simulationProperties: furnitureItem.simulationProperties || {},
        properties: furnitureItem.properties || {}
      };
    }
    
    return model;
  }, []);

  // Furniture drag & drop handler
  const handleFurnitureDrop = useCallback((event: DragEvent) => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
    
    event.preventDefault();
    
    try {
      const itemData = event.dataTransfer?.getData("application/json");
      if (!itemData) return;
      
      const furnitureData = JSON.parse(itemData);
      if (!furnitureData.type) return;
      
      // Calculate drop position
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      
      // Check for floor intersection
      const floorObjects = sceneRef.current.children.filter(child => 
        child.userData?.type === 'floor'
      );
      
      const intersects = raycaster.intersectObjects(floorObjects);
      if (intersects.length === 0) return;
      
      const intersection = intersects[0];
      const dropPosition = intersection.point;
      
      // Create furniture item
      const furnitureId = generateFurnitureId(furnitureData.type, currentFloor);
      const furnitureItem: FurnitureItem = {
        id: furnitureId,
        type: furnitureData.type,
        name: furnitureData.name || furnitureId,
        floorName: currentFloor,
        position: {
          x: dropPosition.x * 100,
          y: dropPosition.z * 100,
          z: dropPosition.y * 100
        },
        rotation: { x: 0, y: 0, z: 0 },
        dimensions: furnitureData.dimensions || { width: 80, height: 80, depth: 80 },
        information: furnitureData.information || '',
        simulationProperties: furnitureData.simulationProperties || {},
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      // Add to store
      addFurnitureToFloor(currentFloor, furnitureItem);
      
      // Create and add to scene
      const model = createFurnitureModel(furnitureItem);
      if (model) {
        sceneRef.current.add(model);
        needsRenderRef.current = true;
        
        // Open edit dialog immediately
        setEditingFurniture({
          item: furnitureItem,
          index: (finalFloors[currentFloor]?.furnitureItems?.length || 0) - 1,
          mode: 'creation'
        });
      }
      
      // Notify parent
      if (onFurnitureAdd) {
        onFurnitureAdd(currentFloor, furnitureItem);
      }
      if (onFurnitureAdded) {
        onFurnitureAdded();
      }
      
    } catch (error) {
      console.error("Error processing furniture drop:", error);
    }
  }, [currentFloor, generateFurnitureId, addFurnitureToFloor, createFurnitureModel, finalFloors, onFurnitureAdd, onFurnitureAdded]);

  // Furniture editing handlers
  const handleFurnitureEdit = useCallback((index: number, data: any) => {
    if (!editingFurniture) return;
    
    const updatedItem = {
      ...editingFurniture.item,
      ...data,
      updatedAt: Date.now()
    };
    
    updateFurnitureInFloor(currentFloor, editingFurniture.item.id, updatedItem);
    
    // Update 3D scene
    const furnitureObject = sceneRef.current?.children.find(child => 
      child.userData?.type === 'furniture' && child.userData?.id === editingFurniture.item.id
    );
    
    if (furnitureObject) {
      // Update position
      if (data.position) {
        furnitureObject.position.set(
          data.position.x / 100,
          data.position.z / 100,
          data.position.y / 100
        );
      }
      
      // Update rotation
      if (data.rotation) {
        furnitureObject.rotation.set(
          data.rotation.x,
          data.rotation.y,
          data.rotation.z
        );
      }
      
      // Update scale
      if (data.dimensions) {
        furnitureObject.scale.set(
          data.dimensions.width / 100,
          data.dimensions.depth / 100,
          data.dimensions.height / 100
        );
      }
      
      // Update userData
      furnitureObject.userData = {
        ...furnitureObject.userData,
        simulationProperties: data.simulationProperties || furnitureObject.userData.simulationProperties,
        properties: data.properties || furnitureObject.userData.properties
      };
      
      needsRenderRef.current = true;
    }
    
    // Notify parent
    if (onUpdateFurniture) {
      onUpdateFurniture(currentFloor, editingFurniture.item.id, updatedItem);
    }
    
    setEditingFurniture(null);
  }, [editingFurniture, currentFloor, updateFurnitureInFloor, onUpdateFurniture]);

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

    // Create walls
    for (let i = 0; i < perimeter.length; i++) {
      const currentPoint = perimeter[i];
      const nextPoint = perimeter[(i + 1) % perimeter.length];
      
      const start3D = transform2DTo3D(currentPoint);
      const end3D = transform2DTo3D(nextPoint);
      
      const length = start3D.distanceTo(end3D);
      if (length < 0.01) continue;
      
      const wallGeometry = new THREE.PlaneGeometry(length, ceilingHeight / 100);
      const wallMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffffff,
        transparent: true,
        opacity: wallTransparency,
        side: THREE.DoubleSide
      });
      
      const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
      
      // Position and orient wall
      const center = new THREE.Vector3().addVectors(start3D, end3D).multiplyScalar(0.5);
      wallMesh.position.copy(center);
      wallMesh.position.z = baseHeight + (ceilingHeight / 100) / 2;
      
      const direction = new THREE.Vector3().subVectors(end3D, start3D).normalize();
      const angle = Math.atan2(direction.y, direction.x);
      wallMesh.rotation.z = angle;
      
      wallMesh.userData = { 
        type: 'wall', 
        floorName,
        startPoint: currentPoint,
        endPoint: nextPoint
      };
      
      objects.push(wallMesh);
    }

    // Create AirEntries with unique IDs
    floorData.airEntries.forEach((entry: AirEntry, index: number) => {
      // Ensure entry has unique ID
      if (!entry.id) {
        entry.id = generateAirEntryId(floorName, entry.type);
      }
      
      const position3D = transform2DTo3D(entry.position, entry.dimensions.distanceToFloor || 100);
      
      const entryGeometry = new THREE.PlaneGeometry(
        entry.dimensions.width / 100,
        entry.dimensions.height / 100
      );
      
      let color = 0x87ceeb; // default light blue
      if (entry.type === "door") color = 0x8b4513; // brown
      else if (entry.type === "window") color = 0x87ceeb; // light blue
      else if (entry.type === "vent") color = 0xffa500; // orange
      
      const entryMaterial = new THREE.MeshPhongMaterial({ 
        color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      });
      
      const entryMesh = new THREE.Mesh(entryGeometry, entryMaterial);
      entryMesh.position.copy(position3D);
      
      entryMesh.userData = {
        type: entry.type,
        entryIndex: index,
        floorName,
        airEntryId: entry.id,
        position: entry.position,
        dimensions: entry.dimensions,
        properties: entry.properties || {}
      };
      
      objects.push(entryMesh);
    });

    // Create Furniture items for this floor
    const furnitureItems = (floorData as any).furnitureItems || [];
    furnitureItems.forEach((item: FurnitureItem) => {
      if (item.floorName === floorName) {
        const furnitureModel = createFurnitureModel(item);
        if (furnitureModel) {
          // Position relative to floor height
          furnitureModel.position.y += baseHeight / 100;
          objects.push(furnitureModel);
        }
      }
    });

    return objects;
  }, [wallTransparency, ceilingHeight, generateAirEntryId]);

  // Initialize scene
  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    containerRef.current.appendChild(renderer.domElement);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      
      if (needsRenderRef.current) {
        renderer.render(scene, camera);
        needsRenderRef.current = false;
      }
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      needsRenderRef.current = true;
    };

    window.addEventListener('resize', handleResize);

    // Double-click handler for AirEntry and Furniture editing
    const handleDoubleClick = (event: MouseEvent) => {
      if (!camera || !scene) return;
      
      // Skip in presentation mode unless explicitly allowed
      if (presentationMode && !allowAirEntryEditing) return;
      
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      
      const intersects = raycaster.intersectObjects(scene.children, true);
      
      for (const intersect of intersects) {
        const object = intersect.object;
        
        // Check for AirEntry editing
        if (object.userData?.type && 
            ["door", "window", "vent"].includes(object.userData.type) &&
            object.userData.airEntryId) {
          setEditingAirEntryId(object.userData.airEntryId);
          break;
        }
        
        // Check for Furniture editing
        if (object.userData?.type === 'furniture' && object.userData?.id) {
          const furnitureItems = finalFloors[currentFloor]?.furnitureItems || [];
          const itemIndex = furnitureItems.findIndex(item => item.id === object.userData.id);
          
          if (itemIndex !== -1) {
            setEditingFurniture({
              item: furnitureItems[itemIndex],
              index: itemIndex,
              mode: 'edit'
            });
            break;
          }
        }
      }
    };

    // Furniture drag & drop handlers
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    const handleDrop = (event: DragEvent) => {
      if (presentationMode) return; // No furniture dropping in presentation mode
      handleFurnitureDrop(event);
    };

    // Furniture deletion handler (eraser mode)
    const handleFurnitureClick = (event: MouseEvent) => {
      if (!isFurnitureEraserMode || !camera || !scene) return;
      
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      
      const intersects = raycaster.intersectObjects(scene.children, true);
      
      for (const intersect of intersects) {
        const object = intersect.object;
        if (object.userData?.type === 'furniture' && object.userData?.id) {
          // Remove from scene
          scene.remove(object);
          
          // Remove from store
          deleteFurnitureFromFloor(currentFloor, object.userData.id);
          
          // Notify parent
          if (onDeleteFurniture) {
            onDeleteFurniture(currentFloor, object.userData.id);
          }
          if (onFurnitureDeleted) {
            onFurnitureDeleted();
          }
          
          needsRenderRef.current = true;
          break;
        }
      }
    };

    renderer.domElement.addEventListener('dblclick', handleDoubleClick);
    renderer.domElement.addEventListener('dragover', handleDragOver);
    renderer.domElement.addEventListener('drop', handleDrop);
    renderer.domElement.addEventListener('click', handleFurnitureClick);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);
      renderer.domElement.removeEventListener('dragover', handleDragOver);
      renderer.domElement.removeEventListener('drop', handleDrop);
      renderer.domElement.removeEventListener('click', handleFurnitureClick);
      
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Update scene when data changes
  const updateScene = useCallback(() => {
    if (!sceneRef.current) return;

    // Clear existing objects
    const objectsToRemove: THREE.Object3D[] = [];
    sceneRef.current.traverse((child) => {
      if (child.userData?.type && 
          ['floor', 'ceiling', 'wall', 'door', 'window', 'vent'].includes(child.userData.type)) {
        objectsToRemove.push(child);
      }
    });
    
    objectsToRemove.forEach(obj => {
      sceneRef.current?.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    // Add new objects for each floor
    let baseHeight = 0;
    const sortedFloors = Object.entries(finalFloors).sort(([a], [b]) => {
      const orderA = a === 'ground' ? 0 : parseInt(a.replace('floor_', '')) || 0;
      const orderB = b === 'ground' ? 0 : parseInt(b.replace('floor_', '')) || 0;
      return orderA - orderB;
    });

    for (const [floorName, floorData] of sortedFloors) {
      const objects = createFloorObjects(floorName, floorData, baseHeight);
      objects.forEach(obj => sceneRef.current?.add(obj));
      baseHeight += (ceilingHeight + floorDeckThickness) / 100;
    }

    needsRenderRef.current = true;
  }, [finalFloors, createFloorObjects, ceilingHeight, floorDeckThickness]);

  // Effects
  useEffect(() => {
    const cleanup = initScene();
    return cleanup;
  }, [initScene]);

  useEffect(() => {
    updateScene();
  }, [updateScene]);

  // Dialog handlers
  const handleDialogSave = useCallback((data: any) => {
    if (!editingAirEntryId) return;
    
    const result = findAirEntryByIdLocal(editingAirEntryId);
    if (!result) return;
    
    const { entry, floorName, index } = result;
    
    const updatedEntry = {
      ...entry,
      dimensions: {
        width: data.width || entry.dimensions.width,
        height: data.height || entry.dimensions.height,
        distanceToFloor: data.distanceToFloor || entry.dimensions.distanceToFloor
      },
      position: data.position || entry.position,
      properties: data.properties || entry.properties || {},
      wallPosition: data.wallPosition || entry.wallPosition
    };
    
    updateAirEntry(floorName, index, updatedEntry);
    
    // Notify parent
    if (onUpdateAirEntry) {
      onUpdateAirEntry(floorName, index, updatedEntry);
    }
    
    setEditingAirEntryId(null);
  }, [editingAirEntryId, findAirEntryByIdLocal, updateAirEntry, onUpdateAirEntry]);

  const handleDialogClose = useCallback(() => {
    setEditingAirEntryId(null);
  }, []);

  // Dialog initial values
  const dialogInitialValues = (() => {
    if (!editingAirEntryId) return null;
    
    const result = findAirEntryByIdLocal(editingAirEntryId);
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
  })();

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      
      {editingAirEntryId && dialogInitialValues && (
        <AirEntryDialog
          isOpen={true}
          onClose={handleDialogClose}
          onConfirm={handleDialogSave}
          initialValues={dialogInitialValues}
          isEditing={true}
          onPositionUpdate={handleAirEntryPositionUpdate}
          onDimensionsUpdate={handleAirEntryDimensionsUpdate}
          onPropertiesUpdate={handleAirEntryPropertiesUpdate}
        />
      )}

      {/* Furniture editing dialogs */}
      {editingFurniture && editingFurniture.item.type === 'vent' ? (
        <UnifiedVentDialog
          key={`vent-dialog-${editingFurniture.item.id}-${editingFurniture.mode || 'edit'}`}
          isOpen={true}
          onClose={() => setEditingFurniture(null)}
          onConfirm={(data) => handleFurnitureEdit(editingFurniture.index, data)}
          isCreationMode={editingFurniture.mode === 'creation'}
          onCancel={() => {
            if (!editingFurniture) return;
            
            if (editingFurniture.mode === 'creation') {
              const furnitureId = editingFurniture.item.id;
              
              // Remove from scene
              const furnitureObject = sceneRef.current?.children.find(child => 
                child.userData?.type === 'furniture' && child.userData?.id === furnitureId
              );
              if (furnitureObject && sceneRef.current) {
                sceneRef.current.remove(furnitureObject);
              }
              
              // Remove from store
              deleteFurnitureFromFloor(currentFloor, furnitureId);
            }
            
            setEditingFurniture(null);
          }}
          initialValues={{
            id: editingFurniture.item.id,
            name: editingFurniture.item.name,
            position: editingFurniture.item.position,
            rotation: editingFurniture.item.rotation,
            dimensions: editingFurniture.item.dimensions,
            simulationProperties: editingFurniture.item.simulationProperties || {},
            properties: editingFurniture.item.properties || {}
          }}
        />
      ) : editingFurniture ? (
        <FurnitureDialog
          type={editingFurniture.item.type}
          isOpen={true}
          onClose={() => setEditingFurniture(null)}
          onConfirm={(data) => handleFurnitureEdit(editingFurniture.index, data)}
          isCreationMode={editingFurniture.mode === 'creation'}
          onCancel={() => {
            if (!editingFurniture) return;
            
            if (editingFurniture.mode === 'creation') {
              const furnitureId = editingFurniture.item.id;
              
              // Remove from scene
              const furnitureObject = sceneRef.current?.children.find(child => 
                child.userData?.type === 'furniture' && child.userData?.id === furnitureId
              );
              if (furnitureObject && sceneRef.current) {
                sceneRef.current.remove(furnitureObject);
              }
              
              // Remove from store
              deleteFurnitureFromFloor(currentFloor, furnitureId);
            }
            
            setEditingFurniture(null);
          }}
          initialValues={{
            id: editingFurniture.item.id,
            name: editingFurniture.item.name,
            position: editingFurniture.item.position,
            rotation: editingFurniture.item.rotation,
            dimensions: editingFurniture.item.dimensions,
            information: editingFurniture.item.information || '',
            simulationProperties: editingFurniture.item.simulationProperties || {},
            properties: editingFurniture.item.properties || {}
          }}
        />
      ) : null}
    </div>
  );
}