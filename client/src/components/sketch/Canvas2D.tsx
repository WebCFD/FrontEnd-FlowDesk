import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  onLinesUpdate?: (lines: Line[]) => void;
}

const POINT_RADIUS = 4;
const SNAP_DISTANCE = 15;
const PIXELS_TO_CM = 25 / 20; // 25cm = 20px ratio
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const GRID_RANGE = 2000;

const cmToPixels = (cm: number): number => {
  return cm / PIXELS_TO_CM;
};

const pixelsToCm = (pixels: number): number => {
  return pixels * PIXELS_TO_CM;
};

// Utility function to calculate the normal vector of a line
const calculateNormal = (line: Line): Point => {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  return {
    x: dx / length, // Changed to match wall direction
    y: dy / length
  };
};

const getPointOnLine = (line: Line, point: Point): Point => {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) return line.start;

  // Calculate projection
  const t = ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / len2;

  // Clamp to line segment
  const tt = Math.max(0, Math.min(1, t));

  return {
    x: line.start.x + tt * dx,
    y: line.start.y + tt * dy
  };
};

export default function Canvas2D({
  gridSize,
  currentTool,
  currentAirEntry,
  onLineSelect,
  airEntries,
  onLinesUpdate
}: Canvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [lines, setLines] = useState<Line[]>([]);
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

  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
      handleZoomChange(newZoom);
    }
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

  const getLineLength = (line: Line): number => {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const lengthInPixels = Math.sqrt(dx * dx + dy * dy);
    return pixelsToCm(lengthInPixels);
  };

  const snapToGrid = (point: Point): Point => {
    const snapSize = gridSize / 4;
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

  const isInClosedContour = (point: Point): boolean => {
    const visited = new Set<string>();
    const pointKey = (p: Point) => `${p.x},${p.y}`;

    const findPath = (current: Point, steps: number): boolean => {
      if (steps >= 3 && arePointsClose(current, point)) {
        return true;
      }

      const connectedLines = findConnectedLines(current);

      for (const line of connectedLines) {
        const nextPoint = arePointsClose(line.start, current) ? line.end : line.start;
        const key = pointKey(nextPoint);

        if (visited.has(key) && !(arePointsClose(nextPoint, point) && steps >= 3)) {
          continue;
        }

        visited.add(key);
        if (findPath(nextPoint, steps + 1)) {
          return true;
        }
        visited.delete(key);
      }

      return false;
    };

    visited.add(pointKey(point));
    return findPath(point, 0);
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
    if (!currentAirEntry) return 'rgba(239, 68, 68, 0.5)'; // Default red

    const colors = {
      window: 'rgba(59, 130, 246, 0.5)', // Blue
      door: 'rgba(180, 83, 9, 0.5)',     // Brown
      vent: 'rgba(34, 197, 94, 0.5)'     // Green
    };

    return colors[currentAirEntry];
  };


  const getAirEntryColor = (type: 'window' | 'door' | 'vent'): string => {
    const colors = {
      window: '#3b82f6', // Blue
      door: '#b45309',   // Brown
      vent: '#22c55e'    // Green
    };
    return colors[type];
  };

  // Modified drawAirEntry function to use correct segment lengths
  const drawAirEntry = (ctx: CanvasRenderingContext2D, entry: AirEntry) => {
    const normal = calculateNormal(entry.line);
    const color = getAirEntryColor(entry.type);
    console.log(`Drawing ${entry.type} at (${entry.position.x}, ${entry.position.y})`);
    console.log(`Normal vector: (${normal.x.toFixed(3)}, ${normal.y.toFixed(3)})`);

    // Convert width from cm to pixels
    const widthInPixels = cmToPixels(entry.dimensions.width);
    const halfWidth = widthInPixels / 2;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4 / zoom; // Thick line for all types

    // Draw the segment centered on the position point
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

    // Add perpendicular lines at the ends for all types
    const perpX = -normal.y * 4 / zoom;
    const perpY = normal.x * 4 / zoom;

    ctx.beginPath();
    // Left end
    ctx.moveTo(
      entry.position.x - normal.x * halfWidth - perpX,
      entry.position.y - normal.y * halfWidth - perpY
    );
    ctx.lineTo(
      entry.position.x - normal.x * halfWidth + perpX,
      entry.position.y - normal.y * halfWidth + perpY
    );
    // Right end
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // Draw grid lines
      ctx.beginPath();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1 / zoom;
      createGridLines().forEach(line => {
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
      });
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

      // Draw existing wall lines
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

        // Draw line length
        const midX = (line.start.x + line.end.x) / 2;
        const midY = (line.start.y + line.end.y) / 2;
        const length = Math.round(getLineLength(line));
        ctx.font = `${12 / zoom}px sans-serif`;
        ctx.fillStyle = '#64748b';
        ctx.fillText(`${length} cm`, midX, midY - 5 / zoom);
      });

      // Draw current line while drawing
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

      // Draw points
      const endpoints = [...new Set(lines.flatMap(line => [line.start, line.end]))];
      endpoints.forEach(point => {
        const connections = findConnectedLines(point).length;
        let color = '#fb923c';

        if (connections > 1) {
          if (isInClosedContour(point)) {
            color = '#22c55e';
          } else {
            color = '#3b82f6';
          }
        }

        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(point.x, point.y, POINT_RADIUS / zoom, 0, 2 * Math.PI);
        ctx.fill();

        ctx.font = `${12 / zoom}px sans-serif`;
        drawCoordinateLabel(ctx, point, color);
      });

      if (cursorPoint && isDrawing) {
        ctx.font = `${12 / zoom}px sans-serif`;
        drawCoordinateLabel(ctx, cursorPoint, '#fb923c');
      }

      ctx.restore();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (panMode || e.button === 2) {
        e.preventDefault();
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
          setLines(prev => prev.filter(line => !linesToErase.includes(line)));
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
      if (isPanning) {
        handlePanMove(e);
        return;
      }

      if (currentTool === 'wall' && isDrawing && currentLine) {
        const point = getCanvasPoint(e);
        const nearestPoint = findNearestEndpoint(point);
        const endPoint = nearestPoint || snapToGrid(point);
        setCurrentLine(prev => prev ? { ...prev, end: endPoint } : null);
        setCursorPoint(endPoint);
      } else if (currentTool === 'eraser' || currentAirEntry) {
        const point = getCanvasPoint(e);
        setHighlightedLines(findLinesNearPoint(point));
      }
    };

    // Modified handleMouseUp to log wall normals when created
    const handleMouseUp = (e: MouseEvent) => {
      if (panMode || e.button === 2) {
        handlePanEnd();
        return;
      }

      if (currentTool === 'wall' && isDrawing && currentLine) {
        if (currentLine.start.x !== currentLine.end.x || currentLine.start.y !== currentLine.end.y) {
          const normal = calculateNormal(currentLine);
          console.log('Created wall line:');
          console.log(`Start: (${currentLine.start.x}, ${currentLine.start.y})`);
          console.log(`End: (${currentLine.end.x}, ${currentLine.end.y})`);
          console.log(`Normal vector: (${normal.x.toFixed(3)}, ${normal.y.toFixed(3)})`);

          const newLines = [...lines, currentLine];
          setLines(newLines);
          onLinesUpdate?.(newLines);
        }
        setCurrentLine(null);
        setIsDrawing(false);
        setCursorPoint(null);
      }
    };

    const handleMouseLeave = () => {
      handlePanEnd();
      setHighlightedLines([]);
      if (isDrawing) {
        setCurrentLine(null);
        setIsDrawing(false);
        setCursorPoint(null);
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    let animationFrameId = requestAnimationFrame(function animate() {
      draw();
      animationFrameId = requestAnimationFrame(animate);
    });

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('contextmenu', e => e.preventDefault());
      cancelAnimationFrame(animationFrameId);
    };
  }, [gridSize, dimensions, lines, currentLine, isDrawing, currentTool, highlightedLines, zoom, pan, isPanning, panMode, cursorPoint, currentAirEntry, onLineSelect, airEntries, onLinesUpdate]);

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