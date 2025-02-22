import { useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NewSimulation() {
  const [step] = useState(1);
  const [simulationName, setSimulationName] = useState("");

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
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
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

              <div className="space-y-2">
                <Label>3D File Guidelines</Label>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Type: *.stl, *.obj, *.step, *.stp, *.iges</li>
                  <li>• Size: max 3145MB</li>
                  <li>• Always save STL file in binary format when possible.</li>
                  <li>• It is recommended to work with watertight 3D models (for highest accuracy) but non-watertight 3D models are also supported.</li>
                </ul>
              </div>

              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <div className="mx-auto w-20 mb-4">
                  <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-muted-foreground">
                    <path d="M7 10V9C7 6.23858 9.23858 4 12 4C14.7614 4 17 6.23858 17 9V10C19.2091 10 21 11.7909 21 14C21 15.4806 20.1956 16.8084 19 17.5M7 10C4.79086 10 3 11.7909 3 14C3 15.4806 3.8044 16.8084 5 17.5M7 10C7.43285 10 7.84965 10.0688 8.24006 10.1959M12 12V21M12 12L15 15M12 12L9 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-lg font-medium mb-2">DRAG & DROP</div>
                <div className="text-sm text-muted-foreground mb-4">
                  Your 3D file here, browse or import file from OnShape
                </div>
                <Button variant="outline" size="sm">Browse Files</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}