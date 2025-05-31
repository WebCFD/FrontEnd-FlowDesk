import * as THREE from "three";

// Core interfaces - shared between Canvas3D and RSP
export interface Point {
  x: number;
  y: number;
}

export interface Line {
  start: Point;
  end: Point;
}

export interface AirEntry {
  type: "window" | "door" | "vent";
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
}

export interface StairPolygon {
  id: string;
  points: Point[];
  floor: string;
  direction?: "up" | "down";
  connectsTo?: string;
  isImported?: boolean;
  position3D?: {
    baseHeight: number;
    bottomZ: number;
    topZ: number;
  };
}

export interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  hasClosedContour: boolean;
  name: string;
  stairPolygons?: StairPolygon[];
}

// Core constants - unified across all components
export const GEOMETRY_CONFIG = {
  PIXELS_TO_CM: 25 / 20, // Standard conversion from Canvas3D
  CANVAS_DIMENSIONS: { width: 800, height: 600 },
  get centerX() { return this.CANVAS_DIMENSIONS.width / 2; },
  get centerY() { return this.CANVAS_DIMENSIONS.height / 2; },
  get aspectRatio() { return this.CANVAS_DIMENSIONS.width / this.CANVAS_DIMENSIONS.height; }
};

/**
 * Core coordinate transformation function
 * Converts 2D canvas points to 3D world space
 * This is the single source of truth for coordinate transformation
 */
export const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  const relativeX = point.x - GEOMETRY_CONFIG.centerX;
  const relativeY = GEOMETRY_CONFIG.centerY - point.y;

  return new THREE.Vector3(
    relativeX * GEOMETRY_CONFIG.PIXELS_TO_CM,
    relativeY * GEOMETRY_CONFIG.PIXELS_TO_CM,
    height,
  );
};

/**
 * Normalizes floor names for consistent storage and retrieval
 */
export const normalizeFloorName = (floorName: string): string => {
  return floorName.toLowerCase().replace(/\s+/g, '');
};

/**
 * Creates ordered perimeter points from line segments
 * Used for room geometry generation and floor area calculations
 */
export const createRoomPerimeter = (lines: Line[]): Point[] => {
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

  // Start from the first line's start point
  let currentPoint = lines[0].start;
  perimeter.push(currentPoint);
  visited.add(pointToString(currentPoint));

  while (true) {
    const currentKey = pointToString(currentPoint);
    const connectedPoints = connections.get(currentKey) || [];
    
    // Find next unvisited point
    let nextPoint = null;
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

/**
 * Configuration interface for geometry generation
 */
export interface GeometryConfig {
  currentFloor: string;
  floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number }>;
  wallTransparency: number;
  isMultifloor?: boolean;
  defaultCeilingHeight?: number;
  defaultFloorDeck?: number;
  presentationMode?: boolean; // New: for RSP usage
}

/**
 * Core geometry generation function
 * This replaces the problematic generateSharedFloorGeometry from Canvas3D
 */
export const generateFloorGeometry = (
  floors: Record<string, FloorData>,
  config: GeometryConfig
): THREE.Object3D[] => {
  const objects: THREE.Object3D[] = [];
  
  // Get current floor data
  const currentFloorData = floors[config.currentFloor];
  if (!currentFloorData) return objects;

  // Get floor parameters
  const floorParams = config.floorParameters?.[config.currentFloor] || {
    ceilingHeight: config.defaultCeilingHeight || 2.5,
    floorDeck: config.defaultFloorDeck || 0
  };

  // Generate walls
  currentFloorData.lines.forEach((line, index) => {
    const wallMesh = createWallMesh(line, floorParams.ceilingHeight, config.wallTransparency);
    wallMesh.name = `wall_${index}`;
    wallMesh.userData = { type: 'wall', index, line };
    objects.push(wallMesh);
  });

  // Generate floor
  if (currentFloorData.hasClosedContour) {
    const perimeter = createRoomPerimeter(currentFloorData.lines);
    if (perimeter.length > 2) {
      const floorMesh = createFloorMesh(perimeter, floorParams.floorDeck);
      floorMesh.name = 'floor';
      floorMesh.userData = { type: 'floor' };
      objects.push(floorMesh);
    }
  }

  // Generate air entries
  currentFloorData.airEntries.forEach((entry, index) => {
    const airEntryMesh = createAirEntryMesh(entry, floorParams.ceilingHeight, index);
    airEntryMesh.name = `${entry.type}_${index}`;
    airEntryMesh.userData = { 
      type: entry.type, 
      index, 
      entryIndex: index,
      position: entry.position 
    };
    objects.push(airEntryMesh);
  });

  return objects;
};

/**
 * Creates a wall mesh from a line
 */
const createWallMesh = (line: Line, height: number, transparency: number): THREE.Mesh => {
  const start = transform2DTo3D(line.start, 0);
  const end = transform2DTo3D(line.end, 0);
  const startTop = transform2DTo3D(line.start, height * 100); // Convert to cm
  const endTop = transform2DTo3D(line.end, height * 100);

  const vertices = new Float32Array([
    start.x, start.y, start.z,
    end.x, end.y, end.z,
    startTop.x, startTop.y, startTop.z,
    endTop.x, endTop.y, endTop.z,
  ]);

  const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    opacity: transparency,
    transparent: transparency < 1,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
};

/**
 * Creates a floor mesh from perimeter points
 */
const createFloorMesh = (perimeter: Point[], floorDeck: number): THREE.Mesh => {
  // Convert perimeter to 3D points
  const points3D = perimeter.map(point => transform2DTo3D(point, floorDeck * 100));
  
  // Create triangulated geometry
  const vertices: number[] = [];
  const indices: number[] = [];
  
  // Add vertices
  points3D.forEach(point => {
    vertices.push(point.x, point.y, point.z);
  });
  
  // Triangulate (simple fan triangulation for convex polygons)
  for (let i = 1; i < points3D.length - 1; i++) {
    indices.push(0, i, i + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
};

/**
 * Creates an air entry mesh
 */
const createAirEntryMesh = (entry: AirEntry, roomHeight: number, index: number): THREE.Mesh => {
  const position3D = transform2DTo3D(entry.position, (entry.dimensions.distanceToFloor || 0) * 100);
  
  // Create a simple box geometry for the air entry
  const width = entry.dimensions.width * GEOMETRY_CONFIG.PIXELS_TO_CM;
  const height = entry.dimensions.height * GEOMETRY_CONFIG.PIXELS_TO_CM;
  const depth = 10; // Fixed depth

  const geometry = new THREE.BoxGeometry(width, height, depth);
  
  // Choose color based on type
  let color = 0x808080; // Default gray
  let opacity = 1.0;
  
  switch (entry.type) {
    case 'window':
      color = 0x87CEEB; // Sky blue
      opacity = 0.7;
      break;
    case 'door':
      color = 0x8B4513; // Brown
      break;
    case 'vent':
      color = 0x696969; // Dim gray
      break;
  }

  const material = new THREE.MeshStandardMaterial({
    color,
    opacity,
    transparent: opacity < 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position3D);
  
  return mesh;
};