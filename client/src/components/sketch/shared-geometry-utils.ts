/**
 * ========================================
 * SHARED GEOMETRY UTILITIES
 * ========================================
 * 
 * Centralized utilities for 3D geometry generation shared between Canvas3D and RoomSketchPro
 * This ensures identical visualization and eliminates code duplication
 * 
 * Critical for maintaining consistency between components
 */

import * as THREE from "three";

// ========================================
// SHARED CONSTANTS
// ========================================

export const PIXELS_TO_CM = 5;

export const CANVAS_CONFIG = {
  dimensions: {
    width: 800,
    height: 600
  },
  center: {
    x: 400,
    y: 300
  },
  // Canvas coordinate transformations
  transformX: (x: number) => (x - 400) * PIXELS_TO_CM,
  transformY: (y: number) => (300 - y) * PIXELS_TO_CM,
  // Reverse transformations for converting back to canvas coordinates
  reverseTransformX: (relativeX: number) => relativeX / PIXELS_TO_CM + 400,
  reverseTransformY: (relativeY: number) => 300 - relativeY / PIXELS_TO_CM
};

// ========================================
// SHARED INTERFACES
// ========================================

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

// ========================================
// CORE SHARED FUNCTIONS
// ========================================

/**
 * Core coordinate transformation function: converts 2D canvas points to 3D world space
 * CRITICAL: Must be identical between Canvas3D and RoomSketchPro
 */
export const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  return new THREE.Vector3(
    CANVAS_CONFIG.transformX(point.x),
    height,
    CANVAS_CONFIG.transformY(point.y)
  );
};

/**
 * Creates ordered perimeter points from line segments
 * CRITICAL: Must produce identical results in both components
 */
export const createRoomPerimeter = (lines: Line[]): Point[] => {
  if (lines.length === 0) return [];
  
  const pointToString = (p: Point) => `${p.x},${p.y}`;
  const arePointsEqual = (p1: Point, p2: Point, tolerance = 0.1) =>
    Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;

  const orderedPoints: Point[] = [];
  const usedLines = new Set<number>();
  
  // Start with the first line
  orderedPoints.push(lines[0].start, lines[0].end);
  usedLines.add(0);
  
  // Find connected lines
  while (usedLines.size < lines.length) {
    const lastPoint = orderedPoints[orderedPoints.length - 1];
    let foundConnection = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (usedLines.has(i)) continue;
      
      const line = lines[i];
      
      if (arePointsEqual(lastPoint, line.start)) {
        orderedPoints.push(line.end);
        usedLines.add(i);
        foundConnection = true;
        break;
      } else if (arePointsEqual(lastPoint, line.end)) {
        orderedPoints.push(line.start);
        usedLines.add(i);
        foundConnection = true;
        break;
      }
    }
    
    if (!foundConnection) break;
  }
  
  // Remove the last point if it's the same as the first (closed contour)
  if (orderedPoints.length > 2 && 
      arePointsEqual(orderedPoints[0], orderedPoints[orderedPoints.length - 1])) {
    orderedPoints.pop();
  }
  
  return orderedPoints;
};

/**
 * Normalizes floor names for consistent comparison
 */
export const normalizeFloorName = (floorName: string): string => {
  return floorName.toLowerCase().trim();
};

/**
 * Creates stair mesh geometry
 * CRITICAL: Must produce identical 3D geometry in both components
 */
export const createStairMesh = (
  stairPolygon: StairPolygon,
  baseHeight: number,
  stepHeight: number = 20,
  stepDepth: number = 30
): THREE.Group => {
  const stairGroup = new THREE.Group();
  
  if (stairPolygon.points.length < 3) return stairGroup;
  
  // Create stair steps based on polygon shape
  const numSteps = Math.max(3, Math.floor(stepDepth / 10));
  const actualStepHeight = stepHeight / numSteps;
  
  for (let step = 0; step < numSteps; step++) {
    const currentHeight = baseHeight + (step * actualStepHeight);
    
    // Create step geometry
    const shape = new THREE.Shape();
    const firstPoint = transform2DTo3D(stairPolygon.points[0], 0);
    shape.moveTo(firstPoint.x, firstPoint.z);
    
    for (let i = 1; i < stairPolygon.points.length; i++) {
      const point3D = transform2DTo3D(stairPolygon.points[i], 0);
      shape.lineTo(point3D.x, point3D.z);
    }
    shape.closePath();
    
    const stepGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: actualStepHeight,
      bevelEnabled: false
    });
    
    const stepMaterial = new THREE.MeshBasicMaterial({
      color: step % 2 === 0 ? 0x8B4513 : 0xA0522D,
      transparent: true,
      opacity: 0.8
    });
    
    const stepMesh = new THREE.Mesh(stepGeometry, stepMaterial);
    stepMesh.position.y = currentHeight;
    stepMesh.rotation.x = -Math.PI / 2;
    
    stairGroup.add(stepMesh);
  }
  
  return stairGroup;
};

/**
 * Air entry positioning algorithm
 * CRITICAL: Must be identical between Canvas3D and RoomSketchPro
 */
export const positionAirEntry = (
  entry: AirEntry,
  index: number,
  baseHeight: number = 0,
  updatedPositions?: Record<number, any>
): {
  position: THREE.Vector3;
  dimensions: { width: number; height: number; distanceToFloor: number };
} => {
  // Check for updated position data
  const updatedEntryData = updatedPositions?.[index];
  
  let entryPosition = entry.position;
  let entryDimensions = entry.dimensions;
  
  // Use updated position if available
  if (updatedEntryData) {
    if (typeof updatedEntryData.x === 'number' && typeof updatedEntryData.y === 'number') {
      entryPosition = { x: updatedEntryData.x, y: updatedEntryData.y };
    }
    if (updatedEntryData.width && updatedEntryData.height) {
      entryDimensions = {
        width: updatedEntryData.width,
        height: updatedEntryData.height,
        distanceToFloor: updatedEntryData.distanceToFloor || entryDimensions.distanceToFloor || 0
      };
    }
  }
  
  // Transform to 3D coordinates
  const position3D = transform2DTo3D(entryPosition, baseHeight + (entryDimensions.distanceToFloor || 0));
  
  // Calculate wall normal for proper positioning
  const line = entry.line;
  const lineDirection = {
    x: line.end.x - line.start.x,
    y: line.end.y - line.start.y
  };
  
  // Normalize line direction
  const lineLength = Math.sqrt(lineDirection.x ** 2 + lineDirection.y ** 2);
  if (lineLength > 0) {
    lineDirection.x /= lineLength;
    lineDirection.y /= lineLength;
  }
  
  // Calculate wall normal (perpendicular to line direction)
  const wallNormal = {
    x: -lineDirection.y,
    z: lineDirection.x
  };
  
  // Offset position slightly along wall normal for proper visualization
  const offset = 2; // Small offset to prevent z-fighting
  position3D.x += wallNormal.x * offset;
  position3D.z += wallNormal.z * offset;
  
  return {
    position: position3D,
    dimensions: {
      width: entryDimensions.width,
      height: entryDimensions.height,
      distanceToFloor: entryDimensions.distanceToFloor || 0
    }
  };
};