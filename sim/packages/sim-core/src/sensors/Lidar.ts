import type { LidarProfile, NoiseProfile } from "../config/types";
import type { Pose2D } from "../math/Pose2D";
import type { Random } from "../random/Random";
import type { World } from "../world/World";
import type { LaserScan } from "./LaserScan";

/**
 * A rotating 2D LIDAR. Rays are cast a few at a time as the head turns, from
 * wherever the robot is at that moment, so a moving robot gets the same skewed
 * scans as a real one.
 */
export class Lidar {
  private ranges: Float32Array;
  private nextRay = 0;
  private rayBudget = 0;
  private scanStartInNs = 0;
  private sequence = 0;

  constructor(private _profile: LidarProfile, private noise: NoiseProfile, private readonly random: Random) {
    this.ranges = new Float32Array(_profile.points);
  }

  get profile(): LidarProfile {
    return this._profile;
  }

  get completedScans(): number {
    return this.sequence;
  }

  setProfile(profile: LidarProfile): void {
    this._profile = profile;
    this.ranges = new Float32Array(profile.points);
    this.restartScan(0);
  }

  setNoise(noise: NoiseProfile): void {
    this.noise = noise;
  }

  /** Advances the rotating head. Returns a scan when one full turn is complete. */
  step(deltaTimeInS: number, sensorPose: Pose2D, world: World, isRunning: boolean, timeInNs: number): LaserScan | null {
    if (!isRunning) {
      this.restartScan(timeInNs);
      return null;
    }
    const profile = this._profile;
    const increment = (profile.angleMaxInRad - profile.angleMinInRad) / profile.points;
    this.rayBudget += profile.points * profile.rateInHz * deltaTimeInS;
    while (this.rayBudget >= 1 && this.nextRay < profile.points) {
      const angle = sensorPose.thetaInRad + profile.angleMinInRad + this.nextRay * increment;
      this.ranges[this.nextRay] = this.measure(sensorPose, angle, world);
      this.nextRay++;
      this.rayBudget--;
    }
    if (this.nextRay < profile.points) return null;

    this.sequence++;
    const scan: LaserScan = {
      sequence: this.sequence,
      startTimestampInNs: this.scanStartInNs,
      scanDurationInS: 1 / profile.rateInHz,
      angleMinInRad: profile.angleMinInRad,
      angleIncrementInRad: increment,
      rangesInM: this.ranges.slice(),
    };
    this.nextRay = 0;
    this.scanStartInNs = timeInNs;
    return scan;
  }

  private measure(sensorPose: Pose2D, angleInRad: number, world: World): number {
    const profile = this._profile;
    const lidarNoise = this.noise.lidar;
    if (this.random.next() < lidarNoise.spuriousProbability) {
      return profile.minRangeInM + this.random.next() * 1.0;
    }
    const hit = world.raycast(sensorPose.position, angleInRad, profile.maxRangeInM);
    if (!hit) return 0;
    const dropout = lidarNoise.dropoutProbability * (1 + 2 * (1 - hit.reflectivity));
    if (this.random.next() < dropout) return 0;
    const sigma = lidarNoise.rangeSigmaInM + lidarNoise.rangeSigmaRelative * hit.distanceInM;
    const range = hit.distanceInM + this.random.gaussian() * sigma;
    return range < profile.minRangeInM || range > profile.maxRangeInM ? 0 : range;
  }

  private restartScan(timeInNs: number): void {
    this.nextRay = 0;
    this.rayBudget = 0;
    this.scanStartInNs = timeInNs;
  }
}
