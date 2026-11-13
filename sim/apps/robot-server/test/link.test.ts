import { describe, expect, it } from "vitest";
import { GyroAverager } from "../src/GyroAverager";
import { WheelFollower } from "../src/WheelFollower";

const STEP_IN_NS = 10_000_000;
const STEP_IN_S = 0.01;

describe("WheelFollower", () => {
  it("replays the axis a fixed delay behind, at the speed it had then", () => {
    const follower = new WheelFollower(0.1, 0.01);
    follower.addSample(0, 5.0);
    follower.addSample(0.1, 5.03);
    // At 0.09 s it replays 0.05 s, in the middle of a 0.3 m/s stretch.
    expect(follower.velocityInRadPerS(0.09, 0)).toBeCloseTo(3, 9);
  });

  it("waits at the newest position instead of guessing past it", () => {
    const follower = new WheelFollower(0.1, 0.01);
    follower.addSample(0, 5.0);
    follower.addSample(0.01, 5.003);
    follower.velocityInRadPerS(0.05, 0);
    // Nothing new has come for a while: the wheel holds still where the axis was last seen.
    expect(follower.velocityInRadPerS(0.5, 0)).toBeCloseTo(0, 9);
  });

  it("corrects a position difference gently instead of in one jump", () => {
    const follower = new WheelFollower(0.1, 0.01);
    follower.addSample(0, 5.0);
    follower.velocityInRadPerS(0.1, 0);
    // The wheel has fallen 3 cm behind the standing axis.
    const velocity = follower.velocityInRadPerS(0.11, -0.3);
    expect(velocity * 0.1).toBeCloseTo(0.03 / WheelFollower.CATCH_UP_TIME_IN_S, 9);
  });

  it("re-anchors when the wheel is reset under it", () => {
    const follower = new WheelFollower(0.1, 0.01);
    follower.addSample(0, 5.0);
    follower.velocityInRadPerS(0.1, 10);
    // Restart puts the simulated wheel back to 0 while the axis stays.
    expect(follower.velocityInRadPerS(0.11, 0)).toBe(0);
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

describe("WheelFollower when the axis stops", () => {
  /** NC braking smoothly from 0.16 m/s to standstill in 0.25 s (about 1 m/s^2 at most), sampled every 10 ms. */
  const BRAKE_TIME_IN_S = 0.25;
  function brakingAxis() {
    const points: { timeInS: number; positionInM: number; velocityInMPerS: number }[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = Math.min(i * 0.01, BRAKE_TIME_IN_S);
      const phase = (Math.PI * t) / BRAKE_TIME_IN_S;
      points.push({
        timeInS: i * 0.01,
        positionInM: 0.08 * (t + (BRAKE_TIME_IN_S / Math.PI) * Math.sin(phase)),
        velocityInMPerS: t >= BRAKE_TIME_IN_S ? 0 : 0.08 * (1 + Math.cos(phase)),
      });
    }
    return points;
  }

  function followThroughLaggyLink(linkEvery: number) {
    const axis = brakingAxis();
    const stopPositionInM = axis[axis.length - 1]!.positionInM;
    const stoppedAtInS = axis.find((p) => p.velocityInMPerS === 0)!.timeInS;
    const follower = new WheelFollower(0.1, 0.01);
    let wheelAngle = 0;
    let furthestPastStopInM = -Infinity;
    let wheelHalfASecondAfterStopInM = NaN;
    for (let step = 0; step < 100; step++) {
      const timeInS = step * 0.01;
      // NC cycles reach the server in bunches: only every linkEvery-th step gets through,
      // carrying all the 10 ms cycles since the last one.
      if (step % linkEvery === 0) {
        for (const p of axis) if (p.timeInS <= timeInS + 1e-9) follower.addSample(p.timeInS, p.positionInM);
      }
      wheelAngle += follower.velocityInRadPerS(timeInS, wheelAngle) * 0.01;
      furthestPastStopInM = Math.max(furthestPastStopInM, wheelAngle * 0.1 - stopPositionInM);
      if (Number.isNaN(wheelHalfASecondAfterStopInM) && timeInS >= stoppedAtInS + 0.5) wheelHalfASecondAfterStopInM = wheelAngle * 0.1;
    }
    return { furthestPastStopInM, movedWhileStillInM: Math.abs(wheelAngle * 0.1 - wheelHalfASecondAfterStopInM) };
  }

  it("never runs past the stop, so it never turns back while NC stands still", () => {
    for (const linkEvery of [1, 2, 4]) {
      const run = followThroughLaggyLink(linkEvery);
      // Guessing ahead from old data passed the stop by 1.3 mm even with gentle braking.
      expect(run.furthestPastStopInM).toBeLessThan(0.00001);
      expect(run.movedWhileStillInM).toBeLessThan(0.00001);
    }
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
    const follower = new WheelFollower(geometry.wheelRadiusInM, 0.01);
    // An NC axis driving both wheels: ramps to 0.3 m/s at 1 m/s^2, holds, ramps down.
    let axisPosition = 3.0;
    let axisVelocity = 0;
    let feedback = simulation.step({ leftWheelSetpointInRadPerS: 0, rightWheelSetpointInRadPerS: 0, isDriveEnabled: true, isLidarPowered: false });
    const start = simulation.truePose;
    const startAngle = feedback.leftWheelAngleInRad;
    follower.addSample(0, axisPosition);
    let pending: { timeInS: number; positionInM: number }[] = [];
    for (let i = 0; i < 600; i++) {
      const target = i < 400 ? 0.3 : 0;
      axisVelocity += Math.max(-0.01, Math.min(0.01, target - axisVelocity));
      axisPosition += axisVelocity * 0.01;
      // The link only gets through every fourth step.
      pending.push({ timeInS: (i + 1) * 0.01, positionInM: axisPosition });
      if (i % 4 === 0) {
        for (const p of pending) follower.addSample(p.timeInS, p.positionInM);
        pending = [];
      }
      const wheel = follower.velocityInRadPerS((i + 1) * 0.01, feedback.leftWheelAngleInRad);
      feedback = simulation.step({ leftWheelSetpointInRadPerS: wheel, rightWheelSetpointInRadPerS: wheel, isDriveEnabled: true, isLidarPowered: false });
    }
    return {
      axisTravel: axisPosition - 3.0,
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
