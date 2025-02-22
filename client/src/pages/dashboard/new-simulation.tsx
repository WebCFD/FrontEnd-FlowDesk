import { useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stage, Layer, Line, Text, Arrow } from "react-konva";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Eraser } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function NewSimulation() {
  const [step, setStep] = useState(1);
  const [simulationName, setSimulationName] = useState("");
  const [lines, setLines] = useState<Array<{ points: number[]; color: string; tool: string }>>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "arrow" | "text">("pen");
  const [color, setColor] = useState("#000000");
  const { toast } = useToast();
  const [hasError, setHasError] = useState(false);

  const handleMouseDown = (e: any) => {
    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    if (tool === "pen") {
      setLines([...lines, { points: [pos.x, pos.y], color, tool }]);
    }
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing) return;

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
    console.log("handleNextStep called", { simulationName });
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
    console.log("Proceeding to step 2");
    setStep(2);
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

  // Debug log for current step
  console.log("Current step:", step);

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
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent>
              <h2 className="text-2xl font-bold mb-4">Setup Objects</h2>
              {/* Step 2 content will go here */}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}