export type ShapeDefinition =
  | { type: "rect"; widthInM: number; lengthInM: number }
  | { type: "circle"; radiusInM: number };

/** A shape placed in the world. A rect's length runs along its heading. */
export interface PlacedShape {
  id: string;
  kind: string;
  label: string;
  shape: ShapeDefinition;
  x: number;
  y: number;
  thetaInRad: number;
  /** 0 = absorbs everything (black), 1 = reflects well. Used by LIDAR dropout. */
  reflectivity?: number;
  /** Floor zones only. 1 = normal concrete, lower = slippery. */
  friction?: number;
}

export interface WallDefinition {
  id: string;
  points: [number, number][];
  closed: boolean;
  reflectivity: number;
}

export interface PoseDefinition {
  x: number;
  y: number;
  thetaInRad: number;
}

export interface WorldDefinition {
  name: string;
  walls: WallDefinition[];
  objects: PlacedShape[];
  floorZones: PlacedShape[];
  start: PoseDefinition;
  dock: PoseDefinition;
}
