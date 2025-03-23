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
}

export interface StairPolygon {
  id: string;
  points: Point[];
  floor: string;
  direction?: "up" | "down";
  connectsTo?: string;
  sourceFloor?: string; // Track where the stair was originally defined
  isImported?: boolean; // Flag to identify if this stair was imported from another floor
}

export interface Measurement {
  start: Point;
  end: Point;
  distance: number;
  isPreview?: boolean;
}