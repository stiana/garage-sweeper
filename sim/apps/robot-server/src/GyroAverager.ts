/**
 * Keeps gyro rotation from getting lost when the PLC does not see every sample.
 *
 * The simulator measures the yaw rate every step, but the link to the PLC
 * cannot write every step. Instead of the latest sample, each written sample
 * carries the average rate since the previous written one. The PLC multiplies
 * it by the time between the two, and gets exactly the rotation in between.
 * Many real IMUs report delta angles for the same reason.
 */
export class GyroAverager {
  private yawInRad = 0;
  private lastTimeInNs: number | null = null;
  private writtenYawInRad = 0;
  private writtenTimeInNs: number | null = null;

  /** Call for every simulation step, written or not. */
  add(timeInNs: number, yawRateInRadPerS: number): void {
    if (this.lastTimeInNs !== null && timeInNs < this.lastTimeInNs) this.reset();
    if (this.lastTimeInNs !== null) this.yawInRad += yawRateInRadPerS * (timeInNs - this.lastTimeInNs) / 1e9;
    this.lastTimeInNs = timeInNs;
  }

  /** The rate to write with the sample at timeInNs, and remembers it as written. */
  takeAverage(timeInNs: number, latestRateInRadPerS: number): number {
    const previousTime = this.writtenTimeInNs;
    const previousYaw = this.writtenYawInRad;
    this.writtenTimeInNs = timeInNs;
    this.writtenYawInRad = this.yawInRad;
    if (previousTime === null || timeInNs <= previousTime) return latestRateInRadPerS;
    return (this.yawInRad - previousYaw) / ((timeInNs - previousTime) / 1e9);
  }

  private reset(): void {
    this.yawInRad = 0;
    this.lastTimeInNs = null;
    this.writtenYawInRad = 0;
    this.writtenTimeInNs = null;
  }
}
