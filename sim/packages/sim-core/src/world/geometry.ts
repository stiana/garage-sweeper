import { Vec2 } from "../math/Vec2";
import type { PlacedShape } from "./types";

export interface Segment {
  a: Vec2;
  b: Vec2;
  reflectivity: number;
}

export interface Circle {
  center: Vec2;
  radius: number;
  reflectivity: number;
}

export function rectCorners(placed: PlacedShape): Vec2[] {
  if (placed.shape.type !== "rect") return [];
  const halfLength = placed.shape.lengthInM / 2;
  const halfWidth = placed.shape.widthInM / 2;
  const center = new Vec2(placed.x, placed.y);
  return [
    new Vec2(halfLength, halfWidth),
    new Vec2(-halfLength, halfWidth),
    new Vec2(-halfLength, -halfWidth),
    new Vec2(halfLength, -halfWidth),
  ].map((corner) => corner.rotate(placed.thetaInRad).add(center));
}

export function containsPoint(placed: PlacedShape, point: Vec2): boolean {
  const local = point.subtract(new Vec2(placed.x, placed.y)).rotate(-placed.thetaInRad);
  if (placed.shape.type === "circle") return local.length() <= placed.shape.radiusInM;
  return Math.abs(local.x) <= placed.shape.lengthInM / 2 && Math.abs(local.y) <= placed.shape.widthInM / 2;
}

/** Distance along the ray to the segment, or null when the ray misses it. */
export function raySegmentDistance(origin: Vec2, direction: Vec2, segment: Segment): number | null {
  const edge = segment.b.subtract(segment.a);
  const denominator = direction.cross(edge);
  if (Math.abs(denominator) < 1e-12) return null;
  const toStart = segment.a.subtract(origin);
  const t = toStart.cross(edge) / denominator;
  const u = toStart.cross(direction) / denominator;
  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}

/** Distance along the ray to the circle's outer edge, or null when the ray misses it. */
export function rayCircleDistance(origin: Vec2, direction: Vec2, circle: Circle): number | null {
  const toCenter = circle.center.subtract(origin);
  const along = toCenter.dot(direction);
  const closestSquared = toCenter.dot(toCenter) - along * along;
  const radiusSquared = circle.radius * circle.radius;
  if (closestSquared > radiusSquared) return null;
  const halfChord = Math.sqrt(radiusSquared - closestSquared);
  const near = along - halfChord;
  if (near >= 0) return near;
  const far = along + halfChord;
  return far >= 0 ? far : null;
}

export function pointSegmentDistance(point: Vec2, segment: Segment): number {
  const edge = segment.b.subtract(segment.a);
  const lengthSquared = edge.dot(edge);
  if (lengthSquared === 0) return point.subtract(segment.a).length();
  const t = Math.max(0, Math.min(1, point.subtract(segment.a).dot(edge) / lengthSquared));
  return point.subtract(segment.a.add(edge.scale(t))).length();
}
