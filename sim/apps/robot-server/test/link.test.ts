import { describe, expect, it } from "vitest";
import { GyroAverager } from "../src/GyroAverager";
import { WheelFollower } from "../src/WheelFollower";

const STEP_IN_NS = 10_000_000;
const STEP_IN_S = 0.01;

describe("WheelFollower", () => {
  it("starts from wherever the axis and the wheel are, at the axis speed", () => {
    const follower = new WheelFollower(0.1, 0.01);
    expect(follower.velocityInRadPerS(5.0, 0.3, 0, 0, 0)).toBeCloseTo(3, 9);
  });

  it("corrects a position difference gently instead of in one jump", () => {
    const follower = new WheelFollower(0.1, 0.01);
    follower.velocityInRadPerS(5.0, 0, 0, 0, 0);
    // The axis is 3 cm further than the wheel, and standing still.
    const velocity = follower.velocityInRadPerS(5.03, 0, 0, 0, 0);
    expect(velocity * 0.1).toBeCloseTo(0.03 / WheelFollower.CATCH_UP_TIME_IN_S, 9);
  });

  it("re-anchors when the wheel is reset under it", () => {
    const follower = new WheelFollower(0.1, 0.01);
    follower.velocityInRadPerS(5.0, 0, 0, 0, 10);
    // Restart puts the simulated wheel back to 0 while the axis stays.
    expect(follower.velocityInRadPerS(5.0, 0, 0, 0, 0)).toBe(0);
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

interface Heard {
  position: number;
  velocity: number;
  acceleration: number;
  step: number;
}

/** What the server learns from a new PLC command: as PlcBridge, acceleration between two commands. */
function hear(previous: Heard, position: number, velocity: number, step: number): Heard {
  const dtInS = (step - previous.step) * 0.01;
  return { position, velocity, acceleration: dtInS > 0 ? (velocity - previous.velocity) / dtInS : 0, step };
}

describe("WheelFollower when the axis stops", () => {
  const STOP_POSITION_IN_M = (0.16 * 0.16) / (2 * 1.5);

  function brakeToStandstill(linkEvery: number) {
    const follower = new WheelFollower(0.1, 0.01);
    let axisPosition = 0;
    let axisVelocity = 0.16;
    let wheelAngle = 0;
    let heard: Heard = { position: 0, velocity: axisVelocity, acceleration: 0, step: 0 };
    follower.velocityInRadPerS(0, axisVelocity, 0, 0, 0);
    let stoppedAtStep = -1;
    let furthestAheadInM = 0;
    let wheelWhenStoppedInM = 0;
    for (let i = 0; i < 300; i++) {
      // The simulator runs one step from time i with what it last heard ...
      wheelAngle += follower.velocityInRadPerS(heard.position, heard.velocity, heard.acceleration, (i - heard.step) * 0.01, wheelAngle) * 0.01;
      // ... while NC brakes at 1.5 m/s^2 and stops.
      const timeInS = Math.min((i + 1) * 0.01, 0.16 / 1.5);
      axisVelocity = 0.16 - 1.5 * timeInS;
      axisPosition = 0.16 * timeInS - 0.75 * timeInS * timeInS;
      if ((i + 1) % linkEvery === 0) heard = hear(heard, axisPosition, axisVelocity, i + 1);
      // Running ahead while braking is fine; passing the point where NC stops is not.
      furthestAheadInM = Math.max(furthestAheadInM, wheelAngle * 0.1 - STOP_POSITION_IN_M);
      if (axisVelocity <= 0 && stoppedAtStep < 0) stoppedAtStep = i;
      // Half a second after NC stopped, GyroOdometry starts learning bias.
      if (i === stoppedAtStep + 50) wheelWhenStoppedInM = wheelAngle * 0.1;
    }
    return { furthestAheadInM, movedWhileStillInM: Math.abs(wheelAngle * 0.1 - wheelWhenStoppedInM) };
  }

  it("does not overshoot a stop and turn back while NC already stands still", () => {
    for (const linkEvery of [1, 2, 4]) {
      const run = brakeToStandstill(linkEvery);
      // The server only learns that NC brakes one command late, so the wheel may pass
      // the stop a little. Forecasting with velocity alone passed it by up to 2.3 mm.
      expect(run.furthestAheadInM).toBeLessThan(0.001);
      // What matters for the gyro: once NC has stood still for half a second, the wheel
      // must too. Velocity alone still pulled it back 0.23 mm then, which GyroOdometry
      // learned as about 0.1 deg/s of gyro bias.
      expect(run.movedWhileStillInM).toBeLessThan(0.00003);
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
    let heard = { position: axisPosition, velocity: axisVelocity, acceleration: 0, step: 0 };
    let feedback = simulation.step({ leftWheelSetpointInRadPerS: 0, rightWheelSetpointInRadPerS: 0, isDriveEnabled: true, isLidarPowered: false });
    const start = simulation.truePose;
    const startAngle = feedback.leftWheelAngleInRad;
    follower.velocityInRadPerS(axisPosition, 0, 0, 0, feedback.leftWheelAngleInRad);
    for (let i = 0; i < 600; i++) {
      const target = i < 400 ? 0.3 : 0;
      axisVelocity += Math.max(-0.01, Math.min(0.01, target - axisVelocity));
      axisPosition += axisVelocity * 0.01;
      // The link only gets through every fourth step.
      if (i % 4 === 0) heard = hear(heard, axisPosition, axisVelocity, i);
      const wheel = follower.velocityInRadPerS(heard.position, heard.velocity, heard.acceleration, (i - heard.step) * 0.01, feedback.leftWheelAngleInRad);
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
