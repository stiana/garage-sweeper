export class Vec2 {
  constructor(public readonly x: number, public readonly y: number) {}

  static fromAngle(angleInRad: number, length = 1): Vec2 {
    return new Vec2(Math.cos(angleInRad) * length, Math.sin(angleInRad) * length);
  }

  add(other: Vec2): Vec2 {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  subtract(other: Vec2): Vec2 {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  scale(factor: number): Vec2 {
    return new Vec2(this.x * factor, this.y * factor);
  }

  dot(other: Vec2): number {
    return this.x * other.x + this.y * other.y;
  }

  cross(other: Vec2): number {
    return this.x * other.y - this.y * other.x;
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  rotate(angleInRad: number): Vec2 {
    const c = Math.cos(angleInRad);
    const s = Math.sin(angleInRad);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }
}
