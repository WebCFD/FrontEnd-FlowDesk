import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Eye, Eraser, Ruler, ChevronDown } from "lucide-react";

export type ViewDirection = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";

interface Toolbar3DProps {
  isActive: boolean;
  wallTransparency: number;
  onWallTransparencyChange: (value: number) => void;
  isMeasureMode: boolean;
  onToggleMeasureMode: () => void;
  isEraserMode?: boolean;
  onToggleEraserMode?: () => void;
  onViewChange?: (direction: ViewDirection) => void;
}

export function Toolbar3D({
  isActive,
  wallTransparency,
  onWallTransparencyChange,
  isMeasureMode,
  onToggleMeasureMode,
  isEraserMode = false,
  onToggleEraserMode,
  onViewChange,
}: Toolbar3DProps) {
  return (
    <div className={cn(
      "w-48 space-y-6",
      !isActive && "opacity-50 pointer-events-none"
    )}>
      <div className="space-y-4">
        <h3 className="font-semibold">3D Tools</h3>
        <div className="grid grid-cols-3 gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full h-16 flex flex-col items-center justify-center gap-1"
              >
                <Eye className="w-6 h-6" />
                <span className="text-xs flex items-center">
                  View <ChevronDown className="h-3 w-3 ml-1" />
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onViewChange && onViewChange("+X")}>
                +X View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange && onViewChange("-X")}>
                -X View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange && onViewChange("+Y")}>
                +Y View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange && onViewChange("-Y")}>
                -Y View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange && onViewChange("+Z")}>
                +Z View (Top)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange && onViewChange("-Z")}>
                -Z View (Bottom)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant={isEraserMode ? "default" : "outline"}
            className={cn(
              "w-full h-16 flex flex-col items-center justify-center gap-1",
              isEraserMode && "bg-violet-500 hover:bg-violet-600 text-white border-violet-600"
            )}
            onClick={() => {
              console.log("Eraser button clicked, current isEraserMode:", isEraserMode);
              if (onToggleEraserMode) onToggleEraserMode();
            }}
          >
            <Eraser className="w-6 h-6" />
            <span className="text-xs">Eraser</span>
          </Button>
          <Button
            variant={isMeasureMode ? "default" : "outline"}
            className={cn(
              "w-full h-16 flex flex-col items-center justify-center gap-1",
              isMeasureMode && "bg-violet-500 hover:bg-violet-600 text-white border-violet-600"
            )}
            onClick={onToggleMeasureMode}
          >
            <Ruler className="w-6 h-6" />
            <span className="text-xs">Measure</span>
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold">Wall Transparency</h3>
        <div className="px-2">
          <Slider
            value={[wallTransparency * 100]}
            max={100}
            min={0}
            step={1}
            onValueChange={(value: number[]) => onWallTransparencyChange(value[0] / 100)}
          />
          <div className="text-sm text-right mt-1">
            {Math.round(wallTransparency * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}