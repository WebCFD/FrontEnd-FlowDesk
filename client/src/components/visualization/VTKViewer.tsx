import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Box, Info, AlertCircle, Eye, Activity, Wind, Zap, Layers, Settings } from 'lucide-react';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkHttpDataSetReader from '@kitware/vtk.js/IO/Core/HttpDataSetReader';
import JSZip from 'jszip';
import newJSZipDataAccessHelper from '@kitware/vtk.js/IO/Core/DataAccessHelper/JSZipDataAccessHelper';
import vtkCubeSource from '@kitware/vtk.js/Filters/Sources/CubeSource';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkVolumeProperty from '@kitware/vtk.js/Rendering/Core/VolumeProperty';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';

interface VTKViewerProps {
  simulationId: number;
  className?: string;
}

// Visualization modes for CFD data
type VisualizationMode = 'pressure' | 'velocity' | 'streamlines_vertical' | 'streamlines_horizontal' | 'surface_pressure' | 'surface_friction';

interface VisualizationControl {
  id: VisualizationMode;
  label: string;
  icon: any;
  active: boolean;
}

export default function VTKViewer({ simulationId, className }: VTKViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vtkData, setVtkData] = useState<any>(null);
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

  // Initialize VTK.js 3D renderer
  const initializeVTKRenderer = async () => {
    if (!containerRef.current) return;

    try {
      // Clean up previous renderer safely
      if (renderWindowRef.current) {
        try {
          renderWindowRef.current.delete();
        } catch (cleanupError) {
          console.warn('[VTKViewer] Error during cleanup:', cleanupError);
        }
        renderWindowRef.current = null;
      }

      // Create full screen render window
      const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        container: containerRef.current,
        containerStyle: { height: '100%', width: '100%', position: 'relative' }
      });

      renderWindowRef.current = fullScreenRenderer;
      const renderer = fullScreenRenderer.getRenderer();
      const renderWindow = fullScreenRenderer.getRenderWindow();
      rendererRef.current = renderer;

      // Load the REAL CFD data that works in ParaView
      console.log('[VTKViewer] Loading REAL CFD data from .vtkjs file');
      
      // Use super simple static file path in public root
      const vtkUrl = `/cfd-data.vtkjs`;
      console.log('[VTKViewer] Loading CFD file from simple static path:', vtkUrl);
      
      try {
        // Manual fetch approach - bypass VTK.js HTTP issues
        console.log('[VTKViewer] Fetching CFD file manually as ArrayBuffer...');
        const response = await fetch(vtkUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        console.log('[VTKViewer] CFD file fetched successfully:', arrayBuffer.byteLength, 'bytes');
        
        // Unzip and use JSZipDataAccessHelper (CORRECT API)
        console.log('[VTKViewer] Unzipping .vtkjs container...');
        const zip = await JSZip.loadAsync(arrayBuffer);
        console.log('[VTKViewer] ZIP extracted, setting up VTK reader with correct helper...');
        
        // Create VTK reader with JSZip data access helper (FACTORY FUNCTION)
        const reader = vtkHttpDataSetReader.newInstance({ fetchGzip: true });
        const dah = newJSZipDataAccessHelper({ zip });
        reader.setDataAccessHelper(dah);
        
        // Load from index.json inside the ZIP
        await reader.setUrl('index.json', { loadData: true });
        const dataset = reader.getOutputData();
        
        if (dataset) {
          console.log('[VTKViewer] REAL CFD dataset loaded successfully!');
          console.log('[VTKViewer] CFD Dataset type:', dataset.getClassName());
          console.log('[VTKViewer] CFD Points:', dataset.getNumberOfPoints(), 'CFD Cells:', dataset.getNumberOfCells());
          
          // Create mapper and actor
          const mapper = vtkMapper.newInstance();
          mapper.setInputData(dataset);
          
          const actor = vtkActor.newInstance();
          actor.setMapper(mapper);
          actorRef.current = actor;
          
          // Apply visualization
          applyVisualizationMode(mapper, dataset, activeMode);
          
          // Add to scene
          renderer.addActor(actor);
          renderer.resetCamera();
          renderer.setBackground(0.1, 0.1, 0.2);
          renderWindow.render();
          
          setVtkData(dataset);
          console.log('[VTKViewer] REAL CFD 3D visualization ready! 🎉');
          
        } else {
          throw new Error('No dataset in sample file');
        }
        
      } catch (cfdError) {
        console.error('[VTKViewer] ERROR: Real CFD file failed to load:', cfdError);
        
        // Fallback to demo cube if sample fails
        const cubeSource = vtkCubeSource.newInstance({ xLength: 1, yLength: 1, zLength: 1 });
        const mapper = vtkMapper.newInstance();
        mapper.setInputConnection(cubeSource.getOutputPort());
        
        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        actorRef.current = actor;
        
        renderer.addActor(actor);
        renderer.resetCamera();
        renderer.setBackground(0.1, 0.1, 0.2);
        renderWindow.render();
        
        console.log('[VTKViewer] Demo cube visualization ready');
      }
      
    } catch (err) {
      console.error('[VTKViewer] Error initializing VTK renderer:', err);
      setError('Failed to initialize 3D renderer');
    }
  };

  // Apply different visualization modes
  const applyVisualizationMode = (mapper: any, dataset: any, mode: VisualizationMode) => {
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
          if (actorRef.current) {
            actorRef.current.getProperty().setColor(0.2, 0.5, 1.0);
          }
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
          if (actorRef.current) {
            actorRef.current.getProperty().setColor(0.2, 1.0, 0.2);
          }
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
          if (actorRef.current) {
            actorRef.current.getProperty().setColor(1.0, 0.2, 0.2);
          }
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
          if (actorRef.current) {
            actorRef.current.getProperty().setColor(0.8, 0.8, 0.8);
          }
        }
    }
    
    // Trigger re-render
    if (renderWindowRef.current) {
      renderWindowRef.current.getRenderWindow().render();
    }
  };

  // Handle visualization mode changes
  const handleModeChange = (mode: VisualizationMode) => {
    setActiveMode(mode);
    
    // Apply new visualization mode to current actor/mapper
    if (actorRef.current) {
      const mapper = actorRef.current.getMapper();
      const dataset = mapper.getInputData();
      if (dataset) {
        applyVisualizationMode(mapper, dataset, mode);
        console.log('[VTKViewer] Applied visualization mode:', mode);
      }
    }
  };

  useEffect(() => {
    const loadVTKData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log(`[VTKViewer] Initializing VTK renderer for simulation ${simulationId}`);
        
        // Initialize 3D renderer directly with URL (no need to preload data)
        await initializeVTKRenderer();
        
        setLoading(false);
      } catch (err) {
        console.error('[VTKViewer] Error loading VTK data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load VTK data');
        setLoading(false);
      }
    };
    
    loadVTKData();
    
    // Cleanup on unmount
    return () => {
      if (renderWindowRef.current) {
        renderWindowRef.current.delete();
      }
    };
  }, [simulationId]);

  return (
    <div className={`flex gap-4 ${className}`}>
      {/* Visualization Controls Panel */}
      <div className="w-64 flex-shrink-0">
        <Card>
          <CardContent className="p-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Visuals
              </h3>
              <p className="text-sm text-gray-600">CFD Visualization Controls</p>
            </div>
            
            <div className="space-y-2">
              {visualizationControls.map((control) => {
                const IconComponent = control.icon;
                return (
                  <Button
                    key={control.id}
                    variant={control.active ? "default" : "outline"}
                    className={`w-full justify-start gap-2 h-auto py-3 ${
                      control.active ? 'bg-blue-500 hover:bg-blue-600 text-white' : ''
                    }`}
                    onClick={() => handleModeChange(control.id)}
                    data-testid={`visualization-${control.id}`}
                  >
                    <IconComponent className="h-4 w-4" />
                    <span className="text-sm">{control.label}</span>
                  </Button>
                );
              })}
            </div>
            
            {!loading && !error && (
              <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                <div className="flex items-center gap-2 text-gray-700 text-sm">
                  <Info className="h-4 w-4" />
                  <span>Simulation #{simulationId}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  3D CFD visualization active
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3D Visualization Container */}
      <Card className="flex-1">
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