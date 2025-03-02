import { useEffect, useRef, useState } from 'react';

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

export default function Canvas2D({ gridSize, currentTool }: Canvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [lines, setLines] = useState<Line[]>([]);
  const [currentLine, setCurrentLine] = useState<Line | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

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
    const snapSize = gridSize / 2; // Snap to a grid half the size of visible grid
    return {
      x: Math.round(point.x / snapSize) * snapSize,
      y: Math.round(point.y / snapSize) * snapSize
    };
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      // Draw grid
      ctx.beginPath();
      ctx.strokeStyle = '#e2e8f0';

      // Vertical lines
      for (let x = 0; x <= dimensions.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, dimensions.height);
      }

      // Horizontal lines
      for (let y = 0; y <= dimensions.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(dimensions.width, y);
      }

      ctx.stroke();

      // Calculate center points
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
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
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      lines.forEach(line => {
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
      });
      ctx.stroke();

      // Draw current line preview
      if (currentLine) {
        ctx.beginPath();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.moveTo(currentLine.start.x, currentLine.start.y);
        ctx.lineTo(currentLine.end.x, currentLine.end.y);
        ctx.stroke();
      }
    };

    // Add event listeners for drawing
    const handleMouseDown = (e: MouseEvent) => {
      if (currentTool !== 'wall') return;

      const point = getCanvasPoint(e);
      const snappedPoint = snapToGrid(point);
      setCurrentLine({ start: snappedPoint, end: snappedPoint });
      setIsDrawing(true);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing || !currentLine) return;

      const point = getCanvasPoint(e);
      const snappedPoint = snapToGrid(point);
      setCurrentLine({ ...currentLine, end: snappedPoint });
    };

    const handleMouseUp = () => {
      if (!isDrawing || !currentLine) return;

      if (currentLine.start.x !== currentLine.end.x || currentLine.start.y !== currentLine.end.y) {
        setLines([...lines, currentLine]);
      }
      setCurrentLine(null);
      setIsDrawing(false);
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

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
      canvas.removeEventListener('mouseleave', handleMouseUp);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gridSize, dimensions, lines, currentLine, isDrawing, currentTool]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />
    </div>
  );
}