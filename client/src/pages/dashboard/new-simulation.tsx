import { useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stage, Layer, Line, Image as KonvaImage } from "react-konva";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eraser, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import useImage from "use-image";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// Pre-defined objects for the simulation
const objects = [
  { id: 'lamp', src: '/objects/lamp.svg', label: 'Lamp' },
  { id: 'cat', src: '/objects/cat.svg', label: 'Cat' },
  { id: 'chair', src: '/objects/chair.svg', label: 'Chair' },
  { id: 'table', src: '/objects/table.svg', label: 'Table' },
  { id: 'sofa', src: '/objects/sofa.svg', label: 'Sofa' }
] as const;

interface DraggableObjectProps {
  src: string;
  onDragEnd: (e: any) => void;
  x: number;
  y: number;
}

const DraggableObject: React.FC<DraggableObjectProps> = ({ src, onDragEnd, x, y }) => {
  const [image] = useImage(src);
  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      width={50}
      height={50}
      draggable
      onDragEnd={onDragEnd}
    />
  );
};

export default function NewSimulation() {
  const [step, setStep] = useState(1);
  const [simulationName, setSimulationName] = useState("");
  const [lines, setLines] = useState<Array<{ points: number[]; color: string; tool: string }>>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "arrow" | "text">("pen");
  const [color, setColor] = useState("#000000");
  const [selectedPlan, setSelectedPlan] = useState("pay-as-you-go");
  const { toast } = useToast();
  const [hasError, setHasError] = useState(false);
  const [placedObjects, setPlacedObjects] = useState<Array<{ id: string; src: string; x: number; y: number }>>([]);

  const handleMouseDown = (e: any) => {
    if (step !== 1) return;
    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    if (tool === "pen") {
      setLines([...lines, { points: [pos.x, pos.y], color, tool }]);
    }
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing || step !== 1) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    if (tool === "pen") {
      let lastLine = lines[lines.length - 1];
      lastLine.points = lastLine.points.concat([point.x, point.y]);
      lines.splice(lines.length - 1, 1, lastLine);
      setLines([...lines]);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleNextStep = () => {
    if (!simulationName.trim()) {
      setHasError(true);
      toast({
        title: "Error",
        description: "Please enter a simulation name before proceeding",
        variant: "destructive"
      });
      return;
    }
    setHasError(false);
    setStep(step + 1);
  };

  const handlePreviousStep = () => {
    setStep(step - 1);
  };

  const handleEraseAll = () => {
    setLines([]);
  };

  const handleSimulationNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSimulationName(e.target.value);
    if (hasError && e.target.value.trim()) {
      setHasError(false);
    }
  };

  const handleObjectDrop = (objectId: string) => {
    const stage = document.querySelector('canvas')?.getBoundingClientRect();
    if (!stage) return;

    const object = objects.find(obj => obj.id === objectId);
    if (!object) return;

    setPlacedObjects([
      ...placedObjects,
      {
        id: `${objectId}-${Date.now()}`,
        src: object.src,
        x: stage.width / 2,
        y: stage.height / 2
      }
    ]);
  };

  const handleObjectDragEnd = (index: number, e: any) => {
    const { x, y } = e.target.position();
    const newObjects = [...placedObjects];
    newObjects[index] = { ...newObjects[index], x, y };
    setPlacedObjects(newObjects);
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          {["Space Sketcher", "Setup Objects", "Launch"].map((stepName, index) => (
            <div key={stepName} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 
                ${index + 1 === step ? "border-primary bg-primary text-white" : "border-gray-300"}`}>
                {index + 1}
              </div>
              <div className="ml-2">{stepName}</div>
              {index < 2 && (
                <div className="h-[2px] w-32 bg-gray-300 mx-4" />
              )}
            </div>
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-6">
                <div>
                  <Label htmlFor="simulation-name">Simulation name</Label>
                  <Input
                    id="simulation-name"
                    value={simulationName}
                    onChange={handleSimulationNameChange}
                    placeholder="Enter simulation name"
                    className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
                  />
                  {hasError && (
                    <p className="text-sm text-red-500 mt-1">
                      Simulation name is required
                    </p>
                  )}
                </div>

                {/* Drawing Tools */}
                <div className="flex gap-2 items-center">
                  <Button
                    variant={tool === "pen" ? "default" : "outline"}
                    onClick={() => setTool("pen")}
                  >
                    Pen
                  </Button>
                  <Button
                    variant={tool === "arrow" ? "default" : "outline"}
                    onClick={() => setTool("arrow")}
                  >
                    Arrow
                  </Button>
                  <Button
                    variant={tool === "text" ? "default" : "outline"}
                    onClick={() => setTool("text")}
                  >
                    Text
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[80px] h-[35px]">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <HexColorPicker color={color} onChange={setColor} />
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    onClick={handleEraseAll}
                    className="gap-2"
                  >
                    <Eraser className="h-4 w-4" />
                    Erase All
                  </Button>
                </div>

                {/* Canvas */}
                <div className="border rounded-lg">
                  <Stage
                    width={800}
                    height={600}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                  >
                    <Layer>
                      {lines.map((line, i) => (
                        <Line
                          key={i}
                          points={line.points}
                          stroke={line.color}
                          strokeWidth={5}
                          tension={0.5}
                          lineCap="round"
                          lineJoin="round"
                        />
                      ))}
                    </Layer>
                  </Stage>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleNextStep}>
                    Next Step
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="flex gap-6 max-w-5xl mx-auto">
          {/* Main Canvas Area */}
          <div className="flex-1">
            <Card>
              <CardContent className="pt-6">
                <div className="border rounded-lg">
                  <Stage
                    width={800}
                    height={600}
                  >
                    <Layer>
                      {/* Display original lines (non-editable) */}
                      {lines.map((line, i) => (
                        <Line
                          key={i}
                          points={line.points}
                          stroke={line.color}
                          strokeWidth={5}
                          tension={0.5}
                          lineCap="round"
                          lineJoin="round"
                        />
                      ))}
                      {/* Display placed objects */}
                      {placedObjects.map((obj, index) => (
                        <DraggableObject
                          key={obj.id}
                          src={obj.src}
                          x={obj.x}
                          y={obj.y}
                          onDragEnd={(e) => handleObjectDragEnd(index, e)}
                        />
                      ))}
                    </Layer>
                  </Stage>
                </div>

                {/* Navigation Buttons */}
                <div className="flex justify-between mt-4">
                  <Button
                    onClick={handlePreviousStep}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Previous Step
                  </Button>
                  <Button
                    onClick={handleNextStep}
                    className="flex items-center gap-2"
                  >
                    Next Step
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Objects Menu */}
          <Card className="w-64">
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-4">Available Objects</h3>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {objects.map((object) => (
                    <div
                      key={object.id}
                      className="p-4 border rounded-lg cursor-pointer hover:bg-accent"
                      draggable
                      onDragEnd={() => handleObjectDrop(object.id)}
                    >
                      <img
                        src={object.src}
                        alt={object.label}
                        className="w-12 h-12 mx-auto mb-2"
                      />
                      <p className="text-sm text-center">{object.label}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 3 && (
        <div className="flex gap-4 max-w-5xl mx-auto">
          {/* Project Summary */}
          <div className="flex-1">
            <Card className="mb-0">
              <CardHeader className="pb-4">
                <CardTitle>Project Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Project name</span>
                    <span className="font-medium">{simulationName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-medium">Above Ground</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Motion</span>
                    <span className="font-medium">Moving</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fluid</span>
                    <span className="font-medium">Air</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Wind velocity</span>
                    <span className="font-medium">20.0 m/sec</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Rotation</span>
                    <span className="font-medium">2.0 X/Y: 21.0/2.0 D</span>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span className="font-medium">€500.00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>VAT (0%):</span>
                    <span className="font-medium">€0.00</span>
                  </div>
                  <div className="flex justify-between text-base font-bold">
                    <span>Total Cost:</span>
                    <span>€500.00</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Order Options */}
          <div className="w-[400px] flex flex-col gap-3">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Available Credits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">€500.00</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Order Options</CardTitle>
                <CardDescription>Select your simulation plan</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  defaultValue="pay-as-you-go"
                  className="space-y-3"
                  onValueChange={setSelectedPlan}
                >
                  <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent ${selectedPlan === 'pay-as-you-go' ? 'border-primary' : ''}`}>
                    <RadioGroupItem value="pay-as-you-go" id="pay-as-you-go" />
                    <Label htmlFor="pay-as-you-go" className="flex-1">
                      <div className="font-medium">Pay as you go</div>
                      <div className="text-xs text-muted-foreground">Perfect for occasional users and small projects</div>
                      <div className="font-bold text-lg mt-1">€5 <span className="text-sm font-normal text-muted-foreground">per simulation</span></div>
                      <div className="text-sm mt-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Analysis Only</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Online Result Viewer</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">30 day data retention</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">PDF Reporting and Raw Data</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Simulation Sharing</span>
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent ${selectedPlan === 'discovery' ? 'border-primary' : ''}`}>
                    <RadioGroupItem value="discovery" id="discovery" />
                    <Label htmlFor="discovery" className="flex-1">
                      <div className="font-medium">Discovery</div>
                      <div className="text-xs text-muted-foreground">Ideal for teams and regular simulations</div>
                      <div className="font-bold text-lg mt-1">€99 <span className="text-sm font-normal text-muted-foreground">per 25 simulations</span></div>
                      <div className="text-sm mt-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Analysis and Design Advice</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Online Result Viewer</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Data Retention during plan</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">PDF Reporting and Raw Data</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Simulation Sharing</span>
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent ${selectedPlan === 'enterprise' ? 'border-primary' : ''}`}>
                    <RadioGroupItem value="enterprise" id="enterprise" />
                    <Label htmlFor="enterprise" className="flex-1">
                      <div className="font-medium">Enterprise</div>
                      <div className="text-xs text-muted-foreground">For organizations with specific requirements</div>
                      <div className="font-bold text-lg mt-1">Custom</div>
                      <div className="text-sm mt-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Unlimited simulations</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Custom workflow integration</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Personal success manager</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">SLA guarantee</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Custom features</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3 w-3" />
                          <span className="text-xs">Training & onboarding</span>
                        </div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Payment Information */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Payment Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-sm">Card Number</Label>
                  <Input placeholder="4242 4242 4242 4242" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Expiry Date</Label>
                    <Input placeholder="MM/YY" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm">CVC</Label>
                    <Input placeholder="123" className="mt-1" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-auto">
              <Button
                onClick={handlePreviousStep}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous Step
              </Button>
              <Button
                onClick={() => console.log('Launch simulation')}
                className="flex items-center gap-2"
              >
                Launch Simulation
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}