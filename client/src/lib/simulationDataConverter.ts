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

// Interfaces para el formato de exportación JSON
interface PointXY {
  x: string; // En metros, ejemplo: "2.5m"
  y: string; // En metros, ejemplo: "3.2m"
}

interface Position {
  x: string; // En metros, ejemplo: "2.5m"
  y: string; // En metros, ejemplo: "3.2m"
  z?: number;
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
  points: PointXY[];
  connectsTo?: string;
  direction?: string;
}

interface WallExport {
  id: string;
  start: PointXY;
  end: PointXY;
  temp: number;
  airEntries: AirEntryExport[];
}

interface FurnitureExport {
  id: string;
  position: Position;
  rotation: number;
  state?: string;
}

interface FloorExport {
  height: number;
  floorDeck: number;
  walls: WallExport[];
  stairs: StairExport[];
  furniture: FurnitureExport[];
}

interface SimulationExport {
  version: string;
  floors: Record<string, FloorExport>;
}

// Constantes para la normalización de coordenadas
const PIXELS_TO_CM = 25 / 20; // 1.25 - misma constante que Canvas2D
const CANVAS_CENTER_X = 400; // Centro del canvas en X
const CANVAS_CENTER_Y = 300; // Centro del canvas en Y

/**
 * Normaliza coordenadas internas del canvas a coordenadas centradas en centímetros
 */
// Función que devuelve coordenadas con unidades para JSON
export function normalizeCoordinates(internalPoint: Point2D): PointXY {
  // Restar el offset del centro y convertir a centímetros, luego a metros
  const normalizedX = (internalPoint.x - CANVAS_CENTER_X) * PIXELS_TO_CM / 100;
  const normalizedY = -(internalPoint.y - CANVAS_CENTER_Y) * PIXELS_TO_CM / 100;
  
  return {
    x: `${normalizedX.toFixed(2)}m`,
    y: `${normalizedY.toFixed(2)}m`
  };
}



/**
 * Convierte coordenadas JSON de vuelta a coordenadas internas del canvas
 */
export function denormalizeCoordinates(jsonPoint: PointXY): Point2D {
  // Extraer números de las strings con unidades (ej: "2.5m" -> 2.5)
  const xValue = parseFloat(jsonPoint.x.replace('m', '')) * 100; // Convertir metros a cm
  const yValue = parseFloat(jsonPoint.y.replace('m', '')) * 100; // Convertir metros a cm
  
  // Convertir de centímetros a píxeles y añadir el offset del centro
  const internalX = (xValue / PIXELS_TO_CM) + CANVAS_CENTER_X;
  const internalY = (-yValue / PIXELS_TO_CM) + CANVAS_CENTER_Y;
  
  return {
    x: internalX,
    y: internalY
  };
}





/**
 * Convierte los datos del diseño en un formato JSON exportable para simulación
 */
export function generateSimulationData(
  floors: Record<string, FloorData>,
  furniture: THREE.Object3D[] = [],
  roomHeight: number = 2.5,
  floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number }>
): SimulationExport {
  const exportData: SimulationExport = {
    version: "1.0",
    floors: {}
  };

  // Procesar cada piso - convertir nombres a números
  Object.entries(floors).forEach(([floorName, floorData], index) => {
    // Convertir nombre de piso a número (ground=0, first=1, etc.)
    const floorNumber = index.toString();

    // Convertir escaleras con coordenadas normalizadas
    const stairs: StairExport[] = (floorData.stairPolygons || []).map((stair, index) => {
      return {
        id: stair.id || `stair_${index}`,
        points: stair.points.map(p => normalizeCoordinates({ x: p.x, y: p.y })),
        connectsTo: stair.connectsTo,
        direction: stair.direction
      };
    });

    // Convertir paredes - usar sincronización para asegurar datos limpios
    const synchronizedWalls = prepareSynchronizedWalls(
      floorData.lines, 
      floorData.walls || [], 
      floorData.name || floorName
    );
    
    const walls: WallExport[] = synchronizedWalls.map((wall) => {
      // Encontrar air entries que pertenecen a esta pared
      const wallAirEntries: AirEntryExport[] = [];
      
      floorData.airEntries.forEach((entry, index) => {
        // Calcular distancia del air entry a esta pared
        const distance = Math.abs(
          ((wall.endPoint.y - wall.startPoint.y) * entry.position.x) -
          ((wall.endPoint.x - wall.startPoint.x) * entry.position.y) +
          (wall.endPoint.x * wall.startPoint.y) -
          (wall.endPoint.y * wall.startPoint.x)
        ) / Math.sqrt(
          Math.pow(wall.endPoint.y - wall.startPoint.y, 2) +
          Math.pow(wall.endPoint.x - wall.startPoint.x, 2)
        );
        
        // Si el air entry está cerca de esta pared (tolerancia de 50 píxeles)
        if (distance < 50) {
          // Usar el mismo sistema de normalización que las paredes para X,Y
          const normalizedXY = normalizeCoordinates({ 
            x: entry.position.x, 
            y: entry.position.y 
          });
          
          // Calcular la altura Z directamente en metros
          const heightInMeters = (entry.dimensions.distanceToFloor || 100) / 100; // Convertir cm a metros
          
          wallAirEntries.push({
            id: `${entry.type}_${index}`,
            type: entry.type,
            size: {
              width: entry.dimensions.width / 100, // Convertir cm a metros
              height: entry.dimensions.height / 100 // Convertir cm a metros
            },
            position: {
              x: normalizedXY.x,
              y: normalizedXY.y,
              z: heightInMeters
            }
          });
        }
      });
      
      return {
        id: wall.id,
        start: normalizeCoordinates({ x: wall.startPoint.x, y: wall.startPoint.y }),
        end: normalizeCoordinates({ x: wall.endPoint.x, y: wall.endPoint.y }),
        temp: wall.properties.temperature,
        airEntries: wallAirEntries
      };
    });

    // Filtrar el mobiliario que pertenece a este piso con coordenadas normalizadas
    const floorFurniture: FurnitureExport[] = furniture
      .filter(obj => obj.userData?.floor === floorName && obj.userData?.type === 'furniture')
      .map((obj, index) => {
        // Normalizar posición del mobiliario (Three.js ya usa coordenadas 3D)
        const normalizedPos = normalizeCoordinates({ x: obj.position.x, y: obj.position.z });
        return {
          id: obj.userData?.id || `furniture_${index}`,
          position: {
            x: normalizedPos.x,
            y: normalizedPos.y
          },
          rotation: obj.rotation.y
        };
      });

    // Obtener los parámetros específicos del piso actual
    const currentFloorParams = floorParameters?.[floorName] || { ceilingHeight: 220, floorDeck: 0 };
    const floorHeight = (currentFloorParams.ceilingHeight || roomHeight * 100) / 100;
    const floorDeckValue = (currentFloorParams.floorDeck || 0) / 100; // Convertir de cm a metros
    
    // Agregar los datos del piso al objeto de exportación usando número
    exportData.floors[floorNumber] = {
      height: floorHeight,
      floorDeck: floorDeckValue,
      walls: walls,
      stairs: stairs,
      furniture: floorFurniture
    };
  });

  return exportData;
}

/**
 * Extrae puntos únicos y ordenados de un conjunto de líneas
 */
function extractRoomPointsFromLines(lines: any[]): PointXY[] {
  // Si no hay líneas, retornar un arreglo vacío
  if (!lines || lines.length === 0) return [];

  // Intentar construir un polígono ordenado a partir de las líneas
  const points: PointXY[] = [];
  const startLine = lines[0];
  
  // Añadir el primer punto normalizado
  const normalizedStart = normalizeCoordinates(startLine.start);
  points.push(normalizedStart);
  
  // Punto actual para buscar la siguiente línea
  let currentPoint = { x: startLine.end.x, y: startLine.end.y };
  const normalizedEnd = normalizeCoordinates({ x: currentPoint.x, y: currentPoint.y });
  points.push(normalizedEnd);
  
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
        const normalizedPoint = normalizeCoordinates({ x: currentPoint.x, y: currentPoint.y });
        points.push(normalizedPoint);
        foundNext = true;
        break;
      } 
      else if (isPointNear(currentPoint, line.end)) {
        processedLines.add(i);
        currentPoint = { x: line.start.x, y: line.start.y };
        const normalizedPoint = normalizeCoordinates({ x: currentPoint.x, y: currentPoint.y });
        points.push(normalizedPoint);
        foundNext = true;
        break;
      }
    }
    
    // Si no encontramos una siguiente línea, el polígono está incompleto
    if (!foundNext) break;
  }
  
  // Eliminar el último punto si es igual al primero (cerrar el polígono)
  if (points.length > 1 && 
      isPointNear({ x: points[0].x, y: points[0].y }, 
                { x: points[points.length - 1].x, y: points[points.length - 1].y })) {
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

// ================== WALL SYNCHRONIZATION SYSTEM ==================

/**
 * Synchronizes walls with current lines - removes orphaned walls and adds missing walls
 */
export function syncWallsWithLines(
  lines: Line[], 
  existingWalls: Wall[], 
  floorName: string,
  defaultTemperature: number = 20
): Wall[] {
  // Step 1: Remove orphaned walls (walls that don't have corresponding lines)
  const validWalls = removeOrphanedWalls(existingWalls, lines);
  
  // Step 2: Add missing walls (lines that don't have corresponding walls)
  const syncedWalls = addMissingWalls(lines, validWalls, floorName, defaultTemperature);
  
  return syncedWalls;
}

/**
 * Removes walls that don't have corresponding lines
 */
export function removeOrphanedWalls(walls: Wall[], currentLines: Line[]): Wall[] {
  return walls.filter(wall => 
    currentLines.some(line => 
      arePointsEqual(wall.startPoint, line.start) &&
      arePointsEqual(wall.endPoint, line.end)
    )
  );
}

/**
 * Adds walls for lines that don't have corresponding walls
 */
export function addMissingWalls(
  lines: Line[], 
  existingWalls: Wall[], 
  floorName: string,
  defaultTemperature: number = 20.0
): Wall[] {
  const wallsToAdd: Wall[] = [];
  
  lines.forEach(line => {
    // Check if this line already has a corresponding wall
    const existingWall = findWallForLine(existingWalls, line);
    
    if (!existingWall) {
      // Create a new wall for this line
      const newWall = createWallFromLine(line, floorName, existingWalls.concat(wallsToAdd), defaultTemperature);
      wallsToAdd.push(newWall);
    }
  });
  
  return [...existingWalls, ...wallsToAdd];
}

/**
 * Ensures walls array is clean and synchronized with lines before export
 */
export function prepareSynchronizedWalls(
  lines: Line[], 
  walls: Wall[], 
  floorName: string
): Wall[] {
  return syncWallsWithLines(lines, walls, floorName);
}