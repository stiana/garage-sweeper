import type { NoiseProfile, RobotGeometry } from "../config/types";
import { Pose2D } from "../math/Pose2D";
import type { Random } from "../random/Random";
import type { World } from "../world/World";

export type BodyCondition = "normal" | "lifted" | "tipped";

/**
 * The robot's true physical body. The encoders are honest about the wheels,
 * but the ground moves differently from what the wheels think: the true wheel
 * radius and track width differ from nominal, and the wheels slip.
 */
export class DiffDriveBody {
  private _pose: Pose2D;
  private _leftWheelVelocity = 0;
  private _rightWheelVelocity = 0;
  private _leftWheelAngle = 0;
  private _rightWheelAngle = 0;
  private _yawRate = 0;
  private _forwardSpeed = 0;
  private _forwardAcceleration = 0;
  private _collided = false;
  private _condition: BodyCondition = "normal";

  constructor(
    private readonly geometry: RobotGeometry,
    private noise: NoiseProfile,
    private readonly random: Random,
    startPose: Pose2D,
  ) {
    this._pose = startPose;
  }

  get pose(): Pose2D { return this._pose; }
  get leftWheelAngleInRad(): number { return this._leftWheelAngle; }
  get rightWheelAngleInRad(): number { return this._rightWheelAngle; }
  get leftWheelVelocityInRadPerS(): number { return this._leftWheelVelocity; }
  get rightWheelVelocityInRadPerS(): number { return this._rightWheelVelocity; }
  get yawRateInRadPerS(): number { return this._yawRate; }
  get forwardSpeedInMPerS(): number { return this._forwardSpeed; }
  get forwardAccelerationInMPerS2(): number { return this._forwardAcceleration; }
  get collided(): boolean { return this._collided; }
  get condition(): BodyCondition { return this._condition; }

  setNoise(noise: NoiseProfile): void {
    this.noise = noise;
  }

  setCondition(condition: BodyCondition): void {
    this._condition = condition;
  }

  teleport(pose: Pose2D): void {
    this._pose = pose;
  }

  step(deltaTimeInS: number, leftSetpoint: number, rightSetpoint: number, isEnabled: boolean, world: World): void {
    const maxSpeed = this.geometry.maxWheelSpeedInRadPerS;
    const clamp = (v: number) => Math.max(-maxSpeed, Math.min(maxSpeed, v));
    const leftTarget = isEnabled ? clamp(leftSetpoint) : 0;
    const rightTarget = isEnabled ? clamp(rightSetpoint) : 0;

    const blend = 1 - Math.exp(-deltaTimeInS / this.geometry.motorTimeConstantInS);
    const previousLeft = this._leftWheelVelocity;
    const previousRight = this._rightWheelVelocity;
    this._leftWheelVelocity += (leftTarget - previousLeft) * blend;
    this._rightWheelVelocity += (rightTarget - previousRight) * blend;
    this._leftWheelAngle += this._leftWheelVelocity * deltaTimeInS;
    this._rightWheelAngle += this._rightWheelVelocity * deltaTimeInS;

    this._collided = false;
    const previousSpeed = this._forwardSpeed;

    if (this._condition !== "normal") {
      this._forwardSpeed = 0;
      this._yawRate = 0;
      this._forwardAcceleration = 0;
      return;
    }

    const friction = world.frictionAt(this._pose.position);
    const r = this.geometry.wheelRadiusInM;
    const odometry = this.noise.odometry;
    const leftGround = this._leftWheelVelocity * r * (1 + odometry.wheelRadiusErrorLeft)
      * (1 - this.slip(this._leftWheelVelocity - previousLeft, deltaTimeInS, friction));
    const rightGround = this._rightWheelVelocity * r * (1 + odometry.wheelRadiusErrorRight)
      * (1 - this.slip(this._rightWheelVelocity - previousRight, deltaTimeInS, friction));

    const forwardSpeed = (leftGround + rightGround) / 2;
    const yawRate = (rightGround - leftGround) / (this.geometry.trackWidthInM * (1 + odometry.trackWidthError));
    const next = this._pose.advance(forwardSpeed * deltaTimeInS, yawRate * deltaTimeInS);

    if (world.collidesWithCircle(next.position, this.geometry.bodyRadiusInM)) {
      this._collided = true;
      this._pose = new Pose2D(this._pose.x, this._pose.y, next.thetaInRad);
      this._forwardSpeed = 0;
    } else {
      this._pose = next;
      this._forwardSpeed = forwardSpeed;
    }
    this._yawRate = yawRate;
    this._forwardAcceleration = (this._forwardSpeed - previousSpeed) / deltaTimeInS;
  }

  /** Fraction of wheel motion lost to slip. Grows with acceleration and on slippery floor. */
  private slip(wheelVelocityChange: number, deltaTimeInS: number, friction: number): number {
    const sigma = this.noise.odometry.slipSigma;
    if (sigma === 0) return 0;
    const accelerationInMPerS2 = Math.abs(wheelVelocityChange / deltaTimeInS) * this.geometry.wheelRadiusInM;
    const slip = Math.abs(this.random.gaussian()) * sigma * (1 + accelerationInMPerS2) / Math.max(friction, 0.05);
    return Math.min(slip, 0.9);
  }
}
