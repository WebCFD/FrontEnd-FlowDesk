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

  // Zoom control functions
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  };

  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom(prev => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
    }
  };

  // Pan control functions
  const handlePanStart = (e: MouseEvent) => {
    if (e.button === 2) { // Right click
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

  // Transform point from screen to canvas coordinates
  const screenToCanvas = (point: Point): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return point;

    return {
      x: (point.x - rect.left - pan.x) / zoom,
      y: (point.y - rect.top - pan.y) / zoom
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

  // Update canvas dimensions when container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      const container = containerRef.current;
      if (!container) return;

      const { width, height } = container.getBoundingClientRect();
      setDimensions({ width, height });
    };

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    // Initial update
    updateDimensions();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Convert canvas coordinates to grid-snapped coordinates
  const snapToGrid = (point: Point): Point => {
    const snapSize = gridSize / 2;
    return {
      x: Math.round(point.x / snapSize) * snapSize,
      y: Math.round(point.y / snapSize) * snapSize
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

  // Get all endpoints from lines
  const getAllEndpoints = (): Point[] => {
    const points: Point[] = [];
    lines.forEach(line => {
      points.push(line.start, line.end);
    });
    return points;
  };

  // Count how many times a point appears as an endpoint
  const getEndpointConnections = (point: Point): number => {
    let count = 0;
    lines.forEach(line => {
      if (arePointsClose(line.start, point) || arePointsClose(line.end, point)) {
        count++;
      }
    });
    return count;
  };

  // Convert page coordinates to canvas coordinates
  const getCanvasPoint = (e: MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
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
      const centerX = Math.round(dimensions.width / 2);
      const centerY = Math.round(dimensions.height / 2);

      // Calculate grid offset to align center with grid
      const offsetX = centerX % gridSize;
      const offsetY = centerY % gridSize;

      // Draw grid
      ctx.beginPath();
      ctx.strokeStyle = '#e2e8f0';

      // Vertical lines
      for (let x = centerX % gridSize; x <= dimensions.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, dimensions.height);
      }

      // Horizontal lines
      for (let y = centerY % gridSize; y <= dimensions.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(dimensions.width, y);
      }

      ctx.stroke();

      // Calculate arrow dimensions
      const arrowLength = 150;
      const arrowHeadLength = 10;
      const arrowHeadAngle = Math.PI / 6;

      // Function to draw arrow
      function drawArrow(fromX: number, fromY: number, toX: number, toY: number, color: string) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

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
      ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#94a3b8';
      ctx.fill();

      // Add coordinate labels
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('(0,0)', centerX + 15, centerY + 15);
      ctx.fillText('X', centerX + arrowLength - 10, centerY - 10);
      ctx.fillText('Y', centerX + 10, centerY - arrowLength + 10);

      // Draw existing lines
      ctx.beginPath();
      lines.forEach(line => {
        if (highlightedLines.includes(line)) {
          // Draw highlighted lines in red with some transparency
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
          ctx.lineWidth = 3;
        } else {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
        }
        ctx.beginPath();
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
      });

      // Draw line lengths
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      lines.forEach(line => {
        const midX = (line.start.x + line.end.x) / 2;
        const midY = (line.start.y + line.end.y) / 2;
        const length = Math.round(getLineLength(line));
        ctx.fillText(`${length} cm`, midX, midY - 5);
      });

      // Draw current line preview and its length
      if (currentLine) {
        ctx.beginPath();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.moveTo(currentLine.start.x, currentLine.start.y);
        ctx.lineTo(currentLine.end.x, currentLine.end.y);
        ctx.stroke();

        const length = Math.round(getLineLength(currentLine));
        const midX = (currentLine.start.x + currentLine.end.x) / 2;
        const midY = (currentLine.start.y + currentLine.end.y) / 2;
        ctx.fillText(`${length} cm`, midX, midY - 5);

        //Draw coordinate for the current end point
        if (currentLine.start.x !== currentLine.end.x || currentLine.start.y !== currentLine.end.y) {
          drawCoordinateLabel(ctx, currentLine.end, '#fb923c');
        }
      }

      // Draw endpoints with different colors based on their state
      getAllEndpoints().forEach(point => {
        ctx.beginPath();

        // Determine point color based on its state
        const connections = getEndpointConnections(point);
        let color = '#fb923c'; // Orange for disconnected points

        if (connections > 1) {
          if (isInClosedContour(point)) {
            color = '#22c55e'; // Green for points in closed contours
          } else {
            color = '#3b82f6'; // Blue for connected points
          }
        }

        // Draw the point
        ctx.fillStyle = color;
        ctx.arc(point.x, point.y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fill();

        // Draw coordinate label
        drawCoordinateLabel(ctx, point, color);
      });
      ctx.restore();

      // Draw zoom controls (these are drawn without transform)
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(dimensions.width - 100, dimensions.height - 30, 100, 30);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(zoom * 100)}%`, dimensions.width - 50, dimensions.height - 12);
      ctx.restore();
    };

    // Add event listeners for drawing and erasing
    const handleMouseDown = (e: MouseEvent) => {
      if (currentTool === 'wall') {
        const point = screenToCanvas(getCanvasPoint(e));
        const nearestPoint = findNearestEndpoint(point);
        const startPoint = nearestPoint || snapToGrid(point);

        setCurrentLine({ start: startPoint, end: startPoint });
        setIsDrawing(true);
      } else if (currentTool === 'eraser') {
        const point = screenToCanvas(getCanvasPoint(e));
        const linesToErase = findLinesNearPoint(point);
        if (linesToErase.length > 0) {
          const remainingLines = lines.filter(line => !linesToErase.includes(line));
          setLines(remainingLines);
          setHighlightedLines([]);
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (currentTool === 'wall') {
        if (!isDrawing || !currentLine) return;

        const point = screenToCanvas(getCanvasPoint(e));
        const nearestPoint = findNearestEndpoint(point);
        const endPoint = nearestPoint || snapToGrid(point);

        setCurrentLine({ ...currentLine, end: endPoint });
      } else if (currentTool === 'eraser') {
        const point = screenToCanvas(getCanvasPoint(e));
        const linesToErase = findLinesNearPoint(point);
        setHighlightedLines(linesToErase);
      }
    };

    const handleMouseUp = () => {
      if (currentTool === 'wall') {
        if (!isDrawing || !currentLine) return;

        if (currentLine.start.x !== currentLine.end.x || currentLine.start.y !== currentLine.end.y) {
          setLines([...lines, currentLine]);
        }
        setCurrentLine(null);
        setIsDrawing(false);
      }
    };

    const handleMouseLeave = () => {
      if (currentTool === 'eraser') {
        setHighlightedLines([]);
      }
      handleMouseUp();
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('mousedown', handlePanStart);
    canvas.addEventListener('mousemove', handlePanMove);
    canvas.addEventListener('mouseup', handlePanEnd);
    canvas.addEventListener('mouseleave', handlePanEnd);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Start animation loop
    let animationFrameId: number;
    const animate = () => {
      draw();
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    // Cleanup
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handlePanStart);
      canvas.removeEventListener('mousemove', handlePanMove);
      canvas.removeEventListener('mouseup', handlePanEnd);
      canvas.removeEventListener('mouseleave', handlePanEnd);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gridSize, dimensions, lines, currentLine, isDrawing, currentTool, highlightedLines, zoom, pan]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
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
        <Move className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}