import * as THREE from 'three';
import type { StairPolygon } from '@/types';

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
}

// Propiedades específicas para vents
interface VentSimulationProperties {
  flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
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
    // Propiedades comunes para todos los tipos
    state?: "open" | "closed";
    temperature?: number;
    flowIntensity?: "low" | "medium" | "high" | "custom";
    airDirection?: "inflow" | "outflow";
    customValue?: number;
    // Propiedades específicas para vents
    flowType?: "Air Mass Flow" | "Air Velocity" | "Pressure";
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
  position: Position3D;
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  scale: {
    x: number;
    y: number;
    z: number;
  };
  // File path for custom STL objects
  filePath?: string;
  // Propiedades de simulación térmica para TODOS los tipos de muebles
  simulationProperties: {
    temperature: number;    // Temperatura del objeto (°C)
    emissivity: number;     // Emisividad térmica (0.0 - 1.0)
    
    // Propiedades adicionales solo para vents
    flowType?: 'Air Mass Flow' | 'Air Velocity' | 'Pressure';
    flowValue?: number;
    flowIntensity?: 'low' | 'medium' | 'high' | 'custom';
    airOrientation?: 'inflow' | 'outflow';
    state?: 'open' | 'closed';
    customIntensityValue?: number;
    verticalAngle?: number;
    horizontalAngle?: number;
    airTemperature?: number;
    normalVector?: { x: number; y: number; z: number };
  };
}

interface FloorExport {
  height: number;
  floorDeck: number;
  ceiling: {
    temp: number;
    airEntries: AirEntryExport[];
  };
  floor_surf: {
    temp: number;
    airEntries: AirEntryExport[];
  };
  walls: WallExport[];
  stairs: StairExportNew[];
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
function mapFlowType(flowType?: string): "Air Mass Flow" | "Air Velocity" | "Pressure" | undefined {
  switch (flowType) {
    case 'Air Mass Flow':
    case 'massFlow':
      return 'Air Mass Flow';
    case 'Air Velocity':
    case 'velocity':
      return 'Air Velocity';
    case 'Pressure':
    case 'pressure':
      return 'Pressure';
    default:
      return undefined;
  }
}

/**
 * Convierte los datos del diseño en un formato JSON exportable para simulación
 */
export function generateSimulationData(
  floors: Record<string, FloorData>,
  furniture: THREE.Object3D[] = [],
  roomHeight: number = 2.5,
  floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number; ceilingTemperature?: number; floorTemperature?: number }>
): SimulationExport {
  // Reset global stair line counter for each export
  globalStairLineCounter = 1;
  
  const exportData: SimulationExport = {
    version: "1.0",
    floors: {}
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

    // Convertir paredes - usar sincronización para asegurar datos limpios
    const synchronizedWalls = prepareSynchronizedWalls(
      floorData.lines, 
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
          
          // Crear objeto base
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
              }
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
            airEntryBase.simulation = {
              state: (entryProps?.state as "open" | "closed") || "closed",
              temperature: entryProps?.temperature || 20,
              airDirection: (entryProps?.airOrientation as "inflow" | "outflow") || "inflow",
              flowIntensity: entryProps?.flowIntensity || "low"
            };
            
            // Agregar customValue si el usuario eligió "custom"
            if (entryProps?.flowIntensity === "custom" && entryProps?.customIntensityValue !== undefined) {
              airEntryBase.simulation.customValue = entryProps.customIntensityValue;
            }
            
            // Las puertas solo pueden ser rectangulares
            if (entry.type === "door") {
              airEntryBase.dimensions.shape = "rectangular";
            }
          } else if (entry.type === "vent") {
            // Build simulation object in dialog order
            const simulation: any = {
              // 1. Element Status (same as windows/doors)
              state: (entryProps?.state as "open" | "closed") || "closed",
              
              // 2. Air Inflow Temperature (same as windows/doors)
              temperature: entryProps?.temperature || 20,
              
              // 3. Air Direction 
              airDirection: (entryProps?.airOrientation as "inflow" | "outflow") || "inflow",
              
              // 4. Air Orientation (vent-specific, only when state is open and direction is inflow)
              ...(entryProps?.state === "open" && entryProps?.airOrientation === "inflow" ? {
                airOrientation: {
                  verticalAngle: entryProps?.verticalAngle || 0,
                  horizontalAngle: entryProps?.horizontalAngle || 0
                }
              } : {}),
              
              // 5. Flow Type (vent-specific)
              flowType: (() => {
                const flowType = entryProps?.flowType || "Air Velocity";
                // Convert to simple lowercase format
                if (flowType === "Air Mass Flow") return "massFlow";
                if (flowType === "Air Velocity") return "velocity";
                if (flowType === "Pressure") return "pressure";
                return "velocity"; // default
              })(),
              
              // 6. Flow Intensity (same as windows/doors)
              flowIntensity: entryProps?.flowIntensity || "medium"
            };
            
            // 7. Custom Value (when flow intensity is custom)
            if (entryProps?.flowIntensity === "custom" && entryProps?.customIntensityValue !== undefined) {
              simulation.customValue = entryProps.customIntensityValue;
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
      car: 0, 
      block: 0, 
      vent_furniture: 0,
      custom: 0 
    };
    
    // Count existing furniture by type on this floor to get proper sequential numbering
    floorFurnitureObjects.forEach(obj => {
      if (obj.userData?.id) {
        const floorPrefix = getFloorPrefix(floorName);
        // Match pattern: type_0F_1, type_1F_2, etc.
        const match = obj.userData.id.match(new RegExp(`^([a-z_]+)_${floorPrefix}_(\\d+)$`));
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
      if (obj.userData?.id && obj.userData.id.includes('_' + getFloorPrefix(floorName) + '_')) {
        // Use existing ID if it already follows the new format
        furnitureId = obj.userData.id;
      } else {
        // Generate new ID with type_floor_number format
        const furnitureType = getFurnitureTypeForId(obj.userData?.furnitureType);
        const floorPrefix = getFloorPrefix(floorName);
        furnitureTypeCounts[furnitureType as keyof typeof furnitureTypeCounts]++;
        furnitureId = `${furnitureType}_${floorPrefix}_${furnitureTypeCounts[furnitureType as keyof typeof furnitureTypeCounts]}`;
      }
      
      // Extract thermal properties from userData
      const properties = obj.userData?.properties || {};
      const simulationProperties = obj.userData?.simulationProperties || {};
      
      // Build base simulation properties for all furniture types
      const baseSimulationProperties = {
        temperature: properties.temperature || simulationProperties.airTemperature || 20,
        emissivity: properties.emissivity || 0.90
      };
      
      // Add vent-specific properties if this is a vent
      const ventSpecificProperties = obj.userData?.furnitureType === 'vent' ? {
        flowType: simulationProperties.flowType,
        flowValue: simulationProperties.flowValue,
        flowIntensity: simulationProperties.flowIntensity,
        airOrientation: simulationProperties.airOrientation,
        state: simulationProperties.state,
        customIntensityValue: simulationProperties.customIntensityValue,
        verticalAngle: simulationProperties.verticalAngle,
        horizontalAngle: simulationProperties.horizontalAngle,
        airTemperature: simulationProperties.airTemperature,
        normalVector: simulationProperties.normalVector
      } : {};
      
      const scaleValues = {
        x: obj.scale?.x || 1,
        y: obj.scale?.y || 1,
        z: obj.scale?.z || 1
      };

      console.log('[SCALE DEBUG 5] JSON Export - ID:', furnitureId);
      console.log('[SCALE DEBUG 5] Type:', obj.userData?.furnitureType);
      console.log('[SCALE DEBUG 5] Raw obj.scale:', obj.scale);
      console.log('[SCALE DEBUG 5] Export scale values:', scaleValues);

      const exportObject: FurnitureExport = {
        id: furnitureId,
        position: {
          x: cmToM(obj.position.x), // Direct conversion: cm to meters
          y: cmToM(obj.position.y), // Direct conversion: cm to meters  
          z: cmToM(obj.position.z)  // Direct conversion: cm to meters
        },
        rotation: {
          x: obj.rotation.x || 0, // Keep radians (SI units)
          y: obj.rotation.y || 0, // Keep radians (SI units)
          z: obj.rotation.z || 0  // Keep radians (SI units)
        },
        scale: scaleValues,
        // Include simulation properties for ALL furniture types
        simulationProperties: {
          ...baseSimulationProperties,
          ...ventSpecificProperties
        }
      };

      // Add filePath for custom STL objects from userData
      if (obj.userData?.furnitureType === 'custom' && obj.userData?.filePath) {
        exportObject.filePath = obj.userData.filePath;
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
          x: parseFloat(ventObj.position.x.toFixed(5)),
          y: parseFloat(ventObj.position.y.toFixed(5)), // Y se mantiene como Y
          z: parseFloat(ventObj.position.z.toFixed(5)), // Z se mantiene como Z
          normal: {
            x: 0,
            y: 0,
            z: isFloorVent ? 1 : -1 // Normal hacia arriba para floor, hacia abajo para ceiling
          }
        },
        dimensions: {
          width: parseFloat((ventObj.scale.x * 0.6).toFixed(5)), // Tamaño basado en escala
          height: parseFloat((ventObj.scale.z * 0.6).toFixed(5)),
          shape: "rectangular" as const
        },
        simulation: {
          state: (ventObj.userData?.simulationProperties?.state as "open" | "closed") || "closed",
          temperature: ventObj.userData?.simulationProperties?.airTemperature || 20,
          airDirection: (ventObj.userData?.simulationProperties?.airOrientation as "inflow" | "outflow") || "inflow",
          
          // Air Orientation (FurnVent-specific, matching AirEntry format exactly)
          ...(ventObj.userData?.simulationProperties?.state === "open" && 
              ventObj.userData?.simulationProperties?.airOrientation === "inflow" ? {
            airOrientation: {
              verticalAngle: ventObj.userData?.simulationProperties?.verticalAngle || 0,
              horizontalAngle: ventObj.userData?.simulationProperties?.horizontalAngle || 0
            }
          } : {}),
          
          flowType: mapFlowType(ventObj.userData?.simulationProperties?.flowType) || "Air Velocity",
          flowIntensity: (ventObj.userData?.simulationProperties?.flowIntensity as "low" | "medium" | "high" | "custom") || "medium"
        }
      };
      
      // Add customValue if flow intensity is custom (matching AirEntry pattern)
      if (ventObj.userData?.simulationProperties?.flowIntensity === "custom" && 
          ventObj.userData?.simulationProperties?.customIntensityValue !== undefined) {
        airEntry.simulation.customValue = ventObj.userData.simulationProperties.customIntensityValue;
      }
      
      if (isFloorVent) {
        floorSurfAirEntries.push(airEntry);
      } else {
        ceilingAirEntries.push(airEntry);
      }
    });
    
    // Obtener temperaturas de techo y suelo de los parámetros del wizard
    const ceilingTemp = currentFloorParams.ceilingTemperature ?? 20; // Valor por defecto 20°C
    const floorTemp = currentFloorParams.floorTemperature ?? 20; // Valor por defecto 20°C
    
    // Agregar los datos del piso al objeto de exportación usando número
    exportData.floors[floorNumber] = {
      height: floorHeight,
      floorDeck: floorDeckValue,
      ceiling: {
        temp: ceilingTemp,
        airEntries: ceilingAirEntries
      },
      floor_surf: {
        temp: floorTemp,
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
  temperature: number = 20.0
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

/**
 * Finds a wall with similar coordinates to preserve temperature during wall recreation
 * Uses a larger tolerance to account for floating-point precision differences
 */
export function findSimilarWallForLine(walls: Wall[], line: Line): Wall | undefined {
  const SIMILARITY_TOLERANCE = 1.0; // 1 pixel tolerance for finding similar walls
  
  console.log(`🔍 [SIMILAR WALL] Looking for similar wall for line:`, { start: line.start, end: line.end });
  console.log(`🔍 [SIMILAR WALL] Checking against ${walls.length} walls with tolerance ${SIMILARITY_TOLERANCE}`);
  
  const result = walls.find(wall => {
    const startMatch = arePointsEqual(wall.startPoint, line.start, SIMILARITY_TOLERANCE);
    const endMatch = arePointsEqual(wall.endPoint, line.end, SIMILARITY_TOLERANCE);
    
    console.log(`🔍 [SIMILAR WALL] Wall ${wall.id}:`, {
      wallStart: wall.startPoint,
      wallEnd: wall.endPoint,
      startMatch,
      endMatch,
      temp: wall.properties.temperature
    });
    
    return startMatch && endMatch;
  });
  
  console.log(`🔍 [SIMILAR WALL] Found similar wall:`, result ? { id: result.id, temp: result.properties.temperature } : 'none');
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
  console.log(`🔧 [WALL SYNC] syncWallsWithLines called for floor: ${floorName}`);
  console.log(`🔧 [WALL SYNC] Lines: ${lines.length}, Existing walls: ${existingWalls.length}, Default temp: ${defaultTemperature}`);
  
  // Step 1: Remove orphaned walls (walls that don't have corresponding lines)
  const validWalls = removeOrphanedWalls(existingWalls, lines);
  console.log(`🔧 [WALL SYNC] After removing orphans: ${validWalls.length} valid walls`);
  
  // Step 2: Add missing walls (lines that don't have corresponding walls)
  const syncedWalls = addMissingWalls(lines, validWalls, floorName, defaultTemperature);
  console.log(`🔧 [WALL SYNC] Final result: ${syncedWalls.length} total walls`);
  
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
  console.log(`🔧 [WALL SYNC] addMissingWalls called for floor: ${floorName}`);
  console.log(`🔧 [WALL SYNC] Input: ${lines.length} lines, ${existingWalls.length} existing walls`);
  console.log(`🔧 [WALL SYNC] Existing walls:`, existingWalls.map(w => ({ id: w.id, temp: w.properties.temperature })));
  
  const wallsToAdd: Wall[] = [];
  
  lines.forEach((line, index) => {
    // Check if this line already has a corresponding wall
    const existingWall = findWallForLine(existingWalls, line);
    
    if (!existingWall) {
      console.log(`🔧 [WALL SYNC] Line ${index} needs new wall:`, { start: line.start, end: line.end });
      
      // Check if there's a wall with similar coordinates but different precision that might have custom temperature
      const similarWall = findSimilarWallForLine(existingWalls, line);
      const preservedTemperature = similarWall?.properties?.temperature || defaultTemperature;
      
      console.log(`🔧 [WALL SYNC] Similar wall found:`, similarWall ? { id: similarWall.id, temp: similarWall.properties.temperature } : 'none');
      console.log(`🔧 [WALL SYNC] Using temperature: ${preservedTemperature} (default: ${defaultTemperature})`);
      
      // Create a new wall for this line, preserving temperature if found
      const newWall = createWallFromLine(line, floorName, existingWalls.concat(wallsToAdd), preservedTemperature);
      console.log(`🔧 [WALL SYNC] Created new wall:`, { id: newWall.id, temp: newWall.properties.temperature });
      wallsToAdd.push(newWall);
    } else {
      console.log(`🔧 [WALL SYNC] Line ${index} has existing wall:`, { id: existingWall.id, temp: existingWall.properties.temperature });
    }
  });
  
  console.log(`🔧 [WALL SYNC] Result: ${wallsToAdd.length} walls added, ${existingWalls.length + wallsToAdd.length} total walls`);
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
    case 'car': return 'car';
    case 'block': return 'block';
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
    temp: stairPolygon.temperature
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