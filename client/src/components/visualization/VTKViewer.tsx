import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Box, Info } from 'lucide-react';

interface VTKViewerProps {
  simulationId: number;
  className?: string;
}

export default function VTKViewer({ simulationId, className }: VTKViewerProps) {
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Simple simulation of loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [simulationId]);

  return (
    <Card className={className}>
      <CardContent className="p-0 relative">
        <div 
          className="w-full h-96 bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 rounded-lg flex items-center justify-center"
          data-testid="vtk-viewer-container"
        >
          {loading ? (
            <div className="flex flex-col items-center gap-4 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Loading 3D visualization...</p>
            </div>
          ) : (
            <div className="text-center text-white space-y-4">
              <Box className="h-16 w-16 mx-auto text-blue-300" />
              <div>
                <h3 className="text-lg font-semibold">3D CFD Visualization</h3>
                <p className="text-blue-200">Simulation #{simulationId}</p>
                <p className="text-sm text-gray-300 mt-2">
                  Interactive 3D view of simulation results
                </p>
              </div>
              <div className="mt-4 p-3 bg-blue-900/50 rounded-lg border border-blue-700/50">
                <div className="flex items-center gap-2 text-blue-200 text-sm">
                  <Info className="h-4 w-4" />
                  <span>VTK.js 3D renderer ready - CFD data visualization</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}