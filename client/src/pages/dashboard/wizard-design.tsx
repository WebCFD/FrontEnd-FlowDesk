import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Save, Upload, Eraser, ArrowRight, ArrowLeft } from "lucide-react";
import Canvas2D from "@/components/sketch/Canvas2D";
import { cn } from "@/lib/utils";
import AirEntryDialog from "@/components/sketch/AirEntryDialog";
import Canvas3D from "@/components/sketch/Canvas3D";
import { useRoomStore } from "@/lib/store/room-store";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

const calculateNormal = (line: Line | null): { x: number; y: number } => {
  if (!line) return { x: 0, y: 0 };
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const mag = Math.sqrt(dx * dx + dy * dy);
  return { x: -dy / mag, y: dx / mag };
};

export default function WizardDesign() {
  const [, setLocation] = useLocation();
  const { user, setReturnTo } = useAuth();
  const [step, setStep] = useState(1);
  const [simulationName, setSimulationName] = useState("");
  const [gridSize, setGridSize] = useState(20);
  const [currentTool, setCurrentTool] = useState<'wall' | 'eraser' | null>('wall');
  const [currentAirEntry, setCurrentAirEntry] = useState<'vent' | 'door' | 'window' | null>(null);
  const { toast } = useToast();
  const [isAirEntryDialogOpen, setIsAirEntryDialogOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<Line | null>(null);
  const [clickedPoint, setClickedPoint] = useState<Point | null>(null);
  const [tab, setTab] = useState<"2d-editor" | "3d-preview">("2d-editor");
  const [showStartSimulationPrompt, setShowStartSimulationPrompt] = useState(false);

  // Use the global room store
  const { lines, airEntries, hasClosedContour, setLines, setAirEntries, setHasClosedContour } = useRoomStore();

  const steps = [
    { id: 1, name: "Upload" },
    { id: 2, name: "Setup" },
    { id: 3, name: "Order" }
  ];

  const handleGridSizeChange = (value: number[]) => {
    setGridSize(value[0]);
  };

  const gridSizeToCm = (pixels: number): number => {
    return pixels * (25 / 20);
  };

  const handleToolSelect = (tool: 'wall' | 'eraser') => {
    if (currentTool === tool) {
      setCurrentTool(null);
    } else {
      setCurrentTool(tool);
      setCurrentAirEntry(null);
    }
  };

  const handleAirEntrySelect = (entry: 'vent' | 'door' | 'window') => {
    if (currentAirEntry === entry) {
      setCurrentAirEntry(null);
    } else {
      setCurrentAirEntry(entry);
      setCurrentTool(null);
    }
  };

  const getAirEntryStyles = (type: 'vent' | 'door' | 'window') => {
    const baseStyles = "h-16 p-2 flex flex-col items-center justify-center transition-all duration-200 shadow-sm";
    const activeStyles = "scale-95 shadow-inner";

    const colorStyles = {
      window: "hover:bg-blue-100 text-blue-700",
      door: "hover:bg-amber-100 text-amber-700",
      vent: "hover:bg-green-100 text-green-700"
    };

    const activeColorStyles = {
      window: "bg-blue-100",
      door: "bg-amber-100",
      vent: "bg-green-100"
    };

    const borderStyles = {
      window: "border-blue-500",
      door: "border-amber-500",
      vent: "border-green-500"
    };

    return cn(
      baseStyles,
      colorStyles[type],
      currentAirEntry === type ? activeStyles : "",
      currentAirEntry === type ? activeColorStyles[type] : "",
      currentAirEntry === type ? borderStyles[type] : "",
      "border-2",
      borderStyles[type]
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
      console.log(`Dimensions: width=${dimensions.width}cm, height=${dimensions.height}cm`);
      console.log(`Wall normal: (${normal.x.toFixed(3)}, ${normal.y.toFixed(3)})`);

      const newAirEntry: AirEntry = {
        type: currentAirEntry,
        position: clickedPoint,
        dimensions,
        line: selectedLine
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
              <div className={`text-sm ${step === s.id ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
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
      <div className="max-w-xl">
        <Label htmlFor="simulation-name">Simulation name</Label>
        <Input
          id="simulation-name"
          value={simulationName}
          onChange={(e) => setSimulationName(e.target.value)}
          placeholder="Enter simulation name"
        />
      </div>

      <Card className="mt-6">
        <CardContent className="p-6">
          <Tabs
            value={tab}
            onValueChange={(value: "2d-editor" | "3d-preview") => {
              if (value === "3d-preview" && !hasClosedContour) {
                toast({
                  title: "Invalid Room Layout",
                  description: "Please create a closed room contour before viewing in 3D",
                  variant: "destructive",
                });
                return;
              }
              setTab(value);
            }}
          >
            <TabsList>
              <TabsTrigger value="2d-editor">2D Editor</TabsTrigger>
              <TabsTrigger value="3d-preview" disabled={!hasClosedContour}>
                3D Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="2d-editor" className="mt-6">
              <div className="flex gap-6">
                <div className="w-48 space-y-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold">Tools</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={currentTool === 'wall' ? 'default' : 'outline'}
                        className="w-full h-16 flex flex-col items-center justify-center gap-1"
                        onClick={() => handleToolSelect('wall')}
                      >
                        <div className="w-6 h-6 bg-primary/20 rounded-sm" />
                        <span className="text-xs">Wall Line</span>
                      </Button>
                      <Button
                        variant={currentTool === 'eraser' ? 'default' : 'outline'}
                        className="w-full h-16 flex flex-col items-center justify-center gap-1"
                        onClick={() => handleToolSelect('eraser')}
                      >
                        <Eraser className="w-6 h-6" />
                        <span className="text-xs">Eraser</span>
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold">Grid Size</h3>
                    <div className="px-2">
                      <Slider
                        defaultValue={[gridSize]}
                        max={50}
                        min={10}
                        step={1}
                        onValueChange={handleGridSizeChange}
                      />
                      <div className="text-sm text-right mt-1">{gridSizeToCm(gridSize).toFixed(1)}cm/cell</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold">Air Entries</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant="outline"
                        className={getAirEntryStyles('window')}
                        onClick={() => handleAirEntrySelect('window')}
                      >
                        <div className="w-6 h-6 border-2 border-blue-500 grid grid-cols-2" />
                        <span className="text-xs mt-1">Window</span>
                      </Button>
                      <Button
                        variant="outline"
                        className={getAirEntryStyles('door')}
                        onClick={() => handleAirEntrySelect('door')}
                      >
                        <div className="w-6 h-6 border-2 border-amber-500" />
                        <span className="text-xs mt-1">Door</span>
                      </Button>
                      <Button
                        variant="outline"
                        className={getAirEntryStyles('vent')}
                        onClick={() => handleAirEntrySelect('vent')}
                      >
                        <div className="w-6 h-6 border-2 border-green-500 grid grid-cols-2 grid-rows-2" />
                        <span className="text-xs mt-1">Vent-Grid</span>
                      </Button>
                    </div>
                  </div>

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

                <div className="flex-1 border rounded-lg overflow-hidden">
                  <Canvas2D
                    gridSize={gridSize}
                    currentTool={currentTool}
                    currentAirEntry={currentAirEntry}
                    onLineSelect={handleLineSelect}
                    airEntries={airEntries}
                    lines={lines}
                    onLinesUpdate={(newLines) => {
                      setLines(newLines);
                      const hasClosedContour = newLines.length > 0 &&
                        newLines.some(line =>
                          isInClosedContour(line.start, newLines) ||
                          isInClosedContour(line.end, newLines)
                        );
                      setHasClosedContour(hasClosedContour);
                    }}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="3d-preview">
              <div className="h-[600px] border rounded-lg overflow-hidden">
                <Canvas3D
                  lines={lines}
                  airEntries={airEntries}
                  height={600}
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <AirEntryDialog
        type={currentAirEntry || 'window'}
        isOpen={isAirEntryDialogOpen}
        onClose={() => {
          setIsAirEntryDialogOpen(false);
          setSelectedLine(null);
        }}
        onConfirm={handleAirEntryDimensionsConfirm}
      />
    </>
  );

  const renderStep2 = () => (
    <Card>
      <CardHeader>
        <CardTitle>Simulation Parameters</CardTitle>
        <CardDescription>Configure the physical parameters for your simulation</CardDescription>
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
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Choose Your Simulation Package</CardTitle>
          <CardDescription>Select the package that best fits your needs</CardDescription>
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

      <AlertDialog open={showStartSimulationPrompt} onOpenChange={setShowStartSimulationPrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start New Simulation?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an existing room in the WizardDesign. Starting a new simulation will clear your current design.
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleReturnToWizard}>Return to WizardDesign</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmNewSimulation}>
              New Design
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  const isInClosedContour = (point: Point, lines: Line[]): boolean => {
    // Helper function to check if two points are effectively the same
    const arePointsEqual = (p1: Point, p2: Point): boolean => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy) < 5; // Smaller threshold for more precise detection
    };

    // Find all lines connected to this point
    const connectedLines = lines.filter(line =>
      arePointsEqual(line.start, point) || arePointsEqual(line.end, point)
    );

    // For each connected line
    for (const startLine of connectedLines) {
      const visited = new Set<string>();
      const pointKey = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
      const stack: { point: Point; path: Line[] }[] = [{
        point: arePointsEqual(startLine.start, point) ? startLine.end : startLine.start,
        path: [startLine]
      }];

      while (stack.length > 0) {
        const { point: currentPoint, path } = stack.pop()!;
        const key = pointKey(currentPoint);

        // If we found a path back to the start point and used at least 3 lines
        if (path.length >= 2 && arePointsEqual(currentPoint, point)) {
          console.log('Found closed contour:', path);
          return true;
        }

        // Skip if we've been here before
        if (visited.has(key)) continue;
        visited.add(key);

        // Find all lines connected to current point except the one we came from
        const nextLines = lines.filter(line =>
          !path.includes(line) &&
          (arePointsEqual(line.start, currentPoint) || arePointsEqual(line.end, currentPoint))
        );

        // Add all possible next points to stack
        for (const nextLine of nextLines) {
          const nextPoint = arePointsEqual(nextLine.start, currentPoint) ? nextLine.end : nextLine.start;
          stack.push({
            point: nextPoint,
            path: [...path, nextLine]
          });
        }
      }
    }

    return false;
  };

  const findConnectedLines = (point: Point, lines: Line[]): Line[] => {
    return lines.filter(line =>
      arePointsClose(line.start, point) || arePointsClose(line.end, point)
    );
  };

  const arePointsClose = (p1: Point, p2: Point): boolean => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) < 15; // Snap distance
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
    setHasClosedContour(false);
    setSimulationName("");
    setGridSize(20);
    setCurrentTool('wall');
    setCurrentAirEntry(null);
    setSelectedLine(null);
    setClickedPoint(null);
    setTab("2d-editor");
  };


  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
        {renderStepIndicator()}

        <div className="min-h-[600px]">
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
            <Button onClick={handleStartSimulation}>
              Start Simulation
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}