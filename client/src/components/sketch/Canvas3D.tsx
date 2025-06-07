import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { makeTextSprite } from "@/lib/three-utils";
import AirEntryDialog from "./AirEntryDialog";
import FurnitureDialog from "./FurnitureDialog";
import { ViewDirection } from "./Toolbar3D";
import { useSceneContext } from "../../contexts/SceneContext";
import { FurnitureItem, FurnitureCallbacks } from "@shared/furniture-types";
import { createTableModel, createPersonModel, createArmchairModel, createCarModel, createBlockModel } from "./furniture-models";
import { STLProcessor } from "./STLProcessor";
import { customFurnitureStore } from "@/lib/custom-furniture-store";
import { useRoomStore } from "@/lib/store/room-store";

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

// Add StairPolygon interface
interface StairPolygon {
  id: string;
  points: Point[];
  floor: string;
  direction?: "up" | "down";
  connectsTo?: string;
  isImported?: boolean;
  // Add position3D data for sharing with RoomSketchPro
  position3D?: {
    baseHeight: number;
    bottomZ: number;
    topZ: number;
  };
}

// Update FloorData to include stair polygons
interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  hasClosedContour: boolean;
  name: string;
  stairPolygons?: StairPolygon[]; // Add stair polygons to floor data
  furnitureItems?: FurnitureItem[]; // Add furniture items to floor data
}

// Define a mesh interface for air entries to help with TypeScript type checking
interface AirEntryMesh extends THREE.Mesh {
  userData: {
    entryIndex?: number;
    type?: string;
    index?: number;
    position?: Point;
    [key: string]: any;
  };
}

// Define 3D Measurement interface
interface Measurement3D {
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  distance: number;
  line?: THREE.Line;
  label?: THREE.Sprite;
}

interface Canvas3DProps {
  floors: Record<string, FloorData>;
  currentFloor: string;
  ceilingHeight?: number;
  floorDeckThickness?: number;
  wallTransparency: number;
  isMeasureMode?: boolean;
  isEraserMode?: boolean;
  isFurnitureEraserMode?: boolean;
  simulationName?: string;
  simulationType?: string;
  isMultifloor?: boolean;
  presentationMode?: boolean; // New: disables editing tools
  lightingIntensity?: number; // New: lighting intensity control
  floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number }>;
  onUpdateAirEntry?: (
    floorName: string,
    index: number,
    entry: AirEntry,
  ) => void;
  onDeleteAirEntry?: (
    floorName: string,
    index: number
  ) => void;
  onViewChange?: (callback: (direction: ViewDirection) => void) => void;
  onSceneReady?: (scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.Camera) => void; // For RSP texture access
  onFurnitureAdded?: () => void; // Callback to notify when new furniture is added to scene
  onFurnitureDeleted?: () => void; // Callback to notify when furniture is deleted from scene
  // Furniture callbacks - Phase 2: Props pattern
  onFurnitureAdd?: (floorName: string, item: FurnitureItem) => void;
  onUpdateFurniture?: (floorName: string, index: number, item: FurnitureItem) => void;
  onDeleteFurniture?: (floorName: string, itemId: string) => void;
}


// Constants
const PIXELS_TO_CM = 25 / 20;
const GRID_SIZE = 1000;
const GRID_DIVISIONS = 40;

// Centralized dimensions configuration
const CANVAS_CONFIG = {
  dimensions: { width: 800, height: 600 },
  get centerX() { return this.dimensions.width / 2; },
  get centerY() { return this.dimensions.height / 2; },
  get aspectRatio() { return this.dimensions.width / this.dimensions.height; },
  // Helper methods for common calculations
  getRelativeX: (pointX: number) => pointX - (800 / 2),
  getRelativeY: (pointY: number) => (600 / 2) - pointY,
  reverseTransformX: (relativeX: number) => relativeX / PIXELS_TO_CM + (800 / 2),
  reverseTransformY: (relativeY: number) => (600 / 2) - relativeY / PIXELS_TO_CM
};

// Centralized raycaster configuration
const RAYCASTER_CONFIG = {
  // Default thresholds for different interaction types
  default: {
    Line: { threshold: 1.0 },
    Points: { threshold: 1.0 }
  },
  // High precision for air entry detection
  precision: {
    Line: { threshold: 0.5 },
    Points: { threshold: 0.5 }
  },
  // Hover detection thresholds
  hover: {
    Line: { threshold: 0.5 },
    Points: { threshold: 0.5 }
  }
};

// ========================================
// CORE UTILITY FUNCTIONS (Independent of component state)
// ========================================

/**
 * Normalizes floor names for consistent storage and retrieval
 * Dependencies: None
 * Used by: Canvas3D, RoomSketchPro, storage operations
 */
const normalizeFloorName = (floorName: string): string => {
  // Convert to lowercase and remove spaces - ensure consistent keys for storage/retrieval
  return floorName.toLowerCase().replace(/\s+/g, '');
};

/**
 * Core coordinate transformation function: converts 2D canvas points to 3D world space
 * Dependencies: CANVAS_CONFIG, PIXELS_TO_CM
 * Used by: All 3D geometry generation, air entry positioning, wall creation
 * Critical for: Maintaining consistent coordinate system between Canvas3D and RoomSketchPro
 */
const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  const relativeX = point.x - CANVAS_CONFIG.centerX;
  const relativeY = CANVAS_CONFIG.centerY - point.y;

  return new THREE.Vector3(
    relativeX * PIXELS_TO_CM,
    relativeY * PIXELS_TO_CM,
    height,
  );
};

/**
 * Applies raycaster configuration consistently
 * Dependencies: RAYCASTER_CONFIG
 * Used by: All raycaster operations for consistent thresholds
 */
const applyRaycasterConfig = (raycaster: THREE.Raycaster, configType: keyof typeof RAYCASTER_CONFIG = 'default') => {
  const config = RAYCASTER_CONFIG[configType];
  raycaster.params.Line = config.Line;
  raycaster.params.Points = config.Points;
};

/**
 * Creates ordered perimeter points from line segments
 * Dependencies: None (pure function)
 * Used by: Room geometry generation, floor area calculations
 */
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

  // Start from the first point and traverse
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

// Add these utility functions after the existing transform2DTo3D function or other utility functions

// Utility function to highlight the selected axis
// Replace your highlightSelectedAxis function with this enhanced version

// Utility function to highlight the selected axis
// Replace the entire highlightSelectedAxis function with this corrected version:

// Utility function to highlight the selected axis
const highlightSelectedAxis = (
  scene: THREE.Scene,
  airEntry: THREE.Mesh,
  axisType: "x" | "y" | "z" | null,
) => {
  /*console.log(
    `Highlighting axis: ${axisType} for air entry at position:`,
    airEntry.position,
  );*/

  // Find all arrow helpers near the air entry
  const arrows: THREE.ArrowHelper[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.ArrowHelper) {
      // Check if this arrow is close to our air entry
      const distance = object.position.distanceTo(airEntry.position);
      console.log(`Arrow found, distance: ${distance}`);
      if (distance < 60) {
        // Increased detection radius
        arrows.push(object);
        console.log(
          `Added arrow to highlight check, color: ${(object.line.material as THREE.LineBasicMaterial).color.getHex().toString(16)}`,
        );
      }
    }
  });

 // console.log(`Found ${arrows.length} arrows to process for highlighting`);

  // First reset all arrows to normal scale and appearance
  arrows.forEach((arrow) => {
    arrow.scale.set(1, 1, 1);
    const arrowLineMaterial = arrow.line.material as THREE.LineBasicMaterial;

    // Reset line opacity
    arrowLineMaterial.opacity = 0.8;

    // Reset cone appearance if we can access it
    if (arrow.cone && arrow.cone.material) {
      const coneMaterial = arrow.cone.material as THREE.Material;

      // Set opacity if material supports it
      if ("opacity" in coneMaterial) {
        (coneMaterial as any).opacity = 0.8;
      }
    }
  });

  // If an axis is selected, highlight it
  if (axisType) {
    //console.log(`Applying highlight to ${axisType} axis`);
    let targetColor: number = 0;
    
    // Set the target color based on the axis type
    if (axisType === "x") {
      targetColor = 0xff0000; // Red for X
    } else if (axisType === "y") {
      targetColor = 0x00ff00; // Green for Y
    } else if (axisType === "z") {
      targetColor = 0x0000ff; // Blue for Z
    }

    arrows.forEach((arrow) => {
      const arrowLineMaterial = arrow.line.material as THREE.LineBasicMaterial;
      const colorHex = arrowLineMaterial.color.getHex();

      if (colorHex === targetColor) {


        // Highlight this arrow by making it larger
        arrow.scale.set(2, 2, 2);

        // Make line more opaque
        arrowLineMaterial.opacity = 1.0;

        // Enhance cone if possible
        if (arrow.cone && arrow.cone.material) {
          const coneMaterial = arrow.cone.material as THREE.Material;

          if ("opacity" in coneMaterial) {
            (coneMaterial as any).opacity = 1.0;
          }

          if ("color" in coneMaterial) {
            (coneMaterial as any).color.copy(arrowLineMaterial.color);
          }
        }
      }
    });
  }
};

// Replace the entire highlightHoveredArrow function with this corrected version:

// Update the function signature to accept the needed variables as parameters:

const highlightHoveredArrow = (
  scene: THREE.Scene,
  hoveredArrow: { object: THREE.ArrowHelper; type: "x" | "y" | "z" } | null,
  selectedAirEntry: {
    index: number;
    entry: AirEntry;
    object: THREE.Mesh | null;
  } | null,
  selectedAxis: "x" | "y" | "z" | null,
) => {
  if (!scene) return;

  // Reset all arrows that aren't selected
  scene.traverse((object) => {
    if (object instanceof THREE.ArrowHelper) {
      // Determine if this arrow is selected
      let isCurrentlySelected = false;

      if (selectedAirEntry?.object) {
        const colorHex = (object.line.material as THREE.LineBasicMaterial).color.getHex();
        isCurrentlySelected =
          object.position.distanceTo(selectedAirEntry.object.position) < 10 &&
          ((selectedAxis === "x" && colorHex === 0xff0000) ||
           (selectedAxis === "y" && colorHex === 0x00ff00) ||
           (selectedAxis === "z" && colorHex === 0x0000ff));

        // Skip the selected arrow (it's handled by highlightSelectedAxis)
        if (isCurrentlySelected) return;
      }

      // Check if this is the hovered arrow
      const isHovered = hoveredArrow && object === hoveredArrow.object;

      if (isHovered) {
        // Scale up hovered arrow
        object.scale.set(1.5, 1.5, 1.5);

        // Make line more opaque
        const lineMaterial = object.line.material as THREE.LineBasicMaterial;
        lineMaterial.opacity = 1.0;

        // Make cone more visible if possible
        if (object.cone && object.cone.material) {
          const coneMaterial = object.cone.material as THREE.Material;
          if ("opacity" in coneMaterial) {
            (coneMaterial as any).opacity = 1.0;
          }
        }
      } else if (!isCurrentlySelected) {
        // Reset non-selected, non-hovered arrows to normal
        object.scale.set(1, 1, 1);
        const lineMaterial = object.line.material as THREE.LineBasicMaterial;
        lineMaterial.opacity = 0.8;
      }
    }
  });
};

// Utility function to highlight the selected air entry
const highlightSelectedAirEntry = (
  airEntry: THREE.Mesh | null,
  isSelected: boolean,
  isDragging: boolean,
) => {
  if (!airEntry) return;

  const material = airEntry.material as THREE.MeshPhongMaterial;

  if (isSelected) {
    // Highlight by adding an outline effect but maintain 70% base opacity or slightly higher when dragging
    material.opacity = isDragging ? 0.85 : 0.7;
    material.emissive.set(0xffff00); // Yellow emissive glow
    material.emissiveIntensity = isDragging ? 0.5 : 0.3;
  } else {
    // Reset to fixed 70% opacity for all air entries
    material.opacity = 0.7;
    material.emissive.set(0x000000); // No emissive glow
    material.emissiveIntensity = 0;
  }
};



// Add function to get the connected floor name
const getConnectedFloorName = (
  floorName: string,
  direction: "up" | "down" = "up",
): string => {
  const floorOrder = ["ground", "first", "second", "third", "fourth", "fifth"];
  const currentIndex = floorOrder.indexOf(floorName);

  if (currentIndex === -1) return floorName; // Invalid floor name

  if (direction === "up" && currentIndex < floorOrder.length - 1) {
    return floorOrder[currentIndex + 1];
  } else if (direction === "down" && currentIndex > 0) {
    return floorOrder[currentIndex - 1];
  }

  return floorName; // No valid connected floor
};

/**
 * PHASE 1: Data Migration Functions
 * Ensures backward compatibility with existing FloorData
 */

// Migrate legacy FloorData to include furniture support
const migrateFloorData = (floorData: FloorData): FloorData => {
  return {
    ...floorData,
    furnitureItems: floorData.furnitureItems || [], // Default empty array if not present
  };
};

// Validate and sanitize FurnitureItem data
const sanitizeFurnitureItem = (item: Partial<FurnitureItem>, floorName: string): FurnitureItem => {
  const now = Date.now();
  return {
    id: item.id || `furniture_${now}`,
    type: item.type || 'table',
    name: item.name || 'Unnamed Furniture',
    floorName: item.floorName || floorName,
    position: item.position || { x: 0, y: 0, z: 0 },
    rotation: item.rotation || { x: 0, y: 0, z: 0 },
    dimensions: item.dimensions || { width: 80, height: 80, depth: 80 },
    information: item.information || '',
    simulationProperties: item.simulationProperties || {},
    meshId: item.meshId,
    createdAt: item.createdAt || now,
    updatedAt: now,
  };
};

// Migrate floors data collection
const migrateFloorsData = (floors: Record<string, FloorData>): Record<string, FloorData> => {
  const migratedFloors: Record<string, FloorData> = {};
  
  for (const [floorName, floorData] of Object.entries(floors)) {
    migratedFloors[floorName] = migrateFloorData(floorData);
  }
  
  return migratedFloors;
};

/**
 * PHASE 2: Automatic Floor Detection Functions
 * Intelligent floor detection based on 3D position and camera view
 */

// Helper function for floor height calculation (Phase 2)
const calculateFloorBaseHeight = (
  floorName: string,
  availableFloors: Record<string, FloorData>,
  isMultifloor: boolean,
  floorParameters: Record<string, { ceilingHeight: number; floorDeck: number }>,
  defaultCeilingHeight: number = 220,
  defaultFloorDeck: number = 35
): number => {
  const floorOrder = ["ground", "first", "second", "third", "fourth", "fifth"];
  const index = floorOrder.indexOf(floorName);
  if (index === -1) return 0;

  let baseHeight = 0;
  for (let i = 0; i < index; i++) {
    const previousFloor = floorOrder[i];
    if (availableFloors[previousFloor]?.hasClosedContour) {
      let floorCeilingHeight, currentFloorDeck;
      if (isMultifloor && floorParameters[previousFloor]) {
        floorCeilingHeight = floorParameters[previousFloor].ceilingHeight;
        currentFloorDeck = floorParameters[previousFloor].floorDeck;
      } else {
        floorCeilingHeight = defaultCeilingHeight;
        currentFloorDeck = defaultFloorDeck;
      }
      baseHeight += floorCeilingHeight + currentFloorDeck;
    }
  }
  return baseHeight;
};

// Detect which floor to place furniture based on mouse position and 3D context
// Enhanced surface detection that returns both floor and surface type
const detectSurfaceFromPosition = (
  mouseEvent: DragEvent,
  camera: THREE.Camera,
  scene: THREE.Scene,
  currentFloor: string,
  availableFloors: Record<string, FloorData>,
  isMultifloor: boolean,
  floorParameters: Record<string, { ceilingHeight: number; floorDeck: number }>
): { floorName: string; surfaceType: 'floor' | 'ceiling'; fallbackUsed: boolean } => {
  // If not multifloor, always use current floor
  if (!isMultifloor) {
    return { floorName: currentFloor, surfaceType: 'floor', fallbackUsed: true };
  }

  // Get mouse coordinates in 3D space
  const container = mouseEvent.currentTarget as HTMLElement;
  const rect = container.getBoundingClientRect();
  const mouseX = ((mouseEvent.clientX - rect.left) / rect.width) * 2 - 1;
  const mouseY = -((mouseEvent.clientY - rect.top) / rect.height) * 2 + 1;

  // Create raycaster to find intersection point
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

  // Find floor and ceiling meshes in the scene
  const surfaceMeshes: Array<{ mesh: THREE.Mesh; floorName: string; surfaceType: 'floor' | 'ceiling' }> = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && (object.userData.type === 'floor' || object.userData.type === 'ceiling')) {
      const floorName = object.userData.floorName || 'ground';
      const surfaceType = object.userData.type as 'floor' | 'ceiling';
      surfaceMeshes.push({ mesh: object, floorName, surfaceType });
    }
  });

  // Check intersections with both floor and ceiling meshes
  const intersects = raycaster.intersectObjects(surfaceMeshes.map(s => s.mesh));
  
  if (intersects.length > 0) {
    // Find the closest surface intersection
    const closestIntersect = intersects[0];
    const correspondingSurface = surfaceMeshes.find(s => s.mesh === closestIntersect.object);
    
    if (correspondingSurface) {
      // Normalize floor name for matching
      let normalizedFloorName = correspondingSurface.floorName.toLowerCase().replace(/\s+/g, '');
      if (normalizedFloorName === 'groundfloor') normalizedFloorName = 'ground';
      
      // Try direct match first, then normalized match
      const matchingFloorKey = availableFloors[correspondingSurface.floorName] ? correspondingSurface.floorName :
                              availableFloors[normalizedFloorName] ? normalizedFloorName :
                              null;
      
      if (matchingFloorKey) {
        return { 
          floorName: matchingFloorKey, 
          surfaceType: correspondingSurface.surfaceType, 
          fallbackUsed: false 
        };
      }
    }
  }

  // Fallback: Use camera position to estimate which floor is being viewed
  const cameraY = camera.position.y;
  
  // Calculate floor heights
  const floorOrder = ["ground", "first", "second", "third", "fourth", "fifth"];
  let bestFloor = currentFloor;
  let bestDistance = Infinity;
  
  for (const floorName of floorOrder) {
    if (!availableFloors[floorName]) continue;
    
    const baseHeight = calculateFloorBaseHeight(floorName, availableFloors, isMultifloor, floorParameters);
    const ceilingHeight = floorParameters[floorName]?.ceilingHeight || 220;
    const floorMidpoint = baseHeight + (ceilingHeight / 2);
    
    const distance = Math.abs(cameraY - floorMidpoint);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFloor = floorName;
    }
  }
  
  return { floorName: bestFloor, surfaceType: 'floor', fallbackUsed: true };
};

// Enhanced position calculation for furniture placement with surface support
const calculateFurniturePosition = (
  mouseEvent: DragEvent,
  camera: THREE.Camera,
  scene: THREE.Scene,
  targetFloor: string,
  surfaceType: 'floor' | 'ceiling',
  floorParameters: Record<string, { ceilingHeight: number; floorDeck: number }>
): { x: number; y: number; z: number } => {
  const container = mouseEvent.currentTarget as HTMLElement;
  const rect = container.getBoundingClientRect();
  const mouseX = ((mouseEvent.clientX - rect.left) / rect.width) * 2 - 1;
  const mouseY = -((mouseEvent.clientY - rect.top) / rect.height) * 2 + 1;

  // Create raycaster
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

  // Try to intersect with the specific surface type (floor or ceiling)
  const surfaceMeshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.type === surfaceType) {
      // Normalize floor name for matching (same logic as detection)
      let meshFloorName = object.userData.floorName;
      let normalizedMeshName = meshFloorName.toLowerCase().replace(/\s+/g, '');
      if (normalizedMeshName === 'groundfloor') normalizedMeshName = 'ground';
      
      // Match if direct name matches OR normalized name matches
      if (meshFloorName === targetFloor || normalizedMeshName === targetFloor) {
        surfaceMeshes.push(object);
      }
    }
  });

  const intersects = raycaster.intersectObjects(surfaceMeshes);
  
  if (intersects.length > 0) {
    const point = intersects[0].point;
    return { x: point.x, y: point.y, z: point.z };
  }

  // Fallback: Calculate position based on floor height and mouse projection
  const baseHeight = calculateFloorBaseHeight(targetFloor, {}, false, floorParameters);
  
  // Project mouse coordinates to the floor plane
  const worldX = (mouseEvent.clientX - rect.left - rect.width / 2) * PIXELS_TO_CM;
  const worldY = (rect.height / 2 - (mouseEvent.clientY - rect.top)) * PIXELS_TO_CM;
  
  return {
    x: worldX,
    y: worldY,
    z: baseHeight + 10 // Slightly above floor surface
  };
};

/**
 * PHASE 3: Furniture Drop Handler Functions
 * Integrated drop functionality with existing Canvas3D architecture
 */

// Legacy function removed - now using handleComponentFurnitureDrop inside Canvas3D component

// PHASE 3: Function to create vent plane model using PlaneGeometry
const createVentPlaneModel = (furnitureItem: FurnitureItem): THREE.Group => {
  const group = new THREE.Group();
  
  // Use dimensions in cm (same units as other furniture) - no conversion needed
  const width = furnitureItem.dimensions?.width || 50; // cm
  const height = furnitureItem.dimensions?.height || 50; // cm
  
  // Create PlaneGeometry for the vent (dimensions in cm like other furniture)
  const geometry = new THREE.PlaneGeometry(width, height);
  
  // Create material with vent-specific properties
  const material = new THREE.MeshPhongMaterial({
    color: 0xC0C0C0, // Silver/aluminum color for vents
    opacity: 1.0,
    transparent: false, // VentFurniture should not be transparent
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  
  // Don't set rotation here - let the furniture system handle it
  // The rotation will be applied in createFurnitureModel based on surface detection
  
  // Set render order to appear on top like air entries
  mesh.renderOrder = 2;
  
  // Add userData for identification and raycasting
  // Use furniture type to distinguish from wall-mounted vents
  mesh.userData = {
    type: 'furniture',      // Furniture system type
    furnitureType: 'vent',  // Specific furniture subtype
    isSelectable: true,
    isVentFurniture: true   // Flag for vent furniture texture system
  };
  
  // Add userData to the group as well for deletion detection
  group.userData = {
    type: 'furniture',
    furnitureType: 'vent',
    isSelectable: true,
    isVentFurniture: true
  };
  
  group.add(mesh);
  return group;
};

// PHASE 3: Function to create and add furniture models to the scene
const createFurnitureModel = (
  furnitureItem: FurnitureItem,
  scene: THREE.Scene
): THREE.Group | null => {
  let model: THREE.Group;

  // Create the appropriate model based on furniture type
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
    case 'vent':
      model = createVentPlaneModel(furnitureItem);
      break;
    case 'custom':
      // Handle custom STL objects
      const processor = STLProcessor.getInstance();
      const customMesh = processor.createMeshFromStored(furnitureItem.id);
      if (customMesh) {
        model = new THREE.Group();
        model.add(customMesh);
        
        // Debug: Check mesh properties
        console.log(`DEBUG STL Mesh:`, {
          name: furnitureItem.name,
          geometryVertices: customMesh.geometry.attributes.position.count,
          meshPosition: customMesh.position,
          meshScale: customMesh.scale,
          boundingBox: new THREE.Box3().setFromObject(customMesh)
        });
        
        console.log(`Created custom STL object: ${furnitureItem.name}`);
      } else {
        // Gracefully handle missing STL objects (from previous sessions)
        console.warn(`Custom STL object not found in store, skipping: ${furnitureItem.id}`);
        return null;
      }
      break;
    default:
      console.error(`Unknown furniture type: ${furnitureItem.type}`);
      return null;
  }

  // Apply position, rotation, and scale from furniture item
  model.position.set(
    furnitureItem.position.x,
    furnitureItem.position.y,
    furnitureItem.position.z
  );

  model.rotation.set(
    furnitureItem.rotation.x,
    furnitureItem.rotation.y,
    furnitureItem.rotation.z
  );

  // Apply scaling based on dimensions if different from defaults
  if (furnitureItem.dimensions) {
    const defaultDimensions = getDefaultDimensions(furnitureItem.type);
    const scaleX = furnitureItem.dimensions.width / defaultDimensions.width;
    const scaleY = furnitureItem.dimensions.depth / defaultDimensions.depth;
    const scaleZ = furnitureItem.dimensions.height / defaultDimensions.height;
    
    model.scale.set(scaleX, scaleY, scaleZ);
  }

  // Add metadata to the model for identification
  model.userData = {
    type: 'furniture',
    furnitureType: furnitureItem.type,
    furnitureId: furnitureItem.id,
    floorName: furnitureItem.floorName,
    isSelectable: true
  };

  // Set the meshId in the furniture item for reference
  furnitureItem.meshId = model.uuid;

  // Add to scene
  scene.add(model);

  // Debug: Final object state after all transformations
  if (furnitureItem.type === 'custom') {
    const worldPosition = new THREE.Vector3();
    model.getWorldPosition(worldPosition);
    const boundingBox = new THREE.Box3().setFromObject(model);
    
    console.log(`DEBUG FINAL STL PLACEMENT:`, {
      name: furnitureItem.name,
      furniturePosition: furnitureItem.position,
      modelPosition: model.position,
      worldPosition: worldPosition,
      modelScale: model.scale,
      boundingBox: boundingBox,
      boundingBoxSize: {
        width: boundingBox.max.x - boundingBox.min.x,
        height: boundingBox.max.y - boundingBox.min.y,
        depth: boundingBox.max.z - boundingBox.min.z
      },
      addedToScene: scene.children.includes(model)
    });
  }

  return model;
};

// Helper function to get default dimensions for furniture types
const getDefaultDimensions = (type: 'table' | 'person' | 'armchair' | 'car' | 'block' | 'vent' | 'custom') => {
  switch (type) {
    case 'table':
      return { width: 120, height: 75, depth: 80 };
    case 'person':
      return { width: 50, height: 170, depth: 30 };
    case 'armchair':
      return { width: 70, height: 85, depth: 70 };
    case 'car':
      return { width: 450, height: 150, depth: 180 };
    case 'block':
      return { width: 80, height: 80, depth: 80 };
    case 'vent':
      return { width: 50, height: 50, depth: 10 };
    case 'custom':
      return { width: 100, height: 100, depth: 100 };
    default:
      return { width: 80, height: 80, depth: 80 };
  }
};

/**
 * ========================================
 * CANVAS3D MAIN COMPONENT
 * ========================================
 * 
 * Core 3D visualization component that renders floor plans, walls, air entries, and stairs
 * 
 * Key dependencies for shared geometry functions:
 * - transform2DTo3D: Core coordinate transformation
 * - CANVAS_CONFIG: Centralized dimensions configuration
 * - PIXELS_TO_CM: Scale conversion constant
 * - normalizeFloorName: Floor naming consistency
 * - createRoomPerimeter: Room boundary generation
 * 
 * Critical for RoomSketchPro integration:
 * - Air entry positioning algorithms (lines 2000-2200)
 * - Wall geometry generation (lines 1200-1400)
 * - Floor rendering logic (lines 800-1000)
 */
export default function Canvas3D({
  floors,
  currentFloor,
  ceilingHeight = 210,
  floorDeckThickness = 35,
  wallTransparency = 0.7,
  isMeasureMode = false,
  isEraserMode, // Removed default value to ensure external state is always respected
  isFurnitureEraserMode = false,
  simulationName = "",
  simulationType = "Comfort Simulation (steady run)",
  isMultifloor = false,
  presentationMode = false,
  lightingIntensity = 1.5,
  floorParameters = {},
  onUpdateAirEntry,
  onDeleteAirEntry,
  onViewChange,
  onSceneReady,
  onFurnitureAdded,
  onFurnitureDeleted,
  onFurnitureAdd,
  onUpdateFurniture,
  onDeleteFurniture,
}: Canvas3DProps) {
  // Access the SceneContext to share data with RoomSketchPro
  const { updateGeometryData, updateSceneData, updateFloorData, setCurrentFloor: setContextCurrentFloor } = useSceneContext();

  // PHASE 5: Pure props pattern - removed Zustand store dependencies

  // PHASE 1: Migrate floors data to ensure backward compatibility
  const migratedFloors = useMemo(() => migrateFloorsData(floors), [floors]);

  // FASE 5A: Component-level furniture drop handler with store access
  const handleComponentFurnitureDrop = useCallback((
    event: DragEvent,
    camera: THREE.Camera,
    scene: THREE.Scene
  ) => {
    event.preventDefault();
    
    const itemData = event.dataTransfer?.getData("application/json");
    if (!itemData) {
      return;
    }

    try {
      const furnitureMenuData = JSON.parse(itemData);
      
      // FASE 2 TEST: Sistema de raycasting y detección de piso
      const surfaceDetection = detectSurfaceFromPosition(
        event,
        camera,
        scene,
        currentFloor,
        migratedFloors,
        isMultifloor,
        floorParameters
      );
      
      const calculatedPosition = calculateFurniturePosition(
        event,
        camera,
        scene,
        surfaceDetection.floorName,
        surfaceDetection.surfaceType,
        floorParameters
      );

      // Use default dimensions from menu data
      const dimensions = furnitureMenuData.defaultDimensions || { width: 80, height: 80, depth: 80 };
      
      // Determine furniture type - check if it's a custom STL object
      const isCustomObject = furnitureMenuData.id.startsWith('custom_');
      const furnitureType = isCustomObject ? 'custom' : furnitureMenuData.id as 'table' | 'person' | 'armchair' | 'car' | 'block' | 'vent';
      
      // Create furniture item
      const furnitureItem: FurnitureItem = {
        id: isCustomObject ? furnitureMenuData.id : `${furnitureMenuData.id}_${Date.now()}`,
        type: furnitureType,
        name: furnitureMenuData.name,
        floorName: surfaceDetection.floorName,
        position: calculatedPosition,
        rotation: surfaceDetection.surfaceType === 'ceiling' ? { x: Math.PI, y: 0, z: 0 } : { x: 0, y: 0, z: 0 },
        dimensions: dimensions,
        information: `${furnitureMenuData.name} placed on ${surfaceDetection.surfaceType} of ${surfaceDetection.floorName}`,
        meshId: `furniture_${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Create and add 3D model to scene
      const model = createFurnitureModel(furnitureItem, scene);
      
      if (model) {
        // Add furniture via callback
        if (onFurnitureAdd && typeof onFurnitureAdd === 'function') {
          onFurnitureAdd(surfaceDetection.floorName, furnitureItem);
        }
        
        // Notify that new furniture was added to scene (for texture re-application)
        if (onFurnitureAdded && typeof onFurnitureAdded === 'function') {
          onFurnitureAdded();
        }
        
        // Store for dialog
        newFurnitureForDialog.current = furnitureItem;
      }
      
    } catch (error) {
      console.error("Error processing furniture drop:", error);
    }
  }, [currentFloor, migratedFloors, isMultifloor, floorParameters, onFurnitureAdd]);

  // Canvas3D initialization
  useEffect(() => {
  }, []);

  // Function to setup lighting based on presentation mode
  const setupLights = (scene: THREE.Scene) => {
    if (presentationMode && lightingIntensity !== undefined) {
      // RSP: More homogeneous, bright lighting without harsh shadows
      const ambientLight = new THREE.AmbientLight(0xffffff, lightingIntensity);
      scene.add(ambientLight);

      // Multiple soft directional lights for even illumination
      const directionalLight1 = new THREE.DirectionalLight(0xffffff, lightingIntensity * 0.33);
      directionalLight1.position.set(10, 10, 5);
      directionalLight1.castShadow = false;
      scene.add(directionalLight1);

      const directionalLight2 = new THREE.DirectionalLight(0xffffff, lightingIntensity * 0.22);
      directionalLight2.position.set(-10, 10, -5);
      directionalLight2.castShadow = false;
      scene.add(directionalLight2);

      const directionalLight3 = new THREE.DirectionalLight(0xffffff, lightingIntensity * 0.22);
      directionalLight3.position.set(0, 15, 10);
      directionalLight3.castShadow = false;
      scene.add(directionalLight3);
    } else {
      // Normal Canvas3D: Standard lighting with shadows
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(1, 1, 1);
      scene.add(directionalLight);
    }
  };
  // Debug state for UI display
  const [debugInfo, setDebugInfo] = useState<{
    mousePosition: string;
    eraserMode: boolean;
    hovering: boolean;
    lastIntersection: string;
  }>({
    mousePosition: "No data",
    eraserMode: false,
    hovering: false,
    lastIntersection: "None",
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const needsRenderRef = useRef<boolean>(true);
  // State for editing air entries
  const [editingAirEntry, setEditingAirEntry] = useState<{
    index: number;
    entry: AirEntry;
  } | null>(null);
  
  // State for editing furniture
  const [editingFurniture, setEditingFurniture] = useState<{
    index: number;
    item: FurnitureItem;
  } | null>(null);
  
  // Reference to store newly created furniture for auto-opening dialog
  const newFurnitureForDialog = useRef<FurnitureItem | null>(null);
  const [ignoreNextClick, setIgnoreNextClick] = useState<boolean>(false);
  
  // Effect to auto-open dialog for newly created furniture
  useEffect(() => {

    
    if (newFurnitureForDialog.current) {
      setEditingFurniture({
        index: 0, // This would be the actual index in a real furniture list
        item: newFurnitureForDialog.current
      });
      
      // Clear the reference
      newFurnitureForDialog.current = null;
    }
  }, [floors, currentFloor]); // Trigger when floors update (after furniture is added)

  // PHASE 5: Pure props pattern - furniture is now rendered in scene building loop
  // No longer need manual furniture loading as it's handled in createFloorObjects
  // Track the selected air entry element for dragging
  const [selectedAirEntry, setSelectedAirEntry] = useState<{
    index: number;
    entry: AirEntry;
    object: THREE.Mesh | null;
  } | null>(null);

  // Track which axis is selected for movement (x, y, or z)
  const [selectedAxis, setSelectedAxis] = useState<"x" | "y" | "z" | null>(null);

  // Track if currently dragging
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Store the original position for reference
  const [dragStartPosition, setDragStartPosition] =
    useState<THREE.Vector3 | null>(null);
    
  // For eraser mode - track what element is being hovered and its original material
  const [hoveredEraseTarget, setHoveredEraseTarget] = useState<{
    object: THREE.Mesh;
    originalMaterial: THREE.Material | THREE.Material[];
  } | null>(null);
  
  // Track last mouse position for directional debugging
  const lastMousePositionRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

  // Create a ref to track the current isEraserMode value to ensure it's always up-to-date in event handlers
  const isEraserModeRef = useRef(isEraserMode);
  
  // Synchronize the ref with isEraserMode state immediately
  // This needs to happen in a separate useEffect to ensure proper sequence of operations
  useEffect(() => {
    // First update the ref to match the current state
    isEraserModeRef.current = isEraserMode;

  }, [isEraserMode]);
  
  // Handle cleanup when exiting eraser mode
  useEffect(() => {
    // Only perform cleanup when turning off eraser mode
    if (isEraserMode === false) {

      
      // Clean up highlighted element if it exists
      if (hoveredEraseTarget) {

        
        try {
          // Restore original material 
          hoveredEraseTarget.object.material = hoveredEraseTarget.originalMaterial;
          
          // Restore original scale if applicable
          if (hoveredEraseTarget.object.userData?.originalScale) {
            hoveredEraseTarget.object.scale.copy(hoveredEraseTarget.object.userData.originalScale);
            
            // Force update to the geometry
            if (hoveredEraseTarget.object.geometry) {
              hoveredEraseTarget.object.geometry.computeBoundingSphere();
              hoveredEraseTarget.object.geometry.computeBoundingBox();
            }

          }
          
          // Remove any debug visualization helpers for this object
          if (sceneRef.current && hoveredEraseTarget.object.uuid) {
            sceneRef.current.traverse((obj) => {
              if (obj.userData?.type === 'debug-helper' && 
                  obj.userData?.target === hoveredEraseTarget.object.uuid) {

                sceneRef.current?.remove(obj);
              }
            });
          }
        } catch (err) {
          console.error("Error during eraser mode cleanup:", err);
        }
        
        // Clear the hover target
        setHoveredEraseTarget(null);
      }
      
      // Additional cleanup - reset any mesh that might still have eraser state
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (
            object instanceof THREE.Mesh &&
            object.userData?.originalScale &&
            ["window", "door", "vent"].includes(object.userData?.type || "")
          ) {
            try {
              // Restore the original scale
              object.scale.copy(object.userData.originalScale);
              delete object.userData.originalScale;
              
              // Update geometry
              if (object.geometry) {
                object.geometry.computeBoundingSphere();
                object.geometry.computeBoundingBox();
              }
              

            } catch (err) {
              console.error("Error restoring scale for object during cleanup:", err);
            }
          }
          
          // Also remove any debug hitbox visualizations that might be left
          if (object.userData?.type === 'debug-helper') {

            sceneRef.current?.remove(object);
          }
        });
      }
      
      // IMPORTANT: Always do these cleanup steps regardless of whether we had a hovered target
      // This ensures the system resets properly if eraser mode is turned off
      
      // Re-enable controls when exiting eraser mode
      if (controlsRef.current) {

        controlsRef.current.enabled = true;
        
        // Force controls update
        if (typeof controlsRef.current.update === 'function') {
          controlsRef.current.update();
        }
      }
      
      // Reset cursor on container if it exists
      if (containerRef.current) {
        containerRef.current.style.cursor = 'auto';

      }
      
      // Force render to update the appearance
      needsRenderRef.current = true;
      
      // Force immediate render to update visuals
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }
  }, [isEraserMode, hoveredEraseTarget]);

  // Store the initial mouse position for calculating drag distance
  const [initialMousePosition, setInitialMousePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hoveredArrow, setHoveredArrow] = useState<{
    object: THREE.ArrowHelper;
    type: "x" | "y" | "z";
  } | null>(null);

  // Measurement state variables
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureStartPoint, setMeasureStartPoint] = useState<THREE.Vector3 | null>(null);
  const [measureEndPoint, setMeasureEndPoint] = useState<THREE.Vector3 | null>(null);
  const [measurements, setMeasurements] = useState<Measurement3D[]>([]);
  const [activeMeasurementLine, setActiveMeasurementLine] = useState<THREE.Line | null>(null);
  const [activeMeasurementLabel, setActiveMeasurementLabel] = useState<THREE.Sprite | null>(null);
  
  // Store original materials for all surfaces (no React state)
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material>>(new Map());

  // Simple direct surface highlighting without React state
  const clearAllHighlights = () => {
    // Restore all original materials
    originalMaterialsRef.current.forEach((originalMaterial, mesh) => {
      mesh.material = originalMaterial;
    });
    originalMaterialsRef.current.clear();
    needsRenderRef.current = true;
  };

  const highlightSurface = (mesh: THREE.Mesh) => {
    // Clear all existing highlights first
    clearAllHighlights();
    
    // Store original material
    const originalMaterial = mesh.material as THREE.Material;
    originalMaterialsRef.current.set(mesh, originalMaterial);
    
    // Create highlight material based on surface type
    const surfaceType = mesh.userData.type;
    let highlightColor: number;
    
    if (surfaceType === 'floor') {
      highlightColor = 0x00ff00; // Bright green for floors
    } else if (surfaceType === 'ceiling') {
      highlightColor = 0x0088ff; // Bright blue for ceilings
    } else {
      highlightColor = 0xffff00; // Yellow fallback
    }
    
    // Create highlight material with emission and transparency
    const highlightMaterial = new THREE.MeshPhongMaterial({
      color: highlightColor,
      transparent: true,
      opacity: 0.4,
      emissive: new THREE.Color(highlightColor),
      emissiveIntensity: 0.3
    });
    
    // Apply highlight
    mesh.material = highlightMaterial;
    needsRenderRef.current = true;
    

  };

  // Add effect to cleanup highlight when component unmounts or floor changes
  useEffect(() => {
    return () => {
      clearAllHighlights();
    };
  }, [currentFloor]);

  const isMeasureModeRef = useRef(false);

  // Store the positions and dimensions of air entries that have been updated
  // This is used to ensure they keep their properties when the scene is rebuilt
  // Format: { floorName: { entryIndex: { position: { x, y }, dimensions?: { width, height, distanceToFloor? } } } }
  const updatedAirEntryPositionsRef = useRef<{
    [floorName: string]: {
      [entryIndex: number]: {
        position: { x: number, y: number },
        dimensions?: {
          width: number,
          height: number,
          distanceToFloor?: number
        }
      }
    }
  }>({});
  const dragStateRef = useRef({
    isDragging: false,
    selectedAxis: null as "x" | "y" | "z" | null,
    startPosition: null as THREE.Vector3 | null,
    initialMousePosition: null as {x: number, y: number} | null,
    selectedObject: null as THREE.Mesh | null,
    currentMousePosition: null as {x: number, y: number} | null,
    entryIndex: -1,
    // Direction vectors for local axis movement
    axisDirectionVectors: {
      x: null as THREE.Vector3 | null,
      y: null as THREE.Vector3 | null,
      z: null as THREE.Vector3 | null
    }
  });

  // Add this ref to track measurement state
  const measurementStateRef = useRef({
    inProgress: false,
    startPoint: null as THREE.Vector3 | null
  });


  // Calculate base height for each floor
  const getFloorBaseHeight = (floorName: string): number => {
    const floorOrder = [
      "ground",
      "first",
      "second",
      "third",
      "fourth",
      "fifth",
    ];
    const index = floorOrder.indexOf(floorName);
    if (index === -1) return 0;

    let baseHeight = 0;
    for (let i = 0; i < index; i++) {
      const previousFloor = floorOrder[i];
      if (floors[previousFloor]?.hasClosedContour) {
        // Use floor-specific parameters if multifloor is enabled
        let floorCeilingHeight, currentFloorDeck;
        if (isMultifloor && floorParameters[previousFloor]) {
          floorCeilingHeight = floorParameters[previousFloor].ceilingHeight;
          currentFloorDeck = floorParameters[previousFloor].floorDeck;
        } else {
          floorCeilingHeight = ceilingHeight;
          currentFloorDeck = floorDeckThickness;
        }
        baseHeight += floorCeilingHeight + currentFloorDeck;
      }
    }
    return baseHeight;
  };

  // Handler for updating air entries
  const handleAirEntryEdit = (
    index: number,
    dimensions: {
      width: number;
      height: number;
      distanceToFloor?: number;
    },
  ) => {
    if (!editingAirEntry || !onUpdateAirEntry) return;

    const updatedEntry = {
      ...editingAirEntry.entry,
      dimensions: dimensions,
    };

    // Store the dimensions in our ref to preserve them during scene rebuilds
    const normalizedFloorName = normalizeFloorName(currentFloor);

    // Initialize storage structure if needed
    if (!updatedAirEntryPositionsRef.current[normalizedFloorName]) {
      updatedAirEntryPositionsRef.current[normalizedFloorName] = {};
    }

    // Check if we already have position data for this entry
    if (!updatedAirEntryPositionsRef.current[normalizedFloorName][index]) {
      // If no position data exists yet, initialize with the current position
      updatedAirEntryPositionsRef.current[normalizedFloorName][index] = {
        position: { ...editingAirEntry.entry.position },
        dimensions: dimensions
      };
    } else {
      // If position data exists, just update the dimensions
      updatedAirEntryPositionsRef.current[normalizedFloorName][index].dimensions = dimensions;
    }

    console.log(`[DIMENSION STORAGE] Stored dimensions for entry ${index}:`, 
      JSON.stringify(updatedAirEntryPositionsRef.current[normalizedFloorName][index]));

    // Call the parent component's handler
    onUpdateAirEntry(currentFloor, index, updatedEntry);
    setEditingAirEntry(null);
  };

  // New function to create stair mesh
  // ========================================
  // PURE RENDERING FUNCTIONS - GEOMETRY CREATION
  // ========================================
  // These functions are pure and can be extracted for shared use
  
  /**
   * Pure function: Creates 3D stair mesh geometry
   * Dependencies: transform2DTo3D, PIXELS_TO_CM
   * No side effects, no state mutations
   * Extractable for RoomSketchPro
   */
  const createStairMesh = (
    stairPolygon: StairPolygon,
    baseHeight: number,
    isCurrentFloor: boolean,
    floorCeilingHeight: number,
  ): THREE.Object3D[] => {
    const objects: THREE.Object3D[] = [];

    // Get the destination floor name - MODIFY THIS SECTION
    let destinationFloor =
      stairPolygon.connectsTo ||
      getConnectedFloorName(stairPolygon.floor, stairPolygon.direction || "up");

    // For debugging, add this line to see what's happening
    console.log(
      `Creating stair from ${stairPolygon.floor} to ${destinationFloor}`,
      `Direction: ${stairPolygon.direction}`,
      stairPolygon,
    );

    // Format the floor names for display
    const sourceFloorFormatted =
      stairPolygon.floor.charAt(0).toUpperCase() +
      stairPolygon.floor.slice(1) +
      " Floor";
    const destFloorFormatted =
      destinationFloor.charAt(0).toUpperCase() +
      destinationFloor.slice(1) +
      " Floor";

    // Create the label with the correct text
    const stairInfo = `${sourceFloorFormatted} to ${destFloorFormatted}`;

    // Make the text more visible with larger background
    const labelSprite = makeTextSprite(stairInfo, {
      fontsize: 24, // Adjust size if needed
      fontface: "Arial",
      textColor: { r: 124, g: 58, b: 237, a: 1.0 },
      backgroundColor: { r: 255, g: 255, b: 255, a: 0.8 }, // More opaque background
      borderColor: { r: 124, g: 58, b: 237, a: 1.0 },
      borderThickness: 4,
      padding: 10, // Add padding to ensure text is fully visible
    });

    // Convert from "Ground Floor" format to "ground" format if needed
    if (destinationFloor.includes(" ")) {
      // Extract just the first word and convert to lowercase
      destinationFloor = destinationFloor.split(" ")[0].toLowerCase();
    }

    // Skip if we don't have valid floor data
    if (!floors[destinationFloor]) {
      console.warn(
        `Cannot create stair: destination floor ${destinationFloor} not found. Available floors: ${Object.keys(floors).join(", ")}`,
      );
      return objects;
    }

    // Create a Three.js Shape from the stair polygon points
    const shape = new THREE.Shape();
    if (stairPolygon.points.length < 3) return objects;

    // Start path at the first point
    const firstPoint = transform2DTo3D(stairPolygon.points[0]);
    shape.moveTo(firstPoint.x, firstPoint.y);

    // Add all points to the shape
    for (let i = 1; i < stairPolygon.points.length; i++) {
      const point = transform2DTo3D(stairPolygon.points[i]);
      shape.lineTo(point.x, point.y);
    }

    // Close the shape
    shape.lineTo(firstPoint.x, firstPoint.y);

    // Determine the z-positions (stairs always go up by default)
    let bottomZ, topZ;
    bottomZ = baseHeight + floorCeilingHeight;
    topZ = baseHeight + floorCeilingHeight + floorDeckThickness;
    
    // Enrich the stairPolygon with 3D position data to share with RoomSketchPro
    stairPolygon.position3D = {
      baseHeight: baseHeight,
      bottomZ: bottomZ,
      topZ: topZ
    };
    
    console.log(`🔢 STAIR 3D POSITION DATA: ${stairPolygon.id}`, {
      baseHeight,
      bottomZ,
      topZ
    });

    // Create extruded geometry for the stair
    const extrudeSettings = {
      steps: 1,
      depth: floorDeckThickness,
      bevelEnabled: false,
    };

    const stairGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const stairMaterial = new THREE.MeshPhongMaterial({
      color: isCurrentFloor ? 0x7c3aed : 0x8b5cf6, // Violet color to match 2D view
      opacity: isCurrentFloor ? 0.6 : 0.4,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const stairMesh = new THREE.Mesh(stairGeometry, stairMaterial);

    // Position the stair correctly in the z-axis
    stairMesh.position.z = bottomZ;

    // Add stair mesh to the objects array
    objects.push(stairMesh);

    // Create walls around the stair perimeter
    const wallHeight = topZ - bottomZ;

    // Create wall segments between each pair of points
    for (let i = 0; i < stairPolygon.points.length; i++) {
      const startPoint = stairPolygon.points[i];
      const endPoint =
        stairPolygon.points[(i + 1) % stairPolygon.points.length]; // Wrap around to first point

      const start_bottom = transform2DTo3D(startPoint, bottomZ);
      const end_bottom = transform2DTo3D(endPoint, bottomZ);
      const start_top = transform2DTo3D(startPoint, topZ);
      const end_top = transform2DTo3D(endPoint, topZ);

      const vertices = new Float32Array([
        start_bottom.x,
        start_bottom.y,
        start_bottom.z,
        end_bottom.x,
        end_bottom.y,
        end_bottom.z,
        start_top.x,
        start_top.y,
        start_top.z,
        end_top.x,
        end_top.y,
        end_top.z,
      ]);

      const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();

      const wallMaterial = new THREE.MeshPhongMaterial({
        color: isCurrentFloor ? 0x7c3aed : 0x8b5cf6, // Match stair color
        opacity: isCurrentFloor ? 0.4 : 0.3,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const wall = new THREE.Mesh(geometry, wallMaterial);
      objects.push(wall);
    }

    // Add a direction indicator (arrow) above the stair
    const arrowHeight = 30; // Height of the arrow above the stair

    // Calculate center point of the stair polygon
    const centerPoint = stairPolygon.points.reduce(
      (acc, point) => ({
        x: acc.x + point.x / stairPolygon.points.length,
        y: acc.y + point.y / stairPolygon.points.length,
      }),
      { x: 0, y: 0 },
    );

    const center3D = transform2DTo3D(centerPoint, topZ + arrowHeight);

    // Create a cone pointing in the direction of travel
    /* const coneGeometry = new THREE.ConeGeometry(15, 30, 16);
    const coneMaterial = new THREE.MeshPhongMaterial({
      color: isCurrentFloor ? 0x7c3aed : 0x8b5cf6,
      opacity: isCurrentFloor ? 0.8 : 0.6,
      transparent: true,
    });

    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(center3D.x, center3D.y, center3D.z);

    // Rotate based on direction
    if (stairPolygon.direction === "down") {
      cone.rotation.x = Math.PI; // Point downward
    } // Default is pointing up

    objects.push(cone);

    // Add label with stair information
    const stairInfo = `STAIR: ${stairPolygon.floor.toUpperCase()} to ${destinationFloor.toUpperCase()}`;
    const labelSprite = makeTextSprite(stairInfo, {
      fontsize: 34,
      fontface: "Arial",
      textColor: { r: 124, g: 58, b: 237, a: 1.0 }, // Violet color
      backgroundColor: { r: 255, g: 255, b: 255, a: 0.5 }, // Semi-transparent white
    });*/

    labelSprite.position.set(center3D.x, center3D.y, center3D.z + 20);
    objects.push(labelSprite);

    return objects;
  };

  // Create scene objects for a single floor
  const createFloorObjects = (
    floorData: FloorData,
    baseHeight: number,
    isCurrentFloor: boolean,
    floorCeilingHeight: number,
    floorDeckThickness: number,
  ) => {
    const objects: THREE.Object3D[] = [];
    const perimeterPoints = createRoomPerimeter(floorData.lines);

    // Check if we have stored updated positions for this floor - use the shared normalization function
    const normalizedFloorName = normalizeFloorName(floorData.name);


    // Try both possible keys for maximum compatibility during transition
    let updatedPositions = updatedAirEntryPositionsRef.current[normalizedFloorName] || {};

    // If nothing is found with the normalized name, try the original 'ground' key as fallback
    // This handles the existing data during transition
    if (Object.keys(updatedPositions).length === 0 && normalizedFloorName === 'groundfloor') {

        updatedPositions = updatedAirEntryPositionsRef.current['ground'] || {};
    }



    // Create floor and ceiling surfaces
    if (perimeterPoints.length > 2) {
      const shape = new THREE.Shape();
      const firstPoint = transform2DTo3D(perimeterPoints[0]);
      shape.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < perimeterPoints.length; i++) {
        const point = transform2DTo3D(perimeterPoints[i]);
        shape.lineTo(point.x, point.y);
      }
      shape.lineTo(firstPoint.x, firstPoint.y);

      // Floor surface with red tones from light to dark (bottom to top)
      const floorGeometry = new THREE.ShapeGeometry(shape);
      let floorColor = 0x808080; // Default gray
      const floorNameLower = floorData.name.toLowerCase();
      if (floorNameLower.includes('ground')) floorColor = 0xffcccc; // Light red for ground
      else if (floorNameLower.includes('first')) floorColor = 0xff6666; // Medium red for first floor
      else if (floorNameLower.includes('second')) floorColor = 0xff3333; // Dark red for second floor
      else if (floorNameLower.includes('third')) floorColor = 0x990000; // Very dark red for third floor
      
      const floorMaterial = new THREE.MeshPhongMaterial({
        color: floorColor,
        opacity: 0.5, // More opaque to see colors clearly
        transparent: true,
        side: THREE.DoubleSide,
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.z = baseHeight;
      floor.userData = { type: 'floor', floorName: floorData.name }; // CRITICAL for raycasting

      objects.push(floor);

      // Ceiling surface with violet tones from light to dark (bottom to top)
      const ceilingGeometry = new THREE.ShapeGeometry(shape);
      let ceilingColor = 0xe0e0e0; // Default light gray
      if (floorNameLower.includes('ground')) ceilingColor = 0xf0e6ff; // Very light violet for ground ceiling
      else if (floorNameLower.includes('first')) ceilingColor = 0xd9b3ff; // Light violet for first ceiling
      else if (floorNameLower.includes('second')) ceilingColor = 0xb366ff; // Medium violet for second ceiling
      else if (floorNameLower.includes('third')) ceilingColor = 0x8000ff; // Dark violet for third ceiling
      
      const ceilingMaterial = new THREE.MeshPhongMaterial({
        color: ceilingColor,
        opacity: 0.3, // Semi-transparent
        transparent: true,
        side: THREE.DoubleSide,
      });
      const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
      ceiling.position.z = baseHeight + floorCeilingHeight;
      ceiling.userData = { type: 'ceiling', floorName: floorData.name }; // For completeness

      objects.push(ceiling);
    }

    // Create walls
    floorData.lines.forEach((line) => {
      const start_bottom = transform2DTo3D(line.start, baseHeight);
      const end_bottom = transform2DTo3D(line.end, baseHeight);
      const start_top = transform2DTo3D(line.start, baseHeight + floorCeilingHeight);
      const end_top = transform2DTo3D(line.end, baseHeight + floorCeilingHeight);

      const vertices = new Float32Array([
        start_bottom.x,
        start_bottom.y,
        start_bottom.z,
        end_bottom.x,
        end_bottom.y,
        end_bottom.z,
        start_top.x,
        start_top.y,
        start_top.z,
        end_top.x,
        end_top.y,
        end_top.z,
      ]);

      const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();

      const wallMaterial = new THREE.MeshPhongMaterial({
        color: isCurrentFloor ? 0x3b82f6 : 0x4b92f6,
      // opacity: isCurrentFloor ? 0.5 : 0.3,
        opacity: wallTransparency,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const wall = new THREE.Mesh(geometry, wallMaterial);
      wall.userData = { type: 'wall', floorName: floorData.name };

      objects.push(wall);
    });

      // ========================================
      // CRITICAL: AIR ENTRY POSITIONING ALGORITHM
      // ========================================
      // This section contains the core logic for positioning air entries in 3D space
      // MUST BE IDENTICAL in RoomSketchPro for consistent visualization
      // Key functions: transform2DTo3D, wall normal calculations, positioning logic
      

      floorData.airEntries.forEach((entry, index) => {

        
        // Check if we have stored data for this entry (position and/or dimensions)
        const updatedEntryData = updatedPositions[index];


        // Create working copies of entry position and dimensions
        let entryPosition = { ...entry.position };
        let entryDimensions = { ...entry.dimensions };
        
        // Handle backward compatibility with old storage format
        if (updatedEntryData) {
          // Check if this is the old format (direct x/y properties) or new format (position/dimensions props)
          if ('x' in updatedEntryData && 'y' in updatedEntryData) {
            // Old format - just position data

            entryPosition = { x: updatedEntryData.x, y: updatedEntryData.y };
          } else if (updatedEntryData.position) {
            // New format - has position and maybe dimensions

            entryPosition = updatedEntryData.position;
            
            // If we also have dimensions, use those
            if (updatedEntryData.dimensions) {

              entryDimensions = updatedEntryData.dimensions;
            }
          }
        } else {

        }
        
        // Use dimensions directly as they are already in cm
        // Now use our possibly updated dimensions
        const width = entryDimensions.width;
        const height = entryDimensions.height;
        const zPosition =
          baseHeight +
          (entry.type === "door"
            ? height / 2
            : entryDimensions.distanceToFloor || 0);

        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshPhongMaterial({
          color:
            entry.type === "window"
              ? 0x3b82f6
              : entry.type === "door"
                ? 0xb45309
                : 0x22c55e,
          opacity: 0.7, // Fixed opacity at 70% regardless of current floor
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: false, // Disable depth testing to render on top
          depthWrite: false, // Disable depth writing
        });

        const mesh = new THREE.Mesh(geometry, material);
        const position = transform2DTo3D(entryPosition);
        mesh.position.set(position.x, position.y, zPosition);
        
        // Set render order to ensure AirEntry elements appear on top of walls
        mesh.renderOrder = 1;

        // Add userData for raycasting identification - include the actual entry index for easy mapping
        mesh.userData = {
          type: entry.type,
          position: entryPosition, // Use the potentially updated position
          dimensions: entryDimensions, // Use the potentially updated dimensions
          line: entry.line,
          index: objects.length,
          entryIndex: index  // Add the actual index in the airEntries array
        };

        // Calculate proper orientation
        const wallDir = new THREE.Vector3()
          .subVectors(
            transform2DTo3D(entry.line.end),
            transform2DTo3D(entry.line.start),
          )
          .normalize();
        const worldUp = new THREE.Vector3(0, 0, 1);
        const wallNormal = new THREE.Vector3()
          .crossVectors(wallDir, worldUp)
          .normalize();

        const forward = wallNormal.clone();
        const up = new THREE.Vector3(0, 0, 1);
        const right = new THREE.Vector3().crossVectors(up, forward).normalize();
        forward.crossVectors(right, up).normalize();
        const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, forward);
        mesh.setRotationFromMatrix(rotationMatrix);

      objects.push(mesh);

      // Add yellow sphere marker
      const markerGeometry = new THREE.SphereGeometry(5, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(position.x, position.y, zPosition);
      objects.push(marker);

      // Add coordinate system axes
      const axisLength = 50; // Length of the coordinate axes


      // Store the entry's index in airEntries array for direct reference
      const parentMeshIndex = objects.length - 1;


      // Create custom axis meshes that are better for intersection detection
      
      // Create the local coordinate system for this air entry:
      // - Z axis (blue) is normal to the wall surface (using the 'forward' vector) 
      // - Y axis (green) is vertical (pointing upward)
      // - X axis (red) is horizontal and perpendicular to Z (using the 2D perpendicular vector technique)
      
      // Z axis should point perpendicular to the wall (normal to the surface)
      // This is the "forward" vector in the mesh's orientation
      const zDirection = forward.clone();

      
      // Y axis is always vertical
      const verticalDirection = new THREE.Vector3(0, 0, 1);
      
      // Create X direction by rotating the Z-axis 90 degrees around the vertical axis
      // This ensures it's perpendicular to Z and in the floor plane
      const rotationAxis = new THREE.Vector3(0, 0, 1); // Vertical axis
      const xDirection = zDirection.clone()
        .applyAxisAngle(rotationAxis, Math.PI/2)
        .normalize();

      
      // Verify perpendicularity - dot product should be close to 0
      const dotProduct = xDirection.dot(zDirection);

      
      // X axis - Red (Perpendicular to both Y and Z axes)
      const xAxisGeometry = new THREE.CylinderGeometry(3, 3, axisLength, 8); // Increased thickness for visibility
      // We'll properly align the cylinder along its length instead of with rotation
      const xAxisMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 }); // Increased opacity
      const xAxis = new THREE.Mesh(xAxisGeometry, xAxisMaterial);
      
      // Get origin point at the air entry position
      const axisOrigin = new THREE.Vector3(position.x, position.y, zPosition);
      
      // Debug the axis origin and direction vectors


      
      // Calculate the endpoint of the axis
      const xAxisEndPoint = new THREE.Vector3(
        axisOrigin.x + axisLength * xDirection.x,
        axisOrigin.y + axisLength * xDirection.y,
        axisOrigin.z + axisLength * xDirection.z
      );
      
      // Calculate the midpoint between origin and endpoint
      const xAxisMidPoint = new THREE.Vector3().addVectors(axisOrigin, xAxisEndPoint).multiplyScalar(0.5);
      
      // Position the axis at the midpoint
      xAxis.position.copy(xAxisMidPoint);
      
      // Create direction vector from origin to endpoint
      const xAxisDirectionVector = new THREE.Vector3().subVectors(xAxisEndPoint, axisOrigin).normalize();
      
      // Use quaternion to rotate cylinder to align with direction vector
      // We need to align the cylinder's local Y-axis with our direction vector
      const xAxisUp = new THREE.Vector3(0, 1, 0); // Cylinder's default axis
      xAxis.quaternion.setFromUnitVectors(xAxisUp, xAxisDirectionVector);
      
      xAxis.userData = { 
        type: 'axis', 
        direction: 'x',
        parentEntryIndex: parentMeshIndex, // Reference to the parent mesh
        actualEntryIndex: index // Store the actual entry index from the floor data
      };

      // Y axis - Green (Vertical)
      const yAxisGeometry = new THREE.CylinderGeometry(3, 3, axisLength, 8); // Same thickness as X axis
      const yAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 }); // Increased opacity
      const yAxis = new THREE.Mesh(yAxisGeometry, yAxisMaterial);
      
      // Calculate the endpoint of the Y axis (vertical)
      const yAxisEndPoint = new THREE.Vector3(
        axisOrigin.x,
        axisOrigin.y,
        axisOrigin.z + axisLength
      );
      
      // Calculate the midpoint between origin and endpoint
      const yAxisMidPoint = new THREE.Vector3().addVectors(axisOrigin, yAxisEndPoint).multiplyScalar(0.5);
      
      // Position the axis at the midpoint
      yAxis.position.copy(yAxisMidPoint);
      
      // Create direction vector from origin to endpoint (vertical)
      // Use local variable name to avoid collision
      const yAxisDirection = new THREE.Vector3(0, 0, 1); // Always vertical
      
      // Use quaternion to rotate cylinder to align with Y direction
      const yAxisUp = new THREE.Vector3(0, 1, 0); // Cylinder's default axis
      yAxis.quaternion.setFromUnitVectors(yAxisUp, yAxisDirection);
      yAxis.userData = { 
        type: 'axis', 
        direction: 'y',
        parentEntryIndex: objects.length - 1
      };

      // Z axis - Blue (Normal to wall, pointing outward)
      const zAxisGeometry = new THREE.CylinderGeometry(3, 3, axisLength, 12); // Same thickness as X axis
      const zAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x0066ff, transparent: true, opacity: 0.3
                                                        }); // Brighter blue
      const zAxis = new THREE.Mesh(zAxisGeometry, zAxisMaterial);
      
      // Debug the Z axis direction vector

      
      // Calculate the endpoint of the Z axis
      const zAxisEndPoint = new THREE.Vector3(
        axisOrigin.x + axisLength * zDirection.x,
        axisOrigin.y + axisLength * zDirection.y,
        axisOrigin.z + axisLength * zDirection.z
      );
      
      // Calculate the midpoint between origin and endpoint
      const zAxisMidPoint = new THREE.Vector3().addVectors(axisOrigin, zAxisEndPoint).multiplyScalar(0.5);
      
      // Position the axis at the midpoint
      zAxis.position.copy(zAxisMidPoint);
      
      // Create direction vector from origin to endpoint
      const zAxisDirectionVector = new THREE.Vector3().subVectors(zAxisEndPoint, axisOrigin).normalize();
      
      // Use quaternion to rotate cylinder to align with direction vector
      const zAxisUp = new THREE.Vector3(0, 1, 0); // Cylinder's default axis
      zAxis.quaternion.setFromUnitVectors(zAxisUp, zAxisDirectionVector);
      
      zAxis.userData = { 
        type: 'axis', 
        direction: 'z',
        parentEntryIndex: objects.length - 1
      };

      // Add the axis meshes to the objects array
      objects.push(xAxis, yAxis, zAxis);

      // Add coordinate label
      const coordText = `(${Math.round(position.x)}, ${Math.round(position.y)}, ${Math.round(zPosition)}) cm`;
      const labelSprite = makeTextSprite(coordText, {
        fontsize: 28,
        fontface: "Arial",
        textColor: { r: 160, g: 160, b: 160, a: 1.0 },
        backgroundColor: { r: 255, g: 255, b: 255, a: 0.0 },
      });
      labelSprite.position.set(position.x, position.y, zPosition + 15);
      objects.push(labelSprite);
    });

    // Create stairs
    if (floorData.stairPolygons && floorData.stairPolygons.length > 0) {
      floorData.stairPolygons.forEach((stairPolygon) => {
        const stairObjects = createStairMesh(
          stairPolygon,
          baseHeight,
          isCurrentFloor,
          floorCeilingHeight,
        );
        objects.push(...stairObjects);
      });
    }

    // Create furniture items from props
    if (floorData.furnitureItems && floorData.furnitureItems.length > 0) {
      floorData.furnitureItems.forEach((furnitureItem) => {
        // Validate furniture item data before processing
        if (!furnitureItem || !furnitureItem.type || !furnitureItem.position) {
          return;
        }
        
        // Check if furniture already exists in scene to prevent duplicates
        let furnitureExists = false;
        if (sceneRef.current) {
          sceneRef.current.traverse((child) => {
            if (child.userData?.furnitureId === furnitureItem.id && child.userData?.type === 'furniture') {
              furnitureExists = true;
            }
          });
        }
        
        // Only create furniture if it doesn't already exist in scene
        if (!furnitureExists) {
          const furnitureModel = createFurnitureModel(furnitureItem, sceneRef.current!);
          if (furnitureModel) {
            objects.push(furnitureModel);
          }
        }
      });
    }

    return objects;
  };
  
  // Handle camera view changes when requested via props
  const handleViewChange = useCallback((direction: ViewDirection) => {
    if (!cameraRef.current || !controlsRef.current || !sceneRef.current) {
      console.log("Cannot change view - camera or controls not initialized");
      return;
    }
    
    // Get the center of the scene - use the current floor's base height
    const baseHeight = getFloorBaseHeight(currentFloor);
    const roomCenter = new THREE.Vector3(0, 0, baseHeight + (ceilingHeight / 2));
    
    // Calculate the bounding box of all visible objects to determine optimal view distance
    const boundingBox = new THREE.Box3();
    
    // Add all meshes to the bounding box calculation
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        // Skip helpers and invisible objects
        if (object.visible && 
            !object.userData?.isHelper && 
            !(object instanceof THREE.GridHelper) &&
            !(object instanceof THREE.AxesHelper)) {
          boundingBox.expandByObject(object);
        }
      }
    });
    
    // Calculate the size of the bounding box
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    
    // Use the largest dimension to determine view distance
    // Multiply by 2.2 to ensure everything is visible with a 10% margin
    const objectSize = Math.max(size.x, size.y, size.z);
    const distance = objectSize > 0 ? objectSize * 2.2 : 1000;
    
    console.log(`Changing camera view to ${direction}. Room center:`, roomCenter);
    console.log(`View distance: ${distance}, Room size:`, size);
    
    // Position the camera and set up its view based on the selected direction
    switch (direction) {
      case "+X":
        // Looking at X axis frontally with grid horizontal (looking from +X toward -X)
        // For +X view: Position on +X axis, with Z up (grid is horizontal in XY plane)
        cameraRef.current.position.set(distance, 0, roomCenter.z);
        cameraRef.current.up.set(0, 0, 1); // Z is up to keep grid horizontal
        break;
        
      case "-X":
        // Looking at X axis from behind with grid horizontal (looking from -X toward +X)
        // For -X view: Position on -X axis, with Z up (grid is horizontal in XY plane)
        cameraRef.current.position.set(-distance, 0, roomCenter.z);
        cameraRef.current.up.set(0, 0, 1); // Z is up to keep grid horizontal
        break;
        
      case "+Y":
        // Looking at Y axis frontally with grid horizontal (looking from +Y toward -Y)
        // For +Y view: Position on +Y axis, with Z up (grid is horizontal in XY plane)
        cameraRef.current.position.set(0, distance, roomCenter.z);
        cameraRef.current.up.set(0, 0, 1); // Z is up to keep grid horizontal
        break;
        
      case "-Y":
        // Looking at Y axis from behind with grid horizontal (looking from -Y toward +Y)
        // For -Y view: Position on -Y axis, with Z up (grid is horizontal in XY plane)
        cameraRef.current.position.set(0, -distance, roomCenter.z);
        cameraRef.current.up.set(0, 0, 1); // Z is up to keep grid horizontal
        break;
        
      case "+Z":
        // Top view - looking down from +Z toward -Z
        // X horizontal, Y vertical in view
        cameraRef.current.position.set(0, 0, roomCenter.z + distance);
        cameraRef.current.up.set(0, 1, 0); // Y is up for top view
        break;
        
      case "-Z":
        // Bottom view - looking up from -Z toward +Z
        // X horizontal, Y vertical in view
        cameraRef.current.position.set(0, 0, roomCenter.z - distance);
        cameraRef.current.up.set(0, -1, 0); // -Y is up (because we're looking from below)
        break;
    }
    
    // Look at the room center
    cameraRef.current.lookAt(roomCenter);
    
    // Update camera properties
    cameraRef.current.updateProjectionMatrix();
    
    // Reset the trackball controls to match this new camera view
    controlsRef.current.target.copy(roomCenter);
    controlsRef.current.update();
    
    // Force a render update
    if (rendererRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      // Set needs render flag to ensure the scene updates in the animation loop
      needsRenderRef.current = true;
    }
    
    console.log(`Camera view changed to ${direction}`);
  }, [ceilingHeight, currentFloor, getFloorBaseHeight]);
  
  // Connect the handleViewChange function to the onViewChange prop
  useEffect(() => {
    if (onViewChange && typeof onViewChange === 'function') {
      // Pass our local handleViewChange function to the parent component
      try {
        onViewChange(handleViewChange);
    
      } catch (err) {
        console.error("Error connecting view change handler:", err);
      }
    }
  }, [onViewChange, handleViewChange]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    // Initialize camera
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      1,
      10000,
    );
    camera.position.set(0, -1000, 1000);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Initialize renderer with error handling
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (error) {
      console.error('Failed to create WebGL renderer:', error);
      // Try without antialias as fallback
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false });
      } catch (fallbackError) {
        console.error('Failed to create WebGL renderer even without antialias:', fallbackError);
        // Show error message to user
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div style="
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              height: 100%; 
              background: #f3f4f6; 
              color: #374151;
              text-align: center;
              padding: 20px;
            ">
              <h3 style="margin-bottom: 10px;">3D Visualization Unavailable</h3>
              <p>Your browser doesn't support WebGL, which is required for 3D rendering.</p>
              <p style="font-size: 14px; margin-top: 10px;">Please try to refresh the page.</p>
            </div>
          `;
        }
        return;
      }
    }
    
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight,
    );
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const canvas = renderer.domElement;

    // Initialize controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.2;

    // Configure mouse buttons - don't use right button for controls
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY, // THREE.MOUSE.DOLLY instead of ZOOM for TrackballControls
      RIGHT: THREE.MOUSE.PAN // Enable right mouse panning in controls
    };
    // Add mechanism to disable controls during dragging
    controls.enabled = true;


    controlsRef.current = controls;

    // Add lights using centralized function
    setupLights(scene);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS);
    gridHelper.rotation.x = -Math.PI / 2;
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Check if axes helper already exists before adding a new one
    let axesHelperExists = false;
    let xLabelExists = false;
    let yLabelExists = false;
    let zLabelExists = false;
    
    // Check for existing axis elements to avoid duplicates
    scene.traverse((object) => {
      if (object instanceof THREE.AxesHelper) {
        axesHelperExists = true;
      }
      
      if (object.userData?.type === "axisLabel") {
        if (object.userData.axis === "x") xLabelExists = true;
        if (object.userData.axis === "y") yLabelExists = true;
        if (object.userData.axis === "z") zLabelExists = true;
      }
    });
    
    // Add coordinate axes only if they don't already exist
    if (!axesHelperExists) {
  
      const axesHelper = new THREE.AxesHelper(200);
      scene.add(axesHelper);
    } else {

    }
    
    // Add axis labels if they don't already exist
    const labelDistance = 100; // Position closer to the origin
    
    // X-axis label (red) - only create if it doesn't exist
    if (!xLabelExists) {
      const xLabel = makeTextSprite("X", {
        fontsize: 192, // Much larger font size
        fontface: "Arial",
        textColor: { r: 255, g: 0, b: 0, a: 1.0 },
        backgroundColor: { r: 255, g: 255, b: 255, a: 0.0 }, // No background
        borderColor: { r: 255, g: 0, b: 0, a: 0.0 }, // No border
        borderThickness: 0,
        padding: 10
      });
      xLabel.position.set(labelDistance, 0, 0);
      // Add userData so we can identify axis labels in the scene
      xLabel.userData = { type: "axisLabel", axis: "x" };
      scene.add(xLabel);
    } else {
      // Adjust position of existing label
      scene.traverse((object) => {
        if (object.userData?.type === "axisLabel" && object.userData.axis === "x") {
          object.position.set(labelDistance, 0, 0);
        }
      });
    }
    
    // Y-axis label (green) - only create if it doesn't exist
    if (!yLabelExists) {
      const yLabel = makeTextSprite("Y", {
        fontsize: 192, // Much larger font size
        fontface: "Arial",
        textColor: { r: 0, g: 255, b: 0, a: 1.0 },
        backgroundColor: { r: 255, g: 255, b: 255, a: 0.0 }, // No background
        borderColor: { r: 0, g: 255, b: 0, a: 0.0 }, // No border
        borderThickness: 0,
        padding: 10
      });
      yLabel.position.set(0, labelDistance, 0);
      // Add userData so we can identify axis labels in the scene
      yLabel.userData = { type: "axisLabel", axis: "y" };
      scene.add(yLabel);
    } else {
      // Adjust position of existing label
      scene.traverse((object) => {
        if (object.userData?.type === "axisLabel" && object.userData.axis === "y") {
          object.position.set(0, labelDistance, 0);
        }
      });
    }
    
    // Z-axis label (blue) - only create if it doesn't exist
    if (!zLabelExists) {
      const zLabel = makeTextSprite("Z", {
        fontsize: 192
        , // Much larger font size
        fontface: "Arial",
        textColor: { r: 0, g: 0, b: 255, a: 1.0 },
        backgroundColor: { r: 255, g: 255, b: 255, a: 0.0 }, // No background
        borderColor: { r: 0, g: 0, b: 255, a: 0.0 }, // No border
        borderThickness: 0,
        padding: 10
      });
      zLabel.position.set(0, 0, labelDistance);
      // Add userData so we can identify axis labels in the scene
      zLabel.userData = { type: "axisLabel", axis: "z" };
      scene.add(zLabel);
    } else {
      // Adjust position of existing label
      scene.traverse((object) => {
        if (object.userData?.type === "axisLabel" && object.userData.axis === "z") {
          object.position.set(0, 0, labelDistance);
        }
      });
    }

    // Find the animation loop in the initial scene setup useEffect
    // Look for this code:
    // const animate = () => {
    //   requestAnimationFrame(animate);
    //   controls.update();
    //   renderer.render(scene, camera);
    // };
    // animate();

      const animate = () => {
        requestAnimationFrame(animate);

        // Handle dragging with the ref-based approach
        const dragState = dragStateRef.current;
        if (dragState.isDragging && dragState.selectedObject && dragState.startPosition && 
            dragState.initialMousePosition && dragState.currentMousePosition) {

          // Calculate mouse delta in screen space
          const mouseDeltaX = dragState.currentMousePosition.x - dragState.initialMousePosition.x;
          const mouseDeltaY = dragState.currentMousePosition.y - dragState.initialMousePosition.y;
          
          // Determine drag magnitude - use the larger mouse movement component
          // and preserve its sign for direction
          const dragMagnitude = Math.abs(mouseDeltaX) > Math.abs(mouseDeltaY) ? 
            mouseDeltaX : -mouseDeltaY;  // Note: Y is negated because screen Y increases downward
          
          // Scale factor to convert screen pixels to scene units
          const scaleFactor = 4.0;
          
          // Calculate the displacement in the local axis
          const localDisplacement = dragMagnitude * scaleFactor;
          
          // Start with the original position
          const newPosition = dragState.startPosition.clone();
          
          // Apply movement based on selected axis in LOCAL coordinates,
          // transforming the local displacement to global coordinates
          if (dragState.selectedAxis === "x" && dragState.axisDirectionVectors.x) {
            // X-axis: Apply displacement along local X direction vector
            const localXDir = dragState.axisDirectionVectors.x;
            newPosition.x += localXDir.x * localDisplacement;
            newPosition.y += localXDir.y * localDisplacement;
            newPosition.z += localXDir.z * localDisplacement;
            

          } 
          else if (dragState.selectedAxis === "y") {
            // Y-axis: Always vertical in world space (along global Z)
            newPosition.z += localDisplacement;

          } 
          else if (dragState.selectedAxis === "z" && dragState.axisDirectionVectors.z) {
            // Z-axis: Apply displacement along local Z direction vector
            const localZDir = dragState.axisDirectionVectors.z;
            newPosition.x += localZDir.x * localDisplacement;
            newPosition.y += localZDir.y * localDisplacement;
            newPosition.z += localZDir.z * localDisplacement;
            

          }
          
          // Update the object's position
          dragState.selectedObject.position.copy(newPosition);

          // Always force a render during dragging
          needsRenderRef.current = true;
        }

      // Only update controls and render when needed
      if (controlsRef.current) {
        controlsRef.current.update();
        needsRenderRef.current = true; // Controls moving requires a render
      }
      // Apply visual feedback if selection state changed
      if (selectedAirEntry?.object && sceneRef.current) {
        highlightSelectedAirEntry(selectedAirEntry.object, true, isDragging);
        highlightSelectedAxis(
          sceneRef.current,
          selectedAirEntry.object,
          selectedAxis,
        );
        needsRenderRef.current = true; // Selection state changed, needs a render
      }

      // Apply hover effect
      if (sceneRef.current) {
        highlightHoveredArrow(
          sceneRef.current,
          hoveredArrow,
          selectedAirEntry,
          selectedAxis,
        );
        if (hoveredArrow) {
          needsRenderRef.current = true;
        }
      }
        // Render the scene if needed
        if (
          rendererRef.current &&
          sceneRef.current &&
          cameraRef.current &&
          (needsRenderRef.current || isEraserMode) // Force render every frame in eraser mode
        ) {
          // Always render during drag operations or eraser mode for smooth feedback
          const isDraggingNow = dragStateRef.current.isDragging;
          
        /*  // Log rendering reason
          if (isDraggingNow) {
            console.log("Rendering during drag operation");
          } else if (isEraserMode) {
            console.log("Force rendering in eraser mode for hover detection");
          }*/

          // Always render the scene
          rendererRef.current.render(sceneRef.current, cameraRef.current);

          // Only reset the needs render flag if we're not in a state that requires continuous rendering
          if (!isDraggingNow && !isEraserMode) {
            needsRenderRef.current = false;
          } else {
            // Make sure we keep rendering on the next frame
            needsRenderRef.current = true;
          }
        }
    };
    animate();

    // Notify RSP that scene is ready for texture modifications
    if (onSceneReady && presentationMode) {
      onSceneReady(scene, renderer, camera);
    }

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    // Handle right mouse button down
    // Helper function to get mouse coordinates for raycasting
    const getMouseCoordinates = (event: MouseEvent): THREE.Vector2 => {
      const canvas = containerRef.current;
      if (!canvas) return new THREE.Vector2(0, 0);

      const rect = canvas.getBoundingClientRect();
      const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      return new THREE.Vector2(mouseX, mouseY);
    };

    // Helper function to cast ray and find intersection point
    const getRaycastPoint = (mouseCoords: THREE.Vector2): THREE.Vector3 | null => {
      if (!cameraRef.current || !sceneRef.current) {
        console.log("getRaycastPoint: Camera or scene is null");
        return null;
      }

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseCoords, cameraRef.current);

      // Log all objects in the scene for raycasting
      let objectCount = 0;
      sceneRef.current.traverse((object) => {
        if (object.visible && (object instanceof THREE.Mesh || object instanceof THREE.Line)) {
          objectCount++;
        }
      });
      console.log(`getRaycastPoint: ${objectCount} objects available for raycasting`);

      // Intersect with all objects in the scene
      const intersects = raycaster.intersectObjects(sceneRef.current.children, true);

      console.log(`getRaycastPoint: Found ${intersects.length} intersections`);
      if (intersects.length > 0) {
        console.log(`getRaycastPoint: First intersection at point:`, intersects[0].point);
        console.log(`getRaycastPoint: Object type:`, intersects[0].object.type);
        if (intersects[0].object.userData) {
          console.log(`getRaycastPoint: Object userData:`, intersects[0].object.userData);
        }
        return intersects[0].point;
      }

      console.log("getRaycastPoint: No intersections found");
      return null;
    };

    // Renamed function to handle right clicks for measurements


    const handleMeasurementMouseDown = (event: MouseEvent) => {



      // Only process right mouse button (button code 2) when in measure mode (using ref)
      if (event.button !== 2 || !isMeasureModeRef.current || presentationMode) return;

      // Prevent default to avoid context menu during measurements
      event.preventDefault();
      event.stopPropagation();

      // Get mouse coordinates for raycasting
      const mouseCoords = getMouseCoordinates(event);

      // Get the intersection point in 3D space
      const intersectionPoint = getRaycastPoint(mouseCoords);

      if (intersectionPoint) {


        if (!measurementStateRef.current.inProgress) {
          // First click - set start point

          measurementStateRef.current.startPoint = intersectionPoint.clone();
          measurementStateRef.current.inProgress = true;

          // Still update React state for UI rendering
          setMeasureStartPoint(intersectionPoint);

          console.log("Measurement start point set:", measurementStateRef.current.startPoint);
        } else {
          // Second click - complete the measurement
          console.log("SECOND CLICK - Completing measurement");
          console.log("Start point:", measurementStateRef.current.startPoint);
          console.log("End point:", intersectionPoint);

          if (measurementStateRef.current.startPoint) {
            // Create the measurement using points from the ref
            addMeasurement(measurementStateRef.current.startPoint, intersectionPoint);
            console.log("Measurement completed");

            // Reset measurement state
            measurementStateRef.current.inProgress = false;
            measurementStateRef.current.startPoint = null;

            // Update React state as well (for UI consistency)
            setMeasureStartPoint(null);
            setMeasureEndPoint(null);
          }
        }
      }
    };

    const handleRightMouseDown = (event: MouseEvent) => {
      // Disable right-click interactions in presentation mode
      if (presentationMode) return;
      
      // Prevent the default context menu
      event.preventDefault();

      // Use the ref for reliable measure mode status
      console.log("RIGHT MOUSE DOWN - Checking measure mode:", {
        isMeasureModeRef: isMeasureModeRef.current,
        isMeasureMode: isMeasureMode
      });

      // Log current selection and drag state
      console.log("SELECTION STATE AT MOUSE DOWN:", {
        selectedAirEntry: selectedAirEntry ? {
          index: selectedAirEntry.index,
          type: selectedAirEntry.entry.type,
          position: selectedAirEntry.entry.position
        } : null,
        selectedAxis: selectedAxis,
        isDragging: isDragging,
        dragStateRef: {
          isDragging: dragStateRef.current.isDragging,
          selectedAxis: dragStateRef.current.selectedAxis,
          entryIndex: dragStateRef.current.entryIndex
        }
      });

      // Use the ref to determine if we're in measure mode
      if (isMeasureModeRef.current) {
        console.log("DIVERTING TO MEASUREMENT HANDLER");
        handleMeasurementMouseDown(event);
        return;
      }

      console.log("Right mouse down detected"); // This should NOT print in measure mode

      // If we're in measure mode, handle measurement instead of regular operations
      if (isMeasuring) {
        handleMeasurementMouseDown(event);
        return;
      }

      // Only process right mouse button (button code 2) for normal operations
      if (event.button !== 2) return;

      // Get mouse position for raycasting
      const canvas = containerRef.current;
      if (!canvas || !cameraRef.current || !sceneRef.current) return;

      const mouseCoords = getMouseCoordinates(event);

      // Set up raycaster
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseCoords, cameraRef.current);

      // Find all meshes in the scene that represent air entries or their axes
      const airEntryMeshes: THREE.Mesh[] = [];
      const axesHelpers: THREE.Object3D[] = [];

      // Debug logging for raycasting
      console.log("Right mouse down detected");

      console.log("Starting scene traversal for raycasting targets");
      let meshCount = 0;
      let arrowCount = 0;
      let otherObjectCount = 0;

      sceneRef.current.traverse((object) => {
        meshCount++;

        // Log object type and info
        if (object instanceof THREE.Mesh) {
          console.log(
            `Found mesh: ${object.uuid.substring(0, 8)}`,
            `userData:`,
            object.userData,
            `type:`,
            object.userData?.type || "none",
          );
        } else if (object instanceof THREE.ArrowHelper) {
          console.log(
            `Found ArrowHelper: ${object.uuid.substring(0, 8)}`,
            `userData:`,
            object.userData,
          );
          arrowCount++;
        } else {
          otherObjectCount++;
        }

        // Collect air entry meshes
        if (
          object instanceof THREE.Mesh &&
          object.userData &&
          object.userData.type &&
          ["window", "door", "vent"].includes(object.userData.type)
        ) {
          console.log("✅ Adding to airEntryMeshes");
          airEntryMeshes.push(object as THREE.Mesh);
        }

        // Collect axis objects (either ArrowHelper or custom Mesh)
        if (
          (object instanceof THREE.ArrowHelper ||
            (object instanceof THREE.Mesh &&
              object.userData?.type === "axis")) &&
          (object.userData?.direction === "x" ||
            object.userData?.direction === "y" ||
            object.userData?.direction === "z")
        ) {
          console.log("✅ Adding to axesHelpers");
          axesHelpers.push(object);
        }
      });



      // First check for intersections with axes
      const axesIntersects = raycaster.intersectObjects(axesHelpers, false);

      if (axesIntersects.length > 0) {
        const axisObject = axesIntersects[0].object;
        console.log('Axis clicked:', axisObject.userData);

        // Get axis type from userData
        const axisDirection = axisObject.userData?.direction;

        if (axisDirection === 'x' || axisDirection === 'y' || axisDirection === 'z') {
                  // Find the parent air entry for this axis
                  let closestAirEntry: THREE.Mesh | null = null;
                  let closestDistance = Infinity;

                  // Find the closest air entry to this axis
                  airEntryMeshes.forEach((mesh) => {
                    const distance = mesh.position.distanceTo(axisObject.position);
                    if (distance < closestDistance) {
                      closestDistance = distance;
                      closestAirEntry = mesh;
                    }
                  });

                  // Ensure we found a close enough air entry
                  if (!closestAirEntry || closestDistance > 60) {
                    console.error("No air entry found near this axis, distance:", closestDistance);
                    return;
                  }

                  console.log("Found closest air entry at distance:", closestDistance);

                  // Set the axis for movement in the React state (for UI highlighting)
                  setSelectedAxis(axisDirection as "x" | "y" | "z");

                  // Cast to our mesh interface for more specific typing
                  const typedAirEntry = closestAirEntry as AirEntryMesh;
                  // Store which air entry we're manipulating with proper typing
                  const airEntryData = typedAirEntry.userData;
                  
                  // Add type safety check
                  if (!airEntryData || !airEntryData.position) {
                    console.error("Missing position data in air entry");
                    return;
                  }

                  const floorData = floors[currentFloor];

                  if (floorData && floorData.airEntries) {
                    // First try to use the entryIndex from userData if available
                    let index = -1;

                    if (airEntryData.entryIndex !== undefined) {
                      // Use the stored index if it's valid
                      if (airEntryData.entryIndex >= 0 && airEntryData.entryIndex < floorData.airEntries.length) {
                        const storedEntry = floorData.airEntries[airEntryData.entryIndex];
                        // Double-check by position
                        if (storedEntry.position.x === airEntryData.position.x && 
                            storedEntry.position.y === airEntryData.position.y) {
                          index = airEntryData.entryIndex;
                          console.log("Using stored entry index:", index);
                        }
                      }
                    }

                    // Fall back to position-based search if needed
                    if (index === -1) {
                      console.log("POSITION SEARCH - Looking for:", {
                        airEntryType: airEntryData.type,
                        airEntryDataPos: airEntryData.position,
                        actualEntryIndex: axisObject.userData?.actualEntryIndex, // Try to use the actual entry index if stored
                        parentEntryIndex: axisObject.userData?.parentEntryIndex,
                        availableEntries: floorData.airEntries.map((entry, idx) => ({
                          index: idx,
                          position: entry.position,
                          type: entry.type
                        }))
                      });

                      // BETTER APPROACH 1: First try to use the actualEntryIndex from the axis userData if available
                      // This is the most reliable way since it's explicitly set when creating the axis
                      if (typeof axisObject.userData?.actualEntryIndex === 'number') {
                        const entryIdx = axisObject.userData.actualEntryIndex;
                        if (entryIdx >= 0 && entryIdx < floorData.airEntries.length) {
                          // Verify it exists in the floorData
                          index = entryIdx;
                          console.log("Found air entry using actualEntryIndex:", index);
                        }
                      }

                      // BETTER APPROACH 2: If actualEntryIndex fails, try using the parentEntryIndex to find the real parent mesh
                      if (index === -1 && axisObject.userData?.parentEntryIndex !== undefined) {
                        const parentObjIndex = axisObject.userData.parentEntryIndex;
                        console.log("Looking for parent mesh with index:", parentObjIndex);

                        // Find the parent mesh using our defined AirEntryMesh interface
                        let parentMesh: AirEntryMesh | null = null;
                        sceneRef.current?.traverse((object) => {
                          if (object instanceof THREE.Mesh && 
                              object.userData && 
                              object.userData.type && 
                              ["window", "door", "vent"].includes(object.userData.type as string)) {
                            const meshAsAirEntry = object as AirEntryMesh;
                            if (meshAsAirEntry.userData.index === parentObjIndex) {
                              // Cast the object to our interface type
                              parentMesh = meshAsAirEntry;
                            }
                          }
                        });

                        // Since we've defined AirEntryMesh interface, this should work properly
                        if (parentMesh) {
                          // Use the parent mesh's entryIndex
                          const parentEntryIndex = parentMesh.userData.entryIndex;
                          if (typeof parentEntryIndex === 'number' && 
                              parentEntryIndex >= 0 && 
                              parentEntryIndex < floorData.airEntries.length) {
                            index = parentEntryIndex;
                            console.log("Found entry using parent mesh:", index);
                          }
                        }
                      }

                      // FALLBACK APPROACH: Only if both direct methods fail, try position-based search
                      // Log each entry's position to check for near matches
                      if (index === -1) {
                        floorData.airEntries.forEach((entry, idx) => {
                          const xDiff = Math.abs(entry.position.x - airEntryData.position.x);
                          const yDiff = Math.abs(entry.position.y - airEntryData.position.y);
                          console.log(`Entry ${idx} position diff: x=${xDiff}, y=${yDiff}`, {
                            entry: entry.position,
                            toMatch: airEntryData.position,
                            exactMatch: entry.position.x === airEntryData.position.x && entry.position.y === airEntryData.position.y,
                            closeMatch: xDiff < 1 && yDiff < 1
                          });
                        });

                        // Try exact match first
                        index = floorData.airEntries.findIndex(
                          (entry) =>
                            entry.position.x === airEntryData.position.x &&
                            entry.position.y === airEntryData.position.y,
                        );
                        console.log("Found entry index by exact position search:", index);

                        // If exact match fails, try approximate match with a larger threshold
                        if (index === -1) {
                          // Increase the position tolerance to handle larger differences
                          // This is much more forgiving than before (64 units in your case)
                          const POSITION_TOLERANCE = 70; // Increased from 1 to handle large discrepancies

                          index = floorData.airEntries.findIndex(
                            (entry) =>
                              Math.abs(entry.position.x - airEntryData.position.x) < POSITION_TOLERANCE &&
                              Math.abs(entry.position.y - airEntryData.position.y) < POSITION_TOLERANCE
                          );
                          console.log("Found entry index by approximate position search (with higher tolerance):", index);
                        }
                      }
                    }

                    if (index !== -1) {
                  // Update React state for UI
                  setSelectedAirEntry({
                    index: index,
                    entry: floorData.airEntries[index],
                    object: closestAirEntry,
                  });

                  // Update React state for UI
                  setDragStartPosition(
                    new THREE.Vector3(
                      (closestAirEntry as THREE.Mesh).position.x,
                      (closestAirEntry as THREE.Mesh).position.y,
                      (closestAirEntry as THREE.Mesh).position.z,
                    ),
                  );

                  // Update React state for UI
                  setInitialMousePosition({
                    x: event.clientX,
                    y: event.clientY,
                  });

                  // Start dragging - update React state for UI
                  setIsDragging(true);

                  // Find the air entry object in the scene to get the local axis vectors
                  // Need to use the actual entry index as the reference for finding axis objects
                  const entryIndexForAxis = index; // Use the entry index we just found
                  
                  const meshes = scene.children.filter(child => 
                    child instanceof THREE.Mesh && 
                    child.userData && 
                    child.userData.type === "axis" && 
                    child.userData.actualEntryIndex === entryIndexForAxis
                  ) as THREE.Mesh[];

                  // Extract direction vectors from the mesh transforms
                  let xAxisDirection = new THREE.Vector3(1, 0, 0);
                  let yAxisDirection = new THREE.Vector3(0, 0, 1); // Y axis is vertical in our system
                  let zAxisDirection = new THREE.Vector3(0, 1, 0);

                  // Try to find the axis meshes and extract their direction vectors
                  meshes.forEach(mesh => {
                    if (mesh.userData.direction === "x") {
                      // Extract world direction of X axis from mesh orientation
                      const worldDirection = new THREE.Vector3();
                      mesh.getWorldDirection(worldDirection);
                      // The cylinder is along the Y axis by default, so we need the up vector
                      xAxisDirection.set(worldDirection.x, worldDirection.y, 0).normalize();

                    }
                    else if (mesh.userData.direction === "z") {
                      // Extract world direction of Z axis from mesh orientation
                      const worldDirection = new THREE.Vector3();
                      mesh.getWorldDirection(worldDirection);
                      zAxisDirection.set(worldDirection.x, worldDirection.y, 0).normalize();

                    }
                  });

                  // IMPORTANT: Update the ref for actual dragging logic
                  dragStateRef.current = {
                    isDragging: true,
                    selectedAxis: axisDirection as "x" | "y" | "z",
                    startPosition: new THREE.Vector3(
                      (closestAirEntry as THREE.Mesh).position.x,
                      (closestAirEntry as THREE.Mesh).position.y,
                      (closestAirEntry as THREE.Mesh).position.z
                    ),
                    initialMousePosition: {
                      x: event.clientX,
                      y: event.clientY
                    },
                    currentMousePosition: {
                      x: event.clientX,
                      y: event.clientY
                    },
                    selectedObject: closestAirEntry,
                    entryIndex: index,
                    axisDirectionVectors: {
                      x: xAxisDirection,
                      y: yAxisDirection,
                      z: zAxisDirection
                    }
                  };

                  // Immediately disable controls when dragging starts
                  if (controlsRef.current) {
                    controlsRef.current.enabled = false;
                  }

              console.log("Started dragging with axis:", axisDirection);
              console.log("Started dragging", { axis: axisDirection });

              // Log detailed drag state at drag start
              console.log("DRAG STATE INITIALIZED:", {
                axis: dragStateRef.current.selectedAxis,
                isDragging: dragStateRef.current.isDragging,
                entryIndex: dragStateRef.current.entryIndex,
                selectedObject: dragStateRef.current.selectedObject ? "exists" : "null",
                reactState: {
                  selectedAirEntry: selectedAirEntry ? {
                    index: selectedAirEntry.index,
                    type: selectedAirEntry.entry.type,
                  } : null,
                  selectedAxis,
                  isDragging
                }
              });
            }
            }
            }
            } else {
            // Check for intersections with air entry meshes if no axis was clicked
            console.log(
            "Testing intersection with",
            airEntryMeshes.length,
            "air entries",
            );
            const meshIntersects = raycaster.intersectObjects(
            airEntryMeshes,
            false,
            );


      console.log("Mesh intersections found:", meshIntersects.length);

      if (meshIntersects.length > 0) {
        const mesh = meshIntersects[0].object as THREE.Mesh;
        const airEntryData = mesh.userData;

        // Just select the air entry but don't start dragging
        const floorData = floors[currentFloor];

        if (floorData && floorData.airEntries) {
          const index = floorData.airEntries.findIndex(
            (entry) =>
              entry.position.x === airEntryData.position.x &&
              entry.position.y === airEntryData.position.y,
          );

          if (index !== -1) {
            setSelectedAirEntry({
              index: index,
              entry: floorData.airEntries[index],
              object: mesh,
            });

            // We're selecting but not yet dragging
            setSelectedAxis(null);

            // Make sure controls are enabled when just selecting without dragging
            if (controlsRef.current) {
              controlsRef.current.enabled = true;
            }
          }
        }
      } else {
        console.log("Mesh intersections:", meshIntersects.length);
        // Clicked on empty space, clear selection
        setSelectedAirEntry(null);
        setSelectedAxis(null);

        // Enable camera controls for panning with right-click
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }
      }
    }
    };

    // ========================================
    // INTERACTION LOGIC - EVENT HANDLERS
    // ========================================
    // These functions handle user interactions and state mutations
    // NOT extractable for shared use (contains side effects)
    
    const handleMouseMove = (event: MouseEvent) => {
      // Track mouse direction movement for debugging
      const dx = event.clientX - lastMousePositionRef.current.x;
      const dy = event.clientY - lastMousePositionRef.current.y;
      const directionX = dx > 0 ? "RIGHT" : dx < 0 ? "LEFT" : "";
      const directionY = dy > 0 ? "DOWN" : dy < 0 ? "UP" : "";
      

      
      // Update the last position
      lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
      
      // Update debug info for UI display
      const mouseCoords = getMouseCoordinates(event);
      
      // Use the ref to get the current eraser mode value, which is always up-to-date
      const currentEraserMode = isEraserModeRef.current;
      
      // Add more detailed debug logging

      
      setDebugInfo(prev => ({
        ...prev,
        mousePosition: `${event.clientX}, ${event.clientY} | Normalized: ${mouseCoords.x.toFixed(2)}, ${mouseCoords.y.toFixed(2)}`,
        eraserMode: currentEraserMode || false // Ensure it's always a boolean value to fix type error
      }));
      
      // Handle measurement preview if in measuring mode and we have a start point
      if (isMeasuring && measureStartPoint) {
        const intersectionPoint = getRaycastPoint(mouseCoords);

        if (intersectionPoint) {
          // Update the temporary measurement line
          updateActiveMeasurement(measureStartPoint, intersectionPoint);
        }

        // Always force a render during measurement
        needsRenderRef.current = true;
        return;
      }
      
      // Handle hover detection for eraser mode - using ref to ensure we have the current value
      if (isEraserModeRef.current && !dragStateRef.current.isDragging) {
        // Log TrackballControls state
        const controlsState = controlsRef.current ? {
          enabled: controlsRef.current.enabled,
          // Use button state to determine if controls are being used
          buttons: event.buttons // 0 = no buttons, 1 = left, 2 = right, 4 = middle
        } : 'No controls';
        

        
        // Skip hover detection if mouse buttons are being held down
        if (event.buttons !== 0) {
          console.log("⏩ Skipping hover detection during active mouse button press");
          return;
        }
        
        console.log("🔍 Eraser mode hover detection active - looking for air entries to highlight");
        
        // We already have mouseCoords from the beginning of handleMouseMove
        console.log(`Mouse coordinates (normalized): ${mouseCoords.x.toFixed(2)}, ${mouseCoords.y.toFixed(2)}`);
        
        // Get detailed client info
        const clientInfo = {
          event: {
            type: event.type,
            clientX: event.clientX,
            clientY: event.clientY,
            button: event.button,
            buttons: event.buttons,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey
          },
          container: containerRef.current ? {
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
            rect: containerRef.current.getBoundingClientRect()
          } : null
        };

        
        // Log some info about what's available
        if (sceneRef.current) {
          let airEntryCount = 0;
          const airEntryDetails: string[] = [];
          const airEntryBoundingBoxes: any[] = [];
          
          sceneRef.current.traverse((object) => {
            if (
              object instanceof THREE.Mesh &&
              object.userData &&
              object.userData.type &&
              ["window", "door", "vent"].includes(object.userData.type)
            ) {
              airEntryCount++;
              // Calculate screen position
              const worldPos = object.position.clone();
              const screenPos = worldPos.project(cameraRef.current!);
              
              // Convert to screen coordinates
              const screenX = (screenPos.x + 1) / 2 * window.innerWidth;
              const screenY = -(screenPos.y - 1) / 2 * window.innerHeight;
              
              // Get object bounding box
              const boundingBox = new THREE.Box3().setFromObject(object);
              const size = new THREE.Vector3();
              boundingBox.getSize(size);
              
              airEntryDetails.push(`${object.userData.type} at screen position (${screenX.toFixed(0)}, ${screenY.toFixed(0)}), world position ${JSON.stringify(object.position)}`);
              airEntryBoundingBoxes.push({
                type: object.userData.type,
                userData: object.userData,
                position: object.position,
                boundingBox: { 
                  min: boundingBox.min,
                  max: boundingBox.max,
                  size: size
                }
              });
            }
          });
          

        }
        

        
        // Reset previously highlighted element if any
        if (hoveredEraseTarget) {

          // Restore original material
          hoveredEraseTarget.object.material = hoveredEraseTarget.originalMaterial;
          setHoveredEraseTarget(null);
          
          // Re-enable controls when not hovering over an erasable element
          if (controlsRef.current) {
            controlsRef.current.enabled = true;
          }
          
          // Force render to update the appearance
          needsRenderRef.current = true;
        }
        
        // Find potential erase targets
        const airEntryMeshes: THREE.Mesh[] = [];
        
        if (sceneRef.current) {
          sceneRef.current.traverse((object) => {
            // Collect air entry meshes (windows, doors, vents)
            if (
              object instanceof THREE.Mesh &&
              object.userData &&
              object.userData.type &&
              ["window", "door", "vent"].includes(object.userData.type)
            ) {
              // We won't automatically enlarge all objects now - we'll only enlarge them
              // when they're actually under the mouse cursor
              airEntryMeshes.push(object as THREE.Mesh);
            }
          });
          
          console.log(`Found ${airEntryMeshes.length} potential air entries for eraser hover detection`);
          
          // Detect when no air entries are available
          if (airEntryMeshes.length === 0 && hoveredEraseTarget) {
            console.log("⚠️ No air entries found in scene but we have a hovered target - cleaning up");
            
            // Restore original material
            hoveredEraseTarget.object.material = hoveredEraseTarget.originalMaterial;
            
            // Restore original scale if applicable
            if (hoveredEraseTarget.object.userData?.originalScale) {
              hoveredEraseTarget.object.scale.copy(hoveredEraseTarget.object.userData.originalScale);
              
              // Force update to the geometry
              if (hoveredEraseTarget.object.geometry) {
                hoveredEraseTarget.object.geometry.computeBoundingSphere();
                hoveredEraseTarget.object.geometry.computeBoundingBox();
              }
            }
            
            // Clear the hover target
            setHoveredEraseTarget(null);
            
            // Re-enable controls
            if (controlsRef.current) {
              console.log("🎮 Re-enabling TrackballControls after scene reset");
              controlsRef.current.enabled = true;
            }
            
            needsRenderRef.current = true;
          }
          
          // Set up raycaster
          if (cameraRef.current) {
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouseCoords, cameraRef.current);
            
            // Apply precision configuration for accurate eraser mode detection
            applyRaycasterConfig(raycaster, 'precision');
            
            // Make sure we're using recursive flag = true to catch child objects too
            const meshIntersects = raycaster.intersectObjects(airEntryMeshes, true);
            
            // Raycaster configuration is now handled centrally
            
            // Enhanced debugging for air entry intersections
            console.log(`Found ${meshIntersects.length} intersections with air entries`);
            
            // Log detailed info about available air entry meshes
            console.log(`DEBUG: Eraser mode hover detection - ${airEntryMeshes.length} air entries in scene`);
            airEntryMeshes.forEach((mesh, i) => {
              console.log(`Air Entry #${i}: type=${mesh.userData.type}, position=${JSON.stringify(mesh.position)}, worldPosition=${JSON.stringify(mesh.getWorldPosition(new THREE.Vector3()))}`);
              
              // Output mesh bounding box for debugging
              const boundingBox = new THREE.Box3().setFromObject(mesh);
              console.log(`  Bounding box: min=(${boundingBox.min.x.toFixed(2)}, ${boundingBox.min.y.toFixed(2)}, ${boundingBox.min.z.toFixed(2)}), max=(${boundingBox.max.x.toFixed(2)}, ${boundingBox.max.y.toFixed(2)}, ${boundingBox.max.z.toFixed(2)})`);
            });
            
            // Update debug info whether we have intersections or not
            const hasIntersections = meshIntersects.length > 0;
            
            // Add screen-space logging if we have a hoveredEraseTarget
            if (hoveredEraseTarget && cameraRef.current) {
              const screenPos = hoveredEraseTarget.object.position.clone().project(cameraRef.current);
              const screenX = (screenPos.x + 1) / 2 * window.innerWidth;
              const screenY = -(screenPos.y - 1) / 2 * window.innerHeight;
              
              console.log(`📌 Highlighted object screen position: (${screenX.toFixed(0)}, ${screenY.toFixed(0)})`);
              console.log(`📌 Mouse position: (${event.clientX}, ${event.clientY})`);
              console.log(`📌 Distance: ${Math.sqrt(Math.pow(screenX - event.clientX, 2) + Math.pow(screenY - event.clientY, 2)).toFixed(1)}px`);
            }
            
            setDebugInfo(prev => ({
              ...prev,
              hovering: hasIntersections,
              lastIntersection: hasIntersections
                ? `${meshIntersects[0].object.userData.type} (entry ${meshIntersects[0].object.userData.entryIndex}) at ${Math.round(meshIntersects[0].distance)}` 
                : 'None'
            }));
            
            // If there are no intersections and we have a previously hovered target, reset it
            if (!hasIntersections && hoveredEraseTarget) {
              console.log("🔄 Clearing previous highlight - no intersection found");
              
              try {
                // Restore original material if it exists
                if (hoveredEraseTarget.originalMaterial) {
                  hoveredEraseTarget.object.material = hoveredEraseTarget.originalMaterial;
                  console.log("  - Restored original material for element");
                } else {
                  console.log("⚠️ No original material found for object, can't restore");
                }
                
                // Restore original scale if applicable
                if (hoveredEraseTarget.object.userData?.originalScale) {
                  hoveredEraseTarget.object.scale.copy(hoveredEraseTarget.object.userData.originalScale);
                  
                  // Force update to the geometry
                  if (hoveredEraseTarget.object.geometry) {
                    hoveredEraseTarget.object.geometry.computeBoundingSphere();
                    hoveredEraseTarget.object.geometry.computeBoundingBox();
                  }
                  console.log("  - Restored original scale for element");
                }
                
                // CRITICAL: Ensure controls are re-enabled immediately when hovering ends
                if (controlsRef.current) {
                  console.log("🎮 Re-enabling TrackballControls after cursor moved away from element");
                  controlsRef.current.enabled = true;
                  // Force controls update on the next frame
                  if (typeof controlsRef.current.update === 'function') {
                    controlsRef.current.update();
                  }
                }
                
                // Reset cursor to eraser mode cursor (not auto, since we're still in eraser mode)
                if (containerRef.current) {
                  containerRef.current.style.cursor = 'not-allowed'; // Keep eraser cursor
                  console.log("  - Reset cursor to eraser mode style");
                }
                
                needsRenderRef.current = true;
                
                // Force immediate render to update visuals
                if (rendererRef.current && sceneRef.current && cameraRef.current) {
                  rendererRef.current.render(sceneRef.current, cameraRef.current);
                }
              } catch (err) {
                console.error("Error while clearing previous highlight:", err);
              }
              
              // Clear the hover target - do this last after all other processing
              setHoveredEraseTarget(null);
              
              // Force explicit verification of state update with callback
              setTimeout(() => {
                console.log("🔍 Verifying hover target cleared:", hoveredEraseTarget ? "STILL PRESENT" : "Successfully cleared");
                if (hoveredEraseTarget) {
                  console.error("CRITICAL ERROR: Hover target not cleared after setState call");
                }
              }, 0);
            }
            
            if (hasIntersections) {
              console.log("Intersection found! Highlighting element");
              const mesh = meshIntersects[0].object as THREE.Mesh;
              console.log("Mesh data for eraser hover:", mesh.userData);
              
              // If we're already hovering over a different object, restore it first
              if (hoveredEraseTarget && hoveredEraseTarget.object !== mesh) {
                console.log("🔄 Switching hover target to new element");
                
                try {
                  // Restore original material if it exists
                  if (hoveredEraseTarget.originalMaterial) {
                    hoveredEraseTarget.object.material = hoveredEraseTarget.originalMaterial;
                    console.log("  - Restored original material for previous element");
                  } else {
                    console.log("⚠️ No original material found for previous object");
                  }
                  
                  // Restore original scale if applicable
                  if (hoveredEraseTarget.object.userData?.originalScale) {
                    hoveredEraseTarget.object.scale.copy(hoveredEraseTarget.object.userData.originalScale);
                    
                    // Force update to the geometry
                    if (hoveredEraseTarget.object.geometry) {
                      hoveredEraseTarget.object.geometry.computeBoundingSphere();
                      hoveredEraseTarget.object.geometry.computeBoundingBox();
                    }
                    
                    console.log(`  - Restored scale for previously hovered ${hoveredEraseTarget.object.userData.type}`);
                  }
                } catch (err) {
                  console.error("Error while cleaning up previous hover target:", err);
                }
              }
              
              // Store original material and apply highlight material
              const originalMaterial = mesh.material;
              
              // Create new highlight material (uses a combination of techniques for maximum visibility)
              // 1. Create a bright MeshBasicMaterial to ensure visibility regardless of lighting
              const highlightMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,    // Bright red
                wireframe: false,   // Solid material as base
                transparent: true,
                opacity: 0.9,       // Slightly transparent
                side: THREE.DoubleSide,
                depthTest: false,   // Ignore depth test - show through walls
                depthWrite: false   // Don't write to depth buffer
              });
              
              console.log("🎨 Created highlight material:", highlightMaterial);
              
              // Add extra logging to ensure the material is correctly applied
              console.log("👁️ Current visibility of mesh:", mesh.visible);
              mesh.visible = true; // Force visibility
              
              // Apply highlight material
              mesh.material = highlightMaterial;
              
              // Store original scale if not already stored
              if (!mesh.userData.originalScale) {
                mesh.userData.originalScale = mesh.scale.clone();
              }
              
              // Make the hovered mesh larger for better visibility but not too large
              // Reduce from 3.0 to 2.0 to ensure better matching between visual and collision detection
              // This helps prevent the case where cursor appears to be on element but raycaster detects it's not
              mesh.scale.set(2.0, 2.0, 2.0);
              
              // Force update to the geometry
              if (mesh.geometry) {
                mesh.geometry.computeBoundingSphere();
                mesh.geometry.computeBoundingBox();
                
                // Add debug visualization for hitbox
                if (process.env.NODE_ENV === 'development') {
                  try {
                    // Create a visualization of the hitbox/bounding box for debugging
                    const box = new THREE.Box3().setFromObject(mesh);
                    const boxHelper = new THREE.Box3Helper(box, new THREE.Color(0xff00ff));
                    boxHelper.userData = { type: 'debug-helper', target: mesh.uuid };
                    
                    // Remove any existing debug helpers for this object
                    if (sceneRef.current) {
                      sceneRef.current.traverse((obj) => {
                        if (obj.userData?.type === 'debug-helper' && 
                            obj.userData?.target === mesh.uuid) {
                          sceneRef.current?.remove(obj);
                        }
                      });
                      
                      // Add the new helper
                      sceneRef.current.add(boxHelper);
                      console.log(`Added debug hitbox visualization for ${mesh.userData.type}`);
                    }
                  } catch (err) {
                    console.error("Error creating debug hitbox visualization:", err);
                  }
                }
              }
              
              console.log(`Made hovered ${mesh.userData.type} larger for better visibility`);
              
              // Store the highlighted object and its original material
              setHoveredEraseTarget({
                object: mesh,
                originalMaterial: originalMaterial
              });
              
              // CRITICAL: Disable controls when hovering over an erasable element
              if (controlsRef.current) {
                // Log control state before disabling
                console.log("📊 TrackballControls state before disabling:", {
                  enabled: controlsRef.current.enabled,
                  position: controlsRef.current.object.position.clone(),
                  target: controlsRef.current.target.clone()
                });
                
                // Simply disable the controls - don't recreate them
                // This preserves the control state and makes re-enabling easier
                controlsRef.current.enabled = false;
                
                console.log("🎮 Disabled TrackballControls");
                
                // Force controls to update their state immediately
                if (typeof controlsRef.current.update === 'function') {
                  controlsRef.current.update();
                }
              }
              
              // Force render to update the appearance
              needsRenderRef.current = true;
            }
          }
        }
      }

      // Regular drag logic
      if (dragStateRef.current.isDragging) {
        // Store the current mouse position
        dragStateRef.current.currentMousePosition = {
          x: event.clientX,
          y: event.clientY
        };

        // Make sure we need to render
        needsRenderRef.current = true;

        // No position updates here - let the animation loop handle it
      }


        // Flag that we need to re-render
        needsRenderRef.current = true;
        // Force immediate render on drag movement
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }

      // Add hover detection logic
      else {
        // Only do hover detection if we're not dragging
        const canvas = containerRef.current;
        if (!canvas || !cameraRef.current || !sceneRef.current) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Set up raycaster
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(
          new THREE.Vector2(mouseX, mouseY),
          cameraRef.current,
        );

        // Find all axis objects in the scene (both ArrowHelpers and custom axis meshes)
        const axisObjects: THREE.Object3D[] = [];
        sceneRef.current.traverse((object) => {
          if (
            object instanceof THREE.ArrowHelper || 
            (object instanceof THREE.Mesh && object.userData?.type === 'axis')
          ) {
            axisObjects.push(object);
          }
        });

        // Check for intersections with all axis objects
        const intersects = raycaster.intersectObjects(axisObjects, true);

        if (intersects.length > 0) {
          const hitObject = intersects[0].object;

          // Handle mesh axes
          if (hitObject instanceof THREE.Mesh && hitObject.userData?.type === 'axis') {
            const axisDirection = hitObject.userData.direction;
            if (axisDirection === 'x' || axisDirection === 'y' || axisDirection === 'z') {
              console.log("Hovering over axis mesh:", axisDirection);
              // Create a temporary ArrowHelper to use with existing hover logic
              const dummyArrow = new THREE.ArrowHelper(
                new THREE.Vector3(1, 0, 0),
                hitObject.position,
                1
              );
              dummyArrow.userData = hitObject.userData;

              // Set hovered arrow
              setHoveredArrow({ 
                object: dummyArrow, 
                type: axisDirection as "x" | "y" | "z" 
              });

              // Change cursor style
              canvas.style.cursor = "pointer";
              return;
            }
          }

          // Handle regular ArrowHelper (keep your existing code)
          let arrowObject = hitObject;
          while (
            arrowObject.parent &&
            !(arrowObject instanceof THREE.ArrowHelper)
          ) {
            arrowObject = arrowObject.parent;
          }

          if (arrowObject instanceof THREE.ArrowHelper) {
            // Your existing code for ArrowHelper
            const arrowLine = arrowObject.line as THREE.Line;
            const material = arrowLine.material as THREE.LineBasicMaterial;
            const colorHex = material.color.getHex();

            let arrowType: "x" | "y" | "z";
            if (colorHex === 0xff0000) arrowType = "x";
            else if (colorHex === 0x00ff00) arrowType = "y";
            else if (colorHex === 0x0000ff) arrowType = "z";
            else return;

            // Set hovered arrow
            setHoveredArrow({ object: arrowObject, type: arrowType });

            // Change cursor style
            canvas.style.cursor = "pointer";
            return;
          }
        }

        // No arrow under mouse
        if (hoveredArrow) {
          setHoveredArrow(null);
          canvas.style.cursor = "auto";
        }
      }
    };

      const handleMouseUp = (event: MouseEvent) => {
        // Only process right mouse button releases when we're dragging
        if (event.button !== 2) {
          return;  // Don't reset dragging for non-right clicks
        }

        // Check if we were dragging from the ref
        if (!dragStateRef.current.isDragging || 
            !dragStateRef.current.selectedObject || 
            !dragStateRef.current.selectedAxis) {
          // Clean up just in case
          setIsDragging(false);
          dragStateRef.current.isDragging = false;

          // Re-enable controls
          if (controlsRef.current) {
            controlsRef.current.enabled = true;
          }
          return;
        }

        // Finalize the position change using ref values
        if (dragStateRef.current.selectedObject && onUpdateAirEntry) {
          // Get the current floor data
          const floorData = floors[currentFloor];
          const entryIndex = dragStateRef.current.entryIndex;

          // Ensure we have valid index
          if (floorData && floorData.airEntries && entryIndex >= 0 && entryIndex < floorData.airEntries.length) {
            const currentEntry = floorData.airEntries[entryIndex];

            // Convert the 3D position back to 2D
            const newPosition3D = dragStateRef.current.selectedObject.position;

            // Update the air entry position using centralized config
            // Reverse the transform2DTo3D function
            const newX = newPosition3D.x / PIXELS_TO_CM + CANVAS_CONFIG.centerX;
            const newY = CANVAS_CONFIG.centerY - newPosition3D.y / PIXELS_TO_CM;

            // Create updated entry with new position
            const updatedEntry: AirEntry = {
              ...currentEntry,
              position: { x: newX, y: newY },
            };

            // If we moved vertically, update distance to floor
            if (dragStateRef.current.selectedAxis === "z") {
              const baseHeight = getFloorBaseHeight(currentFloor);
              const newDistanceToFloor = newPosition3D.z - baseHeight;

              if (updatedEntry.type !== "door") {
                updatedEntry.dimensions = {
                  ...updatedEntry.dimensions,
                  distanceToFloor: newDistanceToFloor,
                };
              }
            }

            // Call the update callback
            onUpdateAirEntry(currentFloor, entryIndex, updatedEntry);

            // IMPORTANT: Keep track of the updated entries to prevent them from resetting
            // We store a mapping of entryIndex -> position to check against when scene rebuilds

            // Normalize the floor name using the shared function
            const normalizedFloorName = normalizeFloorName(currentFloor);

            // Create storage location with normalized key if it doesn't exist
            if (!updatedAirEntryPositionsRef.current[normalizedFloorName]) {
              updatedAirEntryPositionsRef.current[normalizedFloorName] = {};
            }

            // Store the latest position for this entry index under the normalized key (main storage)
            // See if we already have an entry with dimensions
            if (!updatedAirEntryPositionsRef.current[normalizedFloorName][entryIndex]) {
              // Create a new entry with just the position
              updatedAirEntryPositionsRef.current[normalizedFloorName][entryIndex] = {
                position: {
                  x: updatedEntry.position.x,
                  y: updatedEntry.position.y
                }
              };
            } else {
              // Update just the position and preserve any existing dimensions
              updatedAirEntryPositionsRef.current[normalizedFloorName][entryIndex].position = {
                x: updatedEntry.position.x,
                y: updatedEntry.position.y
              };
            }

            // For backward compatibility with existing code, also store under 'ground' key 
            // if this is the ground floor (transitional approach)
            if (normalizedFloorName === 'groundfloor') {
              if (!updatedAirEntryPositionsRef.current['ground']) {
                updatedAirEntryPositionsRef.current['ground'] = {};
              }
              
              // Legacy format for backward compatibility:
              // Keep this simple format for backward compatibility
              updatedAirEntryPositionsRef.current['ground'][entryIndex] = {
                position: {
                  x: updatedEntry.position.x,
                  y: updatedEntry.position.y
                }
              };
            }

            // CRITICAL FIX: Update the userData with the new position
            // This ensures that future position searches can find this object
            if (dragStateRef.current.selectedObject) {
              // Update the userData position immediately for the dragged object
              dragStateRef.current.selectedObject.userData.position = { ...updatedEntry.position };

              // Also update entryIndex to ensure it's correct for next time
              dragStateRef.current.selectedObject.userData.entryIndex = entryIndex;
            }
          }
        }

        // Reset the React state for UI
        setIsDragging(false);
        setInitialMousePosition(null);
        // Reset selection state after drag is complete
        setSelectedAirEntry(null);
        setSelectedAxis(null);

        // Reset the drag state ref completely
        dragStateRef.current = {
          isDragging: false,
          selectedAxis: null,
          startPosition: null,
          initialMousePosition: null,
          currentMousePosition: null,
          selectedObject: null,
          entryIndex: -1,
          axisDirectionVectors: {
            x: null,
            y: null,
            z: null
          }
        };

        // PREVENTATIVE CONTROL RECREATION
        // Instead of just re-enabling controls, completely recreate them
        if (controlsRef.current && cameraRef.current && containerRef.current) {
          // Store current camera position and target
          const position = controlsRef.current.object.position.clone();
          const target = controlsRef.current.target.clone();

          // Dispose of the old controls
          controlsRef.current.dispose();

          // Create new controls with the same camera and canvas
          const newControls = new TrackballControls(cameraRef.current, containerRef.current.querySelector('canvas'));

          // Copy all the properties from the initial setup
          newControls.rotateSpeed = 2.0;
          newControls.zoomSpeed = 1.2;
          newControls.panSpeed = 0.8;
          newControls.noZoom = false;
          newControls.noPan = false;
          newControls.staticMoving = true;
          newControls.dynamicDampingFactor = 0.2;
          newControls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
          };

          // Restore position and target
          newControls.object.position.copy(position);
          newControls.target.copy(target);

          // Make sure controls are enabled
          newControls.enabled = true;

          // Update the reference
          controlsRef.current = newControls;
        } else {
          // Fall back to just enabling the controls if recreation isn't possible
          if (controlsRef.current) {
            controlsRef.current.enabled = true;
          }
        }

        // Dragging stopped, selection and states reset
    };

    // Now add the event listeners

    // Clear and specific event binding
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Handle eraser clicks
    const handleEraserClick = (event: MouseEvent) => {
      // Disable eraser in presentation mode
      if (presentationMode) return;
      
      // Only handle when in eraser mode - using ref for reliable state
      if (!isEraserModeRef.current || !onDeleteAirEntry) {
  
        return;
      }
      
      console.log("🔴 Eraser click detected in Canvas3D");
      setDebugInfo(prev => ({
        ...prev,
        lastIntersection: "Processing eraser click..."
      }));
      
      // Check if controls are disabled - this is an indicator that we're hovering over an element
      const areControlsDisabled = controlsRef.current && !controlsRef.current.enabled;

      

      
      // Debug what is hovered

      
      // If we have a hovered target, use that directly rather than raycasting again
      if (hoveredEraseTarget) {
        const mesh = hoveredEraseTarget.object;
        const airEntryData = mesh.userData;
        
        // Enlarged visuals didn't turn back to normal size automatically in the case of a click
        // So we need to restore the scale here
        if (mesh.userData.originalScale) {
          // Store original scale for cleanup afterwards
          const originalScale = mesh.userData.originalScale;
          
          // Schedule a cleanup after deletion
          setTimeout(() => {
            // We may still need to traverse the scene to find the enlarged meshes and restore them
            if (sceneRef.current) {
              sceneRef.current.traverse((object) => {
                if (
                  object instanceof THREE.Mesh &&
                  object.userData?.originalScale
                ) {
                  // Restore original scale
                  object.scale.copy(object.userData.originalScale);
                  
                  // Remove the originalScale property to reset state for next time
                  delete object.userData.originalScale;
                  
                  // Update geometry after scaling back
                  if (object.geometry) {
                    object.geometry.computeBoundingSphere();
                    object.geometry.computeBoundingBox();
                  }
                  
                  console.log("Cleaned up scale for a mesh after eraser click");
                }
              });
            }
          }, 50); // Short timeout to let the deletion happen first
        }
        
        console.log("✅ Using highlighted air entry for deletion:", airEntryData);
        setDebugInfo(prev => ({
          ...prev,
          lastIntersection: `Deleting ${airEntryData.type} at entry index ${airEntryData.entryIndex}`
        }));
        
        console.log("Air entry selected for deletion:", airEntryData);
        
        // Find the index of this air entry in the floors data
        let foundIndex = -1;
        const floorData = floors[currentFloor];
        
        if (floorData && floorData.airEntries) {
          // First try to use the stored entryIndex if available (most reliable)
          if (typeof airEntryData.entryIndex === 'number') {
            if (airEntryData.entryIndex >= 0 && airEntryData.entryIndex < floorData.airEntries.length) {
              foundIndex = airEntryData.entryIndex;
              console.log("Found air entry using stored entryIndex:", foundIndex);
            }
          }
          
          // Fall back to position search if needed
          if (foundIndex === -1 && airEntryData.position) {
            // Try exact match first
            foundIndex = floorData.airEntries.findIndex(
              (entry) =>
                entry.position.x === airEntryData.position.x &&
                entry.position.y === airEntryData.position.y
            );
            
            // If exact match fails, try approximate match with tolerance
            if (foundIndex === -1) {
              const POSITION_TOLERANCE = 70;
              foundIndex = floorData.airEntries.findIndex(
                (entry) =>
                  Math.abs(entry.position.x - airEntryData.position.x) < POSITION_TOLERANCE &&
                  Math.abs(entry.position.y - airEntryData.position.y) < POSITION_TOLERANCE
              );
              console.log("Found air entry by approximate position match:", foundIndex);
            }
          }
          
          if (foundIndex !== -1) {
            console.log("Deleting air entry at index:", foundIndex);
            onDeleteAirEntry(currentFloor, foundIndex);
            
            // Clean up any references in our state
            if (selectedAirEntry && selectedAirEntry.index === foundIndex) {
              setSelectedAirEntry(null);
              setSelectedAxis(null);
              setIsDragging(false);
            }
            
            // Remove from updatedAirEntryPositionsRef if it exists
            const normalizedFloorName = normalizeFloorName(currentFloor);
            if (updatedAirEntryPositionsRef.current[normalizedFloorName]?.[foundIndex]) {
              delete updatedAirEntryPositionsRef.current[normalizedFloorName][foundIndex];
            }
            
            // Reset hover state after deletion
            setHoveredEraseTarget(null);
            
            // Force a complete render
            needsRenderRef.current = true;
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
              rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
            
            // Re-enable controls after deletion
            if (controlsRef.current) {
              controlsRef.current.enabled = true;
            }
          }
        }
      } else {
        // If no hover target is detected but controls are disabled, do a direct raycast to try to find something
        if (areControlsDisabled) {
          console.log("Controls disabled but no hover target, attempting direct raycast");
          
          // Extract mouse position from event
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          
          const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          
          // Set up raycaster
          const raycaster = new THREE.Raycaster();
          raycaster.params.Line = { threshold: 0.5 }; // Use lower threshold for precise detection
          raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current!);
          
          // Check for intersections
          const intersects = raycaster.intersectObjects(sceneRef.current!.children, true);
          
          // Filter to only include air entries
          const airEntryIntersects = intersects.filter(intersect => 
            intersect.object.userData?.type === 'window' || 
            intersect.object.userData?.type === 'door' || 
            intersect.object.userData?.type === 'vent'
          );
          
          if (airEntryIntersects.length > 0) {
            const firstIntersect = airEntryIntersects[0];
            console.log("Direct raycast found air entry to delete:", firstIntersect.object.userData);
            
            // Use the same code as above to handle deletion
            const airEntryData = firstIntersect.object.userData;
            let foundIndex = -1;
            
            if (typeof airEntryData.entryIndex === 'number') {
              if (airEntryData.entryIndex >= 0 && airEntryData.entryIndex < floorData.airEntries.length) {
                foundIndex = airEntryData.entryIndex;
              }
            }
            
            if (foundIndex !== -1) {
              console.log("Deleting air entry at index:", foundIndex);
              onDeleteAirEntry(currentFloor, foundIndex);
              
              // Clean up any references in our state
              if (selectedAirEntry && selectedAirEntry.index === foundIndex) {
                setSelectedAirEntry(null);
                setSelectedAxis(null);
                setIsDragging(false);
              }
              
              // Re-enable controls after deletion
              if (controlsRef.current) {
                controlsRef.current.enabled = true;
              }
            }
          }
        }
      }
    };

    // Handle mousedown events - only in interactive mode
    const mouseDownWrapper = (e: MouseEvent) => {
      if (presentationMode) return; // Disable editing in presentation mode
      
      if (e.button === 2) {
        // Right mouse button for both measurements and context operations
        handleRightMouseDown(e);
      } else if (e.button === 0 && isEraserModeRef.current) {
        // Left mouse button in eraser mode
        handleEraserClick(e);
      }
    };

    canvas.addEventListener("mousedown", mouseDownWrapper);

    // Create named handlers for event tracking - only in interactive mode
    const mouseMoveHandler = (e: MouseEvent) => {
      if (presentationMode) return; // Disable editing in presentation mode
      handleMouseMove(e);
    };

    const mouseUpHandler = (e: MouseEvent) => {
      if (presentationMode) return; // Disable editing in presentation mode
      handleMouseUp(e);
    };

    // Use document instead of window for more reliable event capture
    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);

    // We don't need periodic checking anymore since we're preventatively recreating controls after each drag

    // All event listeners are now attached


    // Add double-click handler for air entry editing - only in interactive mode
    const handleDoubleClick = (event: MouseEvent) => {
      if (presentationMode) return; // Disable editing in presentation mode
      
      // Set flag to ignore the next click (which is part of the double-click)
      setIgnoreNextClick(true);

      // Get mouse position for raycasting
      const canvas = containerRef.current;
      if (!canvas || !cameraRef.current || !sceneRef.current) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Set up raycaster
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(
        new THREE.Vector2(mouseX, mouseY),
        cameraRef.current,
      );

      // Find all meshes in the scene that represent air entries
      const airEntryMeshes: THREE.Mesh[] = [];
      sceneRef.current.traverse((object) => {
        if (
          object instanceof THREE.Mesh &&
          object.userData &&
          object.userData.type &&
          ["window", "door", "vent"].includes(object.userData.type)
        ) {
          airEntryMeshes.push(object as THREE.Mesh);
        }
      });

      // Check for intersections with air entry meshes
      const intersects = raycaster.intersectObjects(airEntryMeshes, false);

      if (intersects.length > 0) {
        const mesh = intersects[0].object as THREE.Mesh;
        const airEntryData = mesh.userData;

        // Find the index of this air entry in the floors data
        let foundIndex = -1;
        const floorData = floors[currentFloor];

        if (floorData && floorData.airEntries) {
          console.log("Double-click position search:", {
            airEntryData: airEntryData,
            entryPosition: airEntryData.position,
            storedEntryIndex: airEntryData.entryIndex
          });

          // First try to use the stored entryIndex if available (most reliable)
          if (typeof airEntryData.entryIndex === 'number') {
            if (airEntryData.entryIndex >= 0 && airEntryData.entryIndex < floorData.airEntries.length) {
              foundIndex = airEntryData.entryIndex;
              console.log("Double-click found entry using stored entryIndex:", foundIndex);
            }
          }

          // Fall back to position search if needed
          if (foundIndex === -1) {
            // Try exact match first
            foundIndex = floorData.airEntries.findIndex(
              (entry) =>
                entry.position.x === airEntryData.position.x &&
                entry.position.y === airEntryData.position.y,
            );

            // If exact match fails, try approximate match with larger tolerance
            if (foundIndex === -1) {
              const POSITION_TOLERANCE = 70; // Match the value used in handleRightMouseDown
              foundIndex = floorData.airEntries.findIndex(
                (entry) =>
                  Math.abs(entry.position.x - airEntryData.position.x) < POSITION_TOLERANCE &&
                  Math.abs(entry.position.y - airEntryData.position.y) < POSITION_TOLERANCE
              );
              console.log("Double-click found entry by approximate position (with higher tolerance):", foundIndex);
            }
          }

          if (foundIndex !== -1) {
            // Get the base entry from floor data
            const baseEntry = floorData.airEntries[foundIndex];
            
            // Check if we have updated dimensions for this entry in our ref
            const normalizedFloorName = normalizeFloorName(currentFloor);
            const updatedData = updatedAirEntryPositionsRef.current[normalizedFloorName]?.[foundIndex];
            
            // Create a merged entry with the latest dimensions
            const mergedEntry = {
              ...baseEntry,
              dimensions: updatedData?.dimensions || baseEntry.dimensions
            };
            
            setEditingAirEntry({
              index: foundIndex,
              entry: mergedEntry,
            });
          }
        }
      }
    };

    // Add the double-click event listener
    canvas.addEventListener("dblclick", handleDoubleClick);

    return () => {
      window.removeEventListener("resize", handleResize);

      if (controls) {
        controls.dispose();
      }

      if (renderer) {
        // Remove all event listeners
        renderer.domElement.removeEventListener("contextmenu", (e) =>
          e.preventDefault(),
        );
        renderer.domElement.removeEventListener(
          "mousedown",
          mouseDownWrapper,
        );
        renderer.domElement.removeEventListener("dblclick", handleDoubleClick);

        // Dispose renderer
        renderer.dispose();

        // Remove canvas
        if (containerRef.current) {
          containerRef.current.removeChild(renderer.domElement);
        }
      }

      // Remove global event listeners
      document.removeEventListener("mousemove", mouseMoveHandler);
      document.removeEventListener("mouseup", mouseUpHandler);
    };
  }, []);

  useEffect(() => {


    // Don't reset selection state here - we'll handle it after rebuilding the scene
    // This prevents losing the selection when the scene is updated

    // Check specifically for stair polygons
    Object.entries(floors).forEach(([floorName, floorData]) => {
      if (floorData.stairPolygons?.length) {
        console.log(
          `Floor ${floorName} has ${floorData.stairPolygons.length} stair polygons:`,
          floorData.stairPolygons,
        );
      }
    });

    if (!sceneRef.current) return;

    // Clear previous geometry (except lights, helpers, and axis labels)
    const toRemove: THREE.Object3D[] = [];
    sceneRef.current.traverse((object) => {
      // Skip axis labels - we want to preserve them during scene rebuilds
      if (object.userData?.type === "axisLabel") {

        return;
      }
      
      // Skip axis helper
      if (object instanceof THREE.AxesHelper) {

        return;
      }
      
      // Remove all other meshes, sprites, and arrow helpers
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Sprite ||
        object instanceof THREE.ArrowHelper
      ) {
        toRemove.push(object);
      }
    });
    

    toRemove.forEach((object) => sceneRef.current?.remove(object));

    // Create and add objects for each floor
    Object.entries(floors).forEach(([floorName, floorData]) => {
      if (floorData.hasClosedContour || floorName === currentFloor) {
        const baseHeight = getFloorBaseHeight(floorName);
        
        // Get specific parameters for this floor
        let floorCeilingHeight, currentFloorDeckThickness;
        if (isMultifloor && floorParameters[floorName]) {
          // Use multifloor parameters specific to this floor
          floorCeilingHeight = floorParameters[floorName].ceilingHeight;
          currentFloorDeckThickness = floorParameters[floorName].floorDeck;
        } else {
          // Use global parameters for single-floor mode
          floorCeilingHeight = ceilingHeight;
          currentFloorDeckThickness = floorDeckThickness;
        }
        
        const objects = createFloorObjects(
          floorData,
          baseHeight,
          floorName === currentFloor,
          floorCeilingHeight,
          currentFloorDeckThickness,
        );
        objects.forEach((obj) => sceneRef.current?.add(obj));
      }
    });
    
    // Update SceneContext with ALL floors data for comprehensive sharing with RoomSketchPro

    
    // First, update the entire floors object in the context
    updateGeometryData({
      floors: floors,
      currentFloor: currentFloor,
      floorSize: GRID_SIZE,
      gridSize: GRID_DIVISIONS
    });
    
    // Then set current floor data for immediate use
    const currentFloorData = floors[currentFloor];

    
    if (currentFloorData) {

      
      // Update current floor in context (this will trigger setCurrentFloor in the context)
      setContextCurrentFloor(currentFloor);
      
      // Also individually update each floor to ensure proper synchronization
      Object.entries(floors).forEach(([floorName, floorData]) => {
        updateFloorData(floorName, floorData);
      });
      
      // Update scene objects in context
      if (sceneRef.current) {
        // Find walls, floor, and air entries to expose in context
        const walls: THREE.Object3D[] = [];
        let floor: THREE.Object3D | undefined;
        const airEntries: THREE.Object3D[] = [];
        
        sceneRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh && object.userData.type === 'floor') {
            floor = object;
          } else if (object instanceof THREE.Mesh && object.userData.type === 'wall') {
            walls.push(object);
          } else if (object instanceof THREE.Mesh && 
                    (object.userData.type === 'window' || 
                     object.userData.type === 'door' || 
                     object.userData.type === 'vent')) {
            airEntries.push(object);
          }
        });
        
        updateSceneData({
          walls,
          floor,
          airEntries,
          gridHelper: sceneRef.current.children.find(
            (obj) => obj instanceof THREE.GridHelper
          )
        });
      }
    }

    // After rebuilding the scene, we need to restore or reset selection state
    if (selectedAirEntry) {
      // Try to find the new mesh object for our selected air entry
      const currentFloorData = floors[currentFloor];
      if (currentFloorData && currentFloorData.airEntries) {
        const entryIndex = selectedAirEntry.index;

        // Only proceed if the entry index is still valid
        if (entryIndex >= 0 && entryIndex < currentFloorData.airEntries.length) {
          const entry = currentFloorData.airEntries[entryIndex];

          // Try to find the corresponding mesh in the scene
          let found = false;
          let newMeshObject: THREE.Mesh | null = null;

          // Search the scene for the mesh with matching position
          if (sceneRef.current) {
            sceneRef.current.traverse((object) => {
              if (
                object instanceof THREE.Mesh &&
                object.userData &&
                object.userData.type &&
                ["window", "door", "vent"].includes(object.userData.type) &&
                object.userData.position
              ) {
                // Compare positions to find our air entry
                const entryPos = object.userData.position;
                if (
                  Math.abs(entryPos.x - entry.position.x) < 0.1 &&
                  Math.abs(entryPos.y - entry.position.y) < 0.1
                ) {
                  newMeshObject = object;
                  found = true;
                  console.log("Found matching mesh for selected air entry after scene rebuild");
                }
              }
            });
          }

          if (found && newMeshObject) {
            // Update the selected air entry with the new mesh object
            setSelectedAirEntry({
              index: entryIndex,
              entry: entry,
              object: newMeshObject,
            });

            // Apply visual feedback
            highlightSelectedAirEntry(newMeshObject, true, isDragging);

            if (sceneRef.current && selectedAxis) {
              highlightSelectedAxis(
                sceneRef.current,
                newMeshObject,
                selectedAxis,
              );
            }
          } else {
            // If we couldn't find the matching object, reset selection
            console.log("Could not find matching mesh for selected air entry, resetting selection");
            setSelectedAirEntry(null);
            setSelectedAxis(null);
            setIsDragging(false);
            dragStateRef.current = {
              isDragging: false,
              selectedAxis: null,
              startPosition: null,
              initialMousePosition: null,
              currentMousePosition: null,
              selectedObject: null,
              entryIndex: -1,
              axisDirectionVectors: {
                x: null,
                y: null,
                z: null
              }
            };
          }
        } else {
          // Entry no longer exists, reset selection
          setSelectedAirEntry(null);
          setSelectedAxis(null);
          setIsDragging(false);
          dragStateRef.current = {
            isDragging: false,
            selectedAxis: null,
            startPosition: null,
            initialMousePosition: null,
            currentMousePosition: null,
            selectedObject: null,
            entryIndex: -1,
            axisDirectionVectors: {
              x: null,
              y: null,
              z: null
            }
          };
        }
      } else {
        // Current floor data not found, reset selection
        setSelectedAirEntry(null);
        setSelectedAxis(null);
        setIsDragging(false);
        dragStateRef.current = {
          isDragging: false,
          selectedAxis: null,
          startPosition: null,
          initialMousePosition: null,
          currentMousePosition: null,
          selectedObject: null,
          entryIndex: -1,
          axisDirectionVectors: {
            x: null,
            y: null,
            z: null
          }
        };
      }
    } else {
      // No previous selection, make sure states are reset
      setSelectedAxis(null);
      setIsDragging(false);
      setInitialMousePosition(null);
      setDragStartPosition(null);
      dragStateRef.current = {
        isDragging: false,
        selectedAxis: null,
        startPosition: null,
        initialMousePosition: null,
        currentMousePosition: null,
        selectedObject: null,
        entryIndex: -1,
        axisDirectionVectors: {
          x: null,
          y: null,
          z: null
        }
      };
    }
  }, [floors, currentFloor, ceilingHeight, floorDeckThickness]);

  useEffect(() => {
    // Mark that rendering is needed when selection or dragging state changes
    if (needsRenderRef.current !== undefined) {
      needsRenderRef.current = true;


      // Disable controls during dragging
      if (controlsRef.current) {
        controlsRef.current.enabled = !isDragging;
      }
    }
  }, [selectedAirEntry, selectedAxis, isDragging]);

  useEffect(() => {
    // If dialog opens, cancel any dragging operation
    if (editingAirEntry) {
      setIsDragging(false);
      setSelectedAxis(null);
    }
  }, [editingAirEntry]);

  // Update lighting intensity in real-time for presentation mode
  useEffect(() => {
    if (sceneRef.current && presentationMode && lightingIntensity !== undefined) {
      // Find and update ambient light
      const ambientLight = sceneRef.current.children.find(
        child => child instanceof THREE.AmbientLight
      ) as THREE.AmbientLight;
      
      if (ambientLight) {
        ambientLight.intensity = lightingIntensity;
      }

      // Find and update directional lights
      const directionalLights = sceneRef.current.children.filter(
        child => child instanceof THREE.DirectionalLight
      ) as THREE.DirectionalLight[];
      
      if (directionalLights.length >= 3) {
        directionalLights[0].intensity = lightingIntensity * 0.33;
        directionalLights[1].intensity = lightingIntensity * 0.22;
        directionalLights[2].intensity = lightingIntensity * 0.22;
      }

      // Force render update
      needsRenderRef.current = true;
    }
  }, [lightingIntensity, presentationMode]);

  // Effect to update wall transparency when the prop changes
  // Measurement utility functions

  // Create a measurement line between two points
  const createMeasurementLine = (start: THREE.Vector3, end: THREE.Vector3): THREE.Line => {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({ 
      color: 0xff0000, // Red color for measurement lines
      linewidth: 2,
      depthTest: false, // Ensure line is visible through other objects
    });
    return new THREE.Line(geometry, material);
  };

  // Calculate the distance between two 3D points
  const calculateDistance = (start: THREE.Vector3, end: THREE.Vector3): number => {
    return start.distanceTo(end);
  };

  // Create a measurement label with distance info
  const createMeasurementLabel = (start: THREE.Vector3, end: THREE.Vector3, distance: number): THREE.Sprite => {
    // Position the label at the midpoint of the line
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    // Format the distance with 2 decimal places and add unit (cm)
    const formattedDistance = `${distance.toFixed(2)} cm`;

    // Create text sprite with white background for visibility
    const label = makeTextSprite(formattedDistance, {
      fontsize: 22,
      fontface: "Arial",
      textColor: { r: 255, g: 0, b: 0, a: 1.0 }, // Red text
      backgroundColor: { r: 255, g: 255, b: 255, a: 0.8 }, // White background with 80% opacity
      borderColor: { r: 255, g: 0, b: 0, a: 1.0 }, // Red border
      borderThickness: 2,
      padding: 6
    });

    label.position.copy(midpoint);
    return label;
  };

  // Add a completed measurement to the scene and state
  const addMeasurement = (start: THREE.Vector3, end: THREE.Vector3) => {
    if (!sceneRef.current) return;

    const distance = calculateDistance(start, end);
    const line = createMeasurementLine(start, end);
    const label = createMeasurementLabel(start, end, distance);

    // Add both to the scene
    sceneRef.current.add(line);
    sceneRef.current.add(label);

    // Store the measurement in state
    const newMeasurement: Measurement3D = {
      startPoint: start.clone(),
      endPoint: end.clone(),
      distance,
      line,
      label
    };

    setMeasurements([...measurements, newMeasurement]);

    // Trigger a render
    needsRenderRef.current = true;
  };

  // Clean up active measurement (when canceling or completing a measurement)
  const cleanupActiveMeasurement = () => {
    if (sceneRef.current) {
      if (activeMeasurementLine) {
        sceneRef.current.remove(activeMeasurementLine);
        setActiveMeasurementLine(null);
      }

      if (activeMeasurementLabel) {
        sceneRef.current.remove(activeMeasurementLabel);
        setActiveMeasurementLabel(null);
      }

      // Also reset the measurement state ref
      measurementStateRef.current.inProgress = false;
      measurementStateRef.current.startPoint = null;

      // Trigger a render to update the scene
      needsRenderRef.current = true;
    }
  };

  // Update active measurement line while dragging
  const updateActiveMeasurement = (start: THREE.Vector3, end: THREE.Vector3) => {
    if (!sceneRef.current) return;

    // Clean up existing temporary measurement
    cleanupActiveMeasurement();

    // Create new temporary measurement
    const line = createMeasurementLine(start, end);
    const distance = calculateDistance(start, end);
    const label = createMeasurementLabel(start, end, distance);

    // Add to scene
    sceneRef.current.add(line);
    sceneRef.current.add(label);

    // Update state
    setActiveMeasurementLine(line);
    setActiveMeasurementLabel(label);

    // Trigger a render
    needsRenderRef.current = true;
  };

  // Effect to handle measure mode changes
  useEffect(() => {


    // Update both state and ref
    setIsMeasuring(isMeasureMode);
    isMeasureModeRef.current = isMeasureMode;

    // Also set the ref state to match
    measurementStateRef.current.inProgress = false;
    measurementStateRef.current.startPoint = null;

    // Add visual indication of measure mode
    if (containerRef.current) {
      if (isMeasureMode) {
        containerRef.current.style.cursor = 'crosshair';
        containerRef.current.title = 'Right-click to set measurement points, ESC to cancel';

      } else {
        containerRef.current.style.cursor = 'auto';
        containerRef.current.title = '';

      }
    }

    // Clear any active measurements when exiting measure mode
    if (!isMeasureMode) {
      cleanupActiveMeasurement();
      setMeasureStartPoint(null);
      setMeasureEndPoint(null);


      // Reset measurement ref state
      measurementStateRef.current.inProgress = false;
      measurementStateRef.current.startPoint = null;
    }
  }, [isMeasureMode]);

  // Effect to clean up measurements when changing floors
  useEffect(() => {
    // Clean up any active measurement
    cleanupActiveMeasurement();
    setMeasureStartPoint(null);
    setMeasureEndPoint(null);

    // Clean up all existing measurements as they're specific to a floor
    if (measurements.length > 0 && sceneRef.current) {
      measurements.forEach(measure => {
        if (measure.line) sceneRef.current?.remove(measure.line);
        if (measure.label) sceneRef.current?.remove(measure.label);
      });
      setMeasurements([]);
    }
  }, [currentFloor]);
  
  // Effect to handle eraser mode changes - UI updates only
  useEffect(() => {
    const eraserModeValue = isEraserMode === true; // Force a boolean value

    
    // Update debug info to reflect current eraser mode state
    setDebugInfo(prev => ({
      ...prev,
      eraserMode: eraserModeValue
    }));
    
    // Log how many air entry elements exist in the scene
    if (sceneRef.current) {
      let airEntryCount = 0;
      sceneRef.current.traverse((object) => {
        if (
          object instanceof THREE.Mesh &&
          object.userData &&
          object.userData.type &&
          ["window", "door", "vent"].includes(object.userData.type)
        ) {
          airEntryCount++;
        }
      });
    }
    
    // Add visual indication of eraser mode
    if (containerRef.current) {
      if (eraserModeValue) {
        containerRef.current.style.cursor = 'not-allowed'; // Eraser cursor
        containerRef.current.title = 'Left-click to erase air entries (windows, doors, vents)';

      } else if (!isMeasureMode) { // Only reset if we're not in measure mode
        containerRef.current.style.cursor = 'auto';
        containerRef.current.title = '';

      }
    }
  }, [isEraserMode, isMeasureMode]);



  useEffect(() => {
    if (sceneRef.current) {
      // Update the opacity of only wall materials in the scene, not air entries
      sceneRef.current.traverse((object) => {
        if (object instanceof THREE.Mesh && 
            object.material instanceof THREE.MeshPhongMaterial &&
            object.material.transparent) {

          // Only update walls, not air entries (windows, doors, vents)
          const isAirEntry = object.userData?.type && 
                            ["window", "door", "vent"].includes(object.userData.type);

          if (!isAirEntry) {
            // This is a wall material that needs updating
            object.material.opacity = wallTransparency;
            object.material.needsUpdate = true;
          }
        }
      });
      // Trigger a re-render
      needsRenderRef.current = true;
    }
  }, [wallTransparency]);
  
  // Complete event system reset function for debugging hover issues
  const resetHoveringCompletely = useCallback(() => {

    
    // Re-enable controls
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
      if (typeof controlsRef.current.update === 'function') {
        controlsRef.current.update();
      }
    }
    
    // Clear hover target with proper cleanup
    if (hoveredEraseTarget) {
      try {
        hoveredEraseTarget.object.material = hoveredEraseTarget.originalMaterial;
        if (hoveredEraseTarget.object.userData?.originalScale) {
          hoveredEraseTarget.object.scale.copy(hoveredEraseTarget.object.userData.originalScale);
          
          if (hoveredEraseTarget.object.geometry) {
            hoveredEraseTarget.object.geometry.computeBoundingSphere();
            hoveredEraseTarget.object.geometry.computeBoundingBox();
          }
        }
      } catch (err) {
        console.error("Error during hover cleanup in reset:", err);
      }
    }
    
    // Clear all debug helpers
    if (sceneRef.current) {
      const helpersToRemove: THREE.Object3D[] = [];
      sceneRef.current.traverse((obj) => {
        if (obj.userData?.type === 'debug-helper') {
          helpersToRemove.push(obj);
        }
      });
      
      helpersToRemove.forEach(helper => {
        sceneRef.current?.remove(helper);
      });
    }
    
    // Force clear hover state
    setHoveredEraseTarget(null);
    
    // Force a complete render
    needsRenderRef.current = true;
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
    
    // Reset cursor
    if (containerRef.current) {
      containerRef.current.style.cursor = isEraserMode ? 'not-allowed' : 'auto';
    }
    

  }, [hoveredEraseTarget, isEraserMode]);
  
  // Add a useEffect to reset the system when entering/exiting eraser mode
  useEffect(() => {

    resetHoveringCompletely();
  }, [isEraserMode, resetHoveringCompletely]);

  // Drag and drop handlers for furniture
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sceneRef.current) return;

    // Add throttling to prevent too many calls
    let lastRaycastTime = 0;
    const RAYCAST_THROTTLE = 50; // ms

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer!.dropEffect = "copy";
      
      // Throttle raycasting
      const now = Date.now();
      if (now - lastRaycastTime < RAYCAST_THROTTLE) {
        return;
      }
      lastRaycastTime = now;
      
      // Simple raycasting logic: highlight the last surface intersected
      if (cameraRef.current && sceneRef.current) {
        const rect = container.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, cameraRef.current);

        // Get all floor and ceiling meshes
        const surfaces: THREE.Mesh[] = [];
        sceneRef.current.traverse((object: THREE.Object3D) => {
          if (object instanceof THREE.Mesh && 
              object.userData.type && 
              (object.userData.type === 'floor' || object.userData.type === 'ceiling')) {
            surfaces.push(object);
          }
        });

        // Get intersections with surfaces only
        const intersects = raycaster.intersectObjects(surfaces);
        
        // Clear all highlights first
        clearAllHighlights();
        
        if (intersects.length > 0) {
          // Get the closest intersection (first one)
          const targetMesh = intersects[0].object as THREE.Mesh;
          
          // Highlight the intersected surface
          highlightSurface(targetMesh);
        }
      }
    };

    const handleDragLeave = (event: DragEvent) => {
      clearAllHighlights();
    };

    const handleDrop = (event: DragEvent) => {
      // Clear highlight when dropping
      clearAllHighlights();
      
      if (sceneRef.current && cameraRef.current) {
        // FASE 5A: Use the new component-level furniture drop handler
        handleComponentFurnitureDrop(event, cameraRef.current, sceneRef.current);
      }
    };

    // Double-click handler for furniture editing
    const handleDoubleClick = (event: MouseEvent) => {
      console.log("🖱️ Double-click detected!");
      
      // Allow furniture editing even in presentation mode for selective editing
      // Other editing interactions remain disabled in presentation mode
      
      event.preventDefault();
      
      if (!sceneRef.current || !cameraRef.current) {
        console.log("❌ Scene or camera not available");
        return;
      }
      
      // Get mouse coordinates
      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      
      console.log("🎯 Mouse coordinates:", mouse);
      
      // Create raycaster
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      
      // Find furniture objects in the scene (both groups and meshes)
      const furnitureObjects: THREE.Object3D[] = [];
      sceneRef.current.traverse((object) => {
        // Check for furniture groups (main containers)
        if (object.userData.type === 'furniture') {
          furnitureObjects.push(object);
          console.log("🪑 Found furniture group:", object.userData);
        }
        // Also check for meshes within furniture groups
        else if (object instanceof THREE.Mesh && object.parent?.userData.type === 'furniture') {
          furnitureObjects.push(object);
          console.log("🪑 Found furniture mesh:", object.parent?.userData);
        }
      });
      
      console.log(`🔍 Found ${furnitureObjects.length} furniture objects in scene`);
      
      // Check for intersections (recursive to handle group children)
      const intersects = raycaster.intersectObjects(furnitureObjects, true);
      
      console.log(`💥 Found ${intersects.length} intersections`);
      
      if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        
        // Find the furniture group (either the object itself or its parent)
        let furnitureGroup = intersectedObject;
        while (furnitureGroup && furnitureGroup.userData.type !== 'furniture') {
          furnitureGroup = furnitureGroup.parent;
        }
        
        if (furnitureGroup && furnitureGroup.userData.type === 'furniture') {
          const furnitureId = furnitureGroup.userData.furnitureId;
          
          console.log("✅ Intersected furniture object:", {
            furnitureId,
            userData: furnitureGroup.userData,
            position: furnitureGroup.position
          });
          
          if (furnitureId) {
            // Find the furniture item data
            // This would need to be passed from the parent component
            // For now, we'll create a mock furniture item based on the mesh
            const mockFurnitureItem: FurnitureItem = {
              id: furnitureId,
              type: furnitureGroup.userData.furnitureType || 'table',
              name: furnitureGroup.userData.furnitureName || 'Furniture',
              floorName: furnitureGroup.userData.floorName || currentFloor,
              position: {
                x: furnitureGroup.position.x,
                y: furnitureGroup.position.y,
                z: furnitureGroup.position.z
              },
              rotation: {
                x: furnitureGroup.rotation.x,
                y: furnitureGroup.rotation.y,
                z: furnitureGroup.rotation.z
              },
              dimensions: furnitureGroup.userData.dimensions || { width: 80, height: 80, depth: 80 },
              information: furnitureGroup.userData.information || '',
              meshId: furnitureGroup.userData.meshId || furnitureId,
              createdAt: furnitureGroup.userData.createdAt || Date.now(),
              updatedAt: Date.now()
            };
            
            console.log("🎛️ Opening furniture dialog with item:", mockFurnitureItem);
            console.log("🎛️ Setting editingFurniture state...");
            
            setEditingFurniture({
              index: 0, // This would need to be the actual index from the furniture list
              item: mockFurnitureItem
            });
            
            console.log("🎛️ editingFurniture state set!");
          } else {
            console.log("❌ No furnitureId found in userData");
          }
        } else {
          console.log("❌ No furniture group found");
        }
      } else {
        console.log("❌ No furniture intersections found");
      }
    };

    // Single click handler for furniture deletion
    const handleClick = (event: MouseEvent) => {
      // Only handle clicks in furniture eraser mode
      if (!isFurnitureEraserMode) return;
      
      event.preventDefault();
      
      if (!sceneRef.current || !cameraRef.current) return;
      
      // Get mouse coordinates
      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      
      // Create raycaster
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      
      // Find furniture objects in the scene
      const furnitureObjects: THREE.Object3D[] = [];
      sceneRef.current.traverse((object) => {
        if (object.userData.type === 'furniture') {
          furnitureObjects.push(object);
        }
      });
      
      // Check for intersections
      const intersects = raycaster.intersectObjects(furnitureObjects, true);
      
      if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        
        // Find the furniture group - prioritize groups with furnitureId
        let furnitureGroup = intersectedObject;
        
        // First check if the hit object itself has furnitureId
        if (!furnitureGroup.userData.furnitureId) {
          // Look for parent with furnitureId
          furnitureGroup = intersectedObject.parent;
        }
        
        if (furnitureGroup && furnitureGroup.userData.type === 'furniture') {
          const furnitureId = furnitureGroup.userData.furnitureId;
          
          if (furnitureId && onDeleteFurniture) {
            // Find the furniture floor for the callback
            const furnitureFloorName = furnitureGroup.userData.floorName || currentFloor;
            
            // Remove from scene
            sceneRef.current.remove(furnitureGroup);
            
            // Call deletion callback with floor name and furniture ID
            onDeleteFurniture(furnitureFloorName, furnitureId);
            
            // Trigger texture re-application after furniture deletion
            if (onFurnitureDeleted) {
              onFurnitureDeleted();
            }
          }
        }
      }
    };

    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("dragleave", handleDragLeave);
    container.addEventListener("drop", handleDrop);
    container.addEventListener("dblclick", handleDoubleClick);
    container.addEventListener("click", handleClick);

    return () => {
      container.removeEventListener("dragover", handleDragOver);
      container.removeEventListener("dragleave", handleDragLeave);
      container.removeEventListener("drop", handleDrop);
      container.removeEventListener("dblclick", handleDoubleClick);
      container.removeEventListener("click", handleClick);
    };
  }, [currentFloor, onFurnitureAdd, isMultifloor, floorParameters, isFurnitureEraserMode, onDeleteFurniture]);

  // Real-time update functions for furniture editing
  const handleRealTimePositionUpdate = (newPosition: { x: number; y: number; z: number }) => {
    if (!editingFurniture || !sceneRef.current) return;

    const furnitureId = editingFurniture.item.id;
    let furnitureGroup: THREE.Group | null = null;

    sceneRef.current.traverse((child) => {
      if (child.userData.furnitureId === furnitureId && child.userData.type === 'furniture') {
        furnitureGroup = child as THREE.Group;
      }
    });

    if (furnitureGroup) {
      furnitureGroup.position.set(newPosition.x, newPosition.y, newPosition.z);
      console.log("🔄 Real-time position update:", newPosition);
    }
  };

  const handleRealTimeRotationUpdate = (newRotation: { x: number; y: number; z: number }) => {
    if (!editingFurniture || !sceneRef.current) return;

    const furnitureId = editingFurniture.item.id;
    let furnitureGroup: THREE.Group | null = null;

    sceneRef.current.traverse((child) => {
      if (child.userData.furnitureId === furnitureId && child.userData.type === 'furniture') {
        furnitureGroup = child as THREE.Group;
      }
    });

    if (furnitureGroup) {
      furnitureGroup.rotation.set(newRotation.x, newRotation.y, newRotation.z);
      console.log("🔄 Real-time rotation update:", newRotation);
    }
  };

  const handleRealTimeScaleUpdate = (newScale: { x: number; y: number; z: number }) => {
    if (!editingFurniture || !sceneRef.current) return;

    const furnitureId = editingFurniture.item.id;
    let furnitureGroup: THREE.Group | null = null;

    sceneRef.current.traverse((child) => {
      if (child.userData.furnitureId === furnitureId && child.userData.type === 'furniture') {
        furnitureGroup = child as THREE.Group;
      }
    });

    if (furnitureGroup) {
      furnitureGroup.scale.set(newScale.x, newScale.y, newScale.z);
      console.log("🔄 Real-time scale update:", newScale);
    }
  };



  // Handler for updating furniture
  const handleFurnitureEdit = (
    index: number,
    data: {
      name: string;
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
      scale: { x: number; y: number; z: number };
      properties?: {
        material?: string;
        temperature?: number;
        thermalConductivity?: number;
        density?: number;
        heatCapacity?: number;
      };
    }
  ) => {
    if (!editingFurniture || !sceneRef.current) return;



    // Find the furniture object in the scene by ID
    const furnitureId = editingFurniture.item.id;
    let furnitureGroup: THREE.Group | null = null;

    sceneRef.current.traverse((child) => {
      if (child.userData.furnitureId === furnitureId && child.userData.type === 'furniture') {
        furnitureGroup = child as THREE.Group;
      }
    });

    if (furnitureGroup) {

      
      // Update position
      furnitureGroup.position.set(data.position.x, data.position.y, data.position.z);
      
      // Update rotation
      furnitureGroup.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
      
      // Update scale
      furnitureGroup.scale.set(data.scale.x, data.scale.y, data.scale.z);
      
      // Update userData
      furnitureGroup.userData.furnitureName = data.name;
      

    } else {
      console.error("❌ Could not find furniture object in scene with ID:", furnitureId);
    }

    // For newly dropped furniture, only update scene visual properties
    // Don't create data objects or call persistence callbacks since furniture is already saved
    
    setEditingFurniture(null);
  };

  return (
    <>
      {/* 3D Canvas container - simplified layout with just the canvas */}
      <div ref={containerRef} className="w-full h-full relative">
        {/* Debug overlay */}
        <div 
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: 'rgba(0,0,0,0.5)',
            color: 'white',
            padding: 10,
            borderRadius: 5,
            fontSize: 14,
            zIndex: 1000,
            pointerEvents: 'none', // Don't interfere with mouse events
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
        >
          <div><strong>DEBUG INFO</strong></div>
          <div>Mouse: {debugInfo.mousePosition}</div>
          <div>Eraser Mode: {debugInfo.eraserMode ? 'Active' : 'Inactive'}</div>
          <div>Hovering: {debugInfo.hovering ? 'YES' : 'no'}</div>
          <div>Last Intersection: {debugInfo.lastIntersection}</div>
        </div>
      </div>

      {/* Dialog for editing air entries */}
      {editingAirEntry && (
        <AirEntryDialog
          type={editingAirEntry.entry.type}
          isOpen={true}
          onClose={() => setEditingAirEntry(null)}
          onConfirm={(dimensions) =>
            handleAirEntryEdit(editingAirEntry.index, dimensions)
          }
          initialValues={editingAirEntry.entry.dimensions}
          isEditing={true}
        />
      )}

      {/* Dialog for editing furniture */}
      {editingFurniture && (
        <FurnitureDialog
          type={editingFurniture.item.type}
          isOpen={true}
          onClose={() => setEditingFurniture(null)}
          onConfirm={(data) => handleFurnitureEdit(editingFurniture.index, data)}
          onCancel={() => {
            if (!editingFurniture) return;
            
            const furnitureId = editingFurniture.item.id;
            
            // First: Remove from 3D scene (like handleClick does)
            try {
              if (sceneRef.current && typeof sceneRef.current.traverse === 'function') {
                sceneRef.current.traverse((child) => {
                  if (child.userData?.furnitureId === furnitureId && child.userData?.type === 'furniture') {
                    sceneRef.current?.remove(child);
                  }
                });
              }
            } catch (error) {
              console.warn("Could not remove furniture from scene:", error);
              // Continue with data store cleanup even if scene removal fails
            }
            
            // Second: Remove from data store via callback
            if (onDeleteFurniture) {
              onDeleteFurniture(editingFurniture.item.floorName, editingFurniture.item.id);
            }
            
            // Third: Close dialog
            setEditingFurniture(null);
          }}
          onPositionUpdate={handleRealTimePositionUpdate}
          onRotationUpdate={handleRealTimeRotationUpdate}
          onScaleUpdate={handleRealTimeScaleUpdate}
          initialValues={{
            name: editingFurniture.item.name,
            position: editingFurniture.item.position,
            rotation: editingFurniture.item.rotation,
            scale: (() => {
              // Get the actual scale from the 3D object in the scene
              let actualScale = { x: 1, y: 1, z: 1 };
              
              if (sceneRef.current) {
                sceneRef.current.traverse((child) => {
                  if (child.userData?.furnitureId === editingFurniture.item.id && child.userData?.type === 'furniture') {
                    // Found the furniture object, get its actual scale
                    actualScale = {
                      x: child.scale.x,
                      y: child.scale.y,
                      z: child.scale.z
                    };
                  }
                });
              }
              
              return actualScale;
            })(),
            properties: {
              material: "wood",
              temperature: 20,
              thermalConductivity: 0.12,
              density: 600,
              heatCapacity: 1200
            }
          }}
          isEditing={true}
          floorContext={{
            floorName: editingFurniture.item.floorName,
            floorHeight: 220, // Default floor height
            clickPosition: editingFurniture.item.position
          }}
          furnitureIndex={editingFurniture.index}
          currentFloor={currentFloor}
        />
      )}
    </>
  );
}

/**
 * ========================================
 * SHARED GEOMETRY GENERATION FUNCTION
 * ========================================
 * 
 * Critical function for RoomSketchPro integration - generates identical 3D geometry
 * 
 * CURRENT LIMITATION: Uses local duplicate functions instead of shared utilities
 * TODO: Replace localTransform2DTo3D with shared transform2DTo3D function
 * TODO: Replace localCreateRoomPerimeter with shared createRoomPerimeter function
 * 
 * Dependencies:
 * - CANVAS_CONFIG: Centralized dimensions (✓ already using)
 * - PIXELS_TO_CM: Scale conversion (✓ already using)
 * - Air entry positioning algorithms (needs extraction from Canvas3D)
 * - Wall normal calculations (needs extraction from Canvas3D)
 * 
 * This function must produce identical results to Canvas3D's internal geometry generation
 */
export const generateSharedFloorGeometry = (
  floors: Record<string, FloorData>,
  config: {
    currentFloor: string;
    floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number }>;
    wallTransparency: number;
    isMultifloor?: boolean;
    defaultCeilingHeight?: number;
    defaultFloorDeck?: number;
  }
): THREE.Object3D[] => {
  const objects: THREE.Object3D[] = [];
  
  // TEMPORARY: Helper functions (identical to Canvas3D implementation)
  // These should be replaced with shared utility functions
  const localTransform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
    const relativeX = point.x - CANVAS_CONFIG.centerX;
    const relativeY = CANVAS_CONFIG.centerY - point.y;

    return new THREE.Vector3(
      relativeX * PIXELS_TO_CM,
      relativeY * PIXELS_TO_CM,
      height,
    );
  };

  const localCreateRoomPerimeter = (lines: Line[]): Point[] => {
    if (lines.length === 0) return [];
    
    const pointGraph = new Map<string, Point[]>();
    const pointToString = (p: Point) => `${p.x},${p.y}`;
    const arePointsEqual = (p1: Point, p2: Point, tolerance = 0.1) =>
      Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
    
    lines.forEach((line) => {
      const startKey = pointToString(line.start);
      const endKey = pointToString(line.end);

      if (!pointGraph.has(startKey)) pointGraph.set(startKey, []);
      if (!pointGraph.has(endKey)) pointGraph.set(endKey, []);

      pointGraph.get(startKey)!.push(line.end);
      pointGraph.get(endKey)!.push(line.start);
    });

    const perimeter: Point[] = [lines[0].start];
    const visited = new Set<string>([pointToString(lines[0].start)]);
    let currentPoint = lines[0].start;

    while (true) {
      const currentKey = pointToString(currentPoint);
      const neighbors = pointGraph.get(currentKey) || [];
      const nextPoint = neighbors.find((p) => !visited.has(pointToString(p)));

      if (!nextPoint) break;

      if (arePointsEqual(nextPoint, perimeter[0])) break;

      perimeter.push(nextPoint);
      visited.add(pointToString(nextPoint));
      currentPoint = nextPoint;
    }

    return perimeter;
  };

  const getFloorBaseHeight = (floorName: string): number => {
    const FLOOR_ORDER = ["ground", "first", "second", "third", "fourth", "fifth"];
    const floorIndex = FLOOR_ORDER.indexOf(floorName.toLowerCase());
    
    if (floorIndex === -1) return 0;
    if (floorIndex === 0) return 0;

    let totalHeight = 0;
    for (let i = 0; i < floorIndex; i++) {
      const currentFloorName = FLOOR_ORDER[i];
      let floorHeight;
      
      if (config.isMultifloor && config.floorParameters?.[currentFloorName]) {
        floorHeight = config.floorParameters[currentFloorName].ceilingHeight + 
                     config.floorParameters[currentFloorName].floorDeck;
      } else {
        floorHeight = (config.defaultCeilingHeight || 250) + (config.defaultFloorDeck || 20);
      }
      
      totalHeight += floorHeight;
    }
    
    return totalHeight;
  };

  // Generate geometry for each floor (identical logic to Canvas3D)
  Object.entries(floors).forEach(([floorName, floorData]) => {
    if (floorData.hasClosedContour || floorName === config.currentFloor) {
      const baseHeight = getFloorBaseHeight(floorName);
      
      let floorCeilingHeight, currentFloorDeckThickness;
      if (config.isMultifloor && config.floorParameters?.[floorName]) {
        floorCeilingHeight = config.floorParameters[floorName].ceilingHeight;
        currentFloorDeckThickness = config.floorParameters[floorName].floorDeck;
      } else {
        floorCeilingHeight = config.defaultCeilingHeight || 250;
        currentFloorDeckThickness = config.defaultFloorDeck || 20;
      }

      const perimeterPoints = localCreateRoomPerimeter(floorData.lines);
      const isCurrentFloor = floorName === config.currentFloor;

      // Create floor and ceiling surfaces
      if (perimeterPoints.length > 2) {
        const shape = new THREE.Shape();
        const firstPoint = localTransform2DTo3D(perimeterPoints[0]);
        shape.moveTo(firstPoint.x, firstPoint.y);

        for (let i = 1; i < perimeterPoints.length; i++) {
          const point = localTransform2DTo3D(perimeterPoints[i]);
          shape.lineTo(point.x, point.y);
        }

        // Floor surface with distinctive colors
        const floorGeometry = new THREE.ShapeGeometry(shape);
        let floorColor = 0x808080; // Default gray
        if (floorName === 'ground') floorColor = 0x00ff00; // Green for ground
        else if (floorName === 'first') floorColor = 0x0000ff; // Blue for first floor
        else if (floorName === 'second') floorColor = 0xff0000; // Red for second floor
        else if (floorName === 'third') floorColor = 0xffff00; // Yellow for third floor
        
        const floorMaterial = new THREE.MeshPhongMaterial({
          color: floorColor,
          opacity: 0.5, // More opaque to see colors clearly
          transparent: true,
          side: THREE.DoubleSide,
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.z = baseHeight;
        floor.userData = { type: 'floor', floorName };
        console.log(`🎨 FLOOR VISUAL - Created ${floorName} floor at Z=${baseHeight} with color:`, floorColor.toString(16));
        objects.push(floor);

        // Ceiling surface with lighter tones
        const ceilingGeometry = new THREE.ShapeGeometry(shape);
        let ceilingColor = 0xe0e0e0; // Default light gray
        if (floorName === 'ground') ceilingColor = 0x80ff80; // Light green for ground ceiling
        else if (floorName === 'first') ceilingColor = 0x8080ff; // Light blue for first ceiling
        else if (floorName === 'second') ceilingColor = 0xff8080; // Light red for second ceiling
        else if (floorName === 'third') ceilingColor = 0xffff80; // Light yellow for third ceiling
        
        const ceilingMaterial = new THREE.MeshPhongMaterial({
          color: ceilingColor,
          opacity: 0.3, // Semi-transparent
          transparent: true,
          side: THREE.DoubleSide,
        });
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.position.z = baseHeight + floorCeilingHeight;
        ceiling.userData = { type: 'ceiling', floorName };
        console.log(`🎨 CEILING VISUAL - Created ${floorName} ceiling at Z=${baseHeight + floorCeilingHeight} with color:`, ceilingColor.toString(16));
        objects.push(ceiling);
      }

      // Create walls
      floorData.lines.forEach((line: Line) => {
        const start_bottom = localTransform2DTo3D(line.start, baseHeight);
        const end_bottom = localTransform2DTo3D(line.end, baseHeight);
        const start_top = localTransform2DTo3D(line.start, baseHeight + floorCeilingHeight);
        const end_top = localTransform2DTo3D(line.end, baseHeight + floorCeilingHeight);

        const vertices = new Float32Array([
          start_bottom.x, start_bottom.y, start_bottom.z,
          end_bottom.x, end_bottom.y, end_bottom.z,
          start_top.x, start_top.y, start_top.z,
          end_top.x, end_top.y, end_top.z,
        ]);

        const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        const wallMaterial = new THREE.MeshPhongMaterial({
          color: isCurrentFloor ? 0x3b82f6 : 0x4b92f6,
          opacity: config.wallTransparency,
          transparent: true,
          side: THREE.DoubleSide,
        });

        const wall = new THREE.Mesh(geometry, wallMaterial);
        wall.userData = { type: 'wall', floorName };
        console.log(`Canvas3D: Created wall mesh with userData:`, wall.userData, `for floor: ${floorName}`);
        objects.push(wall);
      });

      // Create air entries
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
          const position = localTransform2DTo3D(entry.position);
          mesh.position.set(position.x, position.y, zPosition);
          mesh.userData = { 
            type: entry.type, 
            entryIndex: index, 
            position: entry.position,
            floorName 
          };
          objects.push(mesh);
        });
      }
    }
  });

  return objects;
};
