import { Pose2D, Vec2, type PlacedShape, type World } from "@garage/sim-core";
import type { MapAnnotations } from "../source/MapAnnotations";
import type { Camera } from "../view/Camera";

export type Tool = "select" | "kidnap" | "wall" | "no-go";

export type Selection =
  | { kind: "object"; id: string }
  | { kind: "annotation"; id: string }
  | null;

export interface PointerToolsHost {
  world(): World;
  annotations: MapAnnotations;
  camera: Camera;
  canvasSize(): { width: number; height: number };
  truePose(): Pose2D | null;
  kidnap(pose: Pose2D): void;
  onSelectionChanged(selection: Selection): void;
  onToolChanged(tool: Tool): void;
  onWorldEdited(): void;
}

const ROTATE_STEP_IN_RAD = Math.PI / 12;

/** Turns mouse, touch and keyboard input on the map into editing and navigation. */
export class PointerTools {
  private _tool: Tool = "select";
  private _selection: Selection = null;
  private drag: { mode: "move"; id: string; offset: Vec2 } | { mode: "pan"; last: Vec2 } | { mode: "draft"; from: Vec2; to: Vec2 } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly host: PointerToolsHost) {
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", () => (this.drag = null));
    canvas.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    window.addEventListener("keydown", (e) => this.key(e));
  }

  get tool(): Tool {
    return this._tool;
  }

  get selection(): Selection {
    return this._selection;
  }

  /** The wall or zone being drawn, for the renderer. */
  get draft(): { kind: "wall" | "no-go"; from: Vec2; to: Vec2 } | null {
    if (this.drag?.mode !== "draft" || (this._tool !== "wall" && this._tool !== "no-go")) return null;
    return { kind: this._tool, from: this.drag.from, to: this.drag.to };
  }

  setTool(tool: Tool): void {
    this._tool = tool;
    this.drag = null;
    this.canvas.dataset.tool = tool;
    this.host.onToolChanged(tool);
  }

  select(selection: Selection): void {
    this._selection = selection;
    this.host.onSelectionChanged(selection);
  }

  selectedObject(): PlacedShape | undefined {
    return this._selection?.kind === "object" ? this.host.world().find(this._selection.id) : undefined;
  }

  deleteSelection(): void {
    const selection = this._selection;
    if (!selection) return;
    if (selection.kind === "object") {
      this.host.world().remove(selection.id);
      this.host.onWorldEdited();
    } else {
      this.host.annotations.remove(selection.id);
    }
    this.select(null);
  }

  rotateSelection(direction: 1 | -1): void {
    const object = this.selectedObject();
    if (!object) return;
    this.host.world().update(object.id, { thetaInRad: object.thetaInRad + direction * ROTATE_STEP_IN_RAD });
    this.host.onWorldEdited();
  }

  private worldPoint(event: PointerEvent | WheelEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = this.host.canvasSize();
    return this.host.camera.toWorld(new Vec2(event.clientX - rect.left, event.clientY - rect.top), width, height);
  }

  private down(event: PointerEvent): void {
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.focus();
    const point = this.worldPoint(event);
    if (event.button === 1 || event.button === 2) {
      this.drag = { mode: "pan", last: new Vec2(event.clientX, event.clientY) };
      return;
    }
    switch (this._tool) {
      case "kidnap": {
        const heading = this.host.truePose()?.thetaInRad ?? 0;
        this.host.kidnap(new Pose2D(point.x, point.y, heading));
        this.setTool("select");
        return;
      }
      case "wall":
      case "no-go":
        this.drag = { mode: "draft", from: point, to: point };
        return;
      case "select": {
        const object = this.host.world().findAt(point);
        if (object) {
          this.select({ kind: "object", id: object.id });
          this.drag = { mode: "move", id: object.id, offset: new Vec2(object.x, object.y).subtract(point) };
          return;
        }
        const annotation = this.host.annotations.findAt(point, 8 / this.host.camera.pixelsPerMeter);
        if (annotation) {
          this.select({ kind: "annotation", id: annotation.item.id });
          return;
        }
        this.select(null);
        this.drag = { mode: "pan", last: new Vec2(event.clientX, event.clientY) };
      }
    }
  }

  private move(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    if (drag.mode === "pan") {
      const now = new Vec2(event.clientX, event.clientY);
      this.host.camera.panByPixels(now.x - drag.last.x, now.y - drag.last.y);
      drag.last = now;
    } else if (drag.mode === "move") {
      const target = this.worldPoint(event).add(drag.offset);
      this.host.world().update(drag.id, { x: round(target.x), y: round(target.y) });
      this.host.onWorldEdited();
    } else {
      drag.to = this.worldPoint(event);
    }
  }

  private up(event: PointerEvent): void {
    const drag = this.drag;
    this.drag = null;
    if (drag?.mode !== "draft") return;
    const to = this.worldPoint(event);
    if (to.subtract(drag.from).length() < 0.05) return;
    const annotations = this.host.annotations;
    const created = this._tool === "wall" ? annotations.addWall(drag.from, to) : annotations.addNoGoZone(drag.from, to);
    this.select({ kind: "annotation", id: created.id });
  }

  private wheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = this.host.canvasSize();
    this.host.camera.zoomAt(new Vec2(event.clientX - rect.left, event.clientY - rect.top), Math.exp(-event.deltaY * 0.0015), width, height);
  }

  private key(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (event.key === "q" || event.key === "Q") this.rotateSelection(1);
    else if (event.key === "e" || event.key === "E") this.rotateSelection(-1);
    else if (event.key === "Delete" || event.key === "Backspace") this.deleteSelection();
    else if (event.key === "Escape") {
      this.setTool("select");
      this.select(null);
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
