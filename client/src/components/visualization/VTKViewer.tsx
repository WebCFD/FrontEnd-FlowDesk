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
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
// @ts-ignore
import vtkCutter from '@kitware/vtk.js/Filters/Core/Cutter';
import vtkPlaneSource from '@kitware/vtk.js/Filters/Sources/PlaneSource';
// @ts-ignore
import vtkThresholdPoints from '@kitware/vtk.js/Filters/Core/ThresholdPoints';
// @ts-ignore
import vtkArrowSource from '@kitware/vtk.js/Filters/Sources/ArrowSource';
// @ts-ignore
import vtkGlyph3DMapper from '@kitware/vtk.js/Rendering/Core/Glyph3DMapper';

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
    planesEnabled: {
      x: boolean;
      y: boolean;
      z: boolean;
    };
    planePositions: {
      x: number;
      y: number;
      z: number;
    };
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
 * For PMV/PPD fields, filters out sentinel values (-1000) and extreme values.
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

  let [min, max] = [0, 1];
  
  // Special handling for PMV/PPD fields: filter out -1000 sentinel and invalid values
  if (fieldName === 'PMV' || fieldName === 'PPD') {
    const data = array.getData();
    const validValues: number[] = [];
    
    // Theoretical valid ranges: PMV [-3, +3] typical, PPD [0, 100]
    const isValidPMV = (v: number) => v !== -1000 && isFinite(v) && v >= -3 && v <= 3;
    const isValidPPD = (v: number) => v !== -1000 && isFinite(v) && v >= 0 && v <= 100;
    
    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      if (fieldName === 'PMV' && isValidPMV(val)) {
        validValues.push(val);
      } else if (fieldName === 'PPD' && isValidPPD(val)) {
        validValues.push(val);
      }
    }
    
    if (validValues.length === 0) {
      const sentinelCount = data.filter((v: number) => v === -1000).length;
      const allSentinel = sentinelCount === data.length;
      
      console.warn(`[VTKViewer] No valid values in ${fieldName} after filtering (${sentinelCount}/${data.length} are -1000)`);
      
      const message = allSentinel 
        ? `${fieldName}: No hay valores válidos. Todos los puntos (-1000) están fuera del rango de confort térmico debido a temperaturas o velocidades extremas en esta simulación.`
        : `${fieldName}: No hay valores válidos en el rango teórico (${fieldName === 'PMV' ? '-3 a +3' : '0-100'}).`;
      
      return { 
        range: fieldName === 'PMV' ? [-3, 3] : [0, 100], 
        isUniform: false, 
        isInvalid: true, 
        message
      };
    }
    
    min = Math.min(...validValues);
    max = Math.max(...validValues);
    console.log(`[VTKViewer] Filtered ${fieldName}: ${validValues.length}/${data.length} valid values, range: [${min}, ${max}]`);
  } else {
    // Standard range calculation for other fields
    const rawRange = array.getRange();
    
    if (!rawRange || rawRange.length < 2) {
      return { 
        range: [0, 1], 
        isUniform: false, 
        isInvalid: true, 
        message: 'Invalid range format' 
      };
    }

    [min, max] = rawRange;
  }

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

/**
 * Custom VTK Legacy ASCII parser for POLYDATA format.
 * Replaces vtkPolyDataReader which has a bug with VTK 5.1 files (unbound setData callback).
 * Token-based: splits all content into a flat token array and walks with a cursor,
 * handling POINTS, POLYGONS, SCALARS, VECTORS, and FIELD sections.
 * Supports both legacy VTK and VTK 5.1 OFFSETS/CONNECTIVITY polygon format.
 */
function parseVtkAscii(text: string): ReturnType<typeof vtkPolyData.newInstance> {
  const lines = text.split(/\r?\n/);

  // Validate header: line 2 must be ASCII (binary files are unsupported here)
  if (lines[2] && !lines[2].trim().toUpperCase().startsWith('ASCII')) {
    throw new Error(`parseVtkAscii: expected ASCII format, got: ${lines[2].trim()}`);
  }

  // Collect all tokens starting from line 3 (skip: version, title, ASCII/BINARY lines)
  const tokens: string[] = [];
  for (let lineIdx = 3; lineIdx < lines.length; lineIdx++) {
    const parts = lines[lineIdx].trim().split(/\s+/);
    for (const p of parts) {
      if (p.length > 0) tokens.push(p);
    }
  }

  function need(cursor: number, count: number, section: string) {
    if (cursor + count > tokens.length) {
      throw new Error(`parseVtkAscii: insufficient tokens in ${section} (need ${count}, have ${tokens.length - cursor})`);
    }
  }

  const polyData = vtkPolyData.newInstance();
  let numEntries = 0; // number of points (POINT_DATA) or cells (CELL_DATA) for current data section
  let dataMode: 'point' | 'cell' = 'point'; // tracks whether current arrays belong to point or cell data
  let isUnstructuredGrid = false; // true when DATASET UNSTRUCTURED_GRID is detected
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok === 'DATASET') {
      const datasetType = tokens[i + 1] || '';
      isUnstructuredGrid = datasetType === 'UNSTRUCTURED_GRID';
      i += 2;

    } else if (tok === 'POINTS') {
      numEntries = parseInt(tokens[i + 1]);
      // tokens[i+2] = type (float/double)
      i += 3;
      const n = numEntries * 3;
      const vals = new Float32Array(n);
      for (let j = 0; j < n; j++) {
        vals[j] = parseFloat(tokens[i++]);
      }
      const pts = vtkPoints.newInstance();
      pts.setData(vals, 3);
      polyData.setPoints(pts);

    } else if (tok === 'POLYGONS' || tok === 'TRIANGLE_STRIPS') {
      // In VTK 5.1 format (OFFSETS/CONNECTIVITY), the first number in the POLYGONS
      // header is the number of OFFSETS entries (= actual cell count + 1).
      // In legacy format, it is the number of cells.
      const headerNum = parseInt(tokens[i + 1]);
      const total = parseInt(tokens[i + 2]);
      i += 3;

      let legacyData: Uint32Array;

      if (tokens[i] === 'OFFSETS') {
        // VTK 5.1 format: OFFSETS vtktypeXXX + CONNECTIVITY vtktypeXXX
        // The OFFSETS array has exactly headerNum entries: offsets[0]=0 (start of first cell),
        // offsets[N-1]=total (end of last cell). Cells are built from consecutive pairs.
        const numOffsets = headerNum;
        const nActualCells = numOffsets - 1;
        i += 2; // skip 'OFFSETS' and type token (e.g. 'vtktypeint64')
        const offsets = new Uint32Array(numOffsets);
        for (let j = 0; j < numOffsets; j++) {
          offsets[j] = parseInt(tokens[i++]);
        }
        // Skip 'CONNECTIVITY' and type token
        i += 2;
        const connectivity = new Uint32Array(total);
        for (let j = 0; j < total; j++) {
          connectivity[j] = parseInt(tokens[i++]);
        }
        // Convert to vtk.js legacy cell format: [n, v0, v1, ..., n, v0, ...]
        const legacySize = total + nActualCells;
        legacyData = new Uint32Array(legacySize);
        let li = 0;
        for (let c = 0; c < nActualCells; c++) {
          const start = offsets[c];
          const end = offsets[c + 1];
          const cellSize = end - start;
          legacyData[li++] = cellSize;
          for (let j = start; j < end; j++) {
            legacyData[li++] = connectivity[j];
          }
        }
      } else {
        // Legacy VTK format: total values already in [n, v0, v1, ..., n, v0, ...] form
        legacyData = new Uint32Array(total);
        for (let j = 0; j < total; j++) {
          legacyData[j] = parseInt(tokens[i++]);
        }
      }

      const cells = vtkCellArray.newInstance();
      cells.setData(legacyData);
      if (tok === 'POLYGONS') polyData.setPolys(cells);
      else polyData.setStrips(cells);

    } else if (tok === 'CELLS') {
      // UNSTRUCTURED_GRID CELLS section — skip all connectivity data.
      // VTK 5.1 format: CELLS numOffsets total → OFFSETS type + numOffsets values + CONNECTIVITY type + total values
      // Legacy format:  CELLS numCells total → total values inline
      const headerNum = parseInt(tokens[i + 1]);
      const total = parseInt(tokens[i + 2]);
      i += 3;
      if (tokens[i] === 'OFFSETS') {
        i += 2; // skip 'OFFSETS' and type token
        i += headerNum; // skip offset values
        i += 2; // skip 'CONNECTIVITY' and type token
        i += total; // skip connectivity values
      } else {
        i += total; // legacy: total values already inline
      }

    } else if (tok === 'CELL_TYPES') {
      // UNSTRUCTURED_GRID CELL_TYPES section — skip N type integers
      const nCells = parseInt(tokens[i + 1]);
      i += 2 + nCells;

    } else if (tok === 'LINES') {
      // Parse line cells (legacy OR VTK 5.1 OFFSETS+CONNECTIVITY format)
      const headerNum = parseInt(tokens[i + 1]);
      const total = parseInt(tokens[i + 2]);
      i += 3;

      let lineData: Uint32Array;
      if (tokens[i] === 'OFFSETS') {
        // VTK 5.1 new format: OFFSETS type then CONNECTIVITY type
        // headerNum = numOffsets = nActualLines + 1
        const numOffsets = headerNum;
        const nActualLines = numOffsets - 1;
        i += 2; // skip 'OFFSETS' and type (e.g. 'vtktypeint64')
        const offsets = new Uint32Array(numOffsets);
        for (let j = 0; j < numOffsets; j++) {
          offsets[j] = parseInt(tokens[i++]);
        }
        i += 2; // skip 'CONNECTIVITY' and type
        const connectivity = new Uint32Array(total);
        for (let j = 0; j < total; j++) {
          connectivity[j] = parseInt(tokens[i++]);
        }
        // Convert to legacy format: [cellSize, v0, v1, ..., cellSize, v0, ...]
        const legacySize = total + nActualLines;
        lineData = new Uint32Array(legacySize);
        let li = 0;
        for (let c = 0; c < nActualLines; c++) {
          const start = offsets[c];
          const end = offsets[c + 1];
          const cellSize = end - start;
          lineData[li++] = cellSize;
          for (let j = start; j < end; j++) {
            lineData[li++] = connectivity[j];
          }
        }
      } else {
        // Legacy VTK format: total values in [n, v0, v1, ..., n, v0, ...] form
        lineData = new Uint32Array(total);
        for (let j = 0; j < total; j++) {
          lineData[j] = parseInt(tokens[i++]);
        }
      }

      const lineCells = vtkCellArray.newInstance();
      lineCells.setData(lineData);
      polyData.setLines(lineCells);

    } else if (tok === 'VERTICES') {
      const total = parseInt(tokens[i + 2]);
      i += 3 + total;

    } else if (tok === 'POINT_DATA' || tok === 'CELL_DATA') {
      numEntries = parseInt(tokens[i + 1]);
      dataMode = tok === 'CELL_DATA' ? 'cell' : 'point';
      i += 2;

    } else if (tok === 'SCALARS') {
      const name = tokens[i + 1];
      // tokens[i+2] = type, tokens[i+3] might be ncomp (integer) or 'LOOKUP_TABLE'
      let ncomp = 1;
      let skip = 3;
      const possible_ncomp = tokens[i + 3];
      if (possible_ncomp && possible_ncomp !== 'LOOKUP_TABLE' && !isNaN(parseInt(possible_ncomp))) {
        ncomp = parseInt(possible_ncomp);
        skip = 4;
      }
      i += skip;
      // Skip LOOKUP_TABLE line (always present after SCALARS)
      if (tokens[i] === 'LOOKUP_TABLE') {
        i += 2; // skip 'LOOKUP_TABLE' and table_name
      }
      const n = numEntries * ncomp;
      const vals = new Float32Array(n);
      for (let j = 0; j < n; j++) {
        vals[j] = parseFloat(tokens[i++]);
      }
      const arr = vtkDataArray.newInstance({ name, values: vals, numberOfComponents: ncomp });
      (dataMode === 'cell' ? polyData.getCellData() : polyData.getPointData()).addArray(arr);

    } else if (tok === 'LOOKUP_TABLE') {
      // Standalone LOOKUP_TABLE definition (rare, but handle gracefully)
      // Format: LOOKUP_TABLE name n  then n RGBA entries
      const n = parseInt(tokens[i + 2]);
      if (!isNaN(n)) {
        i += 3 + n * 4;
      } else {
        i += 2;
      }

    } else if (tok === 'VECTORS' || tok === 'NORMALS') {
      const name = tokens[i + 1];
      // tokens[i+2] = type
      i += 3;
      const n = numEntries * 3;
      const vals = new Float32Array(n);
      for (let j = 0; j < n; j++) {
        vals[j] = parseFloat(tokens[i++]);
      }
      if (tok === 'VECTORS') {
        const arr = vtkDataArray.newInstance({ name, values: vals, numberOfComponents: 3 });
        (dataMode === 'cell' ? polyData.getCellData() : polyData.getPointData()).addArray(arr);
      }
      // NORMALS are discarded — not needed for scalar visualization

    } else if (tok === 'TEXTURE_COORDINATES' || tok === 'TCOORDS') {
      const ncomp = parseInt(tokens[i + 2]) || 2;
      i += 3;
      i += numEntries * ncomp; // skip data values

    } else if (tok === 'FIELD') {
      // Format: FIELD FieldData K
      // Then K arrays, each: name ncomp ntuples type\nvalues...
      const numArrays = parseInt(tokens[i + 2]);
      i += 3;
      for (let k = 0; k < numArrays; k++) {
        const name = tokens[i];
        const ncomp = parseInt(tokens[i + 1]);
        const ntuples = parseInt(tokens[i + 2]);
        // tokens[i+3] = type (float/double/int)
        i += 4;
        const n = ncomp * ntuples;
        const vals = new Float32Array(n);
        for (let j = 0; j < n; j++) {
          vals[j] = parseFloat(tokens[i++]);
        }
        const arr = vtkDataArray.newInstance({ name, values: vals, numberOfComponents: ncomp });
        (dataMode === 'cell' ? polyData.getCellData() : polyData.getPointData()).addArray(arr);
      }

    } else if (tok === 'COLOR_SCALARS') {
      // COLOR_SCALARS name ncomp — values are in [0,1] per component, no LOOKUP_TABLE
      const ncomp = parseInt(tokens[i + 2]);
      i += 3;
      i += numEntries * ncomp;

    } else if (tok === 'METADATA') {
      // VTK 5.1 metadata block — skip until a known section keyword is found
      i++;
      while (i < tokens.length) {
        const t = tokens[i];
        if (t === 'INFORMATION' || t === 'NAME' || t === 'DATA' || t === 'LOCATION' ||
            t === 'LENGTH' || t === 'COMPONENT_NAMES') {
          i++;
        } else {
          break; // next known section
        }
      }

    } else {
      // Unknown keyword or stray value — skip single token
      i++;
    }
  }

  // For UNSTRUCTURED_GRID files: no POLYGONS were set since cells were skipped.
  // Build a VERTICES (point cloud) array so every point renders as a vertex glyph.
  // This gives a colour-coded 3D point cloud of the internal air volume, useful for
  // visualising field distributions with the cutting-plane feature in the viewer.
  if (isUnstructuredGrid && polyData.getPolys().getNumberOfCells() === 0) {
    const nPts = polyData.getNumberOfPoints();
    if (nPts > 0) {
      // Legacy VTK cell format for N singleton vertices: [1, 0, 1, 1, 1, 2, …, 1, N-1]
      const verts = new Uint32Array(nPts * 2);
      for (let v = 0; v < nPts; v++) {
        verts[v * 2] = 1;
        verts[v * 2 + 1] = v;
      }
      const vertCells = vtkCellArray.newInstance();
      vertCells.setData(verts);
      polyData.setVerts(vertCells);
    }
  }

  return polyData;
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
  const [showEdges, setShowEdges] = useState<boolean>(false);
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff'); // Blanco por defecto
  const [colormapMin, setColormapMin] = useState<number | null>(null);
  const [colormapMax, setColormapMax] = useState<number | null>(null);
  const [opacity, setOpacity] = useState<number>(1.0); // 1.0 = opaco, 0.0 = transparente
  const [isosurfaceLoading, setIsosurfaceLoading] = useState<boolean>(false);
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [domainBounds, setDomainBounds] = useState<{ min: number[]; max: number[]; center: number[] }>({
    min: [0, 0, 0],
    max: [1, 1, 1],
    center: [0.5, 0.5, 0.5]
  });
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({
    isosurface: { enabled: false, values: [0.5] },
    threshold: { enabled: false, range: [0, 1] },
    clip: { 
      enabled: false, 
      planesEnabled: { x: true, y: true, z: true },
      planePositions: { x: 0.5, y: 0.5, z: 0.5 }
    },
    vectors: { enabled: false, scale: 1.0, density: 0.1 }
  });
  
  // Refs that mirror state values to avoid stale closures in async callbacks
  const activeModeRef = useRef<VisualizationMode>('pressure');
  const filterConfigRef = useRef<FilterConfig>({
    isosurface: { enabled: false, values: [0.5] },
    threshold: { enabled: false, range: [0, 1] },
    clip: { 
      enabled: false, 
      planesEnabled: { x: true, y: true, z: true },
      planePositions: { x: 0.5, y: 0.5, z: 0.5 }
    },
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
  const clippingPlaneActorsRef = useRef<any[]>([]); // Actores para los planos de corte visibles
  const isosurfaceActorRef = useRef<any>(null); // Actor overlay para isosuperficies
  const isosurfaceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentVtkFilenameRef = useRef<string>(''); // Nombre del archivo VTK actual

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

  // Helper function to apply edge visibility to actors
  const applyEdgeVisibilityToActor = (actor: any) => {
    if (actor && actor.getProperty) {
      actor.getProperty().setEdgeVisibility(showEdges);
      if (showEdges) {
        actor.getProperty().setEdgeColor(0.2, 0.2, 0.2); // Dark gray edges
        actor.getProperty().setLineWidth(1);
      }
    }
  };

  const removeActors = (actors: any[]) => {
    if (renderWindowRef.current?.renderer) {
      actors.forEach(actor => {
        renderWindowRef.current.renderer.removeActor(actor);
      });
    }
  };

  // Create cutting planes using vtkCutter — accurate intersection lines on the surface geometry
  const createCuttingPlanes = () => {
    if (!sourceDataRef.current) return [];

    const actors: any[] = [];
    const { planePositions, planesEnabled } = filterConfig.clip;
    const sourceData = sourceDataRef.current;
    const { min, max, center } = domainBounds;

    const createCut = (normal: [number, number, number], position: number) => {
      const plane = vtkPlane.newInstance();
      plane.setNormal(...normal);
      // Origin lies ON the cutting plane at the specified position along the normal axis
      plane.setOrigin(
        normal[0] !== 0 ? position : center[0],
        normal[1] !== 0 ? position : center[1],
        normal[2] !== 0 ? position : center[2],
      );

      const cutter = vtkCutter.newInstance();
      cutter.setInputData(sourceData);
      cutter.setCutFunction(plane);
      cutter.update();

      const cutData = cutter.getOutputData();
      if (!cutData || cutData.getNumberOfPoints() === 0) {
        console.log('[VTKViewer] Cutter returned empty for normal:', normal, 'position:', position);
        return null;
      }

      console.log('[VTKViewer] Cutter output:', cutData.getNumberOfPoints(), 'pts',
        cutData.getNumberOfLines?.() ?? 0, 'lines');

      const mapper = vtkMapper.newInstance();
      mapper.setInputData(cutData);
      applyVisualization(mapper, cutData, activeMode as VisualizationMode);

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      actor.getProperty().setLineWidth(3);
      actor.getProperty().setLighting(false);

      return actor;
    };

    // planePositions are in world coordinates (set by the UI sliders)
    if (planesEnabled.x) {
      const a = createCut([1, 0, 0], filterConfig.clip.planePositions.x);
      if (a) actors.push(a);
    }
    if (planesEnabled.y) {
      const a = createCut([0, 1, 0], filterConfig.clip.planePositions.y);
      if (a) actors.push(a);
    }
    if (planesEnabled.z) {
      const a = createCut([0, 0, 1], filterConfig.clip.planePositions.z);
      if (a) actors.push(a);
    }

    console.log('[VTKViewer] Created', actors.length, 'vtkCutter cut actors');
    return actors;
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
    
    mapper.setScalarModeToUsePointFieldData();
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
    
    mapper.setScalarModeToUsePointFieldData();
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

  // Build a subsampled PolyData for glyph placement (every step-th point)
  const subsamplePolyDataForGlyphs = (inputData: any, density: number): any => {
    const n = inputData.getNumberOfPoints();
    const step = Math.max(1, Math.round(1.0 / Math.max(0.005, density)));
    const ptRaw = inputData.getPoints().getData();
    const pointData = inputData.getPointData();

    const selected: number[] = [];
    for (let i = 0; i < n; i += step) selected.push(i);
    const m = selected.length;

    const newPtsData = new Float32Array(m * 3);
    for (let j = 0; j < m; j++) {
      const i = selected[j];
      newPtsData[j * 3] = ptRaw[i * 3];
      newPtsData[j * 3 + 1] = ptRaw[i * 3 + 1];
      newPtsData[j * 3 + 2] = ptRaw[i * 3 + 2];
    }

    const sampledPts = vtkPoints.newInstance();
    sampledPts.setData(newPtsData, 3);

    const sampledPD = vtkPolyData.newInstance();
    sampledPD.setPoints(sampledPts);

    // Copy all point data arrays (subsampled)
    const numArrays = pointData.getNumberOfArrays();
    for (let ai = 0; ai < numArrays; ai++) {
      const arr = pointData.getArrayByIndex(ai);
      const nc = arr.getNumberOfComponents();
      const oldData = arr.getData();
      const newData = new Float32Array(m * nc);
      for (let j = 0; j < m; j++) {
        const i = selected[j];
        for (let c = 0; c < nc; c++) newData[j * nc + c] = oldData[i * nc + c];
      }
      const newArr = vtkDataArray.newInstance({ name: arr.getName(), values: newData, numberOfComponents: nc });
      sampledPD.getPointData().addArray(newArr);
    }

    // Vertex cells so the mapper knows there are points
    const verts = new Uint32Array(m * 2);
    for (let j = 0; j < m; j++) { verts[j * 2] = 1; verts[j * 2 + 1] = j; }
    const vertCells = vtkCellArray.newInstance();
    vertCells.setData(verts);
    sampledPD.setVerts(vertCells);

    return sampledPD;
  };

  // Real arrow glyph vector field using vtkArrowSource + vtkGlyph3DMapper
  const createAdvancedVectorField = (inputData: any, scale: number, density: number, arrayName: string) => {
    const pointData = inputData.getPointData();
    const vectorArray = pointData.getArrayByName(arrayName) || pointData.getArray(1);

    if (!vectorArray || vectorArray.getNumberOfComponents() < 3) {
      console.warn('[VTKViewer] No valid 3-component vector array for glyphs');
      return null;
    }

    // Pre-compute magnitude for coloring & scaling
    const magArray = calculateVectorMagnitude(vectorArray);
    if (!pointData.getArrayByName(magArray.getName())) {
      pointData.addArray(magArray);
    }

    // Subsample points for performance
    const sampledData = subsamplePolyDataForGlyphs(inputData, density);

    // Arrow source
    const arrowSource = vtkArrowSource.newInstance();
    arrowSource.setTipLength(0.35);
    arrowSource.setShaftRadius(0.04);
    arrowSource.update();

    // Glyph mapper
    const glyphMapper = vtkGlyph3DMapper.newInstance();
    glyphMapper.setInputData(sampledData);
    glyphMapper.setSourceConnection(arrowSource.getOutputPort());
    glyphMapper.setOrient(true);
    glyphMapper.setOrientationModeToDirection();
    glyphMapper.setOrientationArray(vectorArray.getName()); // 3-component vector → direction
    glyphMapper.setScaling(true);
    glyphMapper.setScaleModeToScaleByMagnitude();
    glyphMapper.setScaleArray(vectorArray.getName()); // magnitude computed from this
    glyphMapper.setScaleFactor(scale);

    // Color arrows by velocity magnitude using current colormap
    applyVisualization(glyphMapper, sampledData, 'velocity');

    const actor = vtkActor.newInstance();
    actor.setMapper(glyphMapper);
    actor.getProperty().setOpacity(opacity);

    console.log(`[VTKViewer] Arrow glyphs: ${sampledData.getNumberOfPoints()} arrows (density=${density}, scale=${scale})`);
    return [actor];
  };

  // Build VTK pipeline with filters
  const buildPipeline = (config: FilterConfig, activeField: string) => {
    if (!sourceDataRef.current) {
      console.warn('[VTKViewer] No source data available for pipeline');
      return [];
    }

    let currentData = sourceDataRef.current;
    const actors = [];

    // Determine which scalar array to use based on active field.
    // Use the first name that actually exists in the dataset for robustness.
    const pointData = currentData.getPointData();
    let scalarArrayName = '';
    const findArray = (...names: string[]) => names.find(n => pointData.getArrayByName(n)) || '';
    switch (activeField) {
      case 'pressure':
        scalarArrayName = findArray('p', 'p_rgh') || pointData.getArray(0)?.getName() || '';
        break;
      case 'velocity':
        scalarArrayName = findArray('U_magnitude', 'U_mag', 'U') || pointData.getArray(0)?.getName() || '';
        break;
      case 'temperature':
        scalarArrayName = findArray('T_degC', 'T') || pointData.getArray(0)?.getName() || '';
        break;
      case 'pmv':
        scalarArrayName = findArray('PMV') || '';
        break;
      case 'ppd':
        scalarArrayName = findArray('PPD') || '';
        break;
      default:
        scalarArrayName = pointData.getArray(0)?.getName() || '';
        break;
    }

    // Apply filters in sequence
    let filteredData = currentData;
    const activeFilters = [];

    // ── Main surface actor (always rendered; opacity adjusted by filters) ──────
    const surfaceMapper = vtkMapper.newInstance();
    surfaceMapper.setInputData(filteredData);
    const surfaceActor = vtkActor.newInstance();
    surfaceActor.setMapper(surfaceMapper);
    applyVisualization(surfaceMapper, filteredData, activeField as VisualizationMode);
    actors.push(surfaceActor);

    // ── Threshold filter: real vtkThresholdPoints point cloud overlay ─────────
    if (config.threshold.enabled && scalarArrayName) {
      const [lo, hi] = config.threshold.range;
      console.log('[VTKViewer] ThresholdPoints range:', lo, '–', hi, 'array:', scalarArrayName);

      // For multi-component (e.g. velocity U), use magnitude array
      const threshArray = (() => {
        const a = pointData.getArrayByName(scalarArrayName);
        if (a && a.getNumberOfComponents() > 1) {
          const mag = calculateVectorMagnitude(a);
          if (!pointData.getArrayByName(mag.getName())) pointData.addArray(mag);
          return mag.getName();
        }
        return scalarArrayName;
      })();

      try {
        const threshFilter = vtkThresholdPoints.newInstance();
        threshFilter.setInputData(filteredData);
        threshFilter.setCriterias([
          { arrayName: threshArray, fieldAssociation: 'PointData', operation: 'Above', value: lo },
          { arrayName: threshArray, fieldAssociation: 'PointData', operation: 'Below', value: hi },
        ]);
        threshFilter.update();
        const threshData = threshFilter.getOutputData();

        if (threshData && threshData.getNumberOfPoints() > 0) {
          const threshMapper = vtkMapper.newInstance();
          threshMapper.setInputData(threshData);
          applyVisualization(threshMapper, threshData, activeField as VisualizationMode);

          const threshActor = vtkActor.newInstance();
          threshActor.setMapper(threshMapper);
          threshActor.getProperty().setPointSize(4);
          threshActor.getProperty().setOpacity(opacity);
          actors.push(threshActor);

          // Dim the base surface for context
          surfaceActor.getProperty().setOpacity(Math.min(0.15, opacity * 0.15));
          surfaceActor.getProperty().setColor(0.7, 0.7, 0.7);
          surfaceActor.getMapper().setScalarVisibility(false);

          console.log('[VTKViewer] ThresholdPoints output:', threshData.getNumberOfPoints(), 'pts');
        } else {
          console.log('[VTKViewer] ThresholdPoints: no points in range — showing full surface');
          applyOpacityToActor(surfaceActor);
          applyEdgeVisibilityToActor(surfaceActor);
        }
      } catch (err) {
        console.warn('[VTKViewer] ThresholdPoints failed:', err);
        applyOpacityToActor(surfaceActor);
        applyEdgeVisibilityToActor(surfaceActor);
      }
    } else {
      // Normal surface rendering
      applyOpacityToActor(surfaceActor);
      applyEdgeVisibilityToActor(surfaceActor);
    }

    // Note: Isosurface (contour lines) rendered as an overlay via fetchIsosurface / isosurfaceActorRef
    // Note: Clipping planes rendered separately via createCuttingPlanes / clippingPlaneActorsRef

    // ── Vector arrows: vtkArrowSource + vtkGlyph3DMapper ─────────────────────
    if (config.vectors.enabled && activeField === 'velocity') {
      const vectorActors = createAdvancedVectorField(
        currentData, config.vectors.scale, config.vectors.density, 'U'
      );
      if (vectorActors && vectorActors.length > 0) {
        actors.push(...vectorActors);
        console.log('[VTKViewer] Added', vectorActors.length, 'arrow glyph actor(s)');
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
    const cellData = dataset.getCellData();
    const lookupTable = vtkColorTransferFunction.newInstance();
    
    let array = null;
    let arrayComeFromCellData = false;
    let presetName = 'erdc_blue2red_bw';
    let useVectorMagnitude = false;
    
    // Helper: look up array by name in pointData first, then cellData
    const findArray = (name: string) => {
      const pa = pointData.getArrayByName(name);
      if (pa) return { arr: pa, fromCells: false };
      const ca = cellData.getArrayByName(name);
      if (ca) return { arr: ca, fromCells: true };
      return null;
    };
    const findFirstArray = () => {
      if (pointData.getNumberOfArrays() > 0) return { arr: pointData.getArray(0), fromCells: false };
      if (cellData.getNumberOfArrays() > 0) return { arr: cellData.getArray(0), fromCells: true };
      return null;
    };

    // Debug: Log available arrays
    const numPtArrays = pointData.getNumberOfArrays();
    const numCellArrays = cellData.getNumberOfArrays();
    console.log('[VTKViewer] Selecting field for mode:', mode,
      '- Point arrays:', numPtArrays, '| Cell arrays:', numCellArrays);
    for (let i = 0; i < numPtArrays; i++) {
      const arr = pointData.getArray(i);
      console.log(`  [pt ${i}]:`, arr.getName(), `(${arr.getNumberOfComponents()} components)`);
    }
    for (let i = 0; i < numCellArrays; i++) {
      const arr = cellData.getArray(i);
      console.log(`  [cell ${i}]:`, arr.getName(), `(${arr.getNumberOfComponents()} components)`);
    }
    
    switch (mode) {
      case 'pressure': {
        const found = findArray('p') || findArray('p_rgh') || findFirstArray();
        if (found) { array = found.arr; arrayComeFromCellData = found.fromCells; }
        presetName = 'erdc_blue2red_bw';
        break;
      }
      case 'velocity': {
        const found = findArray('U_magnitude') || findArray('U_mag') || findArray('U');
        if (found) { array = found.arr; arrayComeFromCellData = found.fromCells; }
        presetName = 'erdc_blue2red_bw';
        useVectorMagnitude = array?.getNumberOfComponents() >= 3;
        break;
      }
      case 'temperature': {
        const found = findArray('T_degC') || findArray('T');
        if (found) { array = found.arr; arrayComeFromCellData = found.fromCells; }
        presetName = 'plasma';
        break;
      }
      case 'pmv': {
        const found = findArray('PMV');
        if (found) { array = found.arr; arrayComeFromCellData = found.fromCells; }
        presetName = 'coolwarm';
        break;
      }
      case 'ppd': {
        const found = findArray('PPD');
        if (found) { array = found.arr; arrayComeFromCellData = found.fromCells; }
        presetName = 'inferno';
        break;
      }
      case 'geometry':
        array = null;
        break;
      default: {
        const found = findFirstArray();
        if (found) { array = found.arr; arrayComeFromCellData = found.fromCells; }
        presetName = 'Greys';
        break;
      }
    }
    
    console.log('[VTKViewer] Selected array for mode', mode, ':',
      array?.getName() || 'none', arrayComeFromCellData ? '(cell data)' : '(point data)');
    
    if (array) {
      // Para vectores de velocidad, usar magnitud
      if (useVectorMagnitude && array.getNumberOfComponents() >= 3) {
        const magnitudeArray = calculateVectorMagnitude(array);
        array = magnitudeArray;
        // Magnitude is always added to pointData for interpolation
        pointData.addArray(magnitudeArray);
        arrayComeFromCellData = false;
        mapper.setScalarModeToUsePointFieldData();
        mapper.setColorByArrayName(magnitudeArray.getName());
      } else if (arrayComeFromCellData) {
        mapper.setScalarModeToUseCellFieldData();
        mapper.setColorByArrayName(array.getName());
      } else {
        mapper.setScalarModeToUsePointFieldData();
        mapper.setColorByArrayName(array.getName());
      }
      
      mapper.setScalarVisibility(true);
      
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
        if (dataWarning) {
          console.log('[VTKViewer] Clearing data warning');
          setDataWarning(null);
        }
      }
      
      // Use custom min/max values if specified, otherwise use normalized safe range
      const effectiveMin = colormapMin ?? safeMin;
      const effectiveMax = colormapMax ?? safeMax;
      
      // Update UI state for sliders (use safe range)
      setDataRange([safeMin, safeMax]);
      
      console.log('[VTKViewer] Colormap range applied - Data:', `${safeMin.toFixed(2)}-${safeMax.toFixed(2)}`, 
                 'Effective:', `${effectiveMin.toFixed(2)}-${effectiveMax.toFixed(2)}`,
                 normalized.isUniform ? '(uniform data)' : normalized.isInvalid ? '(invalid data)' : '');

      // Build the color transfer function.
      // CRITICAL: CTF control points must be at ACTUAL data values, not [0,1].
      // vtk.js vtkColorTransferFunction.mapScalars() receives raw scalar values
      // and does a direct binary-search on the node X values. If node X values
      // are in [0,1] but data is at (e.g.) [-19.5, -19.0], all scalars fall
      // outside the CTF range and get clamped to the first/last color.
      // The fix: when a preset is available, rescale its [0,1] X positions to
      // [effectiveMin, effectiveMax] before adding the points.
      const colormapName = selectedColormap || presetName;
      const preset = vtkColorMaps.getPresetByName(colormapName);
      const span = effectiveMax - effectiveMin;

      if (preset && preset.RGBPoints && preset.RGBPoints.length >= 8) {
        // Rescale preset control points from [0,1] to [effectiveMin, effectiveMax]
        const pts = preset.RGBPoints;
        const presetMin = pts[0];
        const presetMax = pts[pts.length - 4];
        const presetSpan = presetMax - presetMin || 1;
        const numPts = pts.length / 4;
        for (let j = 0; j < pts.length; j += 4) {
          const t = (pts[j] - presetMin) / presetSpan; // normalised [0,1]
          const x = effectiveMin + t * span;            // actual data value
          // For inversion: mirror the color source from the other end of the preset
          const srcJ = invertColormap ? (numPts - 1 - j / 4) * 4 : j;
          lookupTable.addRGBPoint(x, pts[srcJ + 1], pts[srcJ + 2], pts[srcJ + 3]);
        }
        console.log('[VTKViewer] Applied preset colormap (rescaled to data range):', colormapName);
      } else {
        // Fallback: manual palettes — points are already at actual data values
        if (!preset) console.warn(`Preset ${colormapName} not found, using manual colormap`);
        const activeColormap = selectedColormap || presetName;
        console.log('[VTKViewer] Applied manual colormap:', activeColormap);
        const lo = effectiveMin;
        const hi = effectiveMax;
        const mid = (lo + hi) / 2;
        const q1 = lo + span * 0.25;
        const q3 = lo + span * 0.75;
        switch (activeColormap) {
          case 'grayscale':
            if (invertColormap) {
              lookupTable.addRGBPoint(lo, 1.0, 1.0, 1.0);
              lookupTable.addRGBPoint(hi, 0.0, 0.0, 0.0);
            } else {
              lookupTable.addRGBPoint(lo, 0.0, 0.0, 0.0);
              lookupTable.addRGBPoint(hi, 1.0, 1.0, 1.0);
            }
            break;
          case 'plasma':
            if (invertColormap) {
              lookupTable.addRGBPoint(lo, 0.94, 0.98, 0.65);
              lookupTable.addRGBPoint(q1, 0.99, 0.65, 0.04);
              lookupTable.addRGBPoint(mid, 0.87, 0.31, 0.39);
              lookupTable.addRGBPoint(q3, 0.49, 0.01, 0.66);
              lookupTable.addRGBPoint(hi, 0.05, 0.03, 0.53);
            } else {
              lookupTable.addRGBPoint(lo, 0.05, 0.03, 0.53);
              lookupTable.addRGBPoint(q1, 0.49, 0.01, 0.66);
              lookupTable.addRGBPoint(mid, 0.87, 0.31, 0.39);
              lookupTable.addRGBPoint(q3, 0.99, 0.65, 0.04);
              lookupTable.addRGBPoint(hi, 0.94, 0.98, 0.65);
            }
            break;
          case 'viridis':
            if (invertColormap) {
              lookupTable.addRGBPoint(lo, 0.99, 0.91, 0.15);
              lookupTable.addRGBPoint(q1, 0.37, 0.74, 0.35);
              lookupTable.addRGBPoint(mid, 0.13, 0.57, 0.55);
              lookupTable.addRGBPoint(q3, 0.28, 0.17, 0.48);
              lookupTable.addRGBPoint(hi, 0.27, 0.00, 0.33);
            } else {
              lookupTable.addRGBPoint(lo, 0.27, 0.00, 0.33);
              lookupTable.addRGBPoint(q1, 0.28, 0.17, 0.48);
              lookupTable.addRGBPoint(mid, 0.13, 0.57, 0.55);
              lookupTable.addRGBPoint(q3, 0.37, 0.74, 0.35);
              lookupTable.addRGBPoint(hi, 0.99, 0.91, 0.15);
            }
            break;
          case 'jet_cfd':
            if (invertColormap) {
              lookupTable.addRGBPoint(lo, 0.0, 0.0, 1.0);
              lookupTable.addRGBPoint(q1, 0.0, 1.0, 1.0);
              lookupTable.addRGBPoint(mid, 0.0, 1.0, 0.0);
              lookupTable.addRGBPoint(q3, 1.0, 1.0, 0.0);
              lookupTable.addRGBPoint(hi, 1.0, 0.0, 0.0);
            } else {
              lookupTable.addRGBPoint(lo, 1.0, 0.0, 0.0);
              lookupTable.addRGBPoint(q1, 1.0, 1.0, 0.0);
              lookupTable.addRGBPoint(mid, 0.0, 1.0, 0.0);
              lookupTable.addRGBPoint(q3, 0.0, 1.0, 1.0);
              lookupTable.addRGBPoint(hi, 0.0, 0.0, 1.0);
            }
            break;
          case 'cool_warm':
          case 'erdc_blue2red_bw':
          default:
            if (invertColormap) {
              lookupTable.addRGBPoint(lo, 0.71, 0.016, 0.15);
              lookupTable.addRGBPoint(mid, 0.87, 0.87, 0.87);
              lookupTable.addRGBPoint(hi, 0.23, 0.30, 0.75);
            } else {
              lookupTable.addRGBPoint(lo, 0.23, 0.30, 0.75);
              lookupTable.addRGBPoint(mid, 0.87, 0.87, 0.87);
              lookupTable.addRGBPoint(hi, 0.71, 0.016, 0.15);
            }
            break;
        }
      }

      // Tell the mapper the exact scalar range so the legend/colorbar is correct.
      // Do NOT use setUseLookupTableScalarRange — that sets the mapper's range from
      // CTF.getRange() which returns the control-point X range (may be [0,1] for
      // presets before rescaling), causing all scalars to be clamped to one color.
      mapper.setScalarRange(effectiveMin, effectiveMax);
      mapper.setLookupTable(lookupTable);
      
      console.log(`Applied ${mode} visualization:`, array.getName(), useVectorMagnitude ? '(magnitude)' : '');
    } else {
      mapper.setScalarVisibility(false);
      if (mode !== 'geometry') {
        const fieldLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
        setDataWarning(`No ${fieldLabel} data in this file. Try loading a different VTK file.`);
        console.warn(`No array found for ${mode} visualization`);
      } else {
        setDataWarning(null);
      }
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
      
      // Prefer 3D volume/surface files over 2D slice planes.
      // latestVolume priority (set by backend): surface_3d > volume_complete > volume_internal > volume
      // surface_3d    = full 3D room boundary (walls/floor/ceiling/door/window) with CFD fields
      // volume_internal = internal air volume mesh (UnstructuredGrid → point cloud rendering)
      // volume_complete = legacy OpenFOAM converted vtkjs
      // slice          = 2D horizontal cut plane (fallback)
      let vtkUrl;
      if (latestVolume) {
        vtkUrl = latestVolume.path;
        const typeLabel: Record<string, string> = {
          surface_3d: '3D room surface (walls/floor/ceiling)',
          volume_internal: '3D internal volume mesh',
          volume_complete: 'OpenFOAM vtkjs volume',
          boundary: 'OpenFOAM boundary patches',
          volume: 'OpenFOAM volume',
        };
        console.log(
          `[VTKViewer] Loading ${typeLabel[latestVolume.type] || latestVolume.type}: ${latestVolume.filename}`
        );
      } else if (files && files.length > 0) {
        // Fallback to first available file (likely a 2D slice plane)
        vtkUrl = files[0].path;
        console.log('[VTKViewer] No 3D volume file found — loading slice:', files[0].filename);
      } else {
        throw new Error('No VTK files available for this simulation');
      }
      
      console.log('[VTKViewer] Loading VTK file for simulation:', simulationId, 'URL:', vtkUrl);

      // Track filename for server-side isosurface endpoint
      const vtkFilename = vtkUrl.split('/').pop() || '';
      currentVtkFilenameRef.current = vtkFilename;
      console.log('[VTKViewer] Tracking VTK filename for isosurface:', vtkFilename);

      // Cargar el archivo VTK
      const response = await fetch(vtkUrl);
      if (!response.ok) {
        throw new Error(`File not found: ${response.status}`);
      }

      // Parsear archivo VTK Legacy ASCII con nuestro propio parser
      // (vtkPolyDataReader de vtk.js falla con VTK 5.1 — bug en setData callback sin bind)
      const vtkText = await response.text();
      const polyData = parseVtkAscii(vtkText);

      if (!polyData) {
        throw new Error('Failed to parse VTK file — parser returned no data');
      }

      const ptArrayNames: string[] = [];
      for (let i = 0; i < polyData.getPointData().getNumberOfArrays(); i++) {
        const arr = polyData.getPointData().getArray(i);
        if (arr) ptArrayNames.push(`${arr.getName()} (${arr.getNumberOfComponents()} components)`);
      }
      const cellArrayNames: string[] = [];
      for (let i = 0; i < polyData.getCellData().getNumberOfArrays(); i++) {
        const arr = polyData.getCellData().getArray(i);
        if (arr) cellArrayNames.push(`${arr.getName()} (${arr.getNumberOfComponents()} components)`);
      }
      console.log('[VTKViewer] Parsed VTK legacy file:', {
        points: polyData.getNumberOfPoints(),
        cells: polyData.getNumberOfCells(),
        pointDataArrays: ptArrayNames,
        cellDataArrays: cellArrayNames,
      });

      const dataset = polyData;
      
      // CRITICAL FIX: Wire sourceDataRef
      sourceDataRef.current = dataset;
      
      if (!dataset || dataset.getNumberOfPoints() === 0) {
        throw new Error('No data in VTK file');
      }

      console.log('[VTKViewer] Loaded dataset:', dataset.getNumberOfPoints(), 'points');
      
      // Calculate domain bounds for cutting planes
      const bounds = dataset.getBounds();
      if (bounds && bounds.length === 6) {
        const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds;
        const center = [
          (xMin + xMax) / 2,
          (yMin + yMax) / 2,
          (zMin + zMax) / 2
        ];
        setDomainBounds({
          min: [xMin, yMin, zMin],
          max: [xMax, yMax, zMax],
          center: center
        });
        // Initialize plane positions at center
        setFilterConfig(prev => ({
          ...prev,
          clip: {
            ...prev.clip,
            planePositions: { x: center[0], y: center[1], z: center[2] }
          }
        }));
        console.log('[VTKViewer] Domain bounds:', { min: [xMin, yMin, zMin], max: [xMax, yMax, zMax], center });
      }

      // Crear mapper y actor
      const mapper = vtkMapper.newInstance();
      mapper.setInputData(dataset);
      
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      // Clean up previous actors using helper
      removeActors(actorsRef.current);
      
      // Use refs (not state values) so the async callback always gets the current mode/config
      const newActors = buildPipeline(filterConfigRef.current, activeModeRef.current);
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
    
    // Disable cutting planes when changing visualization field
    // This forces user to re-enable them to see the new field on the planes
    setFilterConfig(prev => ({
      ...prev,
      clip: {
        ...prev.clip,
        enabled: false
      }
    }));
    
    if (sourceDataRef.current && renderWindowRef.current?.renderer) {
      // Rebuild pipeline with new mode
      removeActors(actorsRef.current);
      const newActors = buildPipeline(filterConfig, mode);
      actorsRef.current = newActors;
      addActors(actorsRef.current);
      
      renderWindowRef.current.renderWindow.render();
    }
  };

  // Keep refs in sync with state so async callbacks always read the latest values
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);
  useEffect(() => { filterConfigRef.current = filterConfig; }, [filterConfig]);

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
      
      // Handle cutting planes visualization
      removeActors(clippingPlaneActorsRef.current);
      clippingPlaneActorsRef.current = [];
      
      // Build main pipeline (surface + threshold + vectors)
      const newActors = buildPipeline(filterConfig, activeMode);
      actorsRef.current = newActors;
      addActors(actorsRef.current);

      // If clip is active: dim surface + add vtkCutter intersection lines
      if (filterConfig.clip.enabled && (
        filterConfig.clip.planesEnabled.x ||
        filterConfig.clip.planesEnabled.y ||
        filterConfig.clip.planesEnabled.z
      )) {
        // Dim main surface to provide spatial context
        actorsRef.current.forEach(a => {
          if (a?.getProperty) a.getProperty().setOpacity(0.15);
          if (a?.getMapper) a.getMapper().setScalarVisibility(false);
        });

        const planes = createCuttingPlanes();
        clippingPlaneActorsRef.current = planes;
        addActors(clippingPlaneActorsRef.current);
        console.log('[VTKViewer] Clip: added', planes.length, 'vtkCutter actors');
      }
      
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
  }, [filterConfig, selectedColormap, invertColormap, showGrid, showEdges, backgroundColor, colormapMin, colormapMax, opacity]);

  // ── Fetch isosurface from server (PyVista) ─────────────────────────────────
  const fetchIsosurface = async (filename: string, field: string, isoValue: number) => {
    setIsosurfaceLoading(true);

    // Remove any existing isosurface overlay actor
    if (isosurfaceActorRef.current && renderWindowRef.current?.renderer) {
      renderWindowRef.current.renderer.removeActor(isosurfaceActorRef.current);
      isosurfaceActorRef.current = null;
    }

    try {
      const resp = await fetch(`/api/simulations/${simulationId}/isosurface`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, field, value: isoValue }),
      });

      if (!resp.ok) {
        console.warn('[VTKViewer] Isosurface endpoint error:', resp.status);
        return;
      }

      const vtkText = await resp.text();
      if (!vtkText || vtkText.trim().length < 50) {
        console.log('[VTKViewer] Isosurface returned empty result');
        return;
      }

      const isoData = parseVtkAscii(vtkText);
      if (!isoData || isoData.getNumberOfPoints() === 0) {
        console.log('[VTKViewer] Isosurface: no contour found at value', isoValue);
        return;
      }

      console.log('[VTKViewer] Isosurface points:', isoData.getNumberOfPoints());

      const isoMapper = vtkMapper.newInstance();
      isoMapper.setInputData(isoData);
      applyVisualization(isoMapper, isoData, activeMode as VisualizationMode);

      const isoActor = vtkActor.newInstance();
      isoActor.setMapper(isoMapper);
      isoActor.getProperty().setLineWidth(3);
      isoActor.getProperty().setLighting(false);

      if (renderWindowRef.current?.renderer) {
        renderWindowRef.current.renderer.addActor(isoActor);
        isosurfaceActorRef.current = isoActor;
        renderWindowRef.current.renderWindow.render();
        console.log('[VTKViewer] Isosurface actor added to scene');
      }
    } catch (err) {
      console.error('[VTKViewer] fetchIsosurface error:', err);
    } finally {
      setIsosurfaceLoading(false);
    }
  };

  // ── Auto-initialize filter values to data range when enabled or field changes
  useEffect(() => {
    if (filterConfig.isosurface.enabled && dataRange[0] !== dataRange[1]) {
      // Always reset to midpoint when the field/dataRange changes while enabled
      const mid = (dataRange[0] + dataRange[1]) / 2;
      setFilterConfig(prev => ({
        ...prev,
        isosurface: { ...prev.isosurface, values: [mid] },
      }));
    }
  }, [filterConfig.isosurface.enabled, dataRange]);

  useEffect(() => {
    if (filterConfig.threshold.enabled && dataRange[0] !== dataRange[1]) {
      // Always reset to full range when the field/dataRange changes while enabled
      setFilterConfig(prev => ({
        ...prev,
        threshold: { ...prev.threshold, range: [dataRange[0], dataRange[1]] },
      }));
    }
  }, [filterConfig.threshold.enabled, dataRange]);

  // ── Isosurface overlay: debounced fetch when enabled/value changes ─────────
  useEffect(() => {
    if (!filterConfig.isosurface.enabled) {
      // Remove overlay actor
      if (isosurfaceActorRef.current && renderWindowRef.current?.renderer) {
        renderWindowRef.current.renderer.removeActor(isosurfaceActorRef.current);
        isosurfaceActorRef.current = null;
        if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
      }
      return;
    }

    if (!currentVtkFilenameRef.current) return;

    const fieldMap: Partial<Record<VisualizationMode, string>> = {
      pressure: 'p',
      velocity: 'U',
      temperature: 'T_degC',
      pmv: 'PMV',
      ppd: 'PPD',
    };
    const field = fieldMap[activeMode as VisualizationMode];
    if (!field) return;

    if (isosurfaceDebounceRef.current) clearTimeout(isosurfaceDebounceRef.current);
    isosurfaceDebounceRef.current = setTimeout(() => {
      fetchIsosurface(
        currentVtkFilenameRef.current,
        field,
        filterConfig.isosurface.values[0],
      );
    }, 400);

    return () => {
      if (isosurfaceDebounceRef.current) clearTimeout(isosurfaceDebounceRef.current);
    };
  }, [filterConfig.isosurface.enabled, filterConfig.isosurface.values, activeMode]);

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
                      
                      {/* Toggle para mostrar edges */}
                      <div className="flex items-center justify-between mt-2">
                        <Label className="text-sm">Show Edges</Label>
                        <Switch
                          checked={showEdges}
                          onCheckedChange={setShowEdges}
                          data-testid="toggle-show-edges"
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
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-600">Value: {filterConfig.isosurface.values[0]?.toFixed(3)}</Label>
                            {isosurfaceLoading && (
                              <span className="text-xs text-blue-500 animate-pulse">Computing…</span>
                            )}
                          </div>
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
                        <div className="space-y-3">
                          {/* X Plane (Red) */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-semibold text-red-600 flex items-center gap-1">
                                <div className="w-3 h-3 bg-red-500 rounded"></div>
                                X Plane
                              </Label>
                              <Switch
                                checked={filterConfig.clip.planesEnabled.x}
                                onCheckedChange={(enabled) => setFilterConfig(prev => ({
                                  ...prev,
                                  clip: { 
                                    ...prev.clip, 
                                    planesEnabled: { ...prev.clip.planesEnabled, x: enabled }
                                  }
                                }))}
                                data-testid="switch-clip-x"
                              />
                            </div>
                            {filterConfig.clip.planesEnabled.x && (
                              <>
                                <Label className="text-xs text-gray-500">
                                  Position: {filterConfig.clip.planePositions.x.toFixed(3)}
                                </Label>
                                <Slider
                                  value={[filterConfig.clip.planePositions.x]}
                                  onValueChange={([x]: number[]) => setFilterConfig(prev => ({
                                    ...prev,
                                    clip: { 
                                      ...prev.clip, 
                                      planePositions: { ...prev.clip.planePositions, x }
                                    }
                                  }))}
                                  min={domainBounds.min[0]}
                                  max={domainBounds.max[0]}
                                  step={(domainBounds.max[0] - domainBounds.min[0]) / 100}
                                  className="w-full"
                                  data-testid="slider-clip-x"
                                />
                              </>
                            )}
                          </div>

                          {/* Y Plane (Green) */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-semibold text-green-600 flex items-center gap-1">
                                <div className="w-3 h-3 bg-green-500 rounded"></div>
                                Y Plane
                              </Label>
                              <Switch
                                checked={filterConfig.clip.planesEnabled.y}
                                onCheckedChange={(enabled) => setFilterConfig(prev => ({
                                  ...prev,
                                  clip: { 
                                    ...prev.clip, 
                                    planesEnabled: { ...prev.clip.planesEnabled, y: enabled }
                                  }
                                }))}
                                data-testid="switch-clip-y"
                              />
                            </div>
                            {filterConfig.clip.planesEnabled.y && (
                              <>
                                <Label className="text-xs text-gray-500">
                                  Position: {filterConfig.clip.planePositions.y.toFixed(3)}
                                </Label>
                                <Slider
                                  value={[filterConfig.clip.planePositions.y]}
                                  onValueChange={([y]: number[]) => setFilterConfig(prev => ({
                                    ...prev,
                                    clip: { 
                                      ...prev.clip, 
                                      planePositions: { ...prev.clip.planePositions, y }
                                    }
                                  }))}
                                  min={domainBounds.min[1]}
                                  max={domainBounds.max[1]}
                                  step={(domainBounds.max[1] - domainBounds.min[1]) / 100}
                                  className="w-full"
                                  data-testid="slider-clip-y"
                                />
                              </>
                            )}
                          </div>

                          {/* Z Plane (Blue) */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-semibold text-blue-600 flex items-center gap-1">
                                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                                Z Plane
                              </Label>
                              <Switch
                                checked={filterConfig.clip.planesEnabled.z}
                                onCheckedChange={(enabled) => setFilterConfig(prev => ({
                                  ...prev,
                                  clip: { 
                                    ...prev.clip, 
                                    planesEnabled: { ...prev.clip.planesEnabled, z: enabled }
                                  }
                                }))}
                                data-testid="switch-clip-z"
                              />
                            </div>
                            {filterConfig.clip.planesEnabled.z && (
                              <>
                                <Label className="text-xs text-gray-500">
                                  Position: {filterConfig.clip.planePositions.z.toFixed(3)}
                                </Label>
                                <Slider
                                  value={[filterConfig.clip.planePositions.z]}
                                  onValueChange={([z]: number[]) => setFilterConfig(prev => ({
                                    ...prev,
                                    clip: { 
                                      ...prev.clip, 
                                      planePositions: { ...prev.clip.planePositions, z }
                                    }
                                  }))}
                                  min={domainBounds.min[2]}
                                  max={domainBounds.max[2]}
                                  step={(domainBounds.max[2] - domainBounds.min[2]) / 100}
                                  className="w-full"
                                  data-testid="slider-clip-z"
                                />
                              </>
                            )}
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