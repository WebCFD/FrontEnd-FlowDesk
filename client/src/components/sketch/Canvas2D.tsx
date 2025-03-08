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
  const snapSize = 4; // 4 pixels = 5cm

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
  onLinesUpdate
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

  // Replace handleMouseMove with improved version
  const handleMouseMove = (e: MouseEvent) => {
    if (isDraggingEndpoint) {
      const point = getCanvasPoint(e);

      // Snap to grid or nearest endpoint
      const nearestPoint = findNearestEndpoint(point);
      const targetPoint = nearestPoint || snapToGrid(point);

      // Store lineIDs instead of line references for reliable tracking
      if (draggedPoint.lines.length > 0) {
        // Create a new array of lines with the updated positions
        const newLines = [...lines];
        let linesUpdated = false;

        draggedPoint.lines.forEach((line, index) => {
          // Find the line by comparing coordinates
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
          // Update the lines state
          onLinesUpdate?.(newLines);

          // Update draggedPoint with the new line references and point position
          // This is the key step: we need to update our references to point to the new lines
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
      }
      return;
    }

    // Your original mouse move handling
    throttleMouseMove(e);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
        ctx.strokeStyle = '#000000';
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
      const endpointsByColor = {
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

        endpointsByColor[color].push(point);
      });

      // Draw points by color groups
      Object.entries(endpointsByColor).forEach(([color, points]) => {
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
      // Standard pan handling (unchanged)
      if (panMode || e.button === 2) {
        // Only handle pan if we're not clicking on an endpoint with right click
        const clickPoint = getCanvasPoint(e);
        const pointInfo = findPointAtLocation(clickPoint);

        if (e.button === 2 && pointInfo) {
          e.preventDefault();
          setIsDraggingEndpoint(true);
          setDraggedPoint(pointInfo);
          return;
        }

        e.preventDefault();
        handlePanStart(e);
        return;
      }

      // Rest of your existing handleMouseDown code
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
      if (isDraggingEndpoint) {
        const point = getCanvasPoint(e);

        // Snap to grid or nearest endpoint
        const nearestPoint = findNearestEndpoint(point);
        const targetPoint = nearestPoint || snapToGrid(point);

        // Store lineIDs instead of line references for reliable tracking
        if (draggedPoint.lines.length > 0) {
          // Create a new array of lines with the updated positions
          const newLines = [...lines];
          let linesUpdated = false;

          draggedPoint.lines.forEach((line, index) => {
            // Find the line by comparing coordinates
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
            // Update the lines state
            onLinesUpdate?.(newLines);

            // Update draggedPoint with the new line references and point position
            // This is the key step: we need to update our references to point to the new lines
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
        }
        return;
      }

      // Your original mouse move handling
      throttleMouseMove(e);
    };

    const handleMouseUp = () => {
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

    // Update handleMouseLeave to handle endpoint dragging
    const handleMouseLeave = () => {
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

    // Add the event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove, { passive: true });
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleZoomWheel, { passive: false });
    canvas.addEventListener('wheel', handleRegularWheel, { passive: true });

    // Store the preventDefault reference
    const handleContextMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', handleContextMenu);

    // Add lastRenderTime at component level
    let lastRenderTime = 0;

    // Animation loop with performance optimization
    let lastFrameTime = 0;
    const targetFPS = 30; // Limit to 30 FPS to reduce CPU usage
    const frameInterval = 1000 / targetFPS;

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
          isDraggingEndpoint;

        if (shouldRender || !lastRenderTime || currentTime - lastRenderTime > 500) {
          draw();
          lastRenderTime = currentTime;
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    let animationFrameId = requestAnimationFrame(animate);


    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleZoomWheel);
      canvas.removeEventListener('wheel', handleRegularWheel);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gridSize, dimensions, lines, currentLine, isDrawing, currentTool, highlightedLines, zoom, pan, isPanning, panMode, cursorPoint, currentAirEntry, onLineSelect, airEntries, onLinesUpdate, hoveredGridPoint, hoverPoint, isDraggingEndpoint, draggedPoint]);

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