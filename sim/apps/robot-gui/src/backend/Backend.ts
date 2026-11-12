import type { BodyCondition, ErrorSample, HitMap, Pose2D, RobotView, World, WorldDefinition } from "@garage/sim-core";
import type { HmiCommandCode, HmiStatusJson } from "@garage/gui-protocol";

/** Sensor values for the readouts, the same whether the robot runs here or on the server. */
export interface Telemetry {
  yawRateInRadPerS: number;
  accelerationInMPerS2: [number, number, number];
  collided: boolean;
  scanCount: number;
  collisionCount: number;
  isLidarSignalLost: boolean;
  isGyroFrozen: boolean;
  condition: BodyCondition;
}

/** What the GUI knows about the PLC. Null when nothing is connected. */
export interface PlcView {
  isConnected: boolean;
  status: HmiStatusJson | null;
}

export type BackendMode = "local" | "standalone" | "plc";

/**
 * Where the robot runs: in this browser tab (LocalBackend) or on the robot
 * server, with or without the PLC (RemoteBackend). The GUI talks only to this.
 */
export interface Backend {
  readonly mode: BackendMode;
  readonly world: World;
  readonly view: RobotView;
  readonly hitMap: HitMap;
  readonly history: ErrorSample[];
  readonly telemetry: Telemetry;
  readonly plc: PlcView | null;
  readonly canPause: boolean;
  isPaused: boolean;
  speedFactor: number;

  update(realDeltaTimeInS: number): void;
  stepOnce(): void;
  restart(seed?: number): void;
  realign(): void;
  loadWorld(definition: WorldDefinition): void;
  setNoise(id: string): void;
  setLidar(id: string): void;
  setFaults(isLidarSignalLost: boolean, isGyroFrozen: boolean): void;
  setCondition(condition: BodyCondition): void;
  kidnap(pose: Pose2D): void;
  sendHmi(code: HmiCommandCode): void;

  /** Called when someone else changed the world, so the GUI can refit and drop its selection. */
  onWorldReplaced: () => void;
  /** Called when the connection state changes, for the status line. */
  onConnectionChanged: (message: string) => void;
}
