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

  const { snapDistance, setSnapDistance, showCursorCoordinates, setShowCursorCoordinates } = useSketchStore();

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
      </div>
    </DashboardLayout>
  );
}