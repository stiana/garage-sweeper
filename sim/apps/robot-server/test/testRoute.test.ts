import { describe, expect, it } from "vitest";
import { TestRoute } from "../src/TestRoute";

describe("TestRoute", () => {
  const route = new TestRoute();

  it("stands still first, so a gyro bias can be learned", () => {
    expect(route.twistAt(5)).toEqual({ forwardSpeedInMPerS: 0, yawRateInRadPerS: 0 });
  });

  it("drives 12 m and turns 12 quarter turns", () => {
    let distance = 0;
    let turn = 0;
    for (let t = 0; t < route.durationInS; t += 0.001) {
      const twist = route.twistAt(t)!;
      distance += twist.forwardSpeedInMPerS * 0.001;
      turn += twist.yawRateInRadPerS * 0.001;
    }
    expect(distance).toBeCloseTo(12, 1);
    expect(turn).toBeCloseTo(12 * Math.PI / 2, 1);
  });

  it("ends", () => {
    expect(route.twistAt(route.durationInS + 0.1)).toBeNull();
  });
});
