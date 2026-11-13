import { type HitMap, type PlacedShape, type Pose2D, type RobotView, Vec2, type World, rectCorners } from "@garage/sim-core";
import type { PlcMapMessage } from "@garage/gui-protocol";
import type { MapAnnotations } from "../source/MapAnnotations";
import { PlcMapImage, type PlcMapColors, cssColorToRgb } from "./PlcMapImage";
import type { Camera } from "./Camera";
import { type CanvasTheme, readCanvasTheme } from "./theme";

export interface Layers {
  showHitMap: boolean;
  showPlcMap: boolean;
  showRays: boolean;
  showEstimates: boolean;
  /** Draw LIDAR points at the true pose (follows the robot) or at the estimate (shows drift). */
  scanAtTruePose: boolean;
}

export interface Overlay {
  selectedId: string | null;
  draft: { kind: "wall" | "no-go"; from: Vec2; to: Vec2 } | null;
  bodyRadiusInM: number;
}

/** Draws the garage, the robot and everything it believes onto a canvas. */
export class Renderer {
  private theme: CanvasTheme = readCanvasTheme();
  private plcMapColors: PlcMapColors = this.readPlcMapColors();
  private readonly plcMapImage = new PlcMapImage();
  private context: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly camera: Camera) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Nettleseren støtter ikke canvas.");
    this.context = context;
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  refreshTheme(): void {
    this.theme = readCanvasTheme();
    this.plcMapColors = this.readPlcMapColors();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  draw(
    world: World,
    view: RobotView,
    hitMap: HitMap,
    plcMap: PlcMapMessage | null,
    annotations: MapAnnotations,
    layers: Layers,
    overlay: Overlay,
  ): void {
    const c = this.context;
    const t = this.theme;
    c.fillStyle = t.floor;
    c.fillRect(0, 0, this.width, this.height);
    this.drawGrid();
    for (const zone of world.floorZones) this.drawShape(zone, t.oil, null, overlay.selectedId === zone.id);
    if (layers.showPlcMap && plcMap) this.drawPlcMap(plcMap);
    if (layers.showHitMap) this.drawHitMap(hitMap);
    this.drawWalls(world);
    for (const object of world.objects) this.drawShape(object, t.objectFill, t.object, overlay.selectedId === object.id);
    this.drawDock(world.dockPose);
    this.drawAnnotations(annotations, overlay);
    if (view.lastScan) {
      const { scan, truePose, estimatedPose } = view.lastScan;
      this.drawScan(scan.rangesInM, scan.angleMinInRad, scan.angleIncrementInRad, layers.scanAtTruePose ? truePose : estimatedPose, layers.showRays);
    }
    if (layers.showEstimates) {
      for (const estimate of view.estimates) {
        const color = estimate.id === "gyro" ? t.gyro : estimate.id === "plc" ? t.plc : t.wheels;
        this.drawRobot(estimate.pose, overlay.bodyRadiusInM, color, estimate.id !== "plc");
      }
    }
    if (view.truePose) this.drawRobot(view.truePose, overlay.bodyRadiusInM, t.truth, false);
    this.drawScaleBar();
  }

  private screen(world: Vec2): Vec2 {
    return this.camera.toScreen(world, this.width, this.height);
  }

  private drawGrid(): void {
    const c = this.context;
    const topLeft = this.camera.toWorld(new Vec2(0, 0), this.width, this.height);
    const bottomRight = this.camera.toWorld(new Vec2(this.width, this.height), this.width, this.height);
    const step = this.camera.pixelsPerMeter > 60 ? 0.5 : 1;
    c.strokeStyle = this.theme.grid;
    c.lineWidth = 1;
    c.beginPath();
    for (let x = Math.floor(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
      const sx = Math.round(this.screen(new Vec2(x, 0)).x) + 0.5;
      c.moveTo(sx, 0);
      c.lineTo(sx, this.height);
    }
    for (let y = Math.floor(bottomRight.y / step) * step; y <= topLeft.y; y += step) {
      const sy = Math.round(this.screen(new Vec2(0, y)).y) + 0.5;
      c.moveTo(0, sy);
      c.lineTo(this.width, sy);
    }
    c.stroke();
  }

  private drawWalls(world: World): void {
    const c = this.context;
    c.strokeStyle = this.theme.wall;
    c.lineWidth = Math.max(3, this.camera.pixelsPerMeter * 0.06);
    c.lineJoin = "round";
    c.lineCap = "round";
    for (const wall of world.walls) {
      c.beginPath();
      wall.points.forEach(([x, y], index) => {
        const p = this.screen(new Vec2(x, y));
        if (index === 0) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      });
      if (wall.closed) c.closePath();
      c.stroke();
    }
  }

  private drawShape(shape: PlacedShape, fill: string, stroke: string | null, isSelected: boolean): void {
    const c = this.context;
    c.beginPath();
    if (shape.shape.type === "circle") {
      const center = this.screen(new Vec2(shape.x, shape.y));
      c.arc(center.x, center.y, shape.shape.radiusInM * this.camera.pixelsPerMeter, 0, Math.PI * 2);
    } else {
      rectCorners(shape).forEach((corner, index) => {
        const p = this.screen(corner);
        if (index === 0) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      });
      c.closePath();
    }
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1.5;
      c.stroke();
    }
    if (isSelected) {
      c.setLineDash([6, 4]);
      c.strokeStyle = this.theme.accent;
      c.lineWidth = 2.5;
      c.stroke();
      c.setLineDash([]);
    }
    if (this.camera.pixelsPerMeter > 45) {
      const center = this.screen(new Vec2(shape.x, shape.y));
      c.fillStyle = this.theme.muted;
      c.font = `12px ${this.theme.font}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(shape.label, center.x, center.y);
    }
  }

  private readPlcMapColors(): PlcMapColors {
    return { occupied: cssColorToRgb(this.theme.hit), free: cssColorToRgb(this.theme.plc) };
  }

  private drawPlcMap(map: PlcMapMessage): void {
    const c = this.context;
    const image = this.plcMapImage.image(map, this.plcMapColors);
    const size = map.cellSizeInM * this.camera.pixelsPerMeter;
    const topLeft = this.screen(new Vec2(map.originXInM, map.originYInM + map.heightInCells * map.cellSizeInM));
    c.imageSmoothingEnabled = false;
    c.drawImage(image, topLeft.x, topLeft.y, map.widthInCells * size, map.heightInCells * size);
    c.imageSmoothingEnabled = true;
  }

  private drawHitMap(hitMap: HitMap): void {
    const c = this.context;
    const size = hitMap.cellSizeInM * this.camera.pixelsPerMeter;
    c.fillStyle = this.theme.hit;
    hitMap.forEachCell((x, y, count) => {
      c.globalAlpha = Math.min(1, 0.15 + count / 12);
      const p = this.screen(new Vec2(x, y + hitMap.cellSizeInM));
      c.fillRect(p.x, p.y, size, size);
    });
    c.globalAlpha = 1;
  }

  private drawDock(pose: Pose2D): void {
    const c = this.context;
    const p = this.screen(pose.position);
    const s = 0.18 * this.camera.pixelsPerMeter;
    c.strokeStyle = this.theme.dock;
    c.lineWidth = 2;
    c.strokeRect(p.x - s, p.y - s / 2, s * 2, s);
    c.fillStyle = this.theme.dock;
    c.font = `11px ${this.theme.font}`;
    c.textAlign = "center";
    c.textBaseline = "top";
    c.fillText("Lader", p.x, p.y + s / 2 + 3);
  }

  private drawAnnotations(annotations: MapAnnotations, overlay: Overlay): void {
    const c = this.context;
    const t = this.theme;
    for (const zone of annotations.noGoZones) {
      const a = this.screen(new Vec2(zone.min.x, zone.max.y));
      const b = this.screen(new Vec2(zone.max.x, zone.min.y));
      this.hatch(a, b, overlay.selectedId === zone.id);
    }
    c.lineCap = "round";
    for (const wall of annotations.walls) {
      const a = this.screen(wall.a);
      const b = this.screen(wall.b);
      c.strokeStyle = overlay.selectedId === wall.id ? t.accent : t.annotation;
      c.lineWidth = Math.max(4, this.camera.pixelsPerMeter * 0.05);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    const draft = overlay.draft;
    if (!draft) return;
    c.setLineDash([6, 4]);
    if (draft.kind === "wall") {
      const a = this.screen(draft.from);
      const b = this.screen(draft.to);
      c.strokeStyle = t.annotation;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    } else {
      const a = this.screen(draft.from);
      const b = this.screen(draft.to);
      c.strokeStyle = t.noGo;
      c.lineWidth = 2;
      c.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    }
    c.setLineDash([]);
  }

  private hatch(a: Vec2, b: Vec2, isSelected: boolean): void {
    const c = this.context;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.strokeStyle = this.theme.noGo;
    c.globalAlpha = 0.55;
    c.lineWidth = 1.5;
    c.beginPath();
    for (let d = -h; d < w; d += 10) {
      c.moveTo(x + d, y + h);
      c.lineTo(x + d + h, y);
    }
    c.stroke();
    c.restore();
    c.strokeStyle = isSelected ? this.theme.accent : this.theme.noGo;
    c.lineWidth = isSelected ? 2.5 : 1.5;
    c.strokeRect(x, y, w, h);
  }

  private drawScan(ranges: Float32Array, angleMin: number, increment: number, pose: Pose2D, showRays: boolean): void {
    const c = this.context;
    const origin = this.screen(pose.position);
    const dot = Math.max(1.5, this.camera.pixelsPerMeter * 0.015);
    c.fillStyle = this.theme.scan;
    c.strokeStyle = this.theme.scan;
    c.lineWidth = 0.5;
    if (showRays) {
      c.globalAlpha = 0.18;
      c.beginPath();
    }
    const points: Vec2[] = [];
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i]!;
      if (range <= 0) continue;
      const p = this.screen(pose.position.add(Vec2.fromAngle(pose.thetaInRad + angleMin + i * increment, range)));
      points.push(p);
      if (showRays) {
        c.moveTo(origin.x, origin.y);
        c.lineTo(p.x, p.y);
      }
    }
    if (showRays) {
      c.stroke();
      c.globalAlpha = 1;
    }
    for (const p of points) c.fillRect(p.x - dot / 2, p.y - dot / 2, dot, dot);
  }

  private drawRobot(pose: Pose2D, radiusInM: number, color: string, isGhost: boolean): void {
    const c = this.context;
    const center = this.screen(pose.position);
    const radius = radiusInM * this.camera.pixelsPerMeter;
    const nose = this.screen(pose.position.add(Vec2.fromAngle(pose.thetaInRad, radiusInM)));
    c.beginPath();
    c.arc(center.x, center.y, radius, 0, Math.PI * 2);
    c.strokeStyle = color;
    c.lineWidth = isGhost ? 1.5 : 2.5;
    if (isGhost) c.setLineDash([5, 4]);
    else {
      c.fillStyle = color;
      c.globalAlpha = 0.18;
      c.fill();
      c.globalAlpha = 1;
    }
    c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(center.x, center.y);
    c.lineTo(nose.x, nose.y);
    c.stroke();
  }

  private drawScaleBar(): void {
    const c = this.context;
    const length = this.camera.pixelsPerMeter;
    const x = 16;
    const y = this.height - 18;
    c.strokeStyle = this.theme.ink;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y - 5);
    c.lineTo(x, y);
    c.lineTo(x + length, y);
    c.lineTo(x + length, y - 5);
    c.stroke();
    c.fillStyle = this.theme.ink;
    c.font = `11px ${this.theme.mono}`;
    c.textAlign = "left";
    c.textBaseline = "bottom";
    c.fillText("1 m", x + 4, y - 4);
  }
}
