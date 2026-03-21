import '@kitware/vtk.js/Rendering/Profiles/Geometry';
// @ts-ignore
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
// @ts-ignore
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
// @ts-ignore
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

interface ParsedPolyData {
  getNumberOfPoints: () => number;
  getPoints: () => { getData: () => Float32Array };
  getPolys: () => { getData: () => Uint32Array };
  getPointData: () => {
    getArrayByName: (name: string) => { getData: () => Float32Array; getNumberOfTuples: () => number } | null;
    setScalars: (arr: ReturnType<typeof vtkDataArray.newInstance>) => void;
    addArray: (arr: ReturnType<typeof vtkDataArray.newInstance>) => void;
  };
}

function readLine(bytes: Uint8Array, pos: number): { line: string; pos: number } {
  let end = pos;
  while (end < bytes.length && bytes[end] !== 10) end++;
  const line = new TextDecoder('latin1').decode(bytes.subarray(pos, end));
  return { line: line.trim(), pos: end + 1 };
}

function skipNewline(bytes: Uint8Array, pos: number): number {
  if (pos < bytes.length && bytes[pos] === 10) return pos + 1;
  return pos;
}

function readFloat32BE(view: DataView, byteOffset: number, n: number): Float32Array {
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) result[i] = view.getFloat32(byteOffset + i * 4, false);
  return result;
}

function readFloat64BE(view: DataView, byteOffset: number, n: number): Float64Array {
  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) result[i] = view.getFloat64(byteOffset + i * 8, false);
  return result;
}

function readInt64sAsNumber(view: DataView, byteOffset: number, n: number): number[] {
  const result: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const hi = view.getInt32(byteOffset + i * 8, false);
    const lo = view.getUint32(byteOffset + i * 8 + 4, false);
    result[i] = hi * 4294967296 + lo;
  }
  return result;
}

function readInt32BE(view: DataView, byteOffset: number, n: number): number[] {
  const result: number[] = new Array(n);
  for (let i = 0; i < n; i++) result[i] = view.getInt32(byteOffset + i * 4, false);
  return result;
}

function parseBinaryVTK(buffer: ArrayBuffer): ParsedPolyData {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let pos = 0;

  function nextLine(): string {
    const r = readLine(bytes, pos);
    pos = r.pos;
    return r.line;
  }

  nextLine();
  nextLine();
  const formatLine = nextLine();
  if (formatLine !== 'BINARY') throw new Error(`Expected BINARY format, got: ${formatLine}`);
  const datasetLine = nextLine();
  if (!datasetLine.includes('POLYDATA')) throw new Error(`Expected POLYDATA, got: ${datasetLine}`);

  let nPoints = 0;
  let coordType = 'float';
  let pointCoords: Float32Array | null = null;
  let polyCellArray: Uint32Array | null = null;
  const pointArrays = new Map<string, { data: Float32Array; nComp: number }>();
  let nPointData = 0;

  while (pos < buffer.byteLength) {
    const line = nextLine();
    if (!line) continue;

    if (line.startsWith('POINTS ')) {
      const parts = line.split(/\s+/);
      nPoints = parseInt(parts[1]);
      coordType = parts[2] ?? 'float';
      if (coordType === 'double') {
        const raw = readFloat64BE(view, pos, nPoints * 3);
        pos += nPoints * 3 * 8;
        pointCoords = new Float32Array(raw);
      } else {
        pointCoords = readFloat32BE(view, pos, nPoints * 3);
        pos += nPoints * 3 * 4;
      }
      pos = skipNewline(bytes, pos);
      continue;
    }

    if (line.startsWith('POLYGONS ')) {
      const parts = line.split(/\s+/);
      // VTK 5.1 POLYGONS header: "POLYGONS nOffsets totalConn"
      // nOffsets = nRealCells + 1 (start-offset per cell + 1 sentinel = totalConn)
      const nOffsets = parseInt(parts[1]);
      const totalConn = parseInt(parts[2]);
      const nRealCells = nOffsets - 1;

      const offsetLine = nextLine();
      const useInt64 = offsetLine.includes('int64');

      let offsets: number[];
      if (useInt64) {
        offsets = readInt64sAsNumber(view, pos, nOffsets);
        pos += nOffsets * 8;
      } else {
        offsets = readInt32BE(view, pos, nOffsets);
        pos += nOffsets * 4;
      }
      pos = skipNewline(bytes, pos);

      const connLine = nextLine();
      const connInt64 = connLine.includes('int64');
      let connectivity: number[];
      if (connInt64) {
        connectivity = readInt64sAsNumber(view, pos, totalConn);
        pos += totalConn * 8;
      } else {
        connectivity = readInt32BE(view, pos, totalConn);
        pos += totalConn * 4;
      }
      pos = skipNewline(bytes, pos);

      // Build vtk.js CellArray: [nVerts, v0, v1, ..., nVerts, v0, v1, ...]
      // offsets[i] = start of cell i, offsets[i+1] = start of cell i+1 (exclusive end)
      const cellArr: number[] = [];
      for (let c = 0; c < nRealCells; c++) {
        const start = offsets[c];
        const end = offsets[c + 1];
        const count = end - start;
        cellArr.push(count);
        for (let j = start; j < end; j++) cellArr.push(connectivity[j]);
      }
      polyCellArray = new Uint32Array(cellArr);
      continue;
    }

    if (line.startsWith('POINT_DATA ')) {
      nPointData = parseInt(line.split(/\s+/)[1]);
      continue;
    }

    if (line.startsWith('SCALARS ')) {
      const parts = line.split(/\s+/);
      const name = parts[1];
      const dtype = parts[2] ?? 'float';
      const nComp = parts[3] ? parseInt(parts[3]) : 1;
      nextLine();
      const bytesPerElem = dtype === 'double' ? 8 : 4;
      const n = nPointData * nComp;
      let data: Float32Array;
      if (dtype === 'double') {
        const raw = readFloat64BE(view, pos, n);
        data = new Float32Array(raw);
      } else {
        data = readFloat32BE(view, pos, n);
      }
      pos += n * bytesPerElem;
      pos = skipNewline(bytes, pos);
      pointArrays.set(name, { data, nComp });
      continue;
    }

    if (line.startsWith('VECTORS ')) {
      const parts = line.split(/\s+/);
      const name = parts[1];
      const dtype = parts[2] ?? 'float';
      const n = nPointData * 3;
      const bytesPerElem = dtype === 'double' ? 8 : 4;
      let data: Float32Array;
      if (dtype === 'double') {
        const raw = readFloat64BE(view, pos, n);
        data = new Float32Array(raw);
      } else {
        data = readFloat32BE(view, pos, n);
      }
      pos += n * bytesPerElem;
      pos = skipNewline(bytes, pos);
      pointArrays.set(name, { data, nComp: 3 });
      continue;
    }

    if (line.startsWith('FIELD FieldData ')) {
      const nFields = parseInt(line.split(/\s+/)[2]);
      for (let f = 0; f < nFields; f++) {
        const fl = nextLine();
        if (!fl) { f--; continue; }
        const parts = fl.split(/\s+/);
        const name = parts[0];
        const nComp = parseInt(parts[1]);
        const n = parseInt(parts[2]);
        const dtype = parts[3] ?? 'float';
        const bytesPerElem = dtype === 'double' ? 8 : 4;
        const total = n * nComp;
        let data: Float32Array;
        if (dtype === 'double') {
          const raw = readFloat64BE(view, pos, total);
          data = new Float32Array(raw);
        } else {
          data = readFloat32BE(view, pos, total);
        }
        pos += total * bytesPerElem;
        pos = skipNewline(bytes, pos);
        pointArrays.set(name, { data, nComp });
      }
      continue;
    }
  }

  if (!pointCoords || !polyCellArray) {
    throw new Error('Binary VTK parse failed: missing POINTS or POLYGONS data');
  }

  const pd = vtkPolyData.newInstance();

  const pts = vtkPoints.newInstance();
  pts.setData(pointCoords, 3);
  pd.setPoints(pts);

  const polys = vtkCellArray.newInstance();
  polys.setData(polyCellArray);
  pd.setPolys(polys);

  for (const [name, { data, nComp }] of pointArrays) {
    const arr = vtkDataArray.newInstance({ name, values: data, numberOfComponents: nComp });
    pd.getPointData().addArray(arr);
  }

  return pd as ParsedPolyData;
}

export async function loadPolyData(url: string, filename: string): Promise<ParsedPolyData> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${filename}: HTTP ${resp.status}`);

  if (filename.endsWith('.vtp')) {
    // @ts-ignore
    const vtkXMLPolyDataReader = (await import('@kitware/vtk.js/IO/XML/XMLPolyDataReader')).default;
    const buffer = await resp.arrayBuffer();
    const reader = vtkXMLPolyDataReader.newInstance();
    reader.parseAsArrayBuffer(buffer);
    return reader.getOutputData(0) as ParsedPolyData;
  }

  const buffer = await resp.arrayBuffer();
  const header = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, 80));
  const lines = header.split('\n');
  const formatFlag = (lines[2] ?? '').trim().toUpperCase();

  if (formatFlag === 'BINARY') {
    return parseBinaryVTK(buffer);
  }

  // @ts-ignore
  const vtkPolyDataReader = (await import('@kitware/vtk.js/IO/Legacy/PolyDataReader')).default;
  const text = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const reader = vtkPolyDataReader.newInstance();
  reader.parseAsText(text);
  return reader.getOutputData(0) as ParsedPolyData;
}
