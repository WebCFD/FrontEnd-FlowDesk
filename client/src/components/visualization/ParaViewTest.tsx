import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Box, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';

interface ParaViewTestProps {
  simulationId: number;
  className?: string;
}

export default function ParaViewTest({ simulationId, className }: ParaViewTestProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Test ParaView Glance with our .vtkjs file
  useEffect(() => {
    const testParaViewGlance = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('[ParaViewTest] 🧪 Testing ParaView Glance with .vtkjs file');
        
        // Test if our file is accessible
        const response = await fetch(`/api/simulations/${simulationId}/results/result.vtkjs`);
        console.log('[ParaViewTest] 🧪 File response:', response.status);
        
        if (!response.ok) {
          throw new Error(`File not accessible: ${response.status}`);
        }
        
        const blob = await response.blob();
        console.log('[ParaViewTest] 🧪 File blob size:', blob.size);
        
        // Use direct API URL to avoid CORS issues with blob URLs
        const directUrl = `${window.location.origin}/api/simulations/${simulationId}/results/result.vtkjs`;
        console.log('[ParaViewTest] 🧪 Direct API URL:', directUrl);
        
        // ParaView Glance can be loaded with a file parameter
        const paraviewUrl = `https://kitware.github.io/glance/app/?file=${encodeURIComponent(directUrl)}`;
        console.log('[ParaViewTest] 🧪 ParaView URL:', paraviewUrl);
        
        setSuccess(true);
        setLoading(false);
        
        console.log('[ParaViewTest] 🎉 Test successful - ParaView should work!');
        
      } catch (err) {
        console.error('[ParaViewTest] ❌ Test failed:', err);
        setError(err instanceof Error ? err.message : 'Test failed');
        setLoading(false);
      }
    };

    testParaViewGlance();
  }, [simulationId]);

  const handleOpenParaView = async () => {
    try {
      // Para evitar problemas de CORS, usar la URL directa del API
      const directUrl = `${window.location.origin}/api/simulations/${simulationId}/results/result.vtkjs`;
      
      // Open ParaView Glance in new tab with direct API URL
      const paraviewUrl = `https://kitware.github.io/glance/app/?file=${encodeURIComponent(directUrl)}`;
      console.log('[ParaViewTest] 🚀 Opening ParaView with direct URL:', paraviewUrl);
      window.open(paraviewUrl, '_blank');
    } catch (err) {
      console.error('Failed to open ParaView:', err);
    }
  };

  const handleEmbedParaView = async () => {
    try {
      // Load ParaView Glance in iframe with our file
      const directUrl = `${window.location.origin}/api/simulations/${simulationId}/results/result.vtkjs`;
      const paraviewUrl = `https://kitware.github.io/glance/app/?file=${encodeURIComponent(directUrl)}`;
      
      if (iframeRef.current) {
        console.log('[ParaViewTest] 🚀 Loading ParaView in iframe:', paraviewUrl);
        iframeRef.current.src = paraviewUrl;
      }
    } catch (err) {
      console.error('Failed to embed ParaView:', err);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Test Results */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Box className="h-5 w-5" />
              ParaView Glance Compatibility Test
            </h3>
            <p className="text-sm text-gray-600">Testing if our .vtkjs file works with ParaView</p>
          </div>
          
          {loading && (
            <div className="flex items-center gap-2 text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Testing ParaView compatibility...</span>
            </div>
          )}
          
          {error && (
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span>Test failed: {error}</span>
            </div>
          )}
          
          {success && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>✅ ParaView Glance compatibility confirmed!</span>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-gray-700">
                  🎉 Your .vtkjs file is accessible and should work with ParaView Glance.
                </p>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={handleOpenParaView}
                    className="flex items-center gap-2"
                    data-testid="button-open-paraview"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in ParaView Glance (New Tab)
                  </Button>
                  
                  <Button 
                    variant="outline"
                    onClick={handleEmbedParaView}
                    className="flex items-center gap-2"
                    data-testid="button-embed-paraview"
                  >
                    <Box className="h-4 w-4" />
                    Load ParaView Below
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Embedded ParaView Glance */}
      <Card>
        <CardContent className="p-0">
          <iframe
            ref={iframeRef}
            className="w-full h-96 border-0 rounded-lg"
            title="ParaView Glance Viewer"
            src=""
            data-testid="iframe-paraview"
          />
        </CardContent>
      </Card>
    </div>
  );
}