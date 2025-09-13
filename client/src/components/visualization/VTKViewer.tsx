import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Box, Info, AlertCircle } from 'lucide-react';

interface VTKViewerProps {
  simulationId: number;
  className?: string;
}

export default function VTKViewer({ simulationId, className }: VTKViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vtkData, setVtkData] = useState<any>(null);
  
  useEffect(() => {
    const loadVTKData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log(`[VTKViewer] Loading VTK data for simulation ${simulationId}`);
        
        const response = await fetch(`/api/simulations/${simulationId}/results/result.vtkjs`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        console.log(`[VTKViewer] Loaded VTK data: ${arrayBuffer.byteLength} bytes`);
        
        setVtkData(arrayBuffer);
        setLoading(false);
      } catch (err) {
        console.error('[VTKViewer] Error loading VTK data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load VTK data');
        setLoading(false);
      }
    };
    
    loadVTKData();
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
              <p>Loading VTK data from server...</p>
            </div>
          ) : error ? (
            <div className="text-center text-white space-y-4">
              <AlertCircle className="h-16 w-16 mx-auto text-red-400" />
              <div>
                <h3 className="text-lg font-semibold text-red-400">Error Loading VTK Data</h3>
                <p className="text-red-200 text-sm mt-2">{error}</p>
              </div>
            </div>
          ) : (
            <div className="text-center text-white space-y-4">
              <Box className="h-16 w-16 mx-auto text-green-300" />
              <div>
                <h3 className="text-lg font-semibold">VTK Data Loaded Successfully</h3>
                <p className="text-green-200">Simulation #{simulationId}</p>
                <p className="text-sm text-gray-300 mt-2">
                  {vtkData ? `${Math.round(vtkData.byteLength / 1024)}KB loaded` : 'Ready for 3D rendering'}
                </p>
              </div>
              <div className="mt-4 p-3 bg-green-900/50 rounded-lg border border-green-700/50">
                <div className="flex items-center gap-2 text-green-200 text-sm">
                  <Info className="h-4 w-4" />
                  <span>Real .vtkjs file loaded - Ready for VTK.js rendering</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}