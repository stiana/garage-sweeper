import { normalizeAngle } from "./angles";
import { Vec2 } from "./Vec2";

/** Position and heading in the plane. Heading is counter-clockwise from the x-axis. */
export class Pose2D {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly thetaInRad: number,
  ) {}

  static zero(): Pose2D {
    return new Pose2D(0, 0, 0);
  }

  get position(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  /** Moves the pose by a body-frame forward distance and a heading change, using the midpoint heading. */
  advance(forwardDistanceInM: number, headingChangeInRad: number): Pose2D {
    const midHeading = this.thetaInRad + headingChangeInRad / 2;
    return new Pose2D(
      this.x + forwardDistanceInM * Math.cos(midHeading),
      this.y + forwardDistanceInM * Math.sin(midHeading),
      normalizeAngle(this.thetaInRad + headingChangeInRad),
    );
  }

  /** Transforms a point from this pose's local frame to the world frame. */
  toWorld(local: Vec2): Vec2 {
    return local.rotate(this.thetaInRad).add(this.position);
  }

  distanceTo(other: Pose2D): number {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  headingErrorTo(other: Pose2D): number {
    return normalizeAngle(this.thetaInRad - other.thetaInRad);
  }
}
