import { describe, expect, it } from "vitest";
import { normalizeAngle } from "@garage/sim-core";
import { GyroCalibration } from "../src/GyroCalibration";
import { SPIN_PHASES, TestRoute, spinRoute } from "../src/TestRoute";

const SAMPLE_IN_S = 0.02;

/** Drives the spin route and feeds the calibration, with an estimate that turns `scale` times the truth each way. */
function calibrate(counterClockwiseScale: number, clockwiseScale: number) {
  const route = new TestRoute(spinRoute());
  const calibration = new GyroCalibration();
  let trueTheta = 0;
  let estimateTheta = 0.3;
  for (let t = 0; t <= route.durationInS + SAMPLE_IN_S; t += SAMPLE_IN_S) {
    calibration.sample(t, normalizeAngle(trueTheta), [{ id: "plc", label: "PLC-estimat", thetaInRad: normalizeAngle(estimateTheta) }]);
    const rate = route.twistAt(t)?.yawRateInRadPerS ?? 0;
    trueTheta += rate * SAMPLE_IN_S;
    estimateTheta += rate * SAMPLE_IN_S * (rate > 0 ? counterClockwiseScale : clockwiseScale);
  }
  return calibration.results()[0]!;
}

describe("spin route", () => {
  it("stands still, then turns ten times each way", () => {
    const route = new TestRoute(spinRoute());
    expect(route.twistAt(5)!.yawRateInRadPerS).toBe(0);
    let ccw = 0;
    let cw = 0;
    for (let t = 0; t < route.durationInS; t += 0.001) {
      const rate = route.twistAt(t)!.yawRateInRadPerS;
      if (rate > 0) ccw += rate * 0.001;
      else cw -= rate * 0.001;
    }
    expect(ccw / (2 * Math.PI)).toBeCloseTo(10, 2);
    expect(cw / (2 * Math.PI)).toBeCloseTo(10, 2);
    expect(route.durationInS).toBeCloseTo(SPIN_PHASES.endInS, 6);
  });
});

describe("GyroCalibration", () => {
  it("finds the factor that undoes a gyro that reads 1 % too much", () => {
    const result = calibrate(1.01, 1.01);
    expect(result.trueTurnInDeg).toBeCloseTo(3600, 0);
    expect(result.factor).toBeCloseTo(1 / 1.01, 4);
  });

  it("shows when the error differs between the two directions", () => {
    const result = calibrate(1.02, 1.0);
    expect(result.counterClockwiseFactor).toBeCloseTo(1 / 1.02, 4);
    expect(result.clockwiseFactor).toBeCloseTo(1, 4);
  });

  it("follows the heading through many passes of +-180 deg", () => {
    expect(calibrate(1, 1).factor).toBeCloseTo(1, 6);
  });
});
