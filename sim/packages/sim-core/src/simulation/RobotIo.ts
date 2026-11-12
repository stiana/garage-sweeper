import type { Pose2D } from "../math/Pose2D";
import type { Vec3 } from "../math/Vec3";
import type { LaserScan } from "../sensors/LaserScan";

/** What the controller (later the PLC) sends each cycle. Mirrors SimulatorCommand in the PLC. */
export interface RobotCommand {
  leftWheelSetpointInRadPerS: number;
  rightWheelSetpointInRadPerS: number;
  isDriveEnabled: boolean;
  isLidarPowered: boolean;
}

/** What the simulator returns each cycle. Mirrors SimulatorFeedback in the PLC. */
export interface RobotFeedback {
  sequence: number;
  timeInNs: number;
  leftWheelAngleInRad: number;
  rightWheelAngleInRad: number;
  leftWheelVelocityInRadPerS: number;
  rightWheelVelocityInRadPerS: number;
  angularRateInRadPerS: Vec3;
  accelerationInMPerS2: Vec3;
  /** Set only in the cycle a scan completes. */
  scan: LaserScan | null;
  /** Ground truth, for display and measuring error only. A controller must never use it. */
  truePose: Pose2D;
  collided: boolean;
}

/**
 * Anything that decides what the robot should do: keyboard driving in the GUI
 * today, the TwinCAT PLC over ADS later.
 */
export interface RobotController {
  exchange(feedback: RobotFeedback): RobotCommand;
}

export const STOPPED_COMMAND: RobotCommand = {
  leftWheelSetpointInRadPerS: 0,
  rightWheelSetpointInRadPerS: 0,
  isDriveEnabled: false,
  isLidarPowered: true,
};
