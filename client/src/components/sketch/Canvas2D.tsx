import {
  useState,
  useEffect,
  useRef,
  useMemo,
  MouseEvent as ReactMouseEvent,
} from "react";
import { Point, Line, AirEntry, StairPolygon, Measurement } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Move, Eraser, Ruler } from "lucide-react";
import AirEntryDialog from "./AirEntryDialog";
import { cn } from "@/lib/utils";
import { useSketchStore } from "@/lib/stores/sketch-store";
import CoordinateEditorDialog from "./CoordinateEditorDialog";
import WallPropertiesDialog from "./WallPropertiesDialog";
import StairPropertiesDialog from "./StairPropertiesDialog";
import { 
  createWallFromLine, 
  findWallForLine, 
  findWallsForDeletedLines,
  lineToUniqueId,
  arePointsEqual as wallPointsEqual,
  denormalizeCoordinates,
  normalizeCoordinates
} from "@/lib/simulationDataConverter";
import { useRoomStore } from "@/lib/store/room-store";

interface HighlightState {
  lines: Line[];
  airEntry: { index: number; entry: AirEntry } | null;
  measurement: { index: number; measurement: Measurement } | null;
  stairPolygon: { index: number; polygon: StairPolygon } | null;
}

let isProcessingMouseMove = false;
let lastMouseMoveEvent: MouseEvent | null = null;

const POINT_RADIUS = 3;
const PIXELS_TO_CM = 25 / 20;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const GRID_RANGE = 2000;
const GRID_POINT_RADIUS = 1;
const HOVER_DISTANCE = 10;

// Add this debug log function
const debugLog = (message: string, data?: any) => {
  const timestamp = new Date().toISOString().substr(11, 12);
  // Logging removed
};

const cmToPixels = (cm: number): number => {
  return cm / PIXELS_TO_CM;
};

const pixelsToCm = (pixels: number): number => {
  return pixels * PIXELS_TO_CM;
};

const calculateNormal = (line: Line): Point => {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  return {
    x: dx / length,
    y: dy / length,
  };
};

// Add this helper function near the beginning of Canvas2D, similar to the one in Canvas3D
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
// Point comparison utilities
const arePointsEqual = (p1: Point, p2: Point): boolean => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) < 1;
};

const arePointsNearlyEqual = (p1: Point, p2: Point): boolean => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) < 1;
};

const arePointsClose = (
  p1: Point,
  p2: Point,
  snapDistance: number,
): boolean => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) < snapDistance;
};

// Line calculation utilities
const getLineLength = (line: Line): number => {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const getPointOnLine = (line: Line, point: Point): Point => {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) return line.start;

  const t =
    ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / len2;
  const tt = Math.max(0, Math.min(1, t));

  return {
    x: line.start.x + tt * dx,
    y: line.start.y + tt * dy,
  };
};

const distanceToLineSegment = (
  point: Point,
  lineStart: Point,
  lineEnd: Point,
): number => {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;

  return Math.sqrt(dx * dx + dy * dy);
};

const calculatePositionAlongWall = (line: Line, point: Point): Point => {
  try {
    // Position calculation logging removed

    const lineVector = {
      x: line.end.x - line.start.x,
      y: line.end.y - line.start.y,
    };

    const lineLength = Math.sqrt(
      lineVector.x * lineVector.x + lineVector.y * lineVector.y,
    );
    if (lineLength === 0) {
      console.warn("Zero length line detected");
      return line.start;
    }

    const unitVector = {
      x: lineVector.x / lineLength,
      y: lineVector.y / lineLength,
    };

    const pointVector = {
      x: point.x - line.start.x,
      y: point.y - line.start.y,
    };

    const dotProduct =
      pointVector.x * unitVector.x + pointVector.y * unitVector.y;

    const margin = 20;
    const clampedDot = Math.max(
      margin,
      Math.min(lineLength - margin, dotProduct),
    );

    const finalPosition = {
      x: line.start.x + unitVector.x * clampedDot,
      y: line.start.y + unitVector.y * clampedDot,
    };

    // Position result logging removed

    return finalPosition;
  } catch (error) {
    console.error("Error in calculatePositionAlongWall:", error);
    return point;
  }
};

const getLineIdentifier = (line: Line): string => {
  const [x1, y1, x2, y2] = [
    Math.round(line.start.x),
    Math.round(line.start.y),
    Math.round(line.end.x),
    Math.round(line.end.y),
  ].sort();
  return `${x1},${y1}_${x2},${y2}`;
};

const getRelativePositionOnLine = (point: Point, line: Line): number => {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const lineLength = Math.sqrt(dx * dx + dy * dy);

  if (lineLength === 0) return 0;

  const px = point.x - line.start.x;
  const py = point.y - line.start.y;

  const dot = (px * dx + py * dy) / (lineLength * lineLength);

  return Math.max(0, Math.min(1, dot));
};

const getPointAtRelativePosition = (line: Line, relativePos: number): Point => {
  const t = Math.max(0, Math.min(1, relativePos));

  return {
    x: line.start.x + (line.end.x - line.start.x) * t,
    y: line.start.y + (line.end.y - line.start.y) * t,
  };
};

// Add Wall interface for temperature properties
interface Wall {
  id: string;
  uuid: string;
  floor: string;
  lineRef: string;
  startPoint: Point;
  endPoint: Point;
  properties: {
    temperature: number;
  };
}

interface Canvas2DProps {
  gridSize: number;
  currentTool: "wall" | "eraser" | "measure" | "stairs" | null;
  currentAirEntry: "window" | "door" | "vent" | null;
  airEntries: AirEntry[];
  lines: Line[];
  walls: Wall[];
  measurements: Measurement[];
  stairPolygons?: StairPolygon[];
  floorText: string;
  currentFloor: string;
  isMultifloor: boolean;
  ceilingHeight?: number;
  defaultWallTemperature?: number;
  defaultStairTemperature?: number;
  onLinesUpdate?: (lines: Line[]) => void;
  onWallsUpdate?: (walls: Wall[]) => void;
  onAirEntriesUpdate?: (airEntries: AirEntry[]) => void;
  onMeasurementsUpdate?: (measurements: Measurement[]) => void;
  onStairPolygonsUpdate?: (stairPolygons: StairPolygon[]) => void;
  onLineSelect?: (line: Line, clickPoint: Point) => void;
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
      distanceToFloor?: number;
      width?: number;
      height?: number;
    }
  ) => void;
}

export default function Canvas2D({
  gridSize,
  currentTool,
  currentAirEntry,
  airEntries = [],
  lines = [],
  walls = [],
  measurements = [],
  stairPolygons = [],
  floorText,
  currentFloor,
  isMultifloor,
  ceilingHeight = 2.4,
  defaultWallTemperature = 20,
  defaultStairTemperature = 20,
  onLinesUpdate,
  onWallsUpdate,
  onAirEntriesUpdate,
  onMeasurementsUpdate,
  onStairPolygonsUpdate,
  onLineSelect,
  onPropertiesUpdate,
  onDimensionsUpdate,
}: Canvas2DProps) {

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [currentLine, setCurrentLine] = useState<Line | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null);
  const [panMode, setPanMode] = useState(false);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const [zoomInput, setZoomInput] = useState("100");
  const [hoveredGridPoint, setHoveredGridPoint] = useState<Point | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [isDraggingEndpoint, setIsDraggingEndpoint] = useState(false);
  const [draggedPoint, setDraggedPoint] = useState<{
    point: Point;
    lines: Line[];
    isStart: boolean[];
  }>({ point: { x: 0, y: 0 }, lines: [], isStart: [] });

  // Add these state variables to the Canvas2D component
  const [editingPoint, setEditingPoint] = useState<{
    point: Point;
    lines: Line[];
    isStart: boolean[];
    isStairPoint?: boolean;
    stairPolygonIndex?: number;
    pointIndex?: number;
  } | null>(null);

  // Add the ignoreNextClick state here, with the other state variables
  const [ignoreNextClick, setIgnoreNextClick] = useState<boolean>(false);
  const [ignoreStairToolClick, setIgnoreStairToolClick] =
    useState<boolean>(false);

  // ADD THIS new state
  const [previewMeasurement, setPreviewMeasurement] =
    useState<Measurement | null>(null);
  const [isDraggingAirEntry, setIsDraggingAirEntry] = useState(false);
  const [draggedAirEntry, setDraggedAirEntry] = useState<{
    index: number;
    entry: AirEntry;
    startPoint: Point;
  }>({ index: -1, entry: {} as AirEntry, startPoint: { x: 0, y: 0 } });
  const [highlightState, setHighlightState] = useState<HighlightState>({
    lines: [],
    airEntry: null,
    measurement: null,
    stairPolygon: null, // Add this line
  });
  const [editingAirEntries, setEditingAirEntries] = useState<{
    index: number;
    entry: AirEntry;
    position?: { x: number; y: number };
    isCreating?: boolean;
  }[]>([]);

  const [editingWall, setEditingWall] = useState<Wall | null>(null);
  const [wallPropertiesDialogOpen, setWallPropertiesDialogOpen] = useState(false);
  const [editingStair, setEditingStair] = useState<any | null>(null);
  const [stairPropertiesDialogOpen, setStairPropertiesDialogOpen] = useState(false);
  const [hoveredEndpoint, setHoveredEndpoint] = useState<{
    point: Point;
    lines: Line[];
    isStart: boolean[];
  } | null>(null);
  const [hoveredAirEntry, setHoveredAirEntry] = useState<{
    index: number;
    entry: AirEntry;
  } | null>(null);
  const [measureStart, setMeasureStart] = useState<Point | null>(null);
  const [measureEnd, setMeasureEnd] = useState<Point | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [ignoreMeasureToolClick, setIgnoreMeasureToolClick] = useState(false);

  // Stair polygon drawing states
  const [currentStairPoints, setCurrentStairPoints] = useState<Point[]>([]);
  const [isDrawingStairs, setIsDrawingStairs] = useState(false);
  const [previewStairPoint, setPreviewStairPoint] = useState<Point | null>(
    null,
  );
  const [snapSource, setSnapSource] = useState<
    "grid" | "endpoint" | "stair" | "origin" | null
  >(null);

  const { snapDistance, showCursorCoordinates, fontScale } = useSketchStore();
  
  // Reactive AirEntry synchronization system for Canvas2D
  const { subscribeToAirEntryChanges } = useRoomStore();
  const [forceRedraw, setForceRedraw] = useState(0);
  
  useEffect(() => {
    const unsubscribe = subscribeToAirEntryChanges((floorName, index, updatedEntry) => {
      // Only update if this change affects our current floor
      if (floorName !== currentFloor) return;
      
      // Force re-render by updating state
      setForceRedraw(prev => prev + 1);
    });
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentFloor, subscribeToAirEntryChanges]);

  // Helper function to get scaled font size that responds to zoom and font scale
  const getScaledFont = (baseSize: number, fontFamily: string = 'sans-serif'): string => {
    return `${(baseSize * fontScale) / zoom}px ${fontFamily}`;
  };

  const getCoordinateSystemParams = () => {
    return {
      centerX: dimensions.width / 2,
      centerY: dimensions.height / 2,
      arrowLength: 150,
    };
  };

  const createCoordinateSystem = (): Line[] => {
    const { centerX, centerY, arrowLength } = getCoordinateSystemParams();

    return [
      // X axis (horizontal)
      {
        id: "coord-x",
        start: { x: centerX, y: centerY },
        end: { x: centerX + arrowLength, y: centerY },
      },
      // X axis arrow head
      {
        id: "coord-2",
        start: { x: centerX + arrowLength, y: centerY },
        end: { x: centerX + arrowLength - 10, y: centerY - 5 },
      },
      {
        id: "coord-3",
        start: { x: centerX + arrowLength, y: centerY },
        end: { x: centerX + arrowLength - 10, y: centerY + 5 },
      },
      // Y axis (vertical)
      {
        id: "coord-y",
        start: { x: centerX, y: centerY },
        end: { x: centerX, y: centerY - arrowLength },
      },
      // Y axis arrow head
      {
        id: "coord-5",
        start: { x: centerX, y: centerY - arrowLength },
        end: { x: centerX - 5, y: centerY - arrowLength + 10 },
      },
      {
        id: "coord-6",
        start: { x: centerX, y: centerY - arrowLength },
        end: { x: centerX + 5, y: centerY - arrowLength + 10 },
      },
    ];
  };

  const createGridLines = (): Line[] => {
    const gridLines: Line[] = [];

    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    // Calculate visible area based on current pan and zoom
    const visibleStartX = -pan.x / zoom - gridSize;
    const visibleEndX = (-pan.x + dimensions.width) / zoom + gridSize;
    const visibleStartY = -pan.y / zoom - gridSize;
    const visibleEndY = (-pan.y + dimensions.height) / zoom + gridSize;

    // Get grid coordinates using gridSize
    const startXGrid =
      Math.floor((visibleStartX - centerX) / gridSize) * gridSize;
    const endXGrid = Math.ceil((visibleEndX - centerX) / gridSize) * gridSize;
    const startYGrid =
      Math.floor((visibleStartY - centerY) / gridSize) * gridSize;
    const endYGrid = Math.ceil((visibleEndY - centerY) / gridSize) * gridSize;

    // Draw vertical grid lines
    for (let x = startXGrid; x <= endXGrid; x += gridSize) {
      gridLines.push({
        id: `grid-x-${x}`,
        start: { x: centerX + x, y: centerY - GRID_RANGE },
        end: { x: centerX + x, y: centerY + GRID_RANGE },
      });
    }

    // Draw horizontal grid lines
    for (let y = startYGrid; y <= endYGrid; y += gridSize) {
      gridLines.push({
        id: `grid-y-${y}`,
        start: { x: centerX - GRID_RANGE, y: centerY + y },
        end: { x: centerX + GRID_RANGE, y: centerY + y },
      });
    }

    return gridLines;
  };

  const handleZoomChange = (newZoom: number) => {
    const oldZoom = zoom;
    const zoomDiff = newZoom - oldZoom;

    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    setPan((prev) => ({
      x: prev.x - centerX * zoomDiff,
      y: prev.y - centerY * zoomDiff,
    }));

    setZoom(newZoom);
    setZoomInput(Math.round(newZoom * 100).toString());
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom + ZOOM_STEP, MAX_ZOOM);
    handleZoomChange(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - ZOOM_STEP, MIN_ZOOM);
    handleZoomChange(newZoom);
  };

  const handleZoomWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
      handleZoomChange(newZoom);
    }
  };

  const handleRegularWheel = (e: WheelEvent) => {};

  const handlePanStart = (e: MouseEvent) => {
    // Start panning for right-click OR when panMode is active
    if (panMode || e.button === 2) {
      e.preventDefault();
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePanMove = (e: MouseEvent) => {
    if (isPanning && lastPanPoint) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePanEnd = () => {
    setIsPanning(false);
    setLastPanPoint(null);
  };

  const togglePanMode = () => {
    setPanMode(!panMode);
    if (isPanning) {
      handlePanEnd();
    }
  };

  const getCanvasPoint = (e: MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: ((e.clientX - rect.left) * scaleX - pan.x) / zoom,
      y: ((e.clientY - rect.top) * scaleY - pan.y) / zoom,
    };
  };

  const snapToGrid = (point: Point): Point => {
    const snapSize = 4;
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    const relativeX = point.x - centerX;
    const relativeY = point.y - centerY;

    const snappedX = Math.round(relativeX / snapSize) * snapSize;
    const snappedY = Math.round(relativeY / snapSize) * snapSize;

    return {
      x: centerX + snappedX,
      y: centerY + snappedY,
    };
  };

  // Find this function in the code (around line 325)
  // Update findNearestEndpoint to track snap source (replace the previous implementation)
  const findNearestEndpoint = (
    point: Point,
  ): {
    point: Point | null;
    source: "endpoint" | "stair" | "origin" | null;
  } => {
    let nearest: Point | null = null;
    let minDistance = snapDistance;
    let source: "endpoint" | "stair" | "origin" | null = null;

    // Add origin (0,0) as a potential snap point
    const originPoint = { x: dimensions.width / 2, y: dimensions.height / 2 };
    const distToOrigin = Math.sqrt(
      Math.pow(point.x - originPoint.x, 2) +
        Math.pow(point.y - originPoint.y, 2),
    );

    if (distToOrigin < minDistance) {
      minDistance = distToOrigin;
      nearest = originPoint;
      source = "origin";
    }

    // Check wall line endpoints
    lines.forEach((line) => {
      [line.start, line.end].forEach((endpoint) => {
        const dx = point.x - endpoint.x;
        const dy = point.y - endpoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = endpoint;
          source = "endpoint";
        }
      });
    });

    // Check stair polygon vertices
    if (stairPolygons && stairPolygons.length > 0) {
      stairPolygons.forEach((stair) => {
        stair.points.forEach((stairPoint) => {
          const dx = point.x - stairPoint.x;
          const dy = point.y - stairPoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < minDistance) {
            minDistance = distance;
            nearest = stairPoint;
            source = "stair";
          }
        });
      });
    }

    return { point: nearest, source };
  };

  const findConnectedLines = (point: Point): Line[] => {
    return lines.filter(
      (line) =>
        arePointsClose(line.start, point, snapDistance) ||
        arePointsClose(line.end, point, snapDistance),
    );
  };

  const closedContourCache = new Map<string, boolean>();
  const pointKey = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;

  const isInClosedContour = (point: Point, lines: Line[]): boolean => {
    if (!closedContourCache.has(pointKey(point))) {
      const result = checkClosedContour(point, lines);
      closedContourCache.set(pointKey(point), result);
      return result;
    }
    return closedContourCache.get(pointKey(point))!;
  };

  const checkClosedContour = (point: Point, lines: Line[]): boolean => {
    const arePointsEqual = (p1: Point, p2: Point): boolean => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy) < 5;
    };

    const connectedLines = lines.filter(
      (line) =>
        arePointsEqual(line.start, point) || arePointsEqual(line.end, point),
    );

    for (const startLine of connectedLines) {
      const visited = new Set<string>();
      const stack: { point: Point; path: Line[] }[] = [
        {
          point: arePointsEqual(startLine.start, point)
            ? startLine.end
            : startLine.start,
          path: [startLine],
        },
      ];

      while (stack.length > 0) {
        const { point: currentPoint, path } = stack.pop()!;
        const key = pointKey(currentPoint);

        if (path.length >= 2 && arePointsEqual(currentPoint, point)) {
          return true;
        }

        if (visited.has(key)) continue;
        visited.add(key);

        const nextLines = lines.filter(
          (line) =>
            !path.includes(line) &&
            (arePointsEqual(line.start, currentPoint) ||
              arePointsEqual(line.end, currentPoint)),
        );

        for (const nextLine of nextLines) {
          const nextPoint = arePointsEqual(nextLine.start, currentPoint)
            ? nextLine.end
            : nextLine.start;
          stack.push({
            point: nextPoint,
            path: [...path, nextLine],
          });
        }
      }
    }

    return false;
  };

  const findLinesNearPoint = (point: Point): Line[] => {
    const nearbyLines: Line[] = [];

    lines.forEach((line) => {
      const distance = distanceToLineSegment(point, line.start, line.end);
      if (distance < snapDistance) {
        nearbyLines.push(line);
      }
    });

    return nearbyLines;
  };

  const gridSizeToCm = (pixels: number): number => pixels * PIXELS_TO_CM;

  const getHighlightColor = () => {
    if (!currentAirEntry) return "rgba(239, 68, 68, 0.5)";

    const colors = {
      window: "rgba(59, 130, 246, 0.5)",
      door: "rgba(180, 83, 9, 0.5)",
      vent: "rgba(34, 197, 94, 0.5)",
    };

    return colors[currentAirEntry];
  };

  const getAirEntryColor = (type: "window" | "door" | "vent"): string => {
    const colors = {
      window: "#3b82f6",
      door: "#b45309",
      vent: "#22c55e",
    };
    return colors[type];
  };

  const getRelativeCoordinates = (point: Point): { x: number; y: number } => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const relativeX = point.x - centerX;
    const relativeY = centerY - point.y;
    return {
      x: Math.round(pixelsToCm(relativeX)),
      y: Math.round(pixelsToCm(relativeY)),
    };
  };

  // Nueva función para obtener coordenadas en el sistema JSON
  const getJSONCoordinates = (point: Point): { x: number; y: number } => {
    // Convertir coordenadas internas del canvas al sistema JSON
    const normalizedCoords = normalizeCoordinates({ x: point.x, y: point.y });
    return {
      x: parseFloat(normalizedCoords.x.toFixed(1)),
      y: parseFloat(normalizedCoords.y.toFixed(1)),
    };
  };

  // Function to calculate label bounds for overlap detection
  const getLabelBounds = (point: Point, offset: { x: number; y: number }, text: string, ctx: CanvasRenderingContext2D) => {
    const textMetrics = ctx.measureText(text);
    const textHeight = 12 / zoom; // Approximate text height
    return {
      x: point.x + offset.x,
      y: point.y + offset.y - textHeight,
      width: textMetrics.width,
      height: textHeight,
    };
  };

  // Function to check if two rectangles overlap
  const rectanglesOverlap = (rect1: any, rect2: any) => {
    return !(rect1.x + rect1.width < rect2.x || 
             rect2.x + rect2.width < rect1.x || 
             rect1.y + rect1.height < rect2.y || 
             rect2.y + rect2.height < rect1.y);
  };

  // Function to find non-overlapping position for a label
  const findNonOverlappingPosition = (
    point: Point, 
    text: string, 
    ctx: CanvasRenderingContext2D, 
    existingLabels: any[]
  ) => {
    const baseDistance = 4 / zoom;
    
    // Try different positions around the point
    const positions = [
      { x: baseDistance, y: -baseDistance },     // top-right (default)
      { x: baseDistance, y: baseDistance * 2 },  // bottom-right
      { x: -baseDistance * 8, y: -baseDistance }, // top-left (wider for text)
      { x: -baseDistance * 8, y: baseDistance * 2 }, // bottom-left
      { x: baseDistance, y: -baseDistance * 3 }, // higher top-right
      { x: baseDistance, y: baseDistance * 4 },  // lower bottom-right
    ];

    for (const offset of positions) {
      const bounds = getLabelBounds(point, offset, text, ctx);
      
      // Check if this position overlaps with any existing label
      const hasOverlap = existingLabels.some(existing => 
        rectanglesOverlap(bounds, existing)
      );
      
      if (!hasOverlap) {
        return { offset, bounds };
      }
    }
    
    // If all positions overlap, use the default with a larger vertical offset
    const fallbackOffset = { x: baseDistance, y: -baseDistance * (existingLabels.length + 1) };
    const bounds = getLabelBounds(point, fallbackOffset, text, ctx);
    return { offset: fallbackOffset, bounds };
  };

  const drawCoordinateLabel = (
    ctx: CanvasRenderingContext2D,
    point: Point,
    color: string,
    offset?: { x: number; y: number },
  ) => {
    const coords = getRelativeCoordinates(point);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    
    // Use provided offset or default closer positioning
    const offsetX = offset?.x ?? 4 / zoom;
    const offsetY = offset?.y ?? -4 / zoom;
    
    ctx.fillText(`(${coords.x}, ${coords.y})`, point.x + offsetX, point.y + offsetY);
  };

  const drawAirEntry = (
    ctx: CanvasRenderingContext2D,
    entry: AirEntry,
    index: number,
  ) => {
    const normal = calculateNormal(entry.line);
    const isHighlighted = highlightState.airEntry?.index === index;
    const isHovered = hoveredAirEntry?.index === index;
    let color = getAirEntryColor(entry.type);

    if (isHighlighted) {
      color = "#ef4444"; // Red for deletion highlight
    } else if (isHovered) {
      // Apply a brighter version of the color when hovered
      const brighterColor = {
        window: "#60a5fa", // Brighter blue
        door: "#d97706", // Brighter brown
        vent: "#34d399", // Brighter green
      }[entry.type];
      color = brighterColor;
    }

    const widthInPixels = cmToPixels(entry.dimensions.width);
    const halfWidth = widthInPixels / 2;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = isHovered ? 6 / zoom : 4 / zoom; // Thicker line when hovered

    // Draw the main line
    ctx.beginPath();
    ctx.moveTo(
      entry.position.x - normal.x * halfWidth,
      entry.position.y - normal.y * halfWidth,
    );
    ctx.lineTo(
      entry.position.x + normal.x * halfWidth,
      entry.position.y + normal.y * halfWidth,
    );
    ctx.stroke();

    // Draw the end markers
    const perpX = (-normal.y * 4) / zoom;
    const perpY = (normal.x * 4) / zoom;

    ctx.beginPath();
    ctx.moveTo(
      entry.position.x - normal.x * halfWidth - perpX,
      entry.position.y - normal.y * halfWidth - perpY,
    );
    ctx.lineTo(
      entry.position.x - normal.x * halfWidth + perpX,
      entry.position.y - normal.y * halfWidth + perpY,
    );
    ctx.moveTo(
      entry.position.x + normal.x * halfWidth - perpX,
      entry.position.y + normal.y * halfWidth - perpY,
    );
    ctx.lineTo(
      entry.position.x + normal.x * halfWidth + perpX,
      entry.position.y + normal.y * halfWidth + perpY,
    );
    ctx.stroke();

    // Add a circle at the center point
    ctx.beginPath();
    ctx.arc(
      entry.position.x,
      entry.position.y,
      POINT_RADIUS / zoom, // Use the same radius as connection points
      0,
      Math.PI * 2,
    );
    // Fill the circle with the same color
    ctx.fillStyle = color;
    ctx.fill();

    // Add a "double-click to edit" tooltip when hovered
    if (isHovered) {
      ctx.font = getScaledFont(12, 'Arial');
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(
        "Double-click to edit",
        entry.position.x,
        entry.position.y - 15 / zoom,
      );
    }

    ctx.restore();
  };

  // Helper function to get the most current air entry data for drawing
  // RESTORED: Visual updates for real-time feedback while maintaining store persistence
  const getCurrentAirEntries = (): AirEntry[] => {
    const result = [...airEntries];
    
    // Apply visual updates from editing state for real-time feedback
    // This only affects visual rendering, not persistence (handled by immediate store updates)
    editingAirEntries.forEach(editingItem => {
      if (editingItem.index < result.length && editingItem.entry) {
        result[editingItem.index] = {
          ...result[editingItem.index],
          ...editingItem.entry
        };
      }
    });
    
    return result;
  };

  const getVisibleGridPoints = (): Point[] => {
    const points: Point[] = [];
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    // Calculate visible area based on current pan and zoom
    const visibleStartX = -pan.x / zoom - gridSize;
    const visibleEndX = (-pan.x + dimensions.width) / zoom + gridSize;
    const visibleStartY = -pan.y / zoom - gridSize;
    const visibleEndY = (-pan.y + dimensions.height) / zoom + gridSize;

    // Get grid coordinates using regular gridSize
    const startXGrid =
      Math.floor((visibleStartX - centerX) / gridSize) * gridSize;
    const endXGrid = Math.ceil((visibleEndX - centerX) / gridSize) * gridSize;
    const startYGrid =
      Math.floor((visibleStartY - centerY) / gridSize) * gridSize;
    const endYGrid = Math.ceil((visibleEndY - centerY) / gridSize) * gridSize;

    // Generate grid points
    for (let x = startXGrid; x <= endXGrid; x += gridSize) {
      for (let y = startYGrid; y <= endYGrid; y += gridSize) {
        const relativeX = Math.round(x / gridSize);
        const relativeY = Math.round(y / gridSize);

        // Create checkerboard pattern
        if ((relativeX + relativeY) % 2 === 0) {
          points.push({
            x: centerX + x * zoom,
            y: centerY + y * zoom,
          });
        }
      }
    }

    return points;
  };

  const visibleGridPoints = useMemo(
    () => getVisibleGridPoints(),
    [dimensions, pan, zoom, gridSize],
  );

  const findNearestGridPoint = (point: Point): Point | null => {
    let nearest: Point | null = null;
    let minDistance = HOVER_DISTANCE;

    visibleGridPoints.forEach((gridPoint) => {
      const dx = point.x - gridPoint.x;
      const dy = point.y - gridPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = gridPoint;
      }
    });

    return nearest;
  };

  const findPointAtLocation = (
    clickPoint: Point,
  ): {
    point: Point;
    lines: Line[];
    isStart: boolean[];
  } | null => {
    const endpoints = lines.flatMap((line) => [
      { point: line.start, line, isStart: true },
      { point: line.end, line, isStart: false },
    ]);

    const groupedPoints: Record<
      string,
      { point: Point; lines: Line[]; isStart: boolean[] }
    > = {};

    endpoints.forEach(({ point, line, isStart }) => {
      const key = `${Math.round(point.x)},${Math.round(point.y)}`;
      if (!groupedPoints[key]) {
        groupedPoints[key] = { point, lines: [], isStart: [] };
      }
      groupedPoints[key].lines.push(line);
      groupedPoints[key].isStart.push(isStart);
    });

    for (const key in groupedPoints) {
      const { point, lines, isStart } = groupedPoints[key];
      const dx = clickPoint.x - point.x;
      const dy = clickPoint.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < (POINT_RADIUS / zoom) * 1.5) {
        return { point, lines, isStart };
      }
    }

    return null;
  };

  const throttleMouseMove = (e: MouseEvent) => {
    lastMouseMoveEvent = e;

    if (isProcessingMouseMove) return;

    isProcessingMouseMove = true;

    requestAnimationFrame(() => {
      if (lastMouseMoveEvent) {
        processMouseMove(lastMouseMoveEvent);
      }
      isProcessingMouseMove = false;
      lastMouseMoveEvent = null;
    });
  };

  // Fix 2: Fix the processMouseMove function with correct type for currentLine
  const processMouseMove = (e: MouseEvent) => {
    const point = getCanvasPoint(e);
    setHoverPoint(point);

    // Handle mouse move during stair drawing
    if (isDrawingStairs) {
      const { point: nearestPoint, source } = findNearestEndpoint(point);
      const snappedPoint = nearestPoint || snapToGrid(point);
      setPreviewStairPoint(snappedPoint);
      setSnapSource(nearestPoint ? source : "grid");
      return;
    }

    // Pre-drawing snapping for wall tool
    if (!isDrawing && !isPanning && currentTool === "wall") {
      const { point: nearestPoint, source } = findNearestEndpoint(point);
      if (nearestPoint) {
        // Set cursor point for showing snap indicator before drawing starts
        setCursorPoint(nearestPoint);
        setSnapSource(source); // Store the source for visual indication
      } else {
        // If not near a snap point, use grid snap and reset snap source
        setCursorPoint(snapToGrid(point));
        setSnapSource("grid");
      }
    }

    if (!isDrawing && !isPanning) {
      const nearestGridPoint = findNearestGridPoint(point);
      setHoveredGridPoint(nearestGridPoint);

      // Check for endpoint hover
      const pointInfo = findPointAtLocation(point);
      setHoveredEndpoint(pointInfo);

      // Check for air entry hover
      const airEntryInfo = findAirEntryAtLocation(point);
      setHoveredAirEntry(airEntryInfo);

      if (currentTool === "eraser") {
        const airEntryInfo = findAirEntryAtLocation(point);
        const measurementInfo = findMeasurementAtPoint(point, measurements);
        const stairPolygonInfo = findStairPolygonAtPoint(point, stairPolygons);

        if (airEntryInfo) {
          setHighlightState({
            lines: [],
            airEntry: { index: airEntryInfo.index, entry: airEntryInfo.entry },
            measurement: null,
            stairPolygon: null,
          });
        } else if (measurementInfo) {
          setHighlightState({
            lines: [],
            airEntry: null,
            measurement: {
              index: measurementInfo.index,
              measurement: measurementInfo.measurement,
            },
            stairPolygon: null,
          });
        } else if (stairPolygonInfo) {
          setHighlightState({
            lines: [],
            airEntry: null,
            measurement: null,
            stairPolygon: {
              index: stairPolygonInfo.index,
              polygon: stairPolygonInfo.polygon,
            },
          });
        } else {
          const nearbyLines = findLinesNearPoint(point);
          setHighlightState({
            lines: nearbyLines,
            airEntry: null,
            measurement: null,
            stairPolygon: null,
          });
        }
      } else if (currentAirEntry) {
        setHighlightState({
          lines: findLinesNearPoint(point),
          airEntry: null,
          measurement: null,
          stairPolygon: null,
        });
      }
    }

    if (currentTool === "wall" && isDrawing && currentLine) {
      const { point: nearestPoint, source } = findNearestEndpoint(point);
      const endPoint = nearestPoint || snapToGrid(point);
      // Fix the incorrect type annotation
      setCurrentLine((prev: Line | null) =>
        prev ? { ...prev, end: endPoint } : null,
      );
      setCursorPoint(endPoint);
      // If snapping to a point, set the snap source for visual feedback
      setSnapSource(nearestPoint ? source : "grid");
    }
  };

  // Handle double click for wall properties editing - updated version
  const handleDoubleClickNew = (e: ReactMouseEvent<HTMLCanvasElement, MouseEvent>) => {
    debugLog("Double-click detected - checking for stairs, air entries, points, or wall properties");
    const point = getCanvasPoint(e.nativeEvent);
    
    // Set flag to ignore the next click
    setIgnoreNextClick(true);
    
    // FIRST: Check for stair polygon vertex double-click - HIGHEST PRIORITY
    if (stairPolygons && stairPolygons.length > 0) {
      for (
        let polygonIndex = 0;
        polygonIndex < stairPolygons.length;
        polygonIndex++
      ) {
        const polygon = stairPolygons[polygonIndex];

        // Skip imported stair polygons as they shouldn't be editable
        if (polygon.isImported) continue;

        for (
          let pointIndex = 0;
          pointIndex < polygon.points.length;
          pointIndex++
        ) {
          const stairPoint = polygon.points[pointIndex];
          const dx = point.x - stairPoint.x;
          const dy = point.y - stairPoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < (POINT_RADIUS * 2) / zoom) {
            debugLog(
              `Double-click detected on stair point at (${stairPoint.x}, ${stairPoint.y})`,
            );

            // If stair tool is active, set flag to prevent new stair creation
            if (currentTool === "stairs") {
              debugLog("Setting ignoreStairToolClick flag to true");
              setIgnoreStairToolClick(true);

              // Also cancel any active stair drawing
              if (isDrawingStairs) {
                debugLog("Canceling active stair drawing");
                setIsDrawingStairs(false);
                setCurrentStairPoints([]);
                setPreviewStairPoint(null);
              }

              // Reset the flag after a short delay
              setTimeout(() => {
                debugLog("Resetting ignoreStairToolClick flag to false");
                setIgnoreStairToolClick(false);
              }, 500);
            }

            // Found a stair polygon vertex
            setEditingPoint({
              point: stairPoint,
              lines: [],
              isStart: [],
              isStairPoint: true,
              stairPolygonIndex: polygonIndex,
              pointIndex: pointIndex,
            });
            return;
          }
        }
      }
    }
    
    // SECOND: Check for stair polygon body double-click (for properties editing)
    if (stairPolygons && stairPolygons.length > 0) {
      const stairInfo = findStairPolygonAtPoint(point, stairPolygons);
      if (stairInfo && !stairInfo.polygon.isImported) {

        debugLog(`Double-click detected on stair polygon - opening stair properties editor`);
        setEditingStair(stairInfo.polygon);
        setStairPropertiesDialogOpen(true);
        return;
      }
    }
    
    // THIRD: Check for air entries
    const airEntryInfo = findAirEntryAtLocation(point);
    if (airEntryInfo) {
      debugLog(`Double-click detected on air entry - opening air entry editor`);
      openAirEntryDialog({
        index: airEntryInfo.index,
        entry: airEntryInfo.entry,
      });
      return;
    }
    
    // THIRD: Check for exact point (endpoint) double-click
    const pointInfo = findPointAtLocation(point);
    if (pointInfo) {
      debugLog(`Double-click detected on point coordinates - opening coordinate editor`);
      setEditingPoint({
        point: pointInfo.point,
        lines: pointInfo.lines,
        isStart: pointInfo.isStart,
        isStairPoint: false,
      });
      return;
    }
    
    // FOURTH: Check for wall properties editing (lines but not endpoints)
    const nearbyLines = findLinesNearPoint(point);
    if (nearbyLines.length > 0) {
      const associatedWall = findWallForLine(walls, nearbyLines[0]);
      if (associatedWall) {

        setEditingWall(associatedWall);
        setWallPropertiesDialogOpen(true);
        debugLog(`Opening wall properties for wall: ${associatedWall.id}`);
        return;
      }
    }
    
    // FIFTH: Fall back to existing functionality (other elements)
    handleDoubleClickLegacy(e.nativeEvent);
  };

  // Handle wall properties save
  const handleWallPropertiesSave = (wallId: string, temperature: number) => {

    
    if (onWallsUpdate) {
      const updatedWalls = walls.map(wall => 
        wall.id === wallId 
          ? { ...wall, properties: { ...wall.properties, temperature } }
          : wall
      );
      onWallsUpdate(updatedWalls);
      
      // CRITICAL FIX: Update editingWall to reflect the new temperature
      if (editingWall && editingWall.id === wallId) {
        const updatedEditingWall = { ...editingWall, properties: { ...editingWall.properties, temperature } };

        setEditingWall(updatedEditingWall);
      }
    } else {

    }
  }

  const handleStairPropertiesSave = (stairId: string, temperature: number) => {

    if (onStairPolygonsUpdate) {
      const updatedStairs = stairPolygons.map((stair) => {
        if (stair.id === stairId) {
          return { ...stair, temperature };
        } else {
          return stair;
        }
      });
      onStairPolygonsUpdate(updatedStairs);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const point = getCanvasPoint(e);

    // Prioritize measurement preview updates
    // At the beginning of handleMouseMove
    // Find this section near the beginning of handleMouseMove
    if (currentTool === "measure" && isMeasuring && measureStart) {
      // Measurement preview update
      const { point: nearestPoint } = findNearestEndpoint(point);
      const snappedPoint = nearestPoint || snapToGrid(point);
      setMeasureEnd(snappedPoint);

      // Calculate distance
      const dx = snappedPoint.x - measureStart.x;
      const dy = snappedPoint.y - measureStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Only update preview if it's a meaningful measurement
      if (distance > 5) {
        // Update the preview measurement state instead of the measurements array
        setPreviewMeasurement({
          start: measureStart,
          end: snappedPoint,
          distance: pixelsToCm(distance),
          isPreview: true,
        });
      }
    }

    // Check for panning first
    if (isPanning) {
      handlePanMove(e);
      return;
    }

    setHoverPoint(point);

    if (isDraggingAirEntry && draggedAirEntry.index !== -1) {
      const point = getCanvasPoint(e);
      // Handle air entry dragging
      const entry = draggedAirEntry.entry;

      const newPosition = calculatePositionAlongWall(entry.line, point);
      // Calculate new position
      const newAirEntries = [...airEntries];
      newAirEntries[draggedAirEntry.index] = {
        ...entry,
        position: newPosition,
      };

      if (onAirEntriesUpdate) {
        onAirEntriesUpdate(newAirEntries);
      }
      return;
    }

    if (isDraggingEndpoint) {
      const point = getCanvasPoint(e);
      const nearestEndpointResult = findNearestEndpoint(point);
      // Extract the actual point data or use the original point
      const targetPoint: Point = nearestEndpointResult.point || point;

      if (draggedPoint.lines.length > 0) {
        const oldLines = [...lines];
        const newLines = [...lines];
        let linesUpdated = false;

        draggedPoint.lines.forEach((line, index) => {
          const lineIndex = newLines.findIndex((l) => l.id === line.id);

          if (lineIndex >= 0) {
            newLines[lineIndex] = {
              ...newLines[lineIndex],
              ...(draggedPoint.isStart[index]
                ? { start: targetPoint }
                : { end: targetPoint }),
            };
            linesUpdated = true;
          }
        });

        if (linesUpdated) {
          onLinesUpdate?.(newLines);
          updateAirEntriesWithWalls(newLines, oldLines);

          const updatedLines: Line[] = [];
          const updatedIsStart: boolean[] = [];

          draggedPoint.lines.forEach((line, index) => {
            const newLine = newLines.find((l) => l.id === line.id);
            if (newLine) {
              updatedLines.push(newLine);
              updatedIsStart.push(draggedPoint.isStart[index]);
            }
          });

          // Extract the actual Point data if targetPoint contains extra properties
          const extractedPoint: Point = {
            x: targetPoint.x,
            y: targetPoint.y,
          };

          setDraggedPoint({
            point: extractedPoint,
            lines: updatedLines,
            isStart: updatedIsStart,
          });
        }
        return;
      }
    }

    throttleMouseMove(e);
  };

  const handleMouseDown = (
    e: ReactMouseEvent<HTMLCanvasElement, MouseEvent>,
  ) => {
    // Check if we should ignore this click (set by double-click handler)
    if (ignoreNextClick) {
      debugLog("Ignoring click due to ignoreNextClick flag");
      setIgnoreNextClick(false);
      return;
    }

    debugLog(
      `Mouse down event - button: ${e.button}, currentTool: ${currentTool}`,
    );
    debugLog(
      `State flags - ignoreStairToolClick: ${ignoreStairToolClick}, isDrawingStairs: ${isDrawingStairs}`,
    );
    const nativeEvent = e.nativeEvent;
    const point = getCanvasPoint(nativeEvent);

    // Handle different mouse buttons
    if (e.button === 0) {
      // Left-click handling

      // Handle the wall tool
      if (currentTool === "wall") {
        // If we already have a cursorPoint with snap info, use that
        // otherwise find the nearest endpoint
        let startPoint;
        if (cursorPoint && snapSource) {
          startPoint = cursorPoint; // Use the already snapped point
        } else {
          const { point: nearestPoint } = findNearestEndpoint(point);
          startPoint = nearestPoint || snapToGrid(point);
        }

        const newLineId = Math.random().toString(36).substring(2, 9);
        setCurrentLine({
          id: newLineId,
          start: startPoint,
          end: startPoint,
        });
        setIsDrawing(true);
        setCursorPoint(startPoint);
        return;
      }

      // Handle the stairs tool mode
      if (currentTool === "stairs") {
        debugLog(`Stairs tool click detected at (${point.x}, ${point.y})`);
        debugLog(
          `ignoreStairToolClick: ${ignoreStairToolClick}, ignoreNextClick: ${ignoreNextClick}`,
        );

        if (ignoreStairToolClick) {
          debugLog(
            "Ignoring stair tool click due to ignoreStairToolClick flag",
          );
          return;
        }

        e.preventDefault();
        debugLog(
          `Starting/continuing stair drawing (isDrawingStairs: ${isDrawingStairs})`,
        );

        const { point: nearestPoint, source } = findNearestEndpoint(point);
        const snappedPoint = nearestPoint || snapToGrid(point);

        if (!isDrawingStairs) {
          // Starting a new stair polygon
          setIsDrawingStairs(true);
          setCurrentStairPoints([snappedPoint]);
          setPreviewStairPoint(snappedPoint);
          // Set snap source
          setSnapSource(nearestPoint ? source : "grid");
        } else {
          // Continue adding points to the existing stair polygon
          setCurrentStairPoints((prev) => [...prev, snappedPoint]);
        }
        return;
      }

      // Handle measurement tool
      // Handle measurement tool
      if (currentTool === "measure" && !ignoreMeasureToolClick) {
        e.stopPropagation();

        debugLog(`Measure tool click detected at (${point.x}, ${point.y})`);
        debugLog(`ignoreMeasureToolClick: ${ignoreMeasureToolClick}, isMeasuring: ${isMeasuring}`);

        // Get the nearest endpoint or snap to grid
        const { point: nearestPoint } = findNearestEndpoint(point);
        const snappedPoint = nearestPoint || snapToGrid(point);

        if (!isMeasuring) {
          // First click - set the start point
          debugLog(`Starting measurement`);
          setIsMeasuring(true);
          setMeasureStart(snappedPoint);
          setMeasureEnd(snappedPoint);
        } else {
          // Second click - complete the measurement
          debugLog(`Completing measurement`);

          // Only create measurement if points are different enough
          const dx = snappedPoint.x - measureStart!.x;
          const dy = snappedPoint.y - measureStart!.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > 5) {
            // Create a permanent measurement
            const newMeasurement = {
              start: measureStart!,
              end: snappedPoint,
              distance: pixelsToCm(distance),
              isPreview: false,
            };

            // Add the new measurement to the permanent measurements
            onMeasurementsUpdate?.([...measurements, newMeasurement]);
          }

          // Reset measurement state and clear preview
          setIsMeasuring(false);
          setMeasureStart(null);
          setMeasureEnd(null);
          setPreviewMeasurement(null);
        }

        return;
      }
      // If pan mode is active, use left-click for panning
      if (panMode) {
        handlePanStart(nativeEvent);
        return;
      }

      // Handle eraser tool
      if (currentTool === "eraser") {
        const airEntryInfo = findAirEntryAtLocation(point);
        const measurementInfo = findMeasurementAtPoint(point, measurements);
        const stairPolygonInfo = findStairPolygonAtPoint(point, stairPolygons);

        if (airEntryInfo) {
          const newAirEntries = airEntries.filter(
            (_, i) => i !== airEntryInfo.index,
          );
          onAirEntriesUpdate?.(newAirEntries);
        } else if (measurementInfo) {
          const newMeasurements = measurements.filter(
            (_, i) => i !== measurementInfo.index,
          );
          onMeasurementsUpdate?.(newMeasurements);
        } else if (stairPolygonInfo) {
          // Erase the stair polygon
          const newStairPolygons = stairPolygons.filter(
            (_, i) => i !== stairPolygonInfo.index,
          );
          onStairPolygonsUpdate?.(newStairPolygons);
        } else {
          const nearbyLines = findLinesNearPoint(point);
          if (nearbyLines.length > 0) {
            const newLines = lines.filter(
              (line) =>
                !nearbyLines.some(
                  (nearbyLine) =>
                    arePointsNearlyEqual(line.start, nearbyLine.start) &&
                    arePointsNearlyEqual(line.end, nearbyLine.end),
                ),
            );
            onLinesUpdate?.(newLines);

            // Remove walls associated with deleted lines
            if (onWallsUpdate && nearbyLines.length > 0) {
              const wallsToDelete = findWallsForDeletedLines(walls, nearbyLines);
              const newWalls = walls.filter(wall => 
                !wallsToDelete.some(deleteWall => deleteWall.id === wall.id)
              );
              onWallsUpdate(newWalls);
            }
          }
        }
        setHighlightState({
          lines: [],
          airEntry: null,
          measurement: null,
          stairPolygon: null,
        });
        return;
      }

      // Handle air entry placement
      if (currentAirEntry) {
        const selectedLines = findLinesNearPoint(point);
        if (selectedLines.length > 0) {
          const selectedLine = selectedLines[0];
          const exactPoint = getPointOnLine(selectedLine, point);

          // UNCONVENTIONAL WORKFLOW: Create element immediately on wall click
          // This provides instant visual feedback to users - they see the element appear right away
          // The dialog then functions as an "edit mode" rather than "creation mode"
          // Benefits: Better UX, immediate feedback, intuitive workflow
          
          // Find the wall associated with this line to get wall ID and ceiling height
          const lineId = selectedLine.id?.toString() || lineToUniqueId(selectedLine);
          const associatedWall = walls?.find(wall => 
            wall.lineRef === lineId || 
            wall.lineRef === lineToUniqueId(selectedLine) ||
            (wall.startPoint.x === selectedLine.start.x && 
             wall.startPoint.y === selectedLine.start.y &&
             wall.endPoint.x === selectedLine.end.x && 
             wall.endPoint.y === selectedLine.end.y)
          );
          const wallId = associatedWall?.id || `${floorText}_wall_unknown`;
          const currentCeilingHeight = ceilingHeight; // Use the prop value

          // Use centralized ID generation from store

          // Create new AirEntry WITHOUT ID (store will generate it)
          const newAirEntryWithoutId = {
            type: currentAirEntry,
            position: calculatePositionAlongWall(selectedLine, exactPoint),
            dimensions: {
              width: currentAirEntry === 'door' ? 80 : 60, // Default width in cm
              height: currentAirEntry === 'door' ? 200 : 40, // Default height in cm
              distanceToFloor: currentAirEntry === 'door' ? 0 : 110, // Default distance to floor in cm
              shape: 'rectangular',
            },
            line: selectedLine,
            lineId: selectedLine.id,
            properties: {
              state: 'closed',
              temperature: 20,
              flowType: 'Air Mass Flow',
              flowValue: 0.5,
              flowIntensity: 'medium',
              airOrientation: 'inflow',
            },
            wallContext: {
              wallId: wallId,
              floorName: floorText,
              wallStart: { x: selectedLine.start.x, y: selectedLine.start.y },
              wallEnd: { x: selectedLine.end.x, y: selectedLine.end.y },
              clickPosition: { x: point.x, y: point.y },
              ceilingHeight: currentCeilingHeight * 100 // Convert to cm
            }
          };

          // Use store to add entry WITH generated ID
          console.log("🔍 [ID CREATION DEBUG] BEFORE addAirEntryToFloor:", {
            currentFloor,
            entryType: newAirEntryWithoutId.type,
            entryWithoutId: newAirEntryWithoutId
          });
          
          const generatedId = useRoomStore.getState().addAirEntryToFloor(currentFloor, newAirEntryWithoutId);
          
          console.log("🔍 [ID CREATION DEBUG] AFTER addAirEntryToFloor:", {
            generatedId,
            currentFloor,
            storeFloorData: useRoomStore.getState().floors[currentFloor]
          });
          
          const newAirEntry = { ...newAirEntryWithoutId, id: generatedId } as any;

          // Update local state
          const newAirEntries = [...airEntries, newAirEntry];
          console.log("🔍 [ID CREATION DEBUG] Updated local airEntries:", {
            newAirEntriesCount: newAirEntries.length,
            lastEntryId: newAirEntries[newAirEntries.length - 1]?.id,
            lastEntryType: newAirEntries[newAirEntries.length - 1]?.type
          });
          
          onAirEntriesUpdate?.(newAirEntries);

          // Open dialog in "edit mode" for the just-created element
          // This makes the dialog function as parameter adjustment rather than creation
          // User perceives this as "configuring" the element they just placed
          // Open dialog in "create mode" for the just-created element
          setEditingAirEntries(prev => [...prev, {
            index: airEntries.length, // Index of the newly added element
            entry: newAirEntry,
            position: calculateDialogPosition(prev.length),
            isCreating: true // Mark as creation mode
          }]);
        }
        return;
      }
    } else if (e.button === 2) {
      // Right-click
      e.preventDefault();

      // Check if clicking on an endpoint
      const pointInfo = findPointAtLocation(point);
      if (pointInfo) {
        setIsDraggingEndpoint(true);
        setDraggedPoint(pointInfo);
        return;
      }

      // Check if clicking on an air entry
      const airEntryInfo = findAirEntryAtLocation(point);
      if (airEntryInfo) {
        setIsDraggingAirEntry(true);
        setDraggedAirEntry({
          index: airEntryInfo.index,
          entry: airEntryInfo.entry,
          startPoint: point,
        });
        return;
      }

      // If not on a special element, start panning

      handlePanStart(nativeEvent);
      return;
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    // First check if we're panning and need to stop
    if (isPanning) {
      handlePanEnd();
      return;
    }

    // Handle right-click when drawing stairs to complete the polygon
    if (isDrawingStairs && e.button === 2) {
      e.preventDefault();
      


      // Only create a stair polygon if we have at least 3 points
      if (currentStairPoints.length >= 3) {

        
        // Create a new stair polygon with proper ID format
        const stairCount = (stairPolygons || []).filter(s => s.floor === floorText).length + 1;
        const floorCode = currentFloor === "ground" ? "0F" : 
                         currentFloor === "first" ? "1F" :
                         currentFloor === "second" ? "2F" :
                         currentFloor === "third" ? "3F" :
                         currentFloor === "fourth" ? "4F" :
                         currentFloor === "fifth" ? "5F" : "0F";
        

        
        const newStairPolygon: StairPolygon = {
          id: `stair_${floorCode}_${stairCount}`,
          points: [...currentStairPoints],
          floor: floorText,
          temperature: defaultStairTemperature,
        };




        // Add the new stair polygon
        if (onStairPolygonsUpdate) {
          const updatedPolygons = [...(stairPolygons || []), newStairPolygon];

          onStairPolygonsUpdate(updatedPolygons);

        } else {

        }
      } else {

      }

      // Reset stair drawing state

      setIsDrawingStairs(false);
      setCurrentStairPoints([]);
      setPreviewStairPoint(null);

      return;
    }

    // Clean up measurement when switching tools
    if (currentTool !== "measure") {
      setMeasureStart(null);
      setMeasureEnd(null);
      setIsMeasuring(false);
    }

    if (isDraggingAirEntry) {
      setIsDraggingAirEntry(false);
      setDraggedAirEntry({
        index: -1,
        entry: {} as AirEntry,
        startPoint: { x: 0, y: 0 },
      });
      return;
    }

    if (isDraggingEndpoint) {
      setIsDraggingEndpoint(false);
      setDraggedPoint({ point: { x: 0, y: 0 }, lines: [], isStart: [] });
      return;
    }

    if (currentTool === "wall" && isDrawing && currentLine) {
      if (
        currentLine.start.x !== currentLine.end.x ||
        currentLine.start.y !== currentLine.end.y
      ) {
        // Asignar un ID único a la línea antes de crear el wall
        const lineWithId = {
          ...currentLine,
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        const newLines = [...lines, lineWithId];
        onLinesUpdate?.(newLines);

        // Create wall automatically when line is completed
        if (onWallsUpdate) {
          const newWall = createWallFromLine(lineWithId, floorText, walls, defaultWallTemperature);
          const newWalls = [...(walls || []), newWall];
          onWallsUpdate(newWalls);
        }
      }
      setCurrentLine(null);
      setIsDrawing(false);
      setCursorPoint(null);
    }
  };

  const handleMouseLeave = () => {
    if (isDraggingAirEntry) {
      setIsDraggingAirEntry(false);
      setDraggedAirEntry({
        index: -1,
        entry: {} as AirEntry,
        startPoint: { x: 0, y: 0 },
      });
    }

    if (isDraggingEndpoint) {
      setIsDraggingEndpoint(false);
      setDraggedPoint({ point: { x: 0, y: 0 }, lines: [], isStart: [] });
    }

    handlePanEnd();
    setHighlightState({
      lines: [],
      airEntry: null,
      measurement: null,
      stairPolygon: null,
    });
    setHoveredGridPoint(null);
    setHoverPoint(null);
    setHoveredAirEntry(null);
    setHoveredEndpoint(null);

    if (isDrawing) {
      setCurrentLine(null);
      setIsDrawing(false);
      setCursorPoint(null);
    }

    // Reset stairs drawing if we leave the canvas
    if (isDrawingStairs) {
      setIsDrawingStairs(false);
      setCurrentStairPoints([]);
      setPreviewStairPoint(null);
    }
  };

  const findAirEntryAtLocation = (
    clickPoint: Point,
  ): { index: number; entry: AirEntry } | null => {
    for (let i = 0; i < airEntries.length; i++) {
      const entry = airEntries[i];
      const normal = calculateNormal(entry.line);
      const widthInPixels = cmToPixels(entry.dimensions.width);
      const halfWidth = widthInPixels / 2;

      const start = {
        x: entry.position.x - normal.x * halfWidth,
        y: entry.position.y - normal.y * halfWidth,
      };

      const end = {
        x: entry.position.x + normal.x * halfWidth,
        y: entry.position.y + normal.y * halfWidth,
      };

      const distanceToEntry = distanceToLineSegment(clickPoint, start, end);
      
      if (distanceToEntry < 20 / zoom) {
        return { index: i, entry };
      }
    }

    return null;
  };

  const updateAirEntriesWithWalls = (newLines: Line[], oldLines: Line[]) => {

    if (airEntries.length === 0) return;

    const idMap = new Map<string, Line>();

    oldLines.forEach((oldLine) => {
      if (!oldLine.id) return;

      const newLine = newLines.find((nl) => nl.id === oldLine.id);
      if (newLine) {
        idMap.set(oldLine.id, newLine);
      }
    });

    const newAirEntries = airEntries.map((entry) => {
      if (!entry.lineId) return entry;

      const updatedLine = idMap.get(entry.lineId);
      if (!updatedLine) return entry;

      const relativePos = getRelativePositionOnLine(entry.position, entry.line);
      const newPosition = getPointAtRelativePosition(updatedLine, relativePos);

      return {
        ...entry,
        line: updatedLine,
        position: newPosition,
      };
    });

    if (
      JSON.stringify(newAirEntries) !== JSON.stringify(airEntries) &&
      onAirEntriesUpdate
    ) {
      onAirEntriesUpdate(newAirEntries);
    }
  };

  const findMeasurementAtPoint = (
    point: Point,
    measurements: Measurement[],
  ): { index: number; measurement: Measurement } | null => {
    for (let i = 0; i < measurements.length; i++) {
      const measurement = measurements[i];
      const distance = distanceToLineSegment(
        point,
        measurement.start,
        measurement.end,
      );
      // Use a slightly larger detection distance to match other erasable elements
      // and account for zoom level
      if (distance < HOVER_DISTANCE / zoom) {
        return { index: i, measurement };
      }
    }
    return null;
  };

  const findStairPolygonAtPoint = (
    point: Point,
    polygons: StairPolygon[],
  ): { index: number; polygon: StairPolygon } | null => {
    // First filter out imported stairs when using eraser tool
    const editablePolygons =
      currentTool === "eraser"
        ? polygons.filter((p) => !p.isImported)
        : polygons;

    // Now check only in editable polygons
    for (let i = 0; i < editablePolygons.length; i++) {
      const polygon = editablePolygons[i];
      const originalIndex = polygons.findIndex((p) => p.id === polygon.id);

      // Check if point is inside the polygon
      if (isPointInPolygon(point, polygon.points)) {
        return { index: originalIndex, polygon };
      }

      // Check if the point is close to any polygon edge
      for (let j = 0; j < polygon.points.length; j++) {
        const start = polygon.points[j];
        const end = polygon.points[(j + 1) % polygon.points.length];

        const distance = distanceToLineSegment(point, start, end);
        if (distance < HOVER_DISTANCE / zoom) {
          return { index: originalIndex, polygon };
        }
      }

      // Check if point is close to any polygon vertex
      for (const vertexPoint of polygon.points) {
        const dx = point.x - vertexPoint.x;
        const dy = point.y - vertexPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < (POINT_RADIUS * 2) / zoom) {
          return { index: originalIndex, polygon };
        }
      }
    }

    return null;
  };

  // MODIFICATION 4: Add helper function to check if a point is inside a polygon
  const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
    // Ray casting algorithm
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x,
        yi = polygon[i].y;
      const xj = polygon[j].x,
        yj = polygon[j].y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  };

  // Function to draw stair polygons

  const drawStairPolygon = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    isPreview: boolean = false,
    isHighlighted: boolean = false,
    isImported: boolean = false,
    isSnapTarget: boolean = false,
  ) => {
    if (points.length < 2) return;

    // Set styles for stair polygon
    ctx.save();

    // Determine the appropriate styling
    if (isHighlighted) {
      // Highlighted for deletion styling
      ctx.strokeStyle = "rgba(239, 68, 68, 0.8)"; // Red color
      ctx.fillStyle = "rgba(239, 68, 68, 0.3)";
      ctx.lineWidth = 3 / zoom;
      ctx.setLineDash([]);
    } else if (isImported) {
      // Imported stairs styling - dark red/burgundy color
      ctx.strokeStyle = "rgba(153, 27, 27, 0.8)"; // Dark red color
      ctx.fillStyle = "rgba(153, 27, 27, 0.3)";
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 3 / zoom]); // Use dashed lines for imported stairs
    } else if (isPreview) {
      // Preview styling
      ctx.strokeStyle = "rgba(124, 58, 237, 0.8)"; // Violet color
      ctx.fillStyle = "rgba(124, 58, 237, 0.2)";
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 5 / zoom]);
    } else {
      // Completed stair styling - solid
      const color = "#7c3aed"; // Violet color for all stairs
      ctx.strokeStyle = color;
      ctx.fillStyle = `${color}33`; // Add transparency
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([]);
    }

    // Draw the polygon
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    // Close the polygon if we're not in preview or if we have 3+ points
    if (!isPreview || points.length >= 3) {
      ctx.closePath();
    }

    ctx.fill();
    ctx.stroke();

    // Add stair label and direction indicators
    if (!isPreview && points.length >= 3) {
      // Calculate center point
      const center = points.reduce(
        (acc, point) => ({
          x: acc.x + point.x / points.length,
          y: acc.y + point.y / points.length,
        }),
        { x: 0, y: 0 },
      );

      // Add "STAIR" label
      ctx.fillStyle = isImported ? "#991b1b" : "#000"; // Different text color for imported stairs
      ctx.font = `${12 / zoom}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Show different text based on imported status
      const label = isImported ? "IMPORTED STAIR" : "STAIR";
      ctx.fillText(label, center.x, center.y);

      // Remove direction indicator - no longer needed

      // If imported, add a "non-editable" indicator
      if (isImported) {
        ctx.fillText("(Non-editable)", center.x, center.y + 28 / zoom);
      }
    }

    // Draw points/vertices with different styles for imported stairs
    // Inside the drawStairPolygon function, modify the points drawing loop:
    points.forEach((point, index) => {
      const isSnapPoint =
        isSnapTarget &&
        snapSource === "stair" &&
        previewStairPoint &&
        arePointsNearlyEqual(point, previewStairPoint);

      // Check if this point is being hovered over
      const isHovered =
        !isPreview &&
        !isImported &&
        hoverPoint &&
        !isDrawing &&
        Math.sqrt(
          Math.pow(point.x - hoverPoint.x, 2) +
            Math.pow(point.y - hoverPoint.y, 2),
        ) <
          (POINT_RADIUS * 2) / zoom;

      ctx.beginPath();
      // Set fill color based on state
      ctx.fillStyle = isSnapPoint
        ? "#ef4444" // Red for snap target points
        : isHovered
          ? "#fbbf24" // Amber for hover
          : isImported
            ? "#991b1b"
            : isPreview
              ? "rgba(124, 58, 237, 0.8)"
              : "#7c3aed";

      // Make hovered points slightly larger
      const pointRadius =
        isSnapPoint || isHovered
          ? (POINT_RADIUS * 1.5) / zoom
          : POINT_RADIUS / zoom;
      ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
      ctx.fill();

      // Add a "snap" indicator when snapping to a stair point
      if (isSnapPoint) {
        ctx.fillStyle = "#ef4444";
        ctx.font = `${10 / zoom}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("SNAP", point.x, point.y - 12 / zoom);
      }

      // Add a "double-click to edit" tooltip when hovering over a stair point
      if (isHovered) {
        ctx.fillStyle = "#000000";
        ctx.font = `${10 / zoom}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("Double-click to edit", point.x, point.y - 12 / zoom);
      }

      // Number the points for clarity (not for imported stairs)
      if (!isPreview && !isImported) {
        ctx.fillStyle = "#fff";
        ctx.font = `${10 / zoom}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${index + 1}`, point.x, point.y);
      }
    });

    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const drawCrosshair = (ctx: CanvasRenderingContext2D, point: Point) => {
      const size = 10 / zoom;

      ctx.beginPath();
      ctx.strokeStyle = "#718096";
      ctx.lineWidth = 1 / zoom;

      ctx.moveTo(point.x - size, point.y);
      ctx.lineTo(point.x + size, point.y);

      ctx.moveTo(point.x, point.y - size);
      ctx.lineTo(point.x, point.y + size);

      ctx.stroke();
    };

    const drawMeasurement = (
      ctx: CanvasRenderingContext2D,
      start: Point,
      end: Point,
      isHighlighted: boolean = false,
      isPreview: boolean = false,
    ) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distanceInPixels = Math.sqrt(dx * dx + dy * dy);
      const distanceInCm = Math.round(pixelsToCm(distanceInPixels));

      // Draw arrow line
      ctx.save();
      // Determine stroke style based on state
      if (isHighlighted) {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.6)"; // Red for deletion highlight
      } else if (isPreview) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.6)"; // Black for preview
      } else {
        ctx.strokeStyle = "rgba(75, 85, 99, 0.6)"; // Gray for completed measurement
      }
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5, 5]); // Dashed line

      // Draw main line
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Reset dash settings for arrows
      ctx.setLineDash([]);

      // Calculate arrow parameters
      const angle = Math.atan2(dy, dx);
      const arrowLength = 15 / zoom;
      const arrowHeadLength = 10 / zoom;
      const arrowWidth = 6 / zoom;

      // Draw start arrow (pointing outward)
      ctx.beginPath();
      // Arrow shaft
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(
        start.x + arrowLength * Math.cos(angle),
        start.y + arrowLength * Math.sin(angle),
      );
      // Arrow head
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(
        start.x +
          arrowHeadLength * Math.cos(angle) +
          arrowWidth * Math.sin(angle),
        start.y +
          arrowHeadLength * Math.sin(angle) -
          arrowWidth * Math.cos(angle),
      );
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(
        start.x +
          arrowHeadLength * Math.cos(angle) -
          arrowWidth * Math.sin(angle),
        start.y +
          arrowHeadLength * Math.sin(angle) +
          arrowWidth * Math.cos(angle),
      );
      ctx.stroke();

      // Draw end arrow (pointing outward)
      ctx.beginPath();
      // Arrow shaft
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - arrowLength * Math.cos(angle),
        end.y - arrowLength * Math.sin(angle),
      );
      // Arrow head
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x -
          arrowHeadLength * Math.cos(angle) +
          arrowWidth * Math.sin(angle),
        end.y -
          arrowHeadLength * Math.sin(angle) -
          arrowWidth * Math.cos(angle),
      );
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x -
          arrowHeadLength * Math.cos(angle) -
          arrowWidth * Math.sin(angle),
        end.y -
          arrowHeadLength * Math.sin(angle) +
          arrowWidth * Math.cos(angle),
      );
      ctx.stroke();

      // Draw measurement label
      const midPoint = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      };

      ctx.font = `${14 / zoom}px Arial`;
      ctx.fillStyle = "rgba(75, 85, 99, 0.8)";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${distanceInCm} cm`, midPoint.x, midPoint.y - 5 / zoom);

      ctx.restore();
    };

    const drawWallMeasurements = (
      ctx: CanvasRenderingContext2D,
      line: Line,
    ) => {
      const dx = line.end.x - line.start.x;
      const dy = line.end.y - line.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const lengthInCm = Math.round(pixelsToCm(length));

      // Calculate midpoint of the line
      const midX = (line.start.x + line.end.x) / 2;
      const midY = (line.start.y + line.end.y) / 2;

      // Offset the label slightly above the line
      const offset = 15 / zoom;
      const angle = Math.atan2(dy, dx);
      const labelX = midX - offset * Math.sin(angle);
      const labelY = midY + offset * Math.cos(angle);

      // Draw the measurement
      ctx.save();
      ctx.font = getScaledFont(12, 'Arial');
      ctx.fillStyle = "#6b7280"; // Gray color
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Rotate the text to align with the wall
      ctx.translate(labelX, labelY);
      if (dx < 0) {
        ctx.rotate(angle + Math.PI);
      } else {
        ctx.rotate(angle);
      }
      ctx.fillText(`${lengthInCm} cm`, 0, 0);
      ctx.restore();
    };

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear canvas and set up coordinate system
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // Draw grid lines with consistent line width
      ctx.beginPath();
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1 / zoom; // Match wall line scaling

      //const centerX = dimensions.width / 2;
      //const centerY = dimensions.height / 2;

      // Calculate visible area based on current pan and zoom
      const visibleStartX = -pan.x / zoom - gridSize;
      const visibleEndX = (-pan.x + dimensions.width) / zoom + gridSize;
      const visibleStartY = -pan.y / zoom - gridSize;
      const visibleEndY = (-pan.y + dimensions.height) / zoom + gridSize;

      // Draw coordinate system
      const { centerX, centerY, arrowLength } = getCoordinateSystemParams();
      // Calculate grid starting points
      const startXGrid =
        Math.floor((visibleStartX - centerX) / gridSize) * gridSize;
      const endXGrid = Math.ceil((visibleEndX - centerX) / gridSize) * gridSize;
      const startYGrid =
        Math.floor((visibleStartY - centerY) / gridSize) * gridSize;
      const endYGrid = Math.ceil((visibleEndY - centerY) / gridSize) * gridSize;

      // Draw vertical grid lines
      for (let x = startXGrid; x <= endXGrid; x += gridSize) {
        ctx.moveTo(centerX + x, centerY + startYGrid);
        ctx.lineTo(centerX + x, centerY + endYGrid);
      }

      // Draw horizontal grid lines
      for (let y = startYGrid; y <= endYGrid; y += gridSize) {
        ctx.moveTo(centerX + startXGrid, centerY + y);
        ctx.lineTo(centerX + endXGrid, centerY + y);
      }
      ctx.stroke();

      const coordSystem = createCoordinateSystem();

      coordSystem.forEach((line, index) => {
        ctx.beginPath();
        ctx.strokeStyle = index < 3 ? "#ef4444" : "#22c55e";
        ctx.lineWidth = 2 / zoom; // Match wall line width
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
      });

      ctx.font = `${14 / zoom}px Arial`;
      ctx.fillStyle = "#ef4444"; // Red for X-axis
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("X", centerX + arrowLength + 5, centerY + 5);

      ctx.fillStyle = "#22c55e"; // Green for Y-axis
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Y", centerX + 5, centerY - arrowLength - 15);

      // Draw origin point
      ctx.beginPath();
      ctx.fillStyle = "#000000";
      ctx.arc(centerX, centerY, 3 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000000";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("(0,0)", centerX - 5, centerY - 5);
      // Draw wall lines
      lines.forEach((line) => {
        ctx.strokeStyle = highlightState.lines.includes(line)
          ? getHighlightColor()
          : "#000000";
        ctx.lineWidth = 2 / zoom; // Keep consistent wall line width
        ctx.beginPath();
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
      });

      ctx.font = `${12 / zoom}px sans-serif`;
      ctx.fillStyle = "#64748b";
      lines.forEach((line) => {
        const midX = (line.start.x + line.end.x) / 2;
        const midY = (line.start.y + line.end.y) / 2;
        const length = Math.round(getLineLength(line));
        drawWallMeasurements(ctx, line);
      });

      if (currentLine) {
        ctx.beginPath();
        ctx.strokeStyle = "#00000";
        ctx.lineWidth = 2 / zoom;
        ctx.moveTo(currentLine.start.x, currentLine.start.y);
        ctx.lineTo(currentLine.end.x, currentLine.end.y);
        ctx.stroke();

        const length = Math.round(getLineLength(currentLine));
        const midX = (currentLine.start.x + currentLine.end.x) / 2;
        const midY = (currentLine.start.y + currentLine.end.y) / 2;
        drawWallMeasurements(ctx, currentLine);
      }

      // Draw air entries with diagnostic info (reduced logging)
      const currentAirEntries = getCurrentAirEntries();
      
      // Only log on forceRedraw changes to avoid spam
      if (forceRedraw > 0) {
        console.log(`🎨 Canvas2D: FORCE REDRAW ${forceRedraw} - renderizando ${currentAirEntries.length} airEntries`);
        if (currentAirEntries.length > 0) {
          console.log(`🎨 Canvas2D: Primer airEntry - posición: (${currentAirEntries[0].position.x}, ${currentAirEntries[0].position.y})`);
        }
      }
      
      currentAirEntries.forEach((entry, index) => {
        drawAirEntry(ctx, entry, index);
      });

      const drawEndpoints = () => {
        const drawnPoints = new Set<string>();
        const originPoint = {
          x: dimensions.width / 2,
          y: dimensions.height / 2,
        };

        // Check if the origin is a snap target
        const isOriginSnapTarget =
          isDrawing &&
          currentTool === "wall" &&
          currentLine &&
          snapSource === "origin" &&
          arePointsNearlyEqual(currentLine.end, originPoint);

        // Draw origin snap point if it's a snap target during drawing
        if (isOriginSnapTarget) {
          ctx.beginPath();
          ctx.fillStyle = "#ef4444"; // Red for snapping
          ctx.arc(
            originPoint.x,
            originPoint.y,
            (POINT_RADIUS * 1.8) / zoom,
            0,
            Math.PI * 2,
          );
          ctx.fill();

          // Add "SNAP" text above the origin point
          ctx.font = `${10 / zoom}px Arial`;
          ctx.fillStyle = "#ef4444";
          ctx.textAlign = "center";
          ctx.fillText("SNAP (0,0)", originPoint.x, originPoint.y - 12 / zoom);
        }

        // Continue with drawing other endpoints as before...
        lines.forEach((line) => {
          [
            { point: line.start, isStart: true },
            { point: line.end, isStart: false },
          ].forEach(({ point, isStart }) => {
            const key = `${Math.round(point.x)},${Math.round(point.y)}`;
            if (!drawnPoints.has(key)) {
              drawnPoints.add(key);

              const isSnapTarget =
                isDrawing &&
                currentTool === "wall" &&
                currentLine &&
                snapSource === "endpoint" &&
                arePointsNearlyEqual(currentLine.end, point);

              const isHovered =
                hoveredEndpoint?.point &&
                arePointsNearlyEqual(hoveredEndpoint.point, point);

              ctx.beginPath();
              ctx.arc(
                point.x,
                point.y,
                isHovered || isSnapTarget
                  ? (POINT_RADIUS * 1.5) / zoom
                  : POINT_RADIUS / zoom,
                0,
                Math.PI * 2,
              );

              if (isSnapTarget) {
                ctx.fillStyle = "#ef4444"; // Red for snapping
                // Add "SNAP" text above the point
                ctx.font = `${10 / zoom}px Arial`;
                ctx.fillStyle = "#ef4444";
                ctx.textAlign = "center";
                ctx.fillText("SNAP", point.x, point.y - 12 / zoom);
              } else if (isHovered) {
                ctx.fillStyle = "#fbbf24"; // Amber color for hover
                // Update tooltip to include double-click information
                ctx.font = `${12 / zoom}px Arial`;
                ctx.fillStyle = "#000000";
                ctx.textAlign = "center";
                // Add "double-click" instruction in tooltip
                ctx.fillText(
                  "Right-click to drag, Double-click to edit",
                  point.x,
                  point.y - 15 / zoom,
                );
              } else {
                ctx.fillStyle = "#3b82f6"; // Blue color
              }

              ctx.fill();
            }
          });
        });
      };

      drawEndpoints();

      const endpoints = [
        ...new Set(lines.flatMap((line) => [line.start, line.end])),
      ];
      const endpointColorMap: Record<string, Point[]> = {
        "#fb923c": [],
        "#3b82f6": [],
        "#22c55e": [],
      };

      endpoints.forEach((point) => {
        const connections = findConnectedLines(point).length;
        let color = "#fb923c";

        if (connections > 1) {
          if (isInClosedContour(point, lines)) {
            color = "#22c55e";
          } else {
            color = "#3b82f6";
          }
        }

        if (color in endpointColorMap) {
          endpointColorMap[color].push(point);
        }
      });

      Object.entries(endpointColorMap).forEach(([color, points]) => {
        ctx.fillStyle = color;
        ctx.beginPath();

        points.forEach((point) => {
          ctx.moveTo(point.x, point.y);
          ctx.arc(point.x, point.y, POINT_RADIUS / zoom, 0, 2 * Math.PI);
        });

        ctx.fill();

        ctx.font = getScaledFont(12, 'sans-serif');
        
        // Use smart positioning to prevent label overlaps
        const existingLabels: any[] = [];
        points.forEach((point) => {
          const coords = getRelativeCoordinates(point);
          const text = `(${coords.x}, ${coords.y})`;
          const { offset, bounds } = findNonOverlappingPosition(point, text, ctx, existingLabels);
          
          drawCoordinateLabel(ctx, point, color, offset);
          existingLabels.push(bounds);
        });
      });

      if (cursorPoint && showCursorCoordinates) {
        ctx.font = getScaledFont(12);

        // Special handling for the origin point pre-drawing snap
        const originPoint = {
          x: dimensions.width / 2,
          y: dimensions.height / 2,
        };

        if (
          currentTool === "wall" &&
          !isDrawing &&
          snapSource === "origin" &&
          arePointsNearlyEqual(cursorPoint, originPoint)
        ) {
          // Draw special origin snap indicator
          ctx.beginPath();
          ctx.fillStyle = "#ef4444"; // Red for snapping
          ctx.arc(
            originPoint.x,
            originPoint.y,
            (POINT_RADIUS * 1.8) / zoom,
            0,
            Math.PI * 2,
          );
          ctx.fill();

          // Add "SNAP (0,0)" text for pre-drawing
          ctx.font = `${10 / zoom}px Arial`;
          ctx.fillStyle = "#ef4444";
          ctx.textAlign = "center";
          ctx.fillText("SNAP (0,0)", originPoint.x, originPoint.y - 12 / zoom);

          // Coordinate label is already drawn by the smart positioning system
        }
        // Special handling for endpoint pre-drawing snap
        else if (
          currentTool === "wall" &&
          !isDrawing &&
          snapSource === "endpoint"
        ) {
          // Endpoint snap indicator (coordinate label handled by smart positioning)
        }
        // Special handling for stair point pre-drawing snap
        else if (
          currentTool === "wall" &&
          !isDrawing &&
          snapSource === "stair"
        ) {
          // Stair point snap indicator (coordinate label handled by smart positioning)
        }
        // Regular drawing indicator (coordinate label handled by smart positioning)
        else if (isDrawing) {
          // Drawing state handled by smart positioning system
        }
      }

      if (hoverPoint && !isDrawing && !isPanning && showCursorCoordinates) {
        ctx.font = getScaledFont(12);
        // Hover point coordinate label handled by smart positioning system
        drawCrosshair(ctx, hoverPoint);
      }

      const drawMeasurements = (ctx: CanvasRenderingContext2D) => {
        // Draw all permanent measurements
        measurements.forEach((measurement, index) => {
          const isHighlighted = highlightState.measurement?.index === index;
          drawMeasurement(
            ctx,
            measurement.start,
            measurement.end,
            isHighlighted,
            false,
          );
        });

        // Draw the preview measurement separately
        if (previewMeasurement) {
          drawMeasurement(
            ctx,
            previewMeasurement.start,
            previewMeasurement.end,
            false,
            true,
          );
        }
      };

      drawMeasurements(ctx);

      // Draw all existing stair polygons
      // Find where stair polygons are drawn in the draw function (around line 1800-1830)
      // Draw all existing stair polygons
      if (stairPolygons && stairPolygons.length > 0) {
        stairPolygons.forEach((stair, index) => {
          const isHighlighted = highlightState.stairPolygon?.index === index;
          const isSnapTarget = isDrawingStairs && snapSource === "stair";

          drawStairPolygon(
            ctx,
            stair.points,
            false,
            isHighlighted,
            stair.isImported || false,
            isSnapTarget,
          );
        });
      }

      // Draw the stair polygon being created, if any
      if (isDrawingStairs && currentStairPoints.length > 0) {
        // Create a temporary array with current points plus preview point
        const previewPoints = [...currentStairPoints];
        if (previewStairPoint) {
          previewPoints.push(previewStairPoint);
        }

        // Draw the preview stair polygon
        drawStairPolygon(ctx, previewPoints, true, false, false, false);

        // Show tooltip if actively drawing stairs
        if (previewStairPoint) {
          ctx.save();
          ctx.font = `${12 / zoom}px Arial`;
          ctx.fillStyle = "#000000";
          ctx.textAlign = "center";
          // Add snap source info to tooltip
          if (snapSource === "stair") {
            ctx.fillText(
              "Snapping to stair point! Click to add, right-click to complete",
              previewStairPoint.x,
              previewStairPoint.y - 20 / zoom,
            );
          } else if (snapSource === "endpoint") {
            ctx.fillText(
              "Snapping to wall endpoint! Click to add, right-click to complete",
              previewStairPoint.x,
              previewStairPoint.y - 20 / zoom,
            );
          } else {
            ctx.fillText(
              "Click to add point, right-click to complete",
              previewStairPoint.x,
              previewStairPoint.y - 20 / zoom,
            );
          }
          ctx.restore();
        }
      }

      // Draw measurement preview
      /* if (isMeasuring && measureStart && measureEnd) {
        ctx.save();
        ctx.strokeStyle = "#4b5563"; // Gray color
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([5 / zoom, 5 / zoom]);

        // Draw the measurement line
        ctx.beginPath();
        ctx.moveTo(measureStart.x, measureStart.y);
        ctx.lineTo(measureEnd.x, measureEnd.y);
        ctx.stroke();

        // Draw points at start and end
        ctx.fillStyle = "#4b5563";
        ctx.beginPath();
        ctx.arc(
          measureStart.x,
          measureStart.y,
          POINT_RADIUS / zoom,
          0,
          Math.PI * 2,
        );
        ctx.arc(
          measureEnd.x,
          measureEnd.y,
          POINT_RADIUS / zoom,
          0,
          Math.PI * 2,
        );
        ctx.fill();

        // Draw distance label
        const distance = Math.round(
          pixelsToCm(
            Math.sqrt(
              Math.pow(measureEnd.x - measureStart.x, 2) +
                Math.pow(measureEnd.y - measureStart.y, 2),
            ),
          ),
        );
        const midX = (measureStart.x + measureEnd.x) / 2;
        const midY = (measureStart.y + measureEnd.y) / 2;

        ctx.font = `${14 / zoom}px Arial`;
        ctx.fillStyle = "#000000";
        ctx.textAlign = "center";
        ctx.fillText(`${distance} cm`, midX, midY - 10 / zoom);

        ctx.restore();
      }*/

      // Add wall measurements after drawing lines
      lines.forEach((line) => {
        drawWallMeasurements(ctx, line);
      });

      ctx.restore();
    };

    // Should be updated to:
    canvas.addEventListener("mousemove", handleDOMMouseMove);
    canvas.addEventListener("mouseup", handleDOMMouseUp);
    canvas.addEventListener("mouseleave", handleDOMMouseLeave);
    canvas.addEventListener("wheel", handleZoomWheel, { passive: false });
    canvas.addEventListener("wheel", handleRegularWheel, { passive: true });
    canvas.addEventListener("contextmenu", handleDOMContextMenu);
    canvas.addEventListener("dblclick", handleDOMDoubleClick);

    let lastRenderTime = 0;
    let animationFrameId: number;

    const render = (timestamp: number) => {
      const elapsed = timestamp - lastRenderTime;
      if (elapsed > 1000 / 60) {
        draw();
        lastRenderTime = timestamp;
      }
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      canvas.removeEventListener("mousemove", handleDOMMouseMove);
      canvas.removeEventListener("mouseup", handleDOMMouseUp);
      canvas.removeEventListener("mouseleave", handleDOMMouseLeave);
      canvas.removeEventListener("wheel", handleZoomWheel);
      canvas.removeEventListener("wheel", handleRegularWheel);
      canvas.removeEventListener("contextmenu", handleDOMContextMenu);
      canvas.removeEventListener("dblclick", handleDOMDoubleClick);

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    dimensions,
    lines,
    currentLine,
    isDrawing,
    zoom,
    pan,
    isPanning,
    panMode,
    cursorPoint,
    currentAirEntry,
    airEntries,
    onLinesUpdate,
    hoveredGridPoint,
    hoverPoint,
    isDraggingEndpoint,
    draggedPoint,
    isDraggingAirEntry,
    draggedAirEntry,
    onAirEntriesUpdate,
    highlightState,
    editingAirEntries,
    hoveredAirEntry,
    hoveredEndpoint,
    measureStart,
    measureEnd,
    isMeasuring,
    measurements,
    onMeasurementsUpdate,
    isMultifloor,
    previewMeasurement,
    // Add stair-related dependencies
    stairPolygons,
    isDrawingStairs,
    currentStairPoints,
    previewStairPoint,
    onStairPolygonsUpdate,
    floorText,
    snapSource,
    ignoreNextClick,
    ignoreStairToolClick,
    ignoreMeasureToolClick,
    forceRedraw, // Add reactive synchronization trigger
  ]);

  const handleZoomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    setZoomInput(value);
  };

  const handleZoomInputBlur = () => {
    let newZoom = parseInt(zoomInput) / 100;
    if (isNaN(newZoom)) {
      newZoom = zoom;
    } else {
      newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    }
    handleZoomChange(newZoom);
  };

  const handleZoomInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const fineDragSnap = (point: Point): Point => {
    // Simply return the original point without snapping
    return point;
  };

  // Updated double-click handler that includes wall properties editing
  const handleDoubleClickLegacy = (e: MouseEvent) => {
    debugLog("Double-click detected");
    debugLog(
      `Current tool: ${currentTool}, isDrawingStairs: ${isDrawingStairs}`,
    );

    // Set flag to ignore the next click (which is part of the double-click sequence)
    setIgnoreNextClick(true);
    // Convert to MouseEvent if needed
    const mouseEvent = e as MouseEvent;
    const clickPoint = getCanvasPoint(mouseEvent);

    // First check for air entries (existing functionality)
    const airEntryInfo = findAirEntryAtLocation(clickPoint);
    if (airEntryInfo) {
      openAirEntryDialog({
        index: airEntryInfo.index,
        entry: airEntryInfo.entry,
      });
      return;
    }

    // Then check for endpoint double-click
    const pointInfo = findPointAtLocation(clickPoint);
    if (pointInfo) {
      debugLog(
        `Double-click detected on wall endpoint at (${pointInfo.point.x}, ${pointInfo.point.y})`,
      );

      // If stair tool is active, set flag to prevent new stair creation
      // Handle tool-specific actions for double-click
      if (currentTool === "stairs") {
        debugLog("Setting ignoreStairToolClick flag to true for wall endpoint");
        setIgnoreStairToolClick(true);

        // Also cancel any active stair drawing
        if (isDrawingStairs) {
          debugLog("Canceling active stair drawing");
          setIsDrawingStairs(false);
          setCurrentStairPoints([]);
          setPreviewStairPoint(null);
        }

        // Reset the flag after a short delay
        setTimeout(() => {
          debugLog("Resetting ignoreStairToolClick flag to false");
          setIgnoreStairToolClick(false);
        }, 500);
      } else if (currentTool === "measure") {
        debugLog("Handling double-click while measure tool is active");

        // Set the ignore flag to prevent new measurement actions
        setIgnoreMeasureToolClick(true);
        debugLog("Setting ignoreMeasureToolClick flag to true");

        // Cancel any active measuring immediately
        if (isMeasuring) {
          debugLog("Canceling active measurement");
          setIsMeasuring(false);
          setMeasureStart(null);
          setMeasureEnd(null);
          setPreviewMeasurement(null);
        }

        // Reset the flag after a delay
        setTimeout(() => {
          setIgnoreMeasureToolClick(false);
          debugLog("Measurement ignore period ended");
        }, 500);
      }

      // Found a wall endpoint
      setEditingPoint({
        point: pointInfo.point,
        lines: pointInfo.lines,
        isStart: pointInfo.isStart,
        isStairPoint: false,
      });
      return;
    }

    // Check for stair polygon vertex double-click
    if (stairPolygons && stairPolygons.length > 0) {
      for (
        let polygonIndex = 0;
        polygonIndex < stairPolygons.length;
        polygonIndex++
      ) {
        const polygon = stairPolygons[polygonIndex];

        // Skip imported stair polygons as they shouldn't be editable
        if (polygon.isImported) continue;

        for (
          let pointIndex = 0;
          pointIndex < polygon.points.length;
          pointIndex++
        ) {
          const point = polygon.points[pointIndex];
          const dx = clickPoint.x - point.x;
          const dy = clickPoint.y - point.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < (POINT_RADIUS * 2) / zoom) {
            debugLog(
              `Double-click detected on stair point at (${point.x}, ${point.y})`,
            );
            debugLog(
              `Current tool: ${currentTool}, drawing stairs: ${isDrawingStairs}`,
            );

            // If stair tool is active, set flag to prevent new stair creation
            if (currentTool === "stairs") {
              debugLog("Setting ignoreStairToolClick flag to true");
              setIgnoreStairToolClick(true);

              // Also cancel any active stair drawing
              if (isDrawingStairs) {
                debugLog("Canceling active stair drawing");
                setIsDrawingStairs(false);
                setCurrentStairPoints([]);
                setPreviewStairPoint(null);
              }

              // Reset the flag after a short delay
              setTimeout(() => {
                debugLog("Resetting ignoreStairToolClick flag to false");
                setIgnoreStairToolClick(false);
              }, 500);
            }

            // Found a stair polygon vertex
            setEditingPoint({
              point: point,
              lines: [],
              isStart: [],
              isStairPoint: true,
              stairPolygonIndex: polygonIndex,
              pointIndex: pointIndex,
            });
            return;
          }
        }
      }
    }
  };

  const handleReactMouseMove = (
    e: ReactMouseEvent<HTMLCanvasElement, MouseEvent>,
  ) => {
    // Pass the native DOM event to your existing handler
    handleMouseMove(e.nativeEvent);
  };

  const handleReactMouseUp = (
    e: ReactMouseEvent<HTMLCanvasElement, MouseEvent>,
  ) => {
    handleMouseUp(e.nativeEvent);
  };

  const handleDOMMouseMove = (e: MouseEvent) => {
    handleMouseMove(e);
  };

  const handleDOMMouseUp = (e: MouseEvent) => {
    handleMouseUp(e);
  };

  const handleDOMMouseLeave = (e: MouseEvent) => {
    handleMouseLeave();
  };

  const handleDOMDoubleClick = (e: MouseEvent) => {
    handleDoubleClickLegacy(e);
  };

  const handleDOMContextMenu = (e: Event) => {
    handleContextMenu(e);
  };

  // Add this function inside the Canvas2D component to convert from cm to pixels
  const cmToCanvasCoordinates = (cmX: number, cmY: number): Point => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    return {
      x: centerX + cmToPixels(cmX),
      y: centerY - cmToPixels(cmY), // Y is inverted in canvas
    };
  };

  // Add this handler function inside the Canvas2D component
  const handleCoordinateEdit = (jsonCoordinates: Point) => {
    if (!editingPoint) return;

    // Convert the user input (JSON coordinates) to canvas coordinates
    const newPoint = denormalizeCoordinates({
      x: jsonCoordinates.x,
      y: jsonCoordinates.y,
    });

    if (
      editingPoint.isStairPoint &&
      typeof editingPoint.stairPolygonIndex === "number" &&
      typeof editingPoint.pointIndex === "number"
    ) {
      // Update stair polygon vertex
      const newStairPolygons = [...stairPolygons];
      const polygon = newStairPolygons[editingPoint.stairPolygonIndex];

      // Create a new points array with the updated point
      const newPoints = [...polygon.points];
      newPoints[editingPoint.pointIndex] = newPoint;

      // Update the polygon with the new points
      newStairPolygons[editingPoint.stairPolygonIndex] = {
        ...polygon,
        points: newPoints,
      };

      // Update the state
      onStairPolygonsUpdate?.(newStairPolygons);
    } else {
      // Update wall endpoint
      if (editingPoint.lines.length > 0) {
        const oldLines = [...lines];
        const newLines = [...lines];
        let linesUpdated = false;

        editingPoint.lines.forEach((line, index) => {
          const lineIndex = newLines.findIndex((l) => l.id === line.id);

          if (lineIndex >= 0) {
            newLines[lineIndex] = {
              ...newLines[lineIndex],
              ...(editingPoint.isStart[index]
                ? { start: newPoint }
                : { end: newPoint }),
            };
            linesUpdated = true;
          }
        });

        if (linesUpdated) {
          onLinesUpdate?.(newLines);
          updateAirEntriesWithWalls(newLines, oldLines);
        }
      }
    }

    // Close the editor
    setEditingPoint(null);
    // Reset the ignore flag to be safe
    setIgnoreNextClick(false);
  };

  // ERASER LOGIC: Reusable function that mimics the eraser tool behavior
  // This ensures consistent deletion logic between eraser tool and dialog cancel
  // Used for: 1) Eraser tool clicks, 2) Dialog X button (cancel creation)
  const eraseAirEntryAtIndex = (index: number) => {
    const newAirEntries = airEntries.filter((_, i) => i !== index);
    onAirEntriesUpdate?.(newAirEntries);
  };

  // SAVE CHANGES LOGIC: Updates existing element properties
  // This is called for BOTH newly created elements (from wall click) and existing elements (from double-click)
  // The workflow treats both cases identically - just updating an existing element in the array
  // Real-time position update handler - updates store immediately during dialog interactions
  const handleAirEntryPositionUpdate = (index: number, newPosition: { x: number; y: number }) => {
    console.log("🟢 [CANVAS2D DEBUG] handleAirEntryPositionUpdate called with index:", index, "position:", newPosition);
    
    // Update the store immediately to maintain visual consistency
    const updatedAirEntries = [...airEntries];
    if (updatedAirEntries[index]) {
      const originalEntry = updatedAirEntries[index];
      console.log("🟢 [CANVAS2D DEBUG] Original entry before update:", originalEntry);
      console.log("🟢 [CANVAS2D DEBUG] Original wallPosition:", originalEntry.dimensions?.wallPosition);
      
      updatedAirEntries[index] = {
        ...updatedAirEntries[index],
        position: newPosition
      };
      
      console.log("🟢 [CANVAS2D DEBUG] Updated entry after position change:", updatedAirEntries[index]);
      console.log("🟢 [CANVAS2D DEBUG] wallPosition preserved?:", updatedAirEntries[index].dimensions?.wallPosition);

      onAirEntriesUpdate?.(updatedAirEntries);
      
      // Also update the editing state for immediate visual feedback
      setEditingAirEntries(prev => prev.map(item => 
        item.index === index ? {
          ...item,
          entry: {
            ...item.entry,
            position: newPosition
          }
        } : item
      ));
    }
  };

  // Real-time dimensions update handler - updates store immediately during dialog interactions
  const handleAirEntryDimensionsUpdate = (index: number, newDimensions: { width?: number; height?: number; distanceToFloor?: number }) => {
    // Update the store immediately to maintain visual consistency for Width changes
    const updatedAirEntries = [...airEntries];
    if (updatedAirEntries[index]) {
      updatedAirEntries[index] = {
        ...updatedAirEntries[index],
        dimensions: {
          ...updatedAirEntries[index].dimensions,
          ...newDimensions
        }
      };
      
      onAirEntriesUpdate?.(updatedAirEntries);
      
      // Also update the editing state for immediate visual feedback
      setEditingAirEntries(prev => prev.map(item => 
        item.index === index ? {
          ...item,
          entry: {
            ...item.entry,
            dimensions: {
              ...item.entry.dimensions,
              ...newDimensions
            }
          }
        } : item
      ));
    }
  };

  const handleAirEntryEdit = (
    index: number,
    data: {
      width: number;
      height: number;
      distanceToFloor?: number;
      shape?: 'rectangular' | 'circular';
      wallPosition?: number;
      position?: { x: number; y: number };
      properties?: {
        state?: 'open' | 'closed';
        temperature?: number;
        flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
        flowValue?: number;
        flowIntensity?: 'low' | 'medium' | 'high';
        airOrientation?: 'inflow' | 'outflow';
      };
    },
  ) => {
    console.log("🟢 [CANVAS2D EDIT] handleAirEntryEdit called with index:", index);
    console.log("🟢 [CANVAS2D EDIT] Received data:", data);
    console.log("🟢 [CANVAS2D EDIT] data.wallPosition:", data.wallPosition);
    
    const updatedAirEntries = [...airEntries];
    
    // CRITICAL: Never use data.position from dialog - it may contain stale data
    // Keep the current store position that was updated in real-time
    const currentStorePosition = updatedAirEntries[index]?.position;
    const originalEntry = updatedAirEntries[index];
    console.log("🟢 [CANVAS2D EDIT] Original entry:", originalEntry);
    console.log("🟢 [CANVAS2D EDIT] Original wallPosition:", originalEntry?.dimensions?.wallPosition);
    console.log("🟢 [CANVAS2D EDIT] Current store position:", currentStorePosition);
    
    updatedAirEntries[index] = {
      ...updatedAirEntries[index],
      position: currentStorePosition, // Explicitly preserve current store position
      dimensions: {
        width: data.width,
        height: data.height,
        distanceToFloor: data.distanceToFloor,
        ...(data.shape && { shape: data.shape }),
        ...(data.wallPosition !== undefined && { wallPosition: data.wallPosition }),
      },
      ...(data.properties && { properties: data.properties }),
    };
    
    console.log("🟢 [CANVAS2D EDIT] Final updated entry:", updatedAirEntries[index]);
    console.log("🟢 [CANVAS2D EDIT] Final wallPosition:", updatedAirEntries[index].dimensions?.wallPosition);
    console.log("🟢 [CANVAS2D EDIT] Final properties ref:", updatedAirEntries[index].properties);

    
    onAirEntriesUpdate?.(updatedAirEntries);
    setEditingAirEntries(prev => prev.filter(entry => entry.index !== index));

  };

  // Phase 2: Dialog Management Functions
  const openAirEntryDialog = (airEntry: { index: number; entry: AirEntry }) => {

    
    const isAlreadyOpen = editingAirEntries.some(entry => entry.index === airEntry.index);

    
    if (!isAlreadyOpen) {
      // Phase 3: Calculate position for new dialog
      const dialogPosition = calculateDialogPosition(editingAirEntries.length);

      setEditingAirEntries(prev => [...prev, { ...airEntry, position: dialogPosition }]);
    }
  };

  // Phase 3: Dialog Positioning System
  const calculateDialogPosition = (dialogCount: number) => {
    const dialogWidth = 425;
    const dialogHeight = 600;
    const rightOffset = 20;
    const topOffset = 40;
    const cascadeOffset = 30;

    // Start from top-right and cascade down/left
    const baseX = typeof window !== 'undefined' ? (window.innerWidth - dialogWidth - rightOffset) : 0;
    const baseY = topOffset;

    const cascadeX = baseX - (cascadeOffset * dialogCount);
    const cascadeY = baseY + (cascadeOffset * dialogCount);

    // Bounds checking to keep dialogs within viewport
    const maxX = typeof window !== 'undefined' ? (window.innerWidth - dialogWidth - 10) : cascadeX;
    const maxY = typeof window !== 'undefined' ? (window.innerHeight - dialogHeight - 10) : cascadeY;

    return {
      x: Math.max(10, Math.min(cascadeX, maxX)),
      y: Math.max(10, Math.min(cascadeY, maxY))
    };
  };

  const closeAirEntryDialog = (airEntryIndex: number) => {
    setEditingAirEntries(prev => prev.filter(entry => entry.index !== airEntryIndex));
  };

  // Phase 5: Visual feedback for multiple dialogs
  const getActiveDialogsInfo = () => {
    return `${editingAirEntries.length} dialog${editingAirEntries.length !== 1 ? 's' : ''} open`;
  };

  const isDialogOpen = (airEntryIndex: number): boolean => {
    return editingAirEntries.some(entry => entry.index === airEntryIndex);
  };

  // Handle dialog X button close with eraser behavior
  const handleDialogXClose = (airEntryIndex: number) => {
    eraseAirEntryAtIndex(airEntryIndex);
    closeAirEntryDialog(airEntryIndex);
  };



  const handleContextMenu = (e: Event) => {
    console.log("Context menu prevented");
    e.preventDefault();
  };

  const [currentToolState, setCurrentToolState] = useState<
    "wall" | "eraser" | "measure" | null
  >(null);
  const setCurrentTool = (tool: "wall" | "eraser" | "measure" | null) => {
    setCurrentToolState(tool);
  };

  const getCursor = (): string => {
    // Add this condition near the beginning of the function
    if (currentTool === "wall" && isDrawing && snapSource === "endpoint") {
      return 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>\') 12 12, auto';
    }

    // 1. Check for panning mode (either button-activated or right-click)
    if (panMode || isPanning) return "move";

    // 2. Check for specific tools and return custom SVG cursors matching Lucide icons
    if (currentTool === "eraser") {
      // Eraser icon matching the LucideEraser component
      return 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="%23000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L15 19"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>\') 5 15, auto';
    }

    if (currentTool === "measure") {
      // Ruler icon matching the Lucide Ruler component
      return 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="%23000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>\') 5 15, auto';
    }

    if (currentTool === "stairs") {
      // Stairs icon cursor for stairs tool
      return 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="%237c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18"/><path d="M3 18a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/><path d="M5 16v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/><path d="M9 12V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v10"/></svg>\') 0 18, auto';
    }

    // 3. Check for Air Entry element placement modes
    if (currentAirEntry === "window") {
      // Blue rectangle cursor for window placement
      return 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>\') 8 8, crosshair';
    }

    if (currentAirEntry === "door") {
      // Brown rectangle cursor for door placement
      return 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%23b45309" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>\') 8 8, crosshair';
    }

    if (currentAirEntry === "vent") {
      // Green rectangle cursor for vent placement
      return 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%2322c55e" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>\') 8 8, crosshair';
    }

    // 4. Default cursor when no special mode is active
    return "default";
  };

  return (
    <div className="relative w-full h-full bg-background">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className={`w-full h-full`}
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleReactMouseMove}
        onMouseUp={handleReactMouseUp}
        onDoubleClick={handleDoubleClickNew}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-white/80 p-2 rounded-lg shadow-sm">
        {isMultifloor && (
          <Input
            value={floorText}
            readOnly
            className="w-32 h-8 text-center text-sm bg-muted cursor-default"
          />
        )}
        <div className="w-px h-6 bg-border mx-2" />
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <div className="flex items-center">
          <Input
            type="number"
            value={zoomInput}
            onChange={handleZoomInputChange}
            onBlur={handleZoomInputBlur}
            onKeyDown={handleZoomInputKeyDown}
            className="w-16 h-8 text-center text-sm"
            min={MIN_ZOOM * 100}
            max={MAX_ZOOM * 100}
          />
          <span className="text-sm font-medium ml-1">%</span>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomIn}
          disabled={zoom >= MAX_ZOOM}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-2" />
        <Button
          variant={panMode ? "default" : "outline"}
          size="icon"
          onClick={togglePanMode}
        >
          <Move className="h-4 w-4" />
        </Button>
        {editingAirEntries.length > 0 && (
          <div className="ml-4 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded border">
            {getActiveDialogsInfo()}
          </div>
        )}
      </div>
      {editingAirEntries.map((editingAirEntry, dialogIndex) => (
        <AirEntryDialog
          key={`dialog-${editingAirEntry.index}`}
          type={editingAirEntry.entry.type}
          isOpen={true}
          dialogPosition={editingAirEntry.position}
          isCreating={editingAirEntry.isCreating}
          onClose={() => closeAirEntryDialog(editingAirEntry.index)} // Save Changes: Keep element, close dialog
          onCancel={() => {
            // X Button: Delete element using eraser logic, close dialog
            // This gives users the feeling that "canceling" removes the element they just placed
            handleDialogXClose(editingAirEntry.index);
          }}
          onConfirm={(data) => {
            // Save Changes: Update element properties and close dialog
            handleAirEntryEdit(editingAirEntry.index, data as any);
          }}
          onPropertiesUpdate={onPropertiesUpdate ? (properties) => {
            // Real-time properties synchronization
            onPropertiesUpdate(currentFloor, editingAirEntry.index, properties);
          } : undefined}
          initialValues={{
            ...editingAirEntry.entry.dimensions,
            shape: (editingAirEntry.entry.dimensions as any).shape,
            properties: (editingAirEntry.entry as any).properties,
            position: editingAirEntry.entry.position,
            wallPosition: (editingAirEntry.entry.dimensions as any).wallPosition || (editingAirEntry.entry as any).properties?.wallPosition
          } as any}
          airEntryIndex={editingAirEntry.index}
          currentFloor={currentFloor}
          isEditing={true}
          wallContext={{
            wallId: (() => {
              const lineId = editingAirEntry.entry.line.id?.toString() || lineToUniqueId(editingAirEntry.entry.line);
              const associatedWall = walls?.find(wall => 
                wall.lineRef === lineId || 
                wall.lineRef === lineToUniqueId(editingAirEntry.entry.line) ||
                (wall.startPoint.x === editingAirEntry.entry.line.start.x && 
                 wall.startPoint.y === editingAirEntry.entry.line.start.y &&
                 wall.endPoint.x === editingAirEntry.entry.line.end.x && 
                 wall.endPoint.y === editingAirEntry.entry.line.end.y)
              );
              return associatedWall?.id || `${floorText}_wall_unknown`;
            })(),
            floorName: floorText,
            wallStart: { x: editingAirEntry.entry.line.start.x, y: editingAirEntry.entry.line.start.y },
            wallEnd: { x: editingAirEntry.entry.line.end.x, y: editingAirEntry.entry.line.end.y },
            clickPosition: { x: editingAirEntry.entry.position.x, y: editingAirEntry.entry.position.y },
            ceilingHeight: ceilingHeight * 100 // Convert to cm
          }}
          onPositionUpdate={(newPosition) => {
            // Use the simplified real-time position update mechanism
            handleAirEntryPositionUpdate(editingAirEntry.index, newPosition);
          }}
          onDimensionsUpdate={(newDimensions) => {
            // Use the local handler for immediate visual updates in Canvas2D
            handleAirEntryDimensionsUpdate(editingAirEntry.index, newDimensions);
            
            // Also propagate to parent for store synchronization
            if (onDimensionsUpdate) {
              onDimensionsUpdate(currentFloor, editingAirEntry.index, newDimensions);
            }
          }}
        />
      ))}

      {editingPoint && (
        <CoordinateEditorDialog
          isOpen={!!editingPoint}
          onClose={() => setEditingPoint(null)}
          onConfirm={handleCoordinateEdit}
          initialCoordinates={editingPoint.point}
          relativeCoordinates={getJSONCoordinates(editingPoint.point)}
          isStairPoint={!!editingPoint.isStairPoint}
        />
      )}

      {/* Wall Properties Dialog usando el diálogo unificado */}
      {editingWall && (
        <AirEntryDialog
          type="wall"
          isOpen={wallPropertiesDialogOpen}
          onClose={() => {
            setWallPropertiesDialogOpen(false);
            setEditingWall(null);
          }}
          onConfirm={(temperature) => handleWallPropertiesSave(editingWall.id, temperature)}
          isEditing={true}
          initialValues={{ temperature: editingWall.properties.temperature }}
        />
      )}

      {/* Stair Properties Dialog */}
      {editingStair && (
        <StairPropertiesDialog
          isOpen={stairPropertiesDialogOpen}
          onClose={() => {
            setStairPropertiesDialogOpen(false);
            setEditingStair(null);
          }}
          stair={editingStair}
          onSave={handleStairPropertiesSave}
        />
      )}
    </div>
  );
}
