import type { RobotGeometry } from "../config/types";
import { DiffDriveKinematics } from "../robot/DiffDriveKinematics";
import type { RobotCommand, RobotController, RobotFeedback } from "../simulation/RobotIo";

export interface TwistSetpoint {
  forwardSpeedInMPerS: number;
  yawRateInRadPerS: number;
}

/** Drives the simulated robot straight from a desired twist, without a PLC in between. */
export class TwistController implements RobotController {
  private readonly kinematics: DiffDriveKinematics;
  isLidarPowered = true;

  constructor(geometry: RobotGeometry, private readonly twist: (deltaTimeInS: number) => TwistSetpoint) {
    this.kinematics = new DiffDriveKinematics(geometry);
  }

  private lastTimeInNs: number | null = null;

  exchange(feedback: RobotFeedback): RobotCommand {
    const deltaTimeInS = this.lastTimeInNs === null ? 0 : (feedback.timeInNs - this.lastTimeInNs) / 1e9;
    this.lastTimeInNs = feedback.timeInNs;
    const twist = this.twist(deltaTimeInS);
    const speeds = this.kinematics.toWheelSpeeds(twist.forwardSpeedInMPerS, twist.yawRateInRadPerS);
    return {
      leftWheelSetpointInRadPerS: speeds.leftInRadPerS,
      rightWheelSetpointInRadPerS: speeds.rightInRadPerS,
      isDriveEnabled: true,
      isLidarPowered: this.isLidarPowered,
    };
  }
}
