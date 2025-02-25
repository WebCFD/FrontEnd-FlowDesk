import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { Point, Wall, DoorWindow, Room } from '@shared/schema';

export interface RoomEditorState {
  walls: Wall[];
  doors: DoorWindow[];
  windows: DoorWindow[];
  gridPoints: DoorWindow[];
  gridSize: number;
  tool: 'wall' | 'door' | 'window' | 'eraser' | 'grid';
  selectedWallIndex: number | null;
  tempWall: Wall | null;
  isClosedContour: () => boolean;
  handleMouseDown: (point: Point) => void;
  handleMouseMove: (point: Point) => void;
  handleMouseUp: () => void;
  setTool: (tool: 'wall' | 'door' | 'window' | 'eraser' | 'grid') => void;
  setGridSize: (size: number) => void;
  deleteSelectedWall: () => void;
  saveRoom: () => Promise<void>;
  loadRoom: () => Promise<void>;
  updateWallStart: (index: number, point: Point) => void;
  updateWallEnd: (index: number, point: Point) => void;
  setDoors: (doors: DoorWindow[]) => void;
  setWindows: (windows: DoorWindow[]) => void;
  setGridPoints: (gridPoints: DoorWindow[]) => void;
  isAirEntryDialogOpen: boolean;
  setIsAirEntryDialogOpen: (isOpen: boolean) => void;
  pendingAirEntry: {
    type: 'door' | 'window' | 'grid';
    position: Point;
    rotation: number;
  } | null;
  setPendingAirEntry: (entry: {
    type: 'door' | 'window' | 'grid';
    position: Point;
    rotation: number;
  } | null) => void;
  handleAirEntryConfirm: (data: DoorWindow) => void;
}

export function useRoomEditor(): RoomEditorState {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [doors, setDoors] = useState<DoorWindow[]>([]);
  const [windows, setWindows] = useState<DoorWindow[]>([]);
  const [gridPoints, setGridPoints] = useState<DoorWindow[]>([]);
  const [gridSize, setGridSize] = useState(20);
  const [tool, setTool] = useState<'wall' | 'door' | 'window' | 'eraser' | 'grid'>('wall');
  const [drawingWall, setDrawingWall] = useState<Point | null>(null);
  const [tempWall, setTempWall] = useState<Wall | null>(null);
  const [selectedWallIndex, setSelectedWallIndex] = useState<number | null>(null);
  const { toast } = useToast();
  const [isAirEntryDialogOpen, setIsAirEntryDialogOpen] = useState(false);
  const [pendingAirEntry, setPendingAirEntry] = useState<{
    type: 'door' | 'window' | 'grid';
    position: Point;
    rotation: number;
  } | null>(null);

  const handleToolChange = useCallback((newTool: 'wall' | 'door' | 'window' | 'eraser' | 'grid') => {
    setTool(newTool);
    setSelectedWallIndex(null);
  }, []);

  const findNearestWallAndPoint = (point: Point): { 
    wallIndex: number | null; 
    distance: number;
    projectedPoint: Point;
    rotation: number;
  } => {
    let nearestIndex = null;
    let minDistance = Infinity;
    let nearestProjectedPoint = point;
    let wallRotation = 0;

    walls.forEach((wall, index) => {
      const A = point.x - wall.start.x;
      const B = point.y - wall.start.y;
      const C = wall.end.x - wall.start.x;
      const D = wall.end.y - wall.start.y;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      if (lenSq !== 0) param = dot / lenSq;

      let xx, yy;

      if (param < 0) {
        xx = wall.start.x;
        yy = wall.start.y;
      } else if (param > 1) {
        xx = wall.end.x;
        yy = wall.end.y;
      } else {
        xx = wall.start.x + param * C;
        yy = wall.start.y + param * D;
      }

      const dx = point.x - xx;
      const dy = point.y - yy;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
        nearestProjectedPoint = { x: xx, y: yy };
        // Calculate wall rotation angle
        wallRotation = Math.atan2(D, C);
      }
    });

    return { 
      wallIndex: nearestIndex, 
      distance: minDistance, 
      projectedPoint: nearestProjectedPoint,
      rotation: wallRotation
    };
  };

  const findNearestAirEntry = (point: Point): { type: 'door' | 'window' | 'grid' | null, index: number } => {
    let minDistance = Infinity;
    let nearestType: 'door' | 'window' | 'grid' | null = null;
    let nearestIndex = -1;

    // Check doors
    doors.forEach((door, index) => {
      const distance = Math.sqrt(
        Math.pow(point.x - door.position.x, 2) +
        Math.pow(point.y - door.position.y, 2)
      );
      if (distance < minDistance && distance <= 10) {
        minDistance = distance;
        nearestType = 'door';
        nearestIndex = index;
      }
    });

    // Check windows
    windows.forEach((window, index) => {
      const distance = Math.sqrt(
        Math.pow(point.x - window.position.x, 2) +
        Math.pow(point.y - window.position.y, 2)
      );
      if (distance < minDistance && distance <= 10) {
        minDistance = distance;
        nearestType = 'window';
        nearestIndex = index;
      }
    });

    // Check grid points
    gridPoints.forEach((gridPoint, index) => {
      const distance = Math.sqrt(
        Math.pow(point.x - gridPoint.position.x, 2) +
        Math.pow(point.y - gridPoint.position.y, 2)
      );
      if (distance < minDistance && distance <= 10) {
        minDistance = distance;
        nearestType = 'grid';
        nearestIndex = index;
      }
    });

    return { type: nearestType, index: nearestIndex };
  };

  const handleMouseDown = useCallback((point: Point) => {
    if (tool === 'wall') {
      setDrawingWall(point);
      setTempWall({
        start: point,
        end: point
      });
      setSelectedWallIndex(null);
    } else if (tool === 'door' || tool === 'window' || tool === 'grid') {
      const { wallIndex: nearestWallIndex, distance, projectedPoint, rotation } = findNearestWallAndPoint(point);

      // Only allow placing air entries if close enough to a wall (within 10 pixels)
      if (nearestWallIndex !== null && distance <= 10) {
        setPendingAirEntry({
          type: tool,
          position: projectedPoint,
          rotation
        });
        setIsAirEntryDialogOpen(true);
      } else {
        toast({
          variant: "destructive",
          title: "Invalid Position",
          description: "Air entries must be placed on a wall",
          duration: 3000
        });
      }
    } else if (tool === 'eraser') {
      // First try to erase air entries (doors, windows, grid points)
      const { type: nearestType, index: nearestIndex } = findNearestAirEntry(point);

      if (nearestType === 'door' && nearestIndex >= 0) {
        setDoors(prev => prev.filter((_, i) => i !== nearestIndex));
        return;
      } else if (nearestType === 'window' && nearestIndex >= 0) {
        setWindows(prev => prev.filter((_, i) => i !== nearestIndex));
        return;
      } else if (nearestType === 'grid' && nearestIndex >= 0) {
        setGridPoints(prev => prev.filter((_, i) => i !== nearestIndex));
        return;
      }

      // If no air entry found, try to erase walls
      const { wallIndex: nearestWallIndex } = findNearestWallAndPoint(point);
      if (nearestWallIndex !== null) {
        setSelectedWallIndex(nearestWallIndex);
      } else {
        setSelectedWallIndex(null);
      }
    }
  }, [tool, walls, toast]);

  const handleMouseMove = useCallback((point: Point) => {
    if (tool === 'wall' && drawingWall) {
      setTempWall({
        start: drawingWall,
        end: point
      });
    } else if (tool === 'eraser') {
      const { wallIndex: nearestWallIndex } = findNearestWallAndPoint(point);
      if (nearestWallIndex !== null && selectedWallIndex === null) {
        setSelectedWallIndex(nearestWallIndex);
      }
    }
  }, [tool, drawingWall, selectedWallIndex]);

  const handleMouseUp = useCallback(() => {
    if (tool === 'wall' && drawingWall && tempWall) {
      if (tempWall.start.x !== tempWall.end.x || tempWall.start.y !== tempWall.end.y) {
        setWalls(prev => [...prev, tempWall]);
      }
      setDrawingWall(null);
      setTempWall(null);
    }
  }, [tool, drawingWall, tempWall]);

  const deleteSelectedWall = useCallback(() => {
    if (selectedWallIndex !== null) {
      setWalls(prev => prev.filter((_, index) => index !== selectedWallIndex));
      setSelectedWallIndex(null);
    }
  }, [selectedWallIndex]);

  const saveRoom = async () => {
    try {
      const room: Room = {
        walls,
        doors,
        windows,
        gridSize,
        width: 800,
        height: 600
      };

      await apiRequest('POST', '/api/rooms', {
        name: 'My Room',
        data: room
      });

      toast({
        title: "Success",
        description: "Room saved successfully"
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save room"
      });
    }
  };

  const loadRoom = async () => {
    try {
      const res = await apiRequest('GET', '/api/rooms');
      const rooms = await res.json();
      if (rooms.length > 0) {
        const room = rooms[0].data;
        setWalls(room.walls);
        setDoors(room.doors);
        setWindows(room.windows);
        setGridSize(room.gridSize);

        toast({
          title: "Success",
          description: "Room loaded successfully"
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load room"
      });
    }
  };

  const updateWallStart = useCallback((index: number, point: Point) => {
    setWalls(prev => prev.map((wall, i) =>
      i === index ? { ...wall, start: point } : wall
    ));
  }, []);

  const updateWallEnd = useCallback((index: number, point: Point) => {
    setWalls(prev => prev.map((wall, i) =>
      i === index ? { ...wall, end: point } : wall
    ));
  }, []);

  const isClosedContour = useCallback(() => {
    if (walls.length < 3) return false;

    const endpoints = new Map<string, number>();

    walls.forEach(wall => {
      const startKey = `${wall.start.x},${wall.start.y}`;
      const endKey = `${wall.end.x},${wall.end.y}`;

      endpoints.set(startKey, (endpoints.get(startKey) || 0) + 1);
      endpoints.set(endKey, (endpoints.get(endKey) || 0) + 1);
    });

    return Array.from(endpoints.values()).every(count => count === 2);
  }, [walls]);

  const handleAirEntryConfirm = useCallback((data: DoorWindow) => {
    if (!pendingAirEntry) return;

    switch (data.type) {
      case 'door':
        setDoors(prev => [...prev, data]);
        break;
      case 'window':
        setWindows(prev => [...prev, data]);
        break;
      case 'grid':
        setGridPoints(prev => [...prev, data]);
        break;
    }

    setIsAirEntryDialogOpen(false);
    setPendingAirEntry(null);
  }, [pendingAirEntry]);

  return {
    walls,
    doors,
    windows,
    gridPoints,
    gridSize,
    tool,
    selectedWallIndex,
    tempWall,
    isClosedContour,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    setTool: handleToolChange,
    setGridSize,
    deleteSelectedWall,
    saveRoom,
    loadRoom,
    updateWallStart,
    updateWallEnd,
    setDoors,
    setWindows,
    setGridPoints,
    isAirEntryDialogOpen,
    setIsAirEntryDialogOpen,
    pendingAirEntry,
    setPendingAirEntry,
    handleAirEntryConfirm
  };
}