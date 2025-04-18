import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SimulationDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  simulationData: object;
}

const SimulationDataDialog: React.FC<SimulationDataDialogProps> = ({
  open,
  onOpenChange,
  simulationData
}) => {
  const { toast } = useToast();
  const jsonData = JSON.stringify(simulationData, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonData)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: "The simulation data has been copied to your clipboard.",
        });
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
        toast({
          title: "Copy failed",
          description: "Failed to copy the simulation data to clipboard.",
          variant: "destructive",
        });
      });
  };

  const handleRunSimulation = () => {
    // Este botón no hace nada por ahora, como solicitado
    toast({
      title: "Simulation",
      description: "Run Simulation functionality will be implemented in the future.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Simulation Data</DialogTitle>
          <DialogDescription>
            This is the complete data of your simulation design. You can copy it to save or share it.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto my-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-md">
          <pre className="text-xs overflow-auto whitespace-pre-wrap">{jsonData}</pre>
        </div>
        
        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button onClick={handleCopy} variant="secondary" className="flex items-center gap-1">
              <Copy className="h-4 w-4" />
              Copy
            </Button>
            <Button onClick={handleRunSimulation} className="flex items-center gap-1">
              <Play className="h-4 w-4" />
              Run Simulation
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SimulationDataDialog;