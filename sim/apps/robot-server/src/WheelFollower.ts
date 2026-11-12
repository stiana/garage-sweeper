/**
 * Makes a simulated wheel follow an NC axis without drifting away from it.
 *
 * The wheel runs at the axis velocity, and the difference to the axis
 * position is corrected gently on top. Velocity alone reaches the simulator
 * late and sometimes not at all, so the wheel would slowly drift away from
 * what NC (and the PLC's odometry) says it has turned. Position alone would
 * make the wheel speed jump every time an update arrives late, which the
 * simulator reads as hard acceleration and turns into wheel slip. For the same
 * reason the axis position is first moved forward by how old it is, so the
 * difference left to correct is small and changes smoothly.
 */
export class WheelFollower {
  private offsetInM: number | null = null;

  /** Above this the two are not the same motion any more, for example after a restart. */
  static readonly REANCHOR_ERROR_IN_M = 0.2;
  /** How fast a position difference is corrected. Long enough to keep the wheel speed smooth. */
  static readonly CATCH_UP_TIME_IN_S = 0.2;

  constructor(private readonly wheelRadiusInM: number) {}

  /** Forgets the link between the axis and the wheel, so the next call starts from where both are. */
  reanchor(): void {
    this.offsetInM = null;
  }

  /** ageInS: how long ago the axis had this position and velocity. */
  velocityInRadPerS(axisPositionInM: number, axisVelocityInMPerS: number, ageInS: number, wheelAngleInRad: number): number {
    axisPositionInM += axisVelocityInMPerS * ageInS;
    const wheelPositionInM = wheelAngleInRad * this.wheelRadiusInM;
    if (this.offsetInM === null) this.offsetInM = axisPositionInM - wheelPositionInM;
    let errorInM = axisPositionInM - this.offsetInM - wheelPositionInM;
    if (Math.abs(errorInM) > WheelFollower.REANCHOR_ERROR_IN_M) {
      this.offsetInM = axisPositionInM - wheelPositionInM;
      errorInM = 0;
    }
    return (axisVelocityInMPerS + errorInM / WheelFollower.CATCH_UP_TIME_IN_S) / this.wheelRadiusInM;
  }
}
