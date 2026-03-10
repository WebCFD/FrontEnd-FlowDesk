import * as THREE from 'three';
import type { StairPolygon } from '@/types';
import { createRoomPerimeter } from '@/lib/geometryEngine';
import { computeWallFlowDirection, computeSurfaceFlowDirection } from '@/lib/flowDirectionUtils';

// Definición de los tipos internos que necesitamos
interface Point2D {
  x: number;
  y: number;
}

interface Line {
  start: Point2D;
  end: Point2D;
}

// Propiedades base compartidas
interface BaseSimulationProperties {
  state?: 'open' | 'closed';
  temperature?: number;
  material?: string;
  emissivity?: number;
}

// Propiedades específicas para vents
interface VentSimulationProperties {
  flowType?: 'massFlow' | 'velocity' | 'pressure';
  flowValue?: number;
  flowIntensity?: 'low' | 'medium' | 'high';
  airOrientation?: 'inflow' | 'outflow';
}

// Propiedades unificadas que incluyen todos los campos posibles
interface SimulationProperties extends BaseSimulationProperties, VentSimulationProperties {}

interface AirEntry {
  type: "window" | "door" | "vent";
  position: Point2D;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
    shape?: 'rectangular' | 'circular';
  };
  properties?: SimulationProperties;
  line: Line;
  wallId?: string; // Direct reference to wall ID for robust assignment
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
    material?: string; // Material type (default, wood, metal, etc.)
    emissivity?: number; // Emissivity/absorptivity value (0-1)
  };
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
interface PointXY {
  x: number;
  y: number;
}

interface Position {
  x: number;
  y: number;
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
  type: "window" | "door" | "vent";
  position: {
    x: number;
    y: number;
    z: number;
    normal: {
      x: number;
      y: number;
      z: number;
    };
    rotation?: number;
  };
  dimensions: 
    | {
        width: number;
        height: number;
        shape: "rectangular";
      }
    | {
        diameter: number;
        shape: "circular";
      };
  simulation: {
    state?: "open" | "closed";
    temperature?: number;
    material?: string;
    emissivity?: number;
    flowIntensity?: "low" | "medium" | "high" | "custom";
    airDirection?: "inflow" | "outflow" | "equilibrium";
    flowDirection?: { x: number; y: number; z: number };
    verticalAngle?: number;
    horizontalAngle?: number;
    customValue?: number;
    flowType?: "massFlow" | "velocity" | "pressure";
  };
}

interface StairExport {
  id: string;
  points: PointXY[];
  connectsTo?: string;
}

// New improved stair export interfaces
interface StairLineExport {
  id: string;
  start: PointXY;
  end: PointXY;
}

interface StairExportNew {
  id: string;
  lines: StairLineExport[];
  connectsTo?: string;
  temp?: number;
  emissivity?: number;
}

interface WallExport {
  id: string;
  start: PointXY;
  end: PointXY;
  temp: number;
  material: string;
  emissivity: number;
  airEntries: AirEntryExport[];
}

interface RackFaceExport {
  role: 'inlet' | 'outlet' | 'wall' | 'vent';
  vertices: [number, number, number][];
  temperature?: number;
  rackDensity?: 'low' | 'medium' | 'high' | 'custom';
  thermalPower_kW?: number;
  airFlow?: number;
  material?: string;
  emissivity?: number;
}

interface FurnitureExport {
  id: string;
  position?: Position3D;
  rotation?: {
    x: number;
    y: number;
    z: number;
  };
  dimensions?: {
    width: number;
    height: number;
    depth: number;
  };
  filePath?: string;
  faces?: Record<string, RackFaceExport>;
  simulationProperties?: {
    temperature: number;
    material: string;
    emissivity: number;
    
    flowType?: 'massFlow' | 'velocity' | 'pressure';
    flowValue?: number;
    flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
    airOrientation?: 'inflow' | 'outflow' | 'equilibrium';
    state?: 'open' | 'closed';
    customIntensityValue?: number;
    verticalAngle?: number;
    horizontalAngle?: number;
    normalVector?: { x: number; y: number; z: number };
  };
}

interface FloorExport {
  height: number;
  deck: number;
  ceiling: {
    temp: number;
    emissivity: number;
    airEntries: AirEntryExport[];
  };
  floor: {
    temp: number;
    emissivity: number;
    airEntries: AirEntryExport[];
  };
  walls: WallExport[];
  stairs: StairExportNew[];
  furniture: FurnitureExport[];
}

interface SimulationExport {
  case_name?: string;
  version: string;
  levels: Record<string, FloorExport>;
}

// Constantes para la normalización de coordenadas
const PIXELS_TO_CM = 25 / 20; // 1.25 - misma constante que Canvas2D
const CANVAS_CENTER_X = 400; // Centro del canvas en X
const CANVAS_CENTER_Y = 300; // Centro del canvas en Y

// Función simple para convertir centímetros a metros
const cmToM = (cm: number): number => cm / 100;

/**
 * Normaliza coordenadas internas del canvas a coordenadas centradas en centímetros
 */
export function normalizeCoordinates(internalPoint: Point2D): PointXY {
  // Restar el offset del centro y convertir a centímetros
  const normalizedX = (internalPoint.x - CANVAS_CENTER_X) * PIXELS_TO_CM;
  const normalizedY = -(internalPoint.y - CANVAS_CENTER_Y) * PIXELS_TO_CM;
  
  return {
    x: normalizedX,
    y: normalizedY
  };
}

/**
 * Convierte coordenadas JSON de vuelta a coordenadas internas del canvas
 */
export function denormalizeCoordinates(jsonPoint: PointXY): Point2D {
  // Convertir de centímetros a píxeles y añadir el offset del centro
  const internalX = (jsonPoint.x / PIXELS_TO_CM) + CANVAS_CENTER_X;
  const internalY = (-jsonPoint.y / PIXELS_TO_CM) + CANVAS_CENTER_Y;
  
  return {
    x: internalX,
    y: internalY
  };
}





/**
 * Maps internal flow type values to export format
 */
function mapFlowType(flowType?: string): "massFlow" | "velocity" | "pressure" | undefined {
  switch (flowType) {
    case 'Air Mass Flow':
    case 'massFlow':
      return 'massFlow';
    case 'Air Velocity':
    case 'velocity':
      return 'velocity';
    case 'Pressure':
    case 'pressure':
      return 'pressure';
    default:
      return undefined;
  }
}

/**
 * Reordena las líneas para formar un polígono cerrado continuo.
 * Usa createRoomPerimeter() para obtener puntos ordenados y reconstruye las líneas.
 * 
 * @param lines - Líneas originales (pueden estar en cualquier orden)
 * @returns Líneas reordenadas que forman un polígono cerrado continuo
 */
function reorderLinesForClosedPolygon(lines: Line[]): Line[] {
  if (lines.length === 0) {
    return [];
  }

  // Usar createRoomPerimeter para obtener puntos ordenados
  const orderedPoints = createRoomPerimeter(lines);
  
  // Si no hay suficientes puntos, retornar las líneas originales
  if (orderedPoints.length < 3) {
    console.warn('[simulationDataConverter] Not enough points to form a closed polygon, using original lines');
    return lines;
  }

  // Reconstruir líneas ordenadas desde los puntos
  const reorderedLines: Line[] = [];
  for (let i = 0; i < orderedPoints.length; i++) {
    const start = orderedPoints[i];
    const end = orderedPoints[(i + 1) % orderedPoints.length]; // Wrap around to close polygon
    
    reorderedLines.push({
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y }
    });
  }

  // Validar que el polígono está cerrado
  const firstPoint = reorderedLines[0].start;
  const lastPoint = reorderedLines[reorderedLines.length - 1].end;
  const isClosed = Math.abs(firstPoint.x - lastPoint.x) < 0.1 && 
                   Math.abs(firstPoint.y - lastPoint.y) < 0.1;

  if (!isClosed) {
    console.warn('[simulationDataConverter] Polygon is not closed after reordering!', {
      firstPoint,
      lastPoint,
      gap: { 
        x: firstPoint.x - lastPoint.x, 
        y: firstPoint.y - lastPoint.y 
      }
    });
  } else {
    console.log('[simulationDataConverter] Successfully reordered lines to form closed polygon', {
      originalLineCount: lines.length,
      reorderedLineCount: reorderedLines.length
    });
  }

  return reorderedLines;
}

/**
 * Convierte los datos del diseño en un formato JSON exportable para simulación
 */
export function generateSimulationData(
  floors: Record<string, FloorData>,
  furniture: THREE.Object3D[] = [],
  roomHeight: number = 2.5,
  floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number; ceilingTemperature?: number; floorTemperature?: number; ceilingEmissivity?: number; floorEmissivity?: number }>,
  caseName?: string
): SimulationExport {
  // Reset global stair line counter for each export
  globalStairLineCounter = 1;
  
  const exportData: SimulationExport = {
    case_name: caseName,
    version: "1.0",
    levels: {}
  };

  // Procesar cada piso - convertir nombres a números
  Object.entries(floors).forEach(([floorName, floorData], index) => {
    // Convertir nombre de piso a número (ground=0, first=1, etc.)
    const floorNumber = index.toString();

    // Convertir escaleras usando la nueva estructura mejorada con líneas individuales
    // Cada escalera ahora tiene formato: stair_0F_1, stair_1F_2, etc.
    // Cada línea de escalera tiene formato: stair_line_1, stair_line_2, etc.
    const stairs: StairExportNew[] = convertStairPolygonsToExport(
      floorData.stairPolygons || [], 
      floorName
    );

    // CRITICAL FIX: Reordenar líneas para formar polígono cerrado continuo
    // Las líneas del canvas pueden estar en cualquier orden, pero el backend
    // requiere que formen un polígono cerrado válido para la simulación CFD
    const reorderedLines = floorData.hasClosedContour && floorData.lines.length > 0
      ? reorderLinesForClosedPolygon(floorData.lines)
      : floorData.lines;

    // Convertir paredes - usar sincronización para asegurar datos limpios
    const synchronizedWalls = prepareSynchronizedWalls(
      reorderedLines, // Usar líneas reordenadas en lugar de originales
      floorData.walls || [], 
      floorData.name || floorName
    );
    
    // Contadores globales por tipo para todo el piso - inicializar desde IDs existentes
    const globalTypeCounts = { window: 0, door: 0, vent: 0 };
    
    // Buscar los números más altos existentes en este piso
    floorData.airEntries.forEach(entry => {
      const anyEntry = entry as any;
      if (anyEntry.id) {
        // Actualizado para reconocer el nuevo formato: window_0F_1, door_1F_2, etc.
        const match = anyEntry.id.match(/^(window|door|vent)_\d+F_(\d+)$/);
        if (match) {
          const type = match[1] as keyof typeof globalTypeCounts;
          const num = parseInt(match[2]);
          if (globalTypeCounts[type] < num) {
            globalTypeCounts[type] = num;
          }
        }
      }
    });
    
    // Crear mapa de wallId original -> pared sincronizada (por coordenadas)
    const originalWallMap = new Map<string, Wall>();
    (floorData.walls || []).forEach(originalWall => {
      originalWallMap.set(originalWall.id, originalWall);
    });
    
    
    const walls: WallExport[] = synchronizedWalls.map((wall) => {
      // Encontrar air entries que pertenecen a esta pared
      const wallAirEntries: AirEntryExport[] = [];
      
      floorData.airEntries.forEach((entry, index) => {
        // Usar wallId directo para asignación robusta
        const entryWallId = (entry as any).wallId;
        const entryLine = (entry as any).line;
        
        let matchesWall = false;
        
        // Método 1: Buscar por wallId si existe
        if (entryWallId) {
          const originalWall = originalWallMap.get(entryWallId);
          matchesWall = originalWall !== undefined && 
            Math.abs(originalWall.startPoint.x - wall.startPoint.x) < 1 &&
            Math.abs(originalWall.startPoint.y - wall.startPoint.y) < 1 &&
            Math.abs(originalWall.endPoint.x - wall.endPoint.x) < 1 &&
            Math.abs(originalWall.endPoint.y - wall.endPoint.y) < 1;
        }
        
        // Método 2 (Fallback): Si no hay wallId, buscar por coordenadas de la línea asociada
        if (!matchesWall && entryLine) {
          matchesWall = 
            Math.abs(entryLine.start.x - wall.startPoint.x) < 1 &&
            Math.abs(entryLine.start.y - wall.startPoint.y) < 1 &&
            Math.abs(entryLine.end.x - wall.endPoint.x) < 1 &&
            Math.abs(entryLine.end.y - wall.endPoint.y) < 1;
        }
        
        // Si el air entry pertenece a esta pared
        if (matchesWall) {
          // Determinar ID: usar existente o crear nuevo
          const anyEntry = entry as any;
          let airEntryId: string;
          
          if (anyEntry.id) {
            // Usar ID existente
            airEntryId = anyEntry.id;
          } else {
            // Crear nuevo ID incrementando contador con formato de piso
            const floorPrefix = floorName === 'ground' ? '0F' : 
                               floorName === 'first' ? '1F' :
                               floorName === 'second' ? '2F' :
                               floorName === 'third' ? '3F' :
                               floorName === 'fourth' ? '4F' :
                               floorName === 'fifth' ? '5F' : '0F';
            globalTypeCounts[entry.type as keyof typeof globalTypeCounts]++;
            airEntryId = `${entry.type}_${floorPrefix}_${globalTypeCounts[entry.type as keyof typeof globalTypeCounts]}`;
          }
          
          // Usar el mismo sistema de normalización que las paredes para X,Y
          const normalizedXY = normalizeCoordinates({ 
            x: entry.position.x, 
            y: entry.position.y 
          });
          
          // Calcular la altura Z directamente en metros
          const heightInMeters = (entry.dimensions.distanceToFloor || 100) / 100; // Convertir cm a metros
          
          // Calcular la normal a la superficie de la pared
          const wallVector = {
            x: wall.endPoint.x - wall.startPoint.x,
            y: wall.endPoint.y - wall.startPoint.y
          };
          
          // Normalizar el vector de la pared
          const wallLength = Math.sqrt(wallVector.x * wallVector.x + wallVector.y * wallVector.y);
          const normalizedWallVector = {
            x: wallVector.x / wallLength,
            y: wallVector.y / wallLength
          };
          
          // La normal es perpendicular al vector de la pared (rotar 90 grados)
          const wallNormal = {
            x: -normalizedWallVector.y, // Rotar 90 grados en sentido horario
            y: normalizedWallVector.x,
            z: 0 // Normal en el plano XY
          };
          // Canvas coordinate system: Y-axis is flipped relative to world space.
          // wallNormal.x must be negated (canvas +X == world +X, so outward → negate).
          // wallNormal.y must NOT be negated (canvas Y-flip cancels, so it already
          // points inward in world space).
          const inwardWallNormal = { x: -wallNormal.x, y: wallNormal.y, z: 0 };
          
          // Crear objeto base
          const entryPropsForPosition = (entry as any).properties;
          const airEntryBase = {
            id: airEntryId,
            type: entry.type as "window" | "door" | "vent",
            position: {
              x: parseFloat(cmToM(normalizedXY.x).toFixed(5)),
              y: parseFloat(cmToM(normalizedXY.y).toFixed(5)),
              z: parseFloat(heightInMeters.toFixed(5)),
              normal: {
                x: parseFloat(wallNormal.x.toFixed(5)),
                y: parseFloat(wallNormal.y.toFixed(5)),
                z: parseFloat(wallNormal.z.toFixed(5))
              },
              ...(entry.type === 'vent' && entryPropsForPosition?.ventRotation
                ? { rotation: entryPropsForPosition.ventRotation }
                : {})
            },
            dimensions: (() => {
              const shape = ((entry.dimensions as any).shape || "rectangular") as "rectangular" | "circular";
              if (shape === "circular") {
                return {
                  diameter: parseFloat((entry.dimensions.width / 100).toFixed(5)),
                  shape: "circular" as const
                };
              } else {
                return {
                  width: parseFloat((entry.dimensions.width / 100).toFixed(5)),
                  height: parseFloat((entry.dimensions.height / 100).toFixed(5)),
                  shape: "rectangular" as const
                };
              }
            })(),
            simulation: {} as any
          };

          // Agregar propiedades específicas por tipo
          const entryProps = (entry as any).properties;
          
          if (entry.type === "window" || entry.type === "door") {
            const defaultMaterial = entry.type === "window" ? "glass" : "wood";
            const defaultEmissivity = entry.type === "window" ? 0.92 : 0.90;
            const airOrientation = (entryProps?.airOrientation as "inflow" | "outflow" | "equilibrium" | "closed") || "equilibrium";
            
            if (airOrientation === "closed") {
              airEntryBase.simulation = {
                state: "closed",
                temperature: entryProps?.temperature || 20,
                material: entryProps?.material || defaultMaterial,
                emissivity: entryProps?.emissivity ?? defaultEmissivity
              };
            } else {
              const wdFlowDir = computeWallFlowDirection(inwardWallNormal, 0, 0, 0, airOrientation);
              airEntryBase.simulation = {
                state: "open",
                airDirection: airOrientation as "inflow" | "outflow" | "equilibrium",
                flowDirection: wdFlowDir,
                verticalAngle: 0,
                horizontalAngle: 0,
                flowIntensity: airOrientation === "equilibrium" ? ("0" as any) : (entryProps?.flowIntensity || "low"),
                temperature: entryProps?.temperature || 20
              };
              if (airOrientation !== "equilibrium" && entryProps?.flowIntensity === "custom" && entryProps?.customIntensityValue !== undefined) {
                airEntryBase.simulation.customValue = entryProps.customIntensityValue;
              }
            }
            
            // Las puertas solo pueden ser rectangulares
            if (entry.type === "door") {
              airEntryBase.dimensions.shape = "rectangular";
            }
          } else if (entry.type === "vent") {
            const ventAirOrientation = entryProps?.airOrientation || "closed";
            
            let simulation: any;
            
            if (ventAirOrientation === 'closed') {
              simulation = {
                state: "closed",
                temperature: entryProps?.temperature || 20,
                material: entryProps?.material || "default",
                emissivity: entryProps?.emissivity ?? 0.90
              };
            } else {
              const vθv = entryProps?.verticalAngle ?? 0;
              const vθh = entryProps?.horizontalAngle ?? 0;
              const vRot = entryProps?.ventRotation ?? 0;
              const wallFlowDir = computeWallFlowDirection(inwardWallNormal, vθv, vθh, vRot, ventAirOrientation);
              const rawFlowType = entryProps?.flowType || "Air Velocity";
              simulation = {
                state: "open",
                temperature: entryProps?.temperature || 20,
                airDirection: ventAirOrientation as "inflow" | "outflow" | "equilibrium",
                flowDirection: wallFlowDir,
                verticalAngle: vθv,
                horizontalAngle: vθh,
                flowType: rawFlowType === "Air Mass Flow" ? "massFlow"
                  : rawFlowType === "Pressure" ? "pressure"
                  : "velocity",
                flowIntensity: ventAirOrientation === "equilibrium" ? ("0" as any) : (entryProps?.flowIntensity || "medium")
              };
              if (ventAirOrientation !== "equilibrium" && entryProps?.flowIntensity === "custom" && entryProps?.customIntensityValue !== undefined) {
                simulation.customValue = entryProps.customIntensityValue;
              }
            }
            
            airEntryBase.simulation = simulation;
          }

          wallAirEntries.push(airEntryBase as AirEntryExport);
        }
      });
      
      const startCoords = normalizeCoordinates({ x: wall.startPoint.x, y: wall.startPoint.y });
      const endCoords = normalizeCoordinates({ x: wall.endPoint.x, y: wall.endPoint.y });
      
      return {
        id: wall.id,
        start: { 
          x: parseFloat(cmToM(startCoords.x).toFixed(5)), 
          y: parseFloat(cmToM(startCoords.y).toFixed(5)) 
        },
        end: { 
          x: parseFloat(cmToM(endCoords.x).toFixed(5)), 
          y: parseFloat(cmToM(endCoords.y).toFixed(5)) 
        },
        temp: wall.properties.temperature,
        material: wall.properties.material || 'default',
        emissivity: wall.properties.emissivity ?? 0.90,
        airEntries: wallAirEntries
      };
    });

    // Filtrar el mobiliario que pertenece a este piso con coordenadas normalizadas
    const allFloorObjects = furniture.filter(obj => obj.userData?.floorName === floorName && obj.userData?.type === 'furniture');
    
    // Separar vents del resto de furniture para procesamiento diferenciado
    const ventFurnitureObjects = allFloorObjects.filter(obj => obj.userData?.furnitureType === 'vent');
    const floorFurnitureObjects = allFloorObjects.filter(obj => obj.userData?.furnitureType !== 'vent');
    
    // Initialize furniture type counters for this floor
    const furnitureTypeCounts = { 
      table: 0, 
      person: 0, 
      armchair: 0, 
      rack: 0, 
      topVentBox: 0,
      sideVentBox: 0,
      block: 0, 
      nozzle: 0,
      vent_furniture: 0,
      custom: 0 
    };
    
    // Count existing furniture by type on this floor to get proper sequential numbering
    floorFurnitureObjects.forEach(obj => {
      if (obj.userData?.id) {
        const floorPrefix = getFloorPrefix(floorName);
        // Match pattern: object_0F_type_1, object_1F_type_2, etc. (new format)
        // Also match old format: type_0F_1, type_1F_2, etc. for backwards compatibility
        const newFormatMatch = obj.userData.id.match(new RegExp(`^object_${floorPrefix}_([a-z_]+)_(\\d+)$`));
        const oldFormatMatch = obj.userData.id.match(new RegExp(`^([a-z_]+)_${floorPrefix}_(\\d+)$`));
        const match = newFormatMatch || oldFormatMatch;
        
        if (match) {
          const type = match[1] as keyof typeof furnitureTypeCounts;
          const num = parseInt(match[2]);
          if (furnitureTypeCounts[type] !== undefined && furnitureTypeCounts[type] < num) {
            furnitureTypeCounts[type] = num;
          }
        }
      }
    });
    
    const floorFurniture: FurnitureExport[] = floorFurnitureObjects.map((obj, index) => {
      // Use local coordinates directly from Three.js object (no normalization)
      // Dialog box shows coordinates in cm, JSON uses same coordinates but in meters
      
      // Generate new ID using furniture type and floor prefix
      let furnitureId: string;
      const floorPrefix = getFloorPrefix(floorName);
      if (obj.userData?.id && obj.userData.id.startsWith('object_' + floorPrefix + '_')) {
        // Use existing ID if it already follows the new format
        furnitureId = obj.userData.id;
      } else {
        // Generate new ID with object_floor_type_number format
        const furnitureType = getFurnitureTypeForId(obj.userData?.furnitureType);
        furnitureTypeCounts[furnitureType as keyof typeof furnitureTypeCounts]++;
        furnitureId = `object_${floorPrefix}_${furnitureType}_${furnitureTypeCounts[furnitureType as keyof typeof furnitureTypeCounts]}`;
      }
      
      // Extract thermal properties from userData
      const properties = obj.userData?.properties || {};
      const simulationProperties = obj.userData?.simulationProperties || {};
      
      // Compute actual dimensions in meters from base dimensions (cm) × scale
      const baseDims = obj.userData?.dimensions || { width: 80, height: 80, depth: 80 };
      const scaleX = obj.scale?.x || 1;
      const scaleY = obj.scale?.y || 1;
      const scaleZ = obj.scale?.z || 1;
      const dimensionsInMeters = {
        width: cmToM(baseDims.width * scaleX),
        height: cmToM(baseDims.height * scaleZ),
        depth: cmToM(baseDims.depth * scaleY)
      };
      
      // For racks: generate face-based export with vertices in global coordinates
      if (obj.userData?.furnitureType === 'rack') {
        const posM = {
          x: cmToM(obj.position.x),
          y: cmToM(obj.position.y),
          z: cmToM(obj.position.z)
        };
        const w = dimensionsInMeters.width / 2;
        const d = dimensionsInMeters.depth / 2;
        const h = dimensionsInMeters.height;
        
        // Build 8 corner vertices in local space (rack origin at bottom center)
        // width = X axis, depth = Y axis, height = Z axis
        const localCorners: [number, number, number][] = [
          [-w, -d, 0],   // 0: bottom-left-front
          [ w, -d, 0],   // 1: bottom-right-front
          [ w,  d, 0],   // 2: bottom-right-back
          [-w,  d, 0],   // 3: bottom-left-back
          [-w, -d, h],   // 4: top-left-front
          [ w, -d, h],   // 5: top-right-front
          [ w,  d, h],   // 6: top-right-back
          [-w,  d, h],   // 7: top-left-back
        ];
        
        // Apply rotation and translate to global coordinates
        const rotX = obj.rotation.x || 0;
        const rotY = obj.rotation.y || 0;
        const rotZ = obj.rotation.z || 0;
        
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);
        
        const transformPoint = (p: [number, number, number]): [number, number, number] => {
          let [x, y, z] = p;
          // Rotate around X
          let y1 = y * cosX - z * sinX;
          let z1 = y * sinX + z * cosX;
          // Rotate around Y
          let x2 = x * cosY + z1 * sinY;
          let z2 = -x * sinY + z1 * cosY;
          // Rotate around Z
          let x3 = x2 * cosZ - y1 * sinZ;
          let y3 = x2 * sinZ + y1 * cosZ;
          return [
            Math.round((x3 + posM.x) * 10000) / 10000,
            Math.round((y3 + posM.y) * 10000) / 10000,
            Math.round((z2 + posM.z) * 10000) / 10000
          ];
        };
        
        const gc = localCorners.map(transformPoint);
        
        const serverProps = obj.userData?.serverProperties || {};
        const chassisTemp = properties.temperature || 35;
        const inletTemp = serverProps.inletTemperature || 22;
        const outletTemp = serverProps.outletTemperature || 45;
        const chassisMat = properties.material || 'metal';
        const chassisEmis = properties.emissivity || 0.25;
        
        const serverFaceProps = {
          rackDensity: serverProps.rackDensity || 'medium',
          thermalPower_kW: serverProps.thermalPower_kW || 10,
          airFlow: serverProps.airFlow || 2395
        };
        
        const wallFaceProps = {
          material: chassisMat,
          emissivity: chassisEmis
        };
        
        const faces: Record<string, RackFaceExport> = {
          front: {
            role: 'inlet',
            vertices: [gc[2], gc[3], gc[7], gc[6]],
            ...serverFaceProps
          },
          back: {
            role: 'outlet',
            vertices: [gc[0], gc[1], gc[5], gc[4]],
            ...serverFaceProps
          },
          left: {
            role: 'wall',
            vertices: [gc[3], gc[0], gc[4], gc[7]],
            temperature: chassisTemp,
            ...wallFaceProps
          },
          right: {
            role: 'wall',
            vertices: [gc[1], gc[2], gc[6], gc[5]],
            temperature: chassisTemp,
            ...wallFaceProps
          },
          top: {
            role: 'wall',
            vertices: [gc[4], gc[5], gc[6], gc[7]],
            temperature: chassisTemp,
            ...wallFaceProps
          },
          bottom: {
            role: 'wall',
            vertices: [gc[3], gc[2], gc[1], gc[0]],
            temperature: chassisTemp,
            ...wallFaceProps
          }
        };
        
        return { id: furnitureId, faces } as FurnitureExport;
      }
      
      // For topVentBox/sideVentBox: face-based export with vent face
      if (obj.userData?.furnitureType === 'topVentBox' || obj.userData?.furnitureType === 'sideVentBox') {
        const posM = {
          x: cmToM(obj.position.x),
          y: cmToM(obj.position.y),
          z: cmToM(obj.position.z)
        };
        const w = dimensionsInMeters.width / 2;
        const d = dimensionsInMeters.depth / 2;
        const h = dimensionsInMeters.height;
        
        const localCorners: [number, number, number][] = [
          [-w, -d, 0],
          [ w, -d, 0],
          [ w,  d, 0],
          [-w,  d, 0],
          [-w, -d, h],
          [ w, -d, h],
          [ w,  d, h],
          [-w,  d, h],
        ];
        
        const rotX = obj.rotation.x || 0;
        const rotY = obj.rotation.y || 0;
        const rotZ = obj.rotation.z || 0;
        
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);
        
        const transformPoint = (p: [number, number, number]): [number, number, number] => {
          let [x, y, z] = p;
          let y1 = y * cosX - z * sinX;
          let z1 = y * sinX + z * cosX;
          let x2 = x * cosY + z1 * sinY;
          let z2 = -x * sinY + z1 * cosY;
          let x3 = x2 * cosZ - y1 * sinZ;
          let y3 = x2 * sinZ + y1 * cosZ;
          return [
            Math.round((x3 + posM.x) * 10000) / 10000,
            Math.round((y3 + posM.y) * 10000) / 10000,
            Math.round((z2 + posM.z) * 10000) / 10000
          ];
        };
        
        const gc = localCorners.map(transformPoint);
        
        const chassisTemp = properties.temperature || 35;
        const chassisMat = properties.material || 'metal';
        const chassisEmis = properties.emissivity || 0.25;
        
        const wallFaceProps = {
          material: chassisMat,
          emissivity: chassisEmis
        };
        
        const ventSimProps = simulationProperties || {};
        const ventState = ventSimProps.state || 'open';
        const sfθv = ventSimProps.verticalAngle ?? 0;
        const sfθh = ventSimProps.horizontalAngle ?? 0;
        const ventRotZ = obj.rotation.z || 0;
        const ventAirDir = (ventSimProps.airOrientation || 'outflow') as 'inflow' | 'outflow' | 'equilibrium';
        const topFlowDir = computeSurfaceFlowDirection('floor', sfθv, sfθh, ventRotZ, ventAirDir);
        const ventFaceProps = {
          state: ventState,
          temperature: ventSimProps.airTemperature || 20,
          ...(ventState === 'closed' ? {
            material: properties.material || 'default',
            emissivity: properties.emissivity || 0.90
          } : {
            airDirection: ventAirDir,
            flowDirection: topFlowDir,
            verticalAngle: sfθv,
            horizontalAngle: sfθh,
            flowType: mapFlowType(ventSimProps.flowType) || 'pressure',
            flowIntensity: ventSimProps.flowIntensity || 'medium',
            customIntensityValue: ventSimProps.customIntensityValue
          })
        };
        
        const isSideVent = obj.userData?.furnitureType === 'sideVentBox';
        
        const faces: Record<string, RackFaceExport> = {
          front: {
            role: isSideVent ? 'vent' : 'wall',
            vertices: [gc[0], gc[1], gc[5], gc[4]],
            temperature: isSideVent ? ventFaceProps.temperature : chassisTemp,
            ...(isSideVent ? ventFaceProps : wallFaceProps)
          },
          back: {
            role: 'wall',
            vertices: [gc[2], gc[3], gc[7], gc[6]],
            temperature: chassisTemp,
            ...wallFaceProps
          },
          left: {
            role: 'wall',
            vertices: [gc[3], gc[0], gc[4], gc[7]],
            temperature: chassisTemp,
            ...wallFaceProps
          },
          right: {
            role: 'wall',
            vertices: [gc[1], gc[2], gc[6], gc[5]],
            temperature: chassisTemp,
            ...wallFaceProps
          },
          top: {
            role: isSideVent ? 'wall' : 'vent',
            vertices: [gc[4], gc[5], gc[6], gc[7]],
            temperature: isSideVent ? chassisTemp : ventFaceProps.temperature,
            ...(isSideVent ? wallFaceProps : ventFaceProps)
          },
          bottom: {
            role: 'wall',
            vertices: [gc[3], gc[2], gc[1], gc[0]],
            temperature: chassisTemp,
            ...wallFaceProps
          }
        };
        
        return { id: furnitureId, faces } as FurnitureExport;
      }
      
      // Non-rack furniture: standard export with position/rotation/dimensions
      const baseSimulationProperties = {
        temperature: properties.temperature || simulationProperties.airTemperature || 20,
        material: properties.material || 'default',
        emissivity: properties.emissivity || 0.90
      };
      
      // Add vent/nozzle-specific properties if this is a vent or nozzle
      const ventSpecificProperties = (obj.userData?.furnitureType === 'vent' || obj.userData?.furnitureType === 'nozzle') ? {
        flowType: mapFlowType(simulationProperties.flowType) || 'velocity',
        flowValue: simulationProperties.flowValue,
        flowIntensity: simulationProperties.flowIntensity,
        airOrientation: simulationProperties.airOrientation,
        state: simulationProperties.state,
        customIntensityValue: simulationProperties.customIntensityValue,
        verticalAngle: simulationProperties.verticalAngle,
        horizontalAngle: simulationProperties.horizontalAngle,
        temperature: simulationProperties.airTemperature,
        normalVector: simulationProperties.normalVector
      } : {};

      const exportObject: FurnitureExport = {
        id: furnitureId,
        position: {
          x: cmToM(obj.position.x),
          y: cmToM(obj.position.y),
          z: cmToM(obj.position.z)
        },
        rotation: {
          x: obj.rotation.x || 0,
          y: obj.rotation.y || 0,
          z: obj.rotation.z || 0
        },
        dimensions: dimensionsInMeters,
        simulationProperties: {
          ...baseSimulationProperties,
          ...ventSpecificProperties
        }
      };

      // Add filePath for custom STL objects from userData
      if (obj.userData?.furnitureType === 'custom' && obj.userData?.filePath) {
        exportObject.filePath = obj.userData.filePath;
      }

      // Add nozzleProperties for nozzle furniture so it can be fully restored on import
      if (obj.userData?.furnitureType === 'nozzle' && obj.userData?.nozzleProperties) {
        (exportObject as any).nozzleProperties = obj.userData.nozzleProperties;
      }

      return exportObject;
    });

    // Obtener los parámetros específicos del piso actual
    const currentFloorParams = floorParameters?.[floorName] || { ceilingHeight: 220, floorDeck: 0 };
    const floorHeight = (currentFloorParams.ceilingHeight || roomHeight * 100) / 100;
    const floorDeckValue = (currentFloorParams.floorDeck || 0) / 100; // Convertir de cm a metros
    
    // Convertir vent_furniture a airEntries para ceiling y floor_surf
    const ceilingAirEntries: AirEntryExport[] = [];
    const floorSurfAirEntries: AirEntryExport[] = [];
    

    
    ventFurnitureObjects.forEach((ventObj, index) => {
      // Determinar si es ceiling o floor_surf usando surfaceType almacenado
      let isFloorVent: boolean;
      if (ventObj.userData?.surfaceType) {
        // Usar el surfaceType almacenado (método preferido)
        isFloorVent = ventObj.userData.surfaceType === 'floor';
      } else if (ventObj.userData?.simulationProperties?.normalVector) {
        // Fallback: usar el vector normal (z positivo = floor, z negativo = ceiling)
        isFloorVent = ventObj.userData.simulationProperties.normalVector.z > 0;
      } else {
        // Último fallback: posición Y (método menos confiable)
        isFloorVent = ventObj.position.y <= 0.1;
      }
      
      const airEntry: AirEntryExport = {
        id: ventObj.userData?.id || `vent_${floorNumber}_${ceilingAirEntries.length + floorSurfAirEntries.length + 1}`,
        type: "vent",
        position: {
          x: cmToM(ventObj.position.x), // Convertir cm a metros
          y: cmToM(ventObj.position.y), // Convertir cm a metros
          z: cmToM(ventObj.position.z), // Convertir cm a metros
          normal: {
            x: 0,
            y: 0,
            z: isFloorVent ? 1 : -1 // Normal hacia arriba para floor, hacia abajo para ceiling
          },
          ...((() => {
            const shape = ventObj.userData?.simulationProperties?.shape;
            const rot = ventObj.userData?.simulationProperties?.ventRotation;
            return (shape !== 'circular' && rot) ? { rotation: rot } : {};
          })())
        },
        dimensions: (() => {
          const sp = ventObj.userData?.simulationProperties;
          const ventShape = (sp?.shape as "rectangular" | "circular") || "rectangular";
          const baseSize = 50; // default vent size in cm
          const actualWidth = baseSize * (ventObj.scale?.x || 1);
          const actualHeight = baseSize * (ventObj.scale?.y || 1);
          if (ventShape === "circular") {
            return {
              diameter: cmToM(actualWidth),
              shape: "circular" as const
            };
          }
          return {
            width: cmToM(actualWidth),
            height: cmToM(actualHeight),
            shape: "rectangular" as const
          };
        })(),
        simulation: (() => {
          const sp = ventObj.userData?.simulationProperties;
          const ventFurnState = (sp?.state as "open" | "closed") || "closed";
          if (ventFurnState === 'closed') {
            return {
              state: ventFurnState,
              temperature: sp?.airTemperature || 20,
              material: sp?.material || "default",
              emissivity: sp?.emissivity ?? 0.90
            };
          }
          const sfAirOrientation = (sp?.airOrientation as "inflow" | "outflow" | "equilibrium") || "inflow";
          const sfθv = sp?.verticalAngle ?? 0;
          const sfθh = sp?.horizontalAngle ?? 0;
          const sfRot = sp?.ventRotation ?? 0;
          const sfFlowDir = computeSurfaceFlowDirection(
            isFloorVent ? 'floor' : 'ceiling',
            sfθv, sfθh, sfRot, sfAirOrientation
          );
          return {
            state: ventFurnState,
            temperature: sp?.airTemperature || 20,
            airDirection: sfAirOrientation,
            flowDirection: sfFlowDir,
            verticalAngle: sfθv,
            horizontalAngle: sfθh,
            flowType: mapFlowType(sp?.flowType) || "velocity",
            flowIntensity: sfAirOrientation === "equilibrium"
              ? ("0" as any)
              : ((sp?.flowIntensity as "low" | "medium" | "high" | "custom") || "medium")
          };
        })()
      };
      
      if (ventObj.userData?.simulationProperties?.state !== "closed" &&
          ventObj.userData?.simulationProperties?.flowIntensity === "custom" && 
          ventObj.userData?.simulationProperties?.customIntensityValue !== undefined) {
        airEntry.simulation.customValue = ventObj.userData.simulationProperties.customIntensityValue;
      }
      
      if (isFloorVent) {
        floorSurfAirEntries.push(airEntry);
      } else {
        ceilingAirEntries.push(airEntry);
      }
    });
    
    // Obtener temperaturas y emisividades de techo y suelo de los parámetros del wizard
    const ceilingTemp = currentFloorParams.ceilingTemperature ?? 20; // Valor por defecto 20°C
    const floorTemp = currentFloorParams.floorTemperature ?? 20; // Valor por defecto 20°C
    const ceilingEmissivity = currentFloorParams.ceilingEmissivity ?? 0.90; // Valor por defecto 0.90
    const floorEmissivity = currentFloorParams.floorEmissivity ?? 0.90; // Valor por defecto 0.90
    
    // Agregar los datos del piso al objeto de exportación usando número
    exportData.levels[floorNumber] = {
      height: floorHeight,
      deck: floorDeckValue,
      ceiling: {
        temp: ceilingTemp,
        emissivity: ceilingEmissivity,
        airEntries: ceilingAirEntries
      },
      floor: {
        temp: floorTemp,
        emissivity: floorEmissivity,
        airEntries: floorSurfAirEntries
      },
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
 * Genera el siguiente número de pared para una planta específica usando prefijo
 */
export function getNextWallNumber(walls: Wall[], floorPrefix: string): number {
  const prefixPattern = `wall_${floorPrefix}_`;
  
  // Encontrar todos los números de pared existentes para esta planta
  const existingNumbers = walls
    .filter(wall => wall.id.startsWith(prefixPattern))
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
  temperature: number = 20.0,
  material: string = 'default',
  emissivity: number = 0.90
): Wall {
  const floorPrefix = getFloorPrefix(floorName);
  const wallNumber = getNextWallNumber(existingWalls, floorPrefix);
  
  return {
    id: `wall_${floorPrefix}_${wallNumber}`,
    uuid: generateUUID(),
    floor: floorName,
    lineRef: lineToUniqueId(line),
    startPoint: { x: line.start.x, y: line.start.y },
    endPoint: { x: line.end.x, y: line.end.y },
    properties: {
      temperature: temperature,
      material: material,
      emissivity: emissivity
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
  console.log(`[FINDWALL DEBUG] Looking for wall matching line:`, {
    start: { x: line.start.x.toFixed(2), y: line.start.y.toFixed(2) },
    end: { x: line.end.x.toFixed(2), y: line.end.y.toFixed(2) }
  });
  
  const result = walls.find(wall => {
    const startMatch = arePointsEqual(wall.startPoint, line.start);
    const endMatch = arePointsEqual(wall.endPoint, line.end);
    
    console.log(`[FINDWALL DEBUG] Checking wall ${wall.id}:`, {
      wallStart: { x: wall.startPoint.x.toFixed(2), y: wall.startPoint.y.toFixed(2) },
      wallEnd: { x: wall.endPoint.x.toFixed(2), y: wall.endPoint.y.toFixed(2) },
      startMatch,
      endMatch
    });
    
    return startMatch && endMatch;
  });
  
  console.log(`[FINDWALL DEBUG] Result:`, result ? result.id : 'null');
  return result;
}

/**
 * Finds a wall with similar coordinates to preserve temperature during wall recreation
 * Uses a larger tolerance to account for floating-point precision differences
 */
export function findSimilarWallForLine(walls: Wall[], line: Line): Wall | undefined {
  const SIMILARITY_TOLERANCE = 1.0; // 1 pixel tolerance for finding similar walls
  
  const result = walls.find(wall => {
    const startMatch = arePointsEqual(wall.startPoint, line.start, SIMILARITY_TOLERANCE);
    const endMatch = arePointsEqual(wall.endPoint, line.end, SIMILARITY_TOLERANCE);
    
    return startMatch && endMatch;
  });
  
  return result;
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
  
  lines.forEach((line, index) => {
    // Check if this line already has a corresponding wall
    const existingWall = findWallForLine(existingWalls, line);
    
    if (!existingWall) {
      // Check if there's a wall with similar coordinates but different precision that might have custom temperature
      const similarWall = findSimilarWallForLine(existingWalls, line);
      const preservedTemperature = similarWall?.properties?.temperature || defaultTemperature;
      
      // Create a new wall for this line, preserving temperature if found
      const newWall = createWallFromLine(line, floorName, existingWalls.concat(wallsToAdd), preservedTemperature);
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

// ================== STAIR CONVERSION SYSTEM ==================

function getFurnitureTypeForId(furnitureType?: string): string {
  switch (furnitureType) {
    case 'table': return 'table';
    case 'person': return 'person';
    case 'armchair': return 'armchair';
    case 'rack': return 'rack';
    case 'topVentBox': return 'topVentBox';
    case 'sideVentBox': return 'sideVentBox';
    case 'block': return 'block';
    case 'nozzle': return 'nozzle';
    case 'vent': return 'vent_furniture';
    case 'custom': return 'custom';
    default: return 'block'; // Default fallback
  }
}

/**
 * Generates the next stair number for a given floor using prefix-based matching
 */
function getNextStairNumber(existingStairs: StairExportNew[], floorPrefix: string): number {
  const prefixPattern = `stair_${floorPrefix}_`;
  
  // Find all existing stair numbers for this floor
  const existingNumbers = existingStairs
    .filter(stair => stair.id.startsWith(prefixPattern))
    .map(stair => {
      const match = stair.id.match(/(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(num => !isNaN(num));
  
  // Return the next available number
  return existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
}

/**
 * Global counter for stair line IDs
 */
let globalStairLineCounter = 1;

/**
 * Generates unique ID for stair lines
 */
function generateStairLineId(): string {
  return `stair_line_${globalStairLineCounter++}`;
}

/**
 * Creates a stair line from two points
 */
function createStairLineFromSegment(startPoint: Point2D, endPoint: Point2D): StairLineExport {
  const startCoords = normalizeCoordinates(startPoint);
  const endCoords = normalizeCoordinates(endPoint);
  
  return {
    id: generateStairLineId(),
    start: { 
      x: parseFloat(cmToM(startCoords.x).toFixed(5)), 
      y: parseFloat(cmToM(startCoords.y).toFixed(5)) 
    },
    end: { 
      x: parseFloat(cmToM(endCoords.x).toFixed(5)), 
      y: parseFloat(cmToM(endCoords.y).toFixed(5)) 
    }
  };
}

/**
 * Converts a StairPolygon into an array of StairLineExport
 */
function stairPolygonToLines(stairPolygon: StairPolygon): StairLineExport[] {
  const lines: StairLineExport[] = [];
  
  if (stairPolygon.points.length < 3) {
    return lines; // Need at least 3 points to form a polygon
  }
  
  // Create lines between consecutive points
  for (let i = 0; i < stairPolygon.points.length; i++) {
    const startPoint = stairPolygon.points[i];
    const endPoint = stairPolygon.points[(i + 1) % stairPolygon.points.length]; // Wrap around to first point
    
    const line = createStairLineFromSegment(startPoint, endPoint);
    lines.push(line);
  }
  
  return lines;
}

/**
 * Converts StairPolygon to StairExportNew with proper ID nomenclature
 */
export function convertStairPolygonToExport(
  stairPolygon: StairPolygon, 
  floorName: string, 
  existingStairs: StairExportNew[]
): StairExportNew {
  const floorPrefix = getFloorPrefix(floorName);
  const stairNumber = getNextStairNumber(existingStairs, floorPrefix);
  
  // Generate stair ID: stair_0F_1, stair_1F_2, etc.
  const stairId = `stair_${floorPrefix}_${stairNumber}`;
  
  // Convert polygon points to lines
  const lines = stairPolygonToLines(stairPolygon);
  
  // Validate minimum polygon structure
  if (lines.length < 3) {
    console.warn(`Stair ${stairId} has insufficient points for a valid polygon`);
  }
  
  return {
    id: stairId,
    lines: lines,
    connectsTo: stairPolygon.connectsTo,
    temp: stairPolygon.temperature,
    emissivity: stairPolygon.emissivity ?? 0.90
  };
}

/**
 * Converts array of StairPolygons to array of StairExportNew for a floor
 * Only exports stairs that are owned by this floor (not imported projections)
 */
export function convertStairPolygonsToExport(
  stairPolygons: StairPolygon[], 
  floorName: string
): StairExportNew[] {
  const exportedStairs: StairExportNew[] = [];
  
  stairPolygons.forEach(stairPolygon => {
    // Only export stairs owned by this floor (not projections from other floors)
    if (!stairPolygon.isImported) {
      const exportedStair = convertStairPolygonToExport(stairPolygon, floorName, exportedStairs);
      exportedStairs.push(exportedStair);
    }
  });
  
  return exportedStairs;
}

// ================== FLOOR NAMING UTILITIES ==================

/**
 * Gets floor prefix for consistent ID generation across walls and stairs
 * Replaces getFloorIndex function with direct mapping
 */
function getFloorPrefix(floorName: string): string {
  return floorName === 'ground' ? '0F' : 
         floorName === 'first' ? '1F' :
         floorName === 'second' ? '2F' :
         floorName === 'third' ? '3F' :
         floorName === 'fourth' ? '4F' :
         floorName === 'fifth' ? '5F' : '0F';
}

// ================== STAIR UTILITY FUNCTIONS ==================

/**
 * Extracts floor prefix from stair ID (e.g., "stair_1F_2" -> "1F")
 */
export function getFloorPrefixFromStairId(stairId: string): string {
  const match = stairId.match(/stair_(\d+F)_\d+/);
  return match ? match[1] : '0F';
}

/**
 * Validates that a stair polygon has minimum required structure
 */
export function validateStairPolygon(stairPolygon: StairPolygon): boolean {
  if (!stairPolygon.points || stairPolygon.points.length < 3) {
    return false;
  }
  
  // Check for valid coordinates
  return stairPolygon.points.every(point => 
    typeof point.x === 'number' && 
    typeof point.y === 'number' && 
    !isNaN(point.x) && 
    !isNaN(point.y)
  );
}

/**
 * Calculates the geometric center of a stair polygon
 */
export function calculateStairCenter(stairPolygon: StairPolygon): Point2D {
  if (!stairPolygon.points || stairPolygon.points.length === 0) {
    return { x: 0, y: 0 };
  }
  
  const center = stairPolygon.points.reduce(
    (acc, point) => ({
      x: acc.x + point.x / stairPolygon.points.length,
      y: acc.y + point.y / stairPolygon.points.length
    }),
    { x: 0, y: 0 }
  );
  
  return center;
}

/**
 * Calculates the approximate area of a stair polygon using shoelace formula
 */
export function calculateStairArea(stairPolygon: StairPolygon): number {
  if (!stairPolygon.points || stairPolygon.points.length < 3) {
    return 0;
  }
  
  let area = 0;
  const points = stairPolygon.points;
  
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  
  return Math.abs(area) / 2;
}