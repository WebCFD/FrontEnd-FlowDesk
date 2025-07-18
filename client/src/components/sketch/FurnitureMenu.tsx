import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { FurnitureMenuItemData } from "@shared/furniture-types";
import { STLUploader } from "./STLUploader";
import { customFurnitureStore } from "@/lib/custom-furniture-store";
import { useState, useEffect } from "react";
import * as THREE from "three";

// Use the unified menu item type
type FurnitureItem = FurnitureMenuItemData;

interface FurnitureMenuProps {
  onDragStart: (item: FurnitureItem) => void;
  floorContext?: {
    currentFloor: string;
    floors: Record<string, any>;
  };
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
    `,
    defaultDimensions: { width: 120, height: 75, depth: 80 }
  },
  {
    id: 'person',
    name: 'Person',
    icon: `
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="10" r="6" fill="#4A5568"/>
        <path d="M10 35V20C10 17.2386 12.2386 15 15 15H25C27.7614 15 30 17.2386 30 20V35" stroke="#4A5568" stroke-width="4"/>
      </svg>
    `,
    defaultDimensions: { width: 50, height: 170, depth: 30 }
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
    `,
    defaultDimensions: { width: 70, height: 85, depth: 70 }
  },
  {
    id: 'car',
    name: 'Car',
    icon: `
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="20" width="30" height="8" fill="#1E40AF"/>
        <circle cx="12" cy="32" r="3" fill="#2D3748"/>
        <circle cx="28" cy="32" r="3" fill="#2D3748"/>
      </svg>
    `,
    defaultDimensions: { width: 450, height: 150, depth: 180 }
  },
  {
    id: 'block',
    name: 'Block',
    icon: `
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="8" width="24" height="24" fill="#909090" stroke="#666666" stroke-width="2"/>
        <rect x="6" y="6" width="24" height="24" fill="none" stroke="#666666" stroke-width="1" opacity="0.5"/>
      </svg>
    `,
    defaultDimensions: { width: 80, height: 80, depth: 80 }
  },
  {
    id: 'vent',
    name: 'Vent',
    icon: `
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="5" width="30" height="30" stroke="#22c55e" stroke-width="2" fill="none"/>
        <line x1="5" y1="20" x2="35" y2="20" stroke="#22c55e" stroke-width="2"/>
        <line x1="20" y1="5" x2="20" y2="35" stroke="#22c55e" stroke-width="2"/>
      </svg>
    `,
    defaultDimensions: { width: 50, height: 50, depth: 10 }
  }
];

export function FurnitureMenu({ onDragStart, floorContext }: FurnitureMenuProps) {
  const [customItems, setCustomItems] = useState<FurnitureItem[]>([]);

  // Subscribe to custom furniture store updates
  useEffect(() => {
    const updateCustomItems = () => {
      setCustomItems(customFurnitureStore.getCustomFurnitureMenuItems());
    };

    // Initial load
    updateCustomItems();

    // Subscribe to changes
    const unsubscribe = customFurnitureStore.subscribe(updateCustomItems);
    return () => {
      unsubscribe();
    };
  }, []);



  const handleSTLLoaded = (modelData: {
    name: string;
    geometry: THREE.BufferGeometry;
    originalFile: File;
  }) => {
    // STLProcessor already adds to store, so we just need to trigger a refresh
    // This prevents the double-add issue
  };

  // Separate items by categories
  const furnitureItems_category = furnitureItems.filter(item => ['table', 'armchair'].includes(item.id));
  const charactersItems = furnitureItems.filter(item => item.id === 'person');
  const objectsItems = furnitureItems.filter(item => ['car', 'block'].includes(item.id));
  const airEntriesItems = furnitureItems.filter(item => item.id === 'vent');
  
  // Custom furniture goes with furniture category
  const allFurnitureItems = [...furnitureItems_category, ...customItems];

  const renderCategory = (title: string, items: FurnitureItem[]) => (
    <div className="space-y-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
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
              "bg-white shadow-sm",
              // Highlight custom objects with subtle green border
              item.id.startsWith('custom_') ? "border-green-300 bg-green-50" : ""
            )}
            title={`${item.name} - Drag to canvas to place`}
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
  );

  return (
    <div className="w-full space-y-6">
      {/* Furniture Category */}
      {renderCategory("Furniture", allFurnitureItems)}
      
      {/* Characters Category */}
      {renderCategory("Characters", charactersItems)}
      
      {/* Objects Category */}
      {renderCategory("Objects", objectsItems)}
      
      {/* Floor/Ceiling Air Entries Category */}
      {renderCategory("Floor/Ceiling Air Entries", airEntriesItems)}

      <div className="space-y-4">
        <h3 className="font-semibold">Load Custom Object</h3>
        <STLUploader onModelLoaded={handleSTLLoaded} floorContext={floorContext} />
      </div>
    </div>
  );
}