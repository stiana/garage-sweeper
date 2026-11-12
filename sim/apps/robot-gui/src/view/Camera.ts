import { Vec2 } from "@garage/sim-core";

/** Maps world metres (y up) to canvas pixels (y down), with pan and zoom. */
export class Camera {
  pixelsPerMeter = 100;
  private center = new Vec2(3, 3);

  toScreen(world: Vec2, canvasWidth: number, canvasHeight: number): Vec2 {
    return new Vec2(
      canvasWidth / 2 + (world.x - this.center.x) * this.pixelsPerMeter,
      canvasHeight / 2 - (world.y - this.center.y) * this.pixelsPerMeter,
    );
  }

  toWorld(screen: Vec2, canvasWidth: number, canvasHeight: number): Vec2 {
    return new Vec2(
      this.center.x + (screen.x - canvasWidth / 2) / this.pixelsPerMeter,
      this.center.y - (screen.y - canvasHeight / 2) / this.pixelsPerMeter,
    );
  }

  fit(min: Vec2, max: Vec2, canvasWidth: number, canvasHeight: number, marginInPx = 40): void {
    this.center = min.add(max).scale(0.5);
    const width = Math.max(max.x - min.x, 0.5);
    const height = Math.max(max.y - min.y, 0.5);
    this.pixelsPerMeter = Math.min((canvasWidth - 2 * marginInPx) / width, (canvasHeight - 2 * marginInPx) / height);
  }

  panByPixels(dx: number, dy: number): void {
    this.center = this.center.add(new Vec2(-dx / this.pixelsPerMeter, dy / this.pixelsPerMeter));
  }

  /** Zooms around a screen point so that point stays under the cursor. */
  zoomAt(screen: Vec2, factor: number, canvasWidth: number, canvasHeight: number): void {
    const before = this.toWorld(screen, canvasWidth, canvasHeight);
    this.pixelsPerMeter = Math.max(15, Math.min(800, this.pixelsPerMeter * factor));
    const after = this.toWorld(screen, canvasWidth, canvasHeight);
    this.center = this.center.add(before.subtract(after));
  }
}
