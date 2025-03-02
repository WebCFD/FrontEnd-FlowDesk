import { useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { RoomSketchPro } from "@/components/sketch/RoomSketchPro";
import { Separator } from "@/components/ui/separator";
import { Eraser, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function NewSimulation() {
  const [step, setStep] = useState(1);
  const [simulationName, setSimulationName] = useState("");
  const { toast } = useToast();
  const [hasError, setHasError] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("pay-as-you-go");
  const [placedObjects, setPlacedObjects] = useState<Array<{ id: string; src: string; x: number; y: number }>>([]);


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

  // Pre-defined objects for the simulation
  const objects = [
    { id: 'lamp', src: '/objects/lamp.svg', label: 'Lamp' },
    { id: 'cat', src: '/objects/cat.svg', label: 'Cat' },
    { id: 'chair', src: '/objects/chair.svg', label: 'Chair' },
    { id: 'table', src: '/objects/table.svg', label: 'Table' },
    { id: 'sofa', src: '/objects/sofa.svg', label: 'Sofa' }
  ] as const;

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

                {/* RoomSketchPro Component */}
                <div className="border rounded-lg overflow-hidden">
                  <RoomSketchPro width={800} height={600} />
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
                  {/* Placeholder for RoomSketchPro in Step 2 if needed.  This is not strictly necessary based on the intention. */}
                  {/* <RoomSketchPro width={800} height={600} /> */}

                  {/* Display placed objects */}
                  <div>
                    {placedObjects.map((obj, index) => (
                      <img
                        key={obj.id}
                        src={obj.src}
                        alt={obj.id}
                        style={{
                          position: 'absolute',
                          left: obj.x,
                          top: obj.y,
                          width: 50,
                          height: 50,
                        }}
                      />
                    ))}
                  </div>
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
        <div className="max-w-5xl mx-auto space-y-4">
          {/* First Row - Summary and Credits */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Project Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Project name</span>
                    <span className="font-medium">{simulationName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-medium">Above Ground</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Motion</span>
                    <span className="font-medium">Moving</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fluid</span>
                    <span className="font-medium">Air</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Wind velocity</span>
                    <span className="font-medium">20.0 m/sec</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rotation</span>
                    <span className="font-medium">2.0 X/Y: 21.0/2.0 D</span>
                  </div>
                  <Separator className="col-span-2 my-2" />
                  <div className="col-span-2 flex justify-between font-medium">
                    <span>Subtotal:</span>
                    <span>€500.00</span>
                  </div>
                  <div className="col-span-2 flex justify-between font-medium">
                    <span>VAT (0%):</span>
                    <span>€0.00</span>
                  </div>
                  <div className="col-span-2 flex justify-between text-base font-bold">
                    <span>Total Cost:</span>
                    <span>€500.00</span>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Available Credits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">€500.00</div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Second Row - Order Options */}
          <div>
            <CardHeader className="px-0 pb-3">
              <CardTitle>Order Options</CardTitle>
              <CardDescription>Select your simulation plan</CardDescription>
            </CardHeader>
            <RadioGroup
              defaultValue="pay-as-you-go"
              className="grid grid-cols-3 gap-4"
              onValueChange={setSelectedPlan}
            >
              {/* Pay as you go */}
              <Card className={`cursor-pointer hover:bg-accent transition-colors ${selectedPlan === 'pay-as-you-go' ? 'border-primary' : ''}`}>
                <CardContent className="pt-6">
                  <RadioGroupItem value="pay-as-you-go" id="pay-as-you-go" className="hidden" />
                  <Label htmlFor="pay-as-you-go" className="space-y-3">
                    <div className="font-medium">Pay as you go</div>
                    <div className="text-xs text-muted-foreground">Perfect for occasional users and small projects</div>
                    <div className="font-bold text-lg">€5 <span className="text-sm font-normal text-muted-foreground">per simulation</span></div>
                    <div className="text-xs space-y-1">
                      {['Analysis Only', 'Online Result Viewer', '30 day data retention', 'PDF Reporting and Raw Data', 'Simulation Sharing'].map((feature) => (
                        <div key={feature} className="flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </Label>
                </CardContent>
              </Card>

              {/* Discovery */}
              <Card className={`cursor-pointer hover:bg-accent transition-colors ${selectedPlan === 'discovery' ? 'border-primary' : ''}`}>
                <CardContent className="pt-6">
                  <RadioGroupItem value="discovery" id="discovery" className="hidden" />
                  <Label htmlFor="discovery" className="space-y-3">
                    <div className="font-medium">Discovery</div>
                    <div className="text-xs text-muted-foreground">Ideal for teams and regular simulations</div>
                    <div className="font-bold text-lg">€99 <span className="text-sm font-normal text-muted-foreground">per 25 simulations</span></div>
                    <div className="text-xs space-y-1">
                      {['Analysis and Design Advice', 'Online Result Viewer', 'Data Retention during plan', 'PDF Reporting and Raw Data', 'Simulation Sharing'].map((feature) => (
                        <div key={feature} className="flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </Label>
                </CardContent>
              </Card>

              {/* Enterprise */}
              <Card className={`cursor-pointer hover:bg-accent transition-colors ${selectedPlan === 'enterprise' ? 'border-primary' : ''}`}>
                <CardContent className="pt-6">
                  <RadioGroupItem value="enterprise" id="enterprise" className="hidden" />
                  <Label htmlFor="enterprise" className="space-y-3">
                    <div className="font-medium">Enterprise</div>
                    <div className="text-xs text-muted-foreground">For organizations with specific requirements</div>
                    <div className="font-bold text-lg">Custom</div>
                    <div className="text-xs space-y-1">
                      {[
                        'Unlimited simulations',
                        'Custom workflow integration',
                        'Personal success manager',
                        'SLA guarantee',
                        'Custom features',
                        'Training & onboarding'
                      ].map((feature) => (
                        <div key={feature} className="flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </Label>
                </CardContent>
              </Card>
            </RadioGroup>
          </div>

          {/* Third Row - Navigation */}
          <div className="flex justify-between">
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

          {/* Fourth Row - Payment Information */}
          <Card>
            <CardHeader className="pb-3">
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
        </div>
      )}
    </DashboardLayout>
  );
}