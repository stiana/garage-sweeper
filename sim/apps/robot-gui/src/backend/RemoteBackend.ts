import {
  type BodyCondition,
  type ErrorSample,
  HitMap,
  type LaserScan,
  Pose2D,
  type RobotView,
  World,
  type WorldDefinition,
} from "@garage/sim-core";
import type {
  ClientMessage,
  HmiCommandCode,
  PoseJson,
  ServerMessage,
  StateMessage,
  TestRouteMessage,
  GyroCalibrationMessage,
  PlcMapMessage,
  TwistJson,
} from "@garage/gui-protocol";
import type { KeyboardController } from "../input/KeyboardController";
import type { Backend, BackendMode, PlcView, Telemetry } from "./Backend";

const DRIVE_INTERVAL_IN_MS = 50;
const WORLD_SYNC_INTERVAL_IN_MS = 200;
const RECONNECT_DELAY_IN_MS = 1000;
const HISTORY_INTERVAL_IN_S = 0.25;
const HISTORY_LENGTH = 240;

/**
 * The robot runs on the robot server (Node), and maybe in the PLC behind it.
 * This class mirrors the server's state and sends the user's actions back.
 */
export class RemoteBackend implements Backend {
  mode: BackendMode = "standalone";
  readonly world: World;
  readonly hitMap = new HitMap();
  readonly history: ErrorSample[] = [];
  readonly canPause = false;
  readonly canRunTestRoute = true;
  isPaused = false;
  speedFactor = 1;
  plc: PlcView | null = null;
  plcMap: PlcMapMessage | null = null;
  onWorldReplaced = () => {};
  onConnectionChanged = (_message: string) => {};
  onTestRoute = (_message: TestRouteMessage) => {};
  onGyroCalibration = (_message: GyroCalibrationMessage) => {};

  private socket: WebSocket | null = null;
  private state: StateMessage | null = null;
  private lastScan: RobotView["lastScan"] = null;
  private syncedWorldVersion = -1;
  private lastWorldSyncInMs = 0;
  private lastDriveInMs = 0;
  private wasDriving = false;
  private nextHistoryInS = 0;

  /** The world is shown until the server sends its own. */
  constructor(private readonly url: string, initialWorld: WorldDefinition, private readonly keyboard: KeyboardController) {
    this.world = new World(initialWorld);
    this.connect();
  }

  get view(): RobotView {
    const state = this.state;
    return {
      truePose: state ? toPose(state.truePose) : null,
      estimates: state ? state.estimates.map((e) => ({ id: e.id, label: e.label, pose: toPose(e.pose) })) : [],
      lastScan: this.lastScan,
      feedback: null,
      timeInS: state?.timeInS ?? 0,
    };
  }

  get telemetry(): Telemetry {
    const s = this.state;
    return {
      yawRateInRadPerS: s?.yawRateInRadPerS ?? 0,
      accelerationInMPerS2: s?.accelerationInMPerS2 ?? [0, 0, 0],
      collided: s?.collided ?? false,
      scanCount: s?.scanCount ?? 0,
      collisionCount: s?.collisionCount ?? 0,
      isLidarSignalLost: s?.faults.isLidarSignalLost ?? false,
      isGyroFrozen: s?.faults.isGyroFrozen ?? false,
      condition: s?.condition ?? "normal",
    };
  }

  /** Called every animation frame: sends keyboard driving and world edits. */
  update(): void {
    const now = performance.now();
    if (now - this.lastDriveInMs >= DRIVE_INTERVAL_IN_MS) {
      const deltaInS = this.lastDriveInMs === 0 ? 0 : (now - this.lastDriveInMs) / 1000;
      this.lastDriveInMs = now;
      const twist = this.keyboard.twist(deltaInS);
      const isDriving = twist.forwardSpeedInMPerS !== 0 || twist.yawRateInRadPerS !== 0;
      // Keep sending while driving, so the server's watchdog sees a live GUI, and send one stop.
      if (isDriving || this.wasDriving) this.send({ type: "drive", twist: twist satisfies TwistJson });
      this.wasDriving = isDriving;
    }
    if (now - this.lastWorldSyncInMs >= WORLD_SYNC_INTERVAL_IN_MS && this.world.version !== this.syncedWorldVersion) {
      this.lastWorldSyncInMs = now;
      this.syncedWorldVersion = this.world.version;
      this.send({ type: "world", world: this.world.toDefinition() });
    }
  }

  stepOnce(): void {}

  restart(seed?: number): void {
    this.send({ type: "restart", seed });
    this.clearLocal();
  }

  realign(): void { this.send({ type: "realign" }); }

  loadWorld(definition: WorldDefinition): void {
    this.world.replace(definition);
    this.syncedWorldVersion = this.world.version;
    this.send({ type: "world", world: definition });
    this.restart();
  }

  setNoise(id: string): void { this.send({ type: "noise", id }); }
  setLidar(id: string): void { this.send({ type: "lidar", id }); }
  setFaults(isLidarSignalLost: boolean, isGyroFrozen: boolean): void {
    this.send({ type: "faults", isLidarSignalLost, isGyroFrozen });
  }
  setCondition(condition: BodyCondition): void { this.send({ type: "condition", condition }); }
  kidnap(pose: Pose2D): void { this.send({ type: "kidnap", pose: { x: pose.x, y: pose.y, thetaInRad: pose.thetaInRad } }); }
  sendHmi(code: HmiCommandCode): void { this.send({ type: "hmi", code }); }
  toggleTestRoute(): void { this.send({ type: "testRoute" }); }
  toggleGyroCalibration(): void { this.send({ type: "gyroCalibration" }); }

  private connect(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener("open", () => this.onConnectionChanged("Koblet til robot-serveren."));
    socket.addEventListener("message", (event) => this.receive(JSON.parse(String(event.data)) as ServerMessage));
    socket.addEventListener("close", () => {
      this.socket = null;
      this.onConnectionChanged("Mistet kontakten med robot-serveren. Prøver igjen ...");
      setTimeout(() => this.connect(), RECONNECT_DELAY_IN_MS);
    });
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case "hello":
        this.mode = message.mode;
        this.replaceWorld(message.world);
        this.onConnectionChanged(message.mode === "plc" ? "Koblet til robot-serveren med PLC." : "Koblet til robot-serveren, uten PLC.");
        break;
      case "world":
        this.replaceWorld(message.world);
        break;
      case "state":
        this.receiveState(message);
        break;
      case "testRoute":
        this.onTestRoute(message);
        break;
      case "gyroCalibration":
        this.onGyroCalibration(message);
        break;
      case "plcMap":
        this.plcMap = message;
        break;
    }
  }

  private replaceWorld(definition: WorldDefinition): void {
    this.world.replace(definition);
    this.syncedWorldVersion = this.world.version;
    this.onWorldReplaced();
  }

  private receiveState(state: StateMessage): void {
    if (this.state && state.timeInS < this.state.timeInS) this.clearLocal();
    this.state = state;
    this.plc = state.plc;
    if (state.scan) {
      const scan: LaserScan = {
        sequence: state.scan.sequence,
        startTimestampInNs: 0,
        scanDurationInS: 0,
        angleMinInRad: state.scan.angleMinInRad,
        angleIncrementInRad: state.scan.angleIncrementInRad,
        rangesInM: Float32Array.from(state.scan.rangesInM),
      };
      const estimatedPose = toPose(state.scan.estimatedPose);
      this.lastScan = { scan, truePose: toPose(state.scan.truePose), estimatedPose };
      this.hitMap.integrate(scan, estimatedPose);
    }
    if (state.timeInS >= this.nextHistoryInS) {
      this.nextHistoryInS = state.timeInS + HISTORY_INTERVAL_IN_S;
      const truth = toPose(state.truePose);
      const error = (id: string) => {
        const estimate = state.estimates.find((e) => e.id === id);
        return estimate ? toPose(estimate.pose).distanceTo(truth) : 0;
      };
      this.history.push({ timeInS: state.timeInS, wheelsErrorInM: error("wheels"), gyroErrorInM: error("gyro") });
      if (this.history.length > HISTORY_LENGTH) this.history.shift();
    }
  }

  private clearLocal(): void {
    this.hitMap.clear();
    this.history.length = 0;
    this.nextHistoryInS = 0;
    this.lastScan = null;
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}

function toPose(p: PoseJson): Pose2D {
  return new Pose2D(p.x, p.y, p.thetaInRad);
}
