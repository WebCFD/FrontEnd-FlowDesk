import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Minus,
  DoorOpen,
  Square,
  Grid3X3,
  Save,
  FileUp,
  Eraser,
  Trash2,
  Grid
} from "lucide-react";
import type { RoomEditorState } from "@/hooks/useRoomEditor";

interface ToolPanelProps {
  editor: RoomEditorState;
}

export default function ToolPanel({ editor }: ToolPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium mb-2">Tools</h3>
        <ToggleGroup
          type="single"
          value={editor.tool}
          onValueChange={(value) => editor.setTool(value as 'wall' | 'door' | 'window' | 'eraser' | 'grid')}
          className="flex gap-6"
        >
          <ToggleGroupItem 
            value="wall" 
            aria-label="Draw Wall" 
            className="h-20 w-24 flex-col data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Minus className="h-6 w-6 rotate-45 mb-2" />
            <span className="text-xs whitespace-nowrap">Wall Line</span>
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="eraser" 
            aria-label="Eraser" 
            className="h-20 w-24 flex-col data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Eraser className="h-6 w-6 mb-2" />
            <span className="text-xs whitespace-nowrap">Eraser</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {editor.selectedWallIndex !== null && (
        <Button
          variant="destructive"
          className="w-full"
          onClick={editor.deleteSelectedWall}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Selected Wall
        </Button>
      )}

      <div>
        <Label>Grid Size</Label>
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-4 w-4" />
          <Slider
            value={[editor.gridSize]}
            onValueChange={([value]) => editor.setGridSize(value)}
            min={5}
            max={125}
            step={5}
          />
          <span className="text-sm">{editor.gridSize}px</span>
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-2">Air Entries</h3>
        <ToggleGroup
          type="single"
          value={editor.tool}
          onValueChange={(value) => editor.setTool(value as 'wall' | 'door' | 'window' | 'eraser' | 'grid')}
          className="flex gap-6"
        >
          <ToggleGroupItem 
            value="grid" 
            aria-label="Grid"
            className="h-20 w-24 flex-col data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Grid className="h-6 w-6 mb-2" />
            <span className="text-xs whitespace-nowrap">Vent-Grid</span>
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="door" 
            aria-label="Add Door"
            className="h-20 w-24 flex-col data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <DoorOpen className="h-6 w-6 mb-2" />
            <span className="text-xs whitespace-nowrap">Door</span>
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="window" 
            aria-label="Add Window"
            className="h-20 w-24 flex-col data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Square className="h-6 w-6 mb-2" />
            <span className="text-xs whitespace-nowrap">Window</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="!mt-auto pt-6 space-y-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={editor.saveRoom}
        >
          <Save className="h-4 w-4 mr-2" />
          Save Design
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={editor.loadRoom}
        >
          <FileUp className="h-4 w-4 mr-2" />
          Load Design
        </Button>
      </div>
    </div>
  );
}