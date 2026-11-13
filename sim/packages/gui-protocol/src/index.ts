/**
 * Messages between the robot GUI and the robot server over WebSocket.
 * Plain JSON, so poses are { x, y, thetaInRad } objects.
 */
import type { BodyCondition, WorldDefinition } from "@garage/sim-core";

export interface PoseJson {
  x: number;
  y: number;
  thetaInRad: number;
}

export interface TwistJson {
  forwardSpeedInMPerS: number;
  yawRateInRadPerS: number;
}

/** Same order as HmiCommandCode in the PLC. */
export const HMI_COMMAND_CODES = [
  "NONE", "MANUAL_DRIVE", "START_MAPPING", "START_SWEEPING", "PAUSE",
  "RESUME", "STOP", "GO_TO_DOCK", "EMERGENCY_STOP", "RESET", "SET_POSE",
] as const;
export type HmiCommandCode = (typeof HMI_COMMAND_CODES)[number];

/** Same order as MissionState in the PLC. */
export const MISSION_STATES = [
  "IDLE", "MANUAL", "MAPPING", "SWEEPING", "PAUSED", "RETURNING_TO_DOCK", "DOCKED", "EMERGENCY_STOPPED",
] as const;
export type MissionStateName = (typeof MISSION_STATES)[number];

export interface HmiStatusJson {
  acknowledgedSequence: number;
  missionState: MissionStateName;
  lastRejection: string;
  estimatedPose: PoseJson;
  isSimulatorConnected: boolean;
  isLidarOk: boolean;
  hasMap: boolean;
}

export interface ScanJson {
  sequence: number;
  angleMinInRad: number;
  angleIncrementInRad: number;
  rangesInM: number[];
  truePose: PoseJson;
  estimatedPose: PoseJson;
}

export interface StateMessage {
  type: "state";
  timeInS: number;
  truePose: PoseJson;
  estimates: { id: string; label: string; pose: PoseJson }[];
  /** Only set in the message right after a new scan. */
  scan: ScanJson | null;
  yawRateInRadPerS: number;
  accelerationInMPerS2: [number, number, number];
  collided: boolean;
  scanCount: number;
  collisionCount: number;
  faults: { isLidarSignalLost: boolean; isGyroFrozen: boolean };
  condition: BodyCondition;
  plc: { isConnected: boolean; status: HmiStatusJson | null } | null;
}

/** How far one estimate ended from the truth after a test route. */
export interface TestRouteResult {
  id: string;
  label: string;
  positionErrorInM: number;
  headingErrorInDeg: number;
}

export type TestRouteMessage =
  | { type: "testRoute"; state: "started"; durationInS: number }
  | { type: "testRoute"; state: "cancelled" }
  | { type: "testRoute"; state: "done"; results: TestRouteResult[]; distanceInM: number; collisions: number; file: string };

/** How much one estimate's turning must be scaled to match the true turning during the gyro calibration spin. */
export interface GyroCalibrationResult {
  id: string;
  label: string;
  /** How far the robot really turned each way, for reference. */
  trueTurnInDeg: number;
  /** True turn divided by the estimated turn, for each direction and on average. */
  counterClockwiseFactor: number;
  clockwiseFactor: number;
  factor: number;
}

export type GyroCalibrationMessage =
  | { type: "gyroCalibration"; state: "started"; durationInS: number }
  | { type: "gyroCalibration"; state: "cancelled" }
  | { type: "gyroCalibration"; state: "done"; results: GyroCalibrationResult[] };

export type ServerMessage =
  | { type: "hello"; mode: "standalone" | "plc"; world: WorldDefinition; noiseId: string; lidarId: string; seed: number }
  | { type: "world"; world: WorldDefinition }
  | StateMessage
  | TestRouteMessage
  | GyroCalibrationMessage;

export type ClientMessage =
  | { type: "world"; world: WorldDefinition }
  | { type: "faults"; isLidarSignalLost: boolean; isGyroFrozen: boolean }
  | { type: "condition"; condition: BodyCondition }
  | { type: "kidnap"; pose: PoseJson }
  | { type: "noise"; id: string }
  | { type: "lidar"; id: string }
  | { type: "restart"; seed?: number }
  | { type: "realign" }
  | { type: "drive"; twist: TwistJson }
  | { type: "hmi"; code: HmiCommandCode }
  /** Starts the test route, or stops it if it is running. */
  | { type: "testRoute" }
  /** Starts the gyro calibration spin, or stops it if it is running. */
  | { type: "gyroCalibration" };
