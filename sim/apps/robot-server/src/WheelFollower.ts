/**
 * Makes a simulated wheel follow an NC axis without drifting away from it.
 *
 * The axis positions arrive late and unevenly over ADS. Earlier versions
 * guessed where the axis was now from its last position, velocity and
 * acceleration. A guess misses whenever the axis brakes, so the wheel ran past
 * every stop and was pulled back while NC already reported standstill, and the
 * gyro, which sees that small turn, learned it as bias.
 *
 * Instead the wheel replays the path NC actually drove, a fixed DELAY_IN_S
 * behind. Within that delay the positions on both sides are already known, so
 * the wheel only ever goes where the axis went. A small difference that is left
 * is corrected gently on top, so the wheel speed never jumps (the simulator
 * reads a jump as hard acceleration and turns it into wheel slip).
 */
export class WheelFollower {
  /** Longer than the usual ADS and timer jitter, much shorter than GyroOdometry's 0.5 s standstill wait. */
  static readonly DELAY_IN_S = 0.04;
  /** Above this the two are not the same motion any more, for example after a restart. */
  static readonly REANCHOR_ERROR_IN_M = 0.2;
  /** How fast a position difference is corrected. Long enough to keep the wheel speed smooth. */
  static readonly CATCH_UP_TIME_IN_S = 0.2;
  private static readonly HISTORY_IN_S = 1;

  private samples: AxisSample[] = [];
  private offsetInM: number | null = null;

  /** stepInS: how long the simulator runs each returned wheel speed. */
  constructor(
    private readonly wheelRadiusInM: number,
    private readonly stepInS: number,
  ) {}

  /** Forgets the axis path and the link to the wheel, so the next call starts from where both are. */
  reanchor(): void {
    this.samples = [];
    this.offsetInM = null;
  }

  /** Where the axis was at timeInS, on the simulator's clock. */
  addSample(timeInS: number, positionInM: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last && timeInS <= last.timeInS) return;
    this.samples.push({ timeInS, positionInM });
    while (this.samples.length > 2 && this.samples[0]!.timeInS < timeInS - WheelFollower.HISTORY_IN_S) this.samples.shift();
  }

  /** The wheel speed for the simulator step that starts at timeInS. */
  velocityInRadPerS(timeInS: number, wheelAngleInRad: number): number {
    if (this.samples.length === 0) return 0;
    const replayInS = timeInS - WheelFollower.DELAY_IN_S;
    const axisNowInM = this.positionAt(replayInS);
    // The speed that takes the wheel to where the axis was at the end of this step.
    const feedForwardInMPerS = (this.positionAt(replayInS + this.stepInS) - axisNowInM) / this.stepInS;
    const wheelPositionInM = wheelAngleInRad * this.wheelRadiusInM;
    if (this.offsetInM === null) this.offsetInM = axisNowInM - wheelPositionInM;
    let errorInM = axisNowInM - this.offsetInM - wheelPositionInM;
    if (Math.abs(errorInM) > WheelFollower.REANCHOR_ERROR_IN_M) {
      this.offsetInM = axisNowInM - wheelPositionInM;
      errorInM = 0;
    }
    return (feedForwardInMPerS + errorInM / WheelFollower.CATCH_UP_TIME_IN_S) / this.wheelRadiusInM;
  }

  /** The axis position at timeInS, between the two samples around it. Past the newest, it waits there. */
  private positionAt(timeInS: number): number {
    const samples = this.samples;
    const last = samples[samples.length - 1]!;
    if (timeInS >= last.timeInS) return last.positionInM;
    let i = samples.length - 1;
    while (i > 0 && samples[i - 1]!.timeInS > timeInS) i--;
    if (i === 0) return samples[0]!.positionInM;
    const before = samples[i - 1]!;
    const after = samples[i]!;
    const fraction = (timeInS - before.timeInS) / (after.timeInS - before.timeInS);
    return before.positionInM + (after.positionInM - before.positionInM) * fraction;
  }
}

interface AxisSample {
  timeInS: number;
  positionInM: number;
}
