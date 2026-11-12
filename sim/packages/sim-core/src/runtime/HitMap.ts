import type { Pose2D } from "../math/Pose2D";
import { Vec2 } from "../math/Vec2";
import type { LaserScan } from "../sensors/LaserScan";

/**
 * A simple grid that counts LIDAR hits, drawn at the pose the robot believes
 * it had. With drifting odometry the walls smear out, which shows why the
 * robot needs scan matching. A learning aid, not the robot's real map.
 */
export class HitMap {
  private readonly counts = new Map<number, number>();
  private readonly gridWidth = 4096;

  constructor(readonly cellSizeInM = 0.05) {}

  clear(): void {
    this.counts.clear();
  }

  integrate(scan: LaserScan, pose: Pose2D): void {
    for (let i = 0; i < scan.rangesInM.length; i++) {
      const range = scan.rangesInM[i]!;
      if (range <= 0) continue;
      const angle = pose.thetaInRad + scan.angleMinInRad + i * scan.angleIncrementInRad;
      const hit = pose.position.add(Vec2.fromAngle(angle, range));
      const key = this.key(Math.floor(hit.x / this.cellSizeInM), Math.floor(hit.y / this.cellSizeInM));
      this.counts.set(key, Math.min(255, (this.counts.get(key) ?? 0) + 1));
    }
  }

  forEachCell(callback: (x: number, y: number, count: number) => void): void {
    const half = this.gridWidth / 2;
    for (const [key, count] of this.counts) {
      const cellX = (key % this.gridWidth) - half;
      const cellY = Math.floor(key / this.gridWidth) - half;
      callback(cellX * this.cellSizeInM, cellY * this.cellSizeInM, count);
    }
  }

  private key(cellX: number, cellY: number): number {
    const half = this.gridWidth / 2;
    return (cellY + half) * this.gridWidth + (cellX + half);
  }
}
