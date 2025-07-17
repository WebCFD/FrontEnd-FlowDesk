import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { useLocation } from "wouter";
import DashboardLayout from "@/components/layout/dashboard-layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { trackEvent } from "@/lib/analytics";
import { AnalyticsCategories, AnalyticsActions } from "@/lib/analyticsEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { customFurnitureStore } from "@/lib/custom-furniture-store";
import SimulationDataDialog from "@/components/sketch/SimulationDataDialog";
import LoadDesignDialog from "@/components/sketch/LoadDesignDialog";
import { generateSimulationData, denormalizeCoordinates } from "@/lib/simulationDataConverter";
import * as THREE from "three";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Save,
  Upload,
  Eraser,
  ArrowRight,
  ArrowLeft,
  Ruler,
  Eye,
  RotateCw,
  ZoomIn,
  Share2,
  ChevronDown,
  FileText,
  Info,
} from "lucide-react";
import Canvas2D from "@/components/sketch/Canvas2D";
import { RoomSketchPro } from "@/components/sketch/RoomSketchPro";
import { SceneProvider } from "@/contexts/SceneContext";
import { cn } from "@/lib/utils";
import AirEntryDialog from "@/components/sketch/AirEntryDialog";
import StairPropertiesDialog from "@/components/sketch/StairPropertiesDialog";
import Canvas3D from "@/components/sketch/Canvas3D";
import { Toolbar3D, ViewDirection } from "@/components/sketch/Toolbar3D";
import { useRoomStore } from "@/lib/store/room-store";
import { FurnitureItem } from "@shared/furniture-types";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PlusCircle, Play, Mail, FileEdit } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FurnitureMenu } from "@/components/sketch/FurnitureMenu";
import { ToolbarToggle } from "@/components/sketch/ToolbarToggle";
import { useSketchStore } from "@/lib/stores/sketch-store";

interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

interface AirEntry {
  type: "window" | "door" | "vent";
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
  lineId?: string; // Optional reference to the id of the line this entry is attached to
  id?: string; // Unique identifier for the air entry (e.g., "window_1", "door_2")
}

interface StairPolygon {
  id: string;
  points: Point[];
  floor: string;
  direction?: "up" | "down";
  connectsTo?: string;
  isImported?: boolean;
}

interface Wall {
  id: string;
  uuid: string;
  floor: string;
  lineRef: string;
  startPoint: Point;
  endPoint: Point;
  properties: {
    temperature: number;
  };
}

interface FloorLoadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  sourceFloor: string;
  targetFloor: string;
  hasContent: boolean;
  hasStairs: boolean;
}

const FloorLoadDialog: React.FC<FloorLoadDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  sourceFloor,
  targetFloor,
  hasContent,
  hasStairs,
}) => {
  // Format floor names for display
  const sourceFloorText = formatFloorText(sourceFloor);
  const targetFloorText = formatFloorText(targetFloor);

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasContent ? "Overwrite Floor Layout?" : "Load Floor Template"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                {hasContent
                  ? `Loading ${sourceFloorText} as a template will overwrite your current ${targetFloorText} layout. This action cannot be undone.`
                  : `This will copy the layout from ${sourceFloorText} to ${targetFloorText}.`}
              </p>

              {hasStairs && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <h4 className="text-amber-800 font-medium">
                    Stair Connection Information
                  </h4>
                  <p className="text-amber-700 text-sm mt-1">
                    Stairs connecting {sourceFloorText} to {targetFloorText} will
                    be imported and displayed as non-editable elements. Imported
                    stairs can only be removed from their source floor.
                  </p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {hasContent ? "Overwrite" : "Load Template"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const calculateNormal = (line: Line | null): { x: number; y: number } => {
  if (!line) return { x: 0, y: 0 };
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const mag = Math.sqrt(dx * dx + dy * dy);
  return { x: -dy / mag, y: dx / mag };
};

const formatFloorText = (floor: string): string => {
  const capitalizedFloor = floor.charAt(0).toUpperCase() + floor.slice(1);
  return `${capitalizedFloor} Floor`;
};

const getNextFloorName = (currentFloor: string): string => {
  const floorMap: Record<string, string> = {
    ground: "first",
    first: "second",
    second: "third",
    third: "fourth",
    fourth: "fifth",
  };
  return floorMap[currentFloor] || "ground";
};

const getConnectedFloorName = (
  floorName: string,
  direction: "up" | "down" = "up",
): string => {
  const floorOrder = ["ground", "first", "second", "third", "fourth", "fifth"];
  const currentIndex = floorOrder.indexOf(floorName);

  if (currentIndex === -1) return floorName; // Invalid floor name

  if (direction === "up" && currentIndex < floorOrder.length - 1) {
    return floorOrder[currentIndex + 1];
  } else if (direction === "down" && currentIndex > 0) {
    return floorOrder[currentIndex - 1];
  }

  return floorName; // No valid connected floor
};

export default function WizardDesign() {
  const [, setLocation] = useLocation();
  const { user, setReturnTo } = useAuth();
  const { viewportOffset, gridSize } = useSketchStore();
  const [step, setStep] = useState(1);
  const [simulationName, setSimulationName] = useState("");
  const [simulationType, setSimulationType] = useState("comfort");
  const [currentTool, setCurrentTool] = useState<
    "wall" | "eraser" | "measure" | "stairs" | null
  >("wall");
  const [currentAirEntry, setCurrentAirEntry] = useState<
    "vent" | "door" | "window" | null
  >(null);
  const { toast } = useToast();
  const [isAirEntryDialogOpen, setIsAirEntryDialogOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<Line | null>(null);
  const [clickedPoint, setClickedPoint] = useState<Point | null>(null);
  const [tab, setTab] = useState<"2d-editor" | "3d-preview">("2d-editor");
  const [showStartSimulationPrompt, setShowStartSimulationPrompt] =
    useState(false);
  const [showEraseDesignDialog, setShowEraseDesignDialog] = useState(false);
  const [wallTransparency, setWallTransparency] = useState(0.2);
  const [airEntryTransparency, setAirEntryTransparency] = useState(1.0);
  const [ceilingHeight, setCeilingHeight] = useState(220); // Default 220cm - deprecated, usar floorParameters
  const [isMultifloor, setIsMultifloor] = useState(true);
  const [selectedFloor, setSelectedFloor] = useState("ground");
  const [loadFromFloor, setLoadFromFloor] = useState("ground");
  const [floorDeckThickness, setFloorDeckThickness] = useState(35); // Default 35cm - deprecated, usar floorParameters
  const [defaultWallTemperature, setDefaultWallTemperature] = useState(20); // Default wall temperature in °C
  const [defaultStairTemperature, setDefaultStairTemperature] = useState(20); // Default stair temperature in °C
  const [canvas3DKey, setCanvas3DKey] = useState(0); // Force re-render of Canvas3D
  
  // Nuevos estados para parámetros por planta
  const [floorParameters, setFloorParameters] = useState<Record<string, { ceilingHeight: number; floorDeck: number; ceilingTemperature?: number; floorTemperature?: number }>>({
    ground: { ceilingHeight: 220, floorDeck: 35, ceilingTemperature: 20, floorTemperature: 20 }
  });

  // Funciones auxiliares para manejo de parámetros por planta
  const getCurrentFloorParameters = () => {
    return floorParameters[selectedFloor] || { ceilingHeight: 220, floorDeck: 35, ceilingTemperature: 20, floorTemperature: 20 };
  };

  const updateFloorParameter = (floor: string, parameter: 'ceilingHeight' | 'floorDeck' | 'ceilingTemperature' | 'floorTemperature', value: number) => {
    setFloorParameters(prev => ({
      ...prev,
      [floor]: {
        ...prev[floor] || { ceilingHeight: 220, floorDeck: 35, ceilingTemperature: 20, floorTemperature: 20 },
        [parameter]: value
      }
    }));
  };

  const ensureFloorParametersExist = (floor: string) => {
    if (!floorParameters[floor]) {
      setFloorParameters(prev => ({
        ...prev,
        [floor]: { ceilingHeight: 220, floorDeck: 35 }
      }));
    }
  };

  // Getter para compatibilidad con código existente
  const getCurrentCeilingHeight = () => {
    if (isMultifloor) {
      return getCurrentFloorParameters().ceilingHeight;
    } else {
      return ceilingHeight;
    }
  };

  const getCurrentFloorDeckThickness = () => {
    if (isMultifloor) {
      return getCurrentFloorParameters().floorDeck;
    } else {
      return floorDeckThickness;
    }
  };
  const [isMeasureMode, setIsMeasureMode] = useState(false);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [isFurnitureEraserMode, setIsFurnitureEraserMode] = useState(false);

  // Reference to the 3D scene for furniture cleanup
  // Use a separate key to ensure this ref is isolated from RoomSketchPro's scene ref
  const wizardSceneRef = useRef<THREE.Scene | null>(null);

  // Estado para el diálogo de datos de simulación
  const [showSimulationDataDialog, setShowSimulationDataDialog] =
    useState(false);
  const [simulationData, setSimulationData] = useState<object>({});

  // Estado para el diálogo de carga de diseño
  const [showLoadDesignDialog, setShowLoadDesignDialog] = useState(false);

  // Use the global room store with updated selectors
  const {
    floors: rawFloors,
    currentFloor,
    setCurrentFloor,
    setLines,
    setAirEntries,
    setWalls,
    setMeasurements,
    setStairPolygons,
    setHasClosedContour,
    addFloor,
    removeFloor,
    copyFloorAs,
    syncWallsForCurrentFloor,
    // Phase 2: Add furniture store functions
    addFurnitureToFloor,
    updateFurnitureInFloor,
    deleteFurnitureFromFloor,
    reset: storeReset, // Import store reset function with alias
  } = useRoomStore();

  // Reactive store subscription ensures real-time updates across components

  // CRITICAL OPTIMIZATION: Memoize floors to prevent unnecessary scene rebuilds
  // Only change when structural data (lines, airEntries positions, walls) changes
  // NOT when metadata (properties, dimensions) changes
  const floors = useMemo(() => {
    // Helper function to normalize floating point numbers to prevent precision errors
    const normalizeNum = (num: number, precision = 2): number => {
      return Math.round(num * Math.pow(10, precision)) / Math.pow(10, precision);
    };
    
    // Helper function to normalize objects with floating point values
    // EXCLUDE furniture scale and properties from normalization
    const normalizeObject = (obj: any, path: string[] = []): any => {
      if (typeof obj === 'number') {
        // Don't normalize furniture scale, rotation values or user-defined properties
        if (path.includes('scale') || path.includes('rotation') || path.includes('properties') || path.includes('simulationProperties')) {
          return obj; // Return original value
        }
        return normalizeNum(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map((item, index) => normalizeObject(item, [...path, index.toString()]));
      }
      if (obj && typeof obj === 'object') {
        const normalized: any = {};
        Object.keys(obj).forEach(key => {
          normalized[key] = normalizeObject(obj[key], [...path, key]);
        });
        return normalized;
      }
      return obj;
    };
    
    // Create a stable reference by extracting only structural data
    const structuralFloors: Record<string, any> = {};
    
    Object.keys(rawFloors).forEach(floorName => {
      const floorData = rawFloors[floorName];
      if (floorData) {
        structuralFloors[floorName] = {
          lines: normalizeObject(floorData.lines),
          airEntries: floorData.airEntries?.map(entry => normalizeObject({
            // CRITICAL FIX: Include ALL properties for Canvas3D compatibility
            id: entry.id,
            lineId: (entry as any).lineId,
            type: entry.type,
            position: entry.position,
            line: entry.line,
            dimensions: {
              width: entry.dimensions.width,
              height: entry.dimensions.height,
              distanceToFloor: entry.dimensions.distanceToFloor,
              shape: entry.dimensions.shape,
              // Include wallPosition to preserve Save Changes data
              wallPosition: (entry.dimensions as any).wallPosition
            },
            // CRITICAL FIX: Include properties (temperature, state, angles, etc.)
            properties: entry.properties
          })),
          walls: normalizeObject(floorData.walls),
          measurements: normalizeObject(floorData.measurements),
          hasClosedContour: floorData.hasClosedContour,
          stairPolygons: normalizeObject(floorData.stairPolygons),
          furnitureItems: normalizeObject(floorData.furnitureItems),
          name: floorData.name
        };
      }
    });
    
    return structuralFloors;
  }, [
    // Single stable dependency hash to prevent useMemo warning
    (() => {
      const dependencyData = Object.keys(rawFloors)
        .sort()
        .map(floorName => ({
          name: floorName,
          linesLength: rawFloors[floorName]?.lines?.length || 0,
          airEntriesLength: rawFloors[floorName]?.airEntries?.length || 0,
          // Include airEntries structural data to detect position/dimension changes  
          airEntriesPositions: rawFloors[floorName]?.airEntries?.map(e => ({
            x: Math.round(e.position.x * 100) / 100,
            y: Math.round(e.position.y * 100) / 100,
            w: e.dimensions.width,
            h: e.dimensions.height
          })) || [],
          furnitureItemsLength: rawFloors[floorName]?.furnitureItems?.length || 0,
          stairPolygonsLength: rawFloors[floorName]?.stairPolygons?.length || 0,
          stairPolygonsHash: JSON.stringify(rawFloors[floorName]?.stairPolygons || []),
          wallsLength: rawFloors[floorName]?.walls?.length || 0,
          wallsHash: JSON.stringify(rawFloors[floorName]?.walls || []),
          hasClosedContour: rawFloors[floorName]?.hasClosedContour || false
        }));
      

      
      return JSON.stringify(dependencyData);
    })()
  ]);



  // Get current floor data
  const currentFloorData = floors[currentFloor];
  const { lines, airEntries, walls, measurements, hasClosedContour, furnitureItems } =
    currentFloorData;
  

  
  // Get stairPolygons directly from store to ensure real-time updates
  const stairPolygons = currentFloorData.stairPolygons || [];



  // Auto-inicializar parámetros cuando se activa multifloor
  useEffect(() => {
    if (isMultifloor) {
      Object.keys(floors).forEach(floorName => {
        if (floors[floorName]?.hasClosedContour) {
          ensureFloorParametersExist(floorName);
        }
      });
    }
  }, [isMultifloor, floors]);

  // Handle loading floor template

  const handleLoadTemplate = () => {
    if (loadFromFloor === currentFloor) {
      toast({
        title: "Invalid Selection",
        description: "Cannot load a floor as a template for itself",
        variant: "destructive",
      });
      return;
    }

    // Check if target floor has content
    const hasContent =
      floors[currentFloor]?.lines.length > 0 ||
      floors[currentFloor]?.airEntries.length > 0;

    // Check if source floor has stairs that connect to target floor
    const hasStairs =
      floors[loadFromFloor]?.stairPolygons?.some((stair) => {
        const connectsToTargetFloor =
          (stair.direction === "up" &&
            getConnectedFloorName(loadFromFloor, "up") === currentFloor) ||
          (stair.direction === "down" &&
            getConnectedFloorName(loadFromFloor, "down") === currentFloor);

        return connectsToTargetFloor;
      }) || false;

    // Open confirmation dialog
    setIsFloorLoadDialogOpen(true);
  };

  const [isFloorLoadDialogOpen, setIsFloorLoadDialogOpen] = useState(false);

  // Helper functions for ID regeneration


  const regenerateWallIds = (walls: Wall[], floor: string): Wall[] => {
    const floorPrefix = floor === 'ground' ? '0F' : 
                       floor === 'first' ? '1F' :
                       floor === 'second' ? '2F' :
                       floor === 'third' ? '3F' :
                       floor === 'fourth' ? '4F' :
                       floor === 'fifth' ? '5F' : '0F';
    
    // Get existing walls in target floor to avoid ID conflicts
    const existingWalls = floors[currentFloor]?.walls || [];
    let wallCounter = 1;
    
    // Find the next available wall number
    existingWalls.forEach(wall => {
      const anyWall = wall as any;
      if (anyWall.id) {
        const match = anyWall.id.match(new RegExp(`^wall_${floorPrefix}_(\\d+)$`));
        if (match) {
          const num = parseInt(match[1]);
          if (wallCounter <= num) {
            wallCounter = num + 1;
          }
        }
      }
    });
    
    return walls.map(wall => ({
      ...wall,
      id: `wall_${floorPrefix}_${wallCounter++}`
    }));
  };

  const regenerateLineIds = (lines: Line[]): Line[] => {
    return lines.map((line, index) => ({
      ...line,
      id: `line_${index + 1}`
    }));
  };

  const regenerateMeasurementIds = (measurements: any[]): any[] => {
    return measurements.map((measurement, index) => ({
      ...measurement,
      id: `measurement_${index + 1}`
    }));
  };

  // Add this function after handleLoadTemplate
  const performFloorLoad = () => {
    // Close the dialog
    setIsFloorLoadDialogOpen(false);

    // Begin by looking at the source floor data - READ FROM STORE NOT MEMOIZED DATA
    const sourceFloorData = rawFloors[loadFromFloor];
    const targetFloorData = floors[currentFloor] || {
      lines: [],
      airEntries: [],
      walls: [],
      measurements: [],
      stairPolygons: [],
      hasClosedContour: false,
    };

    // Regenerate IDs for copied elements (excluding AirEntries)
    const newLines = regenerateLineIds([...sourceFloorData.lines]);
    const newWalls = regenerateWallIds([...(sourceFloorData.walls || [])], currentFloor);
    const newMeasurements = regenerateMeasurementIds([...sourceFloorData.measurements]);

    // Special handling for stairs
    let newStairPolygons: StairPolygon[] = [];

    // Process existing stairs in the target floor
    if (
      targetFloorData.stairPolygons &&
      targetFloorData.stairPolygons.length > 0
    ) {
      // Keep stairs that are owned by the current floor (not imported)
      const ownedStairs = targetFloorData.stairPolygons.filter(
        (stair) => !stair.isImported,
      );
      newStairPolygons = [...ownedStairs];
    }

    // Note: Stairs are NOT copied during template load
    // They will be projected automatically by projectStairsFromAdjacentFloors

    // Copy floor parameters (ceiling height, floor deck, and temperatures) from source floor
    const sourceFloorParams = floorParameters[loadFromFloor];
    if (sourceFloorParams) {
      setFloorParameters(prev => ({
        ...prev,
        [currentFloor]: {
          ceilingHeight: sourceFloorParams.ceilingHeight,
          floorDeck: sourceFloorParams.floorDeck,
          ceilingTemperature: sourceFloorParams.ceilingTemperature || 20,
          floorTemperature: sourceFloorParams.floorTemperature || 20
        }
      }));
    }

    // Set new data for the current floor (keeping existing AirEntries)
    setLines(newLines);
    // Note: AirEntries are NOT copied - each floor maintains its own air entries
    setWalls(newWalls);
    setMeasurements(newMeasurements);
    setStairPolygons(newStairPolygons);
    setHasClosedContour(sourceFloorData.hasClosedContour);

    // Project stairs from adjacent floors after template load
    setTimeout(() => {
      projectStairsFromAdjacentFloors(currentFloor);
    }, 100);

    // Force Canvas3D re-render for immediate visual feedback
    setCanvas3DKey(prev => prev + 1);

    toast({
      title: "Floor Template Loaded",
      description: `Successfully loaded ${formatFloorText(loadFromFloor)} layout to ${formatFloorText(currentFloor)} (air entries preserved)`,
    });
  };

  // Project stairs from adjacent floors (replaces direction-based logic)
  const projectStairsFromAdjacentFloors = (targetFloorName: string) => {
    const targetFloorData = floors[targetFloorName];
    if (!targetFloorData) return;

    // Get all floor names for adjacency calculation
    const floorOrder = ["ground", "first", "second", "third", "fourth"];
    const targetIndex = floorOrder.indexOf(targetFloorName);
    if (targetIndex === -1) return;

    // Find adjacent floors (floor above and below)
    const adjacentFloors = [];
    if (targetIndex > 0) adjacentFloors.push(floorOrder[targetIndex - 1]); // Floor below
    if (targetIndex < floorOrder.length - 1) adjacentFloors.push(floorOrder[targetIndex + 1]); // Floor above

    let projectedStairs: StairPolygon[] = [];
    
    // Keep existing stairs that are owned by this floor (not imported)
    const existingOwnedStairs = targetFloorData.stairPolygons?.filter(stair => !stair.isImported) || [];
    projectedStairs = [...existingOwnedStairs];

    // Project stairs from each adjacent floor
    adjacentFloors.forEach(adjacentFloorName => {
      const adjacentFloorData = floors[adjacentFloorName];
      if (!adjacentFloorData?.stairPolygons) return;

      adjacentFloorData.stairPolygons.forEach(stair => {
        // Skip already imported stairs to avoid duplicates
        if (stair.isImported) return;

        // Check if this stair should be projected to target floor
        // Logic: stairs always connect adjacent floors (simplified without direction)
        const shouldProject = true; // All stairs from adjacent floors get projected

        if (shouldProject) {
          // Check if projection already exists
          const existingProjection = projectedStairs.find(
            s => s.connectsTo === stair.id || s.id === stair.connectsTo
          );

          if (!existingProjection) {
            // Create projected stair
            const projectedStair: StairPolygon = {
              id: `imported-${stair.id}`,
              points: [...stair.points],
              floor: targetFloorName,
              connectsTo: stair.id,
              isImported: true
            };

            projectedStairs.push(projectedStair);
          }
        }
      });
    });

    // Update stairs for target floor
    setStairPolygons(projectedStairs);
    
    // Show feedback when stairs are projected
    const projectedCount = projectedStairs.filter(stair => stair.isImported).length;
    if (projectedCount > 0) {
      // Force re-render of Canvas3D to show projected stairs immediately
      setCanvas3DKey(prev => prev + 1);
      
      toast({
        title: "Stairs Projected",
        description: `${projectedCount} stair(s) projected from adjacent floors`,
        duration: 2000,
      });
    }
  };

  // Handle floor selection change
  const handleFloorChange = (floorName: string) => {
    if (!floors[floorName]) {
      // Initialize the new floor with an empty state
      addFloor(floorName);
    }
    setCurrentFloor(floorName);
    setSelectedFloor(floorName);
    
    // Auto-project stairs from adjacent floors (without direction dependency)
    projectStairsFromAdjacentFloors(floorName);
  };

  // Handle adding a new floor
  const handleAddFloor = (floorName: string) => {
    if (floors[floorName]) {
      toast({
        title: "Floor Already Exists",
        description: `${formatFloorText(floorName)} already exists`,
        variant: "destructive",
      });
      return;
    }

    addFloor(floorName);
    setCurrentFloor(floorName);
    setSelectedFloor(floorName);
    toast({
      title: "Floor Added",
      description: `Successfully created ${formatFloorText(floorName)}`,
    });
  };

  // Handle removing a floor
  const handleRemoveFloor = (floorName: string) => {
    if (floorName === "ground") {
      toast({
        title: "Cannot Remove Ground Floor",
        description: "The ground floor cannot be removed",
        variant: "destructive",
      });
      return;
    }

    removeFloor(floorName);
    toast({
      title: "Floor Removed",
      description: `Successfully removed ${formatFloorText(floorName)}`,
    });
  };

  const steps = [
    { id: 1, name: "Upload" },
    { id: 2, name: "Setup" },
    { id: 3, name: "Order" },
  ];

  const handleToolSelect = (tool: "wall" | "eraser" | "measure" | "stairs") => {
    // Rastrear cambio de herramienta
    trackEvent(
      AnalyticsCategories.DESIGN,
      tool === "wall"
        ? AnalyticsActions.ADD_WALL
        : tool === "eraser"
          ? AnalyticsActions.DELETE_ELEMENT
          : tool === "measure"
            ? "measure_tool"
            : tool === "stairs"
              ? AnalyticsActions.ADD_STAIR
              : "unknown_tool",
      `select_${tool}_tool`,
    );

    // Toggle behavior: if same tool clicked, deselect it
    if (currentTool === tool) {
      setCurrentTool(null);
    } else {
      setCurrentTool(tool);
      setCurrentAirEntry(null); // Clear air entries when selecting tool
    }
  };

  const handleAirEntrySelect = (entry: "vent" | "door" | "window") => {
    // Rastrear selección de tipo de air entry
    trackEvent(
      AnalyticsCategories.DESIGN,
      entry === "window"
        ? AnalyticsActions.ADD_WINDOW
        : entry === "door"
          ? AnalyticsActions.ADD_DOOR
          : "add_vent",
      `select_${entry}_tool`,
    );

    if (currentAirEntry === entry) {
      setCurrentAirEntry(null);
    } else {
      setCurrentAirEntry(entry);
      setCurrentTool(null);
    }
  };

  const getAirEntryStyles = (type: "vent" | "door" | "window") => {
    const baseStyles =
      "w-20 h-16 p-2 flex flex-col items-center justify-center transition-all duration-200 shadow-sm";
    const activeStyles = "scale-95 shadow-inner";

    const colorStyles = {
      window: "hover:bg-blue-100 text-blue-700",
      door: "hover:bg-amber-100 text-amber-700",
      vent: "hover:bg-green-100 text-green-700",
    };

    const activeColorStyles = {
      window: "bg-blue-100",
      door: "bg-amber-100",
      vent: "bg-green-100",
    };

    const borderStyles = {
      window: "border-blue-500",
      door: "border-amber-500",
      vent: "border-green-500",
    };

    return cn(
      baseStyles,
      colorStyles[type],
      currentAirEntry === type ? activeStyles : "",
      currentAirEntry === type ? activeColorStyles[type] : "",
      currentAirEntry === type ? borderStyles[type] : "",
      "border-2",
      borderStyles[type],
    );
  };

  const getStairStyles = () => {
    const baseStyles =
      "w-20 h-16 p-2 flex flex-col items-center justify-center transition-all duration-200 shadow-sm";
    const activeStyles = "scale-95 shadow-inner";
    const colorStyles = "hover:bg-violet-100 text-violet-700";
    const activeColorStyles = "bg-violet-100";
    const borderStyles = "border-violet-500";

    return cn(
      baseStyles,
      colorStyles,
      currentTool === "stairs" ? activeStyles : "",
      currentTool === "stairs" ? activeColorStyles : "",
      currentTool === "stairs" ? borderStyles : "",
      "border-2",
      borderStyles,
    );
  }

  const getWallStyles = () => {
    const baseStyles =
      "w-20 h-16 p-2 flex flex-col items-center justify-center transition-all duration-200 shadow-sm";
    const activeStyles = "scale-95 shadow-inner";
    const colorStyles = "hover:bg-gray-100 text-gray-700";
    const activeColorStyles = "bg-gray-100";
    const borderStyles = "border-gray-500";

    return cn(
      baseStyles,
      colorStyles,
      currentTool === "wall" ? activeStyles : "",
      currentTool === "wall" ? activeColorStyles : "",
      currentTool === "wall" ? borderStyles : "",
      "border-2",
      borderStyles,
    );
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleAirEntryDimensionsConfirm = (dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  }) => {
    if (selectedLine && clickedPoint && currentAirEntry) {
      const normal = calculateNormal(selectedLine);
      console.log(`Creating new ${currentAirEntry} air entry:`);
      console.log(`Position: (${clickedPoint.x}, ${clickedPoint.y})`);
      console.log(
        `Dimensions: width=${dimensions.width}cm, height=${dimensions.height}cm`,
      );
      console.log(
        `Wall normal: (${normal.x.toFixed(3)}, ${normal.y.toFixed(3)})`,
      );

      // Create new AirEntry WITHOUT ID (store will generate it)
      const newAirEntryWithoutId = {
        type: currentAirEntry,
        position: clickedPoint,
        dimensions,
        line: selectedLine,
      } as any;

      // Use store to add entry WITH generated ID
      const generatedId = useRoomStore.getState().addAirEntryToFloor(currentFloor, newAirEntryWithoutId);
      const newAirEntry = { ...newAirEntryWithoutId, id: generatedId };

      const newAirEntries = [...airEntries, newAirEntry];
      setAirEntries(newAirEntries);
      setSelectedLine(null);
      setClickedPoint(null);
      setCurrentAirEntry(null);
    }
    setIsAirEntryDialogOpen(false);
  };

  const handleLineSelect = (line: Line, clickPoint: Point) => {
    if (currentAirEntry) {
      setSelectedLine(line);
      setClickedPoint(clickPoint);
      setIsAirEntryDialogOpen(true);
    }
  };

  // Handle view direction changes is defined below

  // Add these functions:
  // Toggle 3D measurement mode
  const handleToggleMeasureMode = () => {
    setIsMeasureMode(!isMeasureMode);
    // Disable eraser mode when enabling measure mode
    if (!isMeasureMode) {
      setIsEraserMode(false);
    }
    toast({
      title: isMeasureMode
        ? "Measurement Mode Disabled"
        : "Measurement Mode Enabled",
      description: isMeasureMode
        ? "Exited measurement mode"
        : "Click to place start point, click again for end point",
    });
  };

  // Toggle 3D eraser mode
  const handleToggleEraserMode = () => {
    const newEraserMode = !isEraserMode;
    console.log(
      "🔴 ERASER TOGGLE - Toggling eraser mode, current:",
      isEraserMode,
      "new:",
      newEraserMode,
    );

    // Disable measurement mode when enabling eraser mode
    if (newEraserMode) {
      console.log(
        "🔴 ERASER TOGGLE - Disabling measure mode because eraser mode was enabled",
      );
      setIsMeasureMode(false);
      // Also disable furniture eraser mode
      setIsFurnitureEraserMode(false);
    }

    // Use the new value for toast notifications instead of the current state
    // which hasn't been updated yet
    toast({
      title: newEraserMode ? "Eraser Mode Enabled" : "Eraser Mode Disabled",
      description: newEraserMode
        ? "Click on a window, door, or vent to delete it"
        : "Exited eraser mode",
    });

    // Set the state after preparing the toast notification
    setIsEraserMode(newEraserMode);

    // Log for debugging
    console.log("🔴 ERASER TOGGLE - Set isEraserMode to:", newEraserMode);
  };

  // Toggle furniture eraser mode
  const handleToggleFurnitureEraserMode = () => {
    const newFurnitureEraserMode = !isFurnitureEraserMode;

    // Disable other modes when enabling furniture eraser mode
    if (newFurnitureEraserMode) {
      setIsMeasureMode(false);
      setIsEraserMode(false);
    }

    toast({
      title: newFurnitureEraserMode ? "Furniture Eraser Enabled" : "Furniture Eraser Disabled",
      description: newFurnitureEraserMode
        ? "Click on furniture to delete it"
        : "Exited furniture eraser mode",
    });

    setIsFurnitureEraserMode(newFurnitureEraserMode);
  };

  // Handle view direction changes
  // Store the camera view change callback function provided by Canvas3D
  const [viewChangeFunction, setViewChangeFunction] = useState<
    ((direction: ViewDirection) => void) | null
  >(null);

  // This function receives the callback from Canvas3D
  // It will be passed to Canvas3D as the onViewChange prop
  const handleViewChange = (callback: (direction: ViewDirection) => void) => {

    setViewChangeFunction(() => callback);
  };

  // This function is called by the dropdown menu items
  const changeViewDirection = (direction: ViewDirection) => {
    console.log(`Changing view to: ${direction}`);

    // Rastrear cambios de dirección de vista
    trackEvent(
      AnalyticsCategories.UI,
      AnalyticsActions.TOGGLE_VIEW,
      `view_${direction}`,
    );

    if (viewChangeFunction) {
      viewChangeFunction(direction);
    } else {
      console.log("View change function not available yet");
    }
  };

  const handleDeleteAirEntryFrom3D = (floorName: string, index: number) => {
    // Create a copy of the floors data
    console.log(`Deleting air entry in floor ${floorName}, index ${index}`);

    // Use the store's setAirEntries function when updating the current floor
    if (floorName === currentFloor) {
      // Create a deep copy of the air entries array
      const updatedAirEntries = airEntries.filter((_, i) => i !== index);

      // Set the air entries with the filtered array
      setAirEntries(updatedAirEntries);

      // Also update the floors data to keep everything in sync
      const updatedFloors = { ...floors };
      if (updatedFloors[floorName]) {
        updatedFloors[floorName] = {
          ...updatedFloors[floorName],
          airEntries: [...updatedAirEntries],
        };
        // Update floor data in the store
        useRoomStore.getState().setFloors(updatedFloors);
      }

      toast({
        title: "Air Entry Deleted",
        description: `Deleted air entry from ${formatFloorText(floorName)}`,
      });
      return;
    }

    // For other floors, create a deep copy of the floors object
    const updatedFloors = { ...floors };

    // Check if the floor and its air entries exist
    if (updatedFloors[floorName]?.airEntries) {
      // Create a filtered copy of the air entries array
      const floorAirEntries = updatedFloors[floorName].airEntries.filter(
        (_, i) => i !== index,
      );

      // Create a copy of the floor data with the updated air entries
      updatedFloors[floorName] = {
        ...updatedFloors[floorName],
        airEntries: floorAirEntries,
      };

      // Update the room store with the updated floors data
      useRoomStore.getState().setFloors(updatedFloors);

      // Update the specific floor in the store
      useRoomStore.getState().updateFloor(floorName, updatedFloors[floorName]);

      toast({
        title: "Air Entry Deleted",
        description: `Deleted air entry from ${formatFloorText(floorName)}`,
      });
    }
  };

  const handleUpdateAirEntryFrom3D = (
    floorName: string,
    index: number,
    updatedEntry: AirEntry,
  ) => {

    
    // CRITICAL FIX: Preserve wallPosition from existing store data
    const existingEntry = airEntries[index];
    
    // Create merged entry preserving wallPosition
    const preservedDimensions = {
      ...updatedEntry.dimensions,
      // Preserve wallPosition from existing entry if Canvas3D didn't provide it
      wallPosition: updatedEntry.dimensions?.wallPosition ?? existingEntry?.dimensions?.wallPosition
    };
    
    // CRITICAL FIX: Preserve ID from existing entry if updatedEntry doesn't have one
    const preservedId = updatedEntry.id || existingEntry?.id;
    
    const deepClonedEntry = {
      ...JSON.parse(JSON.stringify(updatedEntry)),
      id: preservedId, // CRITICAL: Always ensure ID is preserved
      dimensions: preservedDimensions
    };

    // Use the store's setAirEntries function when updating the current floor
    if (floorName === currentFloor) {
      
      // Create a deep copy of the air entries array with structuredClone
      const updatedAirEntries = airEntries.map((entry, i) =>
        i === index ? deepClonedEntry : { ...entry },
      );

      // Set the air entries with the deep copy
      setAirEntries(updatedAirEntries);

      // Update store for synchronization with SILENT updateAirEntry (no cross-floor contamination)
      useRoomStore.getState().updateAirEntrySilent(floorName, index, deepClonedEntry);

      // Entry updated successfully

      toast({
        title: "Air Entry Updated",
        description: `Updated ${updatedEntry.type} in ${formatFloorText(floorName)}`,
      });
      return;
    }

    // For other floors, create a deep copy of the floors object
    const updatedFloors = { ...floors };

    // Check if the floor and its air entries exist
    if (updatedFloors[floorName]?.airEntries) {
      // Create a copy of the air entries array
      const floorAirEntries = [...updatedFloors[floorName].airEntries];

      // Log the floor air entries before updating
      console.log(
        "PARENT COMPONENT DEBUG - BEFORE UPDATE (NON-CURRENT FLOOR):",
        {
          floor: floorName,
          allEntries: floorAirEntries.map((entry, i) => ({
            index: i,
            type: entry.type,
            position: entry.position,
            isTargeted: i === index,
          })),
        },
      );

      // Create a deep clone of the updated entry to prevent reference issues
      const deepClonedEntry = JSON.parse(JSON.stringify(updatedEntry));

      // Update the specific air entry with deep cloned data
      floorAirEntries[index] = deepClonedEntry;

      // Log the floor air entries after updating
      console.log(
        "PARENT COMPONENT DEBUG - AFTER UPDATE (NON-CURRENT FLOOR):",
        {
          floor: floorName,
          allEntries: floorAirEntries.map((entry, i) => ({
            index: i,
            type: entry.type,
            position: entry.position,
            isUpdated: i === index,
          })),
        },
      );

      // Create a copy of the floor data with the updated air entries
      updatedFloors[floorName] = {
        ...updatedFloors[floorName],
        airEntries: floorAirEntries,
      };

      // Make sure we also update the "floors" state variable completely
      // to ensure it's consistent across the component
      useRoomStore.getState().setFloors(updatedFloors);

      // Update the room store with each floor's updated data
      Object.entries(updatedFloors).forEach(([floor, data]) => {
        if (floor !== currentFloor) {
          // For non-current floors, use store methods to update
          console.log(`Updating floor ${floor} in the store`);
          useRoomStore.getState().updateFloor(floor, data);
        }
      });

      toast({
        title: "Air Entry Updated",
        description: `Updated ${updatedEntry.type} in ${formatFloorText(floorName)}`,
      });
    }
  };

  // Real-time properties synchronization handler
  const handlePropertiesUpdateFrom3D = (
    floorName: string,
    index: number,
    properties: {
      state?: 'open' | 'closed';
      temperature?: number;
      airOrientation?: 'inflow' | 'outflow';
      flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
      flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
      customIntensityValue?: number;
      verticalAngle?: number;
      horizontalAngle?: number;
    }
  ) => {
    // 🧪 DIAGNOSIS LOG: Check if properties parameters arrive correctly from Canvas3D
    console.log("🧪 [DIAGNOSIS WIZARD] handlePropertiesUpdateFrom3D called with:", {
      receivedFloorName: floorName,
      receivedIndex: index,
      receivedProperties: properties,
      currentFloorInWizard: currentFloor,
      storeFloorExists: useRoomStore.getState().floors[floorName] ? true : false,
      storeEntryExists: useRoomStore.getState().floors[floorName]?.airEntries?.[index] ? true : false,
      timestamp: Date.now()
    });
    
    // Update only the properties in real-time without triggering scene rebuild
    const currentFloors = useRoomStore.getState().floors;
    const currentEntry = currentFloors[floorName]?.airEntries?.[index];
    
    if (currentEntry) {
      const updatedEntry = {
        ...currentEntry,
        properties: {
          ...currentEntry.properties,
          ...properties
        }
      };
      
      // Use SILENT updateAirEntry to avoid cross-floor contamination
      useRoomStore.getState().updateAirEntrySilent(floorName, index, updatedEntry);
    }
  };

  // Real-time dimensions synchronization handler (NEW - BASED ON POSITION ALONG WALL PATTERN)
  const handleDimensionsUpdateFrom3D = (
    floorName: string,
    index: number,
    dimensions: {
      distanceToFloor?: number;
      width?: number;
      height?: number;
    }
  ) => {
    // 🧪 DIAGNOSIS LOG: Check if dimensions parameters arrive correctly from Canvas3D
    console.log("🧪 [DIAGNOSIS WIZARD] handleDimensionsUpdateFrom3D called with:", {
      receivedFloorName: floorName,
      receivedIndex: index,
      receivedDimensions: dimensions,
      currentFloorInWizard: currentFloor,
      storeFloorExists: useRoomStore.getState().floors[floorName] ? true : false,
      storeEntryExists: useRoomStore.getState().floors[floorName]?.airEntries?.[index] ? true : false,
      timestamp: Date.now()
    });
    
    // Update dimensions in real-time following Position Along Wall successful architecture
    const currentFloors = useRoomStore.getState().floors;
    const currentEntry = currentFloors[floorName]?.airEntries?.[index];
    
    if (currentEntry) {
      const updatedEntry = {
        ...currentEntry,
        dimensions: {
          ...currentEntry.dimensions,
          ...dimensions
        }
      };
      
      // Use SILENT updateAirEntry to avoid cross-floor contamination
      useRoomStore.getState().updateAirEntrySilent(floorName, index, updatedEntry);
    }
  };

  // Phase 2: Furniture callback handlers
  const handleFurnitureAdd = useCallback((floorName: string, item: FurnitureItem) => {
    addFurnitureToFloor(floorName, item);
    
    toast({
      title: "Furniture Added",
      description: `Added ${item.type} to ${formatFloorText(floorName)}`,
    });
  }, [addFurnitureToFloor, toast]);

  const handleFurnitureUpdate = (floorName: string, itemId: string, item: FurnitureItem) => {
    console.log('[SCALE DEBUG 3.5] Store Update Callback - ID:', itemId);
    console.log('[SCALE DEBUG 3.5] Floor:', floorName);
    console.log('[SCALE DEBUG 3.5] Item scale being stored:', item.scale);
    console.log('🔍 [STORE RECEIVED] properties:', item.properties);
    console.log('🔍 [STORE RECEIVED] simulationProperties:', item.simulationProperties);
    
    updateFurnitureInFloor(floorName, itemId, item);
    
    // Verify the scale was stored correctly
    const updatedFloors = useRoomStore.getState().floors;
    const updatedItem = updatedFloors[floorName]?.furnitureItems?.find(f => f.id === itemId);
    console.log('[SCALE DEBUG 3.5] Verification - Scale in store after update:', updatedItem?.scale);
    
    toast({
      title: "Furniture Updated",
      description: `Updated ${item.type} in ${formatFloorText(floorName)}`,
    });
  };

  const handleFurnitureDelete = (floorName: string, itemId: string) => {
    deleteFurnitureFromFloor(floorName, itemId);
    toast({
      title: "Furniture Deleted",
      description: `Deleted furniture from ${formatFloorText(floorName)}`,
    });
  };

  const renderStepIndicator = () => (
    <div className="w-full">
      <div className="relative h-16 bg-muted/10 border rounded-lg">
        <div className="absolute inset-0 flex justify-between items-center px-8">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-[33%]">
            <div className="w-24 h-px bg-border" />
            <div className="w-24 h-px bg-border" />
          </div>

          {steps.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center cursor-pointer relative z-10 bg-muted/10 px-3"
              onClick={() => setStep(s.id)}
            >
              <div
                className={`text-sm ${step === s.id ? "text-primary font-medium" : "text-muted-foreground"}`}
              >
                Step {s.id} | {s.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep1 = () => (
    <>
      <Card className="mt-4">
        <CardContent className="p-4">
          <ToolbarToggle
            mode={tab}
            onModeChange={(value: "2d-editor" | "3d-preview") => {
              if (value === "3d-preview" && !hasClosedContour) {
                toast({
                  title: "Invalid Room Layout",
                  description:
                    "Please create a closed room contour before viewing in 3D",
                  variant: "destructive",
                });
                return;
              }
              setTab(value);
            }}
            hasClosedContour={hasClosedContour}
          />

          <div className="flex gap-4" style={{ height: `calc(100vh - ${viewportOffset}px)` }}>
            {/* Left side menus */}
            <div className="w-72 space-y-6 overflow-y-auto" style={{ height: `calc(100vh - ${viewportOffset}px)` }}>
              {/* 2D Configuration - only show when in 2D mode */}
              {tab === "2d-editor" && (
                <div className="border rounded-lg p-4">
                <h3 className="font-semibold text-xl mb-4 text-center">2D Configuration</h3>
                
                {/* Wall Design */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Wall Design</h3>
                  <div className="flex items-start gap-4">
                    {/* Wall Line Button */}
                    <Button
                      variant="outline"
                      className={getWallStyles()}
                      onClick={() => handleToolSelect("wall")}
                    >
                      <div className="w-6 h-6 border-2 border-gray-500" />
                      <span className="text-xs mt-1">Wall Line</span>
                    </Button>
                    
                    {/* Wall Temperature */}
                    <div className="space-y-2 flex-1">
                      <TooltipProvider>
                        <div className="flex items-center gap-1">
                          <Label htmlFor="default-wall-temp" className="text-sm font-medium">
                            Wall Temperature
                          </Label>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-gray-400" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-64">
                                Default temperature assigned to new walls when created. 
                                You can change individual wall temperatures by double-clicking on any wall.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                      <div className="flex items-center gap-2">
                        <Input
                          id="default-wall-temp"
                          type="number"
                          value={defaultWallTemperature}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value) && value >= -50 && value <= 100) {
                              setDefaultWallTemperature(value);
                            }
                          }}
                          className="w-20 h-8"
                          min={-50}
                          max={100}
                          step={0.5}
                          placeholder="20"
                        />
                        <span className="text-sm text-gray-500">°C</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mt-4">
                  <h3 className="font-semibold">Air Entries</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      className={getAirEntryStyles("window")}
                      onClick={() => handleAirEntrySelect("window")}
                    >
                      <div className="w-6 h-6 border-2 border-blue-500 grid grid-cols-2" />
                      <span className="text-xs mt-1">Window</span>
                    </Button>
                    <Button
                      variant="outline"
                      className={getAirEntryStyles("door")}
                      onClick={() => handleAirEntrySelect("door")}
                    >
                      <div className="w-6 h-6 border-2 border-amber-500" />
                      <span className="text-xs mt-1">Door</span>
                    </Button>
                    <Button
                      variant="outline"
                      className={getAirEntryStyles("vent")}
                      onClick={() => handleAirEntrySelect("vent")}
                    >
                      <div className="w-6 h-6 border-2 border-green-500 grid grid-cols-2 grid-rows-2" />
                      <span className="text-xs mt-1">Vent-Grid</span>
                    </Button>
                  </div>
                </div>

                {/* Stair Design - Moved from Parameters */}
                {isMultifloor && (
                  <div className="space-y-4 mt-4">
                    <h3 className="font-semibold">Stair Design</h3>
                    <div className="flex items-start gap-4">
                      {/* Stair Design Button */}
                      <Button
                        variant="outline"
                        className={getStairStyles()}
                        onClick={() => {
                          handleToolSelect("stairs");
                          if (currentTool !== "stairs") {
                            setTab("2d-editor");
                            toast({
                              title: "Stair Design Tool Activated",
                              description:
                                "Click on the canvas to place points and create a stair polygon. Close the shape by clicking near the first point.",
                            });
                          }
                        }}
                      >
                        <FileEdit className="w-6 h-6" />
                        <span className="text-xs mt-1">Stair Design</span>
                      </Button>
                      
                      {/* Stair Temperature */}
                      <div className="space-y-2 flex-1">
                        <TooltipProvider>
                          <div className="flex items-center gap-1">
                            <Label htmlFor="default-stair-temp" className="text-sm font-medium">
                              Stair Temperature
                            </Label>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-3 h-3 text-gray-400" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-64">
                                  Default temperature assigned to new stairs when created. 
                                  You can change individual stair temperatures by double-clicking on any stair.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                        <div className="flex items-center gap-2">
                          <Input
                            id="default-stair-temp"
                            type="number"
                            value={defaultStairTemperature}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              if (!isNaN(value) && value >= -50 && value <= 100) {
                                setDefaultStairTemperature(value);
                              }
                            }}
                            className="w-20 h-8"
                            min={-50}
                            max={100}
                            step={0.5}
                            placeholder="20"
                          />
                          <span className="text-sm text-gray-500">°C</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2D Tools Section */}
                <div className="space-y-4 mt-4">
                  <h3 className="font-semibold">2D Tools</h3>
                  <div className="flex gap-4 justify-center">
                    <Button
                      variant={currentTool === "eraser" ? "default" : "outline"}
                      className="w-20 h-16 flex flex-col items-center justify-center gap-1"
                      onClick={() => handleToolSelect("eraser")}
                    >
                      <Eraser className="w-6 h-6" />
                      <span className="text-xs">Eraser</span>
                    </Button>
                    <Button
                      variant={currentTool === "measure" ? "default" : "outline"}
                      className="w-20 h-16 flex flex-col items-center justify-center gap-1"
                      onClick={() => handleToolSelect("measure")}
                    >
                      <Ruler className="w-6 h-6" />
                      <span className="text-xs">Measure</span>
                    </Button>
                  </div>
                </div>

                {/* Floor Management - Parameters content moved here */}
                <div className="space-y-4 mt-4 pt-4 border-t">
                  <h3 className="font-semibold">Floor Management</h3>
                  <div className="space-y-4">
                    {isMultifloor && (
                      <div className={cn(
                        "space-y-4 pt-2",
                        tab !== "2d-editor" && "opacity-50 pointer-events-none"
                      )}>
                        <div className="space-y-2">
                          <Label>Current Floor</Label>
                          <Select 
                            value={currentFloor} 
                            onValueChange={tab === "2d-editor" ? handleFloorChange : undefined}
                            disabled={tab !== "2d-editor"}
                          >
                            <SelectTrigger 
                              className={cn(
                                tab !== "2d-editor" && "cursor-not-allowed"
                              )}
                              title={tab !== "2d-editor" ? "Floor management available only in 2D Editor" : undefined}
                            >
                              <SelectValue placeholder="Select floor" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ground">
                                {formatFloorText("ground")}
                              </SelectItem>
                              {floors.ground.hasClosedContour && (
                                <>
                                  <SelectItem value="first">
                                    {formatFloorText("first")}
                                  </SelectItem>
                                  {floors.first?.hasClosedContour && (
                                    <SelectItem value="second">
                                      {formatFloorText("second")}
                                    </SelectItem>
                                  )}
                                  {floors.second?.hasClosedContour && (
                                    <SelectItem value="third">
                                      {formatFloorText("third")}
                                    </SelectItem>
                                  )}
                                  {floors.third?.hasClosedContour && (
                                    <SelectItem value="fourth">
                                      {formatFloorText("fourth")}
                                    </SelectItem>
                                  )}
                                  {floors.fourth?.hasClosedContour && (
                                    <SelectItem value="fifth">
                                      {formatFloorText("fifth")}
                                    </SelectItem>
                                  )}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          {tab !== "2d-editor" && (
                            <p className="text-xs text-muted-foreground">
                              Switch to 2D Editor to manage floors
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Load from Floor</Label>
                          <div className="flex gap-2">
                            <Select 
                              value={loadFromFloor} 
                              onValueChange={tab === "2d-editor" ? setLoadFromFloor : undefined}
                              disabled={tab !== "2d-editor"}
                            >
                              <SelectTrigger 
                                className={cn(
                                  "flex-1",
                                  tab !== "2d-editor" && "cursor-not-allowed"
                                )}
                                title={tab !== "2d-editor" ? "Floor management available only in 2D Editor" : undefined}
                              >
                                <SelectValue placeholder="Select floor to load from" />
                              </SelectTrigger>
                              <SelectContent>
                                {(() => {
                                  // Define floor hierarchy order
                                  const floorOrder = ["ground", "first", "second", "third", "fourth", "fifth"];
                                  const currentFloorIndex = floorOrder.indexOf(currentFloor);
                                  
                                  // Filter to only show floors that are "below" current floor
                                  return Object.entries(floors)
                                    .filter(([floorName]) => {
                                      const floorIndex = floorOrder.indexOf(floorName);
                                      // Only include floors that are lower in hierarchy and exist
                                      return floorIndex !== -1 && floorIndex < currentFloorIndex;
                                    })
                                    .map(([floorName, floor]) => (
                                      <SelectItem key={floorName} value={floorName}>
                                        {formatFloorText(floorName)}
                                      </SelectItem>
                                    ));
                                })()}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={tab === "2d-editor" ? handleLoadTemplate : () => {
                                toast({
                                  title: "Feature Unavailable",
                                  description: "Floor management is available only in 2D Editor",
                                  variant: "destructive",
                                });
                              }}
                              disabled={tab !== "2d-editor"}
                              className={cn(
                                tab !== "2d-editor" && "cursor-not-allowed"
                              )}
                              title={tab !== "2d-editor" ? "Floor management available only in 2D Editor" : undefined}
                            >
                              Load
                            </Button>
                          </div>
                          {tab !== "2d-editor" && (
                            <p className="text-xs text-muted-foreground">
                              Switch to 2D Editor to load floor templates
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Ceiling Height y Floor Deck Parameters */}
                    <div className={cn(
                      "space-y-4 pt-4 border-t",
                      tab !== "2d-editor" && "opacity-50 pointer-events-none"
                    )}>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm text-gray-700">Building Parameters</h4>
                        {tab !== "2d-editor" && (
                          <span className="text-xs text-muted-foreground">(Available in 2D Editor)</span>
                        )}
                      </div>
                      
                      {!isMultifloor ? (
                        // Modo single floor: solo control de ceiling height
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="ceiling-height">Ceiling Height</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id="ceiling-height"
                                type="number"
                                value={ceilingHeight}
                                min={200}
                                max={500}
                                step={10}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value);
                                  if (!isNaN(value) && value >= 200 && value <= 500) {
                                    setCeilingHeight(value);
                                  }
                                }}
                                className="w-24"
                              />
                              <span className="text-sm text-gray-500">cm</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        // Modo multifloor: controles por planta
                        <div className="space-y-4">
                          {Object.keys(floors).filter(floorName => floors[floorName]?.hasClosedContour).map((floorName) => {
                            const floorParams = floorParameters[floorName] || { ceilingHeight: 220, floorDeck: 35, ceilingTemperature: 20, floorTemperature: 20 };
                            const isCurrentFloor = floorName === currentFloor;
                            
                            return (
                              <div 
                                key={floorName} 
                                className={cn(
                                  "p-3 rounded-lg border transition-all duration-200",
                                  isCurrentFloor 
                                    ? "bg-blue-50 border-blue-200 ring-2 ring-blue-200" 
                                    : "bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300",
                                  tab === "2d-editor" && !isCurrentFloor && "cursor-pointer",
                                  tab !== "2d-editor" && "cursor-not-allowed"
                                )}
                                onClick={
                                  tab === "2d-editor" && !isCurrentFloor
                                    ? () => handleFloorChange(floorName)
                                    : tab !== "2d-editor"
                                    ? () => {
                                        toast({
                                          title: "Feature Unavailable",
                                          description: "Floor navigation is available only in 2D Editor",
                                          variant: "destructive",
                                        });
                                      }
                                    : undefined
                                }
                                title={
                                  tab !== "2d-editor" 
                                    ? "Floor navigation available only in 2D Editor"
                                    : !isCurrentFloor 
                                    ? `Click to switch to ${formatFloorText(floorName)}`
                                    : `Currently viewing ${formatFloorText(floorName)}`
                                }
                              >
                                <h5 className="font-medium text-sm mb-3 flex items-center gap-2">
                                  {formatFloorText(floorName)}
                                  {isCurrentFloor && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Current</span>}
                                  {tab === "2d-editor" && !isCurrentFloor && (
                                    <span className="text-xs text-gray-500 ml-auto">Click to switch</span>
                                  )}
                                </h5>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Ceiling Height</Label>
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        value={floorParams.ceilingHeight}
                                        min={200}
                                        max={500}
                                        step={10}
                                        onChange={(e) => {
                                          const value = parseInt(e.target.value);
                                          if (!isNaN(value) && value >= 200 && value <= 500) {
                                            updateFloorParameter(floorName, 'ceilingHeight', value);
                                          }
                                        }}
                                        className="w-16 h-8 text-xs"
                                      />
                                      <span className="text-xs text-gray-500">cm</span>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Floor Deck</Label>
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        value={floorParams.floorDeck}
                                        min={5}
                                        max={150}
                                        step={5}
                                        onChange={(e) => {
                                          const value = parseInt(e.target.value);
                                          if (!isNaN(value) && value >= 5 && value <= 150) {
                                            updateFloorParameter(floorName, 'floorDeck', value);
                                          }
                                        }}
                                        className="w-16 h-8 text-xs"
                                      />
                                      <span className="text-xs text-gray-500">cm</span>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Ceiling Temperature</Label>
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        value={floorParams.ceilingTemperature || 20}
                                        min={-50}
                                        max={100}
                                        step={0.1}
                                        onChange={(e) => {
                                          const value = parseFloat(e.target.value);
                                          if (!isNaN(value) && value >= -50 && value <= 100) {
                                            updateFloorParameter(floorName, 'ceilingTemperature', value);
                                          }
                                        }}
                                        className="w-16 h-8 text-xs"
                                      />
                                      <span className="text-xs text-gray-500">°C</span>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Floor Temperature</Label>
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        value={floorParams.floorTemperature || 20}
                                        min={-50}
                                        max={100}
                                        step={0.1}
                                        onChange={(e) => {
                                          const value = parseFloat(e.target.value);
                                          if (!isNaN(value) && value >= -50 && value <= 100) {
                                            updateFloorParameter(floorName, 'floorTemperature', value);
                                          }
                                        }}
                                        className="w-16 h-8 text-xs"
                                      />
                                      <span className="text-xs text-gray-500">°C</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                </div>
              )}

              {/* 3D Configuration - only show when in 3D mode */}
              {tab === "3d-preview" && (
                <div className="border rounded-lg p-4">
                <h3 className="font-semibold text-xl mb-4 text-center">3D Configuration</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full h-16 flex flex-col items-center justify-center gap-1"
                        >
                          <Eye className="w-6 h-6" />
                          <span className="text-xs flex items-center">
                            View <ChevronDown className="h-3 w-3 ml-1" />
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onClick={() => changeViewDirection("+X")}
                        >
                          +X View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => changeViewDirection("-X")}
                        >
                          -X View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => changeViewDirection("+Y")}
                        >
                          +Y View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => changeViewDirection("-Y")}
                        >
                          -Y View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => changeViewDirection("+Z")}
                        >
                          +Z View (Top)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => changeViewDirection("-Z")}
                        >
                          -Z View (Bottom)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant={isEraserMode ? "default" : "outline"}
                      className="w-full h-16 flex flex-col items-center justify-center gap-1"
                      onClick={handleToggleEraserMode}
                    >
                      <Eraser className="w-6 h-6" />
                      <span className="text-xs">Eraser</span>
                    </Button>
                    <Button
                      variant={isMeasureMode ? "default" : "outline"}
                      className="w-full h-16 flex flex-col items-center justify-center gap-1"
                      onClick={handleToggleMeasureMode}
                    >
                      <Ruler className="w-6 h-6" />
                      <span className="text-xs">Measure</span>
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold">Wall Transparency</h3>
                    <div className="px-2">
                      <Slider
                        defaultValue={[20]}
                        max={100}
                        step={1}
                        onValueChange={(value: number[]) =>
                          setWallTransparency(value[0] / 100)
                        }
                      />
                      <div className="text-sm text-right mt-1">
                        {Math.round(wallTransparency * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Height parameters moved to Parameters section */}
                </div>
              </div>
              )}

              {renderFilesMenu()}
            </div>

            {/* Right side - Canvas */}
            {renderCanvasSection("tabs")}
          </div>
        </CardContent>
      </Card>
      <AirEntryDialog
        type={currentAirEntry || "window"}
        isOpen={isAirEntryDialogOpen}
        onClose={() => {
          setIsAirEntryDialogOpen(false);
          setSelectedLine(null);
        }}
        onConfirm={handleAirEntryDimensionsConfirm}
      />
    </>
  );

  const renderStep2 = () => {
    return (
      <>
        <Card className="mt-4">
          <CardContent className="p-4">


            <div className="flex gap-4" style={{ height: `calc(100vh - ${viewportOffset}px)` }}>
              {/* Left side menus - copy style from Step 1 */}
              <div className="w-72 space-y-6 overflow-y-auto" style={{ height: `calc(100vh - ${viewportOffset}px)` }}>
                {/* Main options */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-lg mb-4">3D Menu</h3>

                  {/* Wall Transparency */}
                  <div className="space-y-4 mt-4">
                    <h3 className="font-semibold">Wall Transparency</h3>
                    <div className="px-2">
                      <Slider
                        value={[wallTransparency]}
                        onValueChange={(values: number[]) => {
                          console.log(
                            "Wizard: Wall transparency changing to:",
                            values[0],
                          );
                          setWallTransparency(values[0]);
                        }}
                        min={0}
                        max={1}
                        step={0.01}
                        className="flex-1"
                      />
                      <div className="text-sm text-right mt-1">
                        {Math.round(wallTransparency * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Air Entry Transparency */}
                  <div className="space-y-4 mt-4">
                    <h3 className="font-semibold">Doors/Windows/Vents Transparency</h3>
                    <div className="px-2">
                      <Slider
                        value={[airEntryTransparency]}
                        onValueChange={(values: number[]) => {
                          console.log(
                            "Wizard: Air entry transparency changing to:",
                            values[0],
                          );
                          setAirEntryTransparency(values[0]);
                        }}
                        min={0}
                        max={1}
                        step={0.01}
                        className="flex-1"
                      />
                      <div className="text-sm text-right mt-1">
                        {Math.round(airEntryTransparency * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Furniture - Using FurnitureMenu component */}
                  <FurnitureMenu 
                    onDragStart={(item) => {
                      // Handle drag start if needed
                      console.log("Dragging furniture:", item);
                    }}
                    wallTransparency={wallTransparency}
                    onWallTransparencyChange={setWallTransparency}
                    floorContext={{
                      currentFloor: currentFloor,
                      floors: floors
                    }}
                  />
                </div>

                {/* Files section - unified */}
                {renderFilesMenu()}
                </div>

            {/* Main content area - using the same renderCanvasSection as 3D preview for consistency */}
            {renderCanvasSection("step2")}
          </div>
          </CardContent>
        </Card>
      </>
    );
  };

  const renderStep3 = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Choose Your Simulation Package</CardTitle>
          <CardDescription>
            Select the package that best fits your needs
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Basic</CardTitle>
              <CardDescription>For simple room simulations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€49</div>
              <ul className="mt-4 space-y-2 text-sm">
                <li>• Basic airflow simulation</li>
                <li>• Temperature distribution</li>
                <li>• Single room analysis</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Professional</CardTitle>
              <CardDescription>For detailed analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€99</div>
              <ul className="mt-4 space-y-2 text-sm">
                <li>• Advanced CFD simulation</li>
                <li>• Multi-room analysis</li>
                <li>• Detailed reports</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Enterprise</CardTitle>
              <CardDescription>For complex projects</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€199</div>
              <ul className="mt-4 space-y-2 text-sm">
                <li>• Full building simulation</li>
                <li>• Custom parameters</li>
                <li>• Priority support</li>
              </ul>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <AlertDialog
        open={showStartSimulationPrompt}
        onOpenChange={setShowStartSimulationPrompt}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start New Simulation?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an existing room in the WizardDesign. Starting a new
              simulation will clear your current design. Are you sure you want
              to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleReturnToWizard}>
              Return to WizardDesign
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmNewSimulation}>
              New Design
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  const isInClosedContour = (point: Point, lines: Line[]): boolean => {
    const arePointsEqual = (p1: Point, p2: Point): boolean => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy) < 5;
    };

    const connectedLines = lines.filter(
      (line) =>
        arePointsEqual(line.start, point) || arePointsEqual(line.end, point),
    );

    for (const startLine of connectedLines) {
      const visited = new Set<string>();
      const pointKey = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
      const stack: { point: Point; path: Line[] }[] = [
        {
          point: arePointsEqual(startLine.start, point)
            ? startLine.end
            : startLine.start,
          path: [startLine],
        },
      ];

      while (stack.length > 0) {
        const { point: currentPoint, path } = stack.pop()!;
        const key = pointKey(currentPoint);

        if (path.length >= 2 && arePointsEqual(currentPoint, point)) {
          //  console.log("Found closed contour:", path);
          return true;
        }

        if (visited.has(key)) continue;
        visited.add(key);

        const nextLines = lines.filter(
          (line) =>
            !path.includes(line) &&
            (arePointsEqual(line.start, currentPoint) ||
              arePointsEqual(line.end, currentPoint)),
        );

        for (const nextLine of nextLines) {
          const nextPoint = arePointsEqual(nextLine.start, currentPoint)
            ? nextLine.end
            : nextLine.start;
          stack.push({
            point: nextPoint,
            path: [...path, nextLine],
          });
        }
      }
    }

    return false;
  };

  const findConnectedLines = (point: Point, lines: Line[]): Line[] => {
    return lines.filter(
      (line) =>
        arePointsClose(line.start, point) || arePointsClose(line.end, point),
    );
  };

  const arePointsClose = (p1: Point, p2: Point): boolean => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) < 15;
  };

  // Función central que genera los datos de simulación
  const generateSimulationDataForExport = () => {
    // Recopilar datos de mobiliario desde el store de pisos
    const furnitureObjects: THREE.Object3D[] = [];



    // Recopilar todos los elementos de mobiliario de todos los pisos
    // CRITICAL FIX: Use rawFloors for export to get original scale values
    Object.entries(rawFloors).forEach(([floorName, floorData]) => {

      
      if (floorData.furnitureItems && floorData.furnitureItems.length > 0) {
        floorData.furnitureItems.forEach((furnitureItem) => {
          
          // Crear un objeto THREE.Object3D simulado con la información necesaria
          const mockObject3D = {
            userData: {
              id: furnitureItem.id,
              type: 'furniture',
              furnitureType: furnitureItem.type,
              floor: floorName,
              floorName: floorName,
              surfaceType: furnitureItem.surfaceType, // Include surface type for accurate export classification
              properties: furnitureItem.properties, // Include thermal properties for JSON export
              simulationProperties: furnitureItem.simulationProperties, // Include simulation properties for JSON export
              filePath: furnitureItem.filePath // Include STL file path for custom objects
            },
            position: {
              x: furnitureItem.position.x,
              y: furnitureItem.position.y,
              z: furnitureItem.position.z
            },
            rotation: {
              x: furnitureItem.rotation.x || 0,
              y: furnitureItem.rotation.y || 0,
              z: furnitureItem.rotation.z || 0
            },
            scale: {
              x: furnitureItem.scale?.x || 1,
              y: furnitureItem.scale?.y || 1,
              z: furnitureItem.scale?.z || 1
            }
          };
          
          console.log('[SCALE DEBUG 4] Mock object scale:', mockObject3D.scale);
          furnitureObjects.push(mockObject3D as any);
        });
      }
    });



    // Generar los datos de simulación completos
    // CRITICAL FIX: Use rawFloors for simulation data generation to preserve original scale values
    return generateSimulationData(
      rawFloors,
      furnitureObjects,
      getCurrentCeilingHeight() / 100,
      floorParameters
    );
  };

  // Función para mostrar el diálogo con los datos de simulación
  const handleStartSimulation = () => {
    const exportData = generateSimulationDataForExport();

    // Rastrear evento de inicio de simulación
    trackEvent(
      AnalyticsCategories.SIMULATION,
      AnalyticsActions.START_SIMULATION,
      "wizard_button",
      Object.keys(exportData).length,
    );

    // Guardar los datos para mostrarlos en el diálogo
    setSimulationData(exportData);

    // Mostrar el diálogo con los datos para copiar/exportar
    setShowSimulationDataDialog(true);
  };

  // Función para guardar el diseño localmente como archivo JSON
  const handleSaveDesign = () => {
    const exportData = generateSimulationDataForExport();

    // Rastrear evento de guardar simulación
    trackEvent(
      AnalyticsCategories.SIMULATION,
      AnalyticsActions.SAVE_SIMULATION,
      "file_download",
      Object.keys(exportData).length,
    );

    // Crear un nombre de archivo que incluya el nombre de la simulación seguido de "_FlowDeskModel"
    const baseName = simulationName
      ? `${simulationName.replace(/[^\w-]/g, "_")}_FlowDeskModel`
      : "FlowDeskModel";

    const filename = `${baseName}.json`;

    // Crear y descargar el archivo
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Diseño guardado",
      description: `El diseño ha sido exportado como ${filename}`,
    });
  };

  const handleEraseDesign = () => {
    // PASO 1: LIMPIAR PRIMERO floorParameters para evitar recreación de plantas
    setFloorParameters({
      ground: { ceilingHeight: 220, floorDeck: 35, ceilingTemperature: 20, floorTemperature: 20 }
    });
    
    // Clear all furniture from 3D scene BEFORE resetting store to avoid useEffect interference
    if (wizardSceneRef.current) {
      const furnitureObjectsToRemove: THREE.Object3D[] = [];
      
      // Scan scene for furniture objects
      wizardSceneRef.current.traverse((object) => {
        if (object.userData?.type === 'furniture') {
          furnitureObjectsToRemove.push(object);
        }
      });
      
      // Remove each furniture object with proper cleanup
      furnitureObjectsToRemove.forEach((furnitureGroup) => {
        
        // Special cleanup for vents with special rendering properties
        if (furnitureGroup.userData.furnitureType === 'vent') {
          furnitureGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              // Dispose geometry and material to clear WebGL state
              if (child.geometry) {
                child.geometry.dispose();
              }
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(material => material.dispose());
                } else {
                  child.material.dispose();
                }
              }
            }
          });
        }
        
        // Remove furniture object from scene
        wizardSceneRef.current.remove(furnitureGroup);
      });
    }
    
    // Reset the store (this will trigger Canvas3D useEffect but furniture already removed)
    storeReset();
    
    // Clear all custom furniture definitions
    customFurnitureStore.clearAllDefinitions();
    
    // PASO 5: CRÍTICO - Sincronizar currentFloor del store con ground
    setCurrentFloor("ground");
    
    // PASO 6: Mantener multifloor SIEMPRE activo (ya no es parámetro de usuario)
    setIsMultifloor(true);
    setSelectedFloor("ground");
    setLoadFromFloor("ground");
    
    // PASO 7: Resetear todos los estados locales del wizard
    setSimulationName("");
    setSimulationType("comfort");
    setGridSize(20);
    setCurrentTool("wall");
    setCurrentAirEntry(null);
    setSelectedLine(null);
    setClickedPoint(null);
    setTab("2d-editor");
    setShowStartSimulationPrompt(false);
    setWallTransparency(0.2);
    setCeilingHeight(220);
    setFloorDeckThickness(35);
    
    // PASO 8: Limpiar mediciones y escalones locales
    setMeasurements([]);
    setStairPolygons([]);
    
    // PASO 9: Cerrar el diálogo
    setShowEraseDesignDialog(false);
    
    // PASO 7: Mostrar mensaje de confirmación
    toast({
      title: "Diseño borrado",
      description: "Se ha iniciado un nuevo diseño desde cero",
    });

    // PASO 8: Rastrear evento de borrar diseño
    trackEvent(
      AnalyticsCategories.SIMULATION,
      AnalyticsActions.SAVE_SIMULATION,
      "design_erased",
      1,
    );
  };

  // Función para manejar la carga de un diseño desde JSON
  const handleLoadDesign = (designData: any) => {
    try {
      // Primero limpiar el estado actual
      reset();
      
      // Convertir datos del JSON al formato interno
      const convertedFloors: Record<string, any> = {};
      const newFloorParameters: Record<string, { ceilingHeight: number; floorDeck: number; ceilingTemperature?: number; floorTemperature?: number }> = {};
      
      // Convertir plantas numeradas de vuelta a nombres
      const floorNameMap: Record<string, string> = {
        '0': 'ground',
        '1': 'first', 
        '2': 'second',
        '3': 'third'
      };
      
      Object.entries(designData.floors).forEach(([floorNumber, floorData]: [string, any]) => {
        const floorName = floorNameMap[floorNumber] || `floor_${floorNumber}`;
        
        // Convertir coordenadas del JSON de vuelta al sistema interno usando denormalizeCoordinates
        const convertedLines = floorData.walls.map((wall: any) => ({
          start: denormalizeCoordinates({ x: wall.start.x, y: wall.start.y }),
          end: denormalizeCoordinates({ x: wall.end.x, y: wall.end.y })
        }));
        
        const convertedAirEntries = floorData.airEntries.map((entry: any) => {
          const denormalizedPosition = denormalizeCoordinates({ x: entry.position.x, y: entry.position.y });
          return {
            type: entry.type,
            position: denormalizedPosition,
            dimensions: {
              width: entry.size.width / 1.25, // Convertir de cm a píxeles
              height: entry.size.height / 1.25,
              distanceToFloor: entry.position.z / 1.25
            },
            line: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } } // Se calculará automáticamente
          };
        });
        
        const convertedStairs = (floorData.stairs || []).map((stair: any) => ({
          id: stair.id,
          points: stair.points.map((p: any) => denormalizeCoordinates({ x: p.x, y: p.y })),
          floor: floorName,
          direction: stair.direction,
          connectsTo: stair.connectsTo,
          isImported: !!stair.connectsTo
        }));
        
        convertedFloors[floorName] = {
          lines: convertedLines,
          airEntries: convertedAirEntries,
          hasClosedContour: convertedLines.length > 2,
          name: floorName,
          stairPolygons: convertedStairs
        };
        
        // Configurar parámetros del piso
        newFloorParameters[floorName] = {
          ceilingHeight: (floorData.height || 2.2) * 100, // Convertir metros a cm
          floorDeck: (floorData.floorDeck || 0) * 100, // Convertir metros a cm
          ceilingTemperature: floorData.ceilingTemperature || 20, // Default 20°C
          floorTemperature: floorData.floorTemperature || 20 // Default 20°C
        };
      });
      
      // Actualizar el estado con los datos convertidos
      setFloorParameters(newFloorParameters);
      
      // Cargar datos en el store
      Object.entries(convertedFloors).forEach(([floorName, floorData]) => {
        // Primero agregar el piso vacío
        addFloor(floorName);
        
        // Luego cargar los datos específicos del piso
        setCurrentFloor(floorName);
        setLines(floorData.lines);
        setAirEntries(floorData.airEntries);
        setStairPolygons(floorData.stairPolygons || []);
        setHasClosedContour(floorData.hasClosedContour);
        
        // Sincronizar las paredes
        syncWallsForCurrentFloor();
      });
      
      // Configurar el estado adicional
      if (Object.keys(convertedFloors).length > 1) {
        setIsMultifloor(true);
      }
      
      // Cambiar al primer piso disponible
      const firstFloor = Object.keys(convertedFloors)[0];
      if (firstFloor) {
        setCurrentFloor(firstFloor);
      }
      
      toast({
        title: "Diseño cargado exitosamente",
        description: `Se cargaron ${Object.keys(convertedFloors).length} plantas`,
      });
      
      // Rastrear evento
      trackEvent(
        AnalyticsCategories.SIMULATION,
        AnalyticsActions.START_SIMULATION,
        "design_loaded",
        Object.keys(convertedFloors).length,
      );
      
    } catch (error) {
      console.error("Error cargando diseño:", error);
      toast({
        title: "Error al cargar diseño",
        description: "Ha ocurrido un error al procesar el archivo",
        variant: "destructive",
      });
    }
  };

  const handleConfirmNewSimulation = () => {
    reset();
    setShowStartSimulationPrompt(false);
    setLocation("/dashboard/wizard-design");
  };

  const handleReturnToWizard = () => {
    setShowStartSimulationPrompt(false);
  };

  const reset = () => {
    setLines([]);
    setAirEntries([]);
    setMeasurements([]);
    setStairPolygons([]);
    setHasClosedContour(false);
    setSimulationName("");
    setGridSize(20);
    setCurrentTool("wall");
    setCurrentAirEntry(null);
    setSelectedLine(null);
    setClickedPoint(null);
    setTab("2d-editor");
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const renderFilesMenu = () => (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold text-lg mb-4">Files</h3>
      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleSaveDesign}
        >
          <Save className="mr-2 h-4 w-4" />
          Save Design
        </Button>
        <Button 
          variant="outline" 
          className="w-full justify-start"
          onClick={() => setShowLoadDesignDialog(true)}
        >
          <Upload className="mr-2 h-4 w-4" />
          Load Design
        </Button>
        <Button 
          variant="destructive" 
          className="w-full justify-start"
          onClick={() => setShowEraseDesignDialog(true)}
        >
          <Eraser className="mr-2 h-4 w-4" />
          Erase Design
        </Button>
      </div>
    </div>
  );



  const renderCanvasSection = (mode = "tabs") => {
    return (
      <div className="border rounded-lg overflow-hidden bg-white min-w-[600px]" style={{ height: `calc(100vh - ${viewportOffset}px)`, flex: 1 }}>
        <SceneProvider>
          {mode === "step2" ? (
            <RoomSketchPro
              key={`step2-view-${currentFloor}`} // Add the currentFloor to the key to force re-render on floor change
              instanceId="step2-view"
              lines={floors[currentFloor]?.lines || lines} // Use the floor-specific lines directly
              airEntries={rawFloors[currentFloor]?.airEntries || airEntries} // Use rawFloors for real-time updates
              wallTransparency={wallTransparency}
              airEntryTransparency={airEntryTransparency}
              roomHeight={getCurrentCeilingHeight()}
              currentFloor={currentFloor} // Pass the current floor explicitly
              floors={floors} // Pass the entire floors object directly
              isMultifloor={isMultifloor}
              floorParameters={floorParameters}
              onWallTransparencyChange={(value) => {
                setWallTransparency(value);
              }}
              onAirEntryTransparencyChange={(value) => {
                setAirEntryTransparency(value);
              }}
              onFurnitureAdd={handleFurnitureAdd}
              onUpdateFurniture={handleFurnitureUpdate}
              onDeleteFurniture={handleFurnitureDelete}
              onUpdateAirEntry={handleUpdateAirEntryFrom3D} // CRITICAL: Connect RSP to store sync
              isFurnitureEraserMode={isFurnitureEraserMode}
              onToggleFurnitureEraserMode={handleToggleFurnitureEraserMode}
              // Add onFloorsUpdate callback to enable 2D vent real-time updates in RSP
              onFloorsUpdate={(updatedFloors) => {
                useRoomStore.getState().setFloors(updatedFloors);
              }}
              // Pass wizard scene callback to RoomSketchPro for proper scene reference
              onWizardSceneReady={(scene) => {
                wizardSceneRef.current = scene;
              }}
              // Real-time update callbacks for RSP synchronization
              onPositionUpdate={(floorName, index, position) => {
                // Use the same handler as Canvas3D for consistency
                handleUpdateAirEntryFrom3D(floorName, index, { position });
              }}
              onDimensionsUpdate={(floorName, index, dimensions) => {
                // Use the dimensions update handler for real-time updates
                handleDimensionsUpdateFrom3D(floorName, index, dimensions);
              }}
              onPropertiesUpdate={(floorName, index, properties) => {
                // Use the properties update handler for real-time updates
                handlePropertiesUpdateFrom3D(floorName, index, properties);
              }}
            />
          ) : tab === "2d-editor" ? (
            <Canvas2D
              gridSize={gridSize}
              currentTool={currentTool}
              currentAirEntry={currentAirEntry}
              airEntries={(() => {
                // SOLUTION: Read directly from reactive store instead of rawFloors
                const storeFloors = useRoomStore.getState().floors;
                const storeAirEntries = storeFloors[currentFloor]?.airEntries || [];
                const fallbackAirEntries = rawFloors[currentFloor]?.airEntries || airEntries;
                
                // Use store data if available, fallback to rawFloors
                const finalAirEntries = storeAirEntries.length > 0 ? storeAirEntries : fallbackAirEntries;
                
                // Canvas2D uses reactive store data for real-time synchronization
                return finalAirEntries;
              })()}
              measurements={measurements}
              stairPolygons={stairPolygons}
              walls={walls}
              onMeasurementsUpdate={setMeasurements}
              onStairPolygonsUpdate={(newPolygons) => {
                setStairPolygons(newPolygons);
              }}
              onWallsUpdate={setWalls}
              lines={lines}
              floorText={formatFloorText(currentFloor)}
              currentFloor={currentFloor}
              isMultifloor={isMultifloor}
              ceilingHeight={isMultifloor ? (floorParameters[currentFloor]?.ceilingHeight || 220) / 100 : ceilingHeight / 100}
              defaultWallTemperature={defaultWallTemperature}
              defaultStairTemperature={defaultStairTemperature}
              onLinesUpdate={(newLines) => {
                setLines(newLines);
                const hasClosedContour =
                  newLines.length > 0 &&
                  newLines.some(
                    (line) =>
                      isInClosedContour(line.start, newLines) ||
                      isInClosedContour(line.end, newLines),
                  );
                setHasClosedContour(hasClosedContour);
              }}
              onAirEntriesUpdate={(newAirEntries) => {
                // Update both local state and floors store to ensure consistency
                setAirEntries(newAirEntries);
                
                // Also update the floors store so Canvas2D receives updated data immediately
                const updatedFloors = { ...floors };
                if (!updatedFloors[currentFloor]) {
                  updatedFloors[currentFloor] = { airEntries: [], lines: [], measurements: [], stairPolygons: [], walls: [] };
                }
                updatedFloors[currentFloor] = {
                  ...updatedFloors[currentFloor],
                  airEntries: newAirEntries
                };
                
                // Update the store immediately for real-time propagation
                useRoomStore.getState().setFloors(updatedFloors);
              }}
              onLineSelect={handleLineSelect}
              onPropertiesUpdate={handlePropertiesUpdateFrom3D}
              onDimensionsUpdate={handleDimensionsUpdateFrom3D} // NEW: Center Height real-time callback
            />
          ) : (
            <Canvas3D
              key={canvas3DKey}
              floors={floors}
              currentFloor={currentFloor}
              ceilingHeight={ceilingHeight}
              floorDeckThickness={floorDeckThickness}
              isMultifloor={isMultifloor}
              floorParameters={floorParameters}
              wallTransparency={wallTransparency}
              isMeasureMode={isMeasureMode}
              isEraserMode={isEraserMode}
              walls={walls} // Phase 1: Pass walls for AirEntry dialog unification
              simulationName={simulationName}
              simulationType={
                simulationType === "comfort"
                  ? "Ensure Thermal Comfort (Steady Equilibrium Simulation)"
                  : "Thermal Comfort + Air Renovation (Transient Simulation)"
              }
              onUpdateAirEntry={handleUpdateAirEntryFrom3D}
              onDeleteAirEntry={handleDeleteAirEntryFrom3D}
              onPropertiesUpdate={handlePropertiesUpdateFrom3D}
              onDimensionsUpdate={handleDimensionsUpdateFrom3D}
              onViewChange={handleViewChange}
              onSceneReady={(scene, renderer, camera) => {
                wizardSceneRef.current = scene;
              }}
              onFurnitureAdd={handleFurnitureAdd}
              onUpdateFurniture={handleFurnitureUpdate}
              onFurnitureDelete={handleFurnitureDelete}
            />
          )}
        </SceneProvider>
      </div>
    );
  };

  // Shared simulation info component used across all steps - always editable
  const renderSimulationInfo = () => (
    <div className="max-w-xl space-y-4 mb-6">
      <div>
        <Label htmlFor="simulation-name">Simulation name</Label>
        <Input
          id="simulation-name"
          value={simulationName}
          onChange={(e) => setSimulationName(e.target.value)}
          placeholder="Enter simulation name"
        />
      </div>
      <div>
        <Label htmlFor="simulation-type">Simulation type</Label>
        <Select value={simulationType} onValueChange={setSimulationType}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select simulation type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comfort">
              Ensure Thermal Comfort (Steady Equilibrium Simulation)
            </SelectItem>
            <SelectItem value="renovation">
              Thermal Comfort + Air Renovation (Transient Simulation)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="container mx-auto py-4 px-3 space-y-4">
        {renderStepIndicator()}
        {/* Display simulation info at the top for all steps */}
        {renderSimulationInfo()}
        <div className="min-h-[690px]">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
        <div className="flex justify-end gap-2 pt-6 mt-6 border-t">
          {step > 1 && (
            <Button onClick={handleBack} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleStartSimulation}>Start Simulation</Button>
          )}
        </div>
      </div>

      <FloorLoadDialog
        isOpen={isFloorLoadDialogOpen}
        onClose={() => setIsFloorLoadDialogOpen(false)}
        onConfirm={performFloorLoad}
        sourceFloor={loadFromFloor}
        targetFloor={currentFloor}
        hasContent={
          floors[currentFloor]?.lines.length > 0 ||
          floors[currentFloor]?.airEntries.length > 0
        }
        hasStairs={
          floors[loadFromFloor]?.stairPolygons?.some((stair) => {
            const connectsToTargetFloor =
              (stair.direction === "up" &&
                getConnectedFloorName(loadFromFloor, "up") === currentFloor) ||
              (stair.direction === "down" &&
                getConnectedFloorName(loadFromFloor, "down") === currentFloor);

            return connectsToTargetFloor;
          }) || false
        }
      />

      {/* Diálogo para mostrar los datos de simulación */}
      <SimulationDataDialog
        open={showSimulationDataDialog}
        onOpenChange={setShowSimulationDataDialog}
        simulationData={simulationData}
      />

      {/* Diálogo para cargar diseño */}
      <LoadDesignDialog
        isOpen={showLoadDesignDialog}
        onClose={() => setShowLoadDesignDialog(false)}
        onLoad={handleLoadDesign}
      />

      {/* Diálogo de confirmación para borrar el diseño */}
      <AlertDialog open={showEraseDesignDialog} onOpenChange={setShowEraseDesignDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erase Current Design?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <div>This action will permanently delete all current design data including walls, air entries, stairs, measurements, and multi-floor configurations.</div>
                <div className="mt-2">This action cannot be undone. Are you sure you want to continue?</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleEraseDesign}
              className="bg-red-600 hover:bg-red-700"
            >
              Yes, erase design
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
