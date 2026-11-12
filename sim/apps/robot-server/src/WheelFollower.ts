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
 *
 * That forecast uses the axis acceleration as well, and never runs past the
 * point where a braking axis stops. With velocity alone the wheel overshot every
 * stop by a millimetre or two and was then pulled back while NC already said it
 * stood still, and a gyro that sees that small turn learns it as bias.
 */
export class WheelFollower {
  private offsetInM: number | null = null;

  /** Above this the two are not the same motion any more, for example after a restart. */
  static readonly REANCHOR_ERROR_IN_M = 0.2;
  /** How fast a position difference is corrected. Long enough to keep the wheel speed smooth. */
  static readonly CATCH_UP_TIME_IN_S = 0.2;

  /** stepInS: how long the simulator runs each returned wheel speed. */
  constructor(
    private readonly wheelRadiusInM: number,
    private readonly stepInS: number,
  ) {}

  /** Forgets the link between the axis and the wheel, so the next call starts from where both are. */
  reanchor(): void {
    this.offsetInM = null;
  }

  /** ageInS: how long ago the axis had this position, velocity and acceleration. */
  velocityInRadPerS(
    axisPositionInM: number,
    axisVelocityInMPerS: number,
    axisAccelerationInMPerS2: number,
    ageInS: number,
    wheelAngleInRad: number,
  ): number {
    const axis = { positionInM: axisPositionInM, velocityInMPerS: axisVelocityInMPerS, accelerationInMPerS2: axisAccelerationInMPerS2 };
    const nowInM = forecastPositionInM(axis, ageInS);
    // The speed that takes the axis to where it will be when this step ends.
    const feedForwardInMPerS = (forecastPositionInM(axis, ageInS + this.stepInS) - nowInM) / this.stepInS;
    const wheelPositionInM = wheelAngleInRad * this.wheelRadiusInM;
    if (this.offsetInM === null) this.offsetInM = nowInM - wheelPositionInM;
    let errorInM = nowInM - this.offsetInM - wheelPositionInM;
    if (Math.abs(errorInM) > WheelFollower.REANCHOR_ERROR_IN_M) {
      this.offsetInM = nowInM - wheelPositionInM;
      errorInM = 0;
    }
    return (feedForwardInMPerS + errorInM / WheelFollower.CATCH_UP_TIME_IN_S) / this.wheelRadiusInM;
  }
}

interface AxisMotion {
  positionInM: number;
  velocityInMPerS: number;
  accelerationInMPerS2: number;
}

/** Where the axis is after timeInS at its acceleration. A braking axis stops and stays there. */
function forecastPositionInM(axis: AxisMotion, timeInS: number): number {
  const { positionInM, velocityInMPerS, accelerationInMPerS2 } = axis;
  if (velocityInMPerS * accelerationInMPerS2 < 0) timeInS = Math.min(timeInS, -velocityInMPerS / accelerationInMPerS2);
  return positionInM + velocityInMPerS * timeInS + 0.5 * accelerationInMPerS2 * timeInS * timeInS;
}
