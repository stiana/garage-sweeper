/**
 * Makes a simulated wheel follow an NC axis position exactly.
 *
 * Sending the axis velocity is not enough: it reaches the simulator late and
 * sometimes not at all, so the simulated wheel slowly drifts away from what NC
 * (and the PLC's odometry) says it has turned. Following the position instead
 * lets the wheel catch up after any delay, so the two never drift apart.
 */
export class WheelFollower {
  private offsetInM: number | null = null;

  /** Above this the two are not the same motion any more, for example after a restart. */
  static readonly REANCHOR_ERROR_IN_M = 0.2;

  constructor(private readonly wheelRadiusInM: number) {}

  /** Forgets the link between the axis and the wheel, so the next call starts from where both are. */
  reanchor(): void {
    this.offsetInM = null;
  }

  /** The wheel velocity that brings the wheel to the axis position by the end of the step. */
  velocityInRadPerS(axisPositionInM: number, wheelAngleInRad: number, deltaTimeInS: number): number {
    const wheelPositionInM = wheelAngleInRad * this.wheelRadiusInM;
    if (this.offsetInM === null) this.offsetInM = axisPositionInM - wheelPositionInM;
    let errorInM = axisPositionInM - this.offsetInM - wheelPositionInM;
    if (Math.abs(errorInM) > WheelFollower.REANCHOR_ERROR_IN_M) {
      this.offsetInM = axisPositionInM - wheelPositionInM;
      errorInM = 0;
    }
    return errorInM / this.wheelRadiusInM / deltaTimeInS;
  }
}
