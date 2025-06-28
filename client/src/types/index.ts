export interface Point {
  x: number;
  y: number;
}

export interface Line {
  start: Point;
  end: Point;
  id?: string; // Optional ID used in grid and coordinate system lines
}

export interface AirEntry {
  type: "window" | "door" | "vent";
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
  lineId?: string; // Optional reference to the id of the line this entry is attached to
  id?: string; // Unique identifier for the air entry (e.g., "window_1", "door_2")
}

export interface StairPolygon {
  id: string;
  points: Point[];
  floor: string;
  connectsTo?: string;
  sourceFloor?: string; // Track where the stair was originally defined
  isImported?: boolean; // Flag to identify if this stair was imported from another floor
  temperature?: number; // Temperature property for thermal simulation
}

// New export types for improved JSON structure
export interface StairLineExport {
  id: string;
  start: Point;
  end: Point;
}

export interface StairExportNew {
  id: string;
  lines: StairLineExport[];
  connectsTo?: string;
}

export interface Measurement {
  start: Point;
  end: Point;
  distance: number;
  isPreview?: boolean;
}

export interface Wall {
  id: string; // Formato: "0F_wall1", "1F_wall3", etc.
  uuid: string; // UUID único para trazabilidad
  floor: string; // "Planta Baja", "Primera Planta", etc.
  lineRef: string; // Referencia única a la línea asociada
  startPoint: Point;
  endPoint: Point;
  properties: {
    temperature: number; // En grados Celsius
  };
}