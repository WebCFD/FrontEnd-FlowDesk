import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

interface Canvas2DProps {
  gridSize: number;
  currentTool: 'wall' | 'eraser';
}

const POINT_RADIUS = 4;
const SNAP_DISTANCE = 15;
const PIXELS_TO_CM = 25 / 20; // 20 pixels = 25 cm
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

export default function Canvas2D({ gridSize, currentTool }: Canvas2DProps) {
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

  // Zoom control functions
  const handleZoomChange = (newZoom: number) => {
    const oldZoom = zoom;
    const zoomDiff = newZoom - oldZoom;

    // Calculate the center point
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    // Adjust pan to keep the center point stable
    setPan(prev => ({
      x: prev.x - (centerX * zoomDiff),
      y: prev.y - (centerY * zoomDiff)
    }));

    setZoom(newZoom);
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

  // Pan control functions
  const handlePanStart = (e: MouseEvent) => {
    if (panMode || e.button === 2) { // Pan mode or right click
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

  // Toggle pan mode
  const togglePanMode = () => {
    setPanMode(!panMode);
    if (isPanning) {
      handlePanEnd();
    }
  };

  // Get point coordinates relative to canvas with zoom and pan
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

  // Convert pixels to centimeters
  const pixelsToCm = (pixels: number): number => {
    return pixels * PIXELS_TO_CM;
  };

  // Get point coordinates relative to center (in cm)
  const getRelativeCoordinates = (point: Point): { x: number; y: number } => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const relativeX = point.x - centerX;
    const relativeY = centerY - point.y; // Invert Y since canvas Y is top-down
    return {
      x: Math.round(pixelsToCm(relativeX)),
      y: Math.round(pixelsToCm(relativeY))
    };
  };

  // Draw coordinate label
  const drawCoordinateLabel = (ctx: CanvasRenderingContext2D, point: Point, color: string) => {
    const coords = getRelativeCoordinates(point);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(`(${coords.x}, ${coords.y})`, point.x + 8, point.y - 8);
  };

  // Calculate line length in centimeters
  const getLineLength = (line: Line): number => {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const lengthInPixels = Math.sqrt(dx * dx + dy * dy);
    return pixelsToCm(lengthInPixels);
  };

  // Convert canvas coordinates to grid-snapped coordinates
  const snapToGrid = (point: Point): Point => {
    const snapSize = gridSize / 4; // More refined grid (quarter of the visible grid)
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    // Calculate relative to center
    const relativeX = point.x - centerX;
    const relativeY = point.y - centerY;

    // Snap relative coordinates
    const snappedX = Math.round(relativeX / snapSize) * snapSize;
    const snappedY = Math.round(relativeY / snapSize) * snapSize;

    // Convert back to canvas coordinates
    return {
      x: centerX + snappedX,
      y: centerY + snappedY
    };
  };

  // Check if two points are close enough to snap
  const arePointsClose = (p1: Point, p2: Point): boolean => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) < SNAP_DISTANCE;
  };

  // Find the nearest endpoint to a point
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

  // Find connected lines to a point
  const findConnectedLines = (point: Point): Line[] => {
    return lines.filter(line =>
      arePointsClose(line.start, point) || arePointsClose(line.end, point)
    );
  };

  // Check if a point is part of a closed contour
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

  // Find lines near a point
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      // Apply transform
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // Calculate center points and grid offset
      const centerX = Math.round(dimensions.width / (2 * zoom));
      const centerY = Math.round(dimensions.height / (2 * zoom));

      // Ensure grid lines are drawn so that (0,0) is at a grid intersection
      const gridOffsetX = centerX % gridSize;
      const gridOffsetY = centerY % gridSize;

      // Draw grid
      ctx.beginPath();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1 / zoom;

      // Vertical lines
      for (let x = -gridOffsetX; x <= dimensions.width / zoom; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, dimensions.height / zoom);
      }

      // Horizontal lines
      for (let y = -gridOffsetY; y <= dimensions.height / zoom; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(dimensions.width / zoom, y);
      }

      ctx.stroke();

      // Calculate arrow dimensions
      const arrowLength = 150 / zoom;
      const arrowHeadLength = 10 / zoom;
      const arrowHeadAngle = Math.PI / 6;

      // Function to draw arrow
      function drawArrow(fromX: number, fromY: number, toX: number, toY: number, color: string) {
        if (!ctx) return;

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / zoom;

        // Draw main line
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);

        // Calculate arrow head
        const angle = Math.atan2(toY - fromY, toX - fromX);
        ctx.lineTo(
          toX - arrowHeadLength * Math.cos(angle - arrowHeadAngle),
          toY - arrowHeadLength * Math.sin(angle - arrowHeadAngle)
        );
        ctx.moveTo(toX, toY);
        ctx.lineTo(
          toX - arrowHeadLength * Math.cos(angle + arrowHeadAngle),
          toY - arrowHeadLength * Math.sin(angle + arrowHeadAngle)
        );

        ctx.stroke();
      }

      // Draw X-axis (red)
      drawArrow(centerX - arrowLength, centerY, centerX + arrowLength, centerY, '#ef4444');

      // Draw Y-axis (green)
      drawArrow(centerX, centerY + arrowLength, centerX, centerY - arrowLength, '#22c55e');

      // Draw origin point
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4 / zoom, 0, 2 * Math.PI);
      ctx.fillStyle = '#94a3b8';
      ctx.fill();

      // Add coordinate labels
      ctx.fillStyle = '#64748b';
      ctx.font = `${12 / zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('(0,0)', centerX + 15 / zoom, centerY + 15 / zoom);
      ctx.fillText('X', centerX + arrowLength - 10 / zoom, centerY - 10 / zoom);
      ctx.fillText('Y', centerX + 10 / zoom, centerY - arrowLength + 10 / zoom);

      // Draw existing lines
      lines.forEach(line => {
        if (highlightedLines.includes(line)) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
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

      // Draw current line preview
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

      // Draw endpoints with different colors
      const endpoints = [...new Set(lines.flatMap(line => [line.start, line.end]))];
      endpoints.forEach(point => {
        const connections = findConnectedLines(point).length;
        let color = '#fb923c'; // Orange for disconnected points

        if (connections > 1) {
          if (isInClosedContour(point)) {
            color = '#22c55e'; // Green for points in closed contours
          } else {
            color = '#3b82f6'; // Blue for connected points
          }
        }

        // Draw point
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(point.x, point.y, POINT_RADIUS / zoom, 0, 2 * Math.PI);
        ctx.fill();

        // Draw coordinate label
        ctx.font = `${12 / zoom}px sans-serif`;
        drawCoordinateLabel(ctx, point, color);
      });

      // Draw cursor point coordinates while drawing
      if (cursorPoint && isDrawing) {
        ctx.font = `${12 / zoom}px sans-serif`;
        drawCoordinateLabel(ctx, cursorPoint, '#fb923c');
      }

      ctx.restore();
    };

    // Add event listeners
    const handleMouseDown = (e: MouseEvent) => {
      if (panMode || e.button === 2) { // Pan mode or right click
        e.preventDefault();
        handlePanStart(e);
        return;
      }

      if (currentTool === 'wall') {
        const point = getCanvasPoint(e);
        const nearestPoint = findNearestEndpoint(point);
        const startPoint = nearestPoint || snapToGrid(point);
        setCurrentLine({ start: startPoint, end: startPoint });
        setIsDrawing(true);
        setCursorPoint(startPoint);
      } else if (currentTool === 'eraser') {
        const point = getCanvasPoint(e);
        const linesToErase = findLinesNearPoint(point);
        if (linesToErase.length > 0) {
          setLines(prev => prev.filter(line => !linesToErase.includes(line)));
          setHighlightedLines([]);
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
      } else if (currentTool === 'eraser') {
        const point = getCanvasPoint(e);
        setHighlightedLines(findLinesNearPoint(point));
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (panMode || e.button === 2) {
        handlePanEnd();
        return;
      }

      if (currentTool === 'wall' && isDrawing && currentLine) {
        if (currentLine.start.x !== currentLine.end.x || currentLine.start.y !== currentLine.end.y) {
          setLines(prev => [...prev, currentLine]);
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

    // Set up event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Start animation loop
    let animationFrameId = requestAnimationFrame(function animate() {
      draw();
      animationFrameId = requestAnimationFrame(animate);
    });

    // Cleanup
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('contextmenu', e => e.preventDefault());
      cancelAnimationFrame(animationFrameId);
    };
  }, [gridSize, dimensions, lines, currentLine, isDrawing, currentTool, highlightedLines, zoom, pan, isPanning, panMode, cursorPoint]);

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
        <span className="text-sm font-medium w-16 text-center">
          {Math.round(zoom * 100)}%
        </span>
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