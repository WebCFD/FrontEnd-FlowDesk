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

interface Canvas3DProps {
  floors: Record<string, FloorData>;
  currentFloor: string;
  ceilingHeight?: number;
  floorDeckThickness?: number;
  onUpdateAirEntry?: (floorName: string, index: number, entry: AirEntry) => void;
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
  onUpdateAirEntry, // Add this
}: Canvas3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  // State for editing air entries
  const [editingAirEntry, setEditingAirEntry] = useState<{
    index: number;
    entry: AirEntry;
  } | null>(null);
  const [ignoreNextClick, setIgnoreNextClick] = useState<boolean>(false);

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
    }
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
    let destinationFloor = stairPolygon.connectsTo || 
    getConnectedFloorName(stairPolygon.floor, stairPolygon.direction || 'up');

    // For debugging, add this line to see what's happening
    console.log(`Creating stair from ${stairPolygon.floor} to ${destinationFloor}`, 
                `Direction: ${stairPolygon.direction}`, stairPolygon);

    // Format the floor names for display
    const sourceFloorFormatted = stairPolygon.floor.charAt(0).toUpperCase() + stairPolygon.floor.slice(1) + " Floor";
    const destFloorFormatted = destinationFloor.charAt(0).toUpperCase() + destinationFloor.slice(1) + " Floor";

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
      padding: 10 // Add padding to ensure text is fully visible
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
        opacity: isCurrentFloor ? 0.5 : 0.3,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const wall = new THREE.Mesh(geometry, wallMaterial);
      objects.push(wall);
    });

    // Create air entries (windows, doors, vents)
    floorData.airEntries.forEach((entry) => {
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
        opacity: isCurrentFloor ? 0.6 : 0.4,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      const position = transform2DTo3D(entry.position);
      mesh.position.set(position.x, position.y, zPosition);

      // Add userData for raycasting identification
      mesh.userData = {
        type: entry.type,
        position: entry.position,
        dimensions: entry.dimensions,
        line: entry.line,
        index: objects.length
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

      // Add yellow sphere marker
      const markerGeometry = new THREE.SphereGeometry(5, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(position.x, position.y, zPosition);
      objects.push(marker);

      // Add coordinate system axes
      const axisLength = 50; // Length of the coordinate axes

      // X axis - Red (Right)
      const xArrow = new THREE.ArrowHelper(
        right,
        new THREE.Vector3(position.x, position.y, zPosition),
        axisLength,
        0xff0000,
      );

      // Y axis - Green (Forward/Normal)
      const yArrow = new THREE.ArrowHelper(
        forward,
        new THREE.Vector3(position.x, position.y, zPosition),
        axisLength,
        0x00ff00,
      );

      // Z axis - Blue (Up)
      const zArrow = new THREE.ArrowHelper(
        up,
        new THREE.Vector3(position.x, position.y, zPosition),
        axisLength,
        0x0000ff,
      );

      objects.push(xArrow, yArrow, zArrow);

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

    // Initialize controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;
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

    // Add coordinate axes
    const axesHelper = new THREE.AxesHelper(200);
    scene.add(axesHelper);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
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
      raycaster.setFromCamera({ x: mouseX, y: mouseY }, cameraRef.current);

      // Find all meshes in the scene that represent air entries
      const airEntryMeshes: THREE.Mesh[] = [];
      sceneRef.current.traverse((object) => {
        if (object instanceof THREE.Mesh && 
            object.userData && 
            object.userData.type && 
            ['window', 'door', 'vent'].includes(object.userData.type)) {
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
          foundIndex = floorData.airEntries.findIndex(entry => 
            entry.position.x === airEntryData.position.x && 
            entry.position.y === airEntryData.position.y
          );

          if (foundIndex !== -1) {
            setEditingAirEntry({
              index: foundIndex,
              entry: floorData.airEntries[foundIndex]
            });
          }
        }
      }
    };

    // Add the double-click event listener
    const canvas = renderer.domElement;
    canvas.addEventListener('dblclick', handleDoubleClick);

    
    return () => {
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      // Add this line to remove the double-click handler
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    console.log("Canvas3D received floors data:", floors);

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

    // Clear previous geometry (except lights and helpers)
    const toRemove: THREE.Object3D[] = [];
    sceneRef.current.traverse((object) => {
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
        const objects = createFloorObjects(
          floorData,
          baseHeight,
          floorName === currentFloor,
        );
        objects.forEach((obj) => sceneRef.current?.add(obj));
      }
    });
  }, [floors, currentFloor, ceilingHeight, floorDeckThickness]);

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
