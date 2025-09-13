import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, Layers, Eye, Activity, Wind, Zap, Settings } from 'lucide-react';

// VTK.js imports simplificados
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkHttpDataSetReader from '@kitware/vtk.js/IO/Core/HttpDataSetReader';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';

interface VTKViewerProps {
  simulationId: number;
  className?: string;
}

type VisualizationMode = 'pressure' | 'velocity' | 'default';

export default function VTKViewer({ simulationId, className }: VTKViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<VisualizationMode>('pressure');
  const containerRef = useRef<HTMLDivElement>(null);
  const renderWindowRef = useRef<any>(null);
  const actorRef = useRef<any>(null);

  const visualizationControls = [
    { id: 'pressure' as const, label: 'Pressure', icon: Layers },
    { id: 'velocity' as const, label: 'Velocity', icon: Wind },
    { id: 'default' as const, label: 'Default', icon: Settings }
  ];

  // Aplicar visualización simplificada
  const applyVisualization = (mapper: any, dataset: any, mode: VisualizationMode) => {
    const pointData = dataset.getPointData();
    const lookupTable = vtkColorTransferFunction.newInstance();
    
    let array = null;
    let colorMap = 'Cool to Warm';
    
    switch (mode) {
      case 'pressure':
        array = pointData.getArrayByName('p') || pointData.getArray(0);
        colorMap = 'Cool to Warm';
        break;
      case 'velocity':
        array = pointData.getArrayByName('U') || pointData.getArray(1);
        colorMap = 'Rainbow';
        break;
      default:
        array = pointData.getArray(0);
        break;
    }
    
    if (array) {
      mapper.setScalarModeToUsePointData();
      mapper.setScalarVisibility(true);
      mapper.setColorByArrayName(array.getName());
      
      const range = array.getRange();
      if (range && range.length >= 2) {
        lookupTable.setMappingRange(range[0], range[1]);
      }
      
      lookupTable.applyColorMap(vtkColorMaps.getPresetByName(colorMap));
      mapper.setLookupTable(lookupTable);
      
      console.log(`Applied ${mode} visualization:`, array.getName());
    } else {
      mapper.setScalarVisibility(false);
    }
  };

  const initializeVTKRenderer = async () => {
    if (!containerRef.current) return;

    try {
      setLoading(true);
      setError(null);

      // Cleanup anterior
      if (renderWindowRef.current) {
        renderWindowRef.current.delete();
        renderWindowRef.current = null;
      }

      // Crear renderer
      const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        container: containerRef.current,
        containerStyle: { height: '100%', width: '100%', position: 'relative' }
      });

      renderWindowRef.current = fullScreenRenderer;
      const renderer = fullScreenRenderer.getRenderer();

      // URL simplificada - buscar .vtk generado por foamToVTK
      const vtkUrl = `/api/simulations/${simulationId}/results/result.vtk`;
      console.log('[VTKViewer] Loading VTU/VTK file:', vtkUrl);

      // Validar que el archivo existe
      const response = await fetch(vtkUrl);
      if (!response.ok) {
        throw new Error(`File not found: ${response.status}`);
      }

      // Cargar con HttpDataSetReader (funciona para .vtu y .vtk)
      const reader = vtkHttpDataSetReader.newInstance();
      reader.setUrl(vtkUrl);
      await reader.loadData();
      
      const dataset = reader.getOutputData();
      
      if (!dataset || dataset.getNumberOfPoints() === 0) {
        throw new Error('No data in VTK file');
      }

      console.log('[VTKViewer] Loaded dataset:', dataset.getNumberOfPoints(), 'points');

      // Crear mapper y actor
      const mapper = vtkMapper.newInstance();
      mapper.setInputData(dataset);
      
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      actorRef.current = actor;

      // Aplicar visualización inicial
      applyVisualization(mapper, dataset, activeMode);

      // Añadir a escena
      renderer.addActor(actor);
      renderer.resetCamera();
      renderer.setBackground(0.1, 0.1, 0.2);
      renderWindowRef.current.getRenderWindow().render();

      setLoading(false);

    } catch (error) {
      console.error('[VTKViewer] Loading failed:', error);
      setError(`Failed to load VTK: ${(error as Error).message}`);
      setLoading(false);
    }
  };

  const handleModeChange = (mode: VisualizationMode) => {
    setActiveMode(mode);
    
    if (actorRef.current) {
      const mapper = actorRef.current.getMapper();
      const dataset = mapper.getInputData();
      
      if (dataset) {
        applyVisualization(mapper, dataset, mode);
        renderWindowRef.current?.getRenderWindow().render();
      }
    }
  };

  useEffect(() => {
    initializeVTKRenderer();
  }, [simulationId]);

  return (
    <div className={`vtk-viewer ${className || ''}`}>
      <Card className="border-slate-200 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-600" />
            CFD Results Visualization
            <Badge variant="outline" className="text-xs">
              Simulation #{simulationId}
            </Badge>
          </CardTitle>
          
          <div className="flex flex-wrap gap-2 mt-4">
            {visualizationControls.map((control) => (
              <Button
                key={control.id}
                variant={activeMode === control.id ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeChange(control.id)}
                className="text-xs h-8 gap-1"
                data-testid={`button-visualization-${control.id}`}
              >
                <control.icon className="h-3 w-3" />
                {control.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        
        <CardContent className="p-0 relative">
          <div 
            ref={containerRef}
            className="w-full h-96 bg-gradient-to-br from-gray-900 via-blue-900 to-slate-900 rounded-lg relative overflow-hidden"
            data-testid="vtk-container"
          >
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white bg-black/50 z-10" data-testid="vtk-loading">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>Loading VTK file...</p>
              </div>
            )}
            
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white bg-black/50 z-10" data-testid="vtk-error">
                <AlertCircle className="h-16 w-16 text-red-400" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-red-400">Loading Error</h3>
                  <p className="text-red-200 text-sm mt-2">{error}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}