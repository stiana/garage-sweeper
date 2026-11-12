import {
  DiffDriveKinematics,
  type RobotCommand,
  type RobotController,
  type RobotFeedback,
  type RobotGeometry,
  type TwistSetpoint,
} from "@garage/sim-core";

const MAX_FORWARD_SPEED_IN_M_PER_S = 0.4;
const MAX_YAW_RATE_IN_RAD_PER_S = 1.2;
const ACCELERATION_IN_M_PER_S2 = 0.8;
const YAW_ACCELERATION_IN_RAD_PER_S2 = 3;

/**
 * Drives the robot from the keyboard (WASD or arrow keys) with gentle ramps.
 * Drives the in-browser simulator directly, or sends twists to the robot server.
 */
export class KeyboardController implements RobotController {
  private readonly pressed = new Set<string>();
  private forwardSpeed = 0;
  private yawRate = 0;
  private lastTimeInNs: number | null = null;
  private readonly kinematics: DiffDriveKinematics;
  isLidarPowered = true;

  constructor(geometry: RobotGeometry) {
    this.kinematics = new DiffDriveKinematics(geometry);
  }

  attach(target: Window): void {
    target.addEventListener("keydown", (event) => {
      if (isTyping(event)) return;
      const key = normalize(event.key);
      if (!key) return;
      event.preventDefault();
      if (key === "stop") this.stop();
      else this.pressed.add(key);
    });
    target.addEventListener("keyup", (event) => {
      const key = normalize(event.key);
      if (key) this.pressed.delete(key);
    });
    target.addEventListener("blur", () => this.pressed.clear());
  }

  /** For on-screen buttons on touch devices. */
  press(key: "forward" | "back" | "left" | "right", isDown: boolean): void {
    if (isDown) this.pressed.add(key);
    else this.pressed.delete(key);
  }

  stop(): void {
    this.pressed.clear();
    this.forwardSpeed = 0;
    this.yawRate = 0;
  }

  /** Advances the ramps by one time step and returns the twist the keys ask for. */
  twist(deltaTimeInS: number): TwistSetpoint {
    const forwardTarget = ((this.pressed.has("forward") ? 1 : 0) - (this.pressed.has("back") ? 1 : 0)) * MAX_FORWARD_SPEED_IN_M_PER_S;
    const yawTarget = ((this.pressed.has("left") ? 1 : 0) - (this.pressed.has("right") ? 1 : 0)) * MAX_YAW_RATE_IN_RAD_PER_S;
    this.forwardSpeed = approach(this.forwardSpeed, forwardTarget, ACCELERATION_IN_M_PER_S2 * deltaTimeInS);
    this.yawRate = approach(this.yawRate, yawTarget, YAW_ACCELERATION_IN_RAD_PER_S2 * deltaTimeInS);
    return { forwardSpeedInMPerS: this.forwardSpeed, yawRateInRadPerS: this.yawRate };
  }

  exchange(feedback: RobotFeedback): RobotCommand {
    const deltaTimeInS = this.lastTimeInNs === null ? 0 : (feedback.timeInNs - this.lastTimeInNs) / 1e9;
    this.lastTimeInNs = feedback.timeInNs;
    const { forwardSpeedInMPerS, yawRateInRadPerS } = this.twist(deltaTimeInS);
    const speeds = this.kinematics.toWheelSpeeds(forwardSpeedInMPerS, yawRateInRadPerS);
    return {
      leftWheelSetpointInRadPerS: speeds.leftInRadPerS,
      rightWheelSetpointInRadPerS: speeds.rightInRadPerS,
      isDriveEnabled: true,
      isLidarPowered: this.isLidarPowered,
    };
  }
}

function approach(current: number, target: number, maxStep: number): number {
  if (Math.abs(target - current) <= maxStep) return target;
  return current + Math.sign(target - current) * maxStep;
}

function normalize(key: string): "forward" | "back" | "left" | "right" | "stop" | null {
  switch (key) {
    case "ArrowUp": case "w": case "W": return "forward";
    case "ArrowDown": case "s": case "S": return "back";
    case "ArrowLeft": case "a": case "A": return "left";
    case "ArrowRight": case "d": case "D": return "right";
    case " ": return "stop";
    default: return null;
  }
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
}
