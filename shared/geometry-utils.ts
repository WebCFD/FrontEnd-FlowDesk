import * as THREE from "three";

// Types
export interface Point {
  x: number;
  y: number;
}

export interface Line {
  start: Point;
  end: Point;
}

export interface FloorParameters {
  ceilingHeight: number;
  floorDeck: number;
}

// Constants
export const FLOOR_ORDER = ["ground", "first", "second", "third", "fourth", "fifth"];

// Transform 2D point to 3D coordinates
export const transform2DTo3D = (point: Point, zHeight: number = 0): THREE.Vector3 => {
  return new THREE.Vector3(point.x, point.y, zHeight);
};

// Calculate floor base height using the same algorithm as Canvas3D
export const getFloorBaseHeight = (
  floorName: string,
  floors: Record<string, any>,
  floorParameters: Record<string, FloorParameters>,
  isMultifloor: boolean = false,
  defaultCeilingHeight: number = 220,
  defaultFloorDeck: number = 35
): number => {
  const index = FLOOR_ORDER.indexOf(floorName);
  if (index === -1) return 0;

  let baseHeight = 0;
  for (let i = 0; i < index; i++) {
    const previousFloor = FLOOR_ORDER[i];
    if (floors[previousFloor]?.hasClosedContour) {
      let floorCeilingHeight, currentFloorDeckThickness;
      
      if (isMultifloor && floorParameters[previousFloor]) {
        // Use multifloor parameters specific to this floor
        floorCeilingHeight = floorParameters[previousFloor].ceilingHeight;
        currentFloorDeckThickness = floorParameters[previousFloor].floorDeck;
      } else {
        // Use global parameters for single-floor mode
        floorCeilingHeight = defaultCeilingHeight;
        currentFloorDeckThickness = defaultFloorDeck;
      }
      
      baseHeight += floorCeilingHeight + currentFloorDeckThickness;
    }
  }
  return baseHeight;
};

// Calculate wall vertices for a line segment
export const calculateWallVertices = (
  line: Line,
  baseHeight: number,
  ceilingHeight: number
): Float32Array => {
  const start_bottom = transform2DTo3D(line.start, baseHeight);
  const end_bottom = transform2DTo3D(line.end, baseHeight);
  const start_top = transform2DTo3D(line.start, baseHeight + ceilingHeight);
  const end_top = transform2DTo3D(line.end, baseHeight + ceilingHeight);

  return new Float32Array([
    start_bottom.x, start_bottom.y, start_bottom.z,
    end_bottom.x, end_bottom.y, end_bottom.z,
    start_top.x, start_top.y, start_top.z,
    end_top.x, end_top.y, end_top.z,
  ]);
};

// Create room perimeter from lines (extracted from roomUtils)
export const createRoomPerimeter = (lines: Line[]): Point[] => {
  if (lines.length === 0) return [];

  // Build a graph of point connections
  const pointGraph = new Map<string, Point[]>();
  const pointToString = (p: Point) => `${p.x},${p.y}`;
  const arePointsEqual = (p1: Point, p2: Point, tolerance = 0.1) =>
    Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;

  // Build graph from lines
  lines.forEach((line) => {
    const startKey = pointToString(line.start);
    const endKey = pointToString(line.end);

    if (!pointGraph.has(startKey)) pointGraph.set(startKey, []);
    if (!pointGraph.has(endKey)) pointGraph.set(endKey, []);

    pointGraph.get(startKey)!.push(line.end);
    pointGraph.get(endKey)!.push(line.start);
  });

  // Find starting point (preferably with fewer connections)
  let startPoint = lines[0].start;
  if (pointGraph.size > 2) {
    let minConnections = Infinity;
    let minPoint: Point | null = null;

    pointGraph.forEach((connections, pointKey) => {
      if (connections.length < minConnections) {
        const [x, y] = pointKey.split(",").map(Number);
        minPoint = { x, y };
        minConnections = connections.length;
      }
    });

    startPoint = minPoint || lines[0].start;
  }

  // Trace the perimeter using graph traversal
  const perimeter: Point[] = [startPoint];
  const visited = new Set<string>([pointToString(startPoint)]);
  let currentPoint = startPoint;

  while (true) {
    const currentKey = pointToString(currentPoint);
    const neighbors = pointGraph.get(currentKey) || [];

    // Find unvisited neighbor
    const nextPoint = neighbors.find((p) => !visited.has(pointToString(p)));

    if (!nextPoint) {
      // Try to close the loop if possible
      if (
        perimeter.length > 2 &&
        arePointsEqual(perimeter[0], neighbors[0]) &&
        perimeter.length !== neighbors.length + 1
      ) {
        perimeter.push(perimeter[0]); // Close the loop
      }
      break;
    }

    perimeter.push(nextPoint);
    visited.add(pointToString(nextPoint));
    currentPoint = nextPoint;
  }

  // Verify we created a closed loop
  if (
    perimeter.length > 2 &&
    !arePointsEqual(perimeter[0], perimeter[perimeter.length - 1])
  ) {
    perimeter.push(perimeter[0]); // Ensure loop is closed
  }

  return perimeter;
};

// Create a THREE.Shape from perimeter points
export const createShapeFromPerimeter = (perimeter: Point[]): THREE.Shape | null => {
  if (perimeter.length < 3) return null;

  const shape = new THREE.Shape();
  const firstPoint = transform2DTo3D(perimeter[0]);

  shape.moveTo(firstPoint.x, firstPoint.y);

  for (let i = 1; i < perimeter.length; i++) {
    const point = transform2DTo3D(perimeter[i]);
    shape.lineTo(point.x, point.y);
  }

  return shape;
};

// Calculate angle between two points (for air entry rotation)
export const getAngleBetweenPoints = (start: Point, end: Point): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.atan2(dy, dx);
};