import { useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Save, Upload, Eraser, ArrowRight, ArrowLeft } from "lucide-react";
import Canvas2D from "@/components/sketch/Canvas2D";

export default function WizardDesign() {
  const [step, setStep] = useState(1);
  const [simulationName, setSimulationName] = useState("");
  const [gridSize, setGridSize] = useState(20);
  const [currentTool, setCurrentTool] = useState<'wall' | 'eraser'>('wall');
  const { toast } = useToast();

  const steps = [
    { id: 1, name: "Upload" },
    { id: 2, name: "Setup" },
    { id: 3, name: "Order" }
  ];

  const handleGridSizeChange = (value: number[]) => {
    setGridSize(value[0]);
  };

  const gridSizeToCm = (pixels: number): number => {
    return pixels * (25 / 20); // Convert pixels to cm using the same ratio
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const renderStepIndicator = () => (
    <div className="w-full">
      <div className="relative h-16 bg-muted/10 border rounded-lg">
        <div className="absolute inset-0 flex justify-between items-center px-8">
          {/* Decorative lines */}
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

  // Rest of the code from new-simulation.tsx remains the same
  // Including renderStep1, renderStep2, renderStep3 functions
  
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
          <Tabs defaultValue="2d-editor" className="w-full">
            <TabsList>
              <TabsTrigger value="2d-editor">2D Editor</TabsTrigger>
              <TabsTrigger value="3d-preview">3D Preview</TabsTrigger>
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
                      <div className="text-sm text-right mt-1">{gridSizeToCm(gridSize).toFixed(1)}cm/cell</div>
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
    </div>
  );

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
            <Button onClick={() => toast({ title: "Starting simulation...", description: "Your simulation will begin shortly." })}>
              Start Simulation
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
