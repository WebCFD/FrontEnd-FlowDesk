import { useState } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
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
} from "lucide-react";
import Canvas2D from "@/components/sketch/Canvas2D";
import { RoomSketchPro } from "@/components/sketch/RoomSketchPro";
import { cn } from "@/lib/utils";
import AirEntryDialog from "@/components/sketch/AirEntryDialog";
import Canvas3D from "@/components/sketch/Canvas3D";
import { Toolbar3D, ViewDirection } from "@/components/sketch/Toolbar3D";
import { useRoomStore } from "@/lib/store/room-store";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
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
}

interface StairPolygon {
  id: string;
  points: Point[];
  floor: string;
  direction?: "up" | "down";
  connectsTo?: string;
  isImported?: boolean;
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
  const [wallTransparency, setWallTransparency] = useState(0.2);
  const [ceilingHeight, setCeilingHeight] = useState(220); // Default 220cm
  const [isMultifloor, setIsMultifloor] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState("ground");
  const [loadFromFloor, setLoadFromFloor] = useState("ground");
  const [floorDeckThickness, setFloorDeckThickness] = useState(35); // Default 35cm
  const [isMeasureMode, setIsMeasureMode] = useState(false);
  const [isEraserMode, setIsEraserMode] = useState(false);

  // Use the global room store with updated selectors
  const {
    floors,
    currentFloor,
    setCurrentFloor,
    setLines,
    setAirEntries,
    setMeasurements,
    setStairPolygons,
    setHasClosedContour,
    addFloor,
    removeFloor,
    copyFloorAs,
  } = useRoomStore();

  // Get current floor data
  const currentFloorData = floors[currentFloor];
  const { lines, airEntries, measurements, hasClosedContour, stairPolygons } =
    currentFloorData;

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

  // Add this function after handleLoadTemplate
  const performFloorLoad = () => {
    // Close the dialog
    setIsFloorLoadDialogOpen(false);

    // Begin by looking at the source floor data
    const sourceFloorData = floors[loadFromFloor];
    const targetFloorData = floors[currentFloor] || {
      lines: [],
      airEntries: [],
      measurements: [],
      stairPolygons: [],
      hasClosedContour: false,
    };

    // Handle normal floor elements - copy as usual
    const newLines = [...sourceFloorData.lines];
    const newAirEntries = [...sourceFloorData.airEntries];
    const newMeasurements = [...sourceFloorData.measurements];

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
    setCurrentTool(tool);
    setCurrentAirEntry(null);
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

      const newAirEntry: AirEntry = {
        type: currentAirEntry,
        position: clickedPoint,
        dimensions,
        line: selectedLine,
      };

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
      title: isMeasureMode ? "Measurement Mode Disabled" : "Measurement Mode Enabled",
      description: isMeasureMode 
        ? "Exited measurement mode" 
        : "Click to place start point, click again for end point",
    });
  };
  
  // Toggle 3D eraser mode
  const handleToggleEraserMode = () => {
    const newEraserMode = !isEraserMode;
    console.log("🔴 ERASER TOGGLE - Toggling eraser mode, current:", isEraserMode, "new:", newEraserMode);
    
    // Disable measurement mode when enabling eraser mode
    if (newEraserMode) {
      console.log("🔴 ERASER TOGGLE - Disabling measure mode because eraser mode was enabled");
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
    console.log("Received camera control callback from Canvas3D");
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

  const handleDeleteAirEntryFrom3D = (
    floorName: string,
    index: number
  ) => {
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
          airEntries: [...updatedAirEntries]
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
      const floorAirEntries = updatedFloors[floorName].airEntries.filter((_, i) => i !== index);
      
      // Create a copy of the floor data with the updated air entries
      updatedFloors[floorName] = {
        ...updatedFloors[floorName],
        airEntries: floorAirEntries
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
    updatedEntry: AirEntry
  ) => {
    // Create a copy of the floors data
    console.log(`Updating air entry in floor ${floorName}, index ${index}`);
    
    // Log all entries before updating
    console.log("PARENT COMPONENT DEBUG - BEFORE UPDATE:", {
      updateRequestedFor: {
        floorName,
        index,
        entryType: updatedEntry.type,
        oldPosition: floorName === currentFloor ? airEntries[index]?.position : floors[floorName]?.airEntries[index]?.position,
        newPosition: updatedEntry.position
      },
      currentFloor,
      allEntries: floorName === currentFloor 
        ? airEntries.map((entry, i) => ({ index: i, type: entry.type, position: entry.position }))
        : floors[floorName]?.airEntries.map((entry, i) => ({ index: i, type: entry.type, position: entry.position }))
    });

    // Create a deep clone of the updated entry to prevent reference issues
    const deepClonedEntry = JSON.parse(JSON.stringify(updatedEntry));
    
    // Use the store's setAirEntries function when updating the current floor
    if (floorName === currentFloor) {
      // Create a deep copy of the air entries array with structuredClone
      const updatedAirEntries = airEntries.map((entry, i) => 
        i === index ? deepClonedEntry : { ...entry }
      );
      
      // Set the air entries with the deep copy
      setAirEntries(updatedAirEntries);
      
      // Also update the floors data to keep everything in sync
      const updatedFloors = { ...floors };
      if (updatedFloors[floorName]) {
        updatedFloors[floorName] = {
          ...updatedFloors[floorName],
          airEntries: [...updatedAirEntries]
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
          isUpdated: i === index
        }))
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
      console.log("PARENT COMPONENT DEBUG - BEFORE UPDATE (NON-CURRENT FLOOR):", {
        floor: floorName,
        allEntries: floorAirEntries.map((entry, i) => ({
          index: i,
          type: entry.type,
          position: entry.position,
          isTargeted: i === index
        }))
      });

      // Create a deep clone of the updated entry to prevent reference issues
      const deepClonedEntry = JSON.parse(JSON.stringify(updatedEntry));
      
      // Update the specific air entry with deep cloned data
      floorAirEntries[index] = deepClonedEntry;

      // Log the floor air entries after updating
      console.log("PARENT COMPONENT DEBUG - AFTER UPDATE (NON-CURRENT FLOOR):", {
        floor: floorName,
        allEntries: floorAirEntries.map((entry, i) => ({
          index: i,
          type: entry.type,
          position: entry.position,
          isUpdated: i === index
        }))
      });

      // Create a copy of the floor data with the updated air entries
      updatedFloors[floorName] = {
        ...updatedFloors[floorName],
        airEntries: floorAirEntries
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
                        <DropdownMenuItem onClick={() => changeViewDirection("+X")}>
                          +X View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => changeViewDirection("-X")}>
                          -X View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => changeViewDirection("+Y")}>
                          +Y View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => changeViewDirection("-Y")}>
                          -Y View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => changeViewDirection("+Z")}>
                          +Z View (Top)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => changeViewDirection("-Z")}>
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

                  {/* Add the height parameters here */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">Ceiling Height</h3>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={ceilingHeight}
                        min={20}
                        max={500}
                        step={10}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (!isNaN(value) && value >= 20 && value <= 500) {
                            setCeilingHeight(value);
                          }
                        }}
                        className="w-24"
                      />
                      <span>cm</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold">Floor Deck Thickness</h3>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={floorDeckThickness}
                        min={5}
                        max={150}
                        step={5}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (!isNaN(value) && value >= 5 && value <= 150) {
                            setFloorDeckThickness(value);
                          }
                        }}
                        className="w-24"
                      />
                      <span>cm</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Parameters Menu - Add before Files menu */}
              {renderParametersMenu()}

              {/* Files - always active */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-4">Files</h3>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-start">
                    <Save className="mr-2 h-4 w-4" />
                    Save Design
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Upload className="mr-2 h-4 w-4" />
                    Load Design
                  </Button>
                </div>
              </div>
            </div>

            {/* Right side - Canvas */}
            {renderCanvasSection()}
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
    console.log("Rendering Step 2 content");
    return (
      <div className="space-y-6">
      
        <div className="flex gap-6">
          {/* Left sidebar for controls */}
          <div className="w-72 space-y-6">
            <div>
              <h3 className="font-semibold text-lg mb-4">View Controls</h3>
              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium mb-2">Wall Transparency</label>
                  <div className="flex items-center">
                    <Slider
                      value={[wallTransparency]}
                      onValueChange={(values: number[]) => {
                        console.log("Wizard: Wall transparency changing to:", values[0]);
                        setWallTransparency(values[0]);
                      }}
                      min={0}
                      max={1}
                      step={0.01}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-500 ml-2">{Math.round(wallTransparency * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-4">Furniture</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'table', name: 'Table', icon: <rect x="4" y="14" width="16" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" /> },
                  { id: 'person', name: 'Person', icon: <circle cx="12" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" /> },
                  { id: 'armchair', name: 'Armchair', icon: <rect x="4" y="12" width="16" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" /> }
                ].map(item => (
                  <div key={item.id} className="border rounded text-center p-2">
                    <div className="flex justify-center mb-1">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        {item.icon}
                      </svg>
                    </div>
                    <div className="text-xs">{item.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1 h-[690px] border rounded-lg overflow-hidden bg-white">
            <RoomSketchPro
              width={800}
              height={690}
              key="step2-view"
              instanceId="step2-view"
              lines={lines}
              airEntries={airEntries}
              wallTransparency={wallTransparency}
              onWallTransparencyChange={(value) => {
                console.log("Wizard: Wall transparency changing to:", value);
                setWallTransparency(value);
              }}
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Simulation Parameters</CardTitle>
            <CardDescription>
              Configure the physical parameters for your simulation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
          </CardContent>
        </Card>
      </div>
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

  const handleStartSimulation = () => {
    if (lines.length > 0) {
      setShowStartSimulationPrompt(true);
    } else {
      reset();
      setLocation("/dashboard/wizard-design");
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
        <div className="flex items-center space-x-2">
          <Checkbox
            id="multifloor"
            checked={isMultifloor}
            onCheckedChange={(checked) => setIsMultifloor(checked as boolean)}
          />
          <Label htmlFor="multifloor">Multifloor</Label>
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
                    {Object.entries(floors).map(([floorName, floor]) => (
                      <SelectItem key={floorName} value={floorName}>
                        {formatFloorText(floorName)}
                      </SelectItem>
                    ))}
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
      </div>
    </div>
  );

  const renderCanvasSection = () => {
    // Add these debug statements
    if (tab === "3d-preview") {
      console.log("Rendering 3D view with floors data:", floors);
      console.log(
        `Current floor '${currentFloor}' stair polygons:`,
        floors[currentFloor]?.stairPolygons || [],
      );
    }

    return (
      <div className="flex-1 border rounded-lg overflow-hidden bg-white min-w-[600px]">
        {tab === "2d-editor" ? (
          <Canvas2D
            gridSize={gridSize}
            currentTool={currentTool}
            currentAirEntry={currentAirEntry}
            airEntries={airEntries}
            measurements={measurements}
            stairPolygons={stairPolygons}
            onMeasurementsUpdate={setMeasurements}
            onStairPolygonsUpdate={setStairPolygons}
            lines={lines}
            floorText={formatFloorText(currentFloor)}
            isMultifloor={isMultifloor}
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
            wallTransparency={wallTransparency}
            isMeasureMode={isMeasureMode}
            isEraserMode={isEraserMode}
            simulationName={simulationName}
            simulationType={simulationType === "comfort" ? "Comfort Simulation (steady run)" : "Air Renovation Convection Simulation (transient run)"}
            onUpdateAirEntry={handleUpdateAirEntryFrom3D}
            onDeleteAirEntry={handleDeleteAirEntryFrom3D}
            onViewChange={handleViewChange}
          />
        )}
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
              Comfort Simulation (steady run)
            </SelectItem>
            <SelectItem value="renovation">
              Air Renovation Convection Simulation (transient run)
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
    </DashboardLayout>
  );
}
