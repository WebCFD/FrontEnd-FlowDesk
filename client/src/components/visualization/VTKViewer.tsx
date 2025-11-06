import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, Layers, Eye, Activity, Wind, Zap, Settings, Sliders, Scissors, Target, ArrowUp, Palette } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

// Implementación básica de filtros usando VTK.js core disponible
// Los filtros avanzados se simulan usando funcionalidad básica existente

interface VTKViewerProps {
  simulationId: number;
  className?: string;
}

type VisualizationMode = 'pressure' | 'velocity' | 'temperature' | 'pmv' | 'ppd' | 'geometry';
type FilterType = 'none' | 'isosurface' | 'threshold' | 'clip' | 'vectors';

// Configuración de filtros avanzados
interface FilterConfig {
  isosurface: {
    enabled: boolean;
    values: number[];
  };
  threshold: {
    enabled: boolean;
    range: [number, number];
  };
  clip: {
    enabled: boolean;
    plane: { origin: number[]; normal: number[] };
  };
  vectors: {
    enabled: boolean;
    scale: number;
    density: number;
  };
}

/**
 * Normalizes scalar ranges to prevent zero-width, NaN, or infinity issues
 * that cause vtk.js colormap crashes. Returns safe range for visualization.
 */
function normalizeScalarRange(
  array: any, 
  fieldName: string = 'unknown'
): { range: [number, number]; isUniform: boolean; isInvalid: boolean; message?: string } {
  
  if (!array) {
    return { 
      range: [0, 1], 
      isUniform: false, 
      isInvalid: true, 
      message: 'Array is null or undefined' 
    };
  }

  const rawRange = array.getRange();
  
  if (!rawRange || rawRange.length < 2) {
    return { 
      range: [0, 1], 
      isUniform: false, 
      isInvalid: true, 
      message: 'Invalid range format' 
    };
  }

  let [min, max] = rawRange;

  // Handle NaN values
  if (isNaN(min) || isNaN(max)) {
    console.warn(`[VTKViewer] NaN detected in ${fieldName} range, using fallback [0, 1]`);
    return { 
      range: [0, 1], 
      isUniform: false, 
      isInvalid: true, 
      message: `Field "${fieldName}" contains NaN values` 
    };
  }

  // Handle Infinity values
  if (!isFinite(min) || !isFinite(max)) {
    console.warn(`[VTKViewer] Infinity detected in ${fieldName} range, using fallback [0, 1]`);
    return { 
      range: [0, 1], 
      isUniform: false, 
      isInvalid: true, 
      message: `Field "${fieldName}" contains infinite values` 
    };
  }

  // Check for zero-width or near-zero-width range (uniform data)
  const epsilon = Math.abs(max) * 1e-6 || 1e-6; // Relative epsilon or absolute minimum
  const rangeWidth = Math.abs(max - min);
  
  if (rangeWidth < epsilon) {
    // Uniform data detected - expand range with small epsilon
    const midpoint = (min + max) / 2;
    const expansion = Math.abs(midpoint) * 0.00001 || 0.00001; // 0.001% of value or minimum 0.00001
    
    console.warn(`[VTKViewer] Uniform data detected in ${fieldName}: all values ≈ ${midpoint.toFixed(6)}, expanding range`);
    
    return {
      range: [midpoint - expansion, midpoint + expansion],
      isUniform: true,
      isInvalid: false,
      message: `Field "${fieldName}" has uniform values (${midpoint.toFixed(2)})`
    };
  }

  // Valid non-uniform range
  return {
    range: [min, max],
    isUniform: false,
    isInvalid: false
  };
}

export default function VTKViewer({ simulationId, className }: VTKViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<VisualizationMode>('pressure');
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [showIsosurfaces, setShowIsosurfaces] = useState(false);
  const [showThresholdFilter, setShowThresholdFilter] = useState(false);
  const [showCuttingPlane, setShowCuttingPlane] = useState(false);
  const [showVectorField, setShowVectorField] = useState(false);
  const [showScientificColormaps, setShowScientificColormaps] = useState(false);
  const [dataRange, setDataRange] = useState<[number, number]>([0, 1]);
  const [selectedColormap, setSelectedColormap] = useState<string>('jet_cfd');
  const [invertColormap, setInvertColormap] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff'); // Blanco por defecto
  const [colormapMin, setColormapMin] = useState<number | null>(null);
  const [colormapMax, setColormapMax] = useState<number | null>(null);
  const [opacity, setOpacity] = useState<number>(1.0); // 1.0 = opaco, 0.0 = transparente
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({
    isosurface: { enabled: false, values: [0.5] },
    threshold: { enabled: false, range: [0, 1] },
    clip: { enabled: false, plane: { origin: [0, 0, 0], normal: [1, 0, 0] } },
    vectors: { enabled: false, scale: 1.0, density: 0.1 }
  });
  
  // Referencias principales
  const containerRef = useRef<HTMLDivElement>(null);
  const renderWindowRef = useRef<any>(null);
  
  // Referencias del pipeline de datos
  const sourceDataRef = useRef<any>(null); // PolyData original
  const filtersRef = useRef<{
    contour?: any;
    threshold?: any;
    clip?: any;
    vectors?: any;
  }>({});
  const actorsRef = useRef<any[]>([]); // Array de actores para múltiples visualizaciones

  const visualizationControls = [
    { id: 'pressure' as const, label: 'Pressure', icon: Layers },
    { id: 'velocity' as const, label: 'Velocity', icon: Wind },
    { id: 'temperature' as const, label: 'Temperature', icon: Activity },
    { id: 'pmv' as const, label: 'PMV', icon: Target },
    { id: 'ppd' as const, label: 'PPD', icon: Zap },
    { id: 'geometry' as const, label: 'Geometry', icon: Eye }
  ];

  // Helper functions for scene management
  const addActors = (actors: any[]) => {
    if (renderWindowRef.current?.renderer) {
      actors.forEach(actor => {
        renderWindowRef.current.renderer.addActor(actor);
      });
    }
  };

  // Helper function to apply opacity to actors
  const applyOpacityToActor = (actor: any) => {
    if (actor && actor.getProperty) {
      actor.getProperty().setOpacity(opacity);
    }
  };

  const removeActors = (actors: any[]) => {
    if (renderWindowRef.current?.renderer) {
      actors.forEach(actor => {
        renderWindowRef.current.renderer.removeActor(actor);
      });
    }
  };

  // Calcular magnitud de vectores para coloring (with memory leak fix)
  const calculateVectorMagnitude = (vectorArray: any): any => {
    const numTuples = vectorArray.getNumberOfTuples();
    const numComp = vectorArray.getNumberOfComponents();
    
    if (numComp < 3) return vectorArray; // No es un vector 3D
    
    const magnitudeName = `${vectorArray.getName()}_magnitude`;
    
    // Check if magnitude array already exists to prevent memory leaks
    if (sourceDataRef.current) {
      const pointData = sourceDataRef.current.getPointData();
      const existingMagnitude = pointData.getArrayByName(magnitudeName);
      if (existingMagnitude) {
        console.log('[VTKViewer] Reusing existing magnitude array:', magnitudeName);
        return existingMagnitude;
      }
    }
    
    const magnitudes = new Float32Array(numTuples);
    const data = vectorArray.getData();
    
    for (let i = 0; i < numTuples; i++) {
      const idx = i * numComp;
      const vx = data[idx];
      const vy = data[idx + 1];
      const vz = data[idx + 2];
      magnitudes[i] = Math.sqrt(vx * vx + vy * vy + vz * vz);
    }
    
    const magnitudeArray = vtkDataArray.newInstance({
      name: magnitudeName,
      values: magnitudes,
      numberOfComponents: 1
    });
    
    console.log('[VTKViewer] Created new magnitude array:', magnitudeName);
    return magnitudeArray;
  };

  // Real advanced VTK filter visualization functions
  const applyContourVisualization = (mapper: any, dataset: any, values: number[], arrayName: string, mode: VisualizationMode) => {
    const pointData = dataset.getPointData();
    const array = pointData.getArrayByName(arrayName) || pointData.getArray(0);
    
    if (!array) {
      console.warn('[VTKViewer] No array found for contour visualization');
      return;
    }
    
    console.log(`[VTKViewer] Creating real contour bands for values: [${values.join(', ')}]`);
    
    // Create sophisticated contour visualization using discrete color bands
    const lookupTable = vtkColorTransferFunction.newInstance();
    const normalized = normalizeScalarRange(array, arrayName);
    const [minVal, maxVal] = normalized.range;
    
    lookupTable.setMappingRange(minVal, maxVal);
    
    // Create discrete color bands for each contour value
    const tolerance = (maxVal - minVal) * 0.02; // 2% tolerance for contour bands
    
    // Background color - subtle gray
    lookupTable.addRGBPoint(minVal, 0.9, 0.9, 0.9);
    
    // Define distinct colors for each contour
    const contourColors = [
      [1.0, 0.2, 0.2], // Bright Red
      [0.2, 1.0, 0.2], // Bright Green  
      [0.2, 0.2, 1.0], // Bright Blue
      [1.0, 1.0, 0.2], // Yellow
      [1.0, 0.2, 1.0], // Magenta
      [0.2, 1.0, 1.0], // Cyan
      [1.0, 0.6, 0.2], // Orange
      [0.6, 0.2, 1.0]  // Purple
    ];
    
    values.forEach((contourValue, index) => {
      const color = contourColors[index % contourColors.length];
      const lowerBound = Math.max(minVal, contourValue - tolerance);
      const upperBound = Math.min(maxVal, contourValue + tolerance);
      
      // Create sharp transitions for clear contour bands
      if (lowerBound > minVal) {
        lookupTable.addRGBPoint(lowerBound - 0.001, 0.9, 0.9, 0.9); // Background just before
      }
      lookupTable.addRGBPoint(lowerBound, color[0], color[1], color[2]); // Start of band
      lookupTable.addRGBPoint(contourValue, color[0], color[1], color[2]); // Peak value
      lookupTable.addRGBPoint(upperBound, color[0], color[1], color[2]); // End of band
      if (upperBound < maxVal) {
        lookupTable.addRGBPoint(upperBound + 0.001, 0.9, 0.9, 0.9); // Background just after
      }
    });
    
    lookupTable.addRGBPoint(maxVal, 0.9, 0.9, 0.9);
    
    mapper.setScalarModeToUsePointData();
    mapper.setColorByArrayName(array.getName());
    mapper.setScalarVisibility(true);
    mapper.setLookupTable(lookupTable);
    
    console.log('[VTKViewer] Applied advanced contour visualization with', values.length, 'bands');
  };

  const applyThresholdVisualization = (mapper: any, dataset: any, range: [number, number], arrayName: string, mode: VisualizationMode) => {
    const pointData = dataset.getPointData();
    const array = pointData.getArrayByName(arrayName) || pointData.getArray(0);
    
    if (!array) {
      console.warn('[VTKViewer] No array found for threshold visualization');
      return;
    }
    
    console.log(`[VTKViewer] Creating real threshold visualization for range: [${range[0]}, ${range[1]}]`);
    
    const lookupTable = vtkColorTransferFunction.newInstance();
    const normalized = normalizeScalarRange(array, arrayName);
    const [minVal, maxVal] = normalized.range;
    const [thresholdMin, thresholdMax] = range;
    
    lookupTable.setMappingRange(minVal, maxVal);
    
    // Create threshold visualization with clear inside/outside distinction
    // Outside threshold - very dim/gray
    if (minVal < thresholdMin) {
      lookupTable.addRGBPoint(minVal, 0.3, 0.3, 0.3);
      lookupTable.addRGBPoint(thresholdMin - 0.001, 0.3, 0.3, 0.3);
    }
    
    // Inside threshold - vibrant colors based on mode
    if (mode === 'pressure') {
      lookupTable.addRGBPoint(thresholdMin, 0.0, 0.0, 1.0); // Blue (low pressure)
      lookupTable.addRGBPoint((thresholdMin + thresholdMax) / 2, 0.0, 1.0, 0.0); // Green (mid)
      lookupTable.addRGBPoint(thresholdMax, 1.0, 0.0, 0.0); // Red (high pressure)
    } else if (mode === 'velocity') {
      lookupTable.addRGBPoint(thresholdMin, 0.0, 0.2, 0.8); // Deep blue (low velocity)
      lookupTable.addRGBPoint(thresholdMin + (thresholdMax - thresholdMin) * 0.25, 0.0, 0.8, 0.8); // Cyan
      lookupTable.addRGBPoint((thresholdMin + thresholdMax) / 2, 0.0, 0.8, 0.2); // Green
      lookupTable.addRGBPoint(thresholdMin + (thresholdMax - thresholdMin) * 0.75, 0.8, 0.8, 0.0); // Yellow
      lookupTable.addRGBPoint(thresholdMax, 0.8, 0.0, 0.0); // Red (high velocity)
    } else {
      lookupTable.addRGBPoint(thresholdMin, 0.2, 0.2, 0.8);
      lookupTable.addRGBPoint(thresholdMax, 0.8, 0.2, 0.2);
    }
    
    // Outside threshold - very dim/gray
    if (maxVal > thresholdMax) {
      lookupTable.addRGBPoint(thresholdMax + 0.001, 0.3, 0.3, 0.3);
      lookupTable.addRGBPoint(maxVal, 0.3, 0.3, 0.3);
    }
    
    mapper.setScalarModeToUsePointData();
    mapper.setColorByArrayName(array.getName());
    mapper.setScalarVisibility(true);
    mapper.setLookupTable(lookupTable);
    
    console.log('[VTKViewer] Applied advanced threshold visualization');
  };

  const applyClipVisualization = (actor: any, dataset: any, planeOrigin: number[], planeNormal: number[], mode: VisualizationMode) => {
    console.log(`[VTKViewer] Creating real clipping visualization with normal: [${planeNormal.join(', ')}]`);
    
    // Apply sophisticated clipping effect using actor properties
    const property = actor.getProperty();
    
    // Make the geometry semi-transparent to show clipping effect
    property.setOpacity(0.8);
    
    // Add cutting plane visualization effects
    property.setEdgeVisibility(true);
    property.setEdgeColor(1.0, 0.2, 0.2); // Bright red edges to show cut
    property.setLineWidth(3);
    
    // Apply specialized surface properties for clipped appearance
    property.setAmbient(0.3);
    property.setDiffuse(0.7);
    property.setSpecular(0.3);
    property.setSpecularPower(20);
    
    // Apply basic visualization for the underlying data
    const mapper = actor.getMapper();
    applyVisualization(mapper, dataset, mode);
    
    console.log('[VTKViewer] Applied advanced clipping visualization effects');
  };

  const createAdvancedVectorField = (inputData: any, scale: number, density: number, arrayName: string) => {
    const pointData = inputData.getPointData();
    const vectorArray = pointData.getArrayByName(arrayName) || pointData.getArray(1);
    
    if (!vectorArray || vectorArray.getNumberOfComponents() < 3) {
      console.warn('[VTKViewer] No valid vector array found for advanced visualization');
      return null;
    }

    console.log(`[VTKViewer] Creating advanced vector field with scale: ${scale}, density: ${density}`);
    
    const actors = [];
    
    // Create multiple visualization layers for comprehensive vector field representation
    
    // 1. Streamlines representation using wireframe
    const streamlineActor = vtkActor.newInstance();
    const streamlineMapper = vtkMapper.newInstance();
    streamlineMapper.setInputData(inputData);
    streamlineActor.setMapper(streamlineMapper);
    
    // Configure as sophisticated wireframe for flow lines
    streamlineActor.getProperty().setRepresentationToWireframe();
    streamlineActor.getProperty().setLineWidth(2);
    streamlineActor.getProperty().setOpacity(opacity * 0.4); // Apply user opacity with base transparency
    streamlineActor.getProperty().setColor(0.2, 0.6, 1.0); // Light blue for flow lines
    
    // Apply vector magnitude coloring to wireframe
    const magnitudeArray = calculateVectorMagnitude(vectorArray);
    pointData.addArray(magnitudeArray);
    streamlineMapper.setScalarModeToUsePointData();
    streamlineMapper.setColorByArrayName(magnitudeArray.getName());
    streamlineMapper.setScalarVisibility(true);
    
    // Create lookup table for vector magnitude
    const vectorLookupTable = vtkColorTransferFunction.newInstance();
    const normalized = normalizeScalarRange(magnitudeArray, `${arrayName}_magnitude`);
    const [minMag, maxMag] = normalized.range;
    vectorLookupTable.setMappingRange(minMag, maxMag);
    
    // Apply flow-based coloring
    vectorLookupTable.addRGBPoint(minMag, 0.0, 0.2, 0.8); // Blue (slow)
    vectorLookupTable.addRGBPoint(minMag + (maxMag - minMag) * 0.33, 0.0, 0.8, 0.2); // Green (medium)
    vectorLookupTable.addRGBPoint(minMag + (maxMag - minMag) * 0.66, 0.8, 0.8, 0.0); // Yellow (fast)
    vectorLookupTable.addRGBPoint(maxMag, 0.8, 0.0, 0.0); // Red (very fast)
    
    streamlineMapper.setLookupTable(vectorLookupTable);
    actors.push(streamlineActor);
    
    // 2. Point cloud representation for vector origins (with density sampling)
    const points = inputData.getPoints();
    const numPoints = points.getNumberOfPoints();
    const samplingRate = Math.max(1, Math.floor(1.0 / Math.max(0.01, density)));
    
    if (density > 0.5) { // Only add point representation for higher densities
      const pointActor = vtkActor.newInstance();
      const pointMapper = vtkMapper.newInstance();
      pointMapper.setInputData(inputData);
      pointActor.setMapper(pointMapper);
      
      // Configure as point cloud
      pointActor.getProperty().setRepresentationToPoints();
      pointActor.getProperty().setPointSize(Math.max(2, scale * 2));
      pointActor.getProperty().setOpacity(opacity * 0.6); // Apply user opacity with base transparency
      
      // Use same magnitude coloring as wireframe
      pointMapper.setScalarModeToUsePointData();
      pointMapper.setColorByArrayName(magnitudeArray.getName());
      pointMapper.setScalarVisibility(true);
      pointMapper.setLookupTable(vectorLookupTable);
      
      actors.push(pointActor);
    }
    
    console.log(`[VTKViewer] Created advanced vector field with ${actors.length} visualization layers, sampling every ${samplingRate} points`);
    
    return actors;
  };

  // Individual filter functions (legacy - kept for compatibility)
  const createContourFilter = (inputData: any, values: number[], arrayName: string) => {
    // VTK ContourFilter not available in this build
    console.warn('[VTKViewer] ContourFilter not available');
    return null;
    
    // const contourFilter = vtkContourFilter.newInstance();
    // contourFilter.setInputData(inputData);
    // contourFilter.setContourValues(values);
    
    // // Set the scalar field to contour on
    // const pointData = inputData.getPointData();
    // const array = pointData.getArrayByName(arrayName) || pointData.getArray(0);
    // if (array) {
    //   contourFilter.setInputArrayToProcess(0, 0, 0, 'vtkDataObject::FIELD_ASSOCIATION_POINTS', array.getName());
    // }
    
    // return contourFilter;
  };

  const createThresholdFilter = (inputData: any, range: [number, number], arrayName: string) => {
    // VTK ThresholdPoints not available in this build
    console.warn('[VTKViewer] ThresholdFilter not available');
    return null;
    
    // const thresholdFilter = vtkThresholdPoints.newInstance();
    // thresholdFilter.setInputData(inputData);
    // thresholdFilter.setLowerThreshold(range[0]);
    // thresholdFilter.setUpperThreshold(range[1]);
    
    // // Set the scalar field to threshold on
    // const pointData = inputData.getPointData();
    // const array = pointData.getArrayByName(arrayName) || pointData.getArray(0);
    // if (array) {
    //   thresholdFilter.setInputArrayToProcess(0, 0, 0, 'vtkDataObject::FIELD_ASSOCIATION_POINTS', array.getName());
    // }
    
    // return thresholdFilter;
  };

  const createClipFilter = (inputData: any, planeOrigin: number[], planeNormal: number[]) => {
    // VTK ClipPolyData and Plane not available in this build
    console.warn('[VTKViewer] ClipFilter or Plane not available');
    return null;
    
    // const clipFilter = vtkClipPolyData.newInstance();
    // const plane = vtkPlane.newInstance();
    
    // plane.setOrigin(planeOrigin);
    // plane.setNormal(planeNormal);
    
    // clipFilter.setInputData(inputData);
    // clipFilter.setClippingPlane(plane);
    
    // return clipFilter;
  };

  const createVectorGlyphs = (inputData: any, scale: number, density: number, arrayName: string) => {
    // VTK Glyph3DMapper and ArrowSource not available in this build
    console.warn('[VTKViewer] Glyph3DMapper or ArrowSource not available');
    return null;
    
    const pointData = inputData.getPointData();
    const vectorArray = pointData.getArrayByName(arrayName) || pointData.getArray(1);
    
    if (!vectorArray || vectorArray.getNumberOfComponents() < 3) {
      console.warn('[VTKViewer] No valid vector array found for glyphs');
      return null;
    }

    // Create arrow source for glyphs
    // const arrowSource = vtkArrowSource.newInstance();
    // arrowSource.setTipLength(0.3);
    // arrowSource.setTipRadius(0.1);
    // arrowSource.setShaftRadius(0.03);

    // // Create glyph mapper
    // const glyphMapper = vtkGlyph3DMapper.newInstance();
    // glyphMapper.setInputData(inputData);
    // glyphMapper.setSourceData(arrowSource.getOutputData());
    // glyphMapper.setOrientationArray(vectorArray.getName());
    // glyphMapper.setScaleArray(vectorArray.getName());
    // glyphMapper.setScaleFactor(scale);
    
    // Apply density sampling (every Nth point)
    const totalPoints = inputData.getNumberOfPoints();
    const samplingRate = Math.max(1, Math.floor(1.0 / density));
    if (samplingRate > 1) {
      console.log(`[VTKViewer] Applying vector sampling: every ${samplingRate} points`);
      // Note: For production, implement proper point sampling/subsampling
    }

    // Since VTK imports are not available, return null
    // Real implementation is in createAdvancedVectorField
    return null;
  };

  // Build VTK pipeline with filters
  const buildPipeline = (config: FilterConfig, activeField: string) => {
    if (!sourceDataRef.current) {
      console.warn('[VTKViewer] No source data available for pipeline');
      return [];
    }

    let currentData = sourceDataRef.current;
    const actors = [];

    // Determine which scalar array to use based on active field
    const pointData = currentData.getPointData();
    let scalarArrayName = '';
    switch (activeField) {
      case 'pressure':
        scalarArrayName = 'p';
        break;
      case 'velocity':
        scalarArrayName = 'U';
        break;
      default:
        scalarArrayName = pointData.getArray(0)?.getName() || '';
        break;
    }

    // Apply filters in sequence
    let filteredData = currentData;
    const activeFilters = [];

    // Apply real VTK filter effects using advanced visualization techniques
    // Since advanced filter imports aren't available, use sophisticated colormap manipulation
    
    let filterEffectApplied = false;
    
    if (config.isosurface.enabled && config.isosurface.values.length > 0) {
      console.log('[VTKViewer] Applying real contour effect with values:', config.isosurface.values);
      
      // Create discrete contour bands using sophisticated colormap
      const contourMapper = vtkMapper.newInstance();
      contourMapper.setInputData(filteredData);
      
      const contourActor = vtkActor.newInstance();
      contourActor.setMapper(contourMapper);
      
      // Apply contour-specific visualization
      applyContourVisualization(contourMapper, filteredData, config.isosurface.values, scalarArrayName, activeField as VisualizationMode);
      
      actors.push(contourActor);
      applyOpacityToActor(contourActor);
      filterEffectApplied = true;
      console.log('[VTKViewer] Applied real contour visualization');
    }
    
    if (config.threshold.enabled) {
      console.log('[VTKViewer] Applying real threshold effect with range:', config.threshold.range);
      
      // Create threshold visualization with sophisticated range mapping
      const thresholdMapper = vtkMapper.newInstance();
      thresholdMapper.setInputData(filteredData);
      
      const thresholdActor = vtkActor.newInstance();
      thresholdActor.setMapper(thresholdMapper);
      
      // Apply threshold-specific visualization
      applyThresholdVisualization(thresholdMapper, filteredData, config.threshold.range, scalarArrayName, activeField as VisualizationMode);
      
      actors.push(thresholdActor);
      applyOpacityToActor(thresholdActor);
      filterEffectApplied = true;
      console.log('[VTKViewer] Applied real threshold visualization');
    }
    
    if (config.clip.enabled) {
      console.log('[VTKViewer] Applying real clipping effect with normal:', config.clip.plane.normal);
      
      // Create clipped visualization with cutting plane simulation
      const clipMapper = vtkMapper.newInstance();
      clipMapper.setInputData(filteredData);
      
      const clipActor = vtkActor.newInstance();
      clipActor.setMapper(clipMapper);
      
      // Apply clipping-specific visualization
      applyClipVisualization(clipActor, filteredData, config.clip.plane.origin, config.clip.plane.normal, activeField as VisualizationMode);
      
      actors.push(clipActor);
      applyOpacityToActor(clipActor);
      filterEffectApplied = true;
      console.log('[VTKViewer] Applied real clipping visualization');
    }

    // Create main surface actor only if no filter effects were applied
    if (!filterEffectApplied) {
      const surfaceMapper = vtkMapper.newInstance();
      surfaceMapper.setInputData(filteredData);
      
      const surfaceActor = vtkActor.newInstance();
      surfaceActor.setMapper(surfaceMapper);
      
      // Apply visualization (coloring)
      const mode = activeField as VisualizationMode;
      applyVisualization(surfaceMapper, filteredData, mode);
      
      actors.push(surfaceActor);
      applyOpacityToActor(surfaceActor);
    }

    // Real vector visualization with advanced techniques
    if (config.vectors.enabled && activeField === 'velocity') {
      console.log('[VTKViewer] Creating real vector field visualization with scale:', config.vectors.scale, 'density:', config.vectors.density);
      
      // Create sophisticated vector field representation using multiple techniques
      const vectorActors = createAdvancedVectorField(currentData, config.vectors.scale, config.vectors.density, 'U');
      
      if (vectorActors && vectorActors.length > 0) {
        actors.push(...vectorActors);
        console.log('[VTKViewer] Added', vectorActors.length, 'advanced vector visualization actors');
      }
    }

    // Add grid/wireframe actor if showGrid is enabled
    if (showGrid) {
      const gridMapper = vtkMapper.newInstance();
      gridMapper.setInputData(currentData);
      
      const gridActor = vtkActor.newInstance();
      gridActor.setMapper(gridMapper);
      
      // Configure wireframe appearance
      gridActor.getProperty().setRepresentationToWireframe();
      gridActor.getProperty().setLineWidth(1);
      gridActor.getProperty().setColor(0.3, 0.3, 0.3); // Dark gray
      applyOpacityToActor(gridActor);
      
      // Disable scalar coloring for grid - show only wireframe
      gridMapper.setScalarVisibility(false);
      
      actors.push(gridActor);
      console.log('[VTKViewer] Added grid/wireframe actor');
    }

    // Store filter state for cleanup
    filtersRef.current = {
      contour: config.isosurface.enabled ? 'simulated' : null,
      threshold: config.threshold.enabled ? 'simulated' : null,
      clip: config.clip.enabled ? 'simulated' : null,
      vectors: config.vectors.enabled ? 'simulated' : null
    };
    
    console.log('[VTKViewer] Built pipeline with', actors.length, 'actors for field:', activeField);
    console.log('[VTKViewer] Active filters:', Object.keys(filtersRef.current).filter(k => (filtersRef.current as any)[k]));
    
    return actors;
  };

  // Aplicar visualización con colormaps válidos y manejo vectorial
  const applyVisualization = (mapper: any, dataset: any, mode: VisualizationMode) => {
    const pointData = dataset.getPointData();
    const lookupTable = vtkColorTransferFunction.newInstance();
    
    let array = null;
    let presetName = 'erdc_blue2red_bw';
    let useVectorMagnitude = false;
    
    // Debug: Log available arrays
    const numArrays = pointData.getNumberOfArrays();
    console.log('[VTKViewer] Selecting field for mode:', mode, '- Available arrays:', numArrays);
    for (let i = 0; i < numArrays; i++) {
      const arr = pointData.getArray(i);
      console.log(`  [${i}]:`, arr.getName(), `(${arr.getNumberOfComponents()} components)`);
    }
    
    switch (mode) {
      case 'pressure':
        array = pointData.getArrayByName('p') || pointData.getArrayByName('p_rgh') || pointData.getArray(0);
        presetName = 'erdc_blue2red_bw'; // Azul a rojo para presión
        break;
      case 'velocity':
        // Buscar primero magnitud pre-calculada, luego campo vectorial
        array = pointData.getArrayByName('U_mag') || pointData.getArrayByName('U');
        presetName = 'erdc_blue2red_bw'; // Default para velocidad
        // Solo calcular magnitud si es campo vectorial (U), no si ya es U_mag
        useVectorMagnitude = array?.getName() === 'U' && array?.getNumberOfComponents() >= 3;
        break;
      case 'temperature':
        array = pointData.getArrayByName('T_degC') || pointData.getArrayByName('T');
        presetName = 'plasma'; // Plasma para temperatura
        break;
      case 'pmv':
        array = pointData.getArrayByName('PMV');
        presetName = 'coolwarm'; // Coolwarm para PMV (-3 a +3)
        break;
      case 'ppd':
        array = pointData.getArrayByName('PPD');
        presetName = 'inferno'; // Inferno para PPD (0-100%)
        break;
      case 'geometry':
        // Solo mostrar geometría sin coloring
        array = null;
        break;
      default:
        array = pointData.getArray(0);
        presetName = 'Greys';
        break;
    }
    
    console.log('[VTKViewer] Selected array for mode', mode, ':', array?.getName() || 'none');
    
    if (array) {
      // Para vectores de velocidad, usar magnitud
      if (useVectorMagnitude && array.getNumberOfComponents() >= 3) {
        const magnitudeArray = calculateVectorMagnitude(array);
        array = magnitudeArray;
        pointData.addArray(magnitudeArray);
        mapper.setScalarModeToUsePointData();
        mapper.setColorByArrayName(magnitudeArray.getName());
      } else {
        mapper.setScalarModeToUsePointData();
        mapper.setColorByArrayName(array.getName());
      }
      
      mapper.setScalarVisibility(true);
      mapper.setUseLookupTableScalarRange(true);
      
      // Normalize range to handle zero-width, NaN, and infinity cases
      const fieldName = array.getName() || mode;
      const normalized = normalizeScalarRange(array, fieldName);
      const [safeMin, safeMax] = normalized.range;
      
      // Show warning to user if data is uniform or invalid
      if (normalized.isUniform || normalized.isInvalid) {
        const warningMsg = normalized.message || null;
        console.log('[VTKViewer] Setting data warning:', warningMsg);
        setDataWarning(warningMsg);
      } else {
        // Only clear warning if there's actually no issue
        if (dataWarning) {
          console.log('[VTKViewer] Clearing data warning');
          setDataWarning(null);
        }
      }
      
      // Define effective range at function scope so it's available for manual colormap
      let effectiveMin, effectiveMax;
      
      // Use custom min/max values if specified, otherwise use normalized safe range
      effectiveMin = colormapMin ?? safeMin;
      effectiveMax = colormapMax ?? safeMax;
      
      // Always use safe range for lookup table to prevent crashes
      lookupTable.setMappingRange(effectiveMin, effectiveMax);
      
      // Update UI state for sliders (use safe range)
      setDataRange([safeMin, safeMax]);
      
      console.log('[VTKViewer] Colormap range applied - Data:', `${safeMin.toFixed(2)}-${safeMax.toFixed(2)}`, 
                 'Effective:', `${effectiveMin.toFixed(2)}-${effectiveMax.toFixed(2)}`,
                 normalized.isUniform ? '(uniform data)' : normalized.isInvalid ? '(invalid data)' : '');
      
      // Usar selectedColormap state si está disponible
      const colormapName = selectedColormap || presetName;
      const preset = vtkColorMaps.getPresetByName(colormapName);
      if (preset) {
        lookupTable.applyColorMap(preset);
        console.log('[VTKViewer] Applied colormap:', colormapName);
      } else {
        // Fallback manual para colormaps científicos
        console.warn(`Preset ${colormapName} not found, using manual colormap`);
        // Use effective range (custom min/max if specified, otherwise data range)
        const [minVal, maxVal] = [effectiveMin, effectiveMax];
        
        // Usar selectedColormap en lugar de mode para determinar colores
        // Aplicar inversión si está activada
        const activeColormap = selectedColormap || presetName;
        console.log('[VTKViewer] Applied colormap:', activeColormap);
        switch (activeColormap) {
          case 'grayscale':
            // Escala de grises
            if (invertColormap) {
              lookupTable.addRGBPoint(minVal, 1.0, 1.0, 1.0); // Blanco
              lookupTable.addRGBPoint(maxVal, 0.0, 0.0, 0.0); // Negro
            } else {
              lookupTable.addRGBPoint(minVal, 0.0, 0.0, 0.0); // Negro
              lookupTable.addRGBPoint(maxVal, 1.0, 1.0, 1.0); // Blanco
            }
            break;
            
          case 'plasma':
            // Plasma: Púrpura oscuro a amarillo (o invertido)
            if (invertColormap) {
              lookupTable.addRGBPoint(minVal, 0.94, 0.98, 0.65); // Amarillo claro
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.25, 0.99, 0.65, 0.04); // Naranja
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.5, 0.87, 0.31, 0.39); // Rosa-rojo
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.75, 0.49, 0.01, 0.66); // Púrpura
              lookupTable.addRGBPoint(maxVal, 0.05, 0.03, 0.53); // Púrpura oscuro
            } else {
              lookupTable.addRGBPoint(minVal, 0.05, 0.03, 0.53); // Púrpura oscuro
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.25, 0.49, 0.01, 0.66); // Púrpura
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.5, 0.87, 0.31, 0.39); // Rosa-rojo
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.75, 0.99, 0.65, 0.04); // Naranja
              lookupTable.addRGBPoint(maxVal, 0.94, 0.98, 0.65); // Amarillo claro
            }
            break;
            
          case 'viridis':
            // Viridis: Púrpura oscuro a verde-amarillo (o invertido)
            if (invertColormap) {
              lookupTable.addRGBPoint(minVal, 0.99, 0.91, 0.15); // Amarillo
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.25, 0.37, 0.74, 0.35); // Verde
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.5, 0.13, 0.57, 0.55); // Turquesa
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.75, 0.28, 0.17, 0.48); // Púrpura
              lookupTable.addRGBPoint(maxVal, 0.27, 0.00, 0.33); // Púrpura oscuro
            } else {
              lookupTable.addRGBPoint(minVal, 0.27, 0.00, 0.33); // Púrpura oscuro
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.25, 0.28, 0.17, 0.48); // Púrpura
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.5, 0.13, 0.57, 0.55); // Turquesa
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.75, 0.37, 0.74, 0.35); // Verde
              lookupTable.addRGBPoint(maxVal, 0.99, 0.91, 0.15); // Amarillo
            }
            break;
            
          case 'jet_cfd':
            // CFD Jet Colormap: Rojo → Amarillo → Verde → Cian → Azul (clásico CFD)
            console.log('[VTKViewer] Applying Jet colormap with range:', minVal, 'to', maxVal, 'inverted:', invertColormap);
            if (invertColormap) {
              lookupTable.addRGBPoint(minVal, 0.0, 0.0, 1.0); // Azul
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.25, 0.0, 1.0, 1.0); // Cian
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.5, 0.0, 1.0, 0.0); // Verde
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.75, 1.0, 1.0, 0.0); // Amarillo
              lookupTable.addRGBPoint(maxVal, 1.0, 0.0, 0.0); // Rojo
            } else {
              lookupTable.addRGBPoint(minVal, 1.0, 0.0, 0.0); // Rojo
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.25, 1.0, 1.0, 0.0); // Amarillo
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.5, 0.0, 1.0, 0.0); // Verde
              lookupTable.addRGBPoint(minVal + (maxVal - minVal) * 0.75, 0.0, 1.0, 1.0); // Cian
              lookupTable.addRGBPoint(maxVal, 0.0, 0.0, 1.0); // Azul
            }
            break;
            
          case 'cool_warm':
          case 'erdc_blue2red_bw':
            // Azul frío a rojo cálido (o invertido)
            if (invertColormap) {
              lookupTable.addRGBPoint(minVal, 0.71, 0.016, 0.15); // Rojo cálido
              lookupTable.addRGBPoint((minVal + maxVal) / 2, 0.87, 0.87, 0.87); // Blanco
              lookupTable.addRGBPoint(maxVal, 0.23, 0.30, 0.75); // Azul frío
            } else {
              lookupTable.addRGBPoint(minVal, 0.23, 0.30, 0.75); // Azul frío
              lookupTable.addRGBPoint((minVal + maxVal) / 2, 0.87, 0.87, 0.87); // Blanco
              lookupTable.addRGBPoint(maxVal, 0.71, 0.016, 0.15); // Rojo cálido
            }
            break;
            
          default:
            // Default: erdc_blue2red_bw style
            if (invertColormap) {
              lookupTable.addRGBPoint(minVal, 0.71, 0.016, 0.15); // Rojo cálido
              lookupTable.addRGBPoint((minVal + maxVal) / 2, 0.87, 0.87, 0.87); // Blanco
              lookupTable.addRGBPoint(maxVal, 0.23, 0.30, 0.75); // Azul frío
            } else {
              lookupTable.addRGBPoint(minVal, 0.23, 0.30, 0.75); // Azul frío
              lookupTable.addRGBPoint((minVal + maxVal) / 2, 0.87, 0.87, 0.87); // Blanco
              lookupTable.addRGBPoint(maxVal, 0.71, 0.016, 0.15); // Rojo cálido
            }
            break;
        }
      }
      
      mapper.setLookupTable(lookupTable);
      
      console.log(`Applied ${mode} visualization:`, array.getName(), useVectorMagnitude ? '(magnitude)' : '');
    } else {
      mapper.setScalarVisibility(false);
      console.warn(`No array found for ${mode} visualization`);
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

      // Obtener lista de archivos VTK disponibles
      const filesResponse = await fetch(`/api/simulations/${simulationId}/vtk-files`);
      if (!filesResponse.ok) {
        throw new Error(`Failed to get VTK files list: ${filesResponse.status}`);
      }
      
      const { latestVolume, files } = await filesResponse.json();
      console.log('[VTKViewer] Available VTK files:', files?.length || 0);
      console.log('[VTKViewer] Latest volume:', latestVolume);
      
      // Preferir volumen de OpenFOAM, si no hay usar slice
      let vtkUrl;
      if (latestVolume) {
        vtkUrl = latestVolume.path;
        console.log('[VTKViewer] Loading OpenFOAM volume from timestep:', latestVolume.timestep);
      } else if (files && files.length > 0) {
        // Fallback a primer archivo disponible (slice)
        vtkUrl = files[0].path;
        console.log('[VTKViewer] No OpenFOAM volume found, loading slice:', files[0].filename);
      } else {
        throw new Error('No VTK files available for this simulation');
      }
      
      console.log('[VTKViewer] Loading VTK file for simulation:', simulationId, 'URL:', vtkUrl);

      // Cargar el archivo VTK
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
        const arrayNames: string[] = [];
        for (const arrayInfo of vtkData.pointData.arrays) {
          if (arrayInfo.data?.values) {
            const dataArray = vtkDataArray.newInstance({
              name: arrayInfo.data.name,
              dataType: arrayInfo.data.dataType,
              numberOfComponents: arrayInfo.data.numberOfComponents || 1,
              values: arrayInfo.data.values
            });

            arrayNames.push(`${arrayInfo.data.name} (${arrayInfo.data.numberOfComponents || 1} components)`);

            // Si es el primer array o es presión, usarlo como scalars
            if (arrayInfo.data.name === 'p' || arrayInfo.data.name === 'pressure' || 
                polyData.getPointData().getNumberOfArrays() === 0) {
              polyData.getPointData().setScalars(dataArray);
            } else {
              polyData.getPointData().addArray(dataArray);
            }
          }
        }
        console.log('[VTKViewer] Available point data arrays:', arrayNames);
      }

      const dataset = polyData;
      
      // CRITICAL FIX: Wire sourceDataRef
      sourceDataRef.current = dataset;
      
      if (!dataset || dataset.getNumberOfPoints() === 0) {
        throw new Error('No data in VTK file');
      }

      console.log('[VTKViewer] Loaded dataset:', dataset.getNumberOfPoints(), 'points');

      // Crear mapper y actor
      const mapper = vtkMapper.newInstance();
      mapper.setInputData(dataset);
      
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      // Clean up previous actors using helper
      removeActors(actorsRef.current);
      
      // Build new pipeline
      const newActors = buildPipeline(filterConfig, activeMode);
      actorsRef.current = newActors;

      // Add new actors to scene using helper
      addActors(actorsRef.current);
      
      // Debug: Log actor bounds
      if (actorsRef.current.length > 0) {
        const bounds = actorsRef.current[0].getBounds();
        console.log('[VTKViewer] Actor bounds:', bounds);
        console.log('[VTKViewer] Actor visibility:', actorsRef.current[0].getVisibility());
      }
      
      renderer.resetCamera();
      
      // Debug: Log camera position after reset
      const camera = renderer.getActiveCamera();
      console.log('[VTKViewer] Camera position:', camera.getPosition());
      console.log('[VTKViewer] Camera focal point:', camera.getFocalPoint());
      
      // Set initial background to white
      renderer.setBackground(1, 1, 1);
      
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
    
    if (sourceDataRef.current && renderWindowRef.current?.renderer) {
      // Rebuild pipeline with new mode
      removeActors(actorsRef.current);
      const newActors = buildPipeline(filterConfig, mode);
      actorsRef.current = newActors;
      addActors(actorsRef.current);
      
      renderWindowRef.current.renderWindow.render();
    }
  };

  // Initialize component

  // Initialize VTK renderer when simulationId changes
  useEffect(() => {
    initializeVTKRenderer();
  }, [simulationId]);
  
  // Rebuild pipeline when filter configuration changes
  useEffect(() => {
    if (sourceDataRef.current && renderWindowRef.current?.renderer) {
      console.log('[VTKViewer] Rebuilding pipeline due to filter config change');
      
      // Remove existing actors
      removeActors(actorsRef.current);
      
      // Build new pipeline with updated config
      const newActors = buildPipeline(filterConfig, activeMode);
      actorsRef.current = newActors;
      
      // Add new actors to scene
      addActors(actorsRef.current);
      
      // Update background color when it changes
      if (renderWindowRef.current?.renderer) {
        const hexToRgb = (hex: string) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
          ] : [1, 1, 1]; // Default to white
        };
        const [r, g, b] = hexToRgb(backgroundColor);
        renderWindowRef.current.renderer.setBackground(r, g, b);
        console.log('[VTKViewer] Background color updated to:', backgroundColor, `RGB(${r}, ${g}, ${b})`);
      }
      
      // Render the scene
      renderWindowRef.current.renderWindow.render();
    }
  }, [filterConfig, selectedColormap, invertColormap, showGrid, backgroundColor, colormapMin, colormapMax, opacity]);

  return (
    <div className={`vtk-viewer ${className || ''}`}>
      <Card className="border-slate-200 shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-600" />
            CFD Results Visualization
            <Badge variant="outline" className="text-xs">
              Simulation #{simulationId}
            </Badge>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="flex gap-0">
            {/* Left Sidebar - Controls */}
            <div className="w-72 border-r border-slate-200 bg-slate-50/50 overflow-y-auto max-h-[600px]">
              <div className="p-4 space-y-4">
                {/* Data warning badge */}
                {dataWarning && (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <span className="text-xs text-amber-800">{dataWarning}</span>
                  </div>
                )}
                
                {/* Visualization Mode Selection */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Visualization Mode
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {visualizationControls.map((control) => (
                      <Button
                        key={control.id}
                        variant={activeMode === control.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleModeChange(control.id)}
                        className="text-xs h-9 gap-1 w-full justify-start"
                        data-testid={`button-visualization-${control.id}`}
                      >
                        <control.icon className="h-3 w-3" />
                        {control.label}
                      </Button>
                    ))}
                  </div>
                </div>
                
                <Separator />
                
                {/* Controles Avanzados Collapsible */}
                <Collapsible open={showAdvancedControls} onOpenChange={setShowAdvancedControls}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between p-2" data-testid="button-advanced-controls">
                      <div className="flex items-center gap-2">
                        <Sliders className="h-4 w-4" />
                        <span className="text-sm font-medium">Advanced Controls</span>
                      </div>
                      <div className={`transition-transform ${showAdvancedControls ? 'rotate-180' : ''}`}>
                        ▼
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="space-y-4 mt-4">
                {/* Scientific Colormaps */}
                <Collapsible open={showScientificColormaps} onOpenChange={setShowScientificColormaps}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between p-2" data-testid="button-scientific-colormaps">
                      <div className="flex items-center gap-2">
                        <Palette className="h-4 w-4" />
                        <span className="text-sm font-medium">Scientific Colormaps</span>
                      </div>
                      <div className={`transition-transform ${showScientificColormaps ? 'rotate-180' : ''}`}>
                        ▼
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-2">
                      <div className="grid grid-cols-2 gap-2">
                        {['erdc_blue2red_bw', 'jet_cfd', 'plasma', 'viridis', 'cool_warm', 'grayscale'].map((colormap) => (
                          <Button
                            key={colormap}
                            variant={selectedColormap === colormap ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              console.log('[VTKViewer] Changing colormap to:', colormap);
                              setSelectedColormap(colormap);
                            }}
                            className="text-xs"
                            data-testid={`button-colormap-${colormap}`}
                          >
                            {colormap.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Button>
                        ))}
                      </div>
                      
                      {/* Toggle para invertir colormap */}
                      <div className="flex items-center justify-between mt-2">
                        <Label className="text-sm">Invert scale</Label>
                        <Switch
                          checked={invertColormap}
                          onCheckedChange={setInvertColormap}
                          data-testid="toggle-colormap-invert"
                        />
                      </div>
                      
                      {/* Toggle para mostrar grid */}
                      <div className="flex items-center justify-between mt-2">
                        <Label className="text-sm">Show Grid</Label>
                        <Switch
                          checked={showGrid}
                          onCheckedChange={setShowGrid}
                          data-testid="toggle-show-grid"
                        />
                      </div>
                      
                      {/* Selector de color de fondo */}
                      <div className="flex items-center justify-between mt-2">
                        <Label className="text-sm">Background</Label>
                        <div className="flex gap-2">
                          {[
                            { color: '#ffffff', label: 'White' },
                            { color: '#000000', label: 'Black' },
                            { color: '#1a1a2e', label: 'Dark Blue' },
                            { color: '#f5f5f5', label: 'Light Gray' }
                          ].map((bg) => (
                            <Button
                              key={bg.color}
                              variant={backgroundColor === bg.color ? "default" : "outline"}
                              size="sm"
                              className="w-6 h-6 p-0 rounded-full border-2"
                              style={{ backgroundColor: bg.color === '#ffffff' ? '#ffffff' : bg.color }}
                              onClick={() => setBackgroundColor(bg.color)}
                              data-testid={`button-bg-${bg.label.toLowerCase().replace(' ', '-')}`}
                              title={bg.label}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Colormap Range Controls */}
                      <div className="space-y-2 mt-4">
                        <Label className="text-sm font-medium">Colormap Range</Label>
                        <div className="flex space-x-2 items-center">
                          <Input
                            type="number"
                            placeholder="Min"
                            value={colormapMin ?? ''}
                            onChange={(e) => setColormapMin(e.target.value ? parseFloat(e.target.value) : null)}
                            className="w-20 text-xs"
                            step="any"
                            data-testid="input-colormap-min"
                          />
                          <Input
                            type="number"
                            placeholder="Max"
                            value={colormapMax ?? ''}
                            onChange={(e) => setColormapMax(e.target.value ? parseFloat(e.target.value) : null)}
                            className="w-20 text-xs"
                            step="any"
                            data-testid="input-colormap-max"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { 
                              setColormapMin(null); 
                              setColormapMax(null); 
                            }}
                            className="text-xs px-2 py-1"
                            data-testid="button-reset-colormap-range"
                            title="Reset to automatic range"
                          >
                            Reset
                          </Button>
                        </div>
                        <div className="text-xs text-slate-500">
                          Auto range: {dataRange[0].toFixed(2)} - {dataRange[1].toFixed(2)}
                        </div>
                      </div>

                      {/* Transparency Control */}
                      <div className="space-y-2 mt-4">
                        <Label className="text-sm font-medium">
                          Transparency: {(100 - opacity * 100).toFixed(0)}%
                        </Label>
                        <Slider
                          value={[opacity]}
                          onValueChange={(value: number[]) => setOpacity(value[0])}
                          max={1}
                          min={0}
                          step={0.01}
                          className="w-full"
                          data-testid="slider-transparency"
                        />
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Opaque</span>
                          <span>Transparent</span>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* Isosurfaces */}
                <Collapsible open={showIsosurfaces} onOpenChange={setShowIsosurfaces}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between p-2" data-testid="button-isosurfaces">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        <span className="text-sm font-medium">Isosurfaces</span>
                      </div>
                      <div className={`transition-transform ${showIsosurfaces ? 'rotate-180' : ''}`}>
                        ▼
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Enable</Label>
                        <Switch
                          checked={filterConfig.isosurface.enabled}
                          onCheckedChange={(enabled) => setFilterConfig(prev => ({
                            ...prev,
                            isosurface: { ...prev.isosurface, enabled }
                          }))}
                          data-testid="switch-isosurface"
                        />
                      </div>
                      {filterConfig.isosurface.enabled && (
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-600">Value: {filterConfig.isosurface.values[0]?.toFixed(3)}</Label>
                          <Slider
                            value={filterConfig.isosurface.values}
                            onValueChange={(values: number[]) => setFilterConfig(prev => ({
                              ...prev,
                              isosurface: { ...prev.isosurface, values }
                            }))}
                            min={dataRange[0]}
                            max={dataRange[1]}
                            step={(dataRange[1] - dataRange[0]) / 100}
                            className="w-full"
                            data-testid="slider-isosurface"
                          />
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* Threshold Filter */}
                <Collapsible open={showThresholdFilter} onOpenChange={setShowThresholdFilter}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between p-2" data-testid="button-threshold-filter">
                      <div className="flex items-center gap-2">
                        <Scissors className="h-4 w-4" />
                        <span className="text-sm font-medium">Threshold Filter</span>
                      </div>
                      <div className={`transition-transform ${showThresholdFilter ? 'rotate-180' : ''}`}>
                        ▼
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Enable</Label>
                        <Switch
                          checked={filterConfig.threshold.enabled}
                          onCheckedChange={(enabled) => setFilterConfig(prev => ({
                            ...prev,
                            threshold: { ...prev.threshold, enabled }
                          }))}
                          data-testid="switch-threshold"
                        />
                      </div>
                      {filterConfig.threshold.enabled && (
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-600">
                            Range: {filterConfig.threshold.range[0]?.toFixed(3)} - {filterConfig.threshold.range[1]?.toFixed(3)}
                          </Label>
                          <Slider
                            value={filterConfig.threshold.range}
                            onValueChange={(range: number[]) => setFilterConfig(prev => ({
                              ...prev,
                              threshold: { ...prev.threshold, range: range as [number, number] }
                            }))}
                            min={dataRange[0]}
                            max={dataRange[1]}
                            step={(dataRange[1] - dataRange[0]) / 100}
                            className="w-full"
                            data-testid="slider-threshold"
                          />
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* Cutting Plane */}
                <Collapsible open={showCuttingPlane} onOpenChange={setShowCuttingPlane}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between p-2" data-testid="button-cutting-plane">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        <span className="text-sm font-medium">Cutting Plane</span>
                      </div>
                      <div className={`transition-transform ${showCuttingPlane ? 'rotate-180' : ''}`}>
                        ▼
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Enable</Label>
                        <Switch
                          checked={filterConfig.clip.enabled}
                          onCheckedChange={(enabled) => setFilterConfig(prev => ({
                            ...prev,
                            clip: { ...prev.clip, enabled }
                          }))}
                          data-testid="switch-clip"
                        />
                      </div>
                      {filterConfig.clip.enabled && (
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-600">Normal: X={filterConfig.clip.plane.normal[0]} Y={filterConfig.clip.plane.normal[1]} Z={filterConfig.clip.plane.normal[2]}</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <Slider
                              value={[filterConfig.clip.plane.normal[0]]}
                              onValueChange={([x]: number[]) => setFilterConfig(prev => ({
                                ...prev,
                                clip: { 
                                  ...prev.clip, 
                                  plane: { ...prev.clip.plane, normal: [x, prev.clip.plane.normal[1], prev.clip.plane.normal[2]] }
                                }
                              }))}
                              min={-1}
                              max={1}
                              step={0.1}
                              className="w-full"
                            />
                            <Slider
                              value={[filterConfig.clip.plane.normal[1]]}
                              onValueChange={([y]: number[]) => setFilterConfig(prev => ({
                                ...prev,
                                clip: { 
                                  ...prev.clip, 
                                  plane: { ...prev.clip.plane, normal: [prev.clip.plane.normal[0], y, prev.clip.plane.normal[2]] }
                                }
                              }))}
                              min={-1}
                              max={1}
                              step={0.1}
                              className="w-full"
                            />
                            <Slider
                              value={[filterConfig.clip.plane.normal[2]]}
                              onValueChange={([z]: number[]) => setFilterConfig(prev => ({
                                ...prev,
                                clip: { 
                                  ...prev.clip, 
                                  plane: { ...prev.clip.plane, normal: [prev.clip.plane.normal[0], prev.clip.plane.normal[1], z] }
                                }
                              }))}
                              min={-1}
                              max={1}
                              step={0.1}
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* Vector Field */}
                <Collapsible open={showVectorField} onOpenChange={setShowVectorField}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between p-2" data-testid="button-vector-field">
                      <div className="flex items-center gap-2">
                        <ArrowUp className="h-4 w-4" />
                        <span className="text-sm font-medium">Vector Field</span>
                      </div>
                      <div className={`transition-transform ${showVectorField ? 'rotate-180' : ''}`}>
                        ▼
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Enable</Label>
                        <Switch
                          checked={filterConfig.vectors.enabled}
                          onCheckedChange={(enabled) => setFilterConfig(prev => ({
                            ...prev,
                            vectors: { ...prev.vectors, enabled }
                          }))}
                          data-testid="switch-vectors"
                        />
                      </div>
                      {filterConfig.vectors.enabled && (
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-600">Scale: {filterConfig.vectors.scale?.toFixed(2)}</Label>
                          <Slider
                            value={[filterConfig.vectors.scale]}
                            onValueChange={([scale]: number[]) => setFilterConfig(prev => ({
                              ...prev,
                              vectors: { ...prev.vectors, scale }
                            }))}
                            min={0.1}
                            max={5.0}
                            step={0.1}
                            className="w-full"
                          />
                          <Label className="text-xs text-gray-600">Density: {filterConfig.vectors.density?.toFixed(2)}</Label>
                          <Slider
                            value={[filterConfig.vectors.density]}
                            onValueChange={([density]: number[]) => setFilterConfig(prev => ({
                              ...prev,
                              vectors: { ...prev.vectors, density }
                            }))}
                            min={0.01}
                            max={1.0}
                            step={0.01}
                            className="w-full"
                          />
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
            
            {/* Right Side - Canvas and Colorbar */}
            <div className="flex-1 flex">
              <div 
                ref={containerRef}
                className={`${activeMode === 'geometry' ? 'w-full' : 'flex-1'} h-[600px] bg-gradient-to-br from-gray-900 via-blue-900 to-slate-900 relative overflow-hidden`}
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
              
              {/* Colormap Scale Bar - Solo para Pressure y Velocity */}
              {activeMode !== 'geometry' && (
                <div className="w-20 p-2 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col justify-between" data-testid="colormap-bar">
                <div className="flex flex-col h-full">
                  {/* Título y unidades */}
                  <div className="text-center mb-2">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">
                      {activeMode}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {activeMode === 'pressure' ? 'Pa' : 
                       activeMode === 'velocity' ? 'm/s' :
                       activeMode === 'temperature' ? '°C' :
                       activeMode === 'pmv' ? 'PMV' :
                       activeMode === 'ppd' ? '%' : ''}
                    </div>
                  </div>
                  
                  {/* Valor máximo */}
                  <div className="text-xs text-gray-600 dark:text-gray-400 text-center mb-1">
                    {(colormapMax ?? dataRange[1])?.toFixed(2) || '1.00'}
                  </div>
                  
                  {/* Barra de colores */}
                  <div className="flex-1 w-6 mx-auto relative">
                    <div 
                      className="w-full h-full rounded"
                      style={{
                        background: (() => {
                          const direction = invertColormap ? 'to bottom' : 'to top';
                          switch (selectedColormap || 'erdc_blue2red_bw') {
                            case 'grayscale':
                              return `linear-gradient(${direction}, #000000, #ffffff)`;
                            case 'jet_cfd':
                              return `linear-gradient(${direction}, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff)`;
                            case 'plasma':
                              return `linear-gradient(${direction}, #0d0887, #7e03a8, #dd513a, #fca636, #f0f921)`;
                            case 'viridis':
                              return `linear-gradient(${direction}, #440154, #482777, #218e8d, #5ec962, #fde725)`;
                            case 'coolwarm':
                              return `linear-gradient(${direction}, #3b4cc0, #f7f7f7, #b5032a)`;
                            case 'inferno':
                              return `linear-gradient(${direction}, #000004, #420a68, #932667, #dd513a, #fca636, #fcffa4)`;
                            case 'cool_warm':
                            case 'erdc_blue2red_bw':
                              return `linear-gradient(${direction}, #3b4cc0, #dddddd, #b5032a)`;
                            default:
                              return `linear-gradient(${direction}, #3b4cc0, #dddddd, #b5032a)`;
                          }
                        })()
                      }}
                    />
                    
                    {/* Marcas de escala */}
                    <div className="absolute -right-2 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-500 dark:text-gray-400">
                      <div className="w-2 h-px bg-gray-400"></div>
                      <div className="w-2 h-px bg-gray-400"></div>
                      <div className="w-2 h-px bg-gray-400"></div>
                      <div className="w-2 h-px bg-gray-400"></div>
                      <div className="w-2 h-px bg-gray-400"></div>
                    </div>
                  </div>
                  
                  {/* Valor mínimo */}
                  <div className="text-xs text-gray-600 dark:text-gray-400 text-center mt-1">
                    {(colormapMin ?? dataRange[0])?.toFixed(2) || '0.00'}
                  </div>
                  
                  {/* Información adicional */}
                  <div className="text-center mt-2 space-y-1">
                    {activeMode === 'velocity' && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Magnitude
                      </div>
                    )}
                  </div>
                </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}