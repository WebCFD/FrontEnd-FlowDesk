import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Camera, RotateCw, ZoomIn } from "lucide-react";

interface Toolbar3DProps {
  isActive: boolean;
  wallTransparency: number;
  onWallTransparencyChange: (value: number) => void;
}

export function Toolbar3D({
  isActive,
  wallTransparency,
  onWallTransparencyChange,
}: Toolbar3DProps) {
  return (
    <div className={cn(
      "w-48 space-y-6",
      !isActive && "opacity-50 pointer-events-none"
    )}>
      <div className="space-y-4">
        <h3 className="font-semibold">3D Tools</h3>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="w-full h-16 flex flex-col items-center justify-center gap-1"
          >
            <Camera className="w-6 h-6" />
            <span className="text-xs">Camera</span>
          </Button>
          <Button
            variant="outline"
            className="w-full h-16 flex flex-col items-center justify-center gap-1"
          >
            <RotateCw className="w-6 h-6" />
            <span className="text-xs">Rotate</span>
          </Button>
          <Button
            variant="outline"
            className="w-full h-16 flex flex-col items-center justify-center gap-1"
          >
            <ZoomIn className="w-6 h-6" />
            <span className="text-xs">Zoom</span>
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