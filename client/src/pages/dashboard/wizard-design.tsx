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
import { queryClient } from "@/lib/queryClient";
import { customFurnitureStore } from "@/lib/custom-furniture-store";
import SimulationDataDialog from "@/components/sketch/SimulationDataDialog";
import LoadDesignDialog from "@/components/sketch/LoadDesignDialog";
import LoginModal from "@/components/auth/login-modal";
import RegisterModal from "@/components/auth/register-modal";
import { generateSimulationData, denormalizeCoordinates } from "@/lib/simulationDataConverter";
import * as THREE from "three";

// Helper function for default dimensions (matching Canvas3D)
const getDefaultDimensions = (type: 'table' | 'person' | 'armchair' | 'block' | 'rack' | 'topVentBox' | 'sideVentBox' | 'vent' | 'nozzle' | 'custom') => {
  switch (type) {
    case 'table':
      return { width: 120, height: 75, depth: 80 };
    case 'person':
      return { width: 50, height: 170, depth: 30 };
    case 'armchair':
      return { width: 70, height: 85, depth: 70 };
    case 'block':
      return { width: 80, height: 80, depth: 80 };
    case 'rack':
      return { width: 60, height: 200, depth: 100 };
    case 'topVentBox':
      return { width: 50, height: 150, depth: 50 };
    case 'sideVentBox':
      return { width: 150, height: 50, depth: 50 };
    case 'vent':
      return { width: 50, height: 50, depth: 10 };
    case 'nozzle':
      return { width: 200, height: 50, depth: 50 };
    case 'custom':
      return { width: 100, height: 100, depth: 100 };
    default:
      return { width: 80, height: 80, depth: 80 };
  }
};
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
  Play,
  Pencil,
  Box,
  Rocket,
  Lightbulb,
  Server,
  Home,
  Flame,
  Snowflake,
  Check,
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
import { PlusCircle, Mail, FileEdit, Trash2 } from "lucide-react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
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
  wallId?: string; // Direct reference to wall ID (e.g., "wall_0F_1") for robust JSON export
}

interface StairPolygon {
  id: string;
  points: Point[];
  floor: string;
  direction?: "up" | "down";
  connectsTo?: string;
  isImported?: boolean;
  temperature?: number;
  emissivity?: number;
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
    material?: string;
    emissivity?: number;
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
  const { viewportOffset, gridSize, canvasHeightPercentage, menuWidthPercentage, setGridSize } = useSketchStore();
  const [step, setStep] = useState(0);
  const [simulationName, setSimulationName] = useState("MySim");
  const [simulationType, setSimulationType] = useState("SteadySim");
  const [cfdType, setCfdType] = useState(() => {
    const stored = sessionStorage.getItem('selectedCFDType');
    if (stored) sessionStorage.removeItem('selectedCFDType');
    return stored || 'indoor-spaces';
  });
  const [showCfdMenu, setShowCfdMenu] = useState(false);
  const cfdMenuRef = useRef<HTMLDivElement>(null);
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
  const [defaultWallTemperature, setDefaultWallTemperature] = useState(24); // Default wall temperature in °C
  const [defaultStairTemperature, setDefaultStairTemperature] = useState(20); // Default stair temperature in °C
  const [defaultStairEmissivity, setDefaultStairEmissivity] = useState(0.90); // Default stair emissivity
  const [defaultWallMaterial, setDefaultWallMaterial] = useState("default"); // Default wall material type
  const [defaultWallCustomEmissivity, setDefaultWallCustomEmissivity] = useState(0.90); // Custom emissivity when material is 'custom'
  
  // Material definitions with emissivity values (same as FurnitureDialog)
  const wallMaterialDefinitions = {
    default: { name: "Default", emissivity: 0.90 },
    wood: { name: "Wood", emissivity: 0.90 },
    metal: { name: "Metal (Steel)", emissivity: 0.25 },
    glass: { name: "Glass", emissivity: 0.92 },
    fabric: { name: "Fabric/Textile", emissivity: 0.90 },
    plastic: { name: "Plastic", emissivity: 0.90 },
    ceramic: { name: "Ceramic/Tile", emissivity: 0.90 },
    concrete: { name: "Concrete", emissivity: 0.90 },
    custom: { name: "Custom", emissivity: 0.90 }
  };
  
  // Get current wall emissivity based on selected material
  const getDefaultWallEmissivity = () => {
    return defaultWallMaterial === 'custom' 
      ? defaultWallCustomEmissivity 
      : wallMaterialDefinitions[defaultWallMaterial as keyof typeof wallMaterialDefinitions]?.emissivity || 0.90;
  };
  const [canvas3DKey, setCanvas3DKey] = useState(0); // Force re-render of Canvas3D
  const [canvasHeight, setCanvasHeight] = useState(700); // Dynamic canvas height (configurable % of viewport)
  const [menuWidth, setMenuWidth] = useState(300); // Dynamic menu width (configurable % of canvas width)
  

  
  // Nuevos estados para parámetros por planta
  const [floorParameters, setFloorParameters] = useState<Record<string, { ceilingHeight: number; floorDeck: number; ceilingTemperature?: number; floorTemperature?: number; ceilingEmissivity?: number; floorEmissivity?: number }>>({
    ground: { ceilingHeight: 220, floorDeck: 35, ceilingTemperature: 20, floorTemperature: 20, ceilingEmissivity: 0.90, floorEmissivity: 0.90 }
  });

  // Wall Line restriction state variables
  const [isWallLineDisabled, setIsWallLineDisabled] = useState(false);
  
  // Floor deletion dialog state variables
  const [floorToDelete, setFloorToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [closedContourCache, setClosedContourCache] = useState(new Map());
  const [lastLinesHash, setLastLinesHash] = useState('');

  // Estados para el diálogo de confirmación de simulación
  const [showSimulationTypeDialog, setShowSimulationTypeDialog] = useState(false);
  
  // ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
  // Estado para la contraseña de lanzamiento de simulaciones
  // Esta funcionalidad será eliminada próximamente
  const [simulationPassword, setSimulationPassword] = useState("");

  // Funciones auxiliares para manejo de parámetros por planta
  const getCurrentFloorParameters = () => {
    return floorParameters[selectedFloor] || { ceilingHeight: 220, floorDeck: 35, ceilingTemperature: 20, floorTemperature: 20, ceilingEmissivity: 0.90, floorEmissivity: 0.90 };
  };

  const updateFloorParameter = (floor: string, parameter: 'ceilingHeight' | 'floorDeck' | 'ceilingTemperature' | 'floorTemperature' | 'ceilingEmissivity' | 'floorEmissivity', value: number) => {
    setFloorParameters(prev => ({
      ...prev,
      [floor]: {
        ...prev[floor] || { ceilingHeight: 220, floorDeck: 35, ceilingTemperature: 20, floorTemperature: 20, ceilingEmissivity: 0.90, floorEmissivity: 0.90 },
        [parameter]: value
      }
    }));
    
    // Note: Canvas3D will automatically update geometry via floorParameters prop changes
    // No need for forced re-mounts or camera state preservation
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cfdMenuRef.current && !cfdMenuRef.current.contains(e.target as Node)) {
        setShowCfdMenu(false);
      }
    };
    if (showCfdMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCfdMenu]);

  // Calculate canvas height as configurable percentage of viewport height
  useEffect(() => {
    const calculateCanvasHeight = () => {
      const viewportHeight = window.innerHeight;
      const calculatedHeight = Math.round(viewportHeight * (canvasHeightPercentage / 100));
      // Ensure minimum height of 400px and maximum of 800px
      const clampedHeight = Math.max(400, Math.min(800, calculatedHeight));
      setCanvasHeight(clampedHeight);
    };

    // Calculate initial height
    calculateCanvasHeight();

    // Recalculate on window resize
    window.addEventListener('resize', calculateCanvasHeight);

    // Cleanup listener
    return () => window.removeEventListener('resize', calculateCanvasHeight);
  }, [canvasHeightPercentage]);

  // Calculate menu width as configurable percentage of canvas width
  useEffect(() => {
    const calculateMenuWidth = () => {
      const viewportWidth = window.innerWidth;
      const canvasWidth = viewportWidth - viewportOffset; // Available width for canvas
      const calculatedWidth = Math.round(canvasWidth * (menuWidthPercentage / 100));
      // Ensure minimum width of 200px and maximum of 500px for usability
      const clampedWidth = Math.max(200, Math.min(500, calculatedWidth));
      setMenuWidth(clampedWidth);
    };

    // Calculate initial width
    calculateMenuWidth();

    // Recalculate on window resize
    window.addEventListener('resize', calculateMenuWidth);

    // Cleanup listener
    return () => window.removeEventListener('resize', calculateMenuWidth);
  }, [menuWidthPercentage, viewportOffset]);

  // Check for pending design load from dashboard
  useEffect(() => {
    const pendingDesignData = sessionStorage.getItem('pendingDesignLoad');
    if (pendingDesignData) {
      try {
        const jsonData = JSON.parse(pendingDesignData);
        // Clear the pending data immediately
        sessionStorage.removeItem('pendingDesignLoad');
        // Load the design using existing function
        handleLoadDesign(jsonData);
        toast({
          title: "Design Loaded",
          description: "Design from dashboard loaded successfully.",
        });
      } catch (error) {
        console.error('Error loading pending design:', error);
        sessionStorage.removeItem('pendingDesignLoad');
        toast({
          title: "Load Error",
          description: "Failed to load design from dashboard.",
          variant: "destructive",
        });
      }
    }
  }, []); // Run only once on component mount

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

  // Wall Line restriction utility functions
  const arePointsEqual = (p1: Point, p2: Point): boolean => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) < 5;
  };

  const findConnectedLines = (point: Point, lines: Line[]) => {
    return lines.filter(line => 
      arePointsEqual(line.start, point) || arePointsEqual(line.end, point)
    );
  };

  const isInClosedContour = (point: Point, lines: Line[]): boolean => {
    const visited = new Set<string>();
    const startPoint = point;
    
    const dfs = (currentPoint: Point, depth: number): boolean => {
      if (depth > 50) return false; // Prevent infinite loops
      
      const pointKey = `${Math.round(currentPoint.x)},${Math.round(currentPoint.y)}`;
      if (visited.has(pointKey)) {
        // We've returned to a visited point - check if it's the start
        return arePointsEqual(currentPoint, startPoint) && depth > 2;
      }
      
      visited.add(pointKey);
      
      const connectedLines = findConnectedLines(currentPoint, lines);
      
      for (const line of connectedLines) {
        const nextPoint = arePointsEqual(line.start, currentPoint) ? line.end : line.start;
        if (dfs(nextPoint, depth + 1)) {
          return true;
        }
      }
      
      return false;
    };
    
    return dfs(startPoint, 0);
  };

  const hasClosedContourOnCurrentFloor = useCallback(() => {
    const linesHash = JSON.stringify(lines);
    
    if (closedContourCache.has(linesHash)) {
      return closedContourCache.get(linesHash);
    }
    
    const endpoints = [...new Set(lines.flatMap(line => [line.start, line.end]))];
    const result = endpoints.some(point => {
      const connections = findConnectedLines(point, lines).length;
      return connections > 1 && isInClosedContour(point, lines);
    });
    
    closedContourCache.set(linesHash, result);
    return result;
  }, [lines, closedContourCache]);

  // Smart state management for Wall Line restriction
  useEffect(() => {
    const linesHash = JSON.stringify(lines);
    
    if (linesHash !== lastLinesHash) {
      // Clear cache when lines change
      setClosedContourCache(new Map());
      
      // Check contour status
      const hasClosedContour = hasClosedContourOnCurrentFloor();
      setIsWallLineDisabled(hasClosedContour);
      
      // Auto-deselect Wall Line if contour just closed and tool is active
      if (hasClosedContour && currentTool === "wall") {
        setCurrentTool(null);
        toast({
          title: "Wall Line Tool Disabled",
          description: "Room contour completed. Wall Line tool automatically disabled.",
          variant: "default",
        });
      }
      
      setLastLinesHash(linesHash);
    }
  }, [lines, currentFloor, hasClosedContourOnCurrentFloor, currentTool, lastLinesHash, toast]);

  // Auto-inicializar parámetros cuando se activa multifloor
  useEffect(() => {
    if (isMultifloor) {
      Object.keys(rawFloors).forEach(floorName => {
        if (rawFloors[floorName]?.hasClosedContour) {
          ensureFloorParametersExist(floorName);
        }
      });
    }
  }, [isMultifloor, rawFloors]);

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
          floorTemperature: sourceFloorParams.floorTemperature || 20,
          ceilingEmissivity: sourceFloorParams.ceilingEmissivity ?? 0.90,
          floorEmissivity: sourceFloorParams.floorEmissivity ?? 0.90
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

  // Handle floor deletion confirmation dialog
  const handleDeleteFloorConfirm = (floorName: string) => {
    setFloorToDelete(floorName);
    setIsDeleteDialogOpen(true);
  };

  const executeFloorDeletion = () => {
    if (floorToDelete) {
      handleRemoveFloor(floorToDelete);
      setFloorToDelete(null);
      setIsDeleteDialogOpen(false);
    }
  };

  const steps = [
    { id: 0, name: "Quick Guide" },
    { id: 1, name: "Contour Design" },
    { id: 2, name: "Add Elements" },
    { id: 3, name: "Validate Case" },
    { id: 4, name: "Launch" },
  ];

  const handleToolSelect = (tool: "wall" | "eraser" | "measure" | "stairs") => {
    // Wall Line restriction check
    if (tool === "wall" && isWallLineDisabled) {
      toast({
        title: "Cannot Add Wall Lines",
        description: "To add more lines, open the existing contour by moving points or erasing lines. Only one closed room per floor is allowed.",
        variant: "destructive",
      });
      return;
    }

    // Toggle behavior: if same tool clicked, deselect it
    if (currentTool === tool) {
      setCurrentTool(null);
    } else {
      setCurrentTool(tool);
      setCurrentAirEntry(null); // Clear air entries when selecting tool
    }
  };

  const handleAirEntrySelect = (entry: "vent" | "door" | "window") => {

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
    const baseStyles = "w-20 h-16 p-2 flex flex-col items-center justify-center transition-all duration-200 shadow-sm";
    const disabledStyles = "bg-gray-200 text-gray-400 cursor-not-allowed opacity-60";
    const enabledStyles = "hover:bg-gray-100 text-gray-700";
    const activeStyles = "scale-95 shadow-inner bg-gray-100";
    const borderStyles = isWallLineDisabled ? "border-gray-300" : "border-gray-500";

    return cn(
      baseStyles,
      isWallLineDisabled ? disabledStyles : enabledStyles,
      currentTool === "wall" && !isWallLineDisabled ? activeStyles : "",
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

  const cfdTypeConfig: Record<string, { label: [string, string]; icon: typeof Server; text: string; borderLeft: string; activeStep: string; activeBg: string; activeLine: string }> = {
    'data-centers': { label: ['Data', 'Centers'], icon: Server, text: 'text-blue-600', borderLeft: 'border-l-blue-500', activeStep: 'text-blue-700', activeBg: 'bg-blue-50', activeLine: 'bg-blue-500' },
    'indoor-spaces': { label: ['Indoor', 'Spaces'], icon: Home, text: 'text-emerald-600', borderLeft: 'border-l-emerald-500', activeStep: 'text-emerald-700', activeBg: 'bg-emerald-50', activeLine: 'bg-emerald-500' },
    'fire-smoke': { label: ['Fire &', 'Smoke'], icon: Flame, text: 'text-orange-600', borderLeft: 'border-l-orange-500', activeStep: 'text-orange-700', activeBg: 'bg-orange-50', activeLine: 'bg-orange-500' },
    'industrial-cooling': { label: ['Industrial', 'Cooling'], icon: Snowflake, text: 'text-violet-600', borderLeft: 'border-l-violet-500', activeStep: 'text-violet-700', activeBg: 'bg-violet-50', activeLine: 'bg-violet-500' },
  };

  const renderStepIndicator = () => {
    const config = cfdTypeConfig[cfdType] || cfdTypeConfig['indoor-spaces'];
    const CfdIcon = config.icon;

    return (
    <div className="w-full">
      <div className={`flex items-stretch bg-card border rounded-lg border-l-4 ${config.borderLeft} overflow-visible`}>
        <div ref={cfdMenuRef} className="relative">
          <div
            className={`flex flex-col items-center justify-center px-5 py-2.5 border-r border-border min-w-[90px] h-full cursor-pointer hover:bg-muted/40 transition-colors duration-150 ${config.text}`}
            onClick={() => setShowCfdMenu(!showCfdMenu)}
          >
            <span className="text-xs font-bold uppercase leading-tight text-center">{config.label[0]}</span>
            <span className="text-xs font-bold uppercase leading-tight text-center">{config.label[1]}</span>
            <CfdIcon className="h-6 w-6 mt-1.5" />
            <ChevronDown className="h-3 w-3 mt-0.5 opacity-50" />
          </div>

          {showCfdMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-card border rounded-lg shadow-xl py-1 min-w-[180px] animate-in fade-in slide-in-from-top-1 duration-150">
              {Object.entries(cfdTypeConfig).map(([key, cfg]) => {
                const ItemIcon = cfg.icon;
                const isSelected = key === cfdType;
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-150",
                      isSelected ? `${cfg.activeBg} ${cfg.text} font-semibold` : "hover:bg-muted/50 text-muted-foreground"
                    )}
                    onClick={() => {
                      setCfdType(key);
                      setShowCfdMenu(false);
                    }}
                  >
                    <ItemIcon className={`h-5 w-5 ${cfg.text}`} />
                    <span className="text-sm">{cfg.label[0]} {cfg.label[1]}</span>
                    {isSelected && <Check className="h-4 w-4 ml-auto" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 flex items-stretch">
          {steps.map((s, idx) => {
            const isActive = step === s.id;
            const isLast = idx === steps.length - 1;

            if (s.id === 4) {
              const canLaunch = isValidationPassing && !isCreatingSimulation;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "group/launch relative flex-1 flex flex-col items-center justify-center py-2.5 transition-all duration-200 rounded-r-lg",
                    canLaunch
                      ? "bg-green-500 text-white hover:bg-green-600 cursor-pointer"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  )}
                  onClick={() => { if (canLaunch) handleStartSimulation(); }}
                >
                  <span className="text-sm font-semibold">
                    {isCreatingSimulation ? "Launching..." : `Step ${s.id}`}
                  </span>
                  <div className={`w-10 h-px my-1 ${canLaunch ? 'bg-white/40' : 'bg-gray-300'}`} />
                  <span className="text-xs">{s.name}</span>
                  {!canLaunch && (
                    <div className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 z-50 w-max max-w-[220px] rounded-md bg-gray-900 px-3 py-2 text-xs text-white text-center shadow-lg opacity-0 group-hover/launch:opacity-100 transition-opacity duration-200">
                      Pass all checks in Step 3 to unlock
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div
                key={s.id}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2.5 cursor-pointer transition-all duration-200",
                  s.id === 3 && "border-r border-border",
                  isActive
                    ? `${config.activeBg} ${config.activeStep} font-semibold`
                    : "hover:bg-muted/50 text-muted-foreground"
                )}
                onClick={() => setStep(s.id)}
              >
                <span className={cn("text-sm", isActive ? "font-semibold" : "font-medium")}>Step {s.id}</span>
                <div className={cn("w-10 h-px my-1", isActive ? config.activeLine : "bg-border")} />
                <span className="text-xs">{s.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
  };

  const renderStep0 = () => (
    <>
      <div className="mt-4 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Play className="h-5 w-5 text-primary" />
              Welcome to the Simulation Wizard
            </CardTitle>
            <CardDescription>
              Watch this short video to learn how FlowDesk works, then jump right in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-lg overflow-hidden border bg-black">
              <iframe
                width="100%"
                height="100%"
                src="https://www.youtube.com/embed/-cyPLRfry7k"
                title="FlowDesk Tutorial"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">What you'll do in 3 steps</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-l-4 border-l-primary/60 hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Pencil className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Step 1 — Draw Your Room</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sketch the room contour, set dimensions, and configure walls and openings.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-primary/60 hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Box className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Step 2 — Place Elements</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add furniture, people, equipment, and air entries to your layout.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-primary/60 hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Rocket className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Step 3 — Run Simulation</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Review your configuration, choose a package, and launch the CFD analysis.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Lightbulb className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">Pro tip</p>
                <p className="text-xs text-muted-foreground">
                  You can save and load your designs at any point. Use the Files menu in Steps 1 & 2 to manage your work.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );

  const renderStep1 = () => (
    <>
      <Card className="mt-4">
        <CardContent className="p-4">
          <ToolbarToggle
            mode={tab}
            onModeChange={(value: "2d-editor" | "3d-preview") => {
              setTab(value);
            }}
            hasClosedContour={hasClosedContour}
          />

          <PanelGroup direction="horizontal" className="h-full">
            {/* Left side menus - resizable panel */}
            <Panel defaultSize={25} minSize={15} maxSize={50}>
              <div className="space-y-6 overflow-y-auto pr-2" style={{ maxHeight: `${canvasHeight}px` }}>
              {/* 2D Configuration - only show when in 2D mode */}
              {tab === "2d-editor" && (
                <div className="border rounded-lg p-4">
                <h3 className="font-semibold text-xl mb-4 text-center">2D Configuration</h3>
                
                {/* Wall Design */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Wall Design</h3>
                  <div className="flex items-start gap-2">
                    {/* Wall Line Button */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            className={`${getWallStyles()} flex-1 min-w-0 h-16 flex-col justify-center`}
                            onClick={() => {
                              if (isWallLineDisabled) {
                                toast({
                                  title: "Cannot Add Wall Lines",
                                  description: "To add more lines, open the existing contour by moving points or erasing lines. Only one closed room per floor is allowed.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              handleToolSelect("wall");
                            }}
                          >
                            <div className={`w-6 h-6 border-2 ${isWallLineDisabled ? 'border-gray-400' : 'border-gray-500'}`} />
                            <span className="text-xs mt-1">Wall Line</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent 
                          side="top" 
                          className={isWallLineDisabled ? "bg-red-50 border-red-200 text-red-800" : ""}
                        >
                          {isWallLineDisabled ? (
                            <div className="space-y-1">
                              <p className="font-semibold">Wall Line Disabled</p>
                              <p className="text-xs">Room contour is closed. To add more lines:</p>
                              <p className="text-xs">• Move existing points, or</p>
                              <p className="text-xs">• Use Eraser to remove lines</p>
                            </div>
                          ) : (
                            "Add wall lines to create room boundaries"
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
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
                          className="w-full h-8 text-xs"
                          min={-50}
                          max={100}
                          step={0.5}
                          placeholder="24"
                        />
                        <span className="text-sm text-gray-500">°C</span>
                      </div>
                      
                      {/* Apply to all walls button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs mt-1"
                        onClick={() => {
                          if (walls && walls.length > 0) {
                            const updatedWalls = walls.map(wall => ({
                              ...wall,
                              properties: {
                                ...wall.properties,
                                temperature: defaultWallTemperature
                              }
                            }));
                            setWalls(updatedWalls);
                            toast({
                              title: "Temperature Applied",
                              description: `Set ${walls.length} wall(s) to ${defaultWallTemperature}°C`,
                            });
                          } else {
                            toast({
                              title: "No walls found",
                              description: "Draw some walls first to apply temperature",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Apply to all Walls
                      </Button>
                      
                      {/* Wall Material / Emissivity Selector */}
                      <div className="mt-3 space-y-2">
                        <TooltipProvider>
                          <div className="flex items-center gap-1">
                            <Label htmlFor="default-wall-material" className="text-sm font-medium">
                              Material
                            </Label>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-3 h-3 text-gray-400" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-64">
                                  Default material assigned to new walls. Each material has a specific emissivity/absorptivity value (grey body assumption).
                                  You can change individual wall materials by double-clicking on any wall.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                        <Select 
                          value={defaultWallMaterial} 
                          onValueChange={(value) => setDefaultWallMaterial(value)}
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="Select material" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(wallMaterialDefinitions).map(([key, { name, emissivity }]) => (
                              <SelectItem key={key} value={key} className="text-xs">
                                {name} {key !== 'custom' && `(ε = ${emissivity})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        {/* Custom Emissivity Input - only shown when 'custom' is selected */}
                        {defaultWallMaterial === 'custom' && (
                          <div className="mt-2">
                            <TooltipProvider>
                              <div className="flex items-center gap-1">
                                <Label htmlFor="wall-custom-emissivity" className="text-sm font-medium">
                                  Custom Emissivity (ε)
                                </Label>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Info className="w-3 h-3 text-gray-400" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-64">
                                      Enter a custom emissivity value between 0 and 1.
                                      For grey bodies, emissivity equals absorptivity.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                            <div className="flex items-center gap-2 mt-1">
                              <Input
                                id="wall-custom-emissivity"
                                type="number"
                                value={defaultWallCustomEmissivity}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  if (!isNaN(value) && value >= 0 && value <= 1) {
                                    setDefaultWallCustomEmissivity(value);
                                  }
                                }}
                                className="w-full h-8 text-xs"
                                min={0}
                                max={1}
                                step={0.01}
                                placeholder="0.90"
                              />
                            </div>
                          </div>
                        )}
                        
                        {/* Display current emissivity value */}
                        <div className="text-xs text-gray-500 mt-1">
                          Current emissivity: ε = {getDefaultWallEmissivity().toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mt-4">
                  <h3 className="font-semibold">Air Entries</h3>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      className={`${getAirEntryStyles("window")} flex-1 h-16 flex-col justify-center text-xs p-1`}
                      onClick={() => handleAirEntrySelect("window")}
                    >
                      <div className="w-4 h-4 border-2 border-blue-500 grid grid-cols-2" />
                      <span className="text-xs mt-1">Window</span>
                    </Button>
                    <Button
                      variant="outline"
                      className={`${getAirEntryStyles("door")} flex-1 h-16 flex-col justify-center text-xs p-1`}
                      onClick={() => handleAirEntrySelect("door")}
                    >
                      <div className="w-4 h-4 border-2 border-amber-500" />
                      <span className="text-xs mt-1">Door</span>
                    </Button>
                    <Button
                      variant="outline"
                      className={`${getAirEntryStyles("vent")} flex-1 h-16 flex-col justify-center text-xs p-1`}
                      onClick={() => handleAirEntrySelect("vent")}
                    >
                      <div className="w-4 h-4 border-2 border-green-500 grid grid-cols-2 grid-rows-2" />
                      <span className="text-xs mt-1">Vent-Grid</span>
                    </Button>
                  </div>
                </div>

                {/* Stair Design - Moved from Parameters */}
                {isMultifloor && (
                  <div className="space-y-4 mt-4">
                    <h3 className="font-semibold">Stair Design</h3>
                    <div className="flex items-start gap-2">
                      {/* Stair Design Button */}
                      <Button
                        variant="outline"
                        className={`${getStairStyles()} flex-1 min-w-0 h-16 flex-col justify-center`}
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
                            className="w-full h-8 text-xs"
                            min={-50}
                            max={100}
                            step={0.5}
                            placeholder="20"
                          />
                          <span className="text-sm text-gray-500">°C</span>
                        </div>
                      </div>
                      
                      {/* Stair Emissivity */}
                      <div className="space-y-2 flex-1">
                        <TooltipProvider>
                          <div className="flex items-center gap-1">
                            <Label htmlFor="default-stair-emissivity" className="text-sm font-medium">
                              Stair Emissivity (ε)
                            </Label>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-3 h-3 text-gray-400" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-64">
                                  Emissivity value for stair surfaces (grey body assumption: absorptivity = emissivity).
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                        <div className="flex items-center gap-2">
                          <Input
                            id="default-stair-emissivity"
                            type="number"
                            value={defaultStairEmissivity}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              if (!isNaN(value) && value >= 0 && value <= 1) {
                                setDefaultStairEmissivity(value);
                              }
                            }}
                            className="w-full h-8 text-xs"
                            min={0}
                            max={1}
                            step={0.01}
                            placeholder="0.90"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2D Tools Section */}
                <div className="space-y-4 mt-4">
                  <h3 className="font-semibold">2D Tools</h3>
                  <div className="flex gap-2">
                    <Button
                      variant={currentTool === "eraser" ? "default" : "outline"}
                      className="flex-1 h-16 flex flex-col items-center justify-center gap-1"
                      onClick={() => handleToolSelect("eraser")}
                    >
                      <Eraser className="w-6 h-6" />
                      <span className="text-xs">Eraser</span>
                    </Button>
                    <Button
                      variant={currentTool === "measure" ? "default" : "outline"}
                      className="flex-1 h-16 flex flex-col items-center justify-center gap-1"
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



                  {/* Height parameters moved to Parameters section */}
                </div>
              </div>
              )}

              {/* Building Parameters - Available in both 2D Editor and 3D Preview */}
              <div className="border rounded-lg p-4">
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm text-gray-700">Building Parameters</h4>
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
                        const floorParams = floorParameters[floorName] || { ceilingHeight: 220, floorDeck: 35, ceilingTemperature: 20, floorTemperature: 20, ceilingEmissivity: 0.90, floorEmissivity: 0.90 };
                        const isCurrentFloor = floorName === currentFloor;
                        
                        return (
                          <div 
                            key={floorName} 
                            className={cn(
                              "p-3 rounded-lg border transition-all duration-200",
                              isCurrentFloor 
                                ? "bg-blue-50 border-blue-200 ring-2 ring-blue-200" 
                                : "bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300",
                              !isCurrentFloor && "cursor-pointer"
                            )}
                            onClick={
                              !isCurrentFloor
                                ? () => handleFloorChange(floorName)
                                : undefined
                            }
                            title={
                              !isCurrentFloor 
                                ? `Click to switch to ${formatFloorText(floorName)}`
                                : `Currently viewing ${formatFloorText(floorName)}`
                            }
                          >
                            <h5 className="font-medium text-sm mb-3 flex items-center gap-2">
                              {formatFloorText(floorName)}
                              {isCurrentFloor && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Current</span>}
                              {!isCurrentFloor && (
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
                                <Label className="text-xs">Ceiling Emissivity (ε)</Label>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={floorParams.ceilingEmissivity ?? 0.90}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value);
                                      if (!isNaN(value) && value >= 0 && value <= 1) {
                                        updateFloorParameter(floorName, 'ceilingEmissivity', value);
                                      }
                                    }}
                                    className="w-16 h-8 text-xs"
                                  />
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
                              <div className="space-y-1">
                                <Label className="text-xs">Floor Emissivity (ε)</Label>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={floorParams.floorEmissivity ?? 0.90}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value);
                                      if (!isNaN(value) && value >= 0 && value <= 1) {
                                        updateFloorParameter(floorName, 'floorEmissivity', value);
                                      }
                                    }}
                                    className="w-16 h-8 text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                            
                            {/* Delete button for non-ground floors */}
                            {floorName !== "ground" && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-left justify-start hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                  onClick={() => handleDeleteFloorConfirm(floorName)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete {formatFloorText(floorName)}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {renderFilesMenu()}
              </div>
            </Panel>

            {/* Resizable handle */}
            <PanelResizeHandle className="w-1 bg-transparent hover:bg-gray-200 active:bg-gray-300 cursor-col-resize transition-colors" />

            {/* Right side - Canvas */}
            <Panel defaultSize={75} minSize={50}>
              {renderCanvasSection("tabs")}
            </Panel>
          </PanelGroup>
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
      
      {/* Floor Deletion Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Floor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {floorToDelete && formatFloorText(floorToDelete)}? 
              This will permanently remove all content including walls, windows, doors, 
              furniture, and stairs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={executeFloorDeletion}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Floor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  const renderStep2 = () => {
    return (
      <>
        <Card className="mt-4">
          <CardContent className="p-4">


            <PanelGroup direction="horizontal" className="h-full">
              {/* Left side menus - resizable panel */}
              <Panel defaultSize={25} minSize={15} maxSize={50}>
                <div className="space-y-6 overflow-y-auto pr-2" style={{ maxHeight: `${canvasHeight}px` }}>
                {/* Main options */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-xl mb-4 text-center">Add 3D Elements</h3>





                  {/* Furniture - Using FurnitureMenu component */}
                  <FurnitureMenu 
                    onDragStart={(item) => {
                      // Handle drag start if needed
                      console.log("Dragging furniture:", item);
                    }}
                    floorContext={{
                      currentFloor: currentFloor,
                      floors: floors
                    }}
                    onToggleFurnitureEraserMode={handleToggleFurnitureEraserMode}
                    isFurnitureEraserMode={isFurnitureEraserMode}
                  />
                </div>

                {/* Files section - unified */}
                {renderFilesMenu()}
                </div>
              </Panel>

              {/* Resizable handle */}
              <PanelResizeHandle className="w-1 bg-transparent hover:bg-gray-200 active:bg-gray-300 cursor-col-resize transition-colors" />

              {/* Main content area - using the same renderCanvasSection as 3D preview for consistency */}
              <Panel defaultSize={75} minSize={50}>
                {renderCanvasSection("step2")}
              </Panel>
            </PanelGroup>
          </CardContent>
        </Card>
      </>
    );
  };

  const renderStep3 = () => (
    <div className="space-y-6">
      {/* Simulation Information */}
      {renderSimulationInfo()}
      
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Summary (1/3 width) */}
        <div className="space-y-6">
          {/* Simulation Checkup and Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Simulation Checkup and Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Simulation name:</span>
                <span className="font-medium">{simulationName || "MySim"}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">CFD Category:</span>
                <span className="font-medium">
                  {cfdType === 'data-centers' ? 'Data Centers' : cfdType === 'indoor-spaces' ? 'Indoor Spaces' : cfdType === 'fire-smoke' ? 'Fire & Smoke' : 'Industrial Cooling'}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Type:</span>
                <span className="font-medium">
                  {simulationType === "comfort" ? "Steady" : "Air Renovation"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Cost:</span>
                <span className="font-medium text-blue-600">
                  depending on plan
                </span>
              </div>
              
              {/* Design Statistics Section */}
              <div className="pt-3 border-t">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Design Statistics</h4>
                {(() => {
                  let stats;
                  try {
                    stats = calculateDesignStats();
                  } catch (error) {
                    console.log("Error calculating stats:", error);
                    stats = null;
                  }
                  
                  return (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Floors:</span>
                        <span className="font-medium">{stats ? stats.floors : "0"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Stairs:</span>
                        <span className="font-medium">{stats ? stats.stairs : "0"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">AirEntry elements:</span>
                        <span className="font-medium">{stats ? stats.airEntries : "0"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">3D objects:</span>
                        <span className="font-medium">{stats ? stats.furniture : "0"}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Boundary Conditions Section */}
              <div className="pt-3 border-t">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Boundary Conditions</h4>
                {(() => {
                  let conditions;
                  try {
                    conditions = calculateBoundaryConditions();
                  } catch (error) {
                    console.log("Error calculating boundary conditions:", error);
                    conditions = null;
                  }
                  
                  const totalInflow = conditions ? (conditions.airEntry.inflow + conditions.furnVent.inflow) : 0;
                  const totalOutflow = conditions ? (conditions.airEntry.outflow + conditions.furnVent.outflow) : 0;
                  const totalPressureBCs = conditions ? conditions.pressureBCs : 0;
                  const hasValidBoundaryConditions = totalInflow >= 1 && totalOutflow >= 1;
                  const hasValidPressureConditions = totalPressureBCs >= 1;
                  
                  // Stair connectivity validation
                  let stats;
                  try {
                    stats = calculateDesignStats();
                  } catch (error) {
                    stats = null;
                  }
                  const totalFloors = stats ? stats.floors : 0;
                  const totalStairs = stats ? stats.stairs : 0;
                  const requiredStairs = totalFloors > 1 ? totalFloors - 1 : 0;
                  const hasValidStairConnectivity = totalFloors <= 1 || totalStairs >= requiredStairs;
                  
                  return (
                    <div className="space-y-2">
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Inflow:</span>
                          <span className="font-medium text-black">
                            {totalInflow} 
                            <span className="text-gray-500 ml-1">
                              ({conditions ? conditions.airEntry.inflow : "0"} AirEntries, {conditions ? conditions.furnVent.inflow : "0"} Horiz. Vents)
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Outflow:</span>
                          <span className="font-medium text-black">
                            {totalOutflow}
                            <span className="text-gray-500 ml-1">
                              ({conditions ? conditions.airEntry.outflow : "0"} AirEntries, {conditions ? conditions.furnVent.outflow : "0"} Horiz. Vents)
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Pressure BCs:</span>
                          <span className="font-medium text-black">
                            {conditions ? conditions.pressureBCs : "0"}
                            <span className="text-gray-500 ml-1">
                              (Windows/Doors + Pressure Vents)
                            </span>
                          </span>
                        </div>
                      </div>
                      
                      {/* Validation Alerts */}
                      {!hasValidBoundaryConditions && (
                        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
                          <div className="flex items-start">
                            <div className="flex-shrink-0">
                              <svg className="h-4 w-4 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="ml-2">
                              <h5 className="text-xs font-medium text-red-800">Insufficient Boundary Conditions (IBC)</h5>
                              <p className="text-xs text-red-700 mt-1">
                                Your simulation needs at least one Air-inlet and one Air-outlet. Please return to Step 1, or Step 2 and configure the Air Direction field. Set up at least one Inflow (where air enters) and one Outflow (where air exits) using either Wall Air Entries 2D or Floor/Ceiling Air Entries. Without these airflow boundaries, the simulation cannot determine how air moves through your space.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {!hasValidPressureConditions && (
                        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
                          <div className="flex items-start">
                            <div className="flex-shrink-0">
                              <svg className="h-4 w-4 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="ml-2">
                              <h5 className="text-xs font-medium text-red-800">Insufficient Boundary Pressure (IBS)</h5>
                              <p className="text-xs text-red-700 mt-1">
                                Please add at least an open window, or an open door, or configure an existing vent to use at least one Pressure flow type. Without a pressure reference, the simulation cannot determine the air movement in your space.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {!hasValidStairConnectivity && (
                        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
                          <div className="flex items-start">
                            <div className="flex-shrink-0">
                              <svg className="h-4 w-4 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="ml-2">
                              <h5 className="text-xs font-medium text-red-800">Insufficient Stair Connectivity (ISC)</h5>
                              <p className="text-xs text-red-700 mt-1">
                                Your stairs do not connect all floors, leaving some isolated. While possible, this may affect air flow accuracy. Please, add more Stairs elements to connect all floors, or analyze only connected floors (remove others) for realistic results.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Design Dimensions Section */}
              <div className="pt-3 border-t">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Design Dimensions</h4>
                {(() => {
                  let dimensions;
                  try {
                    dimensions = calculateDesignDimensions();
                  } catch (error) {
                    console.log("Error calculating dimensions:", error);
                    dimensions = null;
                  }
                  
                  return (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">X-axis (cm):</span>
                        <span className="font-mono">
                          {dimensions?.x ? `${dimensions.x.min?.replace(' cm', '') || 'NA'} to ${dimensions.x.max?.replace(' cm', '') || 'NA'} (${dimensions.x.distance?.replace(' cm', '') || 'NA'})` : "NA to NA (NA)"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Y-axis (cm):</span>
                        <span className="font-mono">
                          {dimensions?.y ? `${dimensions.y.min?.replace(' cm', '') || 'NA'} to ${dimensions.y.max?.replace(' cm', '') || 'NA'} (${dimensions.y.distance?.replace(' cm', '') || 'NA'})` : "NA to NA (NA)"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Z-axis (cm):</span>
                        <span className="font-mono">
                          {dimensions?.z ? `${dimensions.z.min?.replace(' cm', '') || 'NA'} to ${dimensions.z.max?.replace(' cm', '') || 'NA'} (${dimensions.z.distance?.replace(' cm', '') || 'NA'})` : "NA to NA (NA)"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Container Vol (m³):</span>
                        <span className="font-mono">
                          {dimensions?.volume ? dimensions.volume.replace(' m³', '') : "NA"}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Subscription Plans (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Subscription Plans Card - Horizontal Layout */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Subscription Plans</CardTitle>
              <CardDescription>Save money with our subscription options</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {/* Pay as You Go (Current) */}
                <div className="p-3 border rounded-lg bg-gray-50 border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-gray-700 text-sm">Pay as You Go</span>
                    <span className="text-xs font-medium text-gray-600">Current</span>
                  </div>
                  <div className="text-lg font-bold text-gray-900 mb-2">€9.99<span className="text-xs font-normal text-gray-600">/sim</span></div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>• Analysis tools</div>
                    <div>• Online results viewer</div>
                    <div>• 5 cases retention</div>
                    <div>• PDF reporting</div>
                    <div>• No commitment</div>
                  </div>
                </div>

                {/* Annual Subscription */}
                <div className="p-3 border-2 rounded-lg bg-blue-50 border-blue-400 relative">
                  <span className="absolute -top-2 right-2 bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded">Most Popular</span>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-blue-900 text-sm">Annual Subscription</span>
                  </div>
                  <div className="text-lg font-bold text-blue-600 mb-1">
                    €39.99<span className="text-xs font-normal text-blue-700">/month</span>
                  </div>
                  <div className="text-xs text-blue-700 mb-2">Billed annually at €479.88</div>
                  <div className="text-xs text-blue-800 space-y-1">
                    <div>• <strong>10 FREE</strong> sims/month</div>
                    <div>• Extra sims at €5.99</div>
                    <div>• 20 cases retention</div>
                    <div>• Priority support</div>
                    <div>• Flexible cancellation</div>
                  </div>
                </div>

                {/* Custom Solutions */}
                <div className="p-3 border rounded-lg bg-purple-50 border-purple-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-purple-900 text-sm">Custom Solutions</span>
                  </div>
                  <div className="text-lg font-bold text-purple-600 mb-2">Custom</div>
                  <div className="text-xs text-purple-800 space-y-1 mb-3">
                    <div>• Tailored development</div>
                    <div>• CFD expertise</div>
                    <div>• Custom interface</div>
                    <div>• Advanced analysis</div>
                    <div>• Dedicated support</div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full text-xs border-purple-300 text-purple-700 hover:bg-purple-100"
                    onClick={() => {
                      setLocation('/');
                      setTimeout(() => {
                        const element = document.getElementById('contact');
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth' });
                        }
                      }, 100);
                    }}
                    data-testid="button-contact-custom"
                  >
                    Contact Us
                  </Button>
                </div>
              </div>

              <div className="pt-3 border-t mt-4">
                <p className="text-xs text-gray-500 text-center">
                  All plans include 3D visualization, CFD analysis, and cloud storage
                </p>
              </div>
            </CardContent>
          </Card>
        </div>


      </div>

      {/* Launch Simulation Button */}
      <div className="flex justify-center pt-4">
        <Button
          size="lg"
          className={cn(
            "px-8 py-3 text-base font-semibold transition-all duration-300",
            isValidationPassing
              ? "bg-green-500 hover:bg-green-600 text-white shadow-md"
              : "bg-gray-300 text-gray-500 cursor-not-allowed hover:bg-gray-300"
          )}
          disabled={!isValidationPassing || isCreatingSimulation}
          onClick={() => {
            if (isValidationPassing) handleStartSimulation();
          }}
        >
          {isCreatingSimulation ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Launching...
            </>
          ) : (
            <>
              <Rocket className="mr-2 h-5 w-5" />
              Launch Simulation
            </>
          )}
        </Button>
      </div>

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
              serverProperties: furnitureItem.serverProperties, // Include server/rack properties for JSON export
              filePath: furnitureItem.filePath, // Include STL file path for custom objects
              dimensions: furnitureItem.dimensions // Include dimensions for JSON export
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
    const baseData = generateSimulationData(
      rawFloors,
      furnitureObjects,
      getCurrentCeilingHeight() / 100,
      floorParameters,
      simulationName || undefined
    );
    
    const cfdTypeToSimType: Record<string, string> = {
      'data-centers': 'DataCenters',
      'fire-smoke': 'FirePropagation',
      'indoor-spaces': 'IndoorSpaces',
      'industrial-cooling': 'IndustrialCooling',
    };
    const { case_name, version, ...restData } = baseData;
    return {
      case_name,
      simulation_type: cfdTypeToSimType[cfdType] || 'IndoorSpaces',
      simulationType: simulationType,
      version,
      ...restData
    };
  };

  // Estado para el diálogo de confirmación de simulación
  const [showStartSimulationDialog, setShowStartSimulationDialog] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState("completed");
  const [isCreatingSimulation, setIsCreatingSimulation] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  // Función para mostrar el diálogo de tipo de simulación
  const handleStartSimulation = () => {
    // ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
    // Limpiar contraseña cuando se abre el diálogo
    setSimulationPassword("");
    setShowSimulationTypeDialog(true);
  };

  // Función para crear simulación HVAC
  const handleCreateHVACSimulation = async () => {
    setShowSimulationTypeDialog(false);
    setIsCreatingSimulation(true);

    try {
      // Generar datos de simulación completos desde el diseño actual
      const simulationData = generateSimulationDataForExport();
      
      console.log('[FRONTEND] Creating HVAC simulation with type:', simulationType);
      
      // ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
      // Incluir contraseña en el body de la petición
      // Esta funcionalidad será eliminada próximamente
      const response = await fetch("/api/simulations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: `HVAC ${simulationType === 'SteadySim' ? 'Steady TEST' : 'Transient'} - ${simulationData.case_name}`,
          simulationType: simulationType,
          status: "pending",
          jsonConfig: simulationData,
          password: simulationPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Error creating HVAC simulation");
      }

      console.log('[FRONTEND] HVAC simulation created:', result);

      // Invalidate queries to refresh dashboard
      await queryClient.invalidateQueries({ queryKey: ["/api/simulations"] });

      toast({
        title: "Simulación HVAC Creada",
        description: `Type: ${simulationType === 'SteadySim' ? 'Steady Simulation TEST (3 iter)' : 'Transient Simulation'}. The worker will process this simulation shortly.`,
      });

      // Redirect to dashboard
      setTimeout(() => {
        setLocation("/dashboard");
      }, 1000);

    } catch (error) {
      console.error('[FRONTEND] Error creating HVAC simulation:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al crear la simulación HVAC",
        variant: "destructive",
      });
    } finally {
      setIsCreatingSimulation(false);
      // ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
      // Limpiar contraseña después de intentar crear la simulación
      setSimulationPassword("");
    }
  };

  // Function to get simulation cost
  const getSimulationCost = (type: string) => {
    return type === 'SteadySim' ? 10 : 12; // Steady Simulation TEST: €10, Transient: €12
  };

  // Función para calcular las dimensiones del diseño (coordenadas min/max)
  const calculateDesignDimensions = () => {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    // Analizar coordenadas directamente del store (más confiable)
    Object.entries(rawFloors).forEach(([floorName, floorData]) => {
      // Analizar lines (paredes) - sabemos que funcionan
      if (floorData.lines && Array.isArray(floorData.lines)) {
        floorData.lines.forEach((line) => {
          if (line && line.start && line.end) {
            const points = [line.start, line.end];
            points.forEach((point) => {
              if (point && typeof point.x === 'number' && typeof point.y === 'number') {
                if (point.x < minX) minX = point.x;
                if (point.x > maxX) maxX = point.x;
                if (point.y < minY) minY = point.y;
                if (point.y > maxY) maxY = point.y;
              }
            });
          }
        });
      }

      // Analizar air entries
      if (floorData.airEntries && Array.isArray(floorData.airEntries)) {
        floorData.airEntries.forEach((entry) => {
          if (entry && entry.position) {
            if (typeof entry.position.x === 'number' && typeof entry.position.y === 'number') {
              if (entry.position.x < minX) minX = entry.position.x;
              if (entry.position.x > maxX) maxX = entry.position.x;
              if (entry.position.y < minY) minY = entry.position.y;
              if (entry.position.y > maxY) maxY = entry.position.y;
            }
            // Z para height
            if (entry.centerHeight && typeof entry.centerHeight === 'number') {
              if (entry.centerHeight < minZ) minZ = entry.centerHeight;
              if (entry.centerHeight > maxZ) maxZ = entry.centerHeight;
            }
          }
        });
      }

      // Analizar furniture items
      if (floorData.furnitureItems && Array.isArray(floorData.furnitureItems)) {
        floorData.furnitureItems.forEach((item) => {
          if (item && item.position) {
            if (typeof item.position.x === 'number' && typeof item.position.y === 'number' && typeof item.position.z === 'number') {
              if (item.position.x < minX) minX = item.position.x;
              if (item.position.x > maxX) maxX = item.position.x;
              if (item.position.y < minY) minY = item.position.y;
              if (item.position.y > maxY) maxY = item.position.y;
              if (item.position.z < minZ) minZ = item.position.z;
              if (item.position.z > maxZ) maxZ = item.position.z;
            }
          }
        });
      }

      // Analizar stairs
      if (floorData.stairPolygons && Array.isArray(floorData.stairPolygons)) {
        floorData.stairPolygons.forEach((stair) => {
          if (stair && stair.points && Array.isArray(stair.points)) {
            stair.points.forEach((point) => {
              if (point && typeof point.x === 'number' && typeof point.y === 'number') {
                if (point.x < minX) minX = point.x;
                if (point.x > maxX) maxX = point.x;
                if (point.y < minY) minY = point.y;
                if (point.y > maxY) maxY = point.y;
              }
            });
          }
        });
      }
    });

    // Si no hay coordenadas válidas, devolver valores por defecto con NA
    if (minX === Infinity || maxX === -Infinity) {
      return {
        x: { min: "NA", max: "NA", distance: "NA" },
        y: { min: "NA", max: "NA", distance: "NA" },
        z: { min: "NA", max: "NA", distance: "NA" }
      };
    }

    // Z por defecto si no hay datos de altura
    if (minZ === Infinity) minZ = 0;
    if (maxZ === -Infinity) maxZ = 250; // altura por defecto en cm

    // Calcular volumen del contenedor en m3
    const volumeM3 = ((maxX - minX) * (maxY - minY) * (maxZ - minZ)) / 1000000; // cm3 a m3

    return {
      x: { min: `${minX.toFixed(0)} cm`, max: `${maxX.toFixed(0)} cm`, distance: `${(maxX - minX).toFixed(0)} cm` },
      y: { min: `${minY.toFixed(0)} cm`, max: `${maxY.toFixed(0)} cm`, distance: `${(maxY - minY).toFixed(0)} cm` },
      z: { min: `${minZ.toFixed(0)} cm`, max: `${maxZ.toFixed(0)} cm`, distance: `${(maxZ - minZ).toFixed(0)} cm` },
      volume: `${volumeM3.toFixed(2)} m3`
    };
  };

  // Función para calcular estadísticas del diseño
  const calculateDesignStats = () => {
    let totalFloors = 0;
    let totalStairs = 0;
    let totalAirEntries = 0;
    let totalFurniture = 0;

    Object.entries(rawFloors).forEach(([floorName, floorData]) => {
      totalFloors += 1;

      // Contar stairs (excluyendo stairs importadas/conectadas)
      if (floorData.stairPolygons && Array.isArray(floorData.stairPolygons)) {
        // Solo contar stairs originales, no las importadas
        const originalStairs = floorData.stairPolygons.filter(stair => !stair.isImported);
        totalStairs += originalStairs.length;
      }

      // Contar air entries
      if (floorData.airEntries && Array.isArray(floorData.airEntries)) {
        totalAirEntries += floorData.airEntries.length;
      }

      // Contar furniture (objetos RSP)
      if (floorData.furnitureItems && Array.isArray(floorData.furnitureItems)) {
        totalFurniture += floorData.furnitureItems.length;
      }
    });

    return {
      floors: totalFloors,
      stairs: totalStairs,
      airEntries: totalAirEntries,
      furniture: totalFurniture
    };
  };

  // Función para calcular condiciones de contorno (boundary conditions)
  const calculateBoundaryConditions = () => {
    let airEntryInflow = 0;
    let airEntryOutflow = 0;
    let furnVentInflow = 0;
    let furnVentOutflow = 0;
    let pressureBCs = 0; // Contador de boundary conditions de presión

    Object.entries(rawFloors).forEach(([floorName, floorData]) => {
      // Analizar AirEntry elements (windows, doors, vents en paredes)
      if (floorData.airEntries && Array.isArray(floorData.airEntries)) {
        floorData.airEntries.forEach((entry) => {
          if (entry && entry.properties && entry.properties.airOrientation) {
            // Solo contar si el elemento está en estado 'open' (no cerrado)
            const isOpen = !entry.properties.state || entry.properties.state === 'open';
            
            if (isOpen) {
              if (entry.properties.airOrientation === 'inflow') {
                airEntryInflow += 1;
              } else if (entry.properties.airOrientation === 'outflow') {
                airEntryOutflow += 1;
              }

              // Contar Pressure BCs para AirEntry elements
              if (entry.type === 'window' || entry.type === 'door') {
                // Puertas y ventanas siempre son presión (si están abiertas)
                pressureBCs += 1;
              } else if (entry.type === 'vent' && entry.properties.flowType === 'Pressure') {
                // AirEntry Vents solo si su flowType es 'Pressure' (y están abiertas)
                pressureBCs += 1;
              }
            }
          }
        });
      }

      // Analizar FurnVent objects (ceiling/floor vents)
      if (floorData.furnitureItems && Array.isArray(floorData.furnitureItems)) {
        floorData.furnitureItems.forEach((item) => {
          if (item && item.type === 'vent' && item.simulationProperties && item.simulationProperties.airDirection) {
            // Solo contar si el elemento está en estado 'open' (no cerrado)
            const isOpen = !item.simulationProperties.state || item.simulationProperties.state === 'open';
            
            if (isOpen) {
              if (item.simulationProperties.airDirection === 'inflow') {
                furnVentInflow += 1;
              } else if (item.simulationProperties.airDirection === 'outflow') {
                furnVentOutflow += 1;
              }

              // Contar Pressure BCs para FurnVent objects
              if (item.simulationProperties.flowType === 'Pressure') {
                pressureBCs += 1;
              }
            }
          }
        });
      }
    });

    return {
      airEntry: {
        inflow: airEntryInflow,
        outflow: airEntryOutflow,
        total: airEntryInflow + airEntryOutflow
      },
      furnVent: {
        inflow: furnVentInflow,
        outflow: furnVentOutflow,
        total: furnVentInflow + furnVentOutflow
      },
      pressureBCs: pressureBCs // Total de boundary conditions de presión
    };
  };

  const isValidationPassing = useMemo(() => {
    try {
      const conditions = calculateBoundaryConditions();
      const totalInflow = conditions.airEntry.inflow + conditions.furnVent.inflow;
      const totalOutflow = conditions.airEntry.outflow + conditions.furnVent.outflow;
      const totalPressureBCs = conditions.pressureBCs;
      const hasValidBoundary = totalInflow >= 1 && totalOutflow >= 1;
      const hasValidPressure = totalPressureBCs >= 1;

      const stats = calculateDesignStats();
      const totalFloors = stats.floors;
      const totalStairs = stats.stairs;
      const requiredStairs = totalFloors > 1 ? totalFloors - 1 : 0;
      const hasValidStairs = totalFloors <= 1 || totalStairs >= requiredStairs;

      return hasValidBoundary && hasValidPressure && hasValidStairs;
    } catch {
      return false;
    }
  }, [rawFloors]);

  // Función para crear la simulación real
  const handleConfirmCreateSimulation = async () => {
    setIsCreatingSimulation(true);
    
    try {
      
      const exportData = generateSimulationDataForExport();

      // ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
      // Llamar al nuevo endpoint para crear la simulación con contraseña
      // Esta funcionalidad será eliminada próximamente
      const response = await fetch("/api/simulations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: simulationName,
          simulationType,
          status: simulationStatus,
          jsonConfig: exportData,
          password: simulationPassword, // TEMPORARY: contraseña de lanzamiento
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Error creating simulation");
      }

      // Invalidate the simulations cache to refresh dashboard data
      await queryClient.invalidateQueries({ queryKey: ["/api/simulations"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }); // Update user credits

      toast({
        title: "Simulation Created Successfully",
        description: result.message,
      });

      // Cerrar diálogo
      setShowStartSimulationDialog(false);
      
      // Add a small delay before redirect to ensure state updates complete
      setTimeout(() => {
        setLocation("/dashboard");
      }, 100);

    } catch (error) {
      console.error("Error creating simulation:", error);
      toast({
        title: "Error Creating Simulation",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsCreatingSimulation(false);
      // ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ==========
      // Limpiar contraseña después de intentar crear la simulación
      setSimulationPassword("");
    }
  };

  // Función para guardar el diseño localmente como archivo JSON
  const handleSaveDesign = () => {
    const exportData = generateSimulationDataForExport();

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
      ground: { ceilingHeight: 220, floorDeck: 35, ceilingTemperature: 20, floorTemperature: 20, ceilingEmissivity: 0.90, floorEmissivity: 0.90 }
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
        
        // Special cleanup for vents/nozzles with special rendering properties
        if (furnitureGroup.userData.furnitureType === 'vent' || furnitureGroup.userData.furnitureType === 'nozzle') {
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

  };

  // Función para manejar la carga de un diseño desde JSON
  const handleLoadDesign = (designData: any) => {
    try {

      
      // Primero limpiar el estado actual
      reset();
      
      if (designData.case_name) {
        setSimulationName(designData.case_name);
      }
      
      if (designData.simulation_type) {
        const simTypeToConfig: Record<string, string> = {
          'DataCenters': 'data-centers',
          'FirePropagation': 'fire-smoke',
          'IndoorSpaces': 'indoor-spaces',
          'IndustrialCooling': 'industrial-cooling',
        };
        const mappedType = simTypeToConfig[designData.simulation_type];
        if (mappedType) {
          setCfdType(mappedType);
        }
      }
      
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
      
      // Soporte para formato nuevo (levels) y antiguo (floors)
      const floorsData = designData.levels || designData.floors;
      if (!floorsData) {
        throw new Error("No se encontraron datos de plantas (levels/floors)");
      }
      
      Object.entries(floorsData).forEach(([floorNumber, floorData]: [string, any]) => {
        const floorName = floorNameMap[floorNumber] || `floor_${floorNumber}`;
        console.log(`🔍 IMPORT DEBUG: Processing floor ${floorNumber} → ${floorName}`, floorData);
        
        // Convertir coordenadas del JSON de vuelta al sistema interno
        // JSON está en S.I. units (metros), convertir a centímetros primero
        const convertedLines = (floorData.walls || []).map((wall: any, wallIndex: number) => {
          // Convertir metros a centímetros (* 100), luego aplicar denormalizeCoordinates
          const startInCm = { x: wall.start.x * 100, y: wall.start.y * 100 };
          const endInCm = { x: wall.end.x * 100, y: wall.end.y * 100 };
          
          const start = denormalizeCoordinates(startInCm);
          const end = denormalizeCoordinates(endInCm);

          // Assign unique ID to each line for proper vertex editing/dragging
          const id = wall.id || `line_${floorNumber}_${wallIndex}_${Date.now()}`;
          return { start, end, id };
        });

        // Extraer temperaturas, materiales y emisividades de las paredes del JSON para preservarlas
        const wallTemperatures = new Map<string, number>();
        const wallMaterials = new Map<string, string>();
        const wallEmissivities = new Map<string, number>();
        (floorData.walls || []).forEach((wall: any) => {
          const startInCm = { x: wall.start.x * 100, y: wall.start.y * 100 };
          const endInCm = { x: wall.end.x * 100, y: wall.end.y * 100 };
          
          const start = denormalizeCoordinates(startInCm);
          const end = denormalizeCoordinates(endInCm);
          
          // Crear clave única para la línea basada en coordenadas
          const lineKey = `${start.x.toFixed(2)},${start.y.toFixed(2)}-${end.x.toFixed(2)},${end.y.toFixed(2)}`;
          wallTemperatures.set(lineKey, wall.temp || 20);
          wallMaterials.set(lineKey, wall.material || 'default');
          wallEmissivities.set(lineKey, wall.emissivity ?? 0.90);
        });
        
        // Procesar air entries tanto del formato antiguo como nuevo
        let airEntries = [];
        
        // Formato nuevo: air entries en walls
        if (floorData.walls) {
          floorData.walls.forEach((wall: any, wallIndex: number) => {
            if (wall.airEntries && wall.airEntries.length > 0) {
              // Calcular la línea de esta pared para asociarla con los AirEntries
              const startInCm = { x: wall.start.x * 100, y: wall.start.y * 100 };
              const endInCm = { x: wall.end.x * 100, y: wall.end.y * 100 };
              const wallLineStart = denormalizeCoordinates(startInCm);
              const wallLineEnd = denormalizeCoordinates(endInCm);
              const wallLine = { start: wallLineStart, end: wallLineEnd };
              
              wall.airEntries.forEach((entry: any) => {
                // Convertir metros a centímetros (* 100), luego aplicar denormalizeCoordinates
                const positionInCm = { x: entry.position.x * 100, y: entry.position.y * 100 };
                const denormalizedPosition = denormalizeCoordinates(positionInCm);
                
                airEntries.push({
                  id: entry.id, // Preservar ID del JSON
                  type: entry.type,
                  position: denormalizedPosition,
                  dimensions: {
                    width: (entry.dimensions?.width * 100) || 100, // Convertir metros a centímetros
                    height: (entry.dimensions?.height * 100) || 100,
                    distanceToFloor: (entry.position?.z * 100) || 110 // Convertir metros a centímetros, default 110cm
                  },
                  properties: { // Mapear correctamente las propiedades de simulación
                    state: entry.simulation?.state || 'closed',
                    temperature: entry.simulation?.temperature || 20,
                    material: entry.simulation?.material || (entry.type === 'window' ? 'glass' : entry.type === 'door' ? 'wood' : 'default'),
                    emissivity: entry.simulation?.emissivity ?? (entry.type === 'window' ? 0.92 : 0.90),
                    flowIntensity: entry.simulation?.flowIntensity || 'medium',
                    airOrientation: entry.simulation?.airDirection || 'inflow',
                    flowType: entry.simulation?.flowType || 'airMassFlow',
                    // Mapear customValue solo cuando flowIntensity es "custom"
                    ...(entry.simulation?.flowIntensity === 'custom' && entry.simulation?.customValue && {
                      customIntensityValue: entry.simulation.customValue
                    }),
                    // También manejar el formato anterior customIntensityValue
                    ...(entry.simulation?.customIntensityValue && {
                      customIntensityValue: entry.simulation.customIntensityValue
                    }),
                    // Mapear ángulos de orientación del aire si están presentes
                    ...(entry.simulation?.airOrientation?.verticalAngle !== undefined && {
                      verticalAngle: entry.simulation.airOrientation.verticalAngle
                    }),
                    ...(entry.simulation?.airOrientation?.horizontalAngle !== undefined && {
                      horizontalAngle: entry.simulation.airOrientation.horizontalAngle
                    })
                  },
                  line: wallLine // Asociar con la línea de pared correcta
                });
              });
            }
          });
        }
        
        // Formato antiguo: air entries directo en floor
        if (floorData.airEntries) {
          floorData.airEntries.forEach((entry: any) => {
            // Convertir metros a centímetros (* 100), luego aplicar denormalizeCoordinates
            const positionInCm = { x: entry.position.x * 100, y: entry.position.y * 100 };
            const denormalizedPosition = denormalizeCoordinates(positionInCm);
            
            // Para formato antiguo, buscar la línea más cercana basada en la posición
            let closestLine = { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
            let minDistance = Infinity;
            
            convertedLines.forEach((line: any) => {
              const distance = Math.abs(
                ((line.end.y - line.start.y) * denormalizedPosition.x) -
                ((line.end.x - line.start.x) * denormalizedPosition.y) +
                (line.end.x * line.start.y) -
                (line.end.y * line.start.x)
              ) / Math.sqrt(
                Math.pow(line.end.y - line.start.y, 2) +
                Math.pow(line.end.x - line.start.x, 2)
              );
              
              if (distance < minDistance) {
                minDistance = distance;
                closestLine = line;
              }
            });
            
            airEntries.push({
              id: entry.id, // Preservar ID del JSON
              type: entry.type,
              position: denormalizedPosition,
              dimensions: {
                width: (entry.dimensions?.width * 100) || 100, // Convertir metros a centímetros
                height: (entry.dimensions?.height * 100) || 100,
                distanceToFloor: (entry.position?.z * 100) || 110 // Convertir metros a centímetros, default 110cm
              },
              properties: { // Mapear correctamente las propiedades de simulación
                state: entry.simulation?.state || 'closed',
                temperature: entry.simulation?.temperature || 20,
                material: entry.simulation?.material || (entry.type === 'window' ? 'glass' : entry.type === 'door' ? 'wood' : 'default'),
                emissivity: entry.simulation?.emissivity ?? (entry.type === 'window' ? 0.92 : 0.90),
                flowIntensity: entry.simulation?.flowIntensity || 'medium',
                airOrientation: entry.simulation?.airDirection || 'inflow',
                flowType: entry.simulation?.flowType || 'airMassFlow',
                // Mapear customValue solo cuando flowIntensity es "custom"
                ...(entry.simulation?.flowIntensity === 'custom' && entry.simulation?.customValue && {
                  customIntensityValue: entry.simulation.customValue
                }),
                // También manejar el formato anterior customIntensityValue
                ...(entry.simulation?.customIntensityValue && {
                  customIntensityValue: entry.simulation.customIntensityValue
                }),
                // Mapear ángulos de orientación del aire si están presentes
                ...(entry.simulation?.airOrientation?.verticalAngle !== undefined && {
                  verticalAngle: entry.simulation.airOrientation.verticalAngle
                }),
                ...(entry.simulation?.airOrientation?.horizontalAngle !== undefined && {
                  horizontalAngle: entry.simulation.airOrientation.horizontalAngle
                })
              },
              line: closestLine // Asociar con la línea más cercana
            });
          });
        }
        
        const convertedAirEntries = airEntries;
        
        // Procesar escaleras: el JSON puede tener formato 'lines' o 'points'
        const convertedStairs = (floorData.stairs || []).map((stair: any) => {
          let points = [];
          
          if (stair.lines) {
            // Formato nuevo: usar lines para crear puntos del polígono
            points = stair.lines.map((line: any) => {
              const startInCm = { x: line.start.x * 100, y: line.start.y * 100 };
              return denormalizeCoordinates(startInCm);
            });
            
            // Añadir el último punto si no forma un polígono cerrado
            const lastLine = stair.lines[stair.lines.length - 1];
            const endInCm = { x: lastLine.end.x * 100, y: lastLine.end.y * 100 };
            const lastPoint = denormalizeCoordinates(endInCm);
            
            // Solo añadir si no es igual al primer punto (evitar duplicados)
            const firstPoint = points[0];
            if (firstPoint && (Math.abs(lastPoint.x - firstPoint.x) > 1 || Math.abs(lastPoint.y - firstPoint.y) > 1)) {
              points.push(lastPoint);
            }
          } else if (stair.points) {
            // Formato antiguo: usar points directamente
            points = stair.points.map((p: any) => denormalizeCoordinates({ x: p.x, y: p.y }));
          }
          
          return {
            id: stair.id,
            points: points,
            floor: floorName,
            direction: stair.direction || 'up',
            connectsTo: stair.connectsTo,
            isImported: !!stair.connectsTo,
            temperature: stair.temp || 20,
            emissivity: stair.emissivity ?? 0.90
          };
        });
        
        // Procesar vents horizontales (ceiling y floor_surf)
        const horizontalVents: any[] = [];
        console.log(`🔍 VENTS DEBUG: Floor ${floorName} ceiling airEntries:`, floorData.ceiling?.airEntries);
        console.log(`🔍 VENTS DEBUG: Floor ${floorName} floor_surf airEntries:`, floorData.floor_surf?.airEntries);
        
        // Procesar ceiling vents
        if (floorData.ceiling?.airEntries) {
          floorData.ceiling.airEntries.forEach((entry: any) => {
            if (entry.type === 'vent') {
              // Convertir metros a centímetros (* 100) directamente, SIN denormalizeCoordinates
              const positionInCm = { x: entry.position.x * 100, y: entry.position.y * 100 };
              
              horizontalVents.push({
                id: entry.id,
                type: 'vent' as const,
                name: entry.id,
                floorName: floorName,
                position: {
                  x: positionInCm.x,
                  y: positionInCm.y,
                  z: (entry.position?.z * 100) || 220 // Convertir metros a cm, default ceiling height
                },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
                dimensions: {
                  width: (entry.dimensions?.width * 100) || 50, // Convertir metros a centímetros
                  height: (entry.dimensions?.height * 100) || 50,
                  depth: 1 // Mínimo espesor para vents horizontales
                },
                surfaceType: 'ceiling' as const,
                properties: {
                  material: entry.simulation?.material || 'default',
                  emissivity: entry.simulation?.emissivity ?? 0.90,
                  temperature: entry.simulation?.temperature || 20
                },
                simulationProperties: {
                  state: entry.simulation?.state || 'closed',
                  airTemperature: entry.simulation?.temperature || 20,
                  material: entry.simulation?.material || 'default',
                  emissivity: entry.simulation?.emissivity ?? 0.90,
                  airOrientation: entry.simulation?.airDirection || 'inflow',
                  flowType: entry.simulation?.flowType || 'airMassFlow',
                  flowIntensity: entry.simulation?.flowIntensity || 'medium',
                  // Mapear customValue solo cuando flowIntensity es "custom"
                  ...(entry.simulation?.flowIntensity === 'custom' && entry.simulation?.customValue && {
                    customIntensityValue: entry.simulation.customValue
                  }),
                  // Mapear ángulos de orientación del aire si están presentes
                  ...(entry.simulation?.airOrientation?.verticalAngle !== undefined && {
                    verticalAngle: entry.simulation.airOrientation.verticalAngle
                  }),
                  ...(entry.simulation?.airOrientation?.horizontalAngle !== undefined && {
                    horizontalAngle: entry.simulation.airOrientation.horizontalAngle
                  }),
                  normalVector: { x: 0, y: 0, z: -1 } // Ceiling vents apuntan hacia abajo
                }
              });
            }
          });
        }
        
        // Procesar floor vents (soporte para formato nuevo "floor" y antiguo "floor_surf")
        const floorSurfData = floorData.floor || floorData.floor_surf;
        if (floorSurfData?.airEntries) {
          floorSurfData.airEntries.forEach((entry: any) => {
            if (entry.type === 'vent') {
              // Convertir metros a centímetros (* 100) directamente, SIN denormalizeCoordinates
              const positionInCm = { x: entry.position.x * 100, y: entry.position.y * 100 };
              
              horizontalVents.push({
                id: entry.id,
                type: 'vent' as const,
                name: entry.id,
                floorName: floorName,
                position: {
                  x: positionInCm.x,
                  y: positionInCm.y,
                  z: (entry.position?.z * 100) || 0 // Convertir metros a cm, default floor level
                },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
                dimensions: {
                  width: (entry.dimensions?.width * 100) || 50, // Convertir metros a centímetros
                  height: (entry.dimensions?.height * 100) || 50,
                  depth: 1 // Mínimo espesor para vents horizontales
                },
                surfaceType: 'floor' as const,
                properties: {
                  material: entry.simulation?.material || 'default',
                  emissivity: entry.simulation?.emissivity ?? 0.90,
                  temperature: entry.simulation?.temperature || 20
                },
                simulationProperties: {
                  state: entry.simulation?.state || 'closed',
                  airTemperature: entry.simulation?.temperature || 20,
                  material: entry.simulation?.material || 'default',
                  emissivity: entry.simulation?.emissivity ?? 0.90,
                  airOrientation: entry.simulation?.airDirection || 'inflow',
                  flowType: entry.simulation?.flowType || 'airMassFlow',
                  flowIntensity: entry.simulation?.flowIntensity || 'medium',
                  // Mapear customValue solo cuando flowIntensity es "custom"
                  ...(entry.simulation?.flowIntensity === 'custom' && entry.simulation?.customValue && {
                    customIntensityValue: entry.simulation.customValue
                  }),
                  // Mapear ángulos de orientación del aire si están presentes
                  ...(entry.simulation?.airOrientation?.verticalAngle !== undefined && {
                    verticalAngle: entry.simulation.airOrientation.verticalAngle
                  }),
                  ...(entry.simulation?.airOrientation?.horizontalAngle !== undefined && {
                    horizontalAngle: entry.simulation.airOrientation.horizontalAngle
                  }),
                  normalVector: { x: 0, y: 0, z: 1 } // Floor vents apuntan hacia arriba
                }
              });
            }
          });
        }

        // Procesar furniture 3D elements
        const furnitureItems: any[] = [];
        if (floorData.furniture) {
          floorData.furniture.forEach((item: any) => {
            // Face-based format: reconstruct position/dimensions/rotation/properties from faces
            if (item.faces && !item.position) {
              const faceEntries = Object.values(item.faces) as any[];
              
              // Determine type: vent role on top = topVentBox, vent role on front = sideVentBox, inlet = rack
              const hasVentFace = faceEntries.some((f: any) => f.role === 'vent');
              const hasInletFace = faceEntries.some((f: any) => f.role === 'inlet');
              const ventOnFront = item.faces.front?.role === 'vent';
              const furnitureBoxType = hasVentFace 
                ? (ventOnFront ? 'sideVentBox' : 'topVentBox') 
                : (hasInletFace ? 'rack' : 'rack');
              const defaultDims = getDefaultDimensions(furnitureBoxType);
              
              // Find faces by role (preferred) with fallback to named keys
              const inletFace = faceEntries.find((f: any) => f.role === 'inlet') || item.faces.front;
              const outletFace = faceEntries.find((f: any) => f.role === 'outlet') || item.faces.back;
              const wallFace = faceEntries.find((f: any) => f.role === 'wall') || item.faces.left;
              
              // Reconstruct local axes from inlet (front) face to recover rotation
              const fv = inletFace?.vertices || [[0,0,0],[1,0,0],[1,0,1],[0,0,1]];
              // Front face edge vectors: widthDir (v0->v1), heightDir (v0->v3)
              const widthDir = [fv[1][0] - fv[0][0], fv[1][1] - fv[0][1], fv[1][2] - fv[0][2]];
              const heightDir = [fv[3][0] - fv[0][0], fv[3][1] - fv[0][1], fv[3][2] - fv[0][2]];
              // depthDir = from front face center to back face center
              const frontCenter = [
                (fv[0][0] + fv[1][0] + fv[2][0] + fv[3][0]) / 4,
                (fv[0][1] + fv[1][1] + fv[2][1] + fv[3][1]) / 4,
                (fv[0][2] + fv[1][2] + fv[2][2] + fv[3][2]) / 4
              ];
              const bv = outletFace?.vertices || fv;
              const backCenter = [
                (bv[0][0] + bv[1][0] + bv[2][0] + bv[3][0]) / 4,
                (bv[0][1] + bv[1][1] + bv[2][1] + bv[3][1]) / 4,
                (bv[0][2] + bv[1][2] + bv[2][2] + bv[3][2]) / 4
              ];
              const depthDir = [backCenter[0] - frontCenter[0], backCenter[1] - frontCenter[1], backCenter[2] - frontCenter[2]];
              
              // Compute dimensions from edge lengths (meters)
              const norm = (v: number[]) => Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
              const dimW = norm(widthDir);
              const dimH = norm(heightDir);
              const dimD = norm(depthDir);
              
              // Compute rotation from depth direction (Y-axis in local space)
              // Export rotation: global depthDir = (-sinZ, cosZ), so rotZ = atan2(-depthDir.x, depthDir.y)
              const rotZ = Math.atan2(-depthDir[0], depthDir[1]);
              // For X rotation: angle of depth dir relative to XY plane
              const depthHoriz = Math.sqrt(depthDir[0]*depthDir[0] + depthDir[1]*depthDir[1]);
              const rotX = -Math.atan2(depthDir[2], depthHoriz);
              
              // Position: center of rack bottom = midpoint between front and back face bottom edges
              const centerX = (frontCenter[0] + backCenter[0]) / 2;
              const centerY = (frontCenter[1] + backCenter[1]) / 2;
              // Bottom Z from lowest vertex
              const allVerts = faceEntries.flatMap((f: any) => f.vertices || []);
              const minZ = Math.min(...allVerts.map((v: number[]) => v[2]));
              
              const computedScale = {
                x: (dimW * 100) / defaultDims.width,
                y: (dimD * 100) / defaultDims.depth,
                z: (dimH * 100) / defaultDims.height
              };
              
              const furnitureEntry: any = {
                id: item.id,
                type: furnitureBoxType as const,
                name: item.id,
                floorName: floorName,
                position: {
                  x: centerX * 100,
                  y: centerY * 100,
                  z: minZ * 100
                },
                rotation: { x: rotX, y: 0, z: rotZ },
                scale: computedScale,
                dimensions: defaultDims,
                properties: {
                  material: wallFace?.material || 'metal',
                  emissivity: wallFace?.emissivity || 0.25,
                  temperature: wallFace?.temperature || 35
                }
              };
              
              if (furnitureBoxType === 'rack') {
                furnitureEntry.serverProperties = {
                  rackDensity: inletFace?.rackDensity || 'medium',
                  thermalPower_kW: inletFace?.thermalPower_kW || 10,
                  airFlow: inletFace?.airFlow || 2395
                };
              }
              
              if (furnitureBoxType === 'topVentBox' || furnitureBoxType === 'sideVentBox') {
                const ventFace = faceEntries.find((f: any) => f.role === 'vent') || item.faces.top || item.faces.front;
                furnitureEntry.simulationProperties = {
                  state: ventFace?.state || 'open',
                  airOrientation: ventFace?.airDirection || 'outflow',
                  flowType: ventFace?.flowType || 'Air Mass Flow',
                  flowIntensity: ventFace?.flowIntensity || 'medium',
                  customIntensityValue: ventFace?.customIntensityValue,
                  airTemperature: ventFace?.airTemperature || 20
                };
              }
              
              furnitureItems.push(furnitureEntry);
              return;
            }
            
            // Position-based format for non-rack furniture (table, person, armchair, block)
            const furnitureType = item.id.split('_')[0];
            
            const positionInCm = { 
              x: item.position.x * 100, 
              y: item.position.y * 100, 
              z: item.position.z * 100 
            };
            
            const mappedType = ['table', 'person', 'armchair', 'block'].includes(furnitureType) 
              ? furnitureType 
              : 'block';
            
            const simProps = item.simulationProperties || {};
            const defaultDims = getDefaultDimensions(mappedType);
            
            let computedScale = { x: item.scale?.x || 1, y: item.scale?.y || 1, z: item.scale?.z || 1 };
            if (item.dimensions) {
              computedScale = {
                x: (item.dimensions.width * 100) / defaultDims.width,
                y: (item.dimensions.depth * 100) / defaultDims.depth,
                z: (item.dimensions.height * 100) / defaultDims.height
              };
            }
            
            const furnitureEntry: any = {
              id: item.id,
              type: mappedType as const,
              name: item.id,
              floorName: floorName,
              position: {
                x: positionInCm.x,
                y: positionInCm.y,
                z: positionInCm.z
              },
              rotation: { 
                x: item.rotation?.x || 0, 
                y: item.rotation?.y || 0, 
                z: item.rotation?.z || 0 
              },
              scale: computedScale,
              dimensions: defaultDims,
              properties: {
                material: simProps.chassisMaterial || 'wood',
                emissivity: simProps.chassisEmissivity || simProps.emissivity || 0.9,
                temperature: simProps.chassisTemperature || simProps.temperature || 20
              }
            };
            
            furnitureItems.push(furnitureEntry);
          });
        }

        convertedFloors[floorName] = {
          lines: convertedLines,
          airEntries: convertedAirEntries,
          hasClosedContour: convertedLines.length > 2,
          name: floorName,
          stairPolygons: convertedStairs,
          wallTemperatures: wallTemperatures, // Preservar las temperaturas para uso posterior
          wallMaterials: wallMaterials, // Preservar los materiales para uso posterior
          wallEmissivities: wallEmissivities, // Preservar las emisividades para uso posterior
          horizontalVents: horizontalVents, // Agregar vents horizontales
          furnitureItems: furnitureItems    // Agregar furniture 3D elements
        };
        

        
        // Configurar parámetros del piso
        // Soporte para formato nuevo (deck, floor) y antiguo (floorDeck, floor_surf)
        const deckValue = floorData.deck !== undefined ? floorData.deck : floorData.floorDeck;
        const floorTempValue = (floorData.floor || floorData.floor_surf)?.temp;
        
        newFloorParameters[floorName] = {
          ceilingHeight: (floorData.height || 2.2) * 100, // Convertir metros a cm
          floorDeck: (deckValue || 0) * 100, // Convertir metros a cm - soporte nuevo y antiguo formato
          ceilingTemperature: floorData.ceiling?.temp || floorData.ceilingTemperature || 20, // Leer de ceiling.temp o default
          floorTemperature: floorTempValue || floorData.floorTemperature || 20, // Leer de floor.temp/floor_surf.temp o default
          ceilingEmissivity: floorData.ceiling?.emissivity ?? 0.90, // Leer de ceiling.emissivity o default
          floorEmissivity: (floorData.floor || floorData.floor_surf)?.emissivity ?? 0.90 // Leer de floor.emissivity o default
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
        
        // Cargar vents horizontales al store de furniture
        if (floorData.horizontalVents && floorData.horizontalVents.length > 0) {
          console.log(`🔍 LOADING ${floorData.horizontalVents.length} horizontal vents for floor ${floorName}:`, floorData.horizontalVents);
          floorData.horizontalVents.forEach((vent: any) => {
            console.log(`🔍 Adding vent to store:`, vent);
            addFurnitureToFloor(floorName, vent);
          });
        } else {
          console.log(`🔍 No horizontal vents found for floor ${floorName}`);
        }

        // Cargar furniture 3D elements al store
        if (floorData.furnitureItems && floorData.furnitureItems.length > 0) {
          console.log(`🔍 LOADING ${floorData.furnitureItems.length} furniture items for floor ${floorName}:`, floorData.furnitureItems);
          floorData.furnitureItems.forEach((furniture: any) => {
            console.log(`🔍 Adding furniture to store:`, furniture);
            addFurnitureToFloor(floorName, furniture);
          });
        } else {
          console.log(`🔍 No furniture items found for floor ${floorName}`);
        }

        // CRÍTICO: Aplicar temperaturas preservadas del JSON después de sincronizar paredes
        if (floorData.wallTemperatures && floorData.wallTemperatures.size > 0) {
          // Usar verificación activa en lugar de timeout fijo
          const checkWallsAndApplyTemperatures = () => {
            const currentStoreState = useRoomStore.getState();
            const floors = currentStoreState.floors;
            const currentWalls = floors[floorName]?.walls || [];
            
            if (currentWalls.length > 0) {
              // Aplicar temperaturas, materiales y emisividades directamente usando el store state actual
              const updatedWalls = currentWalls.map(wall => {
                const lineKey = `${wall.startPoint.x.toFixed(2)},${wall.startPoint.y.toFixed(2)}-${wall.endPoint.x.toFixed(2)},${wall.endPoint.y.toFixed(2)}`;
                const temperature = floorData.wallTemperatures?.get(lineKey);
                const material = floorData.wallMaterials?.get(lineKey);
                const emissivity = floorData.wallEmissivities?.get(lineKey);
                
                if (temperature !== undefined || material !== undefined || emissivity !== undefined) {
                  return {
                    ...wall,
                    properties: {
                      ...wall.properties,
                      temperature: temperature ?? wall.properties.temperature,
                      material: material ?? wall.properties.material ?? 'default',
                      emissivity: emissivity ?? wall.properties.emissivity ?? 0.90
                    }
                  };
                }
                return wall;
              });
              
              // Actualizar directamente usando el store
              const previousFloor = currentStoreState.currentFloor;
              setCurrentFloor(floorName);
              setWalls(updatedWalls);
              if (previousFloor !== floorName) {
                setCurrentFloor(previousFloor);
              }
            } else {
              setTimeout(checkWallsAndApplyTemperatures, 100);
            }
          };
          
          // Iniciar verificación después de un pequeño delay para permitir que syncWallsForCurrentFloor termine
          setTimeout(checkWallsAndApplyTemperatures, 50);
        }
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
    if (step > 0) setStep(step - 1);
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
    // Dynamic height based on 45% of viewport height
    const canvasClasses = "border rounded-lg overflow-hidden bg-white min-w-[600px]";
    const canvasStyle = { flex: 1, height: `${canvasHeight}px` }; // Dynamic height with horizontal expansion

    return (
      <div className={canvasClasses} style={canvasStyle}>
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
              hasClosedContour={hasClosedContour} // NEW: Pass hasClosedContour for warning message in RSP
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
              defaultWallMaterial={defaultWallMaterial}
              defaultWallEmissivity={getDefaultWallEmissivity()}
              defaultStairTemperature={defaultStairTemperature}
              defaultStairEmissivity={defaultStairEmissivity}
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
              hasClosedContour={hasClosedContour} // NEW: Pass hasClosedContour to show warning
              simulationName={simulationName}
              simulationType={
                simulationType === "SteadySim"
                  ? "Steady Simulation TEST (3 iterations)"
                  : "Transient Simulation (full simulation)"
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
              onWallTransparencyChange={(value) => {
                setWallTransparency(value);
              }}
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
        <select
          id="simulation-type"
          value={simulationType}
          onChange={(e) => setSimulationType(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="SteadySim">Steady Simulation (3 iterations - Test)</option>
          <option value="TransientSim">Transient Simulation (500 iterations)</option>
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          {simulationType === 'SteadySim' ? 'Quick test run - €9.99' : 'Full simulation - €12.00'}
        </p>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="container mx-auto py-4 px-3 space-y-4">
        {renderStepIndicator()}
        <div className="min-h-[690px]">
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
        <div className="flex justify-end gap-2 pt-6 mt-6 border-t">
          {step > 0 && (
            <Button onClick={handleBack} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          {step < 3 && (
            <Button onClick={handleNext}>
              {step === 0 ? "Let's Start" : "Next"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
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

      {/* Diálogo de confirmación para crear simulación */}
      <Dialog open={showStartSimulationDialog} onOpenChange={(open) => {
        if (!isCreatingSimulation) {
          setShowStartSimulationDialog(open);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Simulation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                You are about to create simulation: <strong>"{simulationName}"</strong>
              </p>
              <p className="text-sm text-gray-600">
                Type: <strong>{simulationType === "SteadySim" ? "Steady Simulation TEST" : "Transient Simulation"}</strong>
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="simulation-status">Simulation Status</Label>
              <Select value={simulationStatus} onValueChange={setSimulationStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Cost:</strong> €{getSimulationCost(simulationType).toFixed(2)} will be deducted from your credits
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowStartSimulationDialog(false);
              }}
              disabled={isCreatingSimulation}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreateSimulation}
              disabled={isCreatingSimulation}
            >
              {isCreatingSimulation ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></div>
                  Creating...
                </>
              ) : (
                "Create Simulation"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-screen loading overlay during simulation creation */}
      {isCreatingSimulation && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          style={{ zIndex: 9999 }}
        >
          <div className="bg-white p-6 rounded-lg shadow-lg flex items-center space-x-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
            <div className="text-lg font-medium">Creating simulation...</div>
          </div>
        </div>
      )}

      {/* Dialog to confirm HVAC simulation creation */}
      {/* ========== TEMPORARY PASSWORD PROTECTION - TO BE REMOVED SOON ========== */}
      {/* Este diálogo incluye un campo de contraseña temporal que será eliminado próximamente */}
      <Dialog open={showSimulationTypeDialog} onOpenChange={setShowSimulationTypeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Simulation</DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">
              You are about to create the following simulation:
            </p>
          </DialogHeader>
          <div className="space-y-2 mt-4 p-4 bg-muted rounded-lg">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{simulationName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type:</span>
              <span className="font-medium">{simulationType === 'SteadySim' ? 'Steady Simulation (3 iter)' : 'Transient Simulation (500 iter)'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price:</span>
              <span className="font-medium">{simulationType === 'SteadySim' ? '€9.99' : '€12.00'}</span>
            </div>
          </div>
          
          {/* TEMPORARY: Campo de contraseña - será eliminado próximamente */}
          <div className="space-y-2 mt-4">
            <Label htmlFor="simulation-password">Launch Password</Label>
            <Input
              id="simulation-password"
              type="password"
              value={simulationPassword}
              onChange={(e) => setSimulationPassword(e.target.value)}
              placeholder="Enter password to launch simulation"
              data-testid="input-simulation-password"
            />
          </div>
          
          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => setShowSimulationTypeDialog(false)}
              data-testid="button-cancel-simulation-type"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateHVACSimulation}
              disabled={isCreatingSimulation}
              data-testid="button-create-hvac-simulation"
            >
              {isCreatingSimulation ? 'Creating...' : 'Create Simulation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Authentication Selection Dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Please log in or create an account to create and run simulations.
            </p>
          </DialogHeader>
          
          <div className="flex flex-col gap-3 mt-6">
            <Button 
              onClick={() => {
                setShowAuthDialog(false);
                setIsLoginOpen(true);
              }}
              className="w-full"
            >
              Log In
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                setShowAuthDialog(false);
                setIsRegisterOpen(true);
              }}
              className="w-full"
            >
              Sign Up
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
      />

      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />
    </DashboardLayout>
  );
}
