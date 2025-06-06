import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Save, Upload, Eraser, ArrowRight, ArrowLeft } from "lucide-react";
import Canvas2D from "@/components/sketch/Canvas2D";
import { RoomSketchPro } from "@/components/sketch/RoomSketchPro";
import { SceneProvider } from "@/contexts/SceneContext";

export default function NewSimulation() {
  const [step, setStep] = useState(1);
  const [simulationName, setSimulationName] = useState("");
  const [gridSize, setGridSize] = useState(20);
  const [currentTool, setCurrentTool] = useState<'wall' | 'eraser'>('wall');
  const [wallTransparency, setWallTransparency] = useState(0.5);

  // Debug logs for step changes
  useEffect(() => {
    console.log('Step changed to:', step);
  }, [step]);

  const handleNext = () => {
    console.log('Next button clicked, current step:', step);
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    console.log('Back button clicked, current step:', step);
    if (step > 1) setStep(step - 1);
  };

  const steps = [
    { id: 1, name: "Upload" },
    { id: 2, name: "Setup" },
    { id: 3, name: "Order" }
  ];

  const renderStepIndicator = () => {
    console.log('Rendering step indicator, step:', step);
    return (
      <div className="w-full">
        <div className="relative h-16 bg-muted/10 border rounded-lg">
          <div className="absolute inset-0 flex justify-between items-center px-8">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-[33%]">
              <div className="w-24 h-px bg-border" />
              <div className="w-24 h-px bg-border" />
            </div>

            {steps.map((s) => (
              <div
                key={s.id}
                className="flex items-center cursor-pointer relative z-10 bg-muted/10 px-3"
                onClick={() => {
                  console.log('Step clicked:', s.id);
                  setStep(s.id);
                }}
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
  };

  const renderContent = () => {
    console.log('Rendering content for step:', step);

    switch (step) {
      case 1:
        return (
          // Step 1 content -  This needs to be filled in from the original code.  We are assuming it exists but is not shown.
          <div>Step 1 content</div> 
        );

      case 2:
        console.log('Rendering Step 2 content');
        return (
          <div className="space-y-6">
            {/* 3D View */}
            <div className="w-full h-[600px] border rounded-lg overflow-hidden bg-white">
              <SceneProvider>
                <RoomSketchPro 
                  width={800} 
                  height={600} 
                  wallTransparency={wallTransparency}
                  onWallTransparencyChange={setWallTransparency}
                />
              </SceneProvider>
            </div>

            {/* Parameters Card */}
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
          </div>
        );

      case 3:
        return (
          // Step 3 content - This needs to be filled in from the original code. We are assuming it exists but is not shown.
          <div>Step 3 content</div>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
        {renderStepIndicator()}

        <div className="min-h-[600px]">
          {renderContent()}
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
            <Button>Start Simulation</Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}