import type { RobotGeometry } from "../config/types";

export interface WheelSpeeds {
  leftInRadPerS: number;
  rightInRadPerS: number;
}

/** Converts between body motion (v, omega) and wheel speeds for a differential drive. */
export class DiffDriveKinematics {
  constructor(private readonly geometry: RobotGeometry) {}

  toWheelSpeeds(forwardSpeedInMPerS: number, yawRateInRadPerS: number): WheelSpeeds {
    const halfTrack = this.geometry.trackWidthInM / 2;
    const r = this.geometry.wheelRadiusInM;
    return {
      leftInRadPerS: (forwardSpeedInMPerS - yawRateInRadPerS * halfTrack) / r,
      rightInRadPerS: (forwardSpeedInMPerS + yawRateInRadPerS * halfTrack) / r,
    };
  }

  /** Forward distance and heading change from wheel rotation, using the nominal geometry. */
  toBodyMotion(leftDeltaInRad: number, rightDeltaInRad: number): { distanceInM: number; headingChangeInRad: number } {
    const r = this.geometry.wheelRadiusInM;
    const left = leftDeltaInRad * r;
    const right = rightDeltaInRad * r;
    return { distanceInM: (left + right) / 2, headingChangeInRad: (right - left) / this.geometry.trackWidthInM };
  }
}
