import { useEffect, useRef, useState } from 'react';

interface Canvas2DProps {
  gridSize: number;
}

export default function Canvas2D({ gridSize }: Canvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    // Draw coordinate system
    ctx.beginPath();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;

    // X-axis
    ctx.moveTo(0, dimensions.height / 2);
    ctx.lineTo(dimensions.width, dimensions.height / 2);

    // Y-axis
    ctx.moveTo(dimensions.width / 2, 0);
    ctx.lineTo(dimensions.width / 2, dimensions.height);

    ctx.stroke();

    // Draw origin point
    ctx.beginPath();
    ctx.arc(dimensions.width / 2, dimensions.height / 2, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#94a3b8';
    ctx.fill();

  }, [gridSize, dimensions]);

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      className="w-full h-full"
    />
  );
}
