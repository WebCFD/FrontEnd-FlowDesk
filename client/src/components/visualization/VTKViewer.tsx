import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Thermometer, Wind, Leaf, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LucideIcon } from 'lucide-react';

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
// @ts-ignore - no bundled type declarations for legacy PolyDataReader
import vtkPolyDataReader from '@kitware/vtk.js/IO/Legacy/PolyDataReader';
// @ts-ignore - no bundled type declarations for XML PolyDataReader
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';

interface VTKViewerProps {
  simulationId: number;
  className?: string;
}

type Category = 'comfort' | 'flow' | 'ventilation';
type HeightName = 'ankle' | 'seated' | 'standing' | 'head';
type FieldName = 'PMV' | 'PPD' | 'T' | 'U' | 'CO2';

interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  heights: HeightName[];
  fields: FieldName[];
}

interface HeightConfig {
  label: string;
  z: number;
}

interface FieldConfig {
  label: string;
  unit: string;
  isVector?: boolean;
  kelvinOffset?: boolean;
  sentinel?: number;
}

interface ScalarResult {
  array: Float32Array;
  min: number;
  max: number;
}

interface VtkContext {
  rw: ReturnType<typeof vtkRenderWindow.newInstance>;
  glRW: ReturnType<typeof vtkOpenGLRenderWindow.newInstance>;
  renderer: ReturnType<typeof vtkRenderer.newInstance>;
  interactor: ReturnType<typeof vtkRenderWindowInteractor.newInstance>;
}

const CATEGORIES: Record<Category, CategoryConfig> = {
  comfort: {
    label: 'Thermal Comfort',
    icon: Thermometer,
    heights: ['seated', 'standing', 'head'],
    fields: ['PMV', 'PPD'],
  },
  flow: {
    label: 'Airflow',
    icon: Wind,
    heights: ['ankle', 'seated', 'standing', 'head'],
    fields: ['T', 'U'],
  },
  ventilation: {
    label: 'Ventilation',
    icon: Leaf,
    heights: ['seated', 'standing', 'head'],
    fields: ['CO2'],
  },
};

const HEIGHT_CONFIG: Record<HeightName, HeightConfig> = {
  ankle:    { label: 'Ankle',    z: 0.1 },
  seated:   { label: 'Seated',   z: 0.6 },
  standing: { label: 'Standing', z: 1.1 },
  head:     { label: 'Head',     z: 1.7 },
};

const FIELD_CONFIG: Record<FieldName, FieldConfig> = {
  PMV: { label: 'PMV Index',    unit: '',     sentinel: -100 },
  PPD: { label: 'PPD',          unit: '%' },
  T:   { label: 'Temperature',  unit: '°C',   kelvinOffset: true },
  U:   { label: 'Velocity',     unit: 'm/s',  isVector: true },
  CO2: { label: 'CO2 Level',    unit: '' },
};

function buildColormap(
  field: FieldName,
  lut: ReturnType<typeof vtkColorTransferFunction.newInstance>,
  minVal: number,
  maxVal: number
): void {
  lut.removeAllPoints();
  const mid = (minVal + maxVal) / 2;
  if (field === 'PMV' || field === 'PPD') {
    lut.addRGBPoint(minVal, 0.23, 0.30, 0.75);
    lut.addRGBPoint(mid,    0.87, 0.87, 0.87);
    lut.addRGBPoint(maxVal, 0.71, 0.12, 0.15);
  } else {
    const colors: [number, number, number][] = [
      [0, 0, 0.5], [0, 0, 1], [0, 1, 1],
      [0, 1, 0], [1, 1, 0], [1, 0, 0], [0.5, 0, 0],
    ];
    colors.forEach(([r, g, b], i) => {
      const t = minVal + (i / (colors.length - 1)) * (maxVal - minVal);
      lut.addRGBPoint(t, r, g, b);
    });
  }
  lut.setMappingRange(minVal, maxVal);
  lut.updateRange();
}

function getScalarArray(polyData: ReturnType<typeof vtkPolyDataReader.newInstance>, field: FieldName): ScalarResult | null {
  const pointData = polyData.getPointData();

  if (FIELD_CONFIG[field].isVector) {
    const raw = pointData.getArrayByName('U');
    if (!raw) return null;
    const data: Float32Array = raw.getData();
    const n: number = raw.getNumberOfTuples();
    const mag = new Float32Array(n);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < n; i++) {
      const vx = data[i * 3], vy = data[i * 3 + 1], vz = data[i * 3 + 2];
      mag[i] = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (mag[i] < mn) mn = mag[i];
      if (mag[i] > mx) mx = mag[i];
    }
    return { array: mag, min: mn, max: mx };
  }

  if (FIELD_CONFIG[field].kelvinOffset) {
    const raw = pointData.getArrayByName('T');
    if (!raw) return null;
    const data: Float32Array = raw.getData();
    const celsius = new Float32Array(data.length);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < data.length; i++) {
      celsius[i] = data[i] - 273.15;
      if (celsius[i] < mn) mn = celsius[i];
      if (celsius[i] > mx) mx = celsius[i];
    }
    return { array: celsius, min: mn, max: mx };
  }

  const raw = pointData.getArrayByName(field);
  if (!raw) return null;
  const data: Float32Array = raw.getData();
  const sentinel = FIELD_CONFIG[field].sentinel;
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (sentinel !== undefined && data[i] < sentinel) continue;
    if (data[i] < mn) mn = data[i];
    if (data[i] > mx) mx = data[i];
  }
  if (!isFinite(mn) || !isFinite(mx)) return null;
  return { array: data, min: mn, max: mx };
}

async function parsePolyData(url: string, filename: string) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Plane not available: ${filename}`);

  if (filename.endsWith('.vtp')) {
    const buffer = await resp.arrayBuffer();
    const reader = vtkXMLPolyDataReader.newInstance();
    reader.parseAsArrayBuffer(buffer);
    return reader.getOutputData(0);
  } else {
    const text = await resp.text();
    const reader = vtkPolyDataReader.newInstance();
    reader.parseAsText(text);
    return reader.getOutputData(0);
  }
}

function ColormapBar({ field, min, max }: { field: FieldName; min: number; max: number }) {
  const unit = FIELD_CONFIG[field].unit;
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
  const isCoolwarm = field === 'PMV' || field === 'PPD';
  const gradient = isCoolwarm
    ? 'linear-gradient(to top, #3b4fbf, #dddddd, #b61e26)'
    : 'linear-gradient(to top, #00008B, #0000FF, #00FFFF, #00FF00, #FFFF00, #FF0000, #800000)';

  return (
    <div className="absolute right-3 top-3 flex flex-col items-center gap-1 select-none">
      <span className="text-xs font-semibold text-white drop-shadow bg-black/40 px-1 rounded">
        {FIELD_CONFIG[field].label}
      </span>
      <span className="text-xs text-white drop-shadow bg-black/40 px-1 rounded">
        {fmt(max)}{unit}
      </span>
      <div className="w-4 rounded" style={{ height: 120, background: gradient }} />
      <span className="text-xs text-white drop-shadow bg-black/40 px-1 rounded">
        {fmt(min)}{unit}
      </span>
    </div>
  );
}

export default function VTKViewer({ simulationId, className }: VTKViewerProps) {
  const [category, setCategory] = useState<Category>('comfort');
  const [height, setHeight] = useState<HeightName>('seated');
  const [field, setField] = useState<FieldName>('PMV');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFiles, setHasFiles] = useState<boolean | null>(null);
  const [availableFiles, setAvailableFiles] = useState<Set<string>>(new Set());
  const [dataRange, setDataRange] = useState<[number, number]>([0, 1]);

  const containerRef = useRef<HTMLDivElement>(null);
  const vtkRef = useRef<VtkContext | null>(null);
  const actorRef = useRef<ReturnType<typeof vtkActor.newInstance> | null>(null);
  const lutRef = useRef<ReturnType<typeof vtkColorTransferFunction.newInstance> | null>(null);

  useEffect(() => {
    fetch(`/api/simulations/${simulationId}/post/vtk-list`)
      .then(r => r.json())
      .then((data: { files: { filename: string; size: number }[] }) => {
        const files = data.files ?? [];
        setHasFiles(files.length > 0);
        setAvailableFiles(new Set(files.map(f => f.filename)));
      })
      .catch(() => setHasFiles(false));
  }, [simulationId]);

  useEffect(() => {
    if (!containerRef.current || !hasFiles) return;

    const container = containerRef.current;

    const rw = vtkRenderWindow.newInstance();
    const renderer = vtkRenderer.newInstance({ background: [0.12, 0.12, 0.15] });
    rw.addRenderer(renderer);

    const glRW = vtkOpenGLRenderWindow.newInstance();
    glRW.setContainer(container);
    glRW.setSize(container.clientWidth || 800, container.clientHeight || 500);
    rw.addView(glRW);

    const interactor = vtkRenderWindowInteractor.newInstance();
    const style = vtkInteractorStyleTrackballCamera.newInstance();
    interactor.setInteractorStyle(style);
    interactor.setView(glRW);
    interactor.initialize();
    interactor.bindEvents(container);

    lutRef.current = vtkColorTransferFunction.newInstance();
    vtkRef.current = { rw, glRW, renderer, interactor };

    return () => {
      interactor.unbindEvents();
      interactor.delete();
      glRW.delete();
      rw.delete();
      vtkRef.current = null;
      lutRef.current = null;
      actorRef.current = null;
    };
  }, [hasFiles]);

  const loadPlane = useCallback(async () => {
    if (!vtkRef.current || !lutRef.current) return;
    const { rw, renderer } = vtkRef.current;
    const lut = lutRef.current;

    const z = HEIGHT_CONFIG[height].z;
    const base = `${category}_plane_${height}_${z}m`;
    const vtpName = `${base}.vtp`;
    const vtkName = `${base}.vtk`;

    const filename = availableFiles.has(vtpName)
      ? vtpName
      : availableFiles.has(vtkName)
      ? vtkName
      : vtkName;

    const url = `/api/simulations/${simulationId}/post/vtk/${filename}`;

    setLoading(true);
    setError(null);

    try {
      const polyData = await parsePolyData(url, filename);

      if (!polyData || polyData.getNumberOfPoints() === 0) {
        throw new Error('Empty geometry — no points in this plane file');
      }

      const scalarInfo = getScalarArray(polyData, field);
      if (!scalarInfo) {
        throw new Error(`Field "${field}" not available in ${filename}`);
      }

      const { array, min, max } = scalarInfo;
      const safeMin = min;
      const safeMax = max === min ? min + 0.001 : max;
      setDataRange([safeMin, safeMax]);

      const scalarArray = vtkDataArray.newInstance({
        name: '__active__',
        values: array,
        numberOfComponents: 1,
      });
      polyData.getPointData().setScalars(scalarArray);

      buildColormap(field, lut, safeMin, safeMax);

      const mapper = vtkMapper.newInstance();
      mapper.setInputData(polyData);
      mapper.setLookupTable(lut);
      mapper.setScalarRange(safeMin, safeMax);
      mapper.setColorModeToMapScalars();
      mapper.setScalarModeToUsePointData();

      if (actorRef.current) {
        renderer.removeActor(actorRef.current);
        actorRef.current.delete();
      }

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      actor.getProperty().setLighting(false);
      actorRef.current = actor;

      renderer.addActor(actor);
      renderer.resetCamera();
      rw.render();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load plane file';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [simulationId, category, height, field, availableFiles]);

  useEffect(() => {
    if (hasFiles && vtkRef.current) {
      loadPlane();
    }
  }, [loadPlane, hasFiles]);

  const handleCategoryChange = (cat: Category) => {
    const catCfg = CATEGORIES[cat];
    const newHeight: HeightName = catCfg.heights.includes(height) ? height : catCfg.heights[0];
    const newField = catCfg.fields[0];
    setCategory(cat);
    setHeight(newHeight);
    setField(newField);
  };

  if (hasFiles === null) {
    return (
      <div className={`flex items-center justify-center h-64 ${className ?? ''}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasFiles) {
    return (
      <div className={`flex items-center justify-center h-64 bg-muted/20 rounded-lg ${className ?? ''}`}>
        <div className="text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No results available for this simulation.</p>
          <p className="text-xs text-muted-foreground mt-1">Post-processing must complete first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      <div className="flex flex-wrap gap-2 items-center">
        {(Object.entries(CATEGORIES) as [Category, CategoryConfig][]).map(([cat, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                category === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </button>
          );
        })}

        <div className="ml-auto flex gap-1.5">
          {CATEGORIES[category].fields.map(f => (
            <button
              key={f}
              onClick={() => setField(f as FieldName)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                field === f
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {FIELD_CONFIG[f as FieldName].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES[category].heights.map(h => (
          <button
            key={h}
            onClick={() => setHeight(h)}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              height === h
                ? 'bg-secondary text-secondary-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/60'
            }`}
          >
            {HEIGHT_CONFIG[h].label}{' '}
            <span className="opacity-60">({HEIGHT_CONFIG[h].z}m)</span>
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={loadPlane}
          className="ml-auto h-7 px-2"
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="relative rounded-lg overflow-hidden bg-[#1f1f26]" style={{ height: 480 }}>
        <div ref={containerRef} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 text-white">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">
                Loading {HEIGHT_CONFIG[height].label.toLowerCase()} plane…
              </span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-red-400">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm font-medium">Load Error</p>
              <p className="text-xs mt-1 max-w-xs opacity-80">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && (
          <ColormapBar field={field} min={dataRange[0]} max={dataRange[1]} />
        )}

        {!loading && !error && (
          <div className="absolute bottom-2 left-2 text-xs text-white/50 select-none">
            Drag to rotate · Scroll to zoom · Shift+drag to pan
          </div>
        )}
      </div>
    </div>
  );
}
