import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface ControlMenuProps {
  onTransparencyChange: (value: number) => void;
  transparency: number;
}

export function ControlMenu({ onTransparencyChange, transparency }: ControlMenuProps) {
  return (
    <div className="w-48 space-y-6 mb-4">
      <div className="space-y-4">
        <h3 className="font-semibold">View Controls</h3>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">Wall Transparency</label>
          <Slider
            value={[transparency]}
            onValueChange={(values) => onTransparencyChange(values[0])}
            min={0}
            max={1}
            step={0.1}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
