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