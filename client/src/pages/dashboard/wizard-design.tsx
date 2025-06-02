import { useState, useEffect, useCallback } from "react";
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
          <AlertDialogDescription className="space-y-4">
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
  const [step, setStep] = useState(1);
  const [simulationName, setSimulationName] = useState("");
  const [simulationType, setSimulationType] = useState("comfort");
  const [gridSize, setGridSize] = useState(20);
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
  
  // Nuevos estados para parámetros por planta
  const [floorParameters, setFloorParameters] = useState<Record<string, { ceilingHeight: number; floorDeck: number }>>({
    ground: { ceilingHeight: 220, floorDeck: 35 }
  });

  // Funciones auxiliares para manejo de parámetros por planta
  const getCurrentFloorParameters = () => {
    return floorParameters[selectedFloor] || { ceilingHeight: 220, floorDeck: 35 };
  };

  const updateFloorParameter = (floor: string, parameter: 'ceilingHeight' | 'floorDeck', value: number) => {
    setFloorParameters(prev => ({
      ...prev,
      [floor]: {
        ...prev[floor] || { ceilingHeight: 220, floorDeck: 35 },
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

  // Estado para el diálogo de datos de simulación
  const [showSimulationDataDialog, setShowSimulationDataDialog] =
    useState(false);
  const [simulationData, setSimulationData] = useState<object>({});

  // Estado para el diálogo de carga de diseño
  const [showLoadDesignDialog, setShowLoadDesignDialog] = useState(false);

  // Use the global room store with updated selectors
  const {
    floors,
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
  } = useRoomStore();

  // Get current floor data
  const currentFloorData = floors[currentFloor];
  const { lines, airEntries, walls, measurements, hasClosedContour, stairPolygons, furnitureItems } =
    currentFloorData;

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
  const regenerateAirEntryIds = (airEntries: AirEntry[], floor: string) => {
    // Get floor prefix same as walls
    const floorPrefix = floor === 'ground' ? '0F' : 
                       floor === 'first' ? '1F' :
                       floor === 'second' ? '2F' :
                       floor === 'third' ? '3F' :
                       floor === 'fourth' ? '4F' :
                       floor === 'fifth' ? '5F' : '0F';
    
    // Get existing air entries in target floor to avoid ID conflicts
    const existingEntries = floors[currentFloor]?.airEntries || [];
    const typeCounters = { window: 1, door: 1, vent: 1 };
    
    // Count existing entries to start numbering from the next available number
    existingEntries.forEach(entry => {
      const anyEntry = entry as any;
      if (anyEntry.id) {
        // Updated regex to match new format: window_0F_1, door_1F_2, etc.
        const match = anyEntry.id.match(new RegExp(`^(window|door|vent)_${floorPrefix}_(\\d+)$`));
        if (match) {
          const type = match[1] as keyof typeof typeCounters;
          const num = parseInt(match[2]);
          if (typeCounters[type] <= num) {
            typeCounters[type] = num + 1;
          }
        }
      }
    });
    
    return airEntries.map(entry => ({
      ...entry,
      id: `${entry.type}_${floorPrefix}_${typeCounters[entry.type]++}`
    } as any));
  };

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

    // Begin by looking at the source floor data
    const sourceFloorData = floors[loadFromFloor];
    const targetFloorData = floors[currentFloor] || {
      lines: [],
      airEntries: [],
      walls: [],
      measurements: [],
      stairPolygons: [],
      hasClosedContour: false,
    };

    // Regenerate IDs for all copied elements
    const newLines = regenerateLineIds([...sourceFloorData.lines]);
    const newAirEntries = regenerateAirEntryIds([...sourceFloorData.airEntries], currentFloor);
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

    // Process stairs from source floor
    if (
      sourceFloorData.stairPolygons &&
      sourceFloorData.stairPolygons.length > 0
    ) {
      sourceFloorData.stairPolygons.forEach((stair) => {
        // Determine if this stair connects to our target floor
        const connectsToTargetFloor =
          (stair.direction === "up" &&
            getConnectedFloorName(loadFromFloor, "up") === currentFloor) ||
          (stair.direction === "down" &&
            getConnectedFloorName(loadFromFloor, "down") === currentFloor);

        // If this stair connects to our target floor, create a corresponding stair
        if (connectsToTargetFloor) {
          // Create a new stair for the target floor, inverting the direction
          const newDirection = stair.direction === "up" ? "down" : "up";

          // Check if this stair already exists in the target floor
          const existingStairIndex = newStairPolygons.findIndex(
            (s) => s.connectsTo === stair.id || s.id === stair.connectsTo,
          );

          if (existingStairIndex === -1) {
            // Create a new corresponding stair
            const newStair: StairPolygon = {
              id: `imported-${stair.id}`, // Create a new ID for the imported stair
              points: [...stair.points], // Copy points
              floor: currentFloor, // Set floor to current floor
              direction: newDirection as "up" | "down", // Invert direction with proper typing
              connectsTo: stair.id, // Link to the original stair
              isImported: true, // Mark as imported
            };

            newStairPolygons.push(newStair);
          }
        }
      });
    }

    // Set new data for the current floor
    setLines(newLines);
    setAirEntries(newAirEntries);
    setWalls(newWalls);
    setMeasurements(newMeasurements);
    setStairPolygons(newStairPolygons);
    setHasClosedContour(sourceFloorData.hasClosedContour);

    toast({
      title: "Floor Template Loaded",
      description: `Successfully loaded ${formatFloorText(loadFromFloor)} as template for ${formatFloorText(currentFloor)}`,
    });
  };

  // Handle floor selection change
  const handleFloorChange = (floorName: string) => {
    if (!floors[floorName]) {
      // Initialize the new floor with an empty state
      addFloor(floorName);
    }
    setCurrentFloor(floorName);
    setSelectedFloor(floorName);
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

  const handleGridSizeChange = (value: number[]) => {
    setGridSize(value[0]);
  };

  const gridSizeToCm = (pixels: number): number => {
    return pixels * (25 / 20);
  };

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

    setCurrentTool(tool);
    setCurrentAirEntry(null);
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
      "h-16 p-2 flex flex-col items-center justify-center transition-all duration-200 shadow-sm";
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

      // Generar ID único para el nuevo elemento con formato de piso
      const floorPrefix = currentFloor === 'ground' ? '0F' : 
                         currentFloor === 'first' ? '1F' :
                         currentFloor === 'second' ? '2F' :
                         currentFloor === 'third' ? '3F' :
                         currentFloor === 'fourth' ? '4F' :
                         currentFloor === 'fifth' ? '5F' : '0F';
      
      const existingEntries = airEntries || [];
      const typeCounters = { window: 1, door: 1, vent: 1 };
      
      // Contar elementos existentes del mismo tipo en el piso actual
      existingEntries.forEach(entry => {
        const anyEntry = entry as any;
        if (anyEntry.id) {
          // Buscar formato nuevo: window_0F_1
          let match = anyEntry.id.match(new RegExp(`^(window|door|vent)_${floorPrefix}_(\\d+)$`));
          
          // Si no encuentra, buscar formato antiguo: window_1 (para compatibilidad)
          if (!match) {
            match = anyEntry.id.match(/^(window|door|vent)_(\d+)$/);
          }
          
          if (match) {
            const type = match[1] as keyof typeof typeCounters;
            const num = parseInt(match[2]);
            if (typeCounters[type] <= num) {
              typeCounters[type] = num + 1;
            }
          }
        }
      });
      
      const generatedId = `${currentAirEntry}_${floorPrefix}_${typeCounters[currentAirEntry]}`;
      
      const newAirEntry = {
        type: currentAirEntry,
        position: clickedPoint,
        dimensions,
        line: selectedLine,
        id: generatedId
      } as any;

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
    // Create a copy of the floors data
    console.log(`Updating air entry in floor ${floorName}, index ${index}`);

    // Log all entries before updating
    console.log("PARENT COMPONENT DEBUG - BEFORE UPDATE:", {
      updateRequestedFor: {
        floorName,
        index,
        entryType: updatedEntry.type,
        oldPosition:
          floorName === currentFloor
            ? airEntries[index]?.position
            : floors[floorName]?.airEntries[index]?.position,
        newPosition: updatedEntry.position,
      },
      currentFloor,
      allEntries:
        floorName === currentFloor
          ? airEntries.map((entry, i) => ({
              index: i,
              type: entry.type,
              position: entry.position,
            }))
          : floors[floorName]?.airEntries.map((entry, i) => ({
              index: i,
              type: entry.type,
              position: entry.position,
            })),
    });

    // Create a deep clone of the updated entry to prevent reference issues
    const deepClonedEntry = JSON.parse(JSON.stringify(updatedEntry));

    // Use the store's setAirEntries function when updating the current floor
    if (floorName === currentFloor) {
      // Create a deep copy of the air entries array with structuredClone
      const updatedAirEntries = airEntries.map((entry, i) =>
        i === index ? deepClonedEntry : { ...entry },
      );

      // Set the air entries with the deep copy
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

      // Log entries after updating
      console.log("PARENT COMPONENT DEBUG - AFTER UPDATE (CURRENT FLOOR):", {
        updatedIndex: index,
        allEntries: updatedAirEntries.map((entry, i) => ({
          index: i,
          type: entry.type,
          position: entry.position,
          isUpdated: i === index,
        })),
      });

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

  // Phase 2: Furniture callback handlers
  const handleFurnitureAdd = useCallback((floorName: string, item: FurnitureItem) => {
    addFurnitureToFloor(floorName, item);
    
    toast({
      title: "Furniture Added",
      description: `Added ${item.type} to ${formatFloorText(floorName)}`,
    });
  }, [addFurnitureToFloor, toast]);

  const handleFurnitureUpdate = (floorName: string, index: number, item: FurnitureItem) => {
    console.log("🪑 Phase 2: Updating furniture via props pattern:", { floorName, index, item });
    updateFurnitureInFloor(floorName, index, item);
    toast({
      title: "Furniture Updated",
      description: `Updated ${item.type} in ${formatFloorText(floorName)}`,
    });
  };

  const handleFurnitureDelete = (floorName: string, index: number) => {
    console.log("🪑 Phase 2: Deleting furniture via props pattern:", { floorName, index });
    deleteFurnitureFromFloor(floorName, index);
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

          <div className="flex gap-4">
            {/* Left side menus */}
            <div className="w-72 space-y-6">
              {/* 2D Menu - grayed out in 3D view */}
              <div
                className={cn(
                  "border rounded-lg p-4",
                  tab === "3d-preview"
                    ? "opacity-50 pointer-events-none"
                    : "opacity-100",
                )}
              >
                <h3 className="font-semibold text-lg mb-4">2D Menu</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant={currentTool === "wall" ? "default" : "outline"}
                      className="w-full h-16 flex flex-col items-center justify-center gap-1"
                      onClick={() => handleToolSelect("wall")}
                    >
                      <div className="w-6 h-6 bg-primary/20 rounded-sm" />
                      <span className="text-xs">Wall Line</span>
                    </Button>
                    <Button
                      variant={currentTool === "eraser" ? "default" : "outline"}
                      className="w-full h-16 flex flex-col items-center justify-center gap-1"
                      onClick={() => handleToolSelect("eraser")}
                    >
                      <Eraser className="w-6 h-6" />
                      <span className="text-xs">Eraser</span>
                    </Button>
                    <Button
                      variant={
                        currentTool === "measure" ? "default" : "outline"
                      }
                      className="w-full h-16 flex flex-col items-center justify-center gap-1"
                      onClick={() => handleToolSelect("measure")}
                    >
                      <Ruler className="w-6 h-6" />
                      <span className="text-xs">Measure</span>
                    </Button>
                  </div>
                  
                  {/* Wall Temperature */}
                  <div className="space-y-2 mt-4">
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

                <div className="space-y-4 mt-4">
                  <h3 className="font-semibold">Grid Size</h3>
                  <div className="px-2">
                    <Slider
                      defaultValue={[gridSize]}
                      max={50}
                      min={10}
                      step={1}
                      onValueChange={handleGridSizeChange}
                    />
                    <div className="text-sm text-right mt-1">
                      {gridSizeToCm(gridSize).toFixed(1)}cm/cell
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
              </div>

              {/* 3D Tools - grayed out in 2D view */}

              <div
                className={cn(
                  "border rounded-lg p-4",
                  tab === "2d-editor"
                    ? "opacity-50 pointer-events-none"
                    : "opacity-100",
                )}
              >
                <h3 className="font-semibold text-lg mb-4">3D Tools</h3>
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

              {/* Parameters Menu - Add before Files menu */}
              {renderParametersMenu()}

              {/* Files - always active */}
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
            {/* We'll use a custom toolbar for Step 2 that looks like the one in Step 1 */}
            <div className="mb-4 flex">
              <div className="bg-card border rounded-md inline-flex shadow-sm overflow-hidden">
                <Button
                  variant="ghost"
                  className="px-3 py-2 text-sm font-medium rounded-none bg-blue-50 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  disabled
                >
                  3D Editor
                </Button>
                <Button
                  variant="ghost"
                  className="px-3 py-2 text-sm font-medium rounded-none hover:bg-gray-50"
                  disabled
                >
                  3D Preview
                </Button>
              </div>
            </div>

            <div className="flex gap-4">
              {/* Left side menus - copy style from Step 1 */}
              <div className="w-72 space-y-6">
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

                  {/* Furniture */}
                  <div className="space-y-4 mt-4">
                    <h3 className="font-semibold">Furniture</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        {
                          id: "table",
                          name: "Table",
                          icon: (
                            <rect
                              x="4"
                              y="14"
                              width="16"
                              height="6"
                              rx="1"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                          ),
                        },
                        {
                          id: "person",
                          name: "Person",
                          icon: (
                            <circle
                              cx="12"
                              cy="9"
                              r="3"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                          ),
                        },
                        {
                          id: "armchair",
                          name: "Armchair",
                          icon: (
                            <rect
                              x="4"
                              y="12"
                              width="16"
                              height="8"
                              rx="1"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                          ),
                        },
                        {
                          id: "car",
                          name: "Car",
                          icon: (
                            <g>
                              <rect
                                x="2"
                                y="10"
                                width="20"
                                height="6"
                                rx="1"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                fill="none"
                              />
                              <circle
                                cx="6"
                                cy="18"
                                r="2"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                fill="none"
                              />
                              <circle
                                cx="18"
                                cy="18"
                                r="2"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                fill="none"
                              />
                            </g>
                          ),
                        },
                      ].map((item) => (
                        <Button
                          key={item.id}
                          variant="outline"
                          className="h-auto py-2 flex flex-col items-center justify-center gap-1"
                          draggable={true}
                          onDragStart={(e) => {
                            // Only send the necessary data without React elements to avoid circular references
                            const serializable = {
                              id: item.id,
                              name: item.name,
                            };
                            e.dataTransfer.setData(
                              "application/json",
                              JSON.stringify(serializable),
                            );
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                        >
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            {item.icon}
                          </svg>
                          <span className="text-xs">{item.name}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Parameters (matching style from Step 1) */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-lg mb-4">Parameters</h3>
                  <div className="space-y-4">
                    <div className="space-y-4">
                      <Label>Air Flow Rate</Label>
                      <Slider defaultValue={[50]} max={100} step={1} />
                      <div className="text-sm text-right">50 m³/h</div>
                    </div>
                    <div className="space-y-4">
                      <Label>Temperature</Label>
                      <Slider defaultValue={[20]} max={40} min={0} step={1} />
                      <div className="text-sm text-right">20°C</div>
                    </div>
                    <div className="space-y-4">
                      <Label>Humidity</Label>
                      <Slider defaultValue={[45]} max={100} min={0} step={1} />
                      <div className="text-sm text-right">45%</div>
                    </div>
                  </div>
                </div>

                {/* Files section matching Step 1 */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-lg mb-4">Files</h3>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full flex items-center gap-2"
                      onClick={handleSaveDesign}
                    >
                      <Save className="h-4 w-4" />
                      Save Design
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full flex items-center gap-2"
                      onClick={() => setShowLoadDesignDialog(true)}
                    >
                      <Upload className="h-4 w-4" />
                      Load Design
                    </Button>
                  </div>
                </div>
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
    // Recopilar datos de mobiliario
    const furnitureObjects: THREE.Object3D[] = [];

    // Intentar obtener elementos 3D de la escena
    try {
      // Buscar todos los objetos relevantes de mobiliario
      document.querySelectorAll("[data-furniture]").forEach((elem: any) => {
        if (elem.userData && elem.userData.type === "furniture") {
          furnitureObjects.push(elem);
        }
      });
    } catch (err) {
      console.log("No se pudieron encontrar objetos de mobiliario", err);
    }

    // Generar los datos de simulación completos
    return generateSimulationData(
      floors,
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
      ground: { ceilingHeight: 220, floorDeck: 35 }
    });
    
    // PASO 2: Resetear el store ANTES de cambiar isMultifloor (evita useEffect con datos intermedios)
    reset();
    
    // PASO 3: CRÍTICO - Sincronizar currentFloor del store con ground
    setCurrentFloor("ground");
    
    // PASO 4: Desactivar multifloor DESPUÉS del reset para evitar efectos intermedios
    setIsMultifloor(false);
    setSelectedFloor("ground");
    setLoadFromFloor("ground");
    
    // PASO 4: Resetear todos los estados locales del wizard
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
    
    // PASO 5: Limpiar mediciones y escalones locales
    setMeasurements([]);
    setStairPolygons([]);
    
    // PASO 6: Cerrar el diálogo
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
      const newFloorParameters: Record<string, { ceilingHeight: number; floorDeck: number }> = {};
      
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
          floorDeck: (floorData.floorDeck || 0) * 100 // Convertir metros a cm
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

  const renderParametersMenu = () => (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold text-lg mb-4">Parameters</h3>
      <div className="space-y-4">
        <div className="flex items-center space-x-2 opacity-50">
          <Checkbox
            id="multifloor"
            checked={isMultifloor}
            disabled={true}
          />
          <Label htmlFor="multifloor" className="text-gray-500">Multifloor (Always enabled)</Label>
        </div>

        {isMultifloor && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Current Floor</Label>
              <Select value={currentFloor} onValueChange={handleFloorChange}>
                <SelectTrigger>
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
            </div>

            <div className="space-y-2">
              <Label>Load from Floor</Label>
              <div className="flex gap-2">
                <Select value={loadFromFloor} onValueChange={setLoadFromFloor}>
                  <SelectTrigger className="flex-1">
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
                  onClick={handleLoadTemplate}
                >
                  Load
                </Button>
              </div>
            </div>

            <div className="pt-4">
              <Button
                variant={currentTool === "stairs" ? "default" : "outline"}
                className={cn(
                  "w-full",
                  currentTool === "stairs" &&
                    "bg-violet-500 hover:bg-violet-600 text-white border-violet-600",
                )}
                onClick={() => {
                  setCurrentTool("stairs");
                  setCurrentAirEntry(null);
                  setTab("2d-editor");
                  toast({
                    title: "Stair Design Tool Activated",
                    description:
                      "Click on the canvas to place points and create a stair polygon. Close the shape by clicking near the first point.",
                  });
                }}
              >
                <FileEdit className="mr-2 h-4 w-4" />
                Stair Design
              </Button>
            </div>
          </div>
        )}

        {/* Ceiling Height y Floor Deck Parameters */}
        <div className="space-y-4 pt-4 border-t">
          <h4 className="font-medium text-sm text-gray-700">Building Parameters</h4>
          
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
                const floorParams = floorParameters[floorName] || { ceilingHeight: 220, floorDeck: 35 };
                const isCurrentFloor = floorName === currentFloor;
                
                return (
                  <div key={floorName} className={cn(
                    "p-3 rounded-lg border",
                    isCurrentFloor ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"
                  )}>
                    <h5 className="font-medium text-sm mb-3 flex items-center gap-2">
                      {formatFloorText(floorName)}
                      {isCurrentFloor && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Current</span>}
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
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderCanvasSection = (mode = "tabs") => {
    // Logs para rastrear datos de muebles cuando cambias entre vistas
    if (tab === "3d-preview" && mode === "tabs") {
      const currentFloorData = floors[currentFloor];
      console.log(`🪑 VIEW SWITCH: Switching to 3D view for floor ${currentFloor}`);
      console.log(`🪑 VIEW SWITCH: Floor ${currentFloor} has ${currentFloorData?.furnitureItems?.length || 0} furniture items`);
      if (currentFloorData?.furnitureItems?.length > 0) {
        console.log(`🪑 VIEW SWITCH: Furniture items:`, currentFloorData.furnitureItems.map(item => ({ 
          id: item.id, 
          type: item.type, 
          position: item.position 
        })));
      }
    }

    return (
      <div className="flex-1 border rounded-lg overflow-hidden bg-white min-w-[600px]">
        <SceneProvider>
          {mode === "step2" ? (
            <RoomSketchPro
              key={`step2-view-${currentFloor}`} // Add the currentFloor to the key to force re-render on floor change
              instanceId="step2-view"
              lines={floors[currentFloor]?.lines || lines} // Use the floor-specific lines directly
              airEntries={floors[currentFloor]?.airEntries || airEntries} // Use the floor-specific air entries directly
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
              onFurnitureAdd={(item) => handleFurnitureAdd(currentFloor, item)}
              onUpdateFurniture={(item) => {
                toast({
                  title: "Furniture Updated",
                  description: `${item.name} has been modified`,
                });
              }}
              onDeleteFurniture={(itemId) => {
                toast({
                  title: "Furniture Deleted",
                  description: "Furniture item has been removed",
                });
              }}
            />
          ) : tab === "2d-editor" ? (
            <Canvas2D
              gridSize={gridSize}
              currentTool={currentTool}
              currentAirEntry={currentAirEntry}
              airEntries={airEntries}
              measurements={measurements}
              stairPolygons={stairPolygons}
              walls={walls}
              onMeasurementsUpdate={setMeasurements}
              onStairPolygonsUpdate={setStairPolygons}
              onWallsUpdate={setWalls}
              lines={lines}
              floorText={formatFloorText(currentFloor)}
              currentFloor={currentFloor}
              isMultifloor={isMultifloor}
              ceilingHeight={isMultifloor ? (floorParameters[currentFloor]?.ceilingHeight || 220) / 100 : ceilingHeight / 100}
              defaultWallTemperature={defaultWallTemperature}
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
              onAirEntriesUpdate={setAirEntries}
              onLineSelect={handleLineSelect}
            />
          ) : (
            <Canvas3D
              floors={floors}
              currentFloor={currentFloor}
              ceilingHeight={ceilingHeight}
              floorDeckThickness={floorDeckThickness}
              isMultifloor={isMultifloor}
              floorParameters={floorParameters}
              wallTransparency={wallTransparency}
              isMeasureMode={isMeasureMode}
              isEraserMode={isEraserMode}
              simulationName={simulationName}
              simulationType={
                simulationType === "comfort"
                  ? "Ensure Thermal Comfort (Steady Equilibrium Simulation)"
                  : "Thermal Comfort + Air Renovation (Transient Simulation)"
              }
              onUpdateAirEntry={handleUpdateAirEntryFrom3D}
              onDeleteAirEntry={handleDeleteAirEntryFrom3D}
              onViewChange={handleViewChange}
              onFurnitureAdd={handleFurnitureAdd}
              onFurnitureUpdate={handleFurnitureUpdate}
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
            <AlertDialogDescription>
              This action will permanently delete all current design data including walls, air entries, stairs, measurements, and multi-floor configurations.
              <br /><br />
              This action cannot be undone. Are you sure you want to continue?
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
