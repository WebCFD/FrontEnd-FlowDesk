import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { makeTextSprite } from "@/lib/three-utils";
import AirEntryDialog from "./AirEntryDialog";

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
}

// Update FloorData to include stair polygons
interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  hasClosedContour: boolean;
  name: string;
  stairPolygons?: StairPolygon[]; // Add stair polygons to floor data
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
  onUpdateAirEntry?: (
    floorName: string,
    index: number,
    entry: AirEntry,
  ) => void;
}


const PIXELS_TO_CM = 25 / 20;
const GRID_SIZE = 1000;
const GRID_DIVISIONS = 40;

const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  const dimensions = { width: 800, height: 600 };
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;

  const relativeX = point.x - centerX;
  const relativeY = centerY - point.y;

  return new THREE.Vector3(
    relativeX * PIXELS_TO_CM,
    relativeY * PIXELS_TO_CM,
    height,
  );
};

// Generate a unique ID for an air entry
const getAirEntryId = (floorName: string, entry: AirEntry, index: number): string => {
  return `${floorName}-${entry.type}-${index}-${entry.position.x.toFixed(2)},${entry.position.y.toFixed(2)}`;
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
  axisType: "x" | "z" | null,
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
    const targetColor = axisType === "x" ? 0xff0000 : 0x0000ff; // Red or Blue

    arrows.forEach((arrow) => {
      const arrowLineMaterial = arrow.line.material as THREE.LineBasicMaterial;
      const colorHex = arrowLineMaterial.color.getHex();

      if (colorHex === targetColor) {
        console.log(
          `Found matching arrow to highlight with color ${colorHex.toString(16)}`,
        );

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
  selectedAxis: "x" | "z" | null,
) => {
  if (!scene) return;

  // Reset all arrows that aren't selected
  scene.traverse((object) => {
    if (object instanceof THREE.ArrowHelper) {
      // Determine if this arrow is selected
      let isCurrentlySelected = false;

      if (selectedAirEntry?.object) {
        isCurrentlySelected =
          object.position.distanceTo(selectedAirEntry.object.position) < 10 &&
          ((selectedAxis === "x" &&
            (object.line.material as THREE.LineBasicMaterial).color.getHex() ===
              0xff0000) ||
            (selectedAxis === "z" &&
              (
                object.line.material as THREE.LineBasicMaterial
              ).color.getHex() === 0x0000ff));

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
// Modified to read isDragging from the drag state ref
const highlightSelectedAirEntry = (
  airEntry: THREE.Mesh | null,
  isSelected: boolean,
  dragStateRef: React.MutableRefObject<{
    isDragging: boolean;
    selectedAxis: "x" | "z" | null;
    startPosition: THREE.Vector3 | null;
    initialMousePosition: {x: number, y: number} | null;
    selectedObject: THREE.Mesh | null;
    currentMousePosition: {x: number, y: number} | null;
    entryIndex: number;
    lastDraggedObjectId: string | null;
  }>
) => {
  if (!airEntry) return;

  const material = airEntry.material as THREE.MeshPhongMaterial;
  const isDragging = dragStateRef.current.isDragging;

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

// Utility function to find connected points and create a perimeter
const createRoomPerimeter = (lines: Line[]): Point[] => {
  if (lines.length === 0) return [];

  const perimeter: Point[] = [];
  const visited = new Set<string>();
  const pointToString = (p: Point) => `${p.x},${p.y}`;
  


  // Remove any duplicate getAirEntryId definition in createRoomPerimeter function
  
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

  // Start with the first point
  const startPoint = lines[0].start;
  perimeter.push(startPoint);
  visited.add(pointToString(startPoint));

  // Find connected points
  let currentPoint = startPoint;
  while (true) {
    const connectedPoints = connections.get(pointToString(currentPoint)) || [];
    const nextPoint = connectedPoints.find(
      (p) => !visited.has(pointToString(p)),
    );

    if (!nextPoint) break;

    perimeter.push(nextPoint);
    visited.add(pointToString(nextPoint));
    currentPoint = nextPoint;
  }

  return perimeter;
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

export default function Canvas3D({
  floors,
  currentFloor,
  ceilingHeight = 210,
  floorDeckThickness = 35,
  wallTransparency = 0.7,
  isMeasureMode = false,
  onUpdateAirEntry,
}: Canvas3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const needsRenderRef = useRef<boolean>(true);
  
  // Object mapping system for selective updates
  // This maps unique identifiers to their Three.js objects
  const objectMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  // Previous floors data for diffing
  const prevFloorsRef = useRef<Record<string, FloorData> | null>(null);
  // State for editing air entries
  const [editingAirEntry, setEditingAirEntry] = useState<{
    index: number;
    entry: AirEntry;
  } | null>(null);
  const [ignoreNextClick, setIgnoreNextClick] = useState<boolean>(false);
  // Track the selected air entry element for dragging
  const [selectedAirEntry, setSelectedAirEntry] = useState<{
    index: number;
    entry: AirEntry;
    object: THREE.Mesh | null;
  } | null>(null);

  // Track which axis is selected for movement (x or z)
  const [selectedAxis, setSelectedAxis] = useState<"x" | "z" | null>(null);

  // Track if currently dragging
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Store the original position for reference
  const [dragStartPosition, setDragStartPosition] =
    useState<THREE.Vector3 | null>(null);

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

  const isMeasureModeRef = useRef(false);
  // Add a state variable for triggering UI updates when dragStateRef changes
  const [dragStateUpdate, setDragStateUpdate] = useState(0);
  // Define our drag state interface for better type safety
  interface DragState {
    isDragging: boolean;
    selectedAxis: "x" | "z" | null;
    startPosition: THREE.Vector3 | null;
    initialMousePosition: {x: number, y: number} | null;
    selectedObject: THREE.Mesh | null;
    currentMousePosition: {x: number, y: number} | null;
    entryIndex: number;
    lastDraggedObjectId: string | null; // Track the last dragged object ID to prevent selection issues
  }

  // Create the ref with the new type
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    selectedAxis: null,
    startPosition: null,
    initialMousePosition: null,
    selectedObject: null,
    currentMousePosition: null,
    entryIndex: -1,
    lastDraggedObjectId: null
  });

  // Add this ref to track measurement state
  const measurementStateRef = useRef({
    inProgress: false,
    startPoint: null as THREE.Vector3 | null
  });
  // Add this ref to track if we're hovering over an air entry or axis
  const isHoveringActionableRef = useRef(false);

  
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
        baseHeight += ceilingHeight + floorDeckThickness;
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

    // Call the parent component's handler
    onUpdateAirEntry(currentFloor, index, updatedEntry);
    setEditingAirEntry(null);
  };

  // New function to create stair mesh
  const createStairMesh = (
    stairPolygon: StairPolygon,
    baseHeight: number,
    isCurrentFloor: boolean,
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

    // Determine the z-positions
    let bottomZ, topZ;
    if (stairPolygon.direction === "down") {
      // Stair going down: connects current floor to the floor below
      bottomZ = baseHeight - floorDeckThickness;
      topZ = baseHeight;
    } else {
      // Stair going up (default): connects current floor to the floor above
      bottomZ = baseHeight + ceilingHeight;
      topZ = baseHeight + ceilingHeight + floorDeckThickness;
    }

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
  ) => {
    const objects: THREE.Object3D[] = [];
    const perimeterPoints = createRoomPerimeter(floorData.lines);

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

      // Floor surface
      const floorGeometry = new THREE.ShapeGeometry(shape);
      const floorMaterial = new THREE.MeshPhongMaterial({
        color: isCurrentFloor ? 0x808080 : 0xa0a0a0,
        opacity: isCurrentFloor ? 0.3 : 0.2,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.z = baseHeight;
      objects.push(floor);

      // Ceiling surface
      const ceilingGeometry = new THREE.ShapeGeometry(shape);
      const ceilingMaterial = new THREE.MeshPhongMaterial({
        color: isCurrentFloor ? 0xe0e0e0 : 0xf0f0f0,
        opacity: isCurrentFloor ? 0.2 : 0.1,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
      ceiling.position.z = baseHeight + ceilingHeight;
      objects.push(ceiling);
    }

    // Create walls
    floorData.lines.forEach((line) => {
      const start_bottom = transform2DTo3D(line.start, baseHeight);
      const end_bottom = transform2DTo3D(line.end, baseHeight);
      const start_top = transform2DTo3D(line.start, baseHeight + ceilingHeight);
      const end_top = transform2DTo3D(line.end, baseHeight + ceilingHeight);

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
      objects.push(wall);
    });

      // Create air entries (windows, doors, vents)
      console.log(
        `Creating ${floorData.airEntries.length} air entries for floor ${floorData.name}`,
      );
      floorData.airEntries.forEach((entry, index) => {
        console.log(`Creating air entry ${index} of type ${entry.type}`);
        // Generate a unique ID for this air entry
        const entryId = getAirEntryId(floorData.name, entry, index);
        
        // Use dimensions directly as they are already in cm
        const width = entry.dimensions.width;
        const height = entry.dimensions.height;
        const zPosition =
          baseHeight +
          (entry.type === "door"
            ? height / 2
            : entry.dimensions.distanceToFloor || 0);
        
        // Define position3D once for all uses
        let position3D = transform2DTo3D(entry.position);
            
        let mesh: THREE.Mesh;
        
        // Check if we already have this object in our map
        if (objectMapRef.current.has(entryId)) {
          // Retrieve existing mesh
          mesh = objectMapRef.current.get(entryId)!;
          
          // Update position
          // Use the position3D that was already defined at the top of the forEach loop
          mesh.position.set(position3D.x, position3D.y, zPosition);
          
          // Update dimensions if they've changed
          if (mesh.geometry instanceof THREE.PlaneGeometry && 
              (mesh.geometry.parameters.width !== width || 
               mesh.geometry.parameters.height !== height)) {
            // Replace geometry if dimensions changed
            mesh.geometry.dispose();
            mesh.geometry = new THREE.PlaneGeometry(width, height);
          }
        } else {
          // Create new mesh
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
          });
  
          mesh = new THREE.Mesh(geometry, material);
          // Use the position3D that was already defined at the top of the forEach loop
          mesh.position.set(position3D.x, position3D.y, zPosition);
          
          // Store in our object map
          objectMapRef.current.set(entryId, mesh);
        }

        // Add userData for raycasting identification - include the actual entry index for easy mapping
        mesh.userData = {
          type: entry.type,
          position: entry.position,
          dimensions: entry.dimensions,
          line: entry.line,
          index: objects.length,
          entryIndex: index  // Add the actual index in the airEntries array
        };

      // Calculate proper orientation
      const wallDirection = new THREE.Vector3()
        .subVectors(
          transform2DTo3D(entry.line.end),
          transform2DTo3D(entry.line.start),
        )
        .normalize();
      const worldUpVector = new THREE.Vector3(0, 0, 1);
      const wallNormalVector = new THREE.Vector3()
        .crossVectors(wallDirection, worldUpVector)
        .normalize();

      const forward = wallNormalVector.clone();
      const up = new THREE.Vector3(0, 0, 1);
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      forward.crossVectors(right, up).normalize();
      const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, forward);
      mesh.setRotationFromMatrix(rotationMatrix);

      objects.push(mesh);

      // position3D is already defined at the top of the forEach loop
      // so we'll use that for all markers and axes
      
      // Add yellow sphere marker
      const markerGeometry = new THREE.SphereGeometry(5, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(position3D.x, position3D.y, zPosition);
      objects.push(marker);

      // Add coordinate system axes
      const axisLength = 50; // Length of the coordinate axes
      console.log(`Creating custom axis arrows for entry at position ${position3D.x}, ${position3D.y}, ${zPosition}`);

      // Create custom axis meshes that are better for intersection detection
      // X axis - Red (Right)
      const xAxisGeometry = new THREE.CylinderGeometry(5, 5, axisLength, 8);
      // Rotate to point in correct direction
      xAxisGeometry.rotateZ(-Math.PI / 2);
      const xAxisMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 });
      const xAxis = new THREE.Mesh(xAxisGeometry, xAxisMaterial);
      xAxis.position.set(
        position3D.x + axisLength/2 * right.x, 
        position3D.y + axisLength/2 * right.y, 
        zPosition
      );
      xAxis.userData = { 
        type: 'axis', 
        direction: 'x',
        parentEntryIndex: objects.length - 1 // Reference to the parent mesh
      };

      // Y axis - Green (Forward/Normal) - optional, mainly for visualization
      const yAxisGeometry = new THREE.CylinderGeometry(3, 3, axisLength, 8);
      yAxisGeometry.rotateX(Math.PI / 2);
      const yAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6 });
      const yAxis = new THREE.Mesh(yAxisGeometry, yAxisMaterial);
      yAxis.position.set(
        position3D.x + axisLength/2 * forward.x, 
        position3D.y + axisLength/2 * forward.y, 
        zPosition
      );
      yAxis.userData = { 
        type: 'axis', 
        direction: 'y',
        parentEntryIndex: objects.length - 1
      };

      // Z axis - Blue (Up)
      const zAxisGeometry = new THREE.CylinderGeometry(5, 5, axisLength, 8);
      const zAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.8 });
      const zAxis = new THREE.Mesh(zAxisGeometry, zAxisMaterial);
      zAxis.position.set(
        position3D.x, 
        position3D.y, 
        zPosition + axisLength/2
      );
      zAxis.userData = { 
        type: 'axis', 
        direction: 'z',
        parentEntryIndex: objects.length - 1
      };

      // Add the axis meshes to the objects array
      objects.push(xAxis, yAxis, zAxis);

      // Add coordinate label
      const coordText = `(${Math.round(position3D.x)}, ${Math.round(position3D.y)}, ${Math.round(zPosition)}) cm`;
      const labelSprite = makeTextSprite(coordText, {
        fontsize: 28,
        fontface: "Arial",
        textColor: { r: 160, g: 160, b: 160, a: 1.0 },
        backgroundColor: { r: 255, g: 255, b: 255, a: 0.0 },
      });
      labelSprite.position.set(position3D.x, position3D.y, zPosition + 15);
      objects.push(labelSprite);
    });

    // Create stairs
    if (floorData.stairPolygons && floorData.stairPolygons.length > 0) {
      floorData.stairPolygons.forEach((stairPolygon) => {
        const stairObjects = createStairMesh(
          stairPolygon,
          baseHeight,
          isCurrentFloor,
        );
        objects.push(...stairObjects);
      });
    }

    return objects;
  };

  useEffect(() => {
    if (!containerRef.current) return;

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

    // Initialize renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
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


    // Configure mouse buttons - enable right button for panning by default
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY, // THREE.MOUSE.DOLLY instead of ZOOM for TrackballControls
      RIGHT: THREE.MOUSE.PAN // Enable right mouse for panning by default
    };
    // Add mechanism to disable controls during dragging
    controls.enabled = true;
    
    console.log("TrackballControls buttons configured:", controls.mouseButtons);
    controlsRef.current = controls;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS);
    gridHelper.rotation.x = -Math.PI / 2;
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    // Mark this as a permanent object that should never be removed during scene updates
    gridHelper.userData = { 
      isGrid: true,
      isPermanent: true
    };
    scene.add(gridHelper);

    // Add coordinate axes
    const axesHelper = new THREE.AxesHelper(200);
    // Mark as permanent so it doesn't get removed during scene updates
    axesHelper.userData = {
      isAxesHelper: true,
      isPermanent: true
    };
    scene.add(axesHelper);

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
        // Debug TrackballControls state in animation loop
        if (controlsRef.current) {
          // Since _state is not accessible, we use the isDragging state instead
          if (dragStateRef.current.isDragging) {
            console.log("Animation loop: Currently dragging air entry", {
              isDragging: dragStateRef.current.isDragging,
              axis: dragStateRef.current.selectedAxis
            });
          }
        }

        // Handle dragging with the ref-based approach
        const dragState = dragStateRef.current;
        if (dragState.isDragging && dragState.selectedObject && dragState.startPosition && 
            dragState.initialMousePosition && dragState.currentMousePosition) {

          // Calculate movement based on mouse delta
          const mouseDeltaX = dragState.currentMousePosition.x - dragState.initialMousePosition.x;
          const mouseDeltaY = dragState.currentMousePosition.y - dragState.initialMousePosition.y;

          // Scale factor to convert mouse pixels to scene units - consistent value
          const scaleFactor = 8.0; // Adjust this value based on testing

          if (dragState.selectedAxis === "x") {
            // Move along the X axis (left/right)
            dragState.selectedObject.position.x = dragState.startPosition.x + (mouseDeltaX * scaleFactor);
            // Log position changes to verify movement
            console.log(`Drag X: ${dragState.selectedObject.position.x.toFixed(2)}, delta: ${mouseDeltaX}`);
          } else if (dragState.selectedAxis === "z") {
            // Move along the Z axis (up/down) - inverted Y movement feels more natural
            dragState.selectedObject.position.z = dragState.startPosition.z - (mouseDeltaY * scaleFactor);
            // Log position changes to verify movement
            console.log(`Drag Z: ${dragState.selectedObject.position.z.toFixed(2)}, delta: ${mouseDeltaY}`);
          }

          // Always force a render during dragging
          needsRenderRef.current = true;
        }

      // Only update controls and render when needed
      if (controlsRef.current) {
        controlsRef.current.update();
        needsRenderRef.current = true; // Controls moving requires a render
      }
      // Apply visual feedback if selection state changed or during drag operations
      if (selectedAirEntry?.object && sceneRef.current) {
        highlightSelectedAirEntry(selectedAirEntry.object, true, dragStateRef);
        highlightSelectedAxis(
          sceneRef.current,
          selectedAirEntry.object, 
          dragStateRef.current.selectedAxis // Use the axis from ref instead of React state
        );
        needsRenderRef.current = true; // Selection state changed, needs a render
      }

      // Apply hover effect
      if (sceneRef.current) {
        highlightHoveredArrow(
          sceneRef.current,
          hoveredArrow,
          selectedAirEntry,
          dragStateRef.current.selectedAxis, // Use axis from ref instead of React state
        );
        if (hoveredArrow) {
          needsRenderRef.current = true;
        }
      }
        // Render the scene if needed
        if (
          needsRenderRef.current &&
          rendererRef.current &&
          sceneRef.current &&
          cameraRef.current
        ) {
          // Always render during drag operations for smooth feedback
          const isDraggingNow = dragStateRef.current.isDragging;

          if (isDraggingNow) {
            console.log("Rendering during drag operation");
          }

          rendererRef.current.render(sceneRef.current, cameraRef.current);

          // Only reset the needs render flag if we're not dragging
          // During dragging we want to render every frame
          if (!isDraggingNow) {
            needsRenderRef.current = false;
          }
        }
    };
    animate();

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
      // Add detailed logging about current state
      console.log("==== MEASUREMENT DEBUG ====");
      console.log("Measurement mode active (ref):", isMeasureModeRef.current);
      console.log("Current measurementStateRef:", measurementStateRef.current);
      console.log("Mouse button:", event.button);

      // Only process right mouse button (button code 2) when in measure mode (using ref)
      if (event.button !== 2 || !isMeasureModeRef.current) return;

      // Prevent default to avoid context menu during measurements
      event.preventDefault();
      event.stopPropagation();

      // Get mouse coordinates for raycasting
      const mouseCoords = getMouseCoordinates(event);

      // Get the intersection point in 3D space
      const intersectionPoint = getRaycastPoint(mouseCoords);

      if (intersectionPoint) {
        console.log("Got intersection point:", intersectionPoint);

        if (!measurementStateRef.current.inProgress) {
          // First click - set start point
          console.log("FIRST CLICK - Setting start point");
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
      // Prevent the default context menu
      event.preventDefault();

      // Get mouse position for raycasting
      if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;

      const mouseCoords = getMouseCoordinates(event);

      // Set up raycaster
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseCoords, cameraRef.current);

      // Find all meshes in the scene that represent air entries or their axes
      const airEntryMeshes: THREE.Mesh[] = [];
      const axesHelpers: THREE.Object3D[] = [];

      sceneRef.current.traverse((object) => {
        // Collect air entry meshes
        if (
          object instanceof THREE.Mesh &&
          object.userData &&
          object.userData.type &&
          ["window", "door", "vent"].includes(object.userData.type)
        ) {
          airEntryMeshes.push(object as THREE.Mesh);
        }

        // Collect axis objects
        if (
          (object instanceof THREE.ArrowHelper ||
            (object instanceof THREE.Mesh &&
              object.userData?.type === "axis")) &&
          (object.userData?.direction === "x" ||
            object.userData?.direction === "z")
        ) {
          axesHelpers.push(object);
        }
      });

      // Check for direct intersections with air entries or axes
      const axesIntersects = raycaster.intersectObjects(axesHelpers, false);
      const airEntryIntersects = raycaster.intersectObjects(airEntryMeshes, false);

      const isClickingActionable = axesIntersects.length > 0 || airEntryIntersects.length > 0;
      console.log("Right-click detected, clicking actionable:", isClickingActionable, 
                  "axes hits:", axesIntersects.length, "air entries hits:", airEntryIntersects.length);

      if (!isClickingActionable) {
        // Not clicking on an air entry or axis, let TrackballControls handle it
        console.log("Not clicking actionable, allowing TrackballControls to handle");
        return;
      }

      console.log("Clicking on air entry or axis, handling air entry interaction");

      // Use the ref to determine if we're in measure mode
      if (isMeasureModeRef.current) {
        console.log("DIVERTING TO MEASUREMENT HANDLER");
        handleMeasurementMouseDown(event);
        return;
      }

      // Handle axis clicks first
      if (axesIntersects.length > 0) {
        const axisObject = axesIntersects[0].object;
        console.log('Axis clicked:', axisObject.userData);

        // Get axis type from userData
        const axisDirection = axisObject.userData?.direction;

        if (axisDirection === 'x' || axisDirection === 'z') {
          // Check if we have a parent entry index stored in the axis userData
          const parentEntryIndex = axisObject.userData?.parentEntryIndex;
          let closestAirEntry: THREE.Mesh | null = null;
          
          if (parentEntryIndex !== undefined && parentEntryIndex >= 0 && 
              parentEntryIndex < airEntryMeshes.length) {
            // Use the parent entry index directly if available
            closestAirEntry = airEntryMeshes[parentEntryIndex];
            console.log("Found air entry using parentEntryIndex:", parentEntryIndex);
          } else {
            // Fall back to distance-based lookup if no parent index
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
          }

          // No need to use React state for axis direction anymore, we'll use the ref
          // and trigger updates through dragStateUpdate

          // Store which air entry we're manipulating
          const airEntryData = (closestAirEntry as THREE.Mesh).userData;

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
              index = floorData.airEntries.findIndex(
                (entry) =>
                  entry.position.x === airEntryData.position.x &&
                  entry.position.y === airEntryData.position.y,
              );
              console.log("Found entry index by position search:", index);
            }

            if (index !== -1) {
              // Update React state for UI
              setSelectedAirEntry({
                index: index,
                entry: floorData.airEntries[index],
                object: closestAirEntry,
              });

              // We only need to update the ref for actual dragging logic
              // Move everything into dragStateRef for less state split
              dragStateRef.current = {
                isDragging: true,
                selectedAxis: axisDirection as "x" | "z",
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
                lastDraggedObjectId: null
              };

              // Immediately disable controls when dragging starts
              if (controlsRef.current) {
                controlsRef.current.enabled = false;
              }

              console.log("Started dragging with axis:", axisDirection);
              console.log("Started dragging", { 
                axis: axisDirection,
                isDragging: dragStateRef.current.isDragging
              });
            }
          }
        }
      } else if (airEntryIntersects.length > 0) {
        // Check for intersections with air entry meshes if no axis was clicked
        console.log("Air entry clicked directly");

        const mesh = airEntryIntersects[0].object as THREE.Mesh;
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
            // Clear selectedAxis in dragStateRef
            dragStateRef.current.selectedAxis = null;
          }
        }
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      // Handle measurement preview if in measuring mode and we have a start point
      if (isMeasuring && measureStartPoint) {
        const mouseCoords = getMouseCoordinates(event);
        const intersectionPoint = getRaycastPoint(mouseCoords);
        
        if (intersectionPoint) {
          // Update the temporary measurement line
          updateActiveMeasurement(measureStartPoint, intersectionPoint);
        }
        
        // Always force a render during measurement
        needsRenderRef.current = true;
        return;
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

        // Trigger UI update via counter only periodically to avoid excessive rerenders
        // Use a throttling approach with a mod operation on frameCount
        const frameCount = rendererRef.current?.info.render.frame || 0;
        if (frameCount % 5 === 0) { // Update UI every 5 frames
          setDragStateUpdate(prev => prev + 1);
        }

        // No position updates here - let the animation loop handle it
        console.log("Mouse move during drag", {
          x: event.clientX,
          y: event.clientY,
          axis: dragStateRef.current.selectedAxis
        });
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
        // Reset hovering state at the start of each move
        isHoveringActionableRef.current = false;

        console.log("hover state:", {
          isHovering: isHoveringActionableRef.current,
          hoveredArrow: hoveredArrow ? true : false
        });
        
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
              // Mark that we're hovering over an actionable element
              isHoveringActionableRef.current = true;
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
            // Mark that we're hovering over an actionable element
            isHoveringActionableRef.current = true;
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
      // Only process right mouse button releases
      if (event.button !== 2) {
        return;
      }

      console.log("Mouse up detected", { 
        button: event.button, 
        refIsDragging: dragStateRef.current.isDragging,
        refAxis: dragStateRef.current.selectedAxis
      });

      // Check if we were dragging
      if (dragStateRef.current.isDragging && dragStateRef.current.selectedObject) {
        // If we were dragging, handle the position update
        if (onUpdateAirEntry) {
          // Get the current floor data
          const floorData = floors[currentFloor];
          const entryIndex = dragStateRef.current.entryIndex;

          // Ensure we have valid index
          if (floorData && floorData.airEntries && entryIndex >= 0 && entryIndex < floorData.airEntries.length) {
            const currentEntry = floorData.airEntries[entryIndex];

            // Convert the 3D position back to 2D
            const newPosition3D = dragStateRef.current.selectedObject.position;

            // Update the air entry position
            const dimensions = { width: 800, height: 600 };
            const centerX = dimensions.width / 2;
            const centerY = dimensions.height / 2;

            // Reverse the transform2DTo3D function
            const newX = newPosition3D.x / PIXELS_TO_CM + centerX;
            const newY = centerY - newPosition3D.y / PIXELS_TO_CM;

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

            console.log("Finalizing position update:", {
              from: currentEntry.position,
              to: updatedEntry.position,
              object3DPosition: newPosition3D
            });

            // Call the update callback - but store the updated entry for verification
            onUpdateAirEntry(currentFloor, entryIndex, updatedEntry);
            
            // Instead of completely rebuilding the scene, just update the air entry's position
            console.log("Air entry position updated:", {
              floorName: currentFloor,
              entryIndex,
              newPosition: updatedEntry.position
            });
            
            // The real scene update will happen in the next render cycle due to floors state change
            // Force a render to ensure we see the update immediately
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
              needsRenderRef.current = true;
              rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
          }
        }

        // Store which object was just dragged to prevent selection issues
        const lastDraggedObjectId = dragStateRef.current.selectedObject?.id?.toString() || null;
        
        // Keep a reference to the object that was being dragged
        const draggedObject = dragStateRef.current.selectedObject;
        const draggedEntryIndex = dragStateRef.current.entryIndex;
        
        // Reset the drag state ref EXCEPT we save the selected object
        dragStateRef.current = {
          isDragging: false,
          selectedAxis: null,
          startPosition: null,
          initialMousePosition: null,
          currentMousePosition: null,
          selectedObject: draggedObject, // Keep this reference
          entryIndex: draggedEntryIndex, // Keep this reference
          lastDraggedObjectId // Store the last dragged object ID to prevent selection issues
        };
        
        // Trigger UI update through the update counter
        setDragStateUpdate(prev => prev + 1);
        
        // Keep the selection active to allow for consecutive drags
        // By not clearing selectedAirEntry, we maintain the selection state
        // Don't reset selection at all after a successful drag operation
        // This allows for immediate consecutive dragging
      }

      // Always re-enable controls, but without any complex state manipulation
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }

      console.log("Dragging stopped, states reset");
    };

    // Now add the event listeners
    console.log("Setting up event listeners on canvas:", canvas);

    canvas.addEventListener("contextmenu", (e) => {
      console.log("Context menu prevented", {
        controls: controlsRef.current ? {
          enabled: controlsRef.current.enabled
          // Removing _state property access since it doesn't exist on TrackballControls
        } : null,
        isDragging: dragStateRef.current.isDragging
      });
      e.preventDefault();
    });

    // Handle left-click for clearing selection
    canvas.addEventListener("click", (e) => {
      // Skip if part of a double-click
      if (ignoreNextClick) {
        setIgnoreNextClick(false);
        return;
      }

      // If we have a dragging operation going on, don't clear selection
      if (dragStateRef.current.isDragging) {
        return;
      }

      // Check if we clicked on an air entry
      if (!cameraRef.current || !sceneRef.current) return;
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
      
      // Find all air entry meshes
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
      
      // If we didn't click on an air entry, clear the selection
      const intersects = raycaster.intersectObjects(airEntryMeshes, false);
      if (intersects.length === 0) {
        // Clear selection if we're not clicking on an air entry
        if (selectedAirEntry) {
          console.log("Clearing selection - clicked outside of air entry");
          setSelectedAirEntry(null);
          // Clear selected axis info from ref instead of using React state
          dragStateRef.current.selectedAxis = null;
          // Trigger UI update
          setDragStateUpdate(prev => prev + 1);
        }
      }
    });

    canvas.addEventListener("mousedown", (e) => {
      console.log("Canvas mousedown detected, button:", e.button, {
        controls: controlsRef.current ? {
          enabled: controlsRef.current.enabled
          // Removing _state property access since it doesn't exist on TrackballControls
        } : null
      });
      if (e.button === 2) {
        // Always call our handler, which will determine if we need to intercept
        // or let TrackballControls handle it
        handleRightMouseDown(e);
      }
    });

    // Use document instead of window for more reliable event capture
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    console.log("All event listeners attached successfully");


    // Add double-click handler for air entry editing
    const handleDoubleClick = (event: MouseEvent) => {
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
          foundIndex = floorData.airEntries.findIndex(
            (entry) =>
              entry.position.x === airEntryData.position.x &&
              entry.position.y === airEntryData.position.y,
          );

          if (foundIndex !== -1) {
            setEditingAirEntry({
              index: foundIndex,
              entry: floorData.airEntries[foundIndex],
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
          handleRightMouseDown,
        );
        renderer.domElement.removeEventListener("click", (e) => {
          // Click handler for clearing selection
          if (ignoreNextClick) {
            setIgnoreNextClick(false);
            return;
          }
          
          // Clear selection logic
        });
        renderer.domElement.removeEventListener("dblclick", handleDoubleClick);

        // Dispose renderer
        renderer.dispose();

        // Remove canvas
        if (containerRef.current) {
          containerRef.current.removeChild(renderer.domElement);
        }
      }

      // Remove global event listeners
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    console.log("Canvas3D received floors data:", floors);

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

    // Clear previous geometry (except lights, helpers, and permanent objects)
    const toRemove: THREE.Object3D[] = [];
    sceneRef.current.traverse((object) => {
      if (
        (object instanceof THREE.Mesh ||
         object instanceof THREE.Sprite ||
         object instanceof THREE.ArrowHelper ||
         object instanceof THREE.Line) &&
        // Don't remove objects marked as permanent
        (!object.userData?.isPermanent)
      ) {
        toRemove.push(object);
      }
    });
    console.log(`Removing ${toRemove.length} objects during scene rebuild, preserving permanent objects`);
    toRemove.forEach((object) => sceneRef.current?.remove(object));

    // Create and add objects for each floor
    Object.entries(floors).forEach(([floorName, floorData]) => {
      if (floorData.hasClosedContour || floorName === currentFloor) {
        const baseHeight = getFloorBaseHeight(floorName);
        const objects = createFloorObjects(
          floorData,
          baseHeight,
          floorName === currentFloor,
        );
        objects.forEach((obj) => sceneRef.current?.add(obj));
      }
    });

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
            highlightSelectedAirEntry(newMeshObject, true, dragStateRef);

            if (sceneRef.current && dragStateRef.current.selectedAxis) {
              highlightSelectedAxis(
                sceneRef.current,
                newMeshObject,
                dragStateRef.current.selectedAxis,
              );
            }
          } else {
            // If we couldn't find the matching object, reset selection
            console.log("Could not find matching mesh for selected air entry, resetting selection");
            setSelectedAirEntry(null);
            // No need for setSelectedAxis, directly update ref
            dragStateRef.current.selectedAxis = null;
            setIsDragging(false);
            dragStateRef.current = {
              isDragging: false,
              selectedAxis: null,
              startPosition: null,
              initialMousePosition: null,
              currentMousePosition: null,
              selectedObject: null,
              entryIndex: -1,
              lastDraggedObjectId: null
            };
          }
        } else {
          // Entry no longer exists, reset selection
          setSelectedAirEntry(null);
          // Update through ref instead of React state
          dragStateRef.current.selectedAxis = null;
          setIsDragging(false);
          dragStateRef.current = {
            isDragging: false,
            selectedAxis: null,
            startPosition: null,
            initialMousePosition: null,
            currentMousePosition: null,
            selectedObject: null,
            entryIndex: -1,
            lastDraggedObjectId: null
          };
        }
      } else {
        // Current floor data not found, reset selection
        setSelectedAirEntry(null);
        // Update through ref instead of React state
        dragStateRef.current.selectedAxis = null;
        setIsDragging(false);
        dragStateRef.current = {
          isDragging: false,
          selectedAxis: null,
          startPosition: null,
          initialMousePosition: null,
          currentMousePosition: null,
          selectedObject: null,
          entryIndex: -1,
          lastDraggedObjectId: null
        };
      }
    } else {
      // No previous selection, make sure states are reset
      // We don't need setSelectedAxis anymore, directly update ref
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
        lastDraggedObjectId: null
      };
    }
  }, [floors, currentFloor, ceilingHeight, floorDeckThickness]);

  useEffect(() => {
    // Mark that rendering is needed when selection or drag state changes
    if (needsRenderRef.current !== undefined) {
      needsRenderRef.current = true;
      
      const dragState = dragStateRef.current;
      console.log("State changed - marking for render", { 
        isDragging: dragState.isDragging, 
        selectedAxis: dragState.selectedAxis,
        hasSelectedEntry: !!selectedAirEntry
      });

      // If we were dragging, recreate the controls to ensure a clean state
      if (dragState.isDragging) {
        if (controlsRef.current) {
          console.log("Disposing and recreating TrackballControls after drag");

          // Remember the current camera position and target
          const cameraPos = cameraRef.current ? cameraRef.current.position.clone() : null;
          const controlsTarget = controlsRef.current.target.clone();

          // Dispose the old controls
          controlsRef.current.dispose();

          // Create new controls
          if (cameraRef.current && rendererRef.current) {
            const newControls = new TrackballControls(cameraRef.current, rendererRef.current.domElement);
            newControls.rotateSpeed = 2.0;
            newControls.zoomSpeed = 1.2;
            newControls.panSpeed = 0.8;
            newControls.noZoom = false;
            newControls.noPan = false;
            newControls.staticMoving = true;
            newControls.dynamicDampingFactor = 0.2;

            // Configure mouse buttons
            newControls.mouseButtons = {
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.PAN
            };

            // Restore camera target
            newControls.target.copy(controlsTarget);

            // Replace the old controls
            controlsRef.current = newControls;

            console.log("New TrackballControls created with clean state");
          }
        }
      } else {
        // For normal cases, just ensure controls are enabled
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }
      }
    }
  }, [selectedAirEntry, dragStateUpdate]);

  useEffect(() => {
    // If dialog opens, cancel any dragging operation
    if (editingAirEntry) {
      // Reset drag state in ref instead of using React state
      dragStateRef.current = {
        isDragging: false,
        selectedAxis: null,
        startPosition: null,
        initialMousePosition: null,
        currentMousePosition: null,
        selectedObject: null,
        entryIndex: -1,
        lastDraggedObjectId: null
      };
      // Update to trigger UI refresh
      setDragStateUpdate(prev => prev + 1);
    }
  }, [editingAirEntry]);

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
    console.log("isMeasureMode prop changed:", isMeasureMode);
    console.log("Setting isMeasuring state to:", isMeasureMode);

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
        console.log("Set cursor to crosshair - measure mode active");
      } else {
        containerRef.current.style.cursor = 'auto';
        containerRef.current.title = '';
        console.log("Set cursor to auto - measure mode inactive");
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

  return (
    <>
      <div ref={containerRef} className="w-full h-full" />

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
    </>
  );
}
