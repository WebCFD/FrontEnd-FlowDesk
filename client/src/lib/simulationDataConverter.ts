import * as THREE from 'three';

// Definición de los tipos internos que necesitamos
interface Point2D {
  x: number;
  y: number;
}

interface Line {
  start: Point2D;
  end: Point2D;
}

interface AirEntry {
  type: "window" | "door" | "vent";
  position: Point2D;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
}

interface StairPolygon {
  id: string;
  points: Point2D[];
  floor: string;
  direction?: "up" | "down";
  connectsTo?: string;
  isImported?: boolean;
}

// Definición del tipo para los datos de planta
interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  hasClosedContour: boolean;
  name?: string;
  stairPolygons?: StairPolygon[];
}

// Interfaces para el formato de exportación
interface PointXZ {
  x: number;
  z: number;
}

interface Position {
  x: number;
  y?: number;
  z: number;
}

interface Position3D {
  x: number;
  y: number;
  z: number;
}

interface Size {
  width: number;
  height: number;
  depth?: number;
}

interface Normal {
  x: number;
  y: number;
  z: number;
}

interface Surface {
  id: string;
  size: Size;
  position: Position3D;
  normal: Normal;
  level: string;
  state: string;
}

interface AirEntryExport {
  id: string;
  type: string;
  size: Size;
  position: Position;
  normal?: Normal;
  state?: string;
}

interface StairExport {
  id: string;
  points: PointXZ[];
  connectsTo?: string;
  direction?: string;
}

interface FurnitureExport {
  id: string;
  position: Position;
  rotation: number;
  state?: string;
}

interface RoomExport {
  points: PointXZ[];
  height: number;
  duration?: number;
}

interface FloorExport {
  room: RoomExport;
  airEntries: AirEntryExport[];
  stairs: StairExport[];
  furniture: FurnitureExport[];
}

interface SimulationExport {
  version: string;
  floors: Record<string, FloorExport>;
}

/**
 * Convierte los datos del diseño en un formato JSON exportable para simulación
 */
export function generateSimulationData(
  floors: Record<string, FloorData>,
  furniture: THREE.Object3D[] = [],
  roomHeight: number = 2.5
): SimulationExport {
  const exportData: SimulationExport = {
    version: "1.0",
    floors: {}
  };

  // Procesar cada piso
  Object.entries(floors).forEach(([floorName, floorData]) => {
    // Crear los puntos de la habitación a partir de las líneas
    const roomPoints: PointXZ[] = extractRoomPointsFromLines(floorData.lines);

    // Convertir air entries (ventanas, puertas, etc.)
    const airEntries: AirEntryExport[] = floorData.airEntries.map((entry, index) => {
      return {
        id: `${entry.type}_${index}`,
        type: entry.type,
        size: {
          width: entry.dimensions.width,
          height: entry.dimensions.height
        },
        position: {
          x: entry.position.x,
          y: entry.dimensions.distanceToFloor || 1,
          z: entry.position.y // En el contexto 2D, y se mapea a z en 3D
        }
      };
    });

    // Convertir escaleras
    const stairs: StairExport[] = (floorData.stairPolygons || []).map((stair, index) => {
      return {
        id: stair.id || `stair_${index}`,
        points: stair.points.map(p => ({ x: p.x, z: p.y })),
        connectsTo: stair.connectsTo,
        direction: stair.direction
      };
    });

    // Filtrar el mobiliario que pertenece a este piso
    const floorFurniture: FurnitureExport[] = furniture
      .filter(obj => obj.userData?.floor === floorName && obj.userData?.type === 'furniture')
      .map((obj, index) => {
        return {
          id: obj.userData?.id || `furniture_${index}`,
          position: {
            x: obj.position.x,
            z: obj.position.z
          },
          rotation: obj.rotation.y
        };
      });

    // Agregar los datos del piso al objeto de exportación
    exportData.floors[floorName] = {
      room: {
        points: roomPoints,
        height: roomHeight
      },
      airEntries: airEntries,
      stairs: stairs,
      furniture: floorFurniture
    };
  });

  return exportData;
}

/**
 * Extrae puntos únicos y ordenados de un conjunto de líneas
 */
function extractRoomPointsFromLines(lines: any[]): PointXZ[] {
  // Si no hay líneas, retornar un arreglo vacío
  if (!lines || lines.length === 0) return [];

  // Intentar construir un polígono ordenado a partir de las líneas
  const points: PointXZ[] = [];
  const startLine = lines[0];
  
  // Añadir el primer punto
  points.push({ x: startLine.start.x, z: startLine.start.y });
  
  // Punto actual para buscar la siguiente línea
  let currentPoint = { x: startLine.end.x, y: startLine.end.y };
  points.push({ x: currentPoint.x, z: currentPoint.y });
  
  // Puntos ya procesados para evitar duplicados
  const processedLines = new Set([0]);
  
  // Mientras no hayamos procesado todas las líneas
  while (processedLines.size < lines.length) {
    let foundNext = false;
    
    // Buscar la siguiente línea conectada
    for (let i = 0; i < lines.length; i++) {
      if (processedLines.has(i)) continue;
      
      const line = lines[i];
      
      // Verificar si esta línea conecta con el punto actual
      if (isPointNear(currentPoint, line.start)) {
        processedLines.add(i);
        currentPoint = { x: line.end.x, y: line.end.y };
        points.push({ x: currentPoint.x, z: currentPoint.y });
        foundNext = true;
        break;
      } 
      else if (isPointNear(currentPoint, line.end)) {
        processedLines.add(i);
        currentPoint = { x: line.start.x, y: line.start.y };
        points.push({ x: currentPoint.x, z: currentPoint.y });
        foundNext = true;
        break;
      }
    }
    
    // Si no encontramos una siguiente línea, el polígono está incompleto
    if (!foundNext) break;
  }
  
  // Eliminar el último punto si es igual al primero (cerrar el polígono)
  if (points.length > 1 && 
      isPointNear({ x: points[0].x, y: points[0].z }, 
                { x: points[points.length - 1].x, y: points[points.length - 1].z })) {
    points.pop();
  }
  
  return points;
}

/**
 * Verifica si dos puntos están cerca (con tolerancia)
 */
function isPointNear(p1: { x: number, y: number }, p2: { x: number, y: number }, tolerance: number = 0.1): boolean {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) < tolerance;
}