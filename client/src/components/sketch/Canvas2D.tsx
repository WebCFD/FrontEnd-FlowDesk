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

const arePointsClose = (p1: Point, p2: Point): boolean => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) < SNAP_DISTANCE;
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

  const t = ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / len2;
  const tt = Math.max(0, Math.min(1, t));

  return {
    x: line.start.x + tt * dx,
    y: line.start.y + tt * dy
  };
};

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

const calculatePositionAlongWall = (line: Line, point: Point): Point => {
  try {
    console.log("Calculating position along wall:", {
      line: { start: line.start, end: line.end },
      point
    });

    const lineVector = {
      x: line.end.x - line.start.x,
      y: line.end.y - line.start.y
    };

    const lineLength = Math.sqrt(lineVector.x * lineVector.x + lineVector.y * lineVector.y);
    if (lineLength === 0) {
      console.warn("Zero length line detected");
      return line.start;
    }

    const unitVector = {
      x: lineVector.x / lineLength,
      y: lineVector.y / lineLength
    };

    const pointVector = {
      x: point.x - line.start.x,
      y: point.y - line.start.y
    };

    const dotProduct = pointVector.x * unitVector.x + pointVector.y * unitVector.y;

    const margin = 20; 
    const clampedDot = Math.max(margin, Math.min(lineLength - margin, dotProduct));

    const finalPosition = {
      x: line.start.x + unitVector.x * clampedDot,
      y: line.start.y + unitVector.y * clampedDot
    };

    console.log("Position calculation:", {
      lineLength,
      dotProduct,
      clampedDot,
      finalPosition
    });

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
    Math.round(line.end.y)
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
    y: line.start.y + (line.end.y - line.start.y) * t
  };
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
      y: centerY + snappedY
    };
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

  const findPointAtLocation = (clickPoint: Point): {
    point: Point;
    lines: Line[];
    isStart: boolean[];
  } | null => {
    const endpoints = lines.flatMap(line => [
      { point: line.start, line, isStart: true },
      { point: line.end, line, isStart: false }
    ]);

    const groupedPoints: Record<string, { point: Point; lines: Line[]; isStart: boolean[] }> = {};

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
      const distance = Math.sqrt(dx * dx + dy * dy);      if (distance < POINT_RADIUS / zoom * 1.5) {  
        return { point, lines, isStart };
      }
    }

    return null;
  };

  const processMouseMove = (e: MouseEvent) => {
    const point = getCanvasPoint(e);

    setHoverPoint(point);

    if (!isDrawing && !isPanning) {
      const nearestGridPoint = findNearestGridPoint(point);
      setHoveredGridPoint(nearestGridPoint);
    }

    if (currentTool === 'wall' && isDrawing && currentLine) {
      const nearestPoint = findNearestEndpoint(point);
      const endPoint = nearestPoint || snapToGrid(point);
      setCurrentLine(prev => prev ? { ...prev, end: endPoint } : null);
      setCursorPoint(endPoint);
    } else if (currentTool === 'eraser' || currentAirEntry) {
      setHighlightedLines(findLinesNearPoint(point));
    }
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

  const handleMouseMove = (e: MouseEvent) => {
    if (isDraggingAirEntry && draggedAirEntry.index !== -1) {
      const point = getCanvasPoint(e);
      console.log("Mouse move with drag state:", isDraggingAirEntry, draggedAirEntry.index);
      const entry = draggedAirEntry.entry;

      const newPosition = calculatePositionAlongWall(entry.line, point);
      console.log("New position calculated:", newPosition);

      const newAirEntries = [...airEntries];
      newAirEntries[draggedAirEntry.index] = {
        ...entry,
        position: newPosition
      };

      if (onAirEntriesUpdate) {
        console.log("Updating air entries with:", newAirEntries);
        onAirEntriesUpdate(newAirEntries);
      } else {
        console.log("onAirEntriesUpdate callback is missing");
      }
      return;
    }

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
          onLinesUpdate?.(newLines);
          updateAirEntriesWithWalls(newLines, oldLines);

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

    throttleMouseMove(e);
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 2) {
      console.log("Right click detected");
      e.preventDefault(); 

      const clickPoint = getCanvasPoint(e);
      console.log("Click point:", clickPoint);

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

      const pointInfo = findPointAtLocation(clickPoint);
      if (pointInfo) {
        setIsDraggingEndpoint(true);
        setDraggedPoint(pointInfo);
        return;
      }

      handlePanStart(e);
      return;
    }

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
      setCursorPoint(null);    }
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

  const findAirEntryAtLocation = (clickPoint: Point): { index: number; entry: AirEntry } | null => {
    console.log("Checking for AirEntry at point:", clickPoint);

    for (let i = 0; i < airEntries.length; i++) {
      const entry = airEntries[i];
      const normal = calculateNormal(entry.line);
      const widthInPixels = cmToPixels(entry.dimensions.width);
      const halfWidth = widthInPixels / 2;

      const start = {
        x: entry.position.x - normal.x * halfWidth,
        y: entry.position.y - normal.y * halfWidth
      };

      const end = {
        x: entry.position.x + normal.x * halfWidth,
        y: entry.position.y + normal.y * halfWidth
      };

      const distanceToEntry = distanceToLineSegment(clickPoint, start, end);
      console.log("Distance to entry:", distanceToEntry, "Entry index:", i);

      if (distanceToEntry < 20 / zoom) {
        console.log("Found AirEntry at index:", i);
        return { index: i, entry };
      }
    }

    console.log("No AirEntry found at point");
    return null;
  };

  const updateAirEntriesWithWalls = (newLines: Line[], oldLines: Line[]) => {
    console.log("Updating air entries with walls");

    if (airEntries.length === 0) return;

    const modifiedLineMap = new Map<number, Line>();

    oldLines.forEach((oldLine, oldIndex) => {
      const matchingNewLineIndex = newLines.findIndex(newLine =>
        (arePointsNearlyEqual(oldLine.start, newLine.start) && !arePointsNearlyEqual(oldLine.end, newLine.end)) ||
        (arePointsNearlyEqual(oldLine.end, newLine.end) && !arePointsNearlyEqual(oldLine.start, newLine.start)) ||
        (arePointsNearlyEqual(oldLine.start, newLine.end) && !arePointsNearlyEqual(oldLine.end, newLine.start)) ||
        (arePointsNearlyEqual(oldLine.end, newLine.start) && !arePointsNearlyEqual(oldLine.start, newLine.end)) ||
        (arePointsNearlyEqual(oldLine.start, newLine.start) && arePointsNearlyEqual(oldLine.end, newLine.end)) ||
        (arePointsNearlyEqual(oldLine.start, newLine.end) && arePointsNearlyEqual(oldLine.end, newLine.start))
      );

      if (matchingNewLineIndex !== -1) {
        modifiedLineMap.set(oldIndex, newLines[matchingNewLineIndex]);
      }
    });

    const newAirEntries = [...airEntries];
    let entriesUpdated = false;

    newAirEntries.forEach((entry, index) => {
      const entryLineKey = getLineIdentifier(entry.line);
      const updatedLine = modifiedLineMap.get(oldLines.findIndex(line => getLineIdentifier(line) === entryLineKey));

      if (updatedLine) {
        const relativePos = getRelativePositionOnLine(entry.position, entry.line);
        const newPosition = getPointAtRelativePosition(updatedLine, relativePos);

        newAirEntries[index] = {
          ...entry,
          line: updatedLine,
          position: newPosition
        };

        entriesUpdated = true;
      }
    });

    if (entriesUpdated && onAirEntriesUpdate) {
      console.log("Updating air entries state with:", newAirEntries);
      onAirEntriesUpdate(newAirEntries);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const drawCrosshair = (ctx: CanvasRenderingContext2D, point: Point) => {
      const size = 10 / zoom;

      ctx.beginPath();
      ctx.strokeStyle = '#718096';
      ctx.lineWidth = 1 / zoom;

      ctx.moveTo(point.x - size, point.y);
      ctx.lineTo(point.x + size, point.y);

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

      const visibleStartX = -pan.x / zoom;
      const visibleEndX = (-pan.x + dimensions.width) / zoom;
      const visibleStartY = -pan.y / zoom;
      const visibleEndY = (-pan.y + dimensions.height) / zoom;

      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;

      ctx.beginPath();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1 / zoom;

      const zoomAdjustedGridSize = Math.max(gridSize, Math.ceil(5 / zoom) * 4);

      const startXGrid = Math.floor((visibleStartX - centerX) / zoomAdjustedGridSize) * zoomAdjustedGridSize;
      const endXGrid = Math.ceil((visibleEndX - centerX) / zoomAdjustedGridSize) * zoomAdjustedGridSize;

      for (let x = startXGrid; x <= endXGrid; x += zoomAdjustedGridSize) {
        ctx.moveTo(centerX + x, visibleStartY);
        ctx.lineTo(centerX + x, visibleEndY);
      }

      const startYGrid = Math.floor((visibleStartY - centerY) / zoomAdjustedGridSize) * zoomAdjustedGridSize;
      const endYGrid = Math.ceil((visibleEndY - centerY) / zoomAdjustedGridSize) * zoomAdjustedGridSize;

      for (let y = startYGrid; y <= endYGrid; y += zoomAdjustedGridSize) {
        ctx.moveTo(visibleStartX, centerY + y);
        ctx.lineTo(visibleEndX, centerY + y);
      }

      ctx.stroke();

      const coordSystem = createCoordinateSystem();
      coordSystem.forEach((line, index) => {
        ctx.beginPath();
        ctx.strokeStyle = index < 3 ? '#ef4444' : '#22c55e';
        ctx.lineWidth = 2 / zoom;
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
      });


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

      ctx.font = `${12 / zoom}px sans-serif`;
      ctx.fillStyle = '#64748b';
      lines.forEach(line => {
        const midX = (line.start.x + line.end.x) / 2;
        const midY = (line.start.y + line.end.y) / 2;
        const length = Math.round(getLineLength(line));
        ctx.fillText(`${length} cm`, midX, midY - 5 / zoom);
      });

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

      airEntries.forEach(entry => {
        drawAirEntry(ctx, entry);
      });

      const endpoints = [...new Set(lines.flatMap(line => [line.start, line.end]))];
      const endpointColorMap: Record<string, Point[]> = {
        '#fb923c': [], 
        '#3b82f6': [], 
        '#22c55e': []  
      };

      endpoints.forEach(point => {
        const connections = findConnectedLines(point).length;
        let color = '#fb923c'; 

        if (connections > 1) {
          if (isInClosedContour(point, lines)) {
            color = '#22c55e'; 
          } else {
            color = '#3b82f6'; 
          }
        }

        if (color in endpointColorMap) {
          endpointColorMap[color].push(point);
        }
      });

      Object.entries(endpointColorMap).forEach(([color, points]) => {
        ctx.fillStyle = color;
        ctx.beginPath();

        points.forEach(point => {
          ctx.moveTo(point.x, point.y);
          ctx.arc(point.x, point.y, POINT_RADIUS / zoom, 0, 2 * Math.PI);
        });

        ctx.fill();

        ctx.font = `${12 / zoom}px sans-serif`;
        points.forEach(point => {
          drawCoordinateLabel(ctx, point, color);
        });
      });

      if (cursorPoint && isDrawing) {
        ctx.font = `${12 / zoom}px sans-serif`;
        drawCoordinateLabel(ctx, cursorPoint, '#fb923c');
      }

      if (hoverPoint && !isDrawing && !isPanning) {
        ctx.font = `${12 / zoom}px sans-serif`;
        drawCoordinateLabel(ctx, hoverPoint, '#718096');
        drawCrosshair(ctx, hoverPoint);
      }

      ctx.restore();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        console.log("Right click detected");
        e.preventDefault(); 

        const clickPoint = getCanvasPoint(e);
        console.log("Click point:", clickPoint);

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

        const pointInfo = findPointAtLocation(clickPoint);
        if (pointInfo) {
          setIsDraggingEndpoint(true);
          setDraggedPoint(pointInfo);
          return;
        }

        handlePanStart(e);
        return;
      }

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

    const handleContextMenu = (e: Event) => {
      console.log("Context menu prevented");
      e.preventDefault();
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleZoomWheel, { passive: false });
    canvas.addEventListener('wheel', handleRegularWheel, { passive: true });
    canvas.addEventListener('contextmenu', handleContextMenu);

    let lastRenderTime = 0;

    const targetFPS = 30; 
    const frameInterval = 1000 / targetFPS;
    let animationFrameId: number;

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastFrameTime;

      if (deltaTime > frameInterval) {
        lastFrameTime = currentTime - (deltaTime % frameInterval);

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

    let lastFrameTime = 0;
    animationFrameId = requestAnimationFrame(animate);

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

  const fineDragSnap = (point: Point): Point => {
    const snapSize = 2;
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    const relativeX = point.x - centerX;
    const relativeY = point.y - centerY;

    const nearestPoint = findNearestEndpoint(point);
    if (nearestPoint) {
      return nearestPoint;
    }

    const snappedX = Math.round(relativeX / snapSize) * snapSize;
    const snappedY = Math.round(relativeY / snapSize) * snapSize;

    return {
      x: centerX + snappedX,
      y: centerY + snappedY
    };
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