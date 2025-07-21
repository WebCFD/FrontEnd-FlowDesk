import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Upload, FileText, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { STLProcessor } from './STLProcessor';

interface STLUploaderProps {
  onModelLoaded: (modelData: {
    name: string;
    geometry: THREE.BufferGeometry;
    originalFile: File;
  }) => void;
  floorContext?: {
    currentFloor: string;
    floors: Record<string, any>;
  };
}

interface UploadState {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  progress: number;
  message: string;
}

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB in bytes

export function STLUploader({ onModelLoaded, floorContext }: STLUploaderProps) {
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    message: ''
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stlLoader = new STLLoader();

  const validateFile = (file: File): string | null => {
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.stl')) {
      return 'Please select a valid STL file (.stl extension required)';
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return `File size (${sizeMB}MB) exceeds the 3MB limit`;
    }

    return null;
  };

  const processSTLFile = async (file: File) => {
    setUploadState({
      status: 'uploading',
      progress: 10,
      message: 'Reading file...'
    });

    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      setUploadState({
        status: 'processing',
        progress: 30,
        message: 'Parsing STL geometry...'
      });

      // Parse STL geometry
      const geometry = stlLoader.parse(arrayBuffer);
      
      // Validate geometry
      if (!geometry.attributes.position) {
        throw new Error('Invalid STL file: No vertex data found');
      }

      setUploadState({
        status: 'processing',
        progress: 60,
        message: 'Processing geometry and materials...'
      });

      // Generate clean name from filename
      const cleanName = (file?.name || 'untitled').replace(/\.stl$/i, '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim();

      // Use enhanced STL processor with floor context
      const processor = STLProcessor.getInstance();
      
      // Prepare floor context if available
      const processingFloorContext = floorContext ? {
        floorName: floorContext.currentFloor,
        existingFurniture: floorContext.floors[floorContext.currentFloor]?.furnitureItems || []
      } : undefined;
      
      const processedData = await processor.processSTLGeometry(geometry, cleanName, file, processingFloorContext);

      setUploadState({
        status: 'processing',
        progress: 90,
        message: 'Generating thumbnail...'
      });

      // Small delay to show thumbnail generation step
      await new Promise(resolve => setTimeout(resolve, 200));

      setUploadState({
        status: 'success',
        progress: 100,
        message: `"${processedData.name}" added to furniture menu! Drag it to the canvas to place.`
      });

      // Log enhanced processing info
      console.log('STL Processor: Enhanced processing complete', {
        name: processedData.name,
        vertexCount: geometry.attributes.position.count,
        dimensions: processedData.dimensions,
        fileSize: (file.size / 1024).toFixed(1) + 'KB',
        hasThumbnail: !!processedData.thumbnail
      });

      // Pass the processed model data (maintaining backward compatibility)
      onModelLoaded({
        name: processedData.name,
        geometry: processedData.geometry,
        originalFile: file
      });

      // Reset after successful load
      setTimeout(() => {
        setUploadState({
          status: 'idle',
          progress: 0,
          message: ''
        });
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 4000);

    } catch (error) {
      console.error('STL processing error:', error);
      setUploadState({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Failed to process STL file'
      });

      // Reset error state after 3 seconds
      setTimeout(() => {
        setUploadState({
          status: 'idle',
          progress: 0,
          message: ''
        });
      }, 3000);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setUploadState({
        status: 'error',
        progress: 0,
        message: validationError
      });
      
      setTimeout(() => {
        setUploadState({
          status: 'idle',
          progress: 0,
          message: ''
        });
      }, 3000);
      return;
    }

    await processSTLFile(file);
  };

  const handleButtonClick = () => {
    if (uploadState.status === 'idle') {
      fileInputRef.current?.click();
    }
  };

  const getStatusIcon = () => {
    switch (uploadState.status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'uploading':
      case 'processing':
        return <FileText className="w-4 h-4 text-blue-600" />;
      default:
        return <Upload className="w-4 h-4" />;
    }
  };

  const getButtonText = () => {
    switch (uploadState.status) {
      case 'uploading':
        return 'Reading...';
      case 'processing':
        return 'Processing...';
      case 'success':
        return 'Loaded!';
      case 'error':
        return 'Try Again';
      default:
        return 'Load Object';
    }
  };

  const isDisabled = uploadState.status === 'uploading' || uploadState.status === 'processing';

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleButtonClick}
            disabled={isDisabled}
            variant="outline"
            className="flex-1 flex items-center gap-2"
          >
            {getStatusIcon()}
            {getButtonText()}
          </Button>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 flex-shrink-0"
              >
                <Info className="w-4 h-4 text-gray-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <div className="text-sm space-y-1">
                <p><strong>STL Requirements:</strong></p>
                <p>• Watertight closed surface geometry</p>
                <p>• SI units (1 unit = 1 meter)</p>
                <p>• Lowest point at Z=0 (negative Z renders below floor)</p>
                <p>• Maximum file size: 3MB</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {uploadState.status !== 'idle' && (
        <div className="space-y-2">
          {(uploadState.status === 'uploading' || uploadState.status === 'processing') && (
            <Progress value={uploadState.progress} className="w-full" />
          )}
          
          {uploadState.message && (
            <Alert className={uploadState.status === 'error' ? 'border-red-200' : uploadState.status === 'success' ? 'border-green-200' : 'border-blue-200'}>
              <AlertDescription className="text-sm">
                {uploadState.message}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500 text-center">
        STL files only • Max 3MB
      </div>
    </div>
  );
}