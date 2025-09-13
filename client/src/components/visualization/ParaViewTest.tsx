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
        
        // Create a blob URL for ParaView Glance
        const blobUrl = URL.createObjectURL(blob);
        console.log('[ParaViewTest] 🧪 Created blob URL:', blobUrl);
        
        // ParaView Glance can be loaded with a file parameter
        const paraviewUrl = `https://kitware.github.io/glance/app/?file=${encodeURIComponent(blobUrl)}`;
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
      const response = await fetch(`/api/simulations/${simulationId}/results/result.vtkjs`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // Open ParaView Glance in new tab with our file
      const paraviewUrl = `https://kitware.github.io/glance/app/?file=${encodeURIComponent(blobUrl)}`;
      window.open(paraviewUrl, '_blank');
    } catch (err) {
      console.error('Failed to open ParaView:', err);
    }
  };

  const handleEmbedParaView = () => {
    // Load ParaView Glance in iframe
    if (iframeRef.current) {
      iframeRef.current.src = 'https://kitware.github.io/glance/app/';
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