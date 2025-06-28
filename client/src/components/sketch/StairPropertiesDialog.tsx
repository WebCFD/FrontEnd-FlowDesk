import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";
import { StairPolygon } from "@/types";

interface StairPropertiesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  stair: StairPolygon | null;
  onSave: (stairId: string, temperature: number) => void;
}

export default function StairPropertiesDialog({
  isOpen,
  onClose,
  stair,
  onSave,
}: StairPropertiesDialogProps) {
  const [temperature, setTemperature] = useState("20");

  useEffect(() => {
    if (stair) {
      setTemperature(stair.temperature?.toString() || "20");
    }
  }, [stair]);

  const handleSave = () => {
    if (stair) {
      const temp = parseFloat(temperature);
      if (!isNaN(temp) && temp >= -50 && temp <= 100) {
        onSave(stair.id, temp);
        onClose();
      } else {
        alert("Please enter a valid temperature between -50°C and 100°C");
      }
    }
  };

  const handleClose = () => {
    if (stair) {
      setTemperature(stair.temperature?.toString() || "20");
    }
    onClose();
  };

  if (!isOpen || !stair) return null;

  return (
    <div className="fixed top-4 right-4 z-50 w-96">
      <Card className="shadow-lg border border-gray-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              Stair Properties
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Edit thermal properties for stair {stair.id}
          </p>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stair-id" className="text-sm font-medium">
              Stair ID
            </Label>
            <Input
              id="stair-id"
              value={stair.id}
              disabled
              className="bg-gray-50"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="floor" className="text-sm font-medium">
              Floor
            </Label>
            <Input
              id="floor"
              value={stair.floor}
              disabled
              className="bg-gray-50"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="temperature" className="text-sm font-medium">
              Temperatura (°C)
            </Label>
            <Input
              id="temperature"
              type="number"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="20.0"
              min="-50"
              max="100"
              step="0.1"
            />
          </div>
          
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
            <p><strong>Points:</strong> {stair.points.length} points</p>
            {stair.connectsTo && (
              <p><strong>Connects to:</strong> {stair.connectsTo}</p>
            )}
          </div>
          
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex-1">
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}