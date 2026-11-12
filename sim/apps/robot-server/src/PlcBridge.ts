import { Client } from "ads-client";
import {
  Pose2D,
  type PoseEstimate,
  type LaserScan,
  type RobotCommand,
  type RobotController,
  type RobotFeedback,
  STOPPED_COMMAND,
} from "@garage/sim-core";
import { HMI_COMMAND_CODES, type HmiCommandCode, type HmiStatusJson, MISSION_STATES, type TwistJson } from "@garage/gui-protocol";

export interface PlcConnectionSettings {
  /** AmsNetId of the TwinCAT runtime. "localhost" when it runs on this PC. */
  targetAmsNetId: string;
  targetAdsPort: number;
  /** Only needed without a local TwinCAT router, e.g. on Linux. */
  routerAddress?: string;
  localAmsNetId?: string;
}

const PROTOCOL_VERSION = 2;
const MAX_SCAN_POINTS = 1024;
const READ_INTERVAL_IN_MS = 5;
const STATUS_INTERVAL_IN_MS = 100;
const RECONNECT_DELAY_IN_MS = 2000;

/**
 * The simulator's side of the ADS link. The PLC is a passive party: it owns
 * the SimulatorIo and RobotHmi globals, and this class reads commands from
 * and writes sensor data into them.
 */
export class PlcBridge implements RobotController {
  private readonly client: Client;
  private latestCommand: RobotCommand = STOPPED_COMMAND;
  private estimatedPose: Pose2D | null = null;
  private pendingFeedback: RobotFeedback | null = null;
  private pendingScan: LaserScan | null = null;
  private isWriting = false;
  private hmiSequence = 0;
  private lastStatusReadInMs = 0;
  private running = false;
  isConnected = false;
  status: HmiStatusJson | null = null;
  lastError = "";

  /** The true wheel radius of the simulated robot, from config/robot.json. */
  private readonly wheelRadiusInM: number;

  constructor(settings: PlcConnectionSettings, wheelRadiusInM: number) {
    this.wheelRadiusInM = wheelRadiusInM;
    this.client = new Client({
      targetAmsNetId: settings.targetAmsNetId,
      targetAdsPort: settings.targetAdsPort,
      routerAddress: settings.routerAddress,
      localAmsNetId: settings.localAmsNetId,
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
        this.isConnected = true;
        this.lastError = "";
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
    this.pendingFeedback = feedback;
    if (feedback.scan) this.pendingScan = feedback.scan;
    void this.flush();
    return this.isConnected ? this.latestCommand : STOPPED_COMMAND;
  }

  get estimates(): PoseEstimate[] {
    return this.estimatedPose ? [{ id: "plc", label: "PLC-estimat", pose: this.estimatedPose }] : [];
  }

  async sendHmi(code: HmiCommandCode, twist: TwistJson = { forwardSpeedInMPerS: 0, yawRateInRadPerS: 0 }): Promise<void> {
    if (!this.isConnected) return;
    this.hmiSequence = (this.hmiSequence + 1) >>> 0;
    await this.client.writeValue("RobotHmi.command", {
      sequence: this.hmiSequence,
      code: HMI_COMMAND_CODES.indexOf(code),
      manualTwist: twist,
    });
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
      this.latestCommand = {
        // The PLC sends what its NC axes actually do, in m/s along the wheel's rim, so the
        // motors' dynamics live in NC. The simulator turns it into wheel rotation.
        leftWheelSetpointInRadPerS: command.leftWheelVelocityInMPerS / this.wheelRadiusInM,
        rightWheelSetpointInRadPerS: command.rightWheelVelocityInMPerS / this.wheelRadiusInM,
        isDriveEnabled: command.isLeftDriveEnabled && command.isRightDriveEnabled,
        isLidarPowered: command.isLidarPowered,
      };
      const pose = command.estimatedPose;
      this.estimatedPose = new Pose2D(pose.x, pose.y, pose.thetaInRad);

      const now = Date.now();
      if (now - this.lastStatusReadInMs > STATUS_INTERVAL_IN_MS) {
        this.lastStatusReadInMs = now;
        const status = (await this.client.readValue<PlcStatus>("RobotHmi.status")).value;
        this.status = { ...status, missionState: MISSION_STATES[status.missionState] ?? "IDLE" };
      }
      await sleep(READ_INTERVAL_IN_MS);
    }
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
        if (scan) await this.client.writeValue("SimulatorIo.scan", toPlcScan(scan));
        if (feedback) await this.client.writeValue("SimulatorIo.feedback", toPlcFeedback(feedback));
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
  leftWheelVelocityInMPerS: number;
  rightWheelVelocityInMPerS: number;
  isLeftDriveEnabled: boolean;
  isRightDriveEnabled: boolean;
  isLidarPowered: boolean;
  estimatedPose: { x: number; y: number; thetaInRad: number };
}

type PlcStatus = Omit<HmiStatusJson, "missionState"> & { missionState: number };

function toPlcFeedback(feedback: RobotFeedback) {
  return {
    version: PROTOCOL_VERSION,
    sequence: feedback.sequence >>> 0,
    timeInNs: BigInt(feedback.timeInNs),
    leftWheelAngleInRad: feedback.leftWheelAngleInRad,
    rightWheelAngleInRad: feedback.rightWheelAngleInRad,
    leftWheelVelocityInRadPerS: feedback.leftWheelVelocityInRadPerS,
    rightWheelVelocityInRadPerS: feedback.rightWheelVelocityInRadPerS,
    angularRateInRadPerS: feedback.angularRateInRadPerS,
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
