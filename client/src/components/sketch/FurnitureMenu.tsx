import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

interface FurnitureItem {
  id: string;
  name: string;
  icon: string;
}

interface FurnitureMenuProps {
  onDragStart: (item: FurnitureItem) => void;
  wallTransparency: number;
  onWallTransparencyChange: (value: number) => void;
}

const furnitureItems: FurnitureItem[] = [
  {
    id: 'table',
    name: 'Table',
    icon: `
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="25" width="30" height="4" fill="#8B4513"/>
        <rect x="8" y="29" width="4" height="8" fill="#8B4513"/>
        <rect x="28" y="29" width="4" height="8" fill="#8B4513"/>
      </svg>
    `
  },
  {
    id: 'person',
    name: 'Person',
    icon: `
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="10" r="6" fill="#4A5568"/>
        <path d="M10 35V20C10 17.2386 12.2386 15 15 15H25C27.7614 15 30 17.2386 30 20V35" stroke="#4A5568" stroke-width="4"/>
      </svg>
    `
  },
  {
    id: 'armchair',
    name: 'Armchair',
    icon: `
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="15" width="24" height="15" rx="2" fill="#718096"/>
        <rect x="5" y="25" width="30" height="5" rx="1" fill="#4A5568"/>
        <rect x="8" y="30" width="4" height="5" fill="#4A5568"/>
        <rect x="28" y="30" width="4" height="5" fill="#4A5568"/>
      </svg>
    `
  }
];

export function FurnitureMenu({ onDragStart, wallTransparency, onWallTransparencyChange }: FurnitureMenuProps) {
  const handleTransparencyChange = (values: number[]) => {
    console.log("Slider value changed:", values[0]);
    console.log("Current wall transparency:", wallTransparency);
    if (onWallTransparencyChange) {
      onWallTransparencyChange(values[0]);
    }
  };

  console.log("FurnitureMenu render - wallTransparency:", wallTransparency);

  return (
    <div className="w-48 space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold">View Controls</h3>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">Wall Transparency</label>
          <Slider
            value={[wallTransparency]}
            onValueChange={handleTransparencyChange}
            min={0}
            max={1}
            step={0.1}
            className="w-full"
          />
          <div className="text-xs text-gray-500">
            Current: {wallTransparency.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold">Furniture</h3>
        <div className="grid grid-cols-1 gap-2">
          {furnitureItems.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/json', JSON.stringify(item));
                onDragStart(item);
              }}
              className={cn(
                "h-16 p-2 flex flex-col items-center justify-center",
                "border-2 border-gray-300 rounded-md",
                "hover:bg-gray-100 cursor-move transition-all duration-200",
                "bg-white shadow-sm"
              )}
            >
              <div 
                className="w-10 h-10"
                dangerouslySetInnerHTML={{ __html: item.icon }}
              />
              <span className="text-xs mt-1">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}