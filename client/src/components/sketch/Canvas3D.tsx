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

// Utility function to normalize floor names consistently across the application
const normalizeFloorName = (floorName: string): string => {
  // Convert to lowercase and remove spaces - ensure consistent keys for storage/retrieval
  return floorName.toLowerCase().replace(/\s+/g, '');
};

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

// Utility function to find connected points and create a perimeter
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

  // Store the positions of air entries that have been updated via dragging
  // This is used to ensure they keep their positions when the scene is rebuilt
  // Format: { floorName: { entryIndex: { x, y } } }
  const updatedAirEntryPositionsRef = useRef<{
    [floorName: string]: {
      [entryIndex: number]: { x: number, y: number }
    }
  }>({});
  const dragStateRef = useRef({
    isDragging: false,
    selectedAxis: null as "x" | "z" | null,
    startPosition: null as THREE.Vector3 | null,
    initialMousePosition: null as {x: number, y: number} | null,
    selectedObject: null as THREE.Mesh | null,
    currentMousePosition: null as {x: number, y: number} | null,
    entryIndex: -1
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

    // Check if we have stored updated positions for this floor - use the shared normalization function
    const normalizedFloorName = normalizeFloorName(floorData.name);
    console.log(`[POSITION RETRIEVAL] Checking for positions with floor key: '${normalizedFloorName}'`);
    console.log(`[POSITION RETRIEVAL] Raw floor name: '${floorData.name}', Normalized to: '${normalizedFloorName}'`);
    console.log(`[POSITION RETRIEVAL] All stored positions:`, JSON.stringify(updatedAirEntryPositionsRef.current));

    // Try both possible keys for maximum compatibility during transition
    let updatedPositions = updatedAirEntryPositionsRef.current[normalizedFloorName] || {};

    // If nothing is found with the normalized name, try the original 'ground' key as fallback
    // This handles the existing data during transition
    if (Object.keys(updatedPositions).length === 0 && normalizedFloorName === 'groundfloor') {
        console.log(`[POSITION RETRIEVAL] No positions found with '${normalizedFloorName}', trying 'ground' as fallback`);
        updatedPositions = updatedAirEntryPositionsRef.current['ground'] || {};
    }

    console.log(`[POSITION RETRIEVAL] Retrieved positions for '${normalizedFloorName}':`, JSON.stringify(updatedPositions));

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
        // Use dimensions directly as they are already in cm
        const width = entry.dimensions.width;
        const height = entry.dimensions.height;
        const zPosition =
          baseHeight +
          (entry.type === "door"
            ? height / 2
            : entry.dimensions.distanceToFloor || 0);

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

        // Check if we have a stored position for this entry
        const updatedPosition = updatedPositions[index];
        console.log(`[POSITION LOADING] Checking for stored position for entry ${index}:`, {
          updatedPositionsExists: !!updatedPositions,
          haveUpdatedPosition: !!updatedPosition,
          updatedPositionValue: updatedPosition,
          entryOriginalPosition: entry.position,
          entryIndex: index,
          floorName: floorData.name,
          normalizedFloorName: normalizedFloorName,
          allPositionsStoredForThisFloor: JSON.stringify(updatedPositions),
          allFloorEntries: floorData.airEntries.length
        });

        // Create a working copy of the entry position
        let entryPosition = { ...entry.position };

        // If we have a stored position from previous dragging, use it
        if (updatedPosition) {
          console.log(`[POSITION LOADING] Using stored position for entry ${index}:`, {
            from: entry.position,
            to: updatedPosition,
            diffX: updatedPosition.x - entry.position.x,
            diffY: updatedPosition.y - entry.position.y
          });
          entryPosition = updatedPosition;
        } else {
          console.log(`[POSITION LOADING] No stored position found for entry ${index}, using original position:`, entry.position);
        }

        const mesh = new THREE.Mesh(geometry, material);
        const position = transform2DTo3D(entryPosition);
        mesh.position.set(position.x, position.y, zPosition);

        // Add userData for raycasting identification - include the actual entry index for easy mapping
        mesh.userData = {
          type: entry.type,
          position: entryPosition, // Use the potentially updated position
          dimensions: entry.dimensions,
          line: entry.line,
          index: objects.length,
          entryIndex: index  // Add the actual index in the airEntries array
        };

        console.log(`AIR ENTRY userData for mesh at index ${index}:`, {
          meshPosition3D: { x: position.x, y: position.y, z: zPosition },
          userData: mesh.userData,
          originalEntry: entry
        });

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

      // Add yellow sphere marker
      const markerGeometry = new THREE.SphereGeometry(5, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(position.x, position.y, zPosition);
      objects.push(marker);

      // Add coordinate system axes
      const axisLength = 50; // Length of the coordinate axes
      console.log(`Creating custom axis arrows for entry at position ${position.x}, ${position.y}, ${zPosition}`);

      // Store the entry's index in airEntries array for direct reference
      const parentMeshIndex = objects.length - 1;
      console.log("AXIS CREATION:", {
        entryType: entry.type,
        entryPosition: entry.position,
        entryIndex: index,
        parentMeshIndex: parentMeshIndex,
        totalObjects: objects.length
      });

      // Create custom axis meshes that are better for intersection detection
      
      // Calculate proper axis directions
      // We want:
      // - X axis (red) to be horizontal along the wall
      // - Y axis (green) to be vertical
      // - Z axis (blue) normal to the wall surface, pointing outward from the volume
      
      // First, calculate the wall direction vector (from start to end of the wall)
      const wallVector = new THREE.Vector3(
        entry.line.end.x - entry.line.start.x,
        entry.line.end.y - entry.line.start.y,
        0
      ).normalize();
      
      // X axis should point along the wall direction
      const xDirection = wallVector;
      
      // Y axis is always vertical
      const yDirection = new THREE.Vector3(0, 0, 1);
      
      // Z axis must be perpendicular to the wall surface, pointing outward from the room
      // We need to determine which side of the wall is "outside" by checking against room contour
      // First, calculate a basic perpendicular vector
      // For a 2D vector (x,y), perpendicular vectors are (-y,x) or (y,-x)
      
      // Calculate both possible perpendicular vectors
      const perpOption1 = new THREE.Vector3(-wallVector.y, wallVector.x, 0).normalize();
      const perpOption2 = new THREE.Vector3(wallVector.y, -wallVector.x, 0).normalize();
      
      // Choose the one that points outward - using the midpoint of the air entry as reference
      const centerPoint = new THREE.Vector3(
        (entry.line.start.x + entry.line.end.x) / 2,
        (entry.line.start.y + entry.line.end.y) / 2,
        0
      );
      
      // We choose the direction that points away from the room center (generally at origin)
      // By checking which direction increases the distance from origin
      const testPoint1 = new THREE.Vector3().addVectors(centerPoint, perpOption1);
      const testPoint2 = new THREE.Vector3().addVectors(centerPoint, perpOption2);
      
      // Calculate distances from origin
      const distanceOrigin = centerPoint.length();
      const distance1 = testPoint1.length();
      const distance2 = testPoint2.length();
      
      // Choose the vector that increases distance from origin (points outward)
      const zDirection = distance1 > distanceOrigin ? perpOption1 : perpOption2;
      
      // X axis - Red (Horizontal along wall)
      const xAxisGeometry = new THREE.CylinderGeometry(5, 5, axisLength, 8);
      xAxisGeometry.rotateZ(-Math.PI / 2); // Initially pointing along X
      const xAxisMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 });
      const xAxis = new THREE.Mesh(xAxisGeometry, xAxisMaterial);
      
      // Position the axis cylinder along the wall direction
      xAxis.position.set(
        position.x + axisLength/2 * xDirection.x, 
        position.y + axisLength/2 * xDirection.y, 
        zPosition
      );
      
      // Align with wall direction
      const xAxisMatrix = new THREE.Matrix4();
      xAxisMatrix.lookAt(
        new THREE.Vector3(0, 0, 0), 
        xDirection, 
        new THREE.Vector3(0, 0, 1)
      );
      xAxis.setRotationFromMatrix(xAxisMatrix);
      
      xAxis.userData = { 
        type: 'axis', 
        direction: 'x',
        parentEntryIndex: parentMeshIndex, // Reference to the parent mesh
        actualEntryIndex: index // Store the actual entry index from the floor data
      };

      // Y axis - Green (Vertical)
      const yAxisGeometry = new THREE.CylinderGeometry(3, 3, axisLength, 8);
      // No rotation needed as cylinder is already aligned with Y axis
      const yAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6 });
      const yAxis = new THREE.Mesh(yAxisGeometry, yAxisMaterial);
      
      // Position at air entry, extending upward vertically
      yAxis.position.set(
        position.x, 
        position.y, 
        zPosition + axisLength/2
      );
      
      // Y axis is always vertical, no special rotation needed
      yAxis.userData = { 
        type: 'axis', 
        direction: 'y',
        parentEntryIndex: objects.length - 1
      };

      // Z axis - Blue (Normal to wall, pointing outward)
      const zAxisGeometry = new THREE.CylinderGeometry(5, 5, axisLength, 8);
      zAxisGeometry.rotateZ(-Math.PI / 2); // Initially pointing along X (we'll rotate it to point perpendicular)
      const zAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.8 });
      const zAxis = new THREE.Mesh(zAxisGeometry, zAxisMaterial);
      
      // Position the z-axis cylinder - extending outward perpendicular to the wall
      zAxis.position.set(
        position.x + axisLength/2 * zDirection.x, 
        position.y + axisLength/2 * zDirection.y, 
        zPosition
      );
      
      // Align with direction perpendicular to the wall
      const zAxisMatrix = new THREE.Matrix4();
      zAxisMatrix.lookAt(
        new THREE.Vector3(0, 0, 0), 
        zDirection, 
        new THREE.Vector3(0, 0, 1)
      );
      zAxis.setRotationFromMatrix(zAxisMatrix);
      
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

    // Configure mouse buttons - don't use right button for controls
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY, // THREE.MOUSE.DOLLY instead of ZOOM for TrackballControls
      RIGHT: THREE.MOUSE.PAN // Enable right mouse panning in controls
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
      console.log("Adding coordinate axes helper");
      const axesHelper = new THREE.AxesHelper(200);
      scene.add(axesHelper);
    } else {
      console.log("Axes helper already exists, skipping creation");
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
            object.userData?.direction === "z")
        ) {
          console.log("✅ Adding to axesHelpers");
          axesHelpers.push(object);
        }
      });

      console.log(
        `Scene traversal complete - found: ${meshCount} meshes, ${arrowCount} arrows, ${otherObjectCount} other objects`,
      );
      console.log(
        "After traversal - Air entry meshes found:",
        airEntryMeshes.length,
      );
      console.log("After traversal - Axis helpers found:", axesHelpers.length);

      // First check for intersections with axes
      console.log('Testing intersection with', axesHelpers.length, 'axes');
      const axesIntersects = raycaster.intersectObjects(axesHelpers, false);
      console.log('Axes intersections found:', axesIntersects.length);

      if (axesIntersects.length > 0) {
        const axisObject = axesIntersects[0].object;
        console.log('Axis clicked:', axisObject.userData);

        // Get axis type from userData
        const axisDirection = axisObject.userData?.direction;

        if (axisDirection === 'x' || axisDirection === 'z') {
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
                  setSelectedAxis(axisDirection as "x" | "z");

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
                        const parentMeshIndex = axisObject.userData.parentEntryIndex;
                        console.log("Looking for parent mesh with index:", parentMeshIndex);

                        // Find the parent mesh
                        let parentMesh: (THREE.Mesh & {userData: {entryIndex?: number}}) | null = null;
                        sceneRef.current?.traverse((object) => {
                          if (object instanceof THREE.Mesh && 
                              object.userData && 
                              object.userData.type && 
                              ["window", "door", "vent"].includes(object.userData.type) && 
                              object.userData.index === parentMeshIndex) {
                            // Cast the object to the right type
                            parentMesh = object as THREE.Mesh & {userData: {entryIndex?: number}};
                          }
                        });

                        if (parentMesh && parentMesh.userData && typeof parentMesh.userData.entryIndex === 'number') {
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

                  // IMPORTANT: Update the ref for actual dragging logic
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
                    entryIndex: index
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

        // No position updates here - let the animation loop handle it
        console.log("Mouse move during drag", {
          x: event.clientX,
          y: event.clientY,
          axis: dragStateRef.current.selectedAxis,
          dragging: dragStateRef.current.isDragging,
          reactIsDragging: isDragging,
          selectedAxis: selectedAxis
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
            updatedAirEntryPositionsRef.current[normalizedFloorName][entryIndex] = {
              x: updatedEntry.position.x,
              y: updatedEntry.position.y
            };

            // For backward compatibility with existing code, also store under 'ground' key 
            // if this is the ground floor (transitional approach)
            if (normalizedFloorName === 'groundfloor') {
              if (!updatedAirEntryPositionsRef.current['ground']) {
                updatedAirEntryPositionsRef.current['ground'] = {};
              }
              updatedAirEntryPositionsRef.current['ground'][entryIndex] = {
                x: updatedEntry.position.x,
                y: updatedEntry.position.y
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
          entryIndex: -1
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

    // Handle mousedown events
    const mouseDownWrapper = (e: MouseEvent) => {
      if (e.button === 2) {
        // Right mouse button for both measurements and context operations
        handleRightMouseDown(e);
      }
    };

    canvas.addEventListener("mousedown", mouseDownWrapper);

    // Create named handlers for event tracking
    const mouseMoveHandler = (e: MouseEvent) => {
      handleMouseMove(e);
    };

    const mouseUpHandler = (e: MouseEvent) => {
      handleMouseUp(e);
    };

    // Use document instead of window for more reliable event capture
    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);

    // We don't need periodic checking anymore since we're preventatively recreating controls after each drag

    // All event listeners are now attached


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

    // Log detailed information about all air entries for debugging purposes
    Object.entries(floors).forEach(([floorName, floorData]) => {
      if (floorData.airEntries?.length) {
        console.log(`DEBUG - FLOOR STATE: Floor ${floorName} has ${floorData.airEntries.length} air entries:`, 
          floorData.airEntries.map((entry, idx) => ({
            index: idx,
            type: entry.type,
            position: entry.position,
            dimensions: entry.dimensions
          }))
        );
      }
    });

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
        console.log("Preserving axis label during scene rebuild:", object.userData.axis);
        return;
      }
      
      // Skip axis helper
      if (object instanceof THREE.AxesHelper) {
        console.log("Preserving axes helper during scene rebuild");
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
    
    // Log what we're about to remove
    console.log(`Removing ${toRemove.length} objects during scene rebuild`);
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
              entryIndex: -1
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
            entryIndex: -1
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
          entryIndex: -1
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
        entryIndex: -1
      };
    }
  }, [floors, currentFloor, ceilingHeight, floorDeckThickness]);

  useEffect(() => {
    // Mark that rendering is needed when selection or dragging state changes
    if (needsRenderRef.current !== undefined) {
      needsRenderRef.current = true;
      console.log("State changed - marking for render", { 
        isDragging, 
        selectedAxis,
        hasSelectedEntry: !!selectedAirEntry
      });

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
