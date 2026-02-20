import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Box, Square } from "lucide-react";

interface ToolbarToggleProps {
  mode: "2d-editor" | "3d-preview";
  onModeChange: (mode: "2d-editor" | "3d-preview") => void;
  hasClosedContour: boolean;
}

export function ToolbarToggle({ mode, onModeChange, hasClosedContour }: ToolbarToggleProps) {
  const handle2DClick = () => {
    onModeChange("2d-editor");
  };
  
  const handle3DClick = () => {
    onModeChange("3d-preview");
  };
  
  return (
    <div className="flex gap-2 mb-4">
      <Button
        variant={mode === "2d-editor" ? "default" : "outline"}
        onClick={handle2DClick}
        className="w-32"
      >
        <Square className="w-4 h-4 mr-2" />
        2D Editor
      </Button>
      <Button
        variant={mode === "3d-preview" ? "default" : "outline"}
        onClick={handle3DClick}
        className="w-32"
      >
        <Box className="w-4 h-4 mr-2" />
        3D Preview
      </Button>
    </div>
  );
}
