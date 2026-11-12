import { describe, expect, it } from "vitest";
import { GyroAverager } from "../src/GyroAverager";
import { WheelFollower } from "../src/WheelFollower";

const STEP_IN_NS = 10_000_000;
const STEP_IN_S = 0.01;

describe("WheelFollower", () => {
  it("starts from wherever the axis and the wheel are, at the axis speed", () => {
    const follower = new WheelFollower(0.1);
    expect(follower.velocityInRadPerS(5.0, 0.3, 0, 0)).toBeCloseTo(3, 9);
  });

  it("corrects a position difference gently instead of in one jump", () => {
    const follower = new WheelFollower(0.1);
    follower.velocityInRadPerS(5.0, 0, 0, 0);
    // The axis is 3 cm further than the wheel, and standing still.
    const velocity = follower.velocityInRadPerS(5.03, 0, 0, 0);
    expect(velocity * 0.1).toBeCloseTo(0.03 / WheelFollower.CATCH_UP_TIME_IN_S, 9);
  });

  it("re-anchors when the wheel is reset under it", () => {
    const follower = new WheelFollower(0.1);
    follower.velocityInRadPerS(5.0, 0, 0, 10);
    // Restart puts the simulated wheel back to 0 while the axis stays.
    expect(follower.velocityInRadPerS(5.0, 0, 0, 0)).toBe(0);
  });
});

describe("GyroAverager", () => {
  it("hands over all rotation even when samples are skipped", () => {
    const averager = new GyroAverager();
    const rates = [0, 0.1, 0.5, 1.0, 0.2, -0.3, 0.0];
    let trueYaw = 0;
    let plcYaw = 0;
    let lastWrittenInNs = 0;
    rates.forEach((rate, i) => {
      const timeInNs = i * STEP_IN_NS;
      averager.add(timeInNs, rate);
      if (i > 0) trueYaw += rate * STEP_IN_S;
      // Only every third step reaches the PLC.
      if (i % 3 === 0) {
        const average = averager.takeAverage(timeInNs, rate);
        if (i > 0) plcYaw += average * (timeInNs - lastWrittenInNs) / 1e9;
        lastWrittenInNs = timeInNs;
      }
    });
    // Steps 0..6 were all written up to 6, so the PLC saw the whole rotation.
    expect(plcYaw).toBeCloseTo(trueYaw, 12);
  });

  it("starts over when the simulation restarts", () => {
    const averager = new GyroAverager();
    averager.add(5 * STEP_IN_NS, 1);
    averager.takeAverage(5 * STEP_IN_NS, 1);
    averager.add(0, 0.4);
    expect(averager.takeAverage(0, 0.4)).toBe(0.4);
  });
});

describe("WheelFollower in the simulation", () => {
  async function driveThroughLaggyLink(noiseName: "ideal" | "realistic") {
    const { Simulation, World } = await import("@garage/sim-core");
    const fixtures = await import("../../../packages/sim-core/test/fixtures");
    const { geometry, lidarS2e, emptyBoxWorld } = fixtures;
    const simulation = new Simulation({
      world: new World(emptyBoxWorld),
      geometry: { ...geometry, motorTimeConstantInS: 0 },
      noise: noiseName === "ideal" ? fixtures.idealNoise : fixtures.realisticNoise,
      lidarProfile: lidarS2e,
      seed: 1,
    });
    const follower = new WheelFollower(geometry.wheelRadiusInM);
    // An NC axis driving both wheels: ramps to 0.3 m/s at 1 m/s^2, holds, ramps down.
    let axisPosition = 3.0;
    let axisVelocity = 0;
    let heard = { position: axisPosition, velocity: axisVelocity, step: 0 };
    let feedback = simulation.step({ leftWheelSetpointInRadPerS: 0, rightWheelSetpointInRadPerS: 0, isDriveEnabled: true, isLidarPowered: false });
    const start = simulation.truePose;
    const startAngle = feedback.leftWheelAngleInRad;
    follower.velocityInRadPerS(axisPosition, 0, 0, feedback.leftWheelAngleInRad);
    for (let i = 0; i < 600; i++) {
      const target = i < 400 ? 0.3 : 0;
      axisVelocity += Math.max(-0.01, Math.min(0.01, target - axisVelocity));
      axisPosition += axisVelocity * 0.01;
      // The link only gets through every fourth step.
      if (i % 4 === 0) heard = { position: axisPosition, velocity: axisVelocity, step: i };
      const wheel = follower.velocityInRadPerS(heard.position, heard.velocity, (i - heard.step) * 0.01, feedback.leftWheelAngleInRad);
      feedback = simulation.step({ leftWheelSetpointInRadPerS: wheel, rightWheelSetpointInRadPerS: wheel, isDriveEnabled: true, isLidarPowered: false });
    }
    return {
      axisTravel: heard.position - 3.0,
      wheelTravel: (feedback.leftWheelAngleInRad - startAngle) * geometry.wheelRadiusInM,
      robotTravel: simulation.truePose.distanceTo(start),
    };
  }

  it("keeps the simulated wheels on the NC axis despite a laggy link", async () => {
    const run = await driveThroughLaggyLink("ideal");
    expect(Math.abs(run.wheelTravel - run.axisTravel)).toBeLessThan(0.002);
    expect(run.robotTravel).toBeCloseTo(run.wheelTravel, 3);
  });

  it("keeps the wheel speed smooth, so a laggy link does not cause extra slip", async () => {
    const run = await driveThroughLaggyLink("realistic");
    // Realistic slip is a few percent. Jumpy wheel speeds once gave over 25 %.
    expect(run.robotTravel / run.wheelTravel).toBeGreaterThan(0.95);
  });
});
