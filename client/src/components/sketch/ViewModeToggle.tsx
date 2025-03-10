import { Button } from "@/components/ui/button";

interface ViewModeToggleProps {
  viewMode: "2d-editor" | "3d-preview";
  onViewModeChange: (mode: "2d-editor" | "3d-preview") => void;
  disabled?: boolean;
}

export function ViewModeToggle({
  viewMode,
  onViewModeChange,
  disabled = false
}: ViewModeToggleProps) {
  return (
    <div className="absolute top-4 right-4 flex items-center gap-2 bg-white/80 p-2 rounded-lg shadow-sm z-10">
      <Button
        variant={viewMode === "2d-editor" ? "default" : "outline"}
        onClick={() => onViewModeChange("2d-editor")}
        disabled={disabled}
        size="sm"
      >
        2D
      </Button>
      <Button
        variant={viewMode === "3d-preview" ? "default" : "outline"}
        onClick={() => onViewModeChange("3d-preview")}
        disabled={disabled}
        size="sm"
      >
        3D
      </Button>
    </div>
  );
}
