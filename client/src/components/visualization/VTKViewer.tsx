import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, Layers, Eye, Activity, Wind, Zap, Settings } from 'lucide-react';

// VTK.js imports - proper order
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import '@kitware/vtk.js/IO/Core/DataAccessHelper/JSZipDataAccessHelper'; // ✅ Para .vtkjs files
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkHttpDataSetReader from '@kitware/vtk.js/IO/Core/HttpDataSetReader';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkHttpSceneLoader from '@kitware/vtk.js/IO/Core/HttpSceneLoader';
import { getVTKUrl, loadVTKFile } from '@/utils/api';

interface VTKViewerProps {
  simulationId: number;
  className?: string;
}

type VisualizationMode = 'pressure' | 'velocity' | 'streamlines_vertical' | 'streamlines_horizontal' | 'surface_pressure' | 'surface_friction';

interface VisualizationControl {
  id: VisualizationMode;
  label: string;
  icon: any;
  active: boolean;
}

// ✅ HOISTED: Apply different visualization modes (moved above initializeVTKRenderer)
function applyVisualizationMode(mapper: any, dataset: any, mode: VisualizationMode) {
  // Create color lookup table for different modes
  const colorMap = vtkColorMaps.getPresetByName('Cool to Warm');
  const lookupTable = vtkColorTransferFunction.newInstance();
  
  // Apply color map
  lookupTable.applyColorMap(colorMap);
  mapper.setLookupTable(lookupTable);
  
  // Apply real CFD visualization modes based on data arrays
  const pointData = dataset.getPointData();
  const cellData = dataset.getCellData();
  
  switch (mode) {
    case 'pressure':
      // Look for pressure data in point arrays
      let pressureArray = pointData.getArrayByName('Pressure') || 
                         pointData.getArrayByName('pressure') ||
                         pointData.getArrayByName('p') ||
                         pointData.getArray(0); // Fallback to first array
      
      if (pressureArray) {
        mapper.setScalarModeToUsePointData();
        mapper.setScalarVisibility(true);
        mapper.setColorByArrayName(pressureArray.getName());
        const pressureRange = pressureArray.getRange();
        if (pressureRange && pressureRange.length >= 2) {
          lookupTable.setMappingRange(pressureRange[0], pressureRange[1]);
        }
        lookupTable.applyColorMap(vtkColorMaps.getPresetByName('Cool to Warm'));
        console.log('[VTKViewer] Applied pressure visualization:', pressureArray.getName());
      } else {
        mapper.setScalarVisibility(false);
      }
      break;
      
    case 'velocity':
      // Look for velocity magnitude in point data
      let velocityArray = pointData.getArrayByName('Velocity') ||
                         pointData.getArrayByName('velocity') ||
                         pointData.getArrayByName('U') ||
                         pointData.getArrayByName('vmag') ||
                         pointData.getArray(1); // Fallback to second array
      
      if (velocityArray) {
        mapper.setScalarModeToUsePointData();
        mapper.setScalarVisibility(true);
        mapper.setColorByArrayName(velocityArray.getName());
        const velocityRange = velocityArray.getRange();
        if (velocityRange && velocityRange.length >= 2) {
          lookupTable.setMappingRange(velocityRange[0], velocityRange[1]);
        }
        lookupTable.applyColorMap(vtkColorMaps.getPresetByName('Rainbow'));
        console.log('[VTKViewer] Applied velocity visualization:', velocityArray.getName());
      } else {
        mapper.setScalarVisibility(false);
      }
      break;
      
    case 'surface_pressure':
      // Look for pressure in cell data (surface values)
      let surfacePressureArray = cellData.getArrayByName('Pressure') ||
                                cellData.getArrayByName('pressure') ||
                                cellData.getArray(0);
      
      if (surfacePressureArray) {
        mapper.setScalarModeToUseCellData();
        mapper.setScalarVisibility(true);
        mapper.setColorByArrayName(surfacePressureArray.getName());
        const surfaceRange = surfacePressureArray.getRange();
        if (surfaceRange && surfaceRange.length >= 2) {
          lookupTable.setMappingRange(surfaceRange[0], surfaceRange[1]);
        }
        lookupTable.applyColorMap(vtkColorMaps.getPresetByName('Viridis'));
        console.log('[VTKViewer] Applied surface pressure visualization:', surfacePressureArray.getName());
      } else {
        mapper.setScalarVisibility(false);
      }
      break;
      
    default:
      // Default: use first available array or solid color
      if (pointData.getNumberOfArrays() > 0) {
        const defaultArray = pointData.getArray(0);
        mapper.setScalarModeToUsePointData();
        mapper.setScalarVisibility(true);
        mapper.setColorByArrayName(defaultArray.getName());
        const defaultRange = defaultArray.getRange();
        if (defaultRange && defaultRange.length >= 2) {
          lookupTable.setMappingRange(defaultRange[0], defaultRange[1]);
        }
        lookupTable.applyColorMap(vtkColorMaps.getPresetByName('Cool to Warm'));
        console.log('[VTKViewer] Applied default visualization:', defaultArray.getName());
      } else {
        mapper.setScalarVisibility(false);
      }
      break;
  }
}

// ✅ HELPER: Try SceneLoader first
async function tryLoadScene(renderer: any, url: string): Promise<{loaded: boolean, actor?: any}> {
  try {
    const sceneLoader = vtkHttpSceneLoader.newInstance();
    await sceneLoader.setUrl(url);
    
    const scene = sceneLoader.getScene() as any[];
    if (scene && Array.isArray(scene) && scene.length > 0) {
      console.log('[VTKViewer] ✅ Loaded as scene:', scene.length, 'objects');
      let lastActor = null;
      scene.forEach((obj: any) => {
        if (obj.actor) {
          renderer.addActor(obj.actor);
          lastActor = obj.actor; // Store last actor
        }
      });
      return { loaded: true, actor: lastActor };
    }
    return { loaded: false };
  } catch (sceneError) {
    console.log('[VTKViewer] Scene loading failed:', sceneError);
    return { loaded: false };
  }
}

// ✅ HELPER: Fallback to DataSetReader
async function loadDataSet(renderer: any, url: string, activeMode: VisualizationMode): Promise<{loaded: boolean, actor?: any}> {
  try {
    const reader = vtkHttpDataSetReader.newInstance();
    await reader.setUrl(url, { loadData: true });
    const dataset = reader.getOutputData();
    
    if (dataset && dataset.getNumberOfPoints() > 0) {
      console.log('[VTKViewer] ✅ Loaded as dataset:', dataset.getNumberOfPoints(), 'points');
      
      const mapper = vtkMapper.newInstance();
      mapper.setInputData(dataset);
      
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      
      renderer.addActor(actor);
      applyVisualizationMode(mapper, dataset, activeMode);
      return { loaded: true, actor };
    }
    return { loaded: false };
  } catch (datasetError) {
    console.log('[VTKViewer] Dataset loading failed:', datasetError);
    return { loaded: false };
  }
}

export default function VTKViewer({ simulationId, className }: VTKViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<VisualizationMode>('pressure');
  const containerRef = useRef<HTMLDivElement>(null);
  const renderWindowRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const actorRef = useRef<any>(null);

  // Visualization controls configuration
  const visualizationControls: VisualizationControl[] = [
    { id: 'pressure', label: '3D Pressure Clouds', icon: Layers, active: activeMode === 'pressure' },
    { id: 'surface_pressure', label: 'Surface Pressure', icon: Eye, active: activeMode === 'surface_pressure' },
    { id: 'surface_friction', label: 'Surface Friction', icon: Activity, active: activeMode === 'surface_friction' },
    { id: 'streamlines_vertical', label: 'Vertical Streamlines', icon: Wind, active: activeMode === 'streamlines_vertical' },
    { id: 'streamlines_horizontal', label: 'Horizontal Streamlines', icon: Zap, active: activeMode === 'streamlines_horizontal' },
    { id: 'velocity', label: 'Velocity Field', icon: Settings, active: activeMode === 'velocity' }
  ];

  // ✅ FALLBACK ROBUST SOLUTION: Use JSZip blob approach for problematic files
  const initializeVTKRenderer = async () => {
    if (!containerRef.current) return;

    try {
      // Cleanup anterior
      if (renderWindowRef.current) {
        renderWindowRef.current.delete();
        renderWindowRef.current = null;
      }

      // Create renderer
      const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        container: containerRef.current,
        containerStyle: { height: '100%', width: '100%', position: 'relative' }
      });

      renderWindowRef.current = fullScreenRenderer;
      const renderer = fullScreenRenderer.getRenderer();
      rendererRef.current = renderer;

      const vtkUrl = getVTKUrl(simulationId);
      console.log('[VTKViewer] Loading VTK with robust JSZip approach:', vtkUrl);
      
      // ✅ MÉTODO ROBUSTO: Descargar y usar JSZip para máxima compatibilidad
      const response = await fetch(vtkUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log('[VTKViewer] Downloaded VTK file:', arrayBuffer.byteLength, 'bytes');
      
      // ✅ USAR JSZIP PARA EVITAR PROBLEMAS DE PARSING
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(arrayBuffer);
      
      console.log('[VTKViewer] ZIP loaded, files:', Object.keys(zipContent.files));
      
      // ✅ CONFIGURAR JSZIP DATA ACCESS HELPER PARA MÁXIMA ROBUSTEZ
      const vtkJSZipDataAccessHelper = (await import('@kitware/vtk.js/IO/Core/DataAccessHelper/JSZipDataAccessHelper')).default;
      vtkJSZipDataAccessHelper.registerInstance(zip);
      
      // ✅ CREAR BLOB URL PARA EL ZIP COMPLETO
      const blob = new Blob([arrayBuffer], { type: 'application/zip' });
      const blobUrl = URL.createObjectURL(blob);
      
      let loaded = false;
      
      try {
        console.log('[VTKViewer] 🎬 Trying SceneLoader with JSZip...');
        const vtkHttpSceneLoader = (await import('@kitware/vtk.js/IO/Core/HttpSceneLoader')).default;
        const sceneLoader = vtkHttpSceneLoader.newInstance();
        
        await sceneLoader.setUrl(blobUrl);
        
        const scene = sceneLoader.getScene() as any[];
        if (scene && Array.isArray(scene) && scene.length > 0) {
          console.log('[VTKViewer] ✅ Scene loaded with JSZip:', scene.length, 'objects');
          scene.forEach((obj: any, index: number) => {
            if (obj.actor) {
              renderer.addActor(obj.actor);
              actorRef.current = obj.actor;
            }
          });
          loaded = true;
        }
        
      } catch (sceneError) {
        console.log('[VTKViewer] 🎬 SceneLoader with JSZip failed:', sceneError);
      }

      if (!loaded) {
        console.log('[VTKViewer] 📊 Trying DataSetReader with JSZip...');
        try {
          const vtkHttpDataSetReader = (await import('@kitware/vtk.js/IO/Core/HttpDataSetReader')).default;
          const reader = vtkHttpDataSetReader.newInstance();
          await reader.setUrl(blobUrl, { loadData: true });
          const dataset = reader.getOutputData();
          
          if (dataset && dataset.getNumberOfPoints() > 0) {
            console.log('[VTKViewer] ✅ Dataset loaded with JSZip:', dataset.getNumberOfPoints(), 'points');
            
            const vtkMapper = (await import('@kitware/vtk.js/Rendering/Core/Mapper')).default;
            const vtkActor = (await import('@kitware/vtk.js/Rendering/Core/Actor')).default;
            
            const mapper = vtkMapper.newInstance();
            mapper.setInputData(dataset);
            
            const actor = vtkActor.newInstance();
            actor.setMapper(mapper);
            actorRef.current = actor;
            
            renderer.addActor(actor);
            applyVisualizationMode(mapper, dataset, activeMode);
            loaded = true;
          }
        } catch (datasetError) {
          console.log('[VTKViewer] 📊 DataSetReader with JSZip failed:', datasetError);
        }
      }

      // Cleanup blob URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

      if (!loaded) {
        throw new Error('All VTK loading methods failed with JSZip approach');
      }

      renderer.resetCamera();
      renderer.setBackground(0.1, 0.1, 0.2);
      renderWindowRef.current.getRenderWindow().render();
      
      console.log('[VTKViewer] ✅ VTK loaded successfully with JSZip');
      setLoading(false);
      
    } catch (error) {
      console.error('[VTKViewer] JSZip loading failed:', error);
      setError(`VTK loading failed: ${(error as Error).message}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    initializeVTKRenderer();
  }, [simulationId]);

  // Switch visualization mode
  const handleModeChange = (mode: VisualizationMode) => {
    setActiveMode(mode);
    
    if (actorRef.current && rendererRef.current) {
      const mapper = actorRef.current.getMapper();
      const dataset = mapper.getInputData();
      
      if (dataset) {
        applyVisualizationMode(mapper, dataset, mode);
        renderWindowRef.current?.getRenderWindow().render();
        console.log(`[VTKViewer] Switched to ${mode} mode`);
      }
    }
  };

  return (
    <div className={`vtk-viewer ${className || ''}`}>
      <Card className="border-slate-200 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2" data-testid="vtk-viewer-title">
            <Layers className="h-5 w-5 text-blue-600" />
            CFD Results Visualization
            <Badge variant="outline" className="text-xs">
              Simulation #{simulationId}
            </Badge>
          </CardTitle>
          
          {/* Visualization Controls */}
          <div className="flex flex-wrap gap-2 mt-4">
            {visualizationControls.map((control) => (
              <Button
                key={control.id}
                variant={control.active ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeChange(control.id)}
                className="text-xs h-8 gap-1"
                data-testid={`viz-mode-${control.id}`}
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
            data-testid="vtk-3d-container"
          >
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white bg-black/50 z-10">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>Loading 3D visualization...</p>
                <p className="text-sm text-gray-300">Initializing VTK.js renderer</p>
              </div>
            )}
            
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white bg-black/50 z-10">
                <AlertCircle className="h-16 w-16 text-red-400" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-red-400">3D Rendering Error</h3>
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