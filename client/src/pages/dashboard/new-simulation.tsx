import { useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Save, Upload, Eraser } from "lucide-react";
import Canvas2D from "@/components/sketch/Canvas2D";

export default function NewSimulation() {
  const [step, setStep] = useState(1);
  const [simulationName, setSimulationName] = useState("");
  const [gridSize, setGridSize] = useState(20);
  const [currentTool, setCurrentTool] = useState<'wall' | 'eraser'>('wall');
  const { toast } = useToast();

  const handleGridSizeChange = (value: number[]) => {
    setGridSize(value[0]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Name Input */}
        <div className="max-w-xl">
          <Label htmlFor="simulation-name">Simulation name</Label>
          <Input
            id="simulation-name"
            value={simulationName}
            onChange={(e) => setSimulationName(e.target.value)}
            placeholder="Enter simulation name"
          />
        </div>

        {/* Editor Area */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <Tabs defaultValue="2d-editor" className="w-full">
              <TabsList>
                <TabsTrigger value="2d-editor">2D Editor</TabsTrigger>
                <TabsTrigger value="3d-preview">3D Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="2d-editor" className="mt-6">
                <div className="flex gap-6">
                  {/* Tools Panel */}
                  <div className="w-48 space-y-6">
                    <div className="space-y-4">
                      <h3 className="font-semibold">Tools</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant={currentTool === 'wall' ? 'default' : 'outline'}
                          className="w-full h-16 flex flex-col items-center justify-center gap-1"
                          onClick={() => setCurrentTool('wall')}
                        >
                          <div className="w-6 h-6 bg-primary/20 rounded-sm" />
                          <span className="text-xs">Wall Line</span>
                        </Button>
                        <Button
                          variant={currentTool === 'eraser' ? 'default' : 'outline'}
                          className="w-full h-16 flex flex-col items-center justify-center gap-1"
                          onClick={() => setCurrentTool('eraser')}
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
                        <div className="text-sm text-right mt-1">{gridSize}px</div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-semibold">Air Entries</h3>
                      <div className="grid grid-cols-3 gap-2">
                        <Button variant="outline" className="h-16 p-2 flex flex-col items-center justify-center">
                          <div className="w-6 h-6 border-2 border-primary grid grid-cols-2 grid-rows-2" />
                          <span className="text-xs mt-1">Vent-Grid</span>
                        </Button>
                        <Button variant="outline" className="h-16 p-2 flex flex-col items-center justify-center">
                          <div className="w-6 h-6 border-2 border-primary" />
                          <span className="text-xs mt-1">Door</span>
                        </Button>
                        <Button variant="outline" className="h-16 p-2 flex flex-col items-center justify-center">
                          <div className="w-6 h-6 border-2 border-primary grid grid-cols-2" />
                          <span className="text-xs mt-1">Window</span>
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

                  {/* Canvas Area */}
                  <div className="flex-1 border rounded-lg overflow-hidden">
                    <Canvas2D gridSize={gridSize} currentTool={currentTool} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="3d-preview">
                <div className="h-[600px] flex items-center justify-center border rounded-lg">
                  <p className="text-muted-foreground">3D Preview will be implemented in the next phase</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}