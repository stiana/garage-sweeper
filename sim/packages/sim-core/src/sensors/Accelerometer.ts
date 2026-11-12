import type { NoiseProfile } from "../config/types";
import { GRAVITY_IN_M_PER_S2 } from "../math/angles";
import type { Vec3 } from "../math/Vec3";
import type { Random } from "../random/Random";
import type { DiffDriveBody } from "../robot/DiffDriveBody";

/** Body-frame acceleration including gravity: x forward, y left, z up. */
export class Accelerometer {
  constructor(private noise: NoiseProfile, private readonly random: Random) {}

  setNoise(noise: NoiseProfile): void {
    this.noise = noise;
  }

  sample(body: DiffDriveBody): Vec3 {
    const sigma = this.noise.accelerometer.whiteNoiseInMPerS2;
    const n = () => this.random.gaussian() * sigma;
    switch (body.condition) {
      case "tipped":
        return { x: GRAVITY_IN_M_PER_S2 + n(), y: n(), z: n() };
      case "lifted":
        return { x: this.random.gaussian() * 1.5, y: this.random.gaussian() * 1.5, z: GRAVITY_IN_M_PER_S2 + this.random.gaussian() * 3 };
      default:
        return {
          x: body.forwardAccelerationInMPerS2 + n(),
          y: body.forwardSpeedInMPerS * body.yawRateInRadPerS + n(),
          z: GRAVITY_IN_M_PER_S2 + n(),
        };
    }
  }
}
