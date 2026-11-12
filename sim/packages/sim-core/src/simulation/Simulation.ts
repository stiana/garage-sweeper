import type { LidarProfile, NoiseProfile, RobotGeometry } from "../config/types";
import { Pose2D } from "../math/Pose2D";
import { Vec2 } from "../math/Vec2";
import { SeededRandom } from "../random/Random";
import { type BodyCondition, DiffDriveBody } from "../robot/DiffDriveBody";
import { Accelerometer } from "../sensors/Accelerometer";
import { Gyro } from "../sensors/Gyro";
import { Lidar } from "../sensors/Lidar";
import type { World } from "../world/World";
import type { RobotCommand, RobotFeedback } from "./RobotIo";

export interface SimulationOptions {
  world: World;
  geometry: RobotGeometry;
  noise: NoiseProfile;
  lidarProfile: LidarProfile;
  seed: number;
}

/** Faults you can switch on to test the robot's error handling. */
export interface Faults {
  isLidarSignalLost: boolean;
  isGyroFrozen: boolean;
}

export const STEP_IN_S = 0.01;

export class Simulation {
  readonly faults: Faults = { isLidarSignalLost: false, isGyroFrozen: false };
  private body!: DiffDriveBody;
  private gyro!: Gyro;
  private accelerometer!: Accelerometer;
  private lidar!: Lidar;
  private _timeInNs = 0;
  private sequence = 0;
  private options: SimulationOptions;

  constructor(options: SimulationOptions) {
    this.options = { ...options };
    this.reset(options.seed);
  }

  get world(): World { return this.options.world; }
  get geometry(): RobotGeometry { return this.options.geometry; }
  get noise(): NoiseProfile { return this.options.noise; }
  get lidarProfile(): LidarProfile { return this.lidar.profile; }
  get seed(): number { return this.options.seed; }
  get timeInS(): number { return this._timeInNs / 1e9; }
  get truePose(): Pose2D { return this.body.pose; }
  get condition(): BodyCondition { return this.body.condition; }

  /** Starts over from the world's start pose with fresh, seeded noise. */
  reset(seed: number = this.options.seed): void {
    this.options.seed = seed;
    const root = new SeededRandom(seed);
    const { geometry, noise, world } = this.options;
    this.body = new DiffDriveBody(geometry, noise, root.fork(1), world.startPose);
    this.gyro = new Gyro(noise, root.fork(2));
    this.accelerometer = new Accelerometer(noise, root.fork(3));
    this.lidar = new Lidar(this.options.lidarProfile, noise, root.fork(4));
    this._timeInNs = 0;
    this.sequence = 0;
  }

  setWorld(world: World): void {
    this.options.world = world;
    this.reset();
  }

  setNoise(noise: NoiseProfile): void {
    this.options.noise = noise;
    this.body.setNoise(noise);
    this.gyro.setNoise(noise);
    this.accelerometer.setNoise(noise);
    this.lidar.setNoise(noise);
  }

  setLidarProfile(profile: LidarProfile): void {
    this.options.lidarProfile = profile;
    this.lidar.setProfile(profile);
  }

  setCondition(condition: BodyCondition): void {
    this.body.setCondition(condition);
  }

  /** Moves the robot without it noticing anything but its sensors (the "kidnapped robot" test). */
  kidnap(pose: Pose2D): void {
    this.body.teleport(pose);
  }

  step(command: RobotCommand, deltaTimeInS = STEP_IN_S): RobotFeedback {
    const world = this.options.world;
    this.body.step(
      deltaTimeInS,
      command.leftWheelSetpointInRadPerS,
      command.rightWheelSetpointInRadPerS,
      command.isDriveEnabled,
      world,
    );
    this._timeInNs += Math.round(deltaTimeInS * 1e9);

    const geometry = this.options.geometry;
    const sensorPose = new Pose2D(
      ...this.mountPosition(geometry),
      this.body.pose.thetaInRad,
    );
    const isLidarRunning = command.isLidarPowered && !this.faults.isLidarSignalLost && this.body.condition !== "tipped";
    const scan = this.lidar.step(deltaTimeInS, sensorPose, world, isLidarRunning, this._timeInNs);

    this.sequence++;
    return {
      sequence: this.sequence,
      timeInNs: this._timeInNs,
      leftWheelAngleInRad: this.body.leftWheelAngleInRad,
      rightWheelAngleInRad: this.body.rightWheelAngleInRad,
      leftWheelVelocityInRadPerS: this.body.leftWheelVelocityInRadPerS,
      rightWheelVelocityInRadPerS: this.body.rightWheelVelocityInRadPerS,
      angularRateInRadPerS: this.gyro.sample(this.body.yawRateInRadPerS, deltaTimeInS, this.faults.isGyroFrozen),
      accelerationInMPerS2: this.accelerometer.sample(this.body),
      scan,
      truePose: this.body.pose,
      collided: this.body.collided,
    };
  }

  private mountPosition(geometry: RobotGeometry): [number, number] {
    const world = this.body.pose.toWorld(new Vec2(geometry.lidarMountXInM, geometry.lidarMountYInM));
    return [world.x, world.y];
  }
}
