import { Vec2 } from "@garage/sim-core";

export interface AnnotatedWall {
  id: string;
  a: Vec2;
  b: Vec2;
}

export interface NoGoZone {
  id: string;
  min: Vec2;
  max: Vec2;
}

export type Annotation = { kind: "wall"; item: AnnotatedWall } | { kind: "no-go"; item: NoGoZone };

/**
 * What the user draws on top of the robot's map: certain walls and no-go zones.
 * It belongs to the robot, not to the simulated world, so it works the same
 * against the real robot. Later it is sent to the PLC as MapAnnotations.
 */
export class MapAnnotations {
  readonly walls: AnnotatedWall[] = [];
  readonly noGoZones: NoGoZone[] = [];
  private counter = 0;

  addWall(a: Vec2, b: Vec2): AnnotatedWall {
    const wall = { id: `wall-${++this.counter}`, a, b };
    this.walls.push(wall);
    return wall;
  }

  addNoGoZone(corner1: Vec2, corner2: Vec2): NoGoZone {
    const zone = {
      id: `no-go-${++this.counter}`,
      min: new Vec2(Math.min(corner1.x, corner2.x), Math.min(corner1.y, corner2.y)),
      max: new Vec2(Math.max(corner1.x, corner2.x), Math.max(corner1.y, corner2.y)),
    };
    this.noGoZones.push(zone);
    return zone;
  }

  findAt(point: Vec2, toleranceInM: number): Annotation | undefined {
    const wall = this.walls.find((w) => distanceToSegment(point, w.a, w.b) <= toleranceInM);
    if (wall) return { kind: "wall", item: wall };
    const zone = this.noGoZones.find((z) => point.x >= z.min.x && point.x <= z.max.x && point.y >= z.min.y && point.y <= z.max.y);
    return zone ? { kind: "no-go", item: zone } : undefined;
  }

  remove(id: string): void {
    removeWhere(this.walls, (w) => w.id === id);
    removeWhere(this.noGoZones, (z) => z.id === id);
  }

  clear(): void {
    this.walls.length = 0;
    this.noGoZones.length = 0;
  }

  toJson(): object {
    return {
      walls: this.walls.map((w) => ({ id: w.id, a: [w.a.x, w.a.y], b: [w.b.x, w.b.y] })),
      noGoZones: this.noGoZones.map((z) => ({ id: z.id, min: [z.min.x, z.min.y], max: [z.max.x, z.max.y] })),
    };
  }
}

function removeWhere<T>(list: T[], predicate: (item: T) => boolean): void {
  const index = list.findIndex(predicate);
  if (index >= 0) list.splice(index, 1);
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const edge = b.subtract(a);
  const lengthSquared = edge.dot(edge);
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, p.subtract(a).dot(edge) / lengthSquared));
  return p.subtract(a.add(edge.scale(t))).length();
}
