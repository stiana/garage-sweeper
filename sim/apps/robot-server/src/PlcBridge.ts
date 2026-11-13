import { Client } from "ads-client";
import {
  Pose2D,
  type PoseEstimate,
  type LaserScan,
  type RobotCommand,
  type RobotController,
  type RobotFeedback,
  STEP_IN_S,
  STOPPED_COMMAND,
} from "@garage/sim-core";
import { GyroAverager } from "./GyroAverager";
import { WheelFollower } from "./WheelFollower";
import {
  HMI_COMMAND_CODES,
  type HmiCommandCode,
  type HmiStatusJson,
  MISSION_STATES,
  type PlcMapMessage,
  type PoseJson,
  type TwistJson,
} from "@garage/gui-protocol";

export interface PlcConnectionSettings {
  /** AmsNetId of the TwinCAT runtime. "localhost" when it runs on this PC. */
  targetAmsNetId: string;
  targetAdsPort: number;
  /** Only needed without a local TwinCAT router, e.g. on Linux. */
  routerAddress?: string;
  localAmsNetId?: string;
}

const PROTOCOL_VERSION = 4;
const MAX_SCAN_POINTS = 1024;
const READ_INTERVAL_IN_MS = 5;
const LINK_LOG_HEADER = [
  "simTimeInS",
  "plcTimeInNs",
  "plcClockOffsetInMs",
  "leftAxisPositionInM",
  "leftAxisVelocityInMPerS",
  "leftWheelPositionInM",
  "leftWheelSetpointInMPerS",
  "rightAxisPositionInM",
  "rightAxisVelocityInMPerS",
  "rightWheelPositionInM",
  "rightWheelSetpointInMPerS",
  "yawRateInRadPerS",
  "trueThetaInRad",
];
/** A bigger jump between the PLC and simulator clocks is a pause or restart, not jitter. */
const CLOCK_JUMP_IN_S = 0.5;
/** How fast the clock match follows slow drift between the two clocks. */
const CLOCK_DRIFT_GAIN = 0.002;
const STATUS_INTERVAL_IN_MS = 100;
/** The map changes once per scan at most; the cells are 64 kB, so they are only read when the revision moved. */
const MAP_INTERVAL_IN_MS = 500;
const RECONNECT_DELAY_IN_MS = 2000;
const STANDING_STILL: TwistJson = { forwardSpeedInMPerS: 0, yawRateInRadPerS: 0 };
const ORIGIN: PoseJson = { x: 0, y: 0, thetaInRad: 0 };

/**
 * The simulator's side of the ADS link. The PLC is a passive party: it owns
 * the SimulatorIo and RobotHmi globals, and this class reads commands from
 * and writes sensor data into them.
 */
export class PlcBridge implements RobotController {
  private readonly client: Client;
  private latestCommand: PlcCommand | null = null;
  private lastFeedbackTimeInNs: number | null = null;
  /** Simulation time when the latest command arrived, to know how old its axis positions are. */
  /** Simulator time minus PLC time, for when a command was fresh. */
  private plcClockOffsetInS: number | null = null;
  private linkLog: string[] | null = null;
  private readonly leftWheel: WheelFollower;
  private readonly rightWheel: WheelFollower;
  private readonly gyro = new GyroAverager();
  private estimatedPose: Pose2D | null = null;
  private pendingFeedback: RobotFeedback | null = null;
  private pendingScan: LaserScan | null = null;
  private isWriting = false;
  private hmiSequence = 0;
  private lastStatusReadInMs = 0;
  private lastMapReadInMs = 0;
  private running = false;
  isConnected = false;
  /** Called each time the link to the PLC is up, after a start or a reconnect. */
  onConnected = () => {};
  status: HmiStatusJson | null = null;
  /** The PLC's latest map, or null before it has sent one. */
  map: PlcMapMessage | null = null;
  /** Called each time the PLC's map has changed. */
  onMap = (_map: PlcMapMessage) => {};
  lastError = "";

  /** wheelRadiusInM: the true wheel radius of the simulated robot, from config/robot.json. */
  constructor(
    settings: PlcConnectionSettings,
    private readonly wheelRadiusInM: number,
  ) {
    this.leftWheel = new WheelFollower(wheelRadiusInM, STEP_IN_S);
    this.rightWheel = new WheelFollower(wheelRadiusInM, STEP_IN_S);
    this.client = new Client({
      targetAmsNetId: settings.targetAmsNetId,
      targetAdsPort: settings.targetAdsPort,
      // ads-client treats a key set to undefined as set, so only pass what was given.
      ...(settings.routerAddress ? { routerAddress: settings.routerAddress } : {}),
      ...(settings.localAmsNetId ? { localAmsNetId: settings.localAmsNetId } : {}),
      autoReconnect: true,
      objectifyEnumerations: false,
    });
  }

  async start(): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        if (!this.client.connection.connected) await this.client.connect();
        await this.initializeHmiSequence();
        this.leftWheel.reanchor();
        this.rightWheel.reanchor();
        this.isConnected = true;
        this.lastError = "";
        this.onConnected();
        await this.readLoop();
      } catch (error) {
        this.isConnected = false;
        this.lastError = (error as Error).message;
        console.warn(`PLC: ${this.lastError}. Prøver igjen om ${RECONNECT_DELAY_IN_MS / 1000} s.`);
        await sleep(RECONNECT_DELAY_IN_MS);
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.client.connection.connected) await this.client.disconnect();
  }

  /** Called by the simulation every step. Hands back the PLC's latest command and queues the sensor data. */
  exchange(feedback: RobotFeedback): RobotCommand {
    if (this.lastFeedbackTimeInNs !== null && feedback.timeInNs < this.lastFeedbackTimeInNs) {
      // The simulation restarted and put the wheels back to 0.
      this.leftWheel.reanchor();
      this.rightWheel.reanchor();
      this.plcClockOffsetInS = null;
    }
    this.lastFeedbackTimeInNs = feedback.timeInNs;
    this.gyro.add(feedback.timeInNs, feedback.angularRateInRadPerS.z);
    this.pendingFeedback = feedback;
    if (feedback.scan) this.pendingScan = feedback.scan;
    void this.flush();

    const command = this.latestCommand;
    if (!this.isConnected || !command) return STOPPED_COMMAND;
    const timeInS = feedback.timeInNs / 1e9;
    // The NC axes are the motors and encoders. The simulated wheels follow them,
    // then the simulator adds what NC cannot know: slip and collisions.
    const result: RobotCommand = {
      leftWheelSetpointInRadPerS: this.leftWheel.velocityInRadPerS(timeInS, feedback.leftWheelAngleInRad),
      rightWheelSetpointInRadPerS: this.rightWheel.velocityInRadPerS(timeInS, feedback.rightWheelAngleInRad),
      isDriveEnabled: command.isLeftDriveEnabled && command.isRightDriveEnabled,
      isLidarPowered: command.isLidarPowered,
    };
    this.linkLog?.push(this.linkLogRow(feedback, command, result));
    return result;
  }

  /** Starts recording every simulator step of the link, to see how the wheels follow NC. */
  startLinkLog(): void {
    this.linkLog = [LINK_LOG_HEADER.join(",")];
  }

  /** Stops recording and hands over the rows, or null when nothing was recorded. */
  takeLinkLog(): string[] | null {
    const log = this.linkLog;
    this.linkLog = null;
    return log;
  }

  private linkLogRow(feedback: RobotFeedback, command: PlcCommand, result: RobotCommand): string {
    const r = this.wheelRadiusInM;
    return [
      (feedback.timeInNs / 1e9).toFixed(3),
      String(command.plcTimeInNs),
      ((this.plcClockOffsetInS ?? 0) * 1000).toFixed(1),
      command.leftWheelPositionInM.toFixed(6),
      command.leftWheelVelocityInMPerS.toFixed(5),
      (feedback.leftWheelAngleInRad * r).toFixed(6),
      (result.leftWheelSetpointInRadPerS * r).toFixed(5),
      command.rightWheelPositionInM.toFixed(6),
      command.rightWheelVelocityInMPerS.toFixed(5),
      (feedback.rightWheelAngleInRad * r).toFixed(6),
      (result.rightWheelSetpointInRadPerS * r).toFixed(5),
      feedback.angularRateInRadPerS.z.toFixed(6),
      feedback.truePose.thetaInRad.toFixed(6),
    ].join(",");
  }

  get estimates(): PoseEstimate[] {
    return this.estimatedPose ? [{ id: "plc", label: "PLC-estimat", pose: this.estimatedPose }] : [];
  }

  async sendHmi(code: HmiCommandCode, twist: TwistJson = STANDING_STILL, pose: PoseJson = ORIGIN): Promise<void> {
    if (!this.isConnected) return;
    this.hmiSequence = (this.hmiSequence + 1) >>> 0;
    await this.client.writeValue("RobotHmi.command", {
      sequence: this.hmiSequence,
      code: HMI_COMMAND_CODES.indexOf(code),
      manualTwist: twist,
      pose,
    });
  }

  /** Tells the PLC where the robot is, as an operator would. The PLC restarts its estimate there. */
  async setPose(pose: Pose2D): Promise<void> {
    await this.sendHmi("SET_POSE", STANDING_STILL, { x: pose.x, y: pose.y, thetaInRad: pose.thetaInRad });
  }

  /** Updates only the manual twist, so holding a key does not resend the command. */
  async sendManualTwist(twist: TwistJson): Promise<void> {
    if (!this.isConnected) return;
    await this.client.writeValue("RobotHmi.command.manualTwist", twist);
  }

  private async initializeHmiSequence(): Promise<void> {
    const result = await this.client.readValue<{ sequence: number }>("RobotHmi.command");
    this.hmiSequence = result.value.sequence;
  }

  private async readLoop(): Promise<void> {
    while (this.running) {
      const result = await this.client.readValue<PlcCommand>("SimulatorIo.command");
      const command = result.value;
      if (command.version !== PROTOCOL_VERSION) {
        throw new Error(`SimulatorIo-versjon ${command.version} i PLC-en, serveren forventer ${PROTOCOL_VERSION}`);
      }
      this.takeCommand(command);
      const pose = command.estimatedPose;
      this.estimatedPose = new Pose2D(pose.x, pose.y, pose.thetaInRad);

      const now = Date.now();
      if (now - this.lastStatusReadInMs > STATUS_INTERVAL_IN_MS) {
        this.lastStatusReadInMs = now;
        const status = (await this.client.readValue<PlcStatus>("RobotHmi.status")).value;
        this.status = { ...status, missionState: MISSION_STATES[status.missionState] ?? "IDLE" };
      }
      if (now - this.lastMapReadInMs > MAP_INTERVAL_IN_MS) {
        this.lastMapReadInMs = now;
        await this.readMap();
      }
      await sleep(READ_INTERVAL_IN_MS);
    }
  }

  private async readMap(): Promise<void> {
    const info = (await this.client.readValue<PlcMapInfo>("RobotHmi.mapInfo")).value;
    if (info.widthInCells === 0 || info.revision === this.map?.revision) return;
    const cells = await this.client.readRawByPath("RobotHmi.mapCells");
    this.map = toPlcMapMessage(info, cells);
    this.onMap(this.map);
  }

  /**
   * The read loop is faster than the PLC task, so the same command often comes twice.
   * Each new PLC cycle gives the wheels one more point of the path NC drove, placed on
   * the simulator's clock. The two clocks are matched by the freshest command seen: the
   * smallest difference between them, which then follows slow drift.
   */
  private takeCommand(command: PlcCommand): void {
    const previous = this.latestCommand;
    this.latestCommand = command;
    if (previous && command.plcTimeInNs === previous.plcTimeInNs) return;
    if (this.lastFeedbackTimeInNs === null) return;
    const plcTimeInS = Number(BigInt(command.plcTimeInNs) / 1000n) / 1e6;
    const offsetInS = this.lastFeedbackTimeInNs / 1e9 - plcTimeInS;
    const known = this.plcClockOffsetInS;
    if (known === null || offsetInS < known || offsetInS - known > CLOCK_JUMP_IN_S) {
      if (known !== null && offsetInS - known > CLOCK_JUMP_IN_S) {
        this.leftWheel.reanchor();
        this.rightWheel.reanchor();
      }
      this.plcClockOffsetInS = offsetInS;
    } else {
      this.plcClockOffsetInS = known + CLOCK_DRIFT_GAIN * (offsetInS - known);
    }
    const timeInS = plcTimeInS + this.plcClockOffsetInS;
    this.leftWheel.addSample(timeInS, command.leftWheelPositionInM);
    this.rightWheel.addSample(timeInS, command.rightWheelPositionInM);
  }

  private async flush(): Promise<void> {
    if (this.isWriting || !this.isConnected) return;
    this.isWriting = true;
    try {
      while (this.pendingFeedback || this.pendingScan) {
        const feedback = this.pendingFeedback;
        const scan = this.pendingScan;
        this.pendingFeedback = null;
        this.pendingScan = null;
        const yawRate = feedback && this.gyro.takeAverage(feedback.timeInNs, feedback.angularRateInRadPerS.z);
        if (scan) await this.client.writeValue("SimulatorIo.scan", toPlcScan(scan));
        if (feedback) await this.client.writeValue("SimulatorIo.feedback", toPlcFeedback(feedback, yawRate ?? 0));
      }
    } catch (error) {
      this.lastError = (error as Error).message;
    } finally {
      this.isWriting = false;
    }
  }
}

interface PlcCommand {
  version: number;
  plcTimeInNs: bigint | number;
  leftWheelVelocityInMPerS: number;
  rightWheelVelocityInMPerS: number;
  leftWheelPositionInM: number;
  rightWheelPositionInM: number;
  isLeftDriveEnabled: boolean;
  isRightDriveEnabled: boolean;
  isLidarPowered: boolean;
  estimatedPose: { x: number; y: number; thetaInRad: number };
}

interface PlcMapInfo {
  revision: number;
  cellSizeInM: number;
  originXInM: number;
  originYInM: number;
  widthInCells: number;
  heightInCells: number;
  logOddsPerUnit: number;
}

/** Packs the PLC's map for the GUI. The bytes keep the PLC's layout, see PlcMapMessage. */
export function toPlcMapMessage(info: PlcMapInfo, cells: Uint8Array): PlcMapMessage {
  const expected = info.widthInCells * info.heightInCells;
  if (cells.length !== expected) {
    throw new Error(`RobotHmi.mapCells har ${cells.length} byte, mapInfo sier ${info.widthInCells} x ${info.heightInCells}`);
  }
  return {
    type: "plcMap",
    revision: info.revision,
    cellSizeInM: info.cellSizeInM,
    originXInM: info.originXInM,
    originYInM: info.originYInM,
    widthInCells: info.widthInCells,
    heightInCells: info.heightInCells,
    logOddsPerUnit: info.logOddsPerUnit,
    cellsBase64: Buffer.from(cells.buffer, cells.byteOffset, cells.length).toString("base64"),
  };
}

type PlcStatus = Omit<HmiStatusJson, "missionState"> & { missionState: number };

function toPlcFeedback(feedback: RobotFeedback, averageYawRateInRadPerS: number) {
  return {
    version: PROTOCOL_VERSION,
    sequence: feedback.sequence >>> 0,
    timeInNs: BigInt(feedback.timeInNs),
    leftWheelAngleInRad: feedback.leftWheelAngleInRad,
    rightWheelAngleInRad: feedback.rightWheelAngleInRad,
    leftWheelVelocityInRadPerS: feedback.leftWheelVelocityInRadPerS,
    rightWheelVelocityInRadPerS: feedback.rightWheelVelocityInRadPerS,
    angularRateInRadPerS: { ...feedback.angularRateInRadPerS, z: averageYawRateInRadPerS },
    accelerationInMPerS2: feedback.accelerationInMPerS2,
    truePose: { x: feedback.truePose.x, y: feedback.truePose.y, thetaInRad: feedback.truePose.thetaInRad },
    collided: feedback.collided,
  };
}

function toPlcScan(scan: LaserScan) {
  const ranges = new Array<number>(MAX_SCAN_POINTS).fill(0);
  const count = Math.min(scan.rangesInM.length, MAX_SCAN_POINTS);
  for (let i = 0; i < count; i++) ranges[i] = scan.rangesInM[i]!;
  return {
    sequence: scan.sequence >>> 0,
    startTimestampInNs: BigInt(scan.startTimestampInNs),
    scanDurationInS: scan.scanDurationInS,
    angleMinInRad: scan.angleMinInRad,
    angleIncrementInRad: scan.angleIncrementInRad,
    count,
    rangesInM: ranges,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
