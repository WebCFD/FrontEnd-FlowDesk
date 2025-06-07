import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';

interface STLUploaderProps {
  onModelLoaded: (modelData: {
    name: string;
    geometry: THREE.BufferGeometry;
    originalFile: File;
  }) => void;
}

interface UploadState {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  progress: number;
  message: string;
}

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB in bytes

export function STLUploader({ onModelLoaded }: STLUploaderProps) {
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
        progress: 50,
        message: 'Processing STL geometry...'
      });

      // Parse STL geometry
      const geometry = stlLoader.parse(arrayBuffer);
      
      // Validate geometry
      if (!geometry.attributes.position) {
        throw new Error('Invalid STL file: No vertex data found');
      }

      setUploadState({
        status: 'processing',
        progress: 80,
        message: 'Finalizing model...'
      });

      // Compute bounding box for auto-scaling
      geometry.computeBoundingBox();
      geometry.computeVertexNormals();

      // Generate clean name from filename
      const cleanName = file.name.replace(/\.stl$/i, '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim();

      setUploadState({
        status: 'success',
        progress: 100,
        message: `Successfully loaded "${cleanName}"`
      });

      // Log geometry info for debugging
      console.log('STL Loader: Successfully processed geometry', {
        vertexCount: geometry.attributes.position.count,
        boundingBox: geometry.boundingBox,
        cleanName: cleanName,
        fileSize: (file.size / 1024).toFixed(1) + 'KB'
      });

      // Pass the processed model data
      onModelLoaded({
        name: cleanName,
        geometry,
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
      }, 2000);

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
      
      <Button
        onClick={handleButtonClick}
        disabled={isDisabled}
        variant="outline"
        className="w-full flex items-center gap-2"
      >
        {getStatusIcon()}
        {getButtonText()}
      </Button>

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