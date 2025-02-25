import { useRef, useEffect, useState } from 'react';
import type { Point, Wall, DoorWindow } from '@shared/schema';
import type { RoomEditorState } from '@/hooks/useRoomEditor';
import { Button } from "@/components/ui/button";
import { Plus, Minus, Move } from "lucide-react";
import AirEntryDialog from './AirEntryDialog';

interface Editor2DProps {
  editor: RoomEditorState;
}

export default function Editor2D({ editor }: Editor2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const FINE_GRID_SIZE = 5;
  const [zoom, setZoom] = useState(1);
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 8.0;
  const ZOOM_STEP = 0.1;
  const [isPanMode, setIsPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  // Initialize panOffset to center the coordinate system
  const [panOffset, setPanOffset] = useState({ x: 400, y: 300 }); // Half of canvas width and height
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null);
  const [isDraggingPoint, setIsDraggingPoint] = useState(false);
  const [draggedPoint, setDraggedPoint] = useState<{
    point: Point;
    wallIndices: number[];
  } | null>(null);
  const [isDraggingAirEntry, setIsDraggingAirEntry] = useState(false);
  const [draggedAirEntry, setDraggedAirEntry] = useState<{
    type: 'door' | 'window' | 'grid';
    index: number;
    wall: Wall;
  } | null>(null);

  // Helper function to check if two points are equal within a tolerance
  const pointsEqual = (p1: Point, p2: Point, tolerance: number = 1): boolean => {
    return Math.abs(p1.x - p2.x) <= tolerance && Math.abs(p1.y - p2.y) <= tolerance;
  };

  // Helper function to get connected wall indices for a point
  const getConnectedWallIndices = (point: Point): number[] => {
    return editor.walls.reduce((indices: number[], wall, index) => {
      if (pointsEqual(point, wall.start) || pointsEqual(point, wall.end)) {
        indices.push(index);
      }
      return indices;
    }, []);
  };

  // Helper function to determine point color based on its state
  const getPointColor = (point: Point): string => {
    const connectedWalls = getConnectedWallIndices(point);

    if (connectedWalls.length === 0) {
      return '#f97316'; // Orange for unconnected points
    }

    if (connectedWalls.length === 1) {
      return '#f97316'; // Orange for endpoint with single connection
    }

    if (editor.isClosedContour()) {
      return '#22c55e'; // Green for points in closed contour
    }

    return '#3b82f6'; // Blue for connected points
  };

  // Helper function to calculate wall length in centimeters
  const calculateWallLength = (wall: Wall): number => {
    const pixelLength = Math.sqrt(
      Math.pow(wall.end.x - wall.start.x, 2) +
      Math.pow(wall.end.y - wall.start.y, 2)
    );
    // Base scale: 20px grid = 25cm
    // Current scale: editor.gridSize px = (editor.gridSize/20 * 25)cm
    const scaleFactor = (editor.gridSize / 20) * 25;
    return Math.round((pixelLength / editor.gridSize) * scaleFactor);
  };

  const findNearestWallAndPoint = (point:Point) => {
    let minDist = Infinity;
    let nearestWallIndex = -1;
    let nearestPoint:Point = {x:0, y:0};
    editor.walls.forEach((wall, index) => {
      const distStart = Math.sqrt(Math.pow(point.x - wall.start.x, 2) + Math.pow(point.y - wall.start.y, 2));
      const distEnd = Math.sqrt(Math.pow(point.x - wall.end.x, 2) + Math.pow(point.y - wall.end.y, 2));
      if (distStart < minDist) {
        minDist = distStart;
        nearestWallIndex = index;
        nearestPoint = wall.start;
      }
      if (distEnd < minDist) {
        minDist = distEnd;
        nearestWallIndex = index;
        nearestPoint = wall.end;
      }
    });
    const rotation = nearestWallIndex !== -1 ? Math.atan2(editor.walls[nearestWallIndex].end.y - editor.walls[nearestWallIndex].start.y, editor.walls[nearestWallIndex].end.x - editor.walls[nearestWallIndex].start.x) : 0;
    return {rotation, nearestPoint};
  }


  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    // Calculate the scaling factor between canvas drawing dimensions and displayed dimensions
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Get position within the element and adjust for zoom and pan
    const x = ((e.clientX - rect.left) * scaleX - panOffset.x) / zoom;
    // Flip Y coordinate to match our new coordinate system
    const y = -((e.clientY - rect.top) * scaleY - panOffset.y) / zoom;

    return { x, y };
  };

  const snapToEndpoint = (point: Point): Point => {
    const snapDistance = 10; // Pixels
    let snappedPoint = point;

    // Check all wall endpoints
    editor.walls.forEach(wall => {
      // Check start point
      const startDist = Math.sqrt(
        Math.pow(point.x - wall.start.x, 2) +
        Math.pow(point.y - wall.start.y, 2)
      );
      if (startDist < snapDistance) {
        snappedPoint = wall.start;
      }

      // Check end point
      const endDist = Math.sqrt(
        Math.pow(point.x - wall.end.x, 2) +
        Math.pow(point.y - wall.end.y, 2)
      );
      if (endDist < snapDistance) {
        snappedPoint = wall.end;
      }
    });

    return snappedPoint;
  };

  const snapToGrid = (point: Point): Point => {
    // First try to snap to endpoints
    const snappedToEndpoint = snapToEndpoint(point);
    if (snappedToEndpoint !== point) {
      return snappedToEndpoint;
    }

    // If no endpoint snap, then snap to grid
    return {
      x: Math.round(point.x / FINE_GRID_SIZE) * FINE_GRID_SIZE,
      y: Math.round(point.y / FINE_GRID_SIZE) * FINE_GRID_SIZE
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (e.button === 1 || (e.button === 0 && (e.shiftKey || isPanMode))) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    const rawPoint = getCanvasCoordinates(e);
    const point = snapToGrid(rawPoint);

    // Log 2D coordinates
    console.log('2D Editor Point:', {
      raw: { x: rawPoint.x.toFixed(2), y: rawPoint.y.toFixed(2) },
      snapped: { x: point.x.toFixed(2), y: point.y.toFixed(2) }
    });

    // Check for right-click or Ctrl+left click on air entries
    if (e.button === 2 || (e.ctrlKey && e.button === 0)) {
      // Check doors
      const doorIndex = editor.doors.findIndex(door => {
        const distance = Math.sqrt(
          Math.pow(point.x - door.position.x, 2) +
          Math.pow(point.y - door.position.y, 2)
        );
        return distance < 10 / zoom;
      });

      if (doorIndex !== -1) {
        const wall = findWallForPoint(editor.doors[doorIndex].position);
        if (wall) {
          setIsDraggingAirEntry(true);
          setDraggedAirEntry({ type: 'door', index: doorIndex, wall });
          return;
        }
      }

      // Check windows
      const windowIndex = editor.windows.findIndex(window => {
        const distance = Math.sqrt(
          Math.pow(point.x - window.position.x, 2) +
          Math.pow(point.y - window.position.y, 2)
        );
        return distance < 10 / zoom;
      });

      if (windowIndex !== -1) {
        const wall = findWallForPoint(editor.windows[windowIndex].position);
        if (wall) {
          setIsDraggingAirEntry(true);
          setDraggedAirEntry({ type: 'window', index: windowIndex, wall });
          return;
        }
      }

      // Check grid points
      const gridIndex = editor.gridPoints.findIndex(grid => {
        const distance = Math.sqrt(
          Math.pow(point.x - grid.position.x, 2) +
          Math.pow(point.y - grid.position.y, 2)
        );
        return distance < 10 / zoom;
      });

      if (gridIndex !== -1) {
        const wall = findWallForPoint(editor.gridPoints[gridIndex].position);
        if (wall) {
          setIsDraggingAirEntry(true);
          setDraggedAirEntry({ type: 'grid', index: gridIndex, wall });
          return;
        }
      }

      // If no air entry was clicked, check for wall endpoints
      editor.walls.forEach((wall, wallIndex) => {
        [wall.start, wall.end].forEach(endpoint => {
          const distance = Math.sqrt(
            Math.pow(point.x - endpoint.x, 2) + Math.pow(point.y - endpoint.y, 2)
          );

          if (distance < 10 / zoom) {
            const connectedWalls = getConnectedWallIndices(endpoint);
            setIsDraggingPoint(true);
            setDraggedPoint({
              point: endpoint,
              wallIndices: connectedWalls
            });
            return;
          }
        });
      });
    }

    // Only create new walls with left click and when not dragging
    if (e.button === 0 && !e.ctrlKey && !isDraggingPoint && !isDraggingAirEntry) {
      editor.handleMouseDown(point);
    }
  };

  const calculateNormalAngle = (start: Point, end: Point) => {
  // Calculate wall vector
  const wallVector = {
    x: end.x - start.x,
    y: end.y - start.y
  };
  // Normal is perpendicular to wall (-y, x)
  const normalAngle = Math.atan2(-wallVector.x, wallVector.y);
  return normalAngle;
};

const logNormalOrientations = () => {
  console.log("=== 2D Normal Orientations ===");
  editor.walls.forEach((wall, i) => {
    const normalAngle = calculateNormalAngle(wall.start, wall.end);
    const normalVector = {
      x: -Math.sin(normalAngle),
      y: Math.cos(normalAngle)
    };
    console.log(`Wall ${i}: Normal angle: ${(normalAngle * 180 / Math.PI).toFixed(2)}°, Normal vector: (${normalVector.x.toFixed(2)}, ${normalVector.y.toFixed(2)})`);
  });

  editor.doors.forEach((door, i) => {
    console.log(`Door ${i}: Rotation: ${(door.rotation * 180 / Math.PI).toFixed(2)}°`);
  });

  editor.windows.forEach((window, windowIndex) => {
    const normalAngle = window.rotation + Math.PI/2;
    const normalVector = {
      x: Math.cos(normalAngle),
      y: Math.sin(normalAngle)
    };
    console.log(`Window ${windowIndex}: Normal vector: (${normalVector.x.toFixed(2)}, ${normalVector.y.toFixed(2)}), Normal angle: ${(normalAngle * 180 / Math.PI).toFixed(2)}°`);
  });
};

const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
  if (isPanning && lastPanPoint) {
    const dx = e.clientX - lastPanPoint.x;
    const dy = e.clientY - lastPanPoint.y;
    setPanOffset(prev => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));
    setLastPanPoint({ x: e.clientX, y: e.clientY });
    return;
  }

  const point = snapToGrid(getCanvasCoordinates(e));

  if (isDraggingAirEntry && draggedAirEntry) {
    const wall = draggedAirEntry.wall;

    // Project the point onto the wall line
    const wallVector = {
      x: wall.end.x - wall.start.x,
      y: wall.end.y - wall.start.y
    };
    const wallLength = Math.sqrt(wallVector.x * wallVector.x + wallVector.y * wallVector.y);

    // Calculate the projection of the point onto the wall
    const pointVector = {
      x: point.x - wall.start.x,
      y: point.y - wall.start.y
    };
    const dot = pointVector.x * wallVector.x + pointVector.y * wallVector.y;
    const projection = dot / wallLength;

    // Clamp the projection to keep the air entry on the wall
    const clampedProjection = Math.max(0, Math.min(wallLength, projection));
    const percentage = clampedProjection / wallLength;

    // Calculate the new position
    const newPosition = {
      x: wall.start.x + wallVector.x * percentage,
      y: wall.start.y + wallVector.y * percentage
    };

    // Calculate rotation (tangent to the wall)
    const rotation = Math.atan2(wallVector.y, wallVector.x);

    // Create updated air entry with ALL properties preserved
    const updatedAirEntry = {
      ...draggedAirEntry.type === 'door' ? editor.doors[draggedAirEntry.index] :
        draggedAirEntry.type === 'window' ? editor.windows[draggedAirEntry.index] :
        editor.gridPoints[draggedAirEntry.index],
      position: newPosition,
      rotation
    };

    // Update the appropriate array based on type
    switch (draggedAirEntry.type) {
      case 'door':
        const newDoors = [...editor.doors];
        newDoors[draggedAirEntry.index] = updatedAirEntry;
        editor.setDoors(newDoors);
        break;
      case 'window':
        const newWindows = [...editor.windows];
        newWindows[draggedAirEntry.index] = updatedAirEntry;
        editor.setWindows(newWindows);
        break;
      case 'grid':
        const newGridPoints = [...editor.gridPoints];
        newGridPoints[draggedAirEntry.index] = updatedAirEntry;
        editor.setGridPoints(newGridPoints);
        break;
    }
    return;
  }

  if (isDraggingPoint && draggedPoint) {
    draggedPoint.wallIndices.forEach(index => {
      const wall = editor.walls[index];
      if (pointsEqual(wall.start, draggedPoint.point)) {
        editor.updateWallStart(index, point);

        // Update air entries attached to this wall
        editor.doors.forEach((door, doorIndex) => {
          if (isPointOnWall(door.position, wall)) {
            const updatedDoor = updateAirEntriesForWall(point, wall.end, door);
            const newDoors = [...editor.doors];
            newDoors[doorIndex] = updatedDoor;
            editor.setDoors(newDoors);
          }
        });

        editor.windows.forEach((window, windowIndex) => {
          if (isPointOnWall(window.position, wall)) {
            const updatedWindow = updateAirEntriesForWall(point, wall.end, window);
            const newWindows = [...editor.windows];
            newWindows[windowIndex] = updatedWindow;
            editor.setWindows(newWindows);
          }
        });

        editor.gridPoints.forEach((gridPoint, gridIndex) => {
          if (isPointOnWall(gridPoint.position, wall)) {
            const updatedGridPoint = updateAirEntriesForWall(point, wall.end, gridPoint);
            const newGridPoints = [...editor.gridPoints];
            newGridPoints[gridIndex] = updatedGridPoint;
            editor.setGridPoints(newGridPoints);
          }
        });
      }
      if (pointsEqual(wall.end, draggedPoint.point)) {
        editor.updateWallEnd(index, point);

        // Update air entries attached to this wall
        editor.doors.forEach((door, doorIndex) => {
          if (isPointOnWall(door.position, wall)) {
            const updatedDoor = updateAirEntriesForWall(wall.start, point, door);
            const newDoors = [...editor.doors];
            newDoors[doorIndex] = updatedDoor;
            editor.setDoors(newDoors);
          }
        });

        editor.windows.forEach((window, windowIndex) => {
          if (isPointOnWall(window.position, wall)) {
            const updatedWindow = updateAirEntriesForWall(wall.start, point, window);
            const newWindows = [...editor.windows];
            newWindows[windowIndex] = updatedWindow;
            editor.setWindows(newWindows);
          }
        });

        editor.gridPoints.forEach((gridPoint, gridIndex) => {
          if (isPointOnWall(gridPoint.position, wall)) {
            const updatedGridPoint = updateAirEntriesForWall(wall.start, point, gridPoint);
            const newGridPoints = [...editor.gridPoints];
            newGridPoints[gridIndex] = updatedGridPoint;
            editor.setGridPoints(newGridPoints);
          }
        });
      }
    });
    draggedPoint.point = point;
    return;
  }

  editor.handleMouseMove(point);
};

const handleMouseUp = () => {
  if (isPanning) {
    setIsPanning(false);
    setLastPanPoint(null);
    return;
  }

  if (isDraggingPoint) {
    setIsDraggingPoint(false);
    setDraggedPoint(null);
    return;
  }

  if (isDraggingAirEntry) {
    setIsDraggingAirEntry(false);
    setDraggedAirEntry(null);
    return;
  }

  editor.handleMouseUp();
};

const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
  e.preventDefault();
  const delta = -Math.sign(e.deltaY) * ZOOM_STEP;
  setZoom(prevZoom => {
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prevZoom + delta));
    return newZoom;
  });
};

const handleZoomIn = () => {
  setZoom(prevZoom => Math.min(MAX_ZOOM, prevZoom + ZOOM_STEP));
};

const handleZoomOut = () => {
  setZoom(prevZoom => Math.max(MIN_ZOOM, prevZoom - ZOOM_STEP));
};

// Helper function to find wall that an air entry belongs to
const findWallForPoint = (point: Point): Wall | null => {
  for (const wall of editor.walls) {
    if (isPointOnWall(point, wall)) {
      return wall;
    }
  }
  return null;
};

const updateAirEntriesForWall = (wallStart: Point, wallEnd: Point, airEntry: DoorWindow): DoorWindow => {
  // Calculate the new rotation based on the wall's new direction
  const rotation = Math.atan2(wallEnd.y - wallStart.y, wallEnd.x - wallStart.x);

  // Calculate distance along the wall (percentage from start to end)
  const wallLength = Math.sqrt(
    Math.pow(wallEnd.x - wallStart.x, 2) +
    Math.pow(wallEnd.y - wallStart.y, 2)
  );
  const currentLength = Math.sqrt(
    Math.pow(airEntry.position.x - wallStart.x, 2) +
    Math.pow(airEntry.position.y - wallStart.y, 2)
  );
  const percentage = currentLength / wallLength;

  // Calculate new position
  const newX = wallStart.x + (wallEnd.x - wallStart.x) * percentage;
  const newY = wallStart.y + (wallEnd.y - wallStart.y) * percentage;

  // Return updated air entry with ALL properties preserved
  return {
    type: airEntry.type,
    position: { x: newX, y: newY },
    width: airEntry.width,
    height: airEntry.height,
    zPosition: airEntry.zPosition,
    rotation: rotation
  };
};

// Helper function to determine if a point lies on a wall segment
const isPointOnWall = (point: Point, wall: Wall): boolean => {
  const tolerance = 10; // pixels

  // Calculate distances
  const d1 = Math.sqrt(Math.pow(point.x - wall.start.x, 2) + Math.pow(point.y - wall.start.y, 2));
  const d2 = Math.sqrt(Math.pow(point.x - wall.end.x, 2) + Math.pow(point.y - wall.end.y, 2));
  const wallLength = Math.sqrt(
    Math.pow(wall.end.x - wall.start.x, 2) +
    Math.pow(wall.end.y - wall.start.y, 2)
  );

  // Point is on wall if distance from point to wall ends equals wall length (within tolerance)
  return Math.abs(d1 + d2 - wallLength) < tolerance;
};

useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  // Set canvas size
  canvas.width = 800;
  canvas.height = 600;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply zoom and pan transformation
  ctx.save();
  ctx.translate(panOffset.x, panOffset.y);
  ctx.scale(zoom, -zoom); // Flip Y axis by using negative scale

  // Draw visible reference grid
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1 / zoom;

  // Calculate grid offset based on pan position
  const startX = Math.floor((-panOffset.x / zoom) / editor.gridSize) * editor.gridSize;
  const startY = Math.floor((panOffset.y / zoom) / editor.gridSize) * editor.gridSize;
  const endX = startX + (canvas.width / zoom) + editor.gridSize * 2;
  const endY = startY - (canvas.height / zoom) - editor.gridSize * 2;

  // Draw vertical grid lines
  for (let x = startX; x < endX; x += editor.gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
    ctx.stroke();
  }

  // Draw horizontal grid lines
  for (let y = startY; y > endY; y -= editor.gridSize) {
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }

  // Draw walls with dimensions
  editor.walls.forEach((wall, index) => {
    ctx.beginPath();
    ctx.moveTo(wall.start.x, wall.start.y);
    ctx.lineTo(wall.end.x, wall.end.y);

    // Highlight selected wall
    if (index === editor.selectedWallIndex) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3 / zoom;
    } else {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2 / zoom;
    }
    ctx.stroke();

    // Draw dimension text
    const length = calculateWallLength(wall);
    const midX = (wall.start.x + wall.end.x) / 2;
    const midY = (wall.start.y + wall.end.y) / 2;

    ctx.save();
    ctx.scale(1 / zoom, -1 / zoom); // Counter zoom and flip for text
    ctx.font = '17px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${length}cm`, midX * zoom, (-midY * zoom) - 7);
    ctx.restore();
  });

  // Draw points
  editor.walls.forEach(wall => {
    // Draw start point
    ctx.beginPath();
    ctx.arc(wall.start.x, wall.start.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = getPointColor(wall.start);
    ctx.fill();

    // Draw end point
    ctx.beginPath();
    ctx.arc(wall.end.x, wall.end.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = getPointColor(wall.end);
    ctx.fill();
  });

  // Add grid point visualization
  ctx.fillStyle = '#3b82f6';
  editor.gridPoints?.forEach(gridPoint => {
    ctx.save();
    ctx.translate(gridPoint.position.x, gridPoint.position.y);
    ctx.rotate(-gridPoint.rotation); // Negate rotation due to flipped Y
    ctx.fillRect(-gridPoint.width / 2, -4, gridPoint.width, 8);
    ctx.restore();
  });

  // Draw doors and windows
  ctx.fillStyle = '#166534';
  editor.doors.forEach(door => {
    ctx.save();
    ctx.translate(door.position.x, door.position.y);
    ctx.rotate(-door.rotation); // Negate rotation due to flipped Y
    ctx.fillRect(-door.width / 2, -5, door.width, 10);
    ctx.restore();
  });

  ctx.fillStyle = '#22c55e';
  editor.windows.forEach(window => {
    ctx.save();
    ctx.translate(window.position.x, window.position.y);
    ctx.rotate(-window.rotation); // Negate rotation due to flipped Y
    ctx.fillRect(-window.width / 2, -3, window.width, 6);
    ctx.restore();
  });

  // Draw temporary elements
  if (editor.tool === 'wall' && editor.tempWall) {
    ctx.beginPath();
    ctx.moveTo(editor.tempWall.start.x, editor.tempWall.start.y);
    ctx.lineTo(editor.tempWall.end.x, editor.tempWall.end.y);
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();

    // Draw dimension for temporary wall
    const length = calculateWallLength(editor.tempWall);
    const midX = (editor.tempWall.start.x + editor.tempWall.end.x) / 2;
    const midY = (editor.tempWall.start.y + editor.tempWall.end.y) / 2;

    ctx.save();
    ctx.scale(1 / zoom, -1 / zoom);
    ctx.font = '17px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${length}cm`, midX * zoom, (-midY * zoom) - 7);
    ctx.restore();

    // Draw endpoint markers
    ctx.beginPath();
    ctx.arc(editor.tempWall.start.x, editor.tempWall.start.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(editor.tempWall.end.x, editor.tempWall.end.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
  }

  // Draw coordinate system at (0,0)
  ctx.save();

  // Arrow parameters
  const arrowLength = 100 / zoom;
  const arrowHeadSize = 10 / zoom;

  // Draw X axis (red)
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
  ctx.lineWidth = 2 / zoom;
  ctx.moveTo(0, 0);
  ctx.lineTo(arrowLength, 0);
  // Draw arrowhead
  ctx.lineTo(arrowLength - arrowHeadSize, arrowHeadSize / 2);
  ctx.moveTo(arrowLength, 0);
  ctx.lineTo(arrowLength - arrowHeadSize, -arrowHeadSize / 2);
  ctx.stroke();

  // Draw Y axis (green)
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
  ctx.lineWidth = 2 / zoom;
  ctx.moveTo(0, 0);
  ctx.lineTo(0, arrowLength);
  // Draw arrowhead
  ctx.lineTo(-arrowHeadSize / 2, arrowLength - arrowHeadSize);
  ctx.moveTo(0, arrowLength);
  ctx.lineTo(arrowHeadSize / 2, arrowLength - arrowHeadSize);
  ctx.stroke();

  // Add origin text and labels
  ctx.save();
  ctx.scale(1 / zoom, -1 / zoom);
  ctx.font = '17px sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('[0,0,0]', 5 * zoom, -5 * zoom);

  // Add axis labels
  ctx.fillStyle = '#ef4444';
  ctx.fillText('X', (arrowLength - 20) * zoom, -5 * zoom);
  ctx.fillStyle = '#22c55e';
  ctx.fillText('Y', 5 * zoom, (-arrowLength + 20) * zoom); // Position Y label near the arrow tip
  ctx.restore();

  ctx.restore();
  ctx.restore();
}, [editor, zoom, panOffset]);

useEffect(() => {    const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.key === 'Delete'|| e.key === 'Backspace') && editor.selectedWallIndex !== null) {
        e.preventDefault(); // Prevent browser back navigation on backspace
                editor.deleteSelectedWall();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  // Add this effect to watch tool changes
  useEffect(() => {
    // Disable pan mode when tool changes
    setIsPanMode(false);
  }, [editor.tool]);

  // Log normals on each render
  useEffect(() => {
    logNormalOrientations();
  }, [editor.walls, editor.doors, editor.windows]);


  return (
    <div className="relative w-full aspect-[4/3]">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className={`absolute top-0 left-0 w-full h-full border border-border rounded-md ${
          isPanMode ? 'cursor-move' : 'cursor-crosshair'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()} // Prevent context menu
      />
      <div className="absolute bottom-2 right-2 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background/80"
          onClick={handleZoomOut}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background/80"
          onClick={handleZoomIn}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant={isPanMode ? "destructive" : "outline"}
          size="icon"
          className={`h-8 w-8 ${isPanMode ? 'bg-destructive hover:bg-destructive' : 'bg-background/80'}`}
          onClick={() => setIsPanMode(!isPanMode)}
        >
          <Move className={`h-4 w-4 ${isPanMode ? 'text-destructive-foreground' : ''}`} />
        </Button>
        <div className="bg-background/80 px-2 py-1 rounded text-sm">
          {Math.round(zoom * 100)}%
        </div>
      </div>
      <AirEntryDialog
        isOpen={editor.isAirEntryDialogOpen}
        onClose={() => {
          editor.setPendingAirEntry(null);
          editor.setIsAirEntryDialogOpen(false);
        }}
        onConfirm={editor.handleAirEntryConfirm}
        type={editor.pendingAirEntry?.type || 'door'}
        position={editor.pendingAirEntry?.position || { x: 0, y: 0 }}
        rotation={editor.pendingAirEntry?.rotation || 0}
      />
    </div>
  );
}