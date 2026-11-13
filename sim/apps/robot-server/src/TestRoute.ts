import type { TwistJson } from "@garage/gui-protocol";

interface RouteStep {
  durationInS: number;
  twist: TwistJson;
}

const STILL: TwistJson = { forwardSpeedInMPerS: 0, yawRateInRadPerS: 0 };
const SIDE_IN_M = 1.0;
const SPEED_IN_M_PER_S = 0.3;
const TURN_RATE_IN_RAD_PER_S = 0.8;
const LAPS = 3;

/**
 * A fixed drive for comparing odometry between runs: stand still 10 s (so a
 * gyro bias can be learned), then three laps of a 1 x 1 m square, turning left,
 * with a short stop before and after each turn. About 100 s and 12 m.
 * It is open loop: the corners are not exact, but every run drives the same.
 */
export function squareRoute(): RouteStep[] {
  const steps: RouteStep[] = [{ durationInS: 10, twist: STILL }];
  for (let i = 0; i < LAPS * 4; i++) {
    steps.push(
      { durationInS: SIDE_IN_M / SPEED_IN_M_PER_S, twist: { forwardSpeedInMPerS: SPEED_IN_M_PER_S, yawRateInRadPerS: 0 } },
      { durationInS: 1, twist: STILL },
      { durationInS: Math.PI / 2 / TURN_RATE_IN_RAD_PER_S, twist: { forwardSpeedInMPerS: 0, yawRateInRadPerS: TURN_RATE_IN_RAD_PER_S } },
      { durationInS: 1, twist: STILL },
    );
  }
  return steps;
}

const SPIN_TURNS = 10;
const SPIN_STILL_IN_S = 3;

/** When the parts of the gyro calibration spin start, in seconds from its start. */
export const SPIN_PHASES = (() => {
  const spinInS = (SPIN_TURNS * 2 * Math.PI) / TURN_RATE_IN_RAD_PER_S;
  const counterClockwiseStartInS = 10;
  const clockwiseStartInS = counterClockwiseStartInS + spinInS + SPIN_STILL_IN_S;
  return { counterClockwiseStartInS, clockwiseStartInS, endInS: clockwiseStartInS + spinInS + SPIN_STILL_IN_S };
})();

/**
 * For calibrating the gyro scale: stand still 10 s (so the bias is learned),
 * spin ten turns counter-clockwise on the spot, stop, then ten turns clockwise,
 * and stop again. Both directions, so a scale error that differs with the
 * direction of turning shows up.
 */
export function spinRoute(): RouteStep[] {
  const spinInS = (SPIN_TURNS * 2 * Math.PI) / TURN_RATE_IN_RAD_PER_S;
  return [
    { durationInS: 10, twist: STILL },
    { durationInS: spinInS, twist: { forwardSpeedInMPerS: 0, yawRateInRadPerS: TURN_RATE_IN_RAD_PER_S } },
    { durationInS: SPIN_STILL_IN_S, twist: STILL },
    { durationInS: spinInS, twist: { forwardSpeedInMPerS: 0, yawRateInRadPerS: -TURN_RATE_IN_RAD_PER_S } },
    { durationInS: SPIN_STILL_IN_S, twist: STILL },
  ];
}

export class TestRoute {
  readonly durationInS: number;

  constructor(private readonly steps: RouteStep[] = squareRoute()) {
    this.durationInS = steps.reduce((sum, step) => sum + step.durationInS, 0);
  }

  /** The twist to drive this far into the route, or null when the route is over. */
  twistAt(elapsedInS: number): TwistJson | null {
    let startInS = 0;
    for (const step of this.steps) {
      if (elapsedInS < startInS + step.durationInS) return step.twist;
      startInS += step.durationInS;
    }
    return null;
  }
}
