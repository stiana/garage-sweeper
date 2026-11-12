import type { NoiseProfile } from "../config/types";
import { DEG_TO_RAD } from "../math/angles";
import type { Vec3 } from "../math/Vec3";
import type { Random } from "../random/Random";

/** Rate gyro with constant bias, bias random walk, white noise and scale error. */
export class Gyro {
  private constantBias = 0;
  private walkingBias = 0;
  private last: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private noise: NoiseProfile, private readonly random: Random) {
    this.drawBias();
  }

  setNoise(noise: NoiseProfile): void {
    this.noise = noise;
    this.walkingBias = 0;
    this.drawBias();
  }

  /** Returns angular rate around x, y and z in rad/s. z is the yaw rate. */
  sample(trueYawRateInRadPerS: number, deltaTimeInS: number, isFrozen: boolean): Vec3 {
    if (isFrozen) return this.last;
    const gyro = this.noise.gyro;
    this.walkingBias += this.random.gaussian() * gyro.biasRandomWalkInDegPerSPerSqrtS * DEG_TO_RAD * Math.sqrt(deltaTimeInS);
    const white = gyro.whiteNoiseInDegPerS * DEG_TO_RAD;
    this.last = {
      x: this.random.gaussian() * white,
      y: this.random.gaussian() * white,
      z: trueYawRateInRadPerS * (1 + gyro.scaleError) + this.constantBias + this.walkingBias + this.random.gaussian() * white,
    };
    return this.last;
  }

  private drawBias(): void {
    const magnitude = this.noise.gyro.biasInDegPerS * DEG_TO_RAD;
    this.constantBias = this.random.next() < 0.5 ? -magnitude : magnitude;
  }
}
