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

interface Wall {
  id: string; // Formato: "0F_wall1", "1F_wall3", etc.
  uuid: string; // UUID único para trazabilidad
  floor: string; // "Planta Baja", "Primera Planta", etc.
  lineRef: string; // Referencia única a la línea asociada
  startPoint: Point2D;
  endPoint: Point2D;
  properties: {
    temperature: number; // En grados Celsius
  };
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
  walls: Wall[];
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

interface WallExport {
  id: string;
  floor: string;
  startPoint: PointXZ;
  endPoint: PointXZ;
  properties: {
    temperature: number;
  };
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
  walls: WallExport[];
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

    // Convertir paredes
    const walls: WallExport[] = (floorData.walls || []).map((wall) => {
      return {
        id: wall.id,
        floor: wall.floor,
        startPoint: { x: wall.startPoint.x, z: wall.startPoint.y },
        endPoint: { x: wall.endPoint.x, z: wall.endPoint.y },
        properties: {
          temperature: wall.properties.temperature
        }
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
      walls: walls,
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

// ================== FUNCIONES PARA GESTIÓN DE PAREDES ==================

/**
 * Genera un UUID simple para identificar paredes de forma única
 */
export function generateUUID(): string {
  return 'xxxx-xxxx-xxxx'.replace(/[x]/g, () => {
    return (Math.random() * 16 | 0).toString(16);
  });
}

/**
 * Genera un ID único para una línea basado en sus puntos
 */
export function lineToUniqueId(line: Line): string {
  return `${line.start.x},${line.start.y}_${line.end.x},${line.end.y}`;
}

/**
 * Obtiene el índice de planta basado en el nombre del piso
 */
export function getFloorIndex(floorName: string): number {
  // Mapeo de nombres comunes a índices
  const floorMap: Record<string, number> = {
    'Planta Baja': 0,
    'Ground Floor': 0,
    'Primera Planta': 1,
    'First Floor': 1,
    'Segunda Planta': 2,
    'Second Floor': 2,
    'Tercera Planta': 3,
    'Third Floor': 3
  };
  
  return floorMap[floorName] || 0;
}

/**
 * Genera el siguiente número de pared para una planta específica
 */
export function getNextWallNumber(walls: Wall[], floorIndex: number): number {
  const floorPrefix = `${floorIndex}F_wall`;
  
  // Encontrar todos los números de pared existentes para esta planta
  const existingNumbers = walls
    .filter(wall => wall.id.startsWith(floorPrefix))
    .map(wall => {
      const match = wall.id.match(/(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(num => !isNaN(num));
  
  // Retornar el siguiente número disponible
  return existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
}

/**
 * Crea un objeto Wall a partir de una línea
 */
export function createWallFromLine(
  line: Line, 
  floorName: string, 
  existingWalls: Wall[], 
  temperature: number = 20.0
): Wall {
  const floorIndex = getFloorIndex(floorName);
  const wallNumber = getNextWallNumber(existingWalls, floorIndex);
  
  return {
    id: `${floorIndex}F_wall${wallNumber}`,
    uuid: generateUUID(),
    floor: floorName,
    lineRef: lineToUniqueId(line),
    startPoint: { x: line.start.x, y: line.start.y },
    endPoint: { x: line.end.x, y: line.end.y },
    properties: {
      temperature: temperature
    }
  };
}

/**
 * Verifica si dos puntos son aproximadamente iguales
 */
export function arePointsEqual(p1: Point2D, p2: Point2D, tolerance: number = 0.01): boolean {
  return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
}

/**
 * Encuentra las paredes que corresponden a líneas que van a ser eliminadas
 */
export function findWallsForDeletedLines(walls: Wall[], deletedLines: Line[]): Wall[] {
  return walls.filter(wall => 
    deletedLines.some(line => 
      arePointsEqual(wall.startPoint, line.start) &&
      arePointsEqual(wall.endPoint, line.end)
    )
  );
}

/**
 * Encuentra la pared asociada a una línea específica
 */
export function findWallForLine(walls: Wall[], line: Line): Wall | undefined {
  return walls.find(wall => 
    arePointsEqual(wall.startPoint, line.start) &&
    arePointsEqual(wall.endPoint, line.end)
  );
}