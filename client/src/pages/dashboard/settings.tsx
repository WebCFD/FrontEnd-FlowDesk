import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { useSketchStore } from "@/lib/stores/sketch-store";

interface Theme {
  primary: string;
  variant: 'professional' | 'tint' | 'vibrant';
  appearance: 'light' | 'dark' | 'system';
  radius: number;
}

export default function Settings() {
  const { toast } = useToast();
  const [theme, setTheme] = useState<Theme>({
    primary: '#0096FF',
    variant: 'professional',
    appearance: 'system',
    radius: 0.5
  });

  const { snapDistance, setSnapDistance, showCursorCoordinates, setShowCursorCoordinates, fontScale, setFontScale, viewportOffset, setViewportOffset, gridSize, setGridSize, canvasHeightPercentage, setCanvasHeightPercentage } = useSketchStore();

  const variants = [
    { value: 'professional', label: 'Professional' },
    { value: 'tint', label: 'Tint' },
    { value: 'vibrant', label: 'Vibrant' }
  ];

  const appearances = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' }
  ];

  const handleThemeChange = (key: keyof Theme, value: string | number) => {
    setTheme(prev => ({ ...prev, [key]: value }));
    toast({
      title: "Theme updated",
      description: "Your dashboard theme has been updated successfully."
    });
  };

  const handleSnapDistanceChange = (value: number[]) => {
    setSnapDistance(value[0]);
    toast({
      title: "Drawing Resolution updated",
      description: "Your sketching resolution has been updated successfully."
    });
  };

  const handleCursorCoordinatesChange = (checked: boolean) => {
    setShowCursorCoordinates(checked);
    toast({
      title: "Cursor Coordinates updated",
      description: `Cursor coordinates ${checked ? 'enabled' : 'disabled'} successfully.`
    });
  };

  const handleFontScaleChange = (value: number[]) => {
    setFontScale(value[0]);
    toast({
      title: "Text Size updated",
      description: `Text size set to ${Math.round(value[0] * 100)}% successfully.`
    });
  };

  const handleViewportOffsetChange = (value: number[]) => {
    // Validate and clamp the value between 150 and 700
    const clampedValue = Math.max(150, Math.min(700, value[0]));
    setViewportOffset(clampedValue);
    toast({
      title: "Viewport Offset updated",
      description: `Canvas viewport offset set to ${clampedValue}px successfully.`
    });
  };

  const handleGridSizeChange = (value: number[]) => {
    setGridSize(value[0]);
    toast({
      title: "Grid Size updated",
      description: `Grid size set to ${(value[0] * (25 / 20)).toFixed(1)}cm/cell successfully.`
    });
  };

  const handleCanvasHeightPercentageChange = (value: number[]) => {
    setCanvasHeightPercentage(value[0]);
    toast({
      title: "Canvas Height updated",
      description: `Canvas height set to ${value[0]}% of viewport successfully.`
    });
  };

  return (
    <DashboardLayout>
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Theme Customization</CardTitle>
            <CardDescription>
              Customize the appearance of your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label>Color Scheme</Label>
                <div className="flex items-center gap-4 mt-2">
                  <input
                    type="color"
                    value={theme.primary}
                    onChange={(e) => handleThemeChange('primary', e.target.value)}
                    className="h-10 w-20"
                  />
                  <span className="text-sm text-muted-foreground">
                    Primary Color
                  </span>
                </div>
              </div>

              <div>
                <Label>Theme Variant</Label>
                <RadioGroup
                  value={theme.variant}
                  onValueChange={(value) => handleThemeChange('variant', value)}
                  className="grid grid-cols-3 gap-4 mt-2"
                >
                  {variants.map(({ value, label }) => (
                    <div key={value} className="flex items-center space-x-2">
                      <RadioGroupItem value={value} id={value} />
                      <Label htmlFor={value}>{label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div>
                <Label>Appearance</Label>
                <RadioGroup
                  value={theme.appearance}
                  onValueChange={(value) => handleThemeChange('appearance', value)}
                  className="grid grid-cols-3 gap-4 mt-2"
                >
                  {appearances.map(({ value, label }) => (
                    <div key={value} className="flex items-center space-x-2">
                      <RadioGroupItem value={value} id={value} />
                      <Label htmlFor={value}>{label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div>
                <Label>Border Radius</Label>
                <div className="flex items-center gap-4 mt-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={theme.radius}
                    onChange={(e) => handleThemeChange('radius', parseFloat(e.target.value))}
                    className="w-48"
                  />
                  <span className="text-sm text-muted-foreground">
                    {theme.radius}rem
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* New 2D Sketcher Settings Section */}
        <Card>
          <CardHeader>
            <CardTitle>2D Sketcher Settings</CardTitle>
            <CardDescription>
              Configure your 2D sketching environment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label>Drawing Resolution</Label>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex-1">
                    <Slider
                      value={[snapDistance]}
                      onValueChange={handleSnapDistanceChange}
                      min={0.2}
                      max={10}
                      step={0.4}
                      className="w-full"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-12 text-right">
                    {snapDistance.toFixed(1)}
                  </span>
                </div>
              </div>
              
              <div>
                <Label>Grid Size</Label>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex-1">
                    <Slider
                      value={[gridSize]}
                      onValueChange={handleGridSizeChange}
                      min={10}
                      max={50}
                      step={1}
                      className="w-full"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-20 text-right">
                    {(gridSize * (25 / 20)).toFixed(1)}cm/cell
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Control the spacing of grid cells in the 2D editor
                </div>
              </div>
              
              <div>
                <Label>Text Size</Label>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex-1">
                    <Slider
                      value={[fontScale]}
                      onValueChange={handleFontScaleChange}
                      min={0.1}
                      max={3.0}
                      step={0.05}
                      className="w-full"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-16 text-right">
                    {Math.round(fontScale * 100)}%
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Scale all text elements in the floor plan
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="cursor-coordinates">Show Cursor Coordinates</Label>
                  <div className="text-sm text-muted-foreground">
                    Display real-time coordinates while drawing
                  </div>
                </div>
                <Switch
                  id="cursor-coordinates"
                  checked={showCursorCoordinates}
                  onCheckedChange={handleCursorCoordinatesChange}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* New Layout Settings Section */}
        <Card>
          <CardHeader>
            <CardTitle>Layout Settings</CardTitle>
            <CardDescription>
              Configure canvas and viewport layout parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label>Viewport Offset</Label>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex-1">
                    <Slider
                      value={[viewportOffset]}
                      onValueChange={handleViewportOffsetChange}
                      min={150}
                      max={700}
                      step={10}
                      className="w-full"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-16 text-right">
                    {viewportOffset}px
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Height offset for UI elements (header, navigation, etc.)
                </div>
              </div>
              
              <div>
                <Label>Canvas Height</Label>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex-1">
                    <Slider
                      value={[canvasHeightPercentage]}
                      onValueChange={handleCanvasHeightPercentageChange}
                      min={20}
                      max={80}
                      step={5}
                      className="w-full"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-16 text-right">
                    {canvasHeightPercentage}%
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Canvas height as percentage of viewport height
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}