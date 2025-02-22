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

export default function NewSimulation() {
  const [step, setStep] = useState(1);
  const [simulationName, setSimulationName] = useState("");
  const [lines, setLines] = useState<Array<{ points: number[]; color: string; tool: string }>>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "arrow" | "text">("pen");
  const [color, setColor] = useState("#000000");

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
    if (simulationName.trim()) {
      setStep(2);
    }
  };

  const handleEraseAll = () => {
    setLines([]);
  };

  return (
    <DashboardLayout>
      {/* Steps indicator */}
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

      {/* Step 1: Space Sketcher */}
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div>
                <Label htmlFor="simulation-name">Simulation name</Label>
                <Input
                  id="simulation-name"
                  value={simulationName}
                  onChange={(e) => setSimulationName(e.target.value)}
                  placeholder="Enter simulation name"
                  className="mt-1"
                />
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
                <Button 
                  onClick={handleNextStep}
                  disabled={!simulationName.trim()}
                >
                  Next Step
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}