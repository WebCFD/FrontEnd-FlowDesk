
import { useEffect, useRef, useState, useCallback } from 'react';
import { Point, Line, AirEntry } from '@/types/canvas';

interface Canvas2DProps {
  gridSize: number;
  currentTool: string;
  currentAirEntry: string | null;
  airEntries: AirEntry[];
  measurements: any;
  lines: Line[];
  floorText: string;
  isMultifloor: boolean;
  onMeasurementsUpdate: (measurements: any) => void;
  onLinesUpdate: (lines: Line[]) => void;
  onAirEntriesUpdate: (entries: AirEntry[]) => void;
  onLineSelect: (line: Line | null) => void;
}

export default function Canvas2D({
  gridSize,
  currentTool,
  currentAirEntry,
  airEntries,
  measurements,
  lines,
  floorText,
  isMultifloor,
  onMeasurementsUpdate,
  onLinesUpdate,
  onAirEntriesUpdate,
  onLineSelect,
}: Canvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Point | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / gridSize) * gridSize;
    const y = Math.round((e.clientY - rect.top) / gridSize) * gridSize;
    
    setCursorPoint({ x, y });
    
    if (isDragging && selectedEndpoint) {
      // Handle dragging logic here
    }
  }, [gridSize, isDragging, selectedEndpoint]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!cursorPoint) return;
    setStartPoint(cursorPoint);
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    if (!startPoint || !cursorPoint) return;
    
    if (currentTool === 'line') {
      const newLine: Line = {
        start: startPoint,
        end: cursorPoint,
        type: 'wall'
      };
      onLinesUpdate([...lines, newLine]);
    }
    
    setStartPoint(null);
    setIsDragging(false);
    setSelectedEndpoint(null);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!cursorPoint || !currentAirEntry) return;
    
    const newAirEntry: AirEntry = {
      type: currentAirEntry,
      position: cursorPoint,
      dimensions: { width: 100, height: 100 }
    };
    
    onAirEntriesUpdate([...airEntries, newAirEntry]);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    // Add event listeners
    canvas.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseMove]);

  // Drawing function
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    context.beginPath();
    for (let x = 0; x <= canvas.width; x += gridSize) {
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += gridSize) {
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
    }
    context.strokeStyle = '#ddd';
    context.stroke();

    // Draw lines
    lines.forEach(line => {
      context.beginPath();
      context.moveTo(line.start.x, line.start.y);
      context.lineTo(line.end.x, line.end.y);
      context.strokeStyle = '#000';
      context.lineWidth = 2;
      context.stroke();
    });

    // Draw current line if dragging
    if (startPoint && cursorPoint && isDragging) {
      context.beginPath();
      context.moveTo(startPoint.x, startPoint.y);
      context.lineTo(cursorPoint.x, cursorPoint.y);
      context.strokeStyle = '#666';
      context.stroke();
    }

    // Draw air entries
    airEntries.forEach(entry => {
      context.fillStyle = entry.type === 'window' ? 'blue' : 'green';
      context.fillRect(
        entry.position.x - 5,
        entry.position.y - 5,
        10,
        10
      );
    });

  }, [lines, airEntries, cursorPoint, startPoint, isDragging, gridSize]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      className="border border-gray-300"
    />
  );
}
