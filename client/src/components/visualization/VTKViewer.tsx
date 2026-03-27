import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, Layers, Eye, Activity, Wind, Zap, Scissors, Target, ArrowUp, Palette, Settings2, ChevronDown } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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
  const [isosurfaceField, setIsosurfaceField] = useState<VisualizationMode>('pressure');
  const [thresholdField, setThresholdField] = useState<VisualizationMode>('pressure');
  const [cutField, setCutField] = useState<VisualizationMode>('pressure');
  const [isosurfaceOpacity, setIsosurfaceOpacity] = useState<number>(1.0);
  const [thresholdOpacity, setThresholdOpacity] = useState<number>(0.9);
  const [cutOpacity, setCutOpacity] = useState<number>(1.0);
  const [dataRange, setDataRange] = useState<[number, number]>([0, 1]);
  // Ref copy of dataRange — lets auto-init effects read range without adding it
  // to their dependency arrays (which would create filterConfig → rebuild → setDataRange → loop).
  const dataRangeRef = useRef<[number, number]>([0, 1]);
  const [selectedColormap, setSelectedColormap] = useState<string>('jet_cfd');
  const [invertColormap, setInvertColormap] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showEdges, setShowEdges] = useState<boolean>(false);
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff'); // Blanco por defecto
  const [showSetup, setShowSetup] = useState<boolean>(false);
  const [gridColor, setGridColor] = useState<string>('#8c8c8c');
  const [edgeColor, setEdgeColor] = useState<string>('#333333');
  const [colormapMin, setColormapMin] = useState<number | null>(null);
  const [colormapMax, setColormapMax] = useState<number | null>(null);
  const [opacity, setOpacity] = useState<number>(1.0); // 1.0 = opaco, 0.0 = transparente
  const [surfaceEnabled, setSurfaceEnabled] = useState<boolean>(true);
  const [isosurfaceLoading, setIsosurfaceLoading] = useState<boolean>(false);
  const [cuttingPlaneLoading, setCuttingPlaneLoading] = useState<boolean>(false);
  const [volumeThresholdLoading, setVolumeThresholdLoading] = useState<boolean>(false);
  const [cutEnabled, setCutEnabled] = useState<boolean>(false);
  const [cutAxis, setCutAxis] = useState<'x' | 'y' | 'z'>('z');
  const [cutPosition, setCutPosition] = useState<number>(1.1);
  const [cutVectorsEnabled, setCutVectorsEnabled] = useState<boolean>(false);
  const [cutVectorScale, setCutVectorScale] = useState<number>(50);
  const [cutVectorDensity, setCutVectorDensity] = useState<number>(0.1);
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
    vectors: { enabled: false, scale: 0.5, density: 0.1 }
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
    vectors: { enabled: false, scale: 0.5, density: 0.1 }
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
  const surfaceActorRef = useRef<any>(null);    // Main surface actor (for visibility toggle)
  const surfaceEnabledRef = useRef<boolean>(true);
  const isosurfaceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentVtkFilenameRef = useRef<string>(''); // Nombre del archivo VTK actual
  // ── Volume cut plane refs ──────────────────────────────────────────────────
  const cutEnabledRef = useRef<boolean>(false);
  const cutVectorsEnabledRef = useRef<boolean>(false);
  const cutVectorScaleRef = useRef<number>(50);
  const cutVectorDensityRef = useRef<number>(0.1);
  // Track whether user has manually set filter values (prevents auto-init from overwriting on re-enable)
  const isosurfaceUserSet = useRef<boolean>(false);
  const thresholdUserSet = useRef<boolean>(false);
  const cuttingPlaneDataRef = useRef<any>(null); // PolyData of the current slice
  const cutPlaneActorRef = useRef<any>(null);    // Actor for the cut plane surface
  const cutVectorActorRef = useRef<any>(null);   // Actor for velocity arrows on cut plane
  const cutDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── Volume threshold refs ──────────────────────────────────────────────────
  const volumeThresholdActorRef = useRef<any>(null);
  const volumeThresholdDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── Per-filter field and opacity refs (mirror state for async callbacks) ───
  const isosurfaceFieldRef = useRef<VisualizationMode>('pressure');
  const thresholdFieldRef = useRef<VisualizationMode>('pressure');
  const cutFieldRef = useRef<VisualizationMode>('pressure');
  const isosurfaceOpacityRef = useRef<number>(1.0);
  const thresholdOpacityRef = useRef<number>(0.9);
  const cutOpacityRef = useRef<number>(1.0);

  const visualizationControls = [
    { id: 'pressure' as const, label: 'Pressure', icon: Layers },
    { id: 'velocity' as const, label: 'Velocity', icon: Wind },
    { id: 'temperature' as const, label: 'Temperature', icon: Activity },
    { id: 'pmv' as const, label: 'PMV', icon: Target },
    { id: 'ppd' as const, label: 'PPD', icon: Zap },
    { id: 'geometry' as const, label: 'Geometry', icon: Eye }
  ];
  const filterFieldControls: { id: VisualizationMode; short: string }[] = [
    { id: 'pressure', short: 'P' },
    { id: 'velocity', short: 'U' },
    { id: 'temperature', short: 'T' },
    { id: 'pmv', short: 'PMV' },
    { id: 'ppd', short: 'PPD' },
    { id: 'geometry', short: 'Geo' },
  ];
  const colormapOptions = [
    { id: 'erdc_blue2red_bw', label: 'Blue→Red' },
    { id: 'jet_cfd', label: 'Jet CFD' },
    { id: 'plasma', label: 'Plasma' },
    { id: 'viridis', label: 'Viridis' },
    { id: 'cool_warm', label: 'Cool-Warm' },
    { id: 'grayscale', label: 'Gray' },
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
        const er = parseInt(edgeColor.slice(1, 3), 16) / 255;
        const eg = parseInt(edgeColor.slice(3, 5), 16) / 255;
        const eb = parseInt(edgeColor.slice(5, 7), 16) / 255;
        actor.getProperty().setEdgeColor(er, eg, eb);
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
      applyVisualization(mapper, cutData, activeMode as VisualizationMode, false);

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
    console.log(`[ARROWS] createAdvancedVectorField called — scale=${scale}, density=${density}, array="${arrayName}"`);

    const pointData = inputData.getPointData();
    const nPtArrays = pointData.getNumberOfArrays();
    const ptArrayNames = Array.from({ length: nPtArrays }, (_, i) => pointData.getArrayByIndex(i)?.getName());
    console.log(`[ARROWS] inputData: ${inputData.getNumberOfPoints()} pts, pointData arrays: [${ptArrayNames.join(', ')}]`);

    const vectorArray = pointData.getArrayByName(arrayName) || pointData.getArray(1);

    if (!vectorArray) {
      console.warn(`[ARROWS] ✗ Array "${arrayName}" not found and no fallback — aborting`);
      return null;
    }
    console.log(`[ARROWS] Found vector array: "${vectorArray.getName()}", nComponents=${vectorArray.getNumberOfComponents()}, nTuples=${vectorArray.getNumberOfTuples()}`);

    if (vectorArray.getNumberOfComponents() < 3) {
      console.warn(`[ARROWS] ✗ Array has ${vectorArray.getNumberOfComponents()} components, need ≥3 — aborting`);
      return null;
    }

    // Sample a few raw velocity values for diagnostics
    const nSample = Math.min(5, vectorArray.getNumberOfTuples());
    for (let i = 0; i < nSample; i++) {
      const t = vectorArray.getTuple(i);
      const mag = Math.sqrt(t[0]*t[0] + t[1]*t[1] + t[2]*t[2]);
      console.log(`[ARROWS]   point[${i}]: U=(${t[0].toFixed(4)}, ${t[1].toFixed(4)}, ${t[2].toFixed(4)}) |U|=${mag.toFixed(4)}`);
    }

    // Pre-compute magnitude for coloring
    const magArray = calculateVectorMagnitude(vectorArray);
    if (!pointData.getArrayByName(magArray.getName())) {
      pointData.addArray(magArray);
    }

    // Subsample points for performance
    const sampledData = subsamplePolyDataForGlyphs(inputData, density);
    console.log(`[ARROWS] Subsampled: ${sampledData.getNumberOfPoints()} arrow positions (step=1/${Math.max(1,Math.round(1/Math.max(0.005,density)))})`);

    // Arrow source — slightly fatter shaft so arrows read well at all zoom levels
    const arrowSource = vtkArrowSource.newInstance();
    arrowSource.setTipLength(0.35);
    arrowSource.setShaftRadius(0.05);
    arrowSource.update();
    const arrowGeometry = arrowSource.getOutputData(); // grab output directly (avoids lazy-pipeline issues)
    console.log(`[ARROWS] arrowGeometry: ${arrowGeometry ? arrowGeometry.getNumberOfPoints() + ' pts' : 'NULL'}`);

    // Glyph mapper — SCALE_BY_CONSTANT: every arrow is exactly `scale` world-units
    // long regardless of local velocity magnitude. Orientation still follows the
    // velocity direction; coloring shows the magnitude. This makes the Scale slider
    // directly control the physical arrow length with no hidden normalization.
    type GlyphMapperExt = ReturnType<typeof vtkGlyph3DMapper.newInstance> & {
      setOrient(enabled: boolean): void;
      setScaling(enabled: boolean): void;
      setScaleModeToScaleByConstant(): void;
    };
    const glyphMapper = vtkGlyph3DMapper.newInstance() as unknown as GlyphMapperExt;
    glyphMapper.setInputData(sampledData, 0);             // point positions + orientation array
    glyphMapper.setInputData(arrowGeometry, 1);           // arrow glyph geometry (direct, no lazy pipeline)
    glyphMapper.setOrient(true);
    glyphMapper.setOrientationModeToDirection();
    glyphMapper.setOrientationArray(vectorArray.getName()); // direction from velocity vector
    glyphMapper.setScaling(true);
    glyphMapper.setScaleModeToScaleByConstant();           // every arrow = scaleFactor world units
    glyphMapper.setScaleFactor(scale);                     // direct: slider value = arrow length (m)

    console.log(`[ARROWS] Glyph mapper configured: orientArray="${vectorArray.getName()}", scaleFactor=${scale}`);

    // Color arrows by velocity magnitude using current colormap
    applyVisualization(glyphMapper, sampledData, 'velocity', false);

    const actor = vtkActor.newInstance();
    actor.setMapper(glyphMapper);
    actor.getProperty().setOpacity(opacity);

    console.log(`[ARROWS] ✓ Actor created — ${sampledData.getNumberOfPoints()} arrows, length=${scale}m each`);

    // Diagnostic: force buildArrays AFTER all setup and inspect the first transformation matrix
    // (logged LAST so the log-tail capture always sees it)
    (glyphMapper as any).buildArrays();
    const matArr: Float32Array | null = (glyphMapper as any).getMatrixArray();
    if (matArr && matArr.length >= 16) {
      const col0 = Math.sqrt(matArr[0]**2 + matArr[1]**2 + matArr[2]**2);
      const col1 = Math.sqrt(matArr[4]**2 + matArr[5]**2 + matArr[6]**2);
      const col2 = Math.sqrt(matArr[8]**2 + matArr[9]**2 + matArr[10]**2);
      console.log(`[ARROWS] matrix[0] col-lengths (scale): X=${col0.toFixed(4)}, Y=${col1.toFixed(4)}, Z=${col2.toFixed(4)}`);
      console.log(`[ARROWS] matrix[0] translation: (${matArr[12].toFixed(3)}, ${matArr[13].toFixed(3)}, ${matArr[14].toFixed(3)})`);
    } else {
      console.warn(`[ARROWS] matrixArray NULL/EMPTY — buildArrays may have failed (len=${matArr?.length ?? 'null'})`);
    }

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
    // Check point data first, then cell data for robustness.
    const pointData = currentData.getPointData();
    const cellData = currentData.getCellData();
    let scalarArrayName = '';
    let scalarInCellData = false;
    const findArrayInBoth = (...names: string[]) => {
      const ptName = names.find(n => pointData.getArrayByName(n));
      if (ptName) return { name: ptName, fromCells: false };
      const cellName = names.find(n => cellData.getArrayByName(n));
      if (cellName) return { name: cellName, fromCells: true };
      return null;
    };
    const firstAvailable = () => {
      if (pointData.getNumberOfArrays() > 0) return { name: pointData.getArray(0).getName(), fromCells: false };
      if (cellData.getNumberOfArrays() > 0) return { name: cellData.getArray(0).getName(), fromCells: true };
      return null;
    };
    switch (activeField) {
      case 'pressure': {
        const f = findArrayInBoth('p', 'p_rgh') || firstAvailable();
        if (f) { scalarArrayName = f.name; scalarInCellData = f.fromCells; }
        break;
      }
      case 'velocity': {
        const f = findArrayInBoth('U_magnitude', 'U_mag', 'U') || firstAvailable();
        if (f) { scalarArrayName = f.name; scalarInCellData = f.fromCells; }
        break;
      }
      case 'temperature': {
        const f = findArrayInBoth('T_degC', 'T') || firstAvailable();
        if (f) { scalarArrayName = f.name; scalarInCellData = f.fromCells; }
        break;
      }
      case 'pmv': {
        const f = findArrayInBoth('PMV');
        if (f) { scalarArrayName = f.name; scalarInCellData = f.fromCells; }
        break;
      }
      case 'ppd': {
        const f = findArrayInBoth('PPD');
        if (f) { scalarArrayName = f.name; scalarInCellData = f.fromCells; }
        break;
      }
      default: {
        const f = firstAvailable();
        if (f) { scalarArrayName = f.name; scalarInCellData = f.fromCells; }
        break;
      }
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
    surfaceActor.setVisibility(surfaceEnabledRef.current);
    surfaceActorRef.current = surfaceActor;
    actors.push(surfaceActor);

    // ── Threshold filter ───────────────────────────────────────────────────────
    if (config.threshold.enabled && scalarArrayName) {
      const [lo, hi] = config.threshold.range;

      // When volume_internal.vtk is active, the PyVista server-side threshold produces a
      // true 3D volumetric result (interior cells in range, surface extracted).
      // The async actor is managed by the fetchVolumeThreshold / useEffect pipeline.
      // Surface stays visible (same as isosurface behaviour); overlay is additive.
      if (currentVtkFilenameRef.current === 'volume_internal.vtk') {
        applyOpacityToActor(surfaceActor);
        applyEdgeVisibilityToActor(surfaceActor);
        console.log('[VTKViewer] volume_internal threshold: deferring to server-side PyVista');
      } else {
        // Fallback: client-side vtkThresholdPoints on the surface mesh
        console.log('[VTKViewer] ThresholdPoints range:', lo, '–', hi, 'array:', scalarArrayName, scalarInCellData ? '(cell)' : '(point)');

        const threshPointData = filteredData.getPointData();
        let effectiveArrayName = scalarArrayName;

        if (scalarInCellData) {
          console.warn('[VTKViewer] Threshold skipped: active scalar is cell-data only.');
          applyOpacityToActor(surfaceActor);
          applyEdgeVisibilityToActor(surfaceActor);
          return actors;
        }

        const baseArr = threshPointData.getArrayByName(effectiveArrayName);
        if (baseArr && baseArr.getNumberOfComponents() > 1) {
          const mag = calculateVectorMagnitude(baseArr);
          if (!threshPointData.getArrayByName(mag.getName())) threshPointData.addArray(mag);
          effectiveArrayName = mag.getName();
        }

        try {
          const threshFilter = vtkThresholdPoints.newInstance();
          threshFilter.setInputData(filteredData);
          threshFilter.setCriterias([
            { arrayName: effectiveArrayName, fieldAssociation: 'PointData', operation: 'Above', value: lo },
            { arrayName: effectiveArrayName, fieldAssociation: 'PointData', operation: 'Below', value: hi },
          ]);
          threshFilter.update();
          const threshData = threshFilter.getOutputData();

          if (threshData && threshData.getNumberOfPoints() > 0) {
            const threshMapper = vtkMapper.newInstance();
            threshMapper.setInputData(threshData);
            applyVisualization(threshMapper, threshData, activeField as VisualizationMode, false);

            const threshActor = vtkActor.newInstance();
            threshActor.setMapper(threshMapper);
            threshActor.getProperty().setPointSize(4);
            threshActor.getProperty().setOpacity(opacity);
            actors.push(threshActor);

            surfaceActor.setVisibility(false);
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
      }
    } else {
      // Normal surface rendering
      applyOpacityToActor(surfaceActor);
      applyEdgeVisibilityToActor(surfaceActor);
    }

    // Note: Isosurface (contour lines) rendered as an overlay via fetchIsosurface / isosurfaceActorRef
    // Note: Cutting plane rendered separately via fetchVolumeCut / cutPlaneActorRef
    // Note: Velocity vectors rendered on the cut plane via cutVectorActorRef

    // Add FloorGrid reference plane at Z=0 if showGrid is enabled
    if (showGrid) {
      // Build a flat XY plane 10% larger than the model's domain footprint
      // Domain: X∈[-3.25, 1.10], Y∈[-2.85, 2.65] → 10% expansion (5% each side)
      // X range 4.35 → +0.435 total → [-3.4675, 1.3175]
      // Y range 5.50 → +0.550 total → [-3.125, 2.925]
      const floorPlane = vtkPlaneSource.newInstance({
        xResolution: 12,
        yResolution: 12,
      });
      floorPlane.setOrigin(-3.4675, -3.125, 0.0);
      floorPlane.setPoint1( 1.3175, -3.125, 0.0);  // along X
      floorPlane.setPoint2(-3.4675,  2.925, 0.0);  // along Y
      floorPlane.update();

      // Parse hex gridColor to VTK RGB (0–1 range)
      const hexToRgb = (hex: string): [number, number, number] => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return [r, g, b];
      };
      const [gr, gg, gb] = hexToRgb(gridColor);

      const gridMapper = vtkMapper.newInstance();
      gridMapper.setInputData(floorPlane.getOutputData());
      gridMapper.setScalarVisibility(false);

      const gridActor = vtkActor.newInstance();
      gridActor.setMapper(gridMapper);
      gridActor.getProperty().setRepresentationToWireframe();
      gridActor.getProperty().setLineWidth(1);
      gridActor.getProperty().setColor(gr, gg, gb);
      gridActor.getProperty().setOpacity(0.6);

      actors.push(gridActor);
      console.log('[VTKViewer] Added FloorGrid plane actor');
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
  const applyVisualization = (mapper: any, dataset: any, mode: VisualizationMode, updateState = true) => {
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
      
      // Show warning to user if data is uniform or invalid (only for primary actors)
      if (updateState) {
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
        // Update UI state for sliders (use safe range) — skip for overlay actors
        setDataRange([safeMin, safeMax]);
      }
      
      // Use custom min/max values if specified, otherwise use normalized safe range
      const effectiveMin = colormapMin ?? safeMin;
      const effectiveMax = colormapMax ?? safeMax;
      
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
      
      // Prefer 3D volume files. latestVolume priority (set by backend):
      // volume_internal → volume_complete → volume → (slice fallback)
      // volume_internal is the primary source; all operations go through server-side PyVista.
      let vtkUrl: string | undefined;
      if (latestVolume) {
        vtkUrl = latestVolume.path;
        const typeLabel: Record<string, string> = {
          volume_internal: '3D internal volume mesh (PyVista)',
          volume_complete: 'OpenFOAM vtkjs volume',
          boundary: 'OpenFOAM boundary patches',
          volume: 'OpenFOAM volume',
        };
        console.log(
          `[VTKViewer] Loading ${typeLabel[latestVolume.type] || latestVolume.type}: ${latestVolume.filename}`
        );
      } else if (files && files.length > 0) {
        // Fallback to first usable file (likely a 2D slice plane).
        // surface_3d.vtk is excluded from the visualization pipeline (Task #25).
        const usableFile = files.find((f: any) => f.filename !== 'surface_3d.vtk') || null;
        if (!usableFile) throw new Error('No VTK files available for this simulation');
        vtkUrl = usableFile.path;
        console.log('[VTKViewer] No 3D volume file found — loading slice:', usableFile.filename);
      } else {
        throw new Error('No VTK files available for this simulation');
      }

      console.log('[VTKViewer] Loading VTK file for simulation:', simulationId, 'URL:', vtkUrl);

      // volume_internal.vtk (exact filename) → server-side PyVista extract_surface() → ASCII POLYDATA
      // with interior CFD field values. Legacy openfoam_*internal*.vtkjs also has type='volume_internal'
      // but is fetched directly as a regular file (different format, different pipeline).
      let vtkText: string;
      if (latestVolume && latestVolume.filename === 'volume_internal.vtk') {
        currentVtkFilenameRef.current = 'volume_internal.vtk';
        console.log('[VTKViewer] volume_internal detected — fetching extracted surface via /volume-surface');
        const surfaceResp = await fetch(`/api/simulations/${simulationId}/volume-surface`);
        if (!surfaceResp.ok) {
          throw new Error(`Volume surface extraction failed: ${surfaceResp.status}`);
        }
        vtkText = await surfaceResp.text();
      } else {
        const vtkFilename = vtkUrl!.split('/').pop() || '';
        currentVtkFilenameRef.current = vtkFilename;
        console.log('[VTKViewer] Tracking VTK filename for isosurface:', vtkFilename);
        const response = await fetch(vtkUrl!);
        if (!response.ok) {
          throw new Error(`File not found: ${response.status}`);
        }
        vtkText = await response.text();
      }

      // Parsear archivo VTK Legacy ASCII con nuestro propio parser
      // (vtkPolyDataReader de vtk.js falla con VTK 5.1 — bug en setData callback sin bind)
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
    
    if (sourceDataRef.current && renderWindowRef.current?.renderer) {
      // Rebuild main pipeline with the new visualization mode
      removeActors(actorsRef.current);
      const newActors = buildPipeline(filterConfig, mode);
      actorsRef.current = newActors;
      addActors(actorsRef.current);
      
      // If a volume cut plane is active, re-apply colours to cut (surface stays visible)
      if (cutEnabledRef.current && cuttingPlaneDataRef.current && cutPlaneActorRef.current) {
        const cutMapper = cutPlaneActorRef.current.getMapper();
        if (cutMapper) applyVisualization(cutMapper, cuttingPlaneDataRef.current, (cutFieldRef.current || mode) as VisualizationMode, false);
        // Ensure cut actors are still in the scene after the rebuild
        if (renderWindowRef.current?.renderer) {
          renderWindowRef.current.renderer.addActor(cutPlaneActorRef.current);
          if (cutVectorActorRef.current) renderWindowRef.current.renderer.addActor(cutVectorActorRef.current);
        }
      }
      
      renderWindowRef.current.renderWindow.render();
    }
  };

  // Keep refs in sync with state so async callbacks always read the latest values
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);
  useEffect(() => { filterConfigRef.current = filterConfig; }, [filterConfig]);
  useEffect(() => { cutEnabledRef.current = cutEnabled; }, [cutEnabled]);
  useEffect(() => { cutVectorsEnabledRef.current = cutVectorsEnabled; }, [cutVectorsEnabled]);
  useEffect(() => { cutVectorScaleRef.current = cutVectorScale; }, [cutVectorScale]);
  useEffect(() => { cutVectorDensityRef.current = cutVectorDensity; }, [cutVectorDensity]);
  useEffect(() => { isosurfaceFieldRef.current = isosurfaceField; }, [isosurfaceField]);
  useEffect(() => { thresholdFieldRef.current = thresholdField; }, [thresholdField]);
  useEffect(() => { cutFieldRef.current = cutField; }, [cutField]);
  useEffect(() => { isosurfaceOpacityRef.current = isosurfaceOpacity; }, [isosurfaceOpacity]);
  useEffect(() => { thresholdOpacityRef.current = thresholdOpacity; }, [thresholdOpacity]);
  useEffect(() => { cutOpacityRef.current = cutOpacity; }, [cutOpacity]);

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
      
      // Build main pipeline (surface + threshold)
      const newActors = buildPipeline(filterConfig, activeMode);
      actorsRef.current = newActors;
      addActors(actorsRef.current);

      // If a volume cut plane is active, re-apply colours to cut (surface stays visible)
      if (cutEnabledRef.current && cuttingPlaneDataRef.current && cutPlaneActorRef.current) {
        const cutMapper = cutPlaneActorRef.current.getMapper();
        if (cutMapper) applyVisualization(cutMapper, cuttingPlaneDataRef.current, cutFieldRef.current, false);
        if (renderWindowRef.current?.renderer) {
          renderWindowRef.current.renderer.addActor(cutPlaneActorRef.current);
          if (cutVectorActorRef.current) renderWindowRef.current.renderer.addActor(cutVectorActorRef.current);
        }
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
  }, [filterConfig, selectedColormap, invertColormap, showGrid, showEdges, backgroundColor, colormapMin, colormapMax, opacity, gridColor, edgeColor]);

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
      applyVisualization(isoMapper, isoData, isosurfaceFieldRef.current, false);

      const isoActor = vtkActor.newInstance();
      isoActor.setMapper(isoMapper);
      isoActor.getProperty().setLineWidth(3);
      isoActor.getProperty().setLighting(false);
      isoActor.getProperty().setOpacity(isosurfaceOpacityRef.current);

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

  // ── Fetch volume cutting plane from server (PyVista slice) ────────────────
  const fetchVolumeCut = async (axis: 'x' | 'y' | 'z', position: number) => {
    setCuttingPlaneLoading(true);

    // Remove stale cut actors before adding fresh ones
    if (cutPlaneActorRef.current && renderWindowRef.current?.renderer) {
      renderWindowRef.current.renderer.removeActor(cutPlaneActorRef.current);
      cutPlaneActorRef.current = null;
    }
    if (cutVectorActorRef.current && renderWindowRef.current?.renderer) {
      renderWindowRef.current.renderer.removeActor(cutVectorActorRef.current);
      cutVectorActorRef.current = null;
    }

    try {
      const resp = await fetch(`/api/simulations/${simulationId}/volume-cut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ axis, position }),
      });

      if (!resp.ok) {
        console.warn('[VTKViewer] volume-cut request failed:', resp.status);
        return;
      }

      const vtkText = await resp.text();
      if (!vtkText || vtkText.trim().length < 50) {
        console.log('[VTKViewer] volume-cut returned empty data');
        return;
      }

      const cutData = parseVtkAscii(vtkText);
      if (!cutData || cutData.getNumberOfPoints() === 0) {
        console.log('[VTKViewer] volume-cut: no geometry at', axis, '=', position);
        return;
      }

      console.log('[VTKViewer] volume-cut:', cutData.getNumberOfPoints(), 'pts at', axis, '=', position);
      cuttingPlaneDataRef.current = cutData;

      // Create and add the cut plane actor
      const cutMapper = vtkMapper.newInstance();
      cutMapper.setInputData(cutData);
      applyVisualization(cutMapper, cutData, cutFieldRef.current, false);

      const cutActor = vtkActor.newInstance();
      cutActor.setMapper(cutMapper);
      cutActor.getProperty().setOpacity(cutOpacityRef.current);
      cutPlaneActorRef.current = cutActor;

      if (renderWindowRef.current?.renderer) {
        renderWindowRef.current.renderer.addActor(cutActor);
      }

      // Add velocity vector glyphs on the cut plane if the toggle is on
      if (cutVectorsEnabledRef.current) {
        const vActors = createAdvancedVectorField(
          cutData, cutVectorScaleRef.current, cutVectorDensityRef.current, 'U'
        );
        if (vActors && vActors.length > 0) {
          cutVectorActorRef.current = vActors[0];
          if (renderWindowRef.current?.renderer) {
            renderWindowRef.current.renderer.addActor(cutVectorActorRef.current);
          }
        }
      }

      if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
    } catch (err) {
      console.error('[VTKViewer] fetchVolumeCut error:', err);
    } finally {
      setCuttingPlaneLoading(false);
    }
  };

  // ── Fetch volumetric threshold from server (PyVista threshold on internalMesh) ──
  const fetchVolumeThreshold = async (field: string, lo: number, hi: number) => {
    setVolumeThresholdLoading(true);

    if (volumeThresholdActorRef.current && renderWindowRef.current?.renderer) {
      renderWindowRef.current.renderer.removeActor(volumeThresholdActorRef.current);
      volumeThresholdActorRef.current = null;
    }

    try {
      const resp = await fetch(`/api/simulations/${simulationId}/volume-threshold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, lo, hi }),
      });

      if (!resp.ok) {
        console.warn('[VTKViewer] volume-threshold request failed:', resp.status);
        return;
      }

      const vtkText = await resp.text();
      if (!vtkText || vtkText.trim().length < 50) {
        console.log('[VTKViewer] volume-threshold returned empty result (no cells in range)');
        return;
      }

      const threshData = parseVtkAscii(vtkText);
      if (!threshData || threshData.getNumberOfPoints() === 0) {
        console.log('[VTKViewer] volume-threshold: no geometry in range', lo, '–', hi);
        return;
      }

      console.log('[VTKViewer] volume-threshold:', threshData.getNumberOfPoints(), 'pts, field:', field, 'range:', lo, '–', hi);

      const threshMapper = vtkMapper.newInstance();
      threshMapper.setInputData(threshData);
      applyVisualization(threshMapper, threshData, thresholdFieldRef.current, false);

      const threshActor = vtkActor.newInstance();
      threshActor.setMapper(threshMapper);
      threshActor.getProperty().setOpacity(thresholdOpacityRef.current);
      volumeThresholdActorRef.current = threshActor;

      if (renderWindowRef.current?.renderer) {
        renderWindowRef.current.renderer.addActor(threshActor);
        renderWindowRef.current.renderWindow.render();
        console.log('[VTKViewer] Volume threshold actor added to scene');
      }
    } catch (err) {
      console.error('[VTKViewer] fetchVolumeThreshold error:', err);
    } finally {
      setVolumeThresholdLoading(false);
    }
  };

  // Keep dataRangeRef in sync so auto-init effects can read it without looping
  useEffect(() => {
    dataRangeRef.current = dataRange;
  }, [dataRange]);

  // ── Auto-initialize filter values when first enabled or when active field changes ──
  // IMPORTANT: deps list intentionally excludes `dataRange` to avoid the feedback loop:
  //   filterConfig → rebuild → applyVisualization → setDataRange → this effect → setFilterConfig → loop
  // Instead we read dataRange via dataRangeRef (always current but not a dep).
  // Skip auto-init if user has manually set the value (isosurfaceUserSet / thresholdUserSet),
  // UNLESS this effect fired because the field changed (reset userSet to false first).
  useEffect(() => {
    if (!filterConfig.isosurface.enabled) return;
    // Field change: clear userSet so auto-init runs for the new field's range
    isosurfaceUserSet.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isosurfaceField]);

  useEffect(() => {
    if (!filterConfig.isosurface.enabled) return;
    if (isosurfaceUserSet.current) return; // user has custom value — preserve it
    const [lo, hi] = dataRangeRef.current;
    if (lo === hi) return;
    const mid = (lo + hi) / 2;
    setFilterConfig(prev => {
      // Guard: skip no-op write to avoid unnecessary re-renders
      if (Math.abs(prev.isosurface.values[0] - mid) < Math.abs(hi - lo) * 1e-6) return prev;
      return { ...prev, isosurface: { ...prev.isosurface, values: [mid] } };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterConfig.isosurface.enabled, isosurfaceField]);

  useEffect(() => {
    if (!filterConfig.threshold.enabled) return;
    // Field change: clear userSet so auto-init runs for the new field's range
    thresholdUserSet.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thresholdField]);

  useEffect(() => {
    if (!filterConfig.threshold.enabled) return;
    if (thresholdUserSet.current) return; // user has custom range — preserve it
    const [lo, hi] = dataRangeRef.current;
    if (lo === hi) return;
    setFilterConfig(prev => {
      // Guard: skip no-op write to avoid unnecessary re-renders
      if (prev.threshold.range[0] === lo && prev.threshold.range[1] === hi) return prev;
      return { ...prev, threshold: { ...prev.threshold, range: [lo, hi] } };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterConfig.threshold.enabled, thresholdField]);

  // ── Server-side volumetric threshold (only when volume_internal.vtk is active) ──
  useEffect(() => {
    if (currentVtkFilenameRef.current !== 'volume_internal.vtk') return;

    if (!filterConfig.threshold.enabled) {
      // Remove threshold overlay and restore surface opacity
      if (volumeThresholdActorRef.current && renderWindowRef.current?.renderer) {
        renderWindowRef.current.renderer.removeActor(volumeThresholdActorRef.current);
        volumeThresholdActorRef.current = null;
      }
      actorsRef.current.forEach(a => {
        if (a?.getProperty) a.getProperty().setOpacity(opacity);
        if (a?.getMapper) a.getMapper().setScalarVisibility(true);
      });
      if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
      return;
    }

    // 'geometry' means no scalar threshold — remove overlay and restore surface
    if (thresholdField === 'geometry') {
      if (volumeThresholdActorRef.current && renderWindowRef.current?.renderer) {
        renderWindowRef.current.renderer.removeActor(volumeThresholdActorRef.current);
        volumeThresholdActorRef.current = null;
      }
      actorsRef.current.forEach(a => {
        if (a?.getProperty) a.getProperty().setOpacity(opacity);
        if (a?.getMapper) a.getMapper().setScalarVisibility(true);
      });
      if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
      return;
    }

    // Resolve actual field name from threshold field and loaded dataset
    const resolveField = (): string | null => {
      const src = sourceDataRef.current;
      if (!src) return null;
      const pd = src.getPointData();
      const cd = src.getCellData();
      const findFirst = (...names: string[]) =>
        names.find(n => pd.getArrayByName(n) || cd.getArrayByName(n)) ?? null;
      switch (thresholdField) {
        case 'pressure':    return findFirst('p', 'p_rgh');
        case 'velocity':    return findFirst('U', 'U_magnitude', 'U_mag');
        case 'temperature': return findFirst('T_degC', 'T');
        case 'pmv':         return findFirst('PMV');
        case 'ppd':         return findFirst('PPD');
        default:            return null;
      }
    };
    const field = resolveField();
    if (!field) return;

    const [lo, hi] = filterConfig.threshold.range;
    if (lo === hi) return;

    if (volumeThresholdDebounceRef.current) clearTimeout(volumeThresholdDebounceRef.current);
    volumeThresholdDebounceRef.current = setTimeout(() => {
      fetchVolumeThreshold(field, lo, hi);
    }, 500);

    return () => {
      if (volumeThresholdDebounceRef.current) clearTimeout(volumeThresholdDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterConfig.threshold.enabled, filterConfig.threshold.range, thresholdField]);

  // ── Sync surfaceEnabled to ref ────────────────────────────────────────────
  useEffect(() => { surfaceEnabledRef.current = surfaceEnabled; }, [surfaceEnabled]);

  // ── Toggle surface actor visibility live ──────────────────────────────────
  useEffect(() => {
    if (surfaceActorRef.current) {
      surfaceActorRef.current.setVisibility(surfaceEnabled);
      if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
    }
  }, [surfaceEnabled]);

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

    // 'geometry' means no scalar coloring — remove any existing overlay and stop
    if (isosurfaceField === 'geometry') {
      if (isosurfaceActorRef.current && renderWindowRef.current?.renderer) {
        renderWindowRef.current.renderer.removeActor(isosurfaceActorRef.current);
        isosurfaceActorRef.current = null;
        if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
      }
      return;
    }

    // Resolve the actual field name from the loaded dataset so we handle all
    // variants (p vs p_rgh, T_degC vs T, etc.) rather than hard-coding one name.
    const resolveFieldName = (): string | null => {
      const src = sourceDataRef.current;
      if (!src) return null;
      const pd = src.getPointData();
      const cd = src.getCellData();
      const findFirst = (...names: string[]) =>
        names.find(n => pd.getArrayByName(n) || cd.getArrayByName(n)) ?? null;
      switch (isosurfaceField) {
        case 'pressure':    return findFirst('p', 'p_rgh');
        case 'velocity':    return findFirst('U', 'U_magnitude', 'U_mag');
        case 'temperature': return findFirst('T_degC', 'T');
        case 'pmv':         return findFirst('PMV');
        case 'ppd':         return findFirst('PPD');
        default:            return null;
      }
    };
    const field = resolveFieldName();
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
  }, [filterConfig.isosurface.enabled, filterConfig.isosurface.values, isosurfaceField]);

  // ── Volume cut plane: debounced fetch when enabled/axis/position changes ───
  useEffect(() => {
    if (!cutEnabled) {
      // Remove cut plane actors and restore main surface
      if (cutPlaneActorRef.current && renderWindowRef.current?.renderer) {
        renderWindowRef.current.renderer.removeActor(cutPlaneActorRef.current);
        cutPlaneActorRef.current = null;
      }
      if (cutVectorActorRef.current && renderWindowRef.current?.renderer) {
        renderWindowRef.current.renderer.removeActor(cutVectorActorRef.current);
        cutVectorActorRef.current = null;
      }
      cuttingPlaneDataRef.current = null;
      if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
      return;
    }

    if (cutDebounceRef.current) clearTimeout(cutDebounceRef.current);
    cutDebounceRef.current = setTimeout(() => {
      fetchVolumeCut(cutAxis, cutPosition);
    }, 400);

    return () => {
      if (cutDebounceRef.current) clearTimeout(cutDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutEnabled, cutAxis, cutPosition]);

  // ── Cut plane vectors: rebuild when toggle/scale/density changes ───────────
  useEffect(() => {
    console.log(`[ARROWS] rebuild effect fired — cutEnabled=${cutEnabled}, hasData=${!!cuttingPlaneDataRef.current}, cutVectorsEnabled=${cutVectorsEnabled}, scale=${cutVectorScale}, density=${cutVectorDensity}`);
    if (!cutEnabled) { console.log('[ARROWS] skip: cut disabled'); return; }
    if (!cuttingPlaneDataRef.current) { console.log('[ARROWS] skip: no cut data in ref'); return; }

    // Remove existing vector actor
    if (cutVectorActorRef.current && renderWindowRef.current?.renderer) {
      renderWindowRef.current.renderer.removeActor(cutVectorActorRef.current);
      cutVectorActorRef.current = null;
      console.log('[ARROWS] removed old actor');
    }

    if (!cutVectorsEnabled) {
      if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
      console.log('[ARROWS] vectors toggled off — done');
      return;
    }

    // Add fresh velocity arrows on the current cut data
    console.log(`[ARROWS] calling createAdvancedVectorField with scale=${cutVectorScale}`);
    const vActors = createAdvancedVectorField(
      cuttingPlaneDataRef.current, cutVectorScale, cutVectorDensity, 'U'
    );
    if (vActors && vActors.length > 0) {
      cutVectorActorRef.current = vActors[0];
      if (renderWindowRef.current?.renderer) {
        renderWindowRef.current.renderer.addActor(cutVectorActorRef.current);
        console.log('[ARROWS] ✓ new actor added to renderer');
      }
    } else {
      console.warn('[ARROWS] ✗ createAdvancedVectorField returned null/empty');
    }
    if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutVectorsEnabled, cutVectorScale, cutVectorDensity, cutEnabled]);

  // ── Recolor cut plane when its independent field changes (no re-fetch) ─────
  useEffect(() => {
    if (!cutEnabled || !cutPlaneActorRef.current || !cuttingPlaneDataRef.current) return;
    const cutMapper = cutPlaneActorRef.current.getMapper();
    if (cutMapper) {
      applyVisualization(cutMapper, cuttingPlaneDataRef.current, cutField, false);
      if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
    }
  }, [cutField]);

  // ── Per-filter opacity live-update effects ─────────────────────────────────
  useEffect(() => {
    if (!isosurfaceActorRef.current) return;
    isosurfaceActorRef.current.getProperty().setOpacity(isosurfaceOpacity);
    if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
  }, [isosurfaceOpacity]);

  useEffect(() => {
    if (!volumeThresholdActorRef.current) return;
    volumeThresholdActorRef.current.getProperty().setOpacity(thresholdOpacity);
    if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
  }, [thresholdOpacity]);

  useEffect(() => {
    if (!cutPlaneActorRef.current) return;
    cutPlaneActorRef.current.getProperty().setOpacity(cutOpacity);
    if (renderWindowRef.current?.renderWindow) renderWindowRef.current.renderWindow.render();
  }, [cutOpacity]);

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
            <div className="w-72 border-r border-slate-200 bg-white overflow-y-auto max-h-[600px] flex flex-col">

                {/* Data warning badge */}
                {dataWarning && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                    <span className="text-xs text-amber-800">{dataWarning}</span>
                  </div>
                )}
                

                {/* ── LAYER: SURFACE ───────────────────────────────────────── */}
                <div className="border-b border-slate-100">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50/60">
                    <div className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-semibold text-slate-700">Surface</span>
                    </div>
                    <Switch
                      checked={surfaceEnabled}
                      onCheckedChange={setSurfaceEnabled}
                      data-testid="switch-surface-enable"
                    />
                  </div>
                  {surfaceEnabled && (
                    <div className="px-4 pt-2 pb-3 space-y-2.5">
                      <div className="flex flex-wrap gap-1">
                        {visualizationControls.map((c) => (
                          <Button
                            key={c.id}
                            variant={activeMode === c.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleModeChange(c.id)}
                            className="text-[10px] h-6 px-1.5 gap-0.5 font-normal"
                            data-testid={`button-visualization-${c.id}`}
                          >
                            <c.icon className="h-2.5 w-2.5" />
                            {c.label}
                          </Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 w-12 shrink-0">Opacity</span>
                        <Slider
                          value={[opacity]}
                          onValueChange={(value: number[]) => setOpacity(value[0])}
                          min={0} max={1} step={0.01}
                          className="flex-1"
                          data-testid="slider-transparency"
                        />
                        <span className="text-[11px] text-slate-600 w-8 text-right">{Math.round(opacity * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── LAYER: CUTTING PLANE ─────────────────────────────────── */}
                <div className="border-b border-slate-100">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-xs font-semibold text-slate-700">Cutting Plane</span>
                      {cuttingPlaneLoading && <span className="text-[10px] text-blue-500 animate-pulse">Slicing…</span>}
                    </div>
                    <Switch
                      checked={cutEnabled}
                      onCheckedChange={(v) => { setCutEnabled(v); if (v) setCutField(activeMode); }}
                      data-testid="switch-cut-enable"
                    />
                  </div>
                  {cutEnabled && (
                    <div className="px-4 pb-3 space-y-2.5">
                      <div className="flex flex-wrap gap-1">
                        {filterFieldControls.map(c => (
                          <Button
                            key={c.id}
                            variant={cutField === c.id ? 'default' : 'outline'}
                            size="sm"
                            className="text-[10px] h-6 px-2 font-normal"
                            onClick={() => setCutField(c.id)}
                          >
                            {c.short}
                          </Button>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-slate-500">Axis</span>
                        <div className="flex gap-1">
                          {(['x', 'y', 'z'] as const).map(ax => (
                            <Button
                              key={ax}
                              variant={cutAxis === ax ? 'default' : 'outline'}
                              size="sm"
                              className="flex-1 text-xs h-7"
                              onClick={() => {
                                setCutAxis(ax);
                                const mid = ax === 'x'
                                  ? (domainBounds.min[0] + domainBounds.max[0]) / 2
                                  : ax === 'y'
                                  ? (domainBounds.min[1] + domainBounds.max[1]) / 2
                                  : 1.1;
                                setCutPosition(parseFloat(mid.toFixed(2)));
                              }}
                              data-testid={`button-cut-axis-${ax}`}
                            >
                              {ax.toUpperCase()}
                            </Button>
                          ))}
                        </div>
                      </div>
                      {cutAxis === 'z' && (
                        <div className="grid grid-cols-2 gap-1">
                          {[
                            { label: 'Ankle 0.1m', value: 0.1 },
                            { label: 'Seated 0.6m', value: 0.6 },
                            { label: 'Standing 1.1m', value: 1.1 },
                            { label: 'Head 1.7m', value: 1.7 },
                          ].map(preset => (
                            <Button
                              key={preset.value}
                              variant={Math.abs(cutPosition - preset.value) < 0.01 ? 'default' : 'outline'}
                              size="sm"
                              className="text-[10px] h-7 px-1 font-normal"
                              onClick={() => setCutPosition(preset.value)}
                              data-testid={`button-cut-z-${preset.value}`}
                            >
                              {preset.label}
                            </Button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 w-12 shrink-0">
                          {cutAxis.toUpperCase()} {cutPosition.toFixed(2)}m
                        </span>
                        <Slider
                          value={[cutPosition]}
                          onValueChange={([v]: number[]) => setCutPosition(parseFloat(v.toFixed(3)))}
                          min={cutAxis === 'x' ? domainBounds.min[0] : cutAxis === 'y' ? domainBounds.min[1] : domainBounds.min[2]}
                          max={cutAxis === 'x' ? domainBounds.max[0] : cutAxis === 'y' ? domainBounds.max[1] : domainBounds.max[2]}
                          step={0.05}
                          className="flex-1"
                          data-testid="slider-cut-position"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <Label className="text-xs text-slate-600 flex items-center gap-1 cursor-pointer">
                          <ArrowUp className="h-3 w-3" />
                          Velocity Vectors
                        </Label>
                        <Switch checked={cutVectorsEnabled} onCheckedChange={setCutVectorsEnabled} data-testid="switch-cut-vectors" />
                      </div>
                      {cutVectorsEnabled && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500 w-14 shrink-0">Scale {cutVectorScale % 1 === 0 ? cutVectorScale.toFixed(0) : cutVectorScale.toFixed(1)}</span>
                            <Slider value={[cutVectorScale]} onValueChange={([v]: number[]) => setCutVectorScale(v)} min={0.1} max={50} step={0.5} className="flex-1" data-testid="slider-cut-vector-scale" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500 w-14 shrink-0">Density {cutVectorDensity.toFixed(2)}</span>
                            <Slider value={[cutVectorDensity]} onValueChange={([v]: number[]) => setCutVectorDensity(v)} min={0.01} max={0.5} step={0.01} className="flex-1" data-testid="slider-cut-vector-density" />
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500 w-12 shrink-0">Opacity</span>
                        <Slider value={[cutOpacity]} onValueChange={([v]: number[]) => setCutOpacity(v)} min={0} max={1} step={0.01} className="flex-1" />
                        <span className="text-[11px] text-slate-600 w-8 text-right">{Math.round(cutOpacity * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── LAYER: ISOSURFACE ────────────────────────────────────── */}
                <div className="border-b border-slate-100">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Target className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-xs font-semibold text-slate-700">Isosurface</span>
                      {isosurfaceLoading && <span className="text-[10px] text-blue-500 animate-pulse">Computing…</span>}
                    </div>
                    <Switch
                      checked={filterConfig.isosurface.enabled}
                      onCheckedChange={(enabled) => {
                        if (enabled) setIsosurfaceField(activeMode);
                        setFilterConfig(prev => ({ ...prev, isosurface: { ...prev.isosurface, enabled } }));
                      }}
                      data-testid="switch-isosurface"
                    />
                  </div>
                  {filterConfig.isosurface.enabled && (
                    <div className="px-4 pb-3 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {filterFieldControls.map(c => (
                          <Button
                            key={c.id}
                            variant={isosurfaceField === c.id ? 'default' : 'outline'}
                            size="sm"
                            className="text-[10px] h-6 px-2 font-normal"
                            onClick={() => setIsosurfaceField(c.id)}
                          >
                            {c.short}
                          </Button>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-6 px-2 font-normal ml-auto text-slate-400 border-slate-200 hover:text-slate-600"
                          onClick={() => {
                            const [lo, hi] = dataRangeRef.current;
                            const mid = (lo + hi) / 2;
                            isosurfaceUserSet.current = false;
                            setFilterConfig(prev => ({ ...prev, isosurface: { ...prev.isosurface, values: [mid] } }));
                          }}
                        >
                          Default
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 w-12 shrink-0">
                          Value {filterConfig.isosurface.values[0]?.toFixed(3)}
                        </span>
                        <Slider
                          value={filterConfig.isosurface.values}
                          onValueChange={(values: number[]) => {
                            isosurfaceUserSet.current = true;
                            setFilterConfig(prev => ({ ...prev, isosurface: { ...prev.isosurface, values } }));
                          }}
                          min={dataRange[0]}
                          max={dataRange[1]}
                          step={(dataRange[1] - dataRange[0]) / 100}
                          className="flex-1"
                          data-testid="slider-isosurface"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500 w-12 shrink-0">Opacity</span>
                        <Slider value={[isosurfaceOpacity]} onValueChange={([v]: number[]) => setIsosurfaceOpacity(v)} min={0} max={1} step={0.01} className="flex-1" />
                        <span className="text-[11px] text-slate-600 w-8 text-right">{Math.round(isosurfaceOpacity * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── LAYER: THRESHOLD ─────────────────────────────────────── */}
                <div className="border-b border-slate-100">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Scissors className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-xs font-semibold text-slate-700">Threshold</span>
                      {volumeThresholdLoading && <span className="text-[10px] text-blue-500 animate-pulse">Computing…</span>}
                    </div>
                    <Switch
                      checked={filterConfig.threshold.enabled}
                      onCheckedChange={(enabled) => {
                        if (enabled) setThresholdField(activeMode);
                        setFilterConfig(prev => ({ ...prev, threshold: { ...prev.threshold, enabled } }));
                      }}
                      data-testid="switch-threshold"
                    />
                  </div>
                  {filterConfig.threshold.enabled && (
                    <div className="px-4 pb-3 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {filterFieldControls.map(c => (
                          <Button
                            key={c.id}
                            variant={thresholdField === c.id ? 'default' : 'outline'}
                            size="sm"
                            className="text-[10px] h-6 px-2 font-normal"
                            onClick={() => setThresholdField(c.id)}
                          >
                            {c.short}
                          </Button>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-6 px-2 font-normal ml-auto text-slate-400 border-slate-200 hover:text-slate-600"
                          onClick={() => {
                            const [lo, hi] = dataRangeRef.current;
                            thresholdUserSet.current = false;
                            setFilterConfig(prev => ({ ...prev, threshold: { ...prev.threshold, range: [lo, hi] } }));
                          }}
                        >
                          Default
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-slate-500">
                          Range: {filterConfig.threshold.range[0]?.toFixed(3)} – {filterConfig.threshold.range[1]?.toFixed(3)}
                        </span>
                        <Slider
                          value={filterConfig.threshold.range}
                          onValueChange={(range: number[]) => {
                            thresholdUserSet.current = true;
                            setFilterConfig(prev => ({ ...prev, threshold: { ...prev.threshold, range: range as [number, number] } }));
                          }}
                          min={dataRange[0]}
                          max={dataRange[1]}
                          step={(dataRange[1] - dataRange[0]) / 100}
                          className="w-full"
                          data-testid="slider-threshold"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500 w-12 shrink-0">Opacity</span>
                        <Slider value={[thresholdOpacity]} onValueChange={([v]: number[]) => setThresholdOpacity(v)} min={0} max={1} step={0.01} className="flex-1" />
                        <span className="text-[11px] text-slate-600 w-8 text-right">{Math.round(thresholdOpacity * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── SETUP ────────────────────────────────────────────────── */}
                <div className="border-b border-slate-100">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    onClick={() => setShowSetup(v => !v)}
                    data-testid="button-setup-expand"
                  >
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-xs font-semibold text-slate-700">Setup</span>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${showSetup ? 'rotate-180' : ''}`} />
                  </button>
                  {showSetup && (
                    <div className="px-4 pb-3 pt-1 space-y-3">
                      {/* Colormap */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Colormap</p>
                        <div className="grid grid-cols-3 gap-1">
                          {colormapOptions.map(c => (
                            <Button
                              key={c.id}
                              variant={selectedColormap === c.id ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setSelectedColormap(c.id)}
                              className="text-[10px] h-6 px-1.5 font-normal"
                              data-testid={`button-colormap-${c.id}`}
                            >
                              {c.label}
                            </Button>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[11px] text-slate-600">Invert scale</span>
                          <Switch checked={invertColormap} onCheckedChange={setInvertColormap} data-testid="toggle-colormap-invert" />
                        </div>
                        <div className="mt-2">
                          <p className="text-[11px] text-slate-500 mb-1">
                            Range <span className="font-normal text-slate-400">(auto: {dataRange[0].toFixed(2)} – {dataRange[1].toFixed(2)})</span>
                          </p>
                          <div className="flex gap-1 items-center">
                            <Input
                              type="number"
                              placeholder="Min"
                              value={colormapMin ?? ''}
                              onChange={(e) => setColormapMin(e.target.value ? parseFloat(e.target.value) : null)}
                              className="flex-1 h-7 text-[11px] px-2"
                              step="any"
                              data-testid="input-colormap-min"
                            />
                            <Input
                              type="number"
                              placeholder="Max"
                              value={colormapMax ?? ''}
                              onChange={(e) => setColormapMax(e.target.value ? parseFloat(e.target.value) : null)}
                              className="flex-1 h-7 text-[11px] px-2"
                              step="any"
                              data-testid="input-colormap-max"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setColormapMin(null); setColormapMax(null); }}
                              className="h-7 px-2 text-[11px] shrink-0"
                              data-testid="button-reset-colormap-range"
                              title="Reset to automatic range"
                            >
                              Auto
                            </Button>
                          </div>
                        </div>
                      </div>
                      {/* Background color */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Background</p>
                        <div className="flex items-center gap-2">
                          {[
                            { color: '#ffffff', label: 'White' },
                            { color: '#1a1a2e', label: 'Dark Blue' },
                            { color: '#000000', label: 'Black' },
                            { color: '#f5f5f5', label: 'Light Gray' },
                          ].map(bg => (
                            <button
                              key={bg.color}
                              className={`w-7 h-7 rounded-full border-2 transition-all ${backgroundColor === bg.color ? 'border-blue-500 scale-110' : 'border-slate-300'}`}
                              style={{ backgroundColor: bg.color }}
                              onClick={() => setBackgroundColor(bg.color)}
                              data-testid={`button-bg-${bg.label.toLowerCase().replace(' ', '-')}`}
                              title={bg.label}
                            />
                          ))}
                        </div>
                      </div>
                      {/* FloorGrid */}
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-slate-700 font-medium">FloorGrid</span>
                        <Switch checked={showGrid} onCheckedChange={setShowGrid} data-testid="toggle-show-grid" />
                      </div>
                      {showGrid && (
                        <div className="pl-0">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Grid Color</p>
                          <div className="flex items-center gap-2">
                            {[
                              { color: '#8c8c8c', label: 'Gray' },
                              { color: '#ffffff', label: 'White' },
                              { color: '#222222', label: 'Dark' },
                              { color: '#4a90d9', label: 'Blue' },
                              { color: '#e8c17a', label: 'Warm' },
                            ].map(gc => (
                              <button
                                key={gc.color}
                                className={`w-6 h-6 rounded-full border-2 transition-all ${gridColor === gc.color ? 'border-blue-500 scale-110' : 'border-slate-300'}`}
                                style={{ backgroundColor: gc.color }}
                                onClick={() => setGridColor(gc.color)}
                                title={gc.label}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {/* CellEdges */}
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-slate-700 font-medium">CellEdges</span>
                        <Switch checked={showEdges} onCheckedChange={setShowEdges} data-testid="toggle-show-edges" />
                      </div>
                      {showEdges && (
                        <div className="pl-0">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Edges Color</p>
                          <div className="flex items-center gap-2">
                            {[
                              { color: '#333333', label: 'Dark' },
                              { color: '#8c8c8c', label: 'Gray' },
                              { color: '#ffffff', label: 'White' },
                              { color: '#cc3333', label: 'Red' },
                              { color: '#4a90d9', label: 'Blue' },
                            ].map(ec => (
                              <button
                                key={ec.color}
                                className={`w-6 h-6 rounded-full border-2 transition-all ${edgeColor === ec.color ? 'border-blue-500 scale-110' : 'border-slate-300'}`}
                                style={{ backgroundColor: ec.color }}
                                onClick={() => setEdgeColor(ec.color)}
                                title={ec.label}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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