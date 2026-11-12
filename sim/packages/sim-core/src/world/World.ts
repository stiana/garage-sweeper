import { Pose2D } from "../math/Pose2D";
import { Vec2 } from "../math/Vec2";
import {
  type Circle,
  type Segment,
  containsPoint,
  pointSegmentDistance,
  rayCircleDistance,
  raySegmentDistance,
  rectCorners,
} from "./geometry";
import type { PlacedShape, WorldDefinition } from "./types";

export interface RayHit {
  distanceInM: number;
  reflectivity: number;
}

const DEFAULT_REFLECTIVITY = 0.7;
const DEFAULT_FRICTION = 1;

/**
 * The true garage. Only the simulator may look at it: the robot only ever
 * sees it through its sensors.
 */
export class World {
  private definition: WorldDefinition;
  private cachedVersion = -1;
  private segments: Segment[] = [];
  private circles: Circle[] = [];
  private _version = 0;

  constructor(definition: WorldDefinition) {
    this.definition = structuredClone(definition);
  }

  get version(): number {
    return this._version;
  }

  get name(): string {
    return this.definition.name;
  }

  get objects(): readonly PlacedShape[] {
    return this.definition.objects;
  }

  get floorZones(): readonly PlacedShape[] {
    return this.definition.floorZones;
  }

  get walls(): WorldDefinition["walls"] {
    return this.definition.walls;
  }

  get startPose(): Pose2D {
    const s = this.definition.start;
    return new Pose2D(s.x, s.y, s.thetaInRad);
  }

  get dockPose(): Pose2D {
    const d = this.definition.dock;
    return new Pose2D(d.x, d.y, d.thetaInRad);
  }

  /** Replaces the whole garage in place, so a running simulation keeps going. */
  replace(definition: WorldDefinition): void {
    this.definition = structuredClone(definition);
    this.touch();
  }

  toDefinition(): WorldDefinition {
    return structuredClone(this.definition);
  }

  find(id: string): PlacedShape | undefined {
    return this.definition.objects.find((o) => o.id === id) ?? this.definition.floorZones.find((z) => z.id === id);
  }

  /** Topmost object or floor zone under the point, for picking in the editor. */
  findAt(point: Vec2): PlacedShape | undefined {
    const objects = [...this.definition.objects].reverse();
    const zones = [...this.definition.floorZones].reverse();
    return objects.find((o) => containsPoint(o, point)) ?? zones.find((z) => containsPoint(z, point));
  }

  add(placed: PlacedShape): void {
    const list = placed.kind === "oil" ? this.definition.floorZones : this.definition.objects;
    list.push(structuredClone(placed));
    this.touch();
  }

  update(id: string, changes: Partial<Omit<PlacedShape, "id">>): void {
    const target = this.find(id);
    if (!target) return;
    Object.assign(target, structuredClone(changes));
    this.touch();
  }

  remove(id: string): void {
    this.definition.objects = this.definition.objects.filter((o) => o.id !== id);
    this.definition.floorZones = this.definition.floorZones.filter((z) => z.id !== id);
    this.touch();
  }

  raycast(origin: Vec2, angleInRad: number, maxRangeInM: number): RayHit | null {
    this.rebuildIfChanged();
    const direction = Vec2.fromAngle(angleInRad);
    let best: RayHit | null = null;
    for (const segment of this.segments) {
      const distance = raySegmentDistance(origin, direction, segment);
      if (distance !== null && distance <= maxRangeInM && (!best || distance < best.distanceInM)) {
        best = { distanceInM: distance, reflectivity: segment.reflectivity };
      }
    }
    for (const circle of this.circles) {
      const distance = rayCircleDistance(origin, direction, circle);
      if (distance !== null && distance <= maxRangeInM && (!best || distance < best.distanceInM)) {
        best = { distanceInM: distance, reflectivity: circle.reflectivity };
      }
    }
    return best;
  }

  collidesWithCircle(center: Vec2, radiusInM: number): boolean {
    this.rebuildIfChanged();
    if (this.segments.some((s) => pointSegmentDistance(center, s) < radiusInM)) return true;
    if (this.circles.some((c) => c.center.subtract(center).length() < c.radius + radiusInM)) return true;
    return this.definition.objects.some((o) => containsPoint(o, center));
  }

  frictionAt(point: Vec2): number {
    let friction = DEFAULT_FRICTION;
    for (const zone of this.definition.floorZones) {
      if (containsPoint(zone, point)) friction = Math.min(friction, zone.friction ?? DEFAULT_FRICTION);
    }
    return friction;
  }

  private touch(): void {
    this._version++;
  }

  private rebuildIfChanged(): void {
    if (this.cachedVersion === this._version) return;
    this.segments = [];
    this.circles = [];
    for (const wall of this.definition.walls) {
      const points = wall.points.map(([x, y]) => new Vec2(x, y));
      const count = wall.closed ? points.length : points.length - 1;
      for (let i = 0; i < count; i++) {
        this.segments.push({ a: points[i]!, b: points[(i + 1) % points.length]!, reflectivity: wall.reflectivity });
      }
    }
    for (const placed of this.definition.objects) {
      const reflectivity = placed.reflectivity ?? DEFAULT_REFLECTIVITY;
      if (placed.shape.type === "circle") {
        this.circles.push({ center: new Vec2(placed.x, placed.y), radius: placed.shape.radiusInM, reflectivity });
        continue;
      }
      const corners = rectCorners(placed);
      for (let i = 0; i < corners.length; i++) {
        this.segments.push({ a: corners[i]!, b: corners[(i + 1) % corners.length]!, reflectivity });
      }
    }
    this.cachedVersion = this._version;
  }
}
