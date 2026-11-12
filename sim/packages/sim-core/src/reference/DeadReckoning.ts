import type { RobotGeometry } from "../config/types";
import { normalizeAngle } from "../math/angles";
import { Pose2D } from "../math/Pose2D";
import { DiffDriveKinematics } from "../robot/DiffDriveKinematics";
import type { RobotFeedback } from "../simulation/RobotIo";

export type HeadingSource = "wheels" | "gyro";

/**
 * Plain dead reckoning, used by the GUI to show how far "naive" odometry
 * drifts. It is a reference for learning, not the robot's estimator: that one
 * lives in the PLC (WheelOdometry and HeadingFusion).
 */
export class DeadReckoning {
  private kinematics: DiffDriveKinematics;
  private _pose: Pose2D;
  private lastLeft: number | null = null;
  private lastRight: number | null = null;
  private lastTimeInNs: number | null = null;

  constructor(geometry: RobotGeometry, startPose: Pose2D, private headingSource: HeadingSource = "wheels") {
    this.kinematics = new DiffDriveKinematics(geometry);
    this._pose = startPose;
  }

  get pose(): Pose2D {
    return this._pose;
  }

  setHeadingSource(source: HeadingSource): void {
    this.headingSource = source;
  }

  reset(pose: Pose2D): void {
    this._pose = pose;
    this.lastLeft = null;
    this.lastRight = null;
    this.lastTimeInNs = null;
  }

  update(feedback: RobotFeedback): void {
    if (this.lastLeft === null || this.lastRight === null || this.lastTimeInNs === null) {
      this.remember(feedback);
      return;
    }
    const motion = this.kinematics.toBodyMotion(
      feedback.leftWheelAngleInRad - this.lastLeft,
      feedback.rightWheelAngleInRad - this.lastRight,
    );
    const deltaTimeInS = (feedback.timeInNs - this.lastTimeInNs) / 1e9;
    const headingChange = this.headingSource === "gyro"
      ? feedback.angularRateInRadPerS.z * deltaTimeInS
      : motion.headingChangeInRad;
    const next = this._pose.advance(motion.distanceInM, headingChange);
    this._pose = new Pose2D(next.x, next.y, normalizeAngle(next.thetaInRad));
    this.remember(feedback);
  }

  private remember(feedback: RobotFeedback): void {
    this.lastLeft = feedback.leftWheelAngleInRad;
    this.lastRight = feedback.rightWheelAngleInRad;
    this.lastTimeInNs = feedback.timeInNs;
  }
}
