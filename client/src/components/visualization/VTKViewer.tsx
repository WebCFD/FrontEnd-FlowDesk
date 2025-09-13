import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, Layers, Eye, Activity, Wind, Zap, Settings } from 'lucide-react';

// VTK.js imports
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
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

  // Aplicar visualización con colormaps válidos
  const applyVisualization = (mapper: any, dataset: any, mode: VisualizationMode) => {
    const pointData = dataset.getPointData();
    const lookupTable = vtkColorTransferFunction.newInstance();
    
    let array = null;
    let presetName = 'erdc_rainbow_bright';
    
    switch (mode) {
      case 'pressure':
        array = pointData.getArrayByName('p') || pointData.getArray(0);
        presetName = 'erdc_blue2red_bw'; // Azul a rojo para presión
        break;
      case 'velocity':
        array = pointData.getArrayByName('U') || pointData.getArray(1);
        presetName = 'erdc_rainbow_bright'; // Rainbow para velocidad
        break;
      default:
        array = pointData.getArray(0);
        presetName = 'grayscale'; // Escala de grises por defecto
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
      
      // Intentar aplicar colormap, con fallback manual si falla
      const preset = vtkColorMaps.getPresetByName(presetName);
      if (preset) {
        lookupTable.applyColorMap(preset);
      } else {
        // Fallback manual para colormaps científicos
        console.warn(`Preset ${presetName} not found, using manual colormap`);
        if (mode === 'pressure') {
          // Azul (frío) a rojo (caliente) para presión
          lookupTable.addRGBPoint(range[0], 0.0, 0.0, 1.0); // Azul
          lookupTable.addRGBPoint((range[0] + range[1]) / 2, 0.0, 1.0, 0.0); // Verde
          lookupTable.addRGBPoint(range[1], 1.0, 0.0, 0.0); // Rojo
        } else {
          // Rainbow para velocidad
          lookupTable.addRGBPoint(range[0], 0.0, 0.0, 1.0); // Azul
          lookupTable.addRGBPoint(range[0] + (range[1] - range[0]) * 0.25, 0.0, 1.0, 1.0); // Cyan
          lookupTable.addRGBPoint(range[0] + (range[1] - range[0]) * 0.5, 0.0, 1.0, 0.0); // Verde
          lookupTable.addRGBPoint(range[0] + (range[1] - range[0]) * 0.75, 1.0, 1.0, 0.0); // Amarillo
          lookupTable.addRGBPoint(range[1], 1.0, 0.0, 0.0); // Rojo
        }
      }
      
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
        const { renderWindow, renderer, openGLRenderWindow, interactor } = renderWindowRef.current;
        
        // Cleanup VTK objects
        if (interactor) interactor.delete();
        if (openGLRenderWindow) openGLRenderWindow.delete();
        if (renderer) renderer.delete();
        if (renderWindow) renderWindow.delete();
        
        renderWindowRef.current = null;
      }

      // Crear renderer
      // Configuración manual del render window
      const renderWindow = vtkRenderWindow.newInstance();
      const renderer = vtkRenderer.newInstance();
      renderWindow.addRenderer(renderer);

      const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
      renderWindow.addView(openGLRenderWindow);
      
      // Configurar el contenedor DOM
      if (containerRef.current) {
        openGLRenderWindow.setContainer(containerRef.current);
        const { width, height } = containerRef.current.getBoundingClientRect();
        openGLRenderWindow.setSize(width, height);
      }

      // Configurar interacciones
      const interactor = vtkRenderWindowInteractor.newInstance();
      interactor.setView(openGLRenderWindow);
      interactor.initialize();

      const trackballStyle = vtkInteractorStyleTrackballCamera.newInstance();
      interactor.setInteractorStyle(trackballStyle);
      interactor.bindEvents(containerRef.current);

      renderWindowRef.current = { renderWindow, renderer, openGLRenderWindow, interactor };

      // URL simplificada - buscar .vtkjs generado por foamToVTK  
      const vtkUrl = `/api/simulations/${simulationId}/results/result.vtkjs`;
      console.log('[VTKViewer] Loading VTK.js file:', vtkUrl);

      // Validar que el archivo existe
      const response = await fetch(vtkUrl);
      if (!response.ok) {
        throw new Error(`File not found: ${response.status}`);
      }

      // Parsear archivo JSON .vtkjs manualmente (no es VTK legacy)
      const vtkData = await response.json();
      console.log('[VTKViewer] Parsed VTK JSON:', {
        pointsSize: vtkData.points?.size || 0,
        polysSize: vtkData.polys?.size || 0,
        pointDataArrays: vtkData.pointData?.arrays?.length || 0
      });

      // Crear PolyData desde el JSON
      const polyData = vtkPolyData.newInstance();
      const points = vtkPoints.newInstance();

      // Cargar puntos
      if (vtkData.points?.values) {
        const pointsData = new Float32Array(vtkData.points.values);
        points.setData(pointsData);
        polyData.setPoints(points);
      }

      // Cargar polígonos
      if (vtkData.polys?.values) {
        const polysData = new Uint32Array(vtkData.polys.values);
        polyData.getPolys().setData(polysData);
      }

      // Cargar datos de punto (presión, velocidad, etc.)
      if (vtkData.pointData?.arrays) {
        for (const arrayInfo of vtkData.pointData.arrays) {
          if (arrayInfo.data?.values) {
            const dataArray = vtkDataArray.newInstance({
              name: arrayInfo.data.name,
              dataType: arrayInfo.data.dataType,
              numberOfComponents: arrayInfo.data.numberOfComponents || 1,
              values: arrayInfo.data.values
            });

            // Si es el primer array o es presión, usarlo como scalars
            if (arrayInfo.data.name === 'p' || arrayInfo.data.name === 'pressure' || 
                polyData.getPointData().getNumberOfArrays() === 0) {
              polyData.getPointData().setScalars(dataArray);
            } else {
              polyData.getPointData().addArray(dataArray);
            }
          }
        }
      }

      const dataset = polyData;
      
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
      renderWindow.render();

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
        renderWindowRef.current?.renderWindow.render();
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