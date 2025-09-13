import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';

// VTK.js imports - using the correct import paths for vtk.js
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from 'vtk.js/Sources/Rendering/Core/RenderWindowInteractor';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkInteractorStyleTrackballCamera from 'vtk.js/Sources/Interaction/Style/InteractorStyleTrackballCamera';
import vtkHttpDataSetReader from 'vtk.js/Sources/IO/Core/HttpDataSetReader';

interface VTKViewerProps {
  simulationId: number;
  className?: string;
}

export default function VTKViewer({ simulationId, className }: VTKViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderWindowRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const interactorRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;

    const initializeVTK = async () => {
      try {
        setLoading(true);
        setError(null);

        // Clear any previous render window
        if (renderWindowRef.current) {
          renderWindowRef.current.delete();
        }

        // Create VTK.js components
        const renderWindow = vtkRenderWindow.newInstance();
        const renderer = vtkRenderer.newInstance();
        const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
        const interactor = vtkRenderWindowInteractor.newInstance();
        
        // Set up render window
        renderWindow.addRenderer(renderer);
        renderWindow.addView(openGLRenderWindow);
        
        // Mount the render window to DOM first
        openGLRenderWindow.setContainer(containerRef.current);
        
        // Set up interactor after container is set
        interactor.setView(openGLRenderWindow);
        interactor.initialize();
        interactor.bindEvents(containerRef.current);
        
        // Set camera interaction style
        interactor.setInteractorStyle(vtkInteractorStyleTrackballCamera.newInstance());
        
        // Configure renderer background
        renderer.setBackground(0.1, 0.1, 0.1); // Dark gray background
        
        // Store references for cleanup
        renderWindowRef.current = renderWindow;
        rendererRef.current = renderer;
        interactorRef.current = interactor;
        
        // Load VTK.js data file
        const reader = vtkHttpDataSetReader.newInstance();
        // For now, use a static demo file to test the visualization
        const url = `/sample-vtk-data.vtkjs`;
        
        console.log(`[VTKViewer] Loading data from: ${url}`);
        
        // Simple VTK.js loading 
        reader.setUrl(url, { loadData: true });
        await reader.loadData();
        
        const polyData = reader.getOutputData();
        if (!polyData) {
          throw new Error('No data received from VTK.js file');
        }
        
        console.log(`[VTKViewer] Successfully loaded data:`, polyData);
        
        // Create mapper and actor with pipeline connection
        const mapper = vtkMapper.newInstance();
        const actor = vtkActor.newInstance();
        
        mapper.setInputConnection(reader.getOutputPort());
        actor.setMapper(mapper);
        
        // Add actor to renderer
        renderer.addActor(actor);
        
        // Reset camera to fit all data
        renderer.resetCamera();
        
        // Set up automatic resizing with device pixel ratio
        const resizeObserver = new ResizeObserver(() => {
          if (containerRef.current) {
            const dpr = window.devicePixelRatio || 1;
            openGLRenderWindow.setSize(
              Math.floor(containerRef.current.clientWidth * dpr),
              Math.floor(containerRef.current.clientHeight * dpr)
            );
            renderWindow.render();
          }
        });
        
        if (containerRef.current) {
          resizeObserver.observe(containerRef.current);
        }
        
        // Initial resize and render
        const currentContainer = containerRef.current;
        if (currentContainer) {
          const dpr = window.devicePixelRatio || 1;
          openGLRenderWindow.setSize(
            Math.floor(currentContainer.clientWidth * dpr),
            Math.floor(currentContainer.clientHeight * dpr)
          );
        }
        
        renderWindow.render();
        
        setLoading(false);
        console.log('[VTKViewer] VTK.js visualization initialized successfully');
        
        // Cleanup function
        return () => {
          resizeObserver.disconnect();
          if (interactorRef.current) {
            interactorRef.current.unbindEvents();
          }
          if (openGLRenderWindow) {
            openGLRenderWindow.setContainer(null);
          }
          if (renderWindowRef.current) {
            renderWindowRef.current.delete();
          }
          if (interactorRef.current) {
            interactorRef.current.delete();
          }
          if (rendererRef.current) {
            rendererRef.current.delete();
          }
          if (mapper) {
            mapper.delete();
          }
          if (actor) {
            actor.delete();
          }
          if (reader) {
            reader.delete();
          }
        };
        
      } catch (err) {
        console.error('[VTKViewer] Error initializing VTK.js:', err);
        setError(err instanceof Error ? err.message : 'Failed to load 3D visualization');
        setLoading(false);
      }
    };

    const cleanup = initializeVTK();
    
    return () => {
      cleanup.then((cleanupFn) => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [simulationId]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (renderWindowRef.current) {
        renderWindowRef.current.delete();
      }
    };
  }, []);

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-96" data-testid="vtk-viewer-loading">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">Loading 3D visualization...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-96" data-testid="vtk-viewer-error">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div>
              <h3 className="font-semibold text-red-600 mb-2">Visualization Error</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-0">
        <div 
          ref={containerRef}
          className="w-full h-96 bg-gray-900 rounded-lg"
          style={{ cursor: 'grab' }}
          data-testid="vtk-viewer-container"
        />
      </CardContent>
    </Card>
  );
}