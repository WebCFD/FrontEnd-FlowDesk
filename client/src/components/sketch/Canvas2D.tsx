import { useEffect, useRef, useState, useMemo } from 'react';
import { Minus, Plus, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

let isProcessingMouseMove = false;
let lastMouseMoveEvent: MouseEvent | null = null;

interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

interface AirEntry {
  type: 'window' | 'door' | 'vent';
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
}

interface Canvas2DProps {
  gridSize: number;
  currentTool: 'wall' | 'eraser' | null;
  currentAirEntry: 'vent' | 'door' | 'window' | null;
  onLineSelect?: (line: Line, clickPoint: Point) => void;
  airEntries: AirEntry[];
  lines: Line[];
  onLinesUpdate?: (lines: Line[]) => void;
  onAirEntriesUpdate?: (airEntries: AirEntry[]) => void;
}

const POINT_RADIUS = 4;
const SNAP_DISTANCE = 15;
const PIXELS_TO_CM = 25 / 20;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const GRID_RANGE = 2000;
const GRID_POINT_RADIUS = 1;
const HOVER_DISTANCE = 10;

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
    y: dy / length
  };
};

const getPointOnLine = (line: Line, point: Point): Point => {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) return line.start;

  const t = ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / len2;
  const tt = Math.max(0, Math.min(1, t));

  return {
    x: line.start.x + tt * dx,
    y: line.start.y + tt * dy
  };
};


const getVisibleGridPoints = (dimensions: { width: number; height: number }, pan: Point, zoom: number): Point[] => {
  const points: Point[] = [];
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;
  const snapSize = 2; // 4 pixels = 5cm

  // Only calculate grid points in the visible area based on current pan and zoom
  const visibleStartX = -pan.x / zoom - snapSize;
  const visibleEndX = (-pan.x + dimensions.width) / zoom + snapSize;
  const visibleStartY = -pan.y / zoom - snapSize;
  const visibleEndY = (-pan.y + dimensions.height) / zoom + snapSize;

  // Calculate steps in grid coordinates
  const startXGrid = Math.floor(visibleStartX / snapSize) * snapSize;
  const endXGrid = Math.ceil(visibleEndX / snapSize) * snapSize;
  const startYGrid = Math.floor(visibleStartY / snapSize) * snapSize;
  const endYGrid = Math.ceil(visibleEndY / snapSize) * snapSize;

  // Limit the maximum number of grid points to avoid performance issues
  const maxPoints = 2000;
  const step = Math.max(snapSize, Math.ceil((endXGrid - startXGrid) * (endYGrid - startYGrid) / maxPoints / snapSize) * snapSize);

  for (let x = startXGrid; x <= endXGrid; x += step) {
    for (let y = startYGrid; y <= endYGrid; y += step) {
      const relativeX = Math.round(x / snapSize);
      const relativeY = Math.round(y / snapSize);

      if ((relativeX + relativeY) % 2 === 0) {
        points.push({
          x: centerX + x * zoom,
          y: centerY + y * zoom
        });
      }
    }
  }

  return points;
};

export default function Canvas2D({
  gridSize,
  currentTool,
  currentAirEntry,
  onLineSelect,
  airEntries = [],
  lines = [],
  onLinesUpdate,
  onAirEntriesUpdate
}: Canvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [currentLine, setCurrentLine] = useState<Line | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<Line[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null);
  const [panMode, setPanMode] = useState(false);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const [zoomInput, setZoomInput] = useState('100');
  const [hoveredGridPoint, setHoveredGridPoint] = useState<Point | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [isDraggingEndpoint, setIsDraggingEndpoint] = useState(false);
  const [draggedPoint, setDraggedPoint] = useState<{
    point: Point;
    lines: Line[];
    isStart: boolean[];
  }>({ point: { x: 0, y: 0 }, lines: [], isStart: [] });

  const [isDraggingAirEntry, setIsDraggingAirEntry] = useState(false);
  const [draggedAirEntry, setDraggedAirEntry] = useState<{
    index: number;
    entry: AirEntry;
    startPoint: Point;
  }>({ index: -1, entry: {} as AirEntry, startPoint: { x: 0, y: 0 } });


  const createCoordinateSystem = (): Line[] => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const arrowLength = 150;

    return [
      { start: { x: centerX - arrowLength, y: centerY }, end: { x: centerX + arrowLength, y: centerY } },
      { start: { x: centerX + arrowLength, y: centerY }, end: { x: centerX + arrowLength - 10, y: centerY - 5 } },
      { start: { x: centerX + arrowLength, y: centerY }, end: { x: centerX + arrowLength - 10, y: centerY + 5 } },
      { start: { x: centerX, y: centerY + arrowLength }, end: { x: centerX, y: centerY - arrowLength } },
      { start: { x: centerX, y: centerY - arrowLength }, end: { x: centerX - 5, y: centerY - arrowLength + 10 } },
      { start: { x: centerX, y: centerY - arrowLength }, end: { x: centerX + 5, y: centerY - arrowLength + 10 } },
    ];
  };

  const createGridLines = (): Line[] => {
    const gridLines: Line[] = [];
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    for (let x = -GRID_RANGE; x <= GRID_RANGE; x += gridSize) {
      gridLines.push({
        start: { x: centerX + x, y: centerY - GRID_RANGE },
        end: { x: centerX + x, y: centerY + GRID_RANGE }
      });
    }

    for (let y = -GRID_RANGE; y <= GRID_RANGE; y += gridSize) {
      gridLines.push({
        start: { x: centerX - GRID_RANGE, y: centerY + y },
        end: { x: centerX + GRID_RANGE, y: centerY + y }
      });
    }

    return gridLines;
  };

  const handleZoomChange = (newZoom: number) => {
    const oldZoom = zoom;
    const zoomDiff = newZoom - oldZoom;

    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    setPan(prev => ({
      x: prev.x - (centerX * zoomDiff),
      y: prev.y - (centerY * zoomDiff)
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

  const handleRegularWheel = (e: WheelEvent) => {
    // Handle regular scrolling - no need to prevent default
    // This will be a passive event listener
  };

  const handlePanStart = (e: MouseEvent) => {
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
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
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
      y: ((e.clientY - rect.top) * scaleY - pan.y) / zoom
    };
  };


  const getLineLength = (line: Line): number => {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const lengthInPixels = Math.sqrt(dx * dx + dy * dy);
    return pixelsToCm(lengthInPixels);
  };

  const snapToGrid = (point: Point): Point => {
    const snapSize = 4; // 4 pixels = 5cm
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    const relativeX = point.x - centerX;
    const relativeY = point.y - centerY;

    const snappedX = Math.round(relativeX / snapSize) * snapSize;
    const snappedY = Math.round(relativeY / snapSize) * snapSize;

    return {
      x: centerX + snappedX,
      y: centerY + snappedY
    };
  };

  const arePointsClose = (p1: Point, p2: Point): boolean => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) < SNAP_DISTANCE;
  };

  const findNearestEndpoint = (point: Point): Point | null => {
    let nearest: Point | null = null;
    let minDistance = SNAP_DISTANCE;

    lines.forEach(line => {
      [line.start, line.end].forEach(endpoint => {
        const dx = point.x - endpoint.x;
        const dy = point.y - endpoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = endpoint;
        }
      });
    });

    return nearest;
  };

  const findConnectedLines = (point: Point): Line[] => {
    return lines.filter(line =>
      arePointsClose(line.start, point) || arePointsClose(line.end, point)
    );
  };

  // Create a cache for closed contour results
  const closedContourCache = new Map<string, boolean>();
  const pointKey = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;

  // Add optimized isInClosedContour function
  const isInClosedContour = (point: Point, lines: Line[]): boolean => {
    // Cache results for points we've already checked
    if (!closedContourCache.has(pointKey(point))) {
      const result = checkClosedContour(point, lines);
      closedContourCache.set(pointKey(point), result);
      return result;
    }
    return closedContourCache.get(pointKey(point))!;
  };

  // Move the expensive calculation to a separate function
  const checkClosedContour = (point: Point, lines: Line[]): boolean => {
    const arePointsEqual = (p1: Point, p2: Point): boolean => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy) < 5;
    };

    const connectedLines = lines.filter(line =>
      arePointsEqual(line.start, point) || arePointsEqual(line.end, point)
    );

    for (const startLine of connectedLines) {
      const visited = new Set<string>();
      const stack: { point: Point; path: Line[] }[] = [{
        point: arePointsEqual(startLine.start, point) ? startLine.end : startLine.start,
        path: [startLine]
      }];

      while (stack.length > 0) {
        const { point: currentPoint, path } = stack.pop()!;
        const key = pointKey(currentPoint);

        if (path.length >= 2 && arePointsEqual(currentPoint, point)) {
          return true;
        }

        if (visited.has(key)) continue;
        visited.add(key);

        const nextLines = lines.filter(line =>
          !path.includes(line) &&
          (arePointsEqual(line.start, currentPoint) || arePointsEqual(line.end, currentPoint))
        );

        for (const nextLine of nextLines) {
          const nextPoint = arePointsEqual(nextLine.start, currentPoint) ? nextLine.end : nextLine.start;
          stack.push({
            point: nextPoint,
            path: [...path, nextLine]
          });
        }
      }
    }

    return false;
  };

  const findLinesNearPoint = (point: Point): Line[] => {
    const nearbyLines: Line[] = [];

    lines.forEach(line => {
      const A = point.x - line.start.x;
      const B = point.y - line.start.y;
      const C = line.end.x - line.start.x;
      const D = line.end.y - line.start.y;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      if (lenSq !== 0) param = dot / lenSq;

      let xx, yy;

      if (param < 0) {
        xx = line.start.x;
        yy = line.start.y;
      } else if (param > 1) {
        xx = line.end.x;
        yy = line.end.y;
      } else {
        xx = line.start.x + param * C;
        yy = line.start.y + param * D;
      }

      const dx = point.x - xx;
      const dy = point.y - yy;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < SNAP_DISTANCE) {
        nearbyLines.push(line);
      }
    });

    return nearbyLines;
  };

  const gridSizeToCm = (pixels: number): number => pixels * PIXELS_TO_CM;

  const getHighlightColor = () => {
    if (!currentAirEntry) return 'rgba(239, 68, 68, 0.5)';

    const colors = {
      window: 'rgba(59, 130, 246, 0.5)',
      door: 'rgba(180, 83, 9, 0.5)',
      vent: 'rgba(34, 197, 94, 0.5)'
    };

    return colors[currentAirEntry];
  };

  const getAirEntryColor = (type: 'window' | 'door' | 'vent'): string => {
    const colors = {
      window: '#3b82f6',
      door: '#b45309',
      vent: '#22c55e'
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
      y: Math.round(pixelsToCm(relativeY))
    };
  };

  const drawCoordinateLabel = (ctx: CanvasRenderingContext2D, point: Point, color: string) => {
    const coords = getRelativeCoordinates(point);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(`(${coords.x}, ${coords.y})`, point.x + 8, point.y - 8);
  };

  const drawAirEntry = (ctx: CanvasRenderingContext2D, entry: AirEntry) => {
    const normal = calculateNormal(entry.line);
    const color = getAirEntryColor(entry.type);

    const widthInPixels = cmToPixels(entry.dimensions.width);
    const halfWidth = widthInPixels / 2;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4 / zoom;

    ctx.beginPath();
    ctx.moveTo(
      entry.position.x - normal.x * halfWidth,
      entry.position.y - normal.y * halfWidth
    );
    ctx.lineTo(
      entry.position.x + normal.x * halfWidth,
      entry.position.y + normal.y * halfWidth
    );
    ctx.stroke();

    const perpX = -normal.y * 4 / zoom;
    const perpY = normal.x * 4 / zoom;

    ctx.beginPath();
    ctx.moveTo(
      entry.position.x - normal.x * halfWidth - perpX,
      entry.position.y - normal.y * halfWidth - perpY
    );
    ctx.lineTo(
      entry.position.x - normal.x * halfWidth + perpX,
      entry.position.y - normal.y * halfWidth + perpY
    );
    ctx.moveTo(
      entry.position.x + normal.x * halfWidth - perpX,
      entry.position.y + normal.y * halfWidth - perpY
    );
    ctx.lineTo(
      entry.position.x + normal.x * halfWidth + perpX,
      entry.position.y + normal.y * halfWidth + perpY
    );
    ctx.stroke();

    ctx.restore();
  };

  // Memoize grid points calculation
  const visibleGridPoints = useMemo(() =>
    getVisibleGridPoints(dimensions, pan, zoom),
    [dimensions, pan, zoom]
  );

  const findNearestGridPoint = (point: Point): Point | null => {
    let nearest: Point | null = null;
    let minDistance = HOVER_DISTANCE;

    visibleGridPoints.forEach(gridPoint => {
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

  // Add findPointAtLocation function after other utility functions
  const findPointAtLocation = (clickPoint: Point): {
    point: Point;
    lines: Line[];
    isStart: boolean[];
  } | null => {
    // Get all endpoints
    const endpoints = lines.flatMap(line => [
      { point: line.start, line, isStart: true },
      { point: line.end, line, isStart: false }
    ]);

    // Group by position (to handle overlapping endpoints)
    const groupedPoints: Record<string, { point: Point; lines: Line[]; isStart: boolean[] }> = {};

    endpoints.forEach(({ point, line, isStart }) => {
      const key = `${Math.round(point.x)},${Math.round(point.y)}`;
      if (!groupedPoints[key]) {
        groupedPoints[key] = { point, lines: [], isStart: [] };
      }
      groupedPoints[key].lines.push(line);
      groupedPoints[key].isStart.push(isStart);
    });

    // Find a point near the click location
    for (const key in groupedPoints) {
      const { point, lines, isStart } = groupedPoints[key];
      const dx = clickPoint.x - point.x;
      const dy = clickPoint.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < POINT_RADIUS / zoom * 1.5) {  // Making hit area slightly larger than visual radius
        return { point, lines, isStart };
      }
    }

    return null;
  };

  const processMouseMove = (e: MouseEvent) => {
    const point = getCanvasPoint(e);

    // Always update the hover point when the mouse moves
    setHoverPoint(point);

    // Only calculate nearest grid point when needed (not drawing or panning)
    if (!isDrawing && !isPanning) {
      const nearestGridPoint = findNearestGridPoint(point);
      setHoveredGridPoint(nearestGridPoint);
    }

    // Wall drawing logic
    if (currentTool === 'wall' && isDrawing && currentLine) {
      const nearestPoint = findNearestEndpoint(point);
      const endPoint = nearestPoint || snapToGrid(point);
      setCurrentLine(prev => prev ? { ...prev, end: endPoint } : null);
      setCursorPoint(endPoint);
    }
    // Highlighting logic
    else if (currentTool === 'eraser' || currentAirEntry) {
      setHighlightedLines(findLinesNearPoint(point));
    }
  };

  const throttleMouseMove = (e: MouseEvent) => {
    // Store the latest mouse event
    lastMouseMoveEvent = e;

    // If we're already processing, don't queue another one
    if (isProcessingMouseMove) return;

    isProcessingMouseMove = true;

    // Use requestAnimationFrame to sync with browser's rendering cycle
    requestAnimationFrame(() => {
      if (lastMouseMoveEvent) {
        processMouseMove(lastMouseMoveEvent);
      }
      isProcessingMouseMove = false;
      lastMouseMoveEvent = null;
    });
  };

  // Add a helper function for point comparison
  const arePointsEqual = (p1: Point, p2: Point): boolean => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) < 1; // Small threshold for floating point comparison
  };

  // Add this function for finer snapping during dragging
  const fineDragSnap = (point: Point): Point => {
    // Regular snap size is 4 pixels = 5cm
    // Let's use half that size for dragging: 2 pixels = 2.5cm
    const snapSize = 2; // Half the normal snap size
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    const relativeX = point.x - centerX;
    const relativeY = point.y - centerY;

    // Try to snap to nearby endpoints first (same as regular)
    const nearestPoint = findNearestEndpoint(point);
    if (nearestPoint) {
      return nearestPoint;
    }

    // If no endpoint nearby, snap to the finer grid
    const snappedX = Math.round(relativeX / snapSize) * snapSize;
    const snappedY = Math.round(relativeY / snapSize) * snapSize;

    return {
      x: centerX + snappedX,
      y: centerY + snappedY
    };
  };

  // Add helper functions after existing utility functions
  const findAirEntryAtLocation = (clickPoint: Point): { index: number; entry: AirEntry } | null => {
    // Add logging to debug hit detection
    console.log("Checking for AirEntry at point:", clickPoint);

    for (let i = 0; i < airEntries.length; i++) {
      const entry = airEntries[i];
      const normal = calculateNormal(entry.line);
      const widthInPixels = cmToPixels(entry.dimensions.width);
      const halfWidth = widthInPixels / 2;

      // Calculate the entry's endpoints
      const start = {
        x: entry.position.x - normal.x * halfWidth,
        y: entry.position.y - normal.y * halfWidth
      };

      const end = {
        x: entry.position.x + normal.x * halfWidth,
        y: entry.position.y + normal.y * halfWidth
      };

      // Check if click is near the entry's line segment
      const distanceToEntry = distanceToLineSegment(clickPoint, start, end);
      console.log("Distance to entry:", distanceToEntry, "Entry index:", i);

      // Increased hit area from 10 to 20
      if (distanceToEntry < 20 / zoom) {
        console.log("Found AirEntry at index:", i);
        return { index: i, entry };
      }
    }

    console.log("No AirEntry found at point");
    return null;
  };

  // Add distance to line segment helper function
  const distanceToLineSegment = (point: Point, lineStart: Point, lineEnd: Point): number => {
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

  // Update calculatePositionAlongWall function
  const calculatePositionAlongWall = (line: Line, point: Point): Point => {
    try {
      // Project the point onto the line
      const projectedPoint = getPointOnLine(line, point);
      console.log("Projected point:", projectedPoint);

      // Create a buffer near the ends of the wall to prevent the entry from going off the line
      const dx = line.end.x - line.start.x;
      const dy = line.end.y - line.start.y;
      const lineLength = Math.sqrt(dx * dx + dy * dy);
      console.log("Line length:", lineLength);

      // Calculate unit vector along the line
      const ux = dx / lineLength;
      const uy = dy / lineLength;

      // Calculate the position along the line as a scalar
      const ax = projectedPoint.x - line.start.x;
      const ay = projectedPoint.y - line.start.y;
      const position = (ax * ux + ay * uy);
      console.log("Position along line:", position);

      // Enforce bounds (keep a small margin from the ends)
      const margin = 10; // Minimum 10px from each end
      const boundedPosition = Math.max(margin, Math.min(lineLength - margin, position));

      // Convert back to x,y coordinates
      const newPosition = {
        x: line.start.x + boundedPosition * ux,
        y: line.start.y + boundedPosition * uy
      };
      console.log("New calculated position:", newPosition);
      return newPosition;
    } catch (error) {
      console.error("Error calculating position:", error);
      return point; // Return original point on error
    }
  };

  // Add these utility functions after existing ones
  const updateAirEntriesWithWalls = (newLines: Line[], oldLines: Line[]) => {
    if (airEntries.length === 0) return;

    // Create a map to track which new line corresponds to which old line
    const lineMapping = new Map<string, Line>();

    // For each old line, find its corresponding new line
    oldLines.forEach(oldLine => {
      // Get old line's unique identifier
      const oldLineKey = getLineIdentifier(oldLine);

      // Find the matching new line by comparing endpoints
      const matchingNewLine = newLines.find(newLine => {
        // Check if this new line is a modified version of the old line
        return (arePointsNearlyEqual(oldLine.start, newLine.start) || arePointsNearlyEqual(oldLine.start, newLine.end)) &&
               (arePointsNearlyEqual(oldLine.end, newLine.start) || arePointsNearlyEqual(oldLine.end, newLine.end));
      });

      if (matchingNewLine) {
        lineMapping.set(oldLineKey, matchingNewLine);
      }
    });

    // Now update air entries based on this mapping
    const newAirEntries = [...airEntries];
    let entriesUpdated = false;

    newAirEntries.forEach((entry, index) => {
      // Get the identifier for this entry's line
      const entryLineKey = getLineIdentifier(entry.line);

      // Find the updated line this entry should be attached to
      const updatedLine = lineMapping.get(entryLineKey);

      if (updatedLine) {
        // Calculate relative position on original line
        const relativePos = getRelativePositionOnLine(entry.position, entry.line);

        // Apply the same relative position to the updated line
        const newPosition = getPointAtRelativePosition(updatedLine, relativePos);

        // Update the entry with new line and position
        newAirEntries[index] = {
          ...entry,
          line: updatedLine,
          position: newPosition
        };

        entriesUpdated = true;
      }
    });    // Update state if needed
    if (entriesUpdated && onAirEntriesUpdate) {
      onAirEntriesUpdate(newAirEntries);
    }
  };

  // Helper function to create a unique identifier for a line
  const getLineIdentifier = (line: Line): string => {
    // Sort coordinates to ensure consistent identification regardless of line direction
    const [x1, y1, x2, y2] = [
      Math.round(line.start.x),
      Math.round(line.start.y),
      Math.round(line.end.x),
      Math.round(line.end.y)
    ].sort();

    return `${x1},${y1}_${x2},${y2}`;
  };

  const handleMouseMove = (e: MouseEvent) => {
    // Handle AirEntry dragging first
    if (isDraggingAirEntry && draggedAirEntry.index !== -1) {
      const point = getCanvasPoint(e);
      console.log("Mouse move with drag state:", isDraggingAirEntry, draggedAirEntry.index);
      const entry = draggedAirEntry.entry;

      // Calculate new position along the wall
      const newPosition = calculatePositionAlongWall(entry.line, point);
      console.log("New position calculated:", newPosition);

      // Create a new array of air entries with the updated position
      const newAirEntries = [...airEntries];
      newAirEntries[draggedAirEntry.index] = {
        ...entry,
        position: newPosition
      };

      // Update air entries through the callback
      if (onAirEntriesUpdate) {
        console.log("Updating air entries with:", newAirEntries);
        onAirEntriesUpdate(newAirEntries);
      } else {
        console.log("onAirEntriesUpdate callback is missing");
      }
      return;
    }

    // Handle endpoint dragging
    if (isDraggingEndpoint) {
      const point = getCanvasPoint(e);
      const targetPoint = fineDragSnap(point);

      if (draggedPoint.lines.length > 0) {
        const oldLines = [...lines];
        const newLines = [...lines];
        let linesUpdated = false;

        draggedPoint.lines.forEach((line, index) => {
          const lineIndex = newLines.findIndex(l =>
            arePointsEqual(l.start, line.start) && arePointsEqual(l.end, line.end)
          );

          if (lineIndex >= 0) {
            if (draggedPoint.isStart[index]) {
              newLines[lineIndex] = {
                ...newLines[lineIndex],
                start: targetPoint
              };
            } else {
              newLines[lineIndex] = {
                ...newLines[lineIndex],
                end: targetPoint
              };
            }
            linesUpdated = true;
          }
        });

        if (linesUpdated) {
          // Update the lines state first
          onLinesUpdate?.(newLines);

          // Then update any air entries attached to these lines
          updateAirEntriesWithWalls(newLines, oldLines);

          // Update draggedPoint with new line references
          const updatedLines: Line[] = [];
          const updatedIsStart: boolean[] = [];

          draggedPoint.lines.forEach((line, index) => {
            const isStart = draggedPoint.isStart[index];
            const newLine = newLines.find(l =>
              (isStart && arePointsEqual(l.start, targetPoint) && arePointsEqual(l.end, line.end)) ||
              (!isStart && arePointsEqual(l.start, line.start) && arePointsEqual(l.end, targetPoint))
            );

            if (newLine) {
              updatedLines.push(newLine);
              updatedIsStart.push(isStart);
            }
          });

          setDraggedPoint({
            point: targetPoint,
            lines: updatedLines,
            isStart: updatedIsStart
          });
        }
        return;
      }
    }

    // Regular mouse move handling
    throttleMouseMove(e);
  };

  // Update handleMouseDown function to handle right-click on AirEntry elements
  const handleMouseDown = (e: MouseEvent) => {
    // Handle right-click
    if (e.button === 2) {
      console.log("Right click detected");
      e.preventDefault(); // Prevent context menu immediately

      const clickPoint = getCanvasPoint(e);
      console.log("Click point:", clickPoint);

      // First, check for AirEntry elements
      const airEntryInfo = findAirEntryAtLocation(clickPoint);
      console.log("Air entry found:", airEntryInfo);

      if (airEntryInfo) {
        setIsDraggingAirEntry(true);
        setDraggedAirEntry({
          index: airEntryInfo.index,
          entry: airEntryInfo.entry,
          startPoint: clickPoint
        });
        return;
      }

      // Then check for endpoints
      const pointInfo = findPointAtLocation(clickPoint);
      if (pointInfo) {
        setIsDraggingEndpoint(true);
        setDraggedPoint(pointInfo);
        return;
      }

      // Default to panning
      handlePanStart(e);
      return;
    }

    // Rest of your existing handleMouseDown code...
    const clickPoint = getCanvasPoint(e);

    if (currentTool === 'wall') {
      const nearestPoint = findNearestEndpoint(clickPoint);
      const startPoint = nearestPoint || snapToGrid(clickPoint);
      setCurrentLine({ start: startPoint, end: startPoint });
      setIsDrawing(true);
      setCursorPoint(startPoint);
    } else if (currentTool === 'eraser') {
      const linesToErase = findLinesNearPoint(clickPoint);
      if (linesToErase.length > 0) {
        const newLines = lines.filter(line => !linesToErase.includes(line));
        onLinesUpdate?.(newLines);
        setHighlightedLines([]);
      }
    } else if (currentAirEntry && onLineSelect) {
      const selectedLines = findLinesNearPoint(clickPoint);
      if (selectedLines.length > 0) {
        const exactPoint = getPointOnLine(selectedLines[0], clickPoint);
        onLineSelect(selectedLines[0], exactPoint);
      }
    }
  };

  // Update handleMouseUp to end AirEntry dragging
  const handleMouseUp = (e: MouseEvent) => {
    if (isDraggingAirEntry) {
      setIsDraggingAirEntry(false);
      setDraggedAirEntry({ index: -1, entry: {} as AirEntry, startPoint: { x: 0, y: 0 } });
      return;
    }

    if (isDraggingEndpoint) {
      setIsDraggingEndpoint(false);
      setDraggedPoint({ point: { x: 0, y: 0 }, lines: [], isStart: [] });
      return;
    }

    if (panMode) {
      handlePanEnd();
      return;
    }

    if (currentTool === 'wall' && isDrawing && currentLine) {
      if (currentLine.start.x !== currentLine.end.x || currentLine.start.y !== currentLine.end.y) {
        const newLines = [...lines, currentLine];
        onLinesUpdate?.(newLines);
      }
      setCurrentLine(null);
      setIsDrawing(false);
      setCursorPoint(null);
    }
  };

  // Update handleMouseLeave to handle AirEntry dragging
  const handleMouseLeave = () => {
    if (isDraggingAirEntry) {
      setIsDraggingAirEntry(false);
      setDraggedAirEntry({ index: -1, entry: {} as AirEntry, startPoint: { x: 0, y: 0 } });
    }

    if (isDraggingEndpoint) {
      setIsDraggingEndpoint(false);
      setDraggedPoint({ point: { x: 0, y: 0 }, lines: [], isStart: [] });
    }

    handlePanEnd();
    setHighlightedLines([]);
    setHoveredGridPoint(null);
    setHoverPoint(null);

    if (isDrawing) {
      setCurrentLine(null);
      setIsDrawing(false);
      setCursorPoint(null);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Add crosshair drawing helper
    const drawCrosshair = (ctx: CanvasRenderingContext2D, point: Point) => {
      const size = 10 / zoom;

      ctx.beginPath();
      ctx.strokeStyle = '#718096';
      ctx.lineWidth = 1 / zoom;

      // Horizontal line
      ctx.moveTo(point.x - size, point.y);
      ctx.lineTo(point.x + size, point.y);

      // Vertical line
      ctx.moveTo(point.x, point.y - size);
      ctx.lineTo(point.x, point.y + size);

      ctx.stroke();
    };

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // Only draw grid lines that are visible on screen
      const visibleStartX = -pan.x / zoom;
      const visibleEndX = (-pan.x + dimensions.width) / zoom;
      const visibleStartY = -pan.y / zoom;
      const visibleEndY = (-pan.y + dimensions.height) / zoom;

      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;

      // Draw grid lines with adaptive density based on zoom
      ctx.beginPath();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1 / zoom;

      // Calculate step size based on zoom level to prevent too many grid lines
      const zoomAdjustedGridSize = Math.max(gridSize, Math.ceil(5 / zoom) * 4);

      // Vertical grid lines
      const startXGrid = Math.floor((visibleStartX - centerX) / zoomAdjustedGridSize) * zoomAdjustedGridSize;
      const endXGrid = Math.ceil((visibleEndX - centerX) / zoomAdjustedGridSize) * zoomAdjustedGridSize;

      for (let x = startXGrid; x <= endXGrid; x += zoomAdjustedGridSize) {
        ctx.moveTo(centerX + x, visibleStartY);
        ctx.lineTo(centerX + x, visibleEndY);
      }

      // Horizontal grid lines
      const startYGrid = Math.floor((visibleStartY - centerY) / zoomAdjustedGridSize) * zoomAdjustedGridSize;
      const endYGrid = Math.ceil((visibleEndY - centerY) / zoomAdjustedGridSize) * zoomAdjustedGridSize;

      for (let y = startYGrid; y <= endYGrid; y += zoomAdjustedGridSize) {
        ctx.moveTo(visibleStartX, centerY + y);
        ctx.lineTo(visibleEndX, centerY + y);
      }

      ctx.stroke();

      // Draw coordinate system
      const coordSystem = createCoordinateSystem();
      coordSystem.forEach((line, index) => {
        ctx.beginPath();
        ctx.strokeStyle = index < 3 ? '#ef4444' : '#22c55e';
        ctx.lineWidth = 2 / zoom;
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
      });

      // Batch similar operations to reduce context switches

      // Draw walls/lines
      lines.forEach(line => {
        if (highlightedLines.includes(line)) {
          ctx.strokeStyle = getHighlightColor();
          ctx.lineWidth = 3 / zoom;
        } else {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2 / zoom;
        }
        ctx.beginPath();
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
      });

      // Draw line measurements in one batch
      ctx.font = `${12 / zoom}px sans-serif`;
      ctx.fillStyle = '#64748b';
      lines.forEach(line => {
        const midX = (line.start.x + line.end.x) / 2;
        const midY = (line.start.y + line.end.y) / 2;
        const length = Math.round(getLineLength(line));
        ctx.fillText(`${length} cm`, midX, midY - 5 / zoom);
      });

      // Draw current line if exists
      if (currentLine) {
        ctx.beginPath();
        ctx.strokeStyle = '#00000';
        ctx.lineWidth = 2 / zoom;
        ctx.moveTo(currentLine.start.x, currentLine.start.y);
        ctx.lineTo(currentLine.end.x, currentLine.end.y);
        ctx.stroke();

        const length = Math.round(getLineLength(currentLine));
        const midX = (currentLine.start.x + currentLine.end.x) / 2;
        const midY = (currentLine.start.y + currentLine.end.y) / 2;
        ctx.fillText(`${length} cm`, midX, midY - 5 / zoom);
      }

      // Draw air entries
      airEntries.forEach(entry => {
        drawAirEntry(ctx, entry);
      });

      // Draw endpoints with color coding
      const endpoints = [...new Set(lines.flatMap(line => [line.start, line.end]))];
      const endpointColorMap: Record<string, Point[]> = {
        '#fb923c': [], // orange
        '#3b82f6': [], // blue
        '#22c55e': []  // green
      };

      // Group endpoints by color to batch drawing operations
      endpoints.forEach(point => {
        const connections = findConnectedLines(point).length;
        let color = '#fb923c'; // Default orange

        if (connections > 1) {
          // Check this less frequently - only for corner points
          if (isInClosedContour(point, lines)) {
            color = '#22c55e'; // Green for closed contours
          } else {
            color = '#3b82f6'; // Blue for connections > 1
          }
        }

        // Ensure color exists in our map
        if (color in endpointColorMap) {
          endpointColorMap[color].push(point);
        }
      });

      // Draw points by color groups
      Object.entries(endpointColorMap).forEach(([color, points]) => {
        ctx.fillStyle = color;
        ctx.beginPath();

        points.forEach(point => {
          ctx.moveTo(point.x, point.y);
          ctx.arc(point.x, point.y, POINT_RADIUS / zoom, 0, 2 * Math.PI);
        });

        ctx.fill();

        // Draw coordinate labels
        ctx.font = `${12 / zoom}px sans-serif`;
        points.forEach(point => {
          drawCoordinateLabel(ctx, point, color);
        });
      });

      // Draw cursor point when drawing (unchanged - keeps orange coordinates)
      if (cursorPoint && isDrawing) {
        ctx.font = `${12 / zoom}px sans-serif`;
        drawCoordinateLabel(ctx, cursorPoint, '#fb923c');
      }

      // Draw hover point coordinates (only when not drawing)
      if (hoverPoint && !isDrawing && !isPanning) {
        ctx.font = `${12 / zoom}px sans-serif`;
        // Use a light gray that's visible but not distracting
        drawCoordinateLabel(ctx, hoverPoint, '#718096');
        drawCrosshair(ctx, hoverPoint);
      }

      ctx.restore();
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Handle right-click
      if (e.button === 2) {
        console.log("Right click detected");
        e.preventDefault(); // Prevent context menu immediately

        const clickPoint = getCanvasPoint(e);
        console.log("Click point:", clickPoint);

        // First, check for AirEntry elements
        const airEntryInfo = findAirEntryAtLocation(clickPoint);
        console.log("Air entry found:", airEntryInfo);

        if (airEntryInfo) {
          setIsDraggingAirEntry(true);
          setDraggedAirEntry({
            index: airEntryInfo.index,
            entry: airEntryInfo.entry,
            startPoint: clickPoint
          });
          return;
        }

        // Then check for endpoints
        const pointInfo = findPointAtLocation(clickPoint);
        if (pointInfo) {
          setIsDraggingEndpoint(true);
          setDraggedPoint(pointInfo);
          return;
        }

        // Default to panning
        handlePanStart(e);
        return;
      }

      // Rest of your existing handleMouseDown code...
      const clickPoint = getCanvasPoint(e);

      if (currentTool === 'wall') {
        const nearestPoint = findNearestEndpoint(clickPoint);
        const startPoint = nearestPoint || snapToGrid(clickPoint);
        setCurrentLine({ start: startPoint, end: startPoint });
        setIsDrawing(true);
        setCursorPoint(startPoint);
      } else if (currentTool === 'eraser') {
        const linesToErase = findLinesNearPoint(clickPoint);
        if (linesToErase.length > 0) {
          const newLines = lines.filter(line => !linesToErase.includes(line));
          onLinesUpdate?.(newLines);
          setHighlightedLines([]);
        }
      } else if (currentAirEntry && onLineSelect) {
        const selectedLines = findLinesNearPoint(clickPoint);
        if (selectedLines.length > 0) {
          const exactPoint = getPointOnLine(selectedLines[0], clickPoint);
          onLineSelect(selectedLines[0], exactPoint);
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Handle AirEntry dragging first
      if (isDraggingAirEntry && draggedAirEntry.index !== -1) {
        const point = getCanvasPoint(e);
        console.log("Mouse move with drag state:", isDraggingAirEntry, draggedAirEntry.index);
        const entry = draggedAirEntry.entry;

        // Calculate new position along the wall
        const newPosition = calculatePositionAlongWall(entry.line, point);
        console.log("New position calculated:", newPosition);

        // Create a new array of air entries with the updated position
        const newAirEntries = [...airEntries];
        newAirEntries[draggedAirEntry.index] = {
          ...entry,
          position: newPosition
        };

        // Update air entries through the callback
        if (onAirEntriesUpdate) {
          console.log("Updating air entries with:", newAirEntries);
          onAirEntriesUpdate(newAirEntries);
        } else {
          console.log("onAirEntriesUpdate callback is missing");
        }
        return;
      }

      // Handle endpoint dragging
      if (isDraggingEndpoint) {
        const point = getCanvasPoint(e);
        const targetPoint = fineDragSnap(point);

        if (draggedPoint.lines.length > 0) {
          const oldLines = [...lines];
          const newLines = [...lines];
          let linesUpdated = false;

          draggedPoint.lines.forEach((line, index) => {
            const lineIndex = newLines.findIndex(l =>
              arePointsEqual(l.start, line.start) && arePointsEqual(l.end, line.end)
            );

            if (lineIndex >= 0) {
              if (draggedPoint.isStart[index]) {
                newLines[lineIndex] = {
                  ...newLines[lineIndex],
                  start: targetPoint
                };
              } else {
                newLines[lineIndex] = {
                  ...newLines[lineIndex],
                  end: targetPoint
                };
              }
              linesUpdated = true;
            }
          });

          if (linesUpdated) {
            // Update the lines state first
            onLinesUpdate?.(newLines);

            // Then update any air entries attached to these lines
            updateAirEntriesWithWalls(newLines, oldLines);

            // Update draggedPoint with new line references
            const updatedLines: Line[] = [];
            const updatedIsStart: boolean[] = [];

            draggedPoint.lines.forEach((line, index) => {
              const isStart = draggedPoint.isStart[index];
              const newLine = newLines.find(l =>
                (isStart && arePointsEqual(l.start, targetPoint) && arePointsEqual(l.end, line.end)) ||
                (!isStart && arePointsEqual(l.start, line.start) && arePointsEqual(l.end, targetPoint))
              );

              if (newLine) {
                updatedLines.push(newLine);
                updatedIsStart.push(isStart);
              }
            });

            setDraggedPoint({
              point: targetPoint,
              lines: updatedLines,
              isStart: updatedIsStart
            });
          }
          return;
        }
      }

      // Regular mouse move handling
      throttleMouseMove(e);
    };

    const handleMouseUp = () => {
      if (isDraggingAirEntry) {
        setIsDraggingAirEntry(false);
        setDraggedAirEntry({ index: -1, entry: {} as AirEntry, startPoint: { x: 0, y: 0 } });
        return;
      }

      if (isDraggingEndpoint) {
        setIsDraggingEndpoint(false);
        setDraggedPoint({ point: { x: 0, y: 0 }, lines: [], isStart: [] });
        return;
      }

      if (panMode) {
        handlePanEnd();
        return;
      }

      if (currentTool === 'wall' && isDrawing && currentLine) {
        if (currentLine.start.x !== currentLine.end.x || currentLine.start.y !== currentLine.end.y) {
          const newLines = [...lines, currentLine];
          onLinesUpdate?.(newLines);
        }
        setCurrentLine(null);
        setIsDrawing(false);
        setCursorPoint(null);
      }
    };

    const handleMouseLeave = () => {
      if (isDraggingAirEntry) {
        setIsDraggingAirEntry(false);
        setDraggedAirEntry({ index: -1, entry: {} as AirEntry, startPoint: { x: 0, y: 0 } });
      }

      if (isDraggingEndpoint) {
        setIsDraggingEndpoint(false);
        setDraggedPoint({ point: { x: 0, y: 0 }, lines: [], isStart: [] });
      }

      handlePanEnd();
      setHighlightedLines([]);
      setHoveredGridPoint(null);
      setHoverPoint(null);

      if (isDrawing) {
        setCurrentLine(null);
        setIsDrawing(false);
        setCursorPoint(null);
      }
    };

    // Store the preventDefault reference
    const handleContextMenu = (e: Event) => {
      console.log("Context menu prevented");
      e.preventDefault();
    };

    // Add the event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleZoomWheel, { passive: false });
    canvas.addEventListener('wheel', handleRegularWheel, { passive: true });
    canvas.addEventListener('contextmenu', handleContextMenu);

    // Add lastRenderTime at component level
    let lastRenderTime = 0;

    // Animation loop with performance optimization
    let lastFrameTime = 0;
    const targetFPS = 30; // Limit to 30 FPS to reduce CPU usage
    const frameInterval = 1000 / targetFPS;
    let animationFrameId: number;

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastFrameTime;

      if (deltaTime > frameInterval) {
        lastFrameTime = currentTime - (deltaTime % frameInterval);

        // Skip rendering frames if there's no user interaction and nothing has changed
        const shouldRender =
          isPanning ||
          isDrawing ||
          highlightedLines.length > 0 ||
          hoveredGridPoint !== null ||
          hoverPoint !== null ||
          isDraggingEndpoint ||
          isDraggingAirEntry;

        if (shouldRender || !lastRenderTime || currentTime - lastRenderTime > 500) {
          draw();
          lastRenderTime = currentTime;
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    // Start the animation loop
    animationFrameId = requestAnimationFrame(animate);

    // Cleanup function
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleZoomWheel);
      canvas.removeEventListener('wheel', handleRegularWheel);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    gridSize, dimensions, lines, currentLine, isDrawing, currentTool,
    highlightedLines, zoom, pan, isPanning, panMode, cursorPoint,
    currentAirEntry, onLineSelect, airEntries, onLinesUpdate,
    hoveredGridPoint, hoverPoint, isDraggingEndpoint, draggedPoint,
    isDraggingAirEntry, draggedAirEntry, onAirEntriesUpdate
  ]);

  const handleZoomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
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
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className={`w-full h-full ${panMode ? 'cursor-move' : 'cursor-default'}`}
      />
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-white/80 p-2 rounded-lg shadow">
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
          className="h-8 w-8"
        >
          <Minus className="h-4 w-4" />
        </Button>
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
        <span className="text-sm font-medium -ml-6">%</span>
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomIn}
          disabled={zoom >= MAX_ZOOM}
          className="h-8 w-8"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-2" />
        <Button
          variant={panMode ? "destructive" : "outline"}
          size="icon"
          onClick={togglePanMode}
          className="h-8 w-8"
        >
          <Move className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Add these helper functions after existing utility functions

  // Helper to check if points are nearly equal (allowing for small floating-point differences)
  const arePointsNearlyEqual = (p1: Point, p2: Point): boolean => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) < 1;
  };

  // Get relative position (0-1) of a point along a line
  const getRelativePositionOnLine = (point: Point, line: Line): number => {
    // Project the point onto the line
    const projectedPoint = getPointOnLine(line, point);

    // Calculate distance from start to projected point
    const dx1 = projectedPoint.x - line.start.x;
    const dy1 = projectedPoint.y - line.start.y;
    const distanceFromStart = Math.sqrt(dx1 * dx1 + dy1 * dy1);

    // Calculate total line length
    const dx2 = line.end.x - line.start.x;
    const dy2 = line.end.y - line.start.y;
    const lineLength = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    // Return relative position (0 = start, 1 = end)
    return lineLength > 0 ? distanceFromStart / lineLength : 0;
  };

  // Get a point at a relative position (0-1) along a line
  const getPointAtRelativePosition = (line: Line, relativePos: number): Point => {
    return {
      x: line.start.x + (line.end.x - line.start.x) * relativePos,
      y: line.start.y + (line.end.y - line.start.y) * relativePos
    };
  };