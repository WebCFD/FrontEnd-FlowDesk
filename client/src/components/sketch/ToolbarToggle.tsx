import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Box, Square } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { AnalyticsCategories, AnalyticsActions } from "@/lib/analyticsEvents";

interface ToolbarToggleProps {
  mode: "2d-editor" | "3d-preview";
  onModeChange: (mode: "2d-editor" | "3d-preview") => void;
  hasClosedContour: boolean;
}

export function ToolbarToggle({ mode, onModeChange, hasClosedContour }: ToolbarToggleProps) {
  // Manejador para el cambio a vista 2D
  const handle2DClick = () => {
    // Si ya está en 2D, no enviamos evento
    if (mode !== "2d-editor") {
      trackEvent(
        AnalyticsCategories.UI,
        AnalyticsActions.CHANGE_TAB,
        "view_2d_editor"
      );
    }
    onModeChange("2d-editor");
  };
  
  // Manejador para el cambio a vista 3D
  const handle3DClick = () => {
    if (hasClosedContour && mode !== "3d-preview") {
      trackEvent(
        AnalyticsCategories.UI,
        AnalyticsActions.CHANGE_TAB,
        "view_3d_preview"
      );
      onModeChange("3d-preview");
    } else if (!hasClosedContour) {
      // Rastrear evento de error al intentar cambiar a 3D sin contorno cerrado
      trackEvent(
        AnalyticsCategories.UI,
        "validation_error",
        "attempt_3d_view_without_closed_contour"
      );
    }
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