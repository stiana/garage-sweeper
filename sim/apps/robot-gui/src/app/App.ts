import { Vec2, type BodyCondition, type PlacedShape, type PoseEstimate, type World, type WorldDefinition } from "@garage/sim-core";
import type { GyroCalibrationMessage, HmiCommandCode, TestRouteMessage } from "@garage/gui-protocol";
import type { Backend } from "../backend/Backend";
import { LocalBackend } from "../backend/LocalBackend";
import { RemoteBackend } from "../backend/RemoteBackend";
import { robotGeometry, worlds } from "../configs";
import { KeyboardController } from "../input/KeyboardController";
import { PointerTools, type Selection, type Tool } from "../input/PointerTools";
import { MapAnnotations } from "../source/MapAnnotations";
import { ErrorPlot } from "../ui/ErrorPlot";
import { Camera } from "../view/Camera";
import { Renderer, type Layers } from "../view/Renderer";
import { readCanvasTheme } from "../view/theme";
import { palette } from "./palette";

const READOUT_INTERVAL_IN_MS = 100;

/** Wires the simulator, the input tools, the canvas and the side panel together. */
export class App {
  private readonly controller = new KeyboardController(robotGeometry);
  private readonly backend: Backend;
  private readonly annotations = new MapAnnotations();
  private readonly camera = new Camera();
  private readonly renderer: Renderer;
  private readonly tools: PointerTools;
  private readonly plot: ErrorPlot;
  private readonly layers: Layers = { showHitMap: false, showRays: false, showEstimates: true, scanAtTruePose: true };
  private lastFrameInMs = performance.now();
  private lastReadoutInMs = 0;
  private objectCounter = 0;

  constructor() {
    const initialWorld = worlds["double-garage"]!;
    this.backend = isServed()
      ? new RemoteBackend(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`, initialWorld, this.controller)
      : new LocalBackend(initialWorld, this.controller);
    this.backend.onWorldReplaced = () => {
      this.tools.select(null);
      this.fitView();
      this.writeWorldJson();
    };
    this.backend.onConnectionChanged = (message) => this.say(message);
    this.backend.onTestRoute = (message) => this.showTestRoute(message);
    this.backend.onGyroCalibration = (message) => this.showGyroCalibration(message);
    const canvas = byId<HTMLCanvasElement>("view");
    this.renderer = new Renderer(canvas, this.camera);
    this.plot = new ErrorPlot(byId<HTMLCanvasElement>("error-plot"));
    this.tools = new PointerTools(canvas, {
      world: () => this.world,
      annotations: this.annotations,
      camera: this.camera,
      canvasSize: () => this.renderer.size,
      truePose: () => this.backend.view.truePose,
      kidnap: (pose) => this.backend.kidnap(pose),
      onSelectionChanged: (selection) => this.showSelection(selection),
      onToolChanged: (tool) => this.showTool(tool),
      onWorldEdited: () => this.refreshSelectionForm(),
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.controller.attach(window);
    this.bindPanel();
    this.watchTheme();
    new ResizeObserver(() => {
      this.renderer.resize();
      this.fitView();
    }).observe(canvas);
    this.renderer.resize();
    this.fitView();
    this.showSelection(null);
    this.showMode();
    this.writeWorldJson();
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(nowInMs: number): void {
    const deltaInS = (nowInMs - this.lastFrameInMs) / 1000;
    this.lastFrameInMs = nowInMs;
    this.backend.update(deltaInS);
    this.renderer.draw(this.world, this.backend.view, this.backend.hitMap, this.annotations, this.layers, {
      selectedId: this.tools.selection?.id ?? null,
      draft: this.tools.draft,
      bodyRadiusInM: robotGeometry.bodyRadiusInM,
    });
    if (nowInMs - this.lastReadoutInMs > READOUT_INTERVAL_IN_MS) {
      this.lastReadoutInMs = nowInMs;
      this.updateReadouts();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private get world(): World {
    return this.backend.world;
  }

  private fitView(): void {
    const points = this.world.walls.flatMap((w) => w.points);
    if (points.length === 0) return;
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const { width, height } = this.renderer.size;
    this.camera.fit(new Vec2(Math.min(...xs), Math.min(...ys)), new Vec2(Math.max(...xs), Math.max(...ys)), width, height);
  }

  private loadWorld(definition: WorldDefinition): void {
    this.backend.loadWorld(definition);
    this.tools.select(null);
    this.fitView();
    this.writeWorldJson();
  }

  // ---- Side panel -------------------------------------------------------

  private bindPanel(): void {
    const pause = byId<HTMLButtonElement>("pause");
    pause.addEventListener("click", () => {
      this.backend.isPaused = !this.backend.isPaused;
      pause.textContent = this.backend.isPaused ? "Fortsett" : "Pause";
      pause.setAttribute("aria-pressed", String(this.backend.isPaused));
    });
    byId("step").addEventListener("click", () => {
      this.backend.isPaused = true;
      pause.textContent = "Fortsett";
      pause.setAttribute("aria-pressed", "true");
      for (let i = 0; i < 10; i++) this.backend.stepOnce();
    });
    byId("restart").addEventListener("click", () => {
      this.controller.stop();
      this.backend.restart();
    });
    byId<HTMLSelectElement>("speed").addEventListener("change", (e) => {
      this.backend.speedFactor = Number((e.target as HTMLSelectElement).value);
    });
    document.querySelectorAll<HTMLButtonElement>("[data-hmi]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.hmi === "EMERGENCY_STOP") this.controller.stop();
        this.backend.sendHmi(button.dataset.hmi as HmiCommandCode);
      });
    });
    byId("fit-view").addEventListener("click", () => this.fitView());

    document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => this.tools.setTool(button.dataset.tool as Tool));
    });
    document.querySelectorAll<HTMLButtonElement>("[data-drive]").forEach((button) => {
      const key = button.dataset.drive as "forward" | "back" | "left" | "right";
      button.addEventListener("pointerdown", () => this.controller.press(key, true));
      for (const end of ["pointerup", "pointerleave", "pointercancel"]) {
        button.addEventListener(end, () => this.controller.press(key, false));
      }
    });

    const worldSelect = byId<HTMLSelectElement>("world-select");
    worldSelect.addEventListener("change", () => this.loadWorld(worlds[worldSelect.value]!));
    document.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((button) => {
      button.addEventListener("click", () => this.addObject(button.dataset.add!));
    });
    byId("delete-selection").addEventListener("click", () => this.tools.deleteSelection());
    byId("delete-annotation").addEventListener("click", () => this.tools.deleteSelection());
    byId("rotate-left").addEventListener("click", () => this.tools.rotateSelection(1));
    byId("rotate-right").addEventListener("click", () => this.tools.rotateSelection(-1));
    byId("annotations-clear").addEventListener("click", () => {
      this.annotations.clear();
      this.tools.select(null);
    });
    this.bindSelectionForm();

    byId("copy-world").addEventListener("click", () => this.copyWorld());
    byId("load-world").addEventListener("click", () => this.loadWorldFromText());

    const noiseSelect = byId<HTMLSelectElement>("noise-select");
    noiseSelect.addEventListener("change", () => this.backend.setNoise(noiseSelect.value));
    const lidarSelect = byId<HTMLSelectElement>("lidar-select");
    lidarSelect.addEventListener("change", () => this.backend.setLidar(lidarSelect.value));
    const seed = byId<HTMLInputElement>("seed");
    seed.addEventListener("change", () => this.backend.restart(Number(seed.value) || 1));
    byId("new-seed").addEventListener("click", () => {
      seed.value = String(1 + Math.floor(Math.random() * 99999));
      this.backend.restart(Number(seed.value));
    });

    bindToggle("show-rays", (on) => (this.layers.showRays = on));
    bindToggle("scan-at-estimate", (on) => (this.layers.scanAtTruePose = !on));
    bindToggle("show-hitmap", (on) => (this.layers.showHitMap = on));
    bindToggle("show-estimates", (on) => (this.layers.showEstimates = on));
    byId("clear-hitmap").addEventListener("click", () => this.backend.hitMap.clear());

    const lidarFault = bindToggle("fault-lidar", () => this.sendFaults(lidarFault, gyroFault));
    const gyroFault = bindToggle("fault-gyro", () => this.sendFaults(lidarFault, gyroFault));
    const lift = bindToggle("fault-lift", (on) => this.setCondition(on ? "lifted" : "normal", tip));
    const tip = bindToggle("fault-tip", (on) => this.setCondition(on ? "tipped" : "normal", lift));
    byId("realign").addEventListener("click", () => {
      this.backend.realign();
      this.backend.hitMap.clear();
    });
    byId("test-route").addEventListener("click", () => this.backend.toggleTestRoute());
    byId("gyro-calibration").addEventListener("click", () => this.backend.toggleGyroCalibration());
  }

  private showGyroCalibration(message: GyroCalibrationMessage): void {
    const button = byId("gyro-calibration");
    const result = byId("gyro-calibration-result");
    const number = (value: number, digits: number) => value.toLocaleString("nb-NO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    switch (message.state) {
      case "started":
        button.textContent = "Stopp kalibreringen";
        result.textContent = `Kalibrerer, cirka ${number(message.durationInS, 0)} s. Ikke kjør selv mens den går.`;
        break;
      case "cancelled":
        button.textContent = "Kalibrer gyro";
        result.textContent = "Kalibreringen ble avbrutt.";
        break;
      case "done": {
        button.textContent = "Kalibrer gyro";
        const turned = message.results[0]?.trueTurnInDeg ?? 0;
        const lines = message.results.map(
          (r) => `${r.label}: × ${number(r.factor, 4)} (mot klokka ${number(r.counterClockwiseFactor, 4)}, med klokka ${number(r.clockwiseFactor, 4)})`,
        );
        result.textContent =
          `Roboten snudde ${number(turned, 0)}° hver vei. Gang skalaen med faktoren:\n${lines.join("\n")}\n` +
          "PLC-estimatet bruker gyroen bare når Parameters.useGyroForHeading er TRUE.";
        break;
      }
    }
  }

  private showTestRoute(message: TestRouteMessage): void {
    const button = byId("test-route");
    const result = byId("test-route-result");
    const number = (value: number, digits: number) => value.toLocaleString("nb-NO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    switch (message.state) {
      case "started":
        button.textContent = "Stopp testløypa";
        result.textContent = `Kjører testløypa, cirka ${number(message.durationInS, 0)} s. Ikke kjør selv mens den går.`;
        break;
      case "cancelled":
        button.textContent = "Kjør testløype";
        result.textContent = "Testløypa ble avbrutt.";
        break;
      case "done": {
        button.textContent = "Kjør testløype";
        const lines = message.results.map((r) => `${r.label}: ${number(r.positionErrorInM, 3)} m, ${number(r.headingErrorInDeg, 1)}°`);
        const warning = message.collisions > 0 ? ` Roboten kolliderte ${message.collisions} ganger, så tallene er ikke sammenlignbare.` : "";
        result.textContent = `Ferdig etter ${number(message.distanceInM, 1)} m.${warning}\n${lines.join("\n")}\nLagret i ${message.file}`;
        break;
      }
    }
  }

  private sendFaults(lidar: HTMLButtonElement, gyro: HTMLButtonElement): void {
    this.backend.setFaults(lidar.getAttribute("aria-pressed") === "true", gyro.getAttribute("aria-pressed") === "true");
  }

  /** Shows what only makes sense where the robot runs: pause and speed here, mission buttons with a PLC. */
  private showMode(): void {
    document.querySelectorAll<HTMLElement>(".only-local").forEach((el) => (el.hidden = !this.backend.canPause));
    document.querySelectorAll<HTMLElement>(".only-server").forEach((el) => (el.hidden = !this.backend.canRunTestRoute));
  }

  private setCondition(condition: BodyCondition, other: HTMLButtonElement): void {
    other.setAttribute("aria-pressed", "false");
    this.backend.setCondition(condition);
  }

  private addObject(kind: string): void {
    const template = palette[kind];
    if (!template) return;
    const { width, height } = this.renderer.size;
    const center = this.camera.toWorld(new Vec2(width / 2, height / 2), width, height);
    const placed: PlacedShape = {
      ...structuredClone(template),
      id: `${kind}-${Date.now().toString(36)}-${++this.objectCounter}`,
      x: Math.round(center.x * 100) / 100,
      y: Math.round(center.y * 100) / 100,
      thetaInRad: 0,
    };
    this.world.add(placed);
    this.tools.setTool("select");
    this.tools.select({ kind: "object", id: placed.id });
  }

  private bindSelectionForm(): void {
    const update = (changes: Partial<PlacedShape>) => {
      const object = this.tools.selectedObject();
      if (object) this.world.update(object.id, changes);
    };
    const shapeUpdate = (key: "lengthInM" | "widthInM" | "radiusInM", value: number) => {
      const object = this.tools.selectedObject();
      if (!object || !(value > 0)) return;
      update({ shape: { ...object.shape, [key]: value } as PlacedShape["shape"] });
    };
    byId<HTMLInputElement>("prop-label").addEventListener("input", (e) => update({ label: (e.target as HTMLInputElement).value }));
    byId<HTMLInputElement>("prop-length").addEventListener("input", (e) => shapeUpdate("lengthInM", Number((e.target as HTMLInputElement).value)));
    byId<HTMLInputElement>("prop-width").addEventListener("input", (e) => shapeUpdate("widthInM", Number((e.target as HTMLInputElement).value)));
    byId<HTMLInputElement>("prop-radius").addEventListener("input", (e) => shapeUpdate("radiusInM", Number((e.target as HTMLInputElement).value)));
    byId<HTMLInputElement>("prop-rotation").addEventListener("input", (e) => {
      update({ thetaInRad: (Number((e.target as HTMLInputElement).value) * Math.PI) / 180 });
    });
    const reflectivity = byId<HTMLInputElement>("prop-reflectivity");
    reflectivity.addEventListener("input", () => {
      update({ reflectivity: Number(reflectivity.value) });
      byId("prop-reflectivity-value").textContent = Number(reflectivity.value).toFixed(2);
    });
    const friction = byId<HTMLInputElement>("prop-friction");
    friction.addEventListener("input", () => {
      update({ friction: Number(friction.value) });
      byId("prop-friction-value").textContent = Number(friction.value).toFixed(2);
    });
  }

  private showSelection(selection: Selection): void {
    byId("selection-empty").hidden = selection !== null;
    byId("selection-form").hidden = selection?.kind !== "object";
    byId("annotation-selected").hidden = selection?.kind !== "annotation";
    this.refreshSelectionForm();
  }

  /** Copies the selected object's values into the form, without disturbing a field being typed in. */
  private refreshSelectionForm(): void {
    const object = this.tools.selectedObject();
    if (!object) return;
    const set = (id: string, value: string) => {
      const input = byId<HTMLInputElement>(id);
      if (document.activeElement !== input) input.value = value;
    };
    const isRect = object.shape.type === "rect";
    const isZone = object.kind === "oil";
    byId("selection-kind").textContent = object.label;
    set("prop-label", object.label);
    if (object.shape.type === "rect") {
      set("prop-length", object.shape.lengthInM.toFixed(2));
      set("prop-width", object.shape.widthInM.toFixed(2));
    } else {
      set("prop-radius", object.shape.radiusInM.toFixed(2));
    }
    set("prop-rotation", String(Math.round((((object.thetaInRad * 180) / Math.PI) % 360 + 360) % 360)));
    set("prop-reflectivity", String(object.reflectivity ?? 0.7));
    set("prop-friction", String(object.friction ?? 1));
    byId("prop-reflectivity-value").textContent = (object.reflectivity ?? 0.7).toFixed(2);
    byId("prop-friction-value").textContent = (object.friction ?? 1).toFixed(2);
    document.querySelectorAll<HTMLElement>(".only-rect").forEach((el) => (el.hidden = !isRect));
    document.querySelectorAll<HTMLElement>(".only-circle").forEach((el) => (el.hidden = isRect));
    document.querySelectorAll<HTMLElement>(".only-object").forEach((el) => (el.hidden = isZone));
    document.querySelectorAll<HTMLElement>(".only-zone").forEach((el) => (el.hidden = !isZone));
  }

  private showTool(tool: Tool): void {
    document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
    });
    const hints: Record<Tool, string> = {
      select: "Dra objekter for å flytte dem. Dra i tomt område for å panorere. Q og E roterer.",
      wall: "Dra for å tegne en vegg oppå kartet.",
      "no-go": "Dra for å tegne en forbudssone.",
      kidnap: "Klikk der roboten skal settes ned. Den merker det bare gjennom sensorene.",
    };
    byId("tool-hint").textContent = hints[tool];
  }

  private writeWorldJson(): void {
    byId<HTMLTextAreaElement>("world-json").value = JSON.stringify(
      { world: this.world.toDefinition(), annotations: this.annotations.toJson() },
      null,
      2,
    );
  }

  private async copyWorld(): Promise<void> {
    this.writeWorldJson();
    const area = byId<HTMLTextAreaElement>("world-json");
    try {
      await navigator.clipboard.writeText(area.value);
      this.say("Kopiert. Lim inn i en fil under config/worlds/ for å ta vare på den.");
    } catch {
      area.focus();
      area.select();
      this.say("Teksten er merket. Kopier den med Ctrl+C.");
    }
  }

  private loadWorldFromText(): void {
    try {
      const parsed = JSON.parse(byId<HTMLTextAreaElement>("world-json").value);
      const definition: WorldDefinition = parsed.world ?? parsed;
      if (!Array.isArray(definition.walls) || !Array.isArray(definition.objects)) throw new Error("mangler walls eller objects");
      definition.floorZones ??= [];
      this.loadWorld(definition);
      this.say(`Lastet inn «${definition.name}».`);
    } catch (error) {
      this.say(`Kunne ikke lese verdenen: ${(error as Error).message}. Sjekk at teksten er gyldig JSON.`);
    }
  }

  private say(message: string): void {
    byId("world-message").textContent = message;
  }

  // ---- Readouts ---------------------------------------------------------

  private updateReadouts(): void {
    const view = this.backend.view;
    const telemetry = this.backend.telemetry;
    const truth = view.truePose;
    const find = (id: string) => view.estimates.find((e: PoseEstimate) => e.id === id)?.pose;
    const errorText = (id: string) => {
      const estimate = find(id);
      return estimate && truth ? `${cm(estimate.distanceTo(truth))} · ${signedDegrees(estimate.headingErrorTo(truth))}` : "–";
    };
    text("m-time", formatTime(view.timeInS));
    if (truth) text("m-true", `${truth.x.toFixed(2)}, ${truth.y.toFixed(2)} m · ${degrees(truth.thetaInRad)}°`);
    text("m-wheels", errorText("wheels"));
    text("m-gyro", errorText("gyro"));
    text("m-plc", errorText("plc"));
    text("m-scans", `${telemetry.scanCount}`);
    text("m-collisions", `${telemetry.collisionCount}`);
    text("m-yawrate", `${((telemetry.yawRateInRadPerS * 180) / Math.PI).toFixed(2)} °/s`);
    text("m-accel", telemetry.accelerationInMPerS2.map((a) => a.toFixed(1)).join(", "));

    const condition = telemetry.condition;
    const lidarOk = !telemetry.isLidarSignalLost && condition !== "tipped";
    chip("chip-lidar", lidarOk ? "LIDAR ok" : "LIDAR borte", lidarOk ? "good" : "bad");
    chip("chip-body", condition === "normal" ? "På gulvet" : condition === "lifted" ? "Løftet" : "Veltet", condition === "normal" ? "good" : "bad");
    chip("chip-collision", telemetry.collided ? "Kollisjon" : "Fri bane", telemetry.collided ? "warn" : "good");
    this.updateMission();
    this.plot.draw(this.backend.history, readCanvasTheme());
  }

  private updateMission(): void {
    const plc = this.backend.plc;
    const status = plc?.isConnected ? plc.status : null;
    const mode = this.backend.mode;
    byId("legend-plc").hidden = mode !== "plc";
    chip(
      "chip-plc",
      mode === "local" ? "Lokal simulering" : mode === "standalone" ? "Server uten PLC" : status ? "PLC tilkoblet" : "Venter på PLC",
      mode === "plc" && !status ? "warn" : "good",
    );
    text("mission-state", status ? missionLabels[status.missionState] : "–");
    text("mission-rejection", status?.lastRejection ?? "");
    const reason =
      mode === "local"
        ? "Driftsknappene styrer PLC-en. Start robot-serveren med --plc for å bruke dem."
        : mode === "standalone"
          ? "Serveren kjører uten PLC. Start den med --plc for å bruke driftsknappene."
          : status
            ? ""
            : "Serveren finner ikke PLC-en. Sjekk at TwinCAT kjører og at AMS Net ID stemmer.";
    text("mission-note", reason);
    document.querySelectorAll<HTMLButtonElement>("[data-hmi]").forEach((button) => (button.disabled = !status));
  }

  private watchTheme(): void {
    const refresh = () => this.renderer.refreshTheme();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refresh);
    new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  }
}

const missionLabels: Record<string, string> = {
  IDLE: "Venter",
  MANUAL: "Manuell kjøring",
  MAPPING: "Kartlegger",
  SWEEPING: "Feier",
  PAUSED: "Pause",
  RETURNING_TO_DOCK: "Kjører til lader",
  DOCKED: "I laderen",
  EMERGENCY_STOPPED: "Nødstoppet",
};

/** The robot server marks the page it serves, so the GUI knows to connect back to it. */
function isServed(): boolean {
  return (window as unknown as { ROBOT_SERVER?: boolean }).ROBOT_SERVER === true;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Fant ikke #${id}`);
  return element as T;
}

function bindToggle(id: string, onChange: (on: boolean) => void): HTMLButtonElement {
  const button = byId<HTMLButtonElement>(id);
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(on));
    onChange(on);
  });
  return button;
}

function text(id: string, value: string): void {
  byId(id).textContent = value;
}

function chip(id: string, label: string, state: "good" | "warn" | "bad"): void {
  const element = byId(id);
  element.textContent = label;
  element.dataset.state = state;
}

function cm(meters: number): string {
  return meters < 1 ? `${(meters * 100).toFixed(1)} cm` : `${meters.toFixed(2)} m`;
}

function degrees(rad: number): string {
  return ((rad * 180) / Math.PI).toFixed(0);
}

function signedDegrees(rad: number): string {
  const value = (rad * 180) / Math.PI;
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}°`;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

