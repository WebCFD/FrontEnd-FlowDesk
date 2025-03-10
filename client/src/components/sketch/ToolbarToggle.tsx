import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Box, Square } from "lucide-react";

interface ToolbarToggleProps {
  mode: "2d-editor" | "3d-preview";
  onModeChange: (mode: "2d-editor" | "3d-preview") => void;
  hasClosedContour: boolean;
}

export function ToolbarToggle({ mode, onModeChange, hasClosedContour }: ToolbarToggleProps) {
  return (
    <div className="flex gap-2 mb-4">
      <Button
        variant={mode === "2d-editor" ? "default" : "outline"}
        onClick={() => onModeChange("2d-editor")}
        className="w-32"
      >
        <Square className="w-4 h-4 mr-2" />
        2D Editor
      </Button>
      <Button
        variant={mode === "3d-preview" ? "default" : "outline"}
        onClick={() => {
          if (hasClosedContour) {
            onModeChange("3d-preview");
          }
        }}
        className={cn(
          "w-32",
          !hasClosedContour && "opacity-50 cursor-not-allowed"
        )}
        disabled={!hasClosedContour}
      >
        <Box className="w-4 h-4 mr-2" />
        3D Preview
      </Button>
    </div>
  );
}