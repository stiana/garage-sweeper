import { describe, expect, it } from "vitest";
import { GyroAverager } from "../src/GyroAverager";
import { WheelFollower } from "../src/WheelFollower";

const STEP_IN_NS = 10_000_000;
const STEP_IN_S = 0.01;

describe("WheelFollower", () => {
  it("starts from wherever the axis and the wheel are", () => {
    const follower = new WheelFollower(0.1);
    expect(follower.velocityInRadPerS(5.0, 0, STEP_IN_S)).toBe(0);
  });

  it("catches up with the axis after a delay, so nothing drifts", () => {
    const follower = new WheelFollower(0.1);
    let wheelAngle = 0;
    follower.velocityInRadPerS(5.0, wheelAngle, STEP_IN_S);
    // The axis moved 3 cm while the simulator heard nothing.
    const velocity = follower.velocityInRadPerS(5.03, wheelAngle, STEP_IN_S);
    wheelAngle += velocity * STEP_IN_S;
    expect(wheelAngle * 0.1).toBeCloseTo(0.03, 9);
    expect(follower.velocityInRadPerS(5.03, wheelAngle, STEP_IN_S)).toBeCloseTo(0, 9);
  });

  it("re-anchors when the wheel is reset under it", () => {
    const follower = new WheelFollower(0.1);
    follower.velocityInRadPerS(5.0, 10, STEP_IN_S);
    // Restart puts the simulated wheel back to 0 while the axis stays.
    expect(follower.velocityInRadPerS(5.0, 0, STEP_IN_S)).toBe(0);
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
  it("keeps the simulated wheels on the NC axes despite a laggy link", async () => {
    const { Simulation, World } = await import("@garage/sim-core");
    const { geometry, idealNoise, lidarS2e, emptyBoxWorld } = await import("../../../packages/sim-core/test/fixtures");
    const simulation = new Simulation({
      world: new World(emptyBoxWorld),
      geometry: { ...geometry, motorTimeConstantInS: 0 },
      noise: idealNoise,
      lidarProfile: lidarS2e,
      seed: 1,
    });
    const left = new WheelFollower(geometry.wheelRadiusInM);
    const right = new WheelFollower(geometry.wheelRadiusInM);
    let axisLeft = 3.0;
    let axisRight = 7.0;
    let heardLeft = axisLeft;
    let heardRight = axisRight;
    let feedback = simulation.step({ leftWheelSetpointInRadPerS: 0, rightWheelSetpointInRadPerS: 0, isDriveEnabled: true, isLidarPowered: false });
    const startLeft = feedback.leftWheelAngleInRad * geometry.wheelRadiusInM;
    const startRight = feedback.rightWheelAngleInRad * geometry.wheelRadiusInM;
    left.velocityInRadPerS(axisLeft, feedback.leftWheelAngleInRad, 0.01);
    right.velocityInRadPerS(axisRight, feedback.rightWheelAngleInRad, 0.01);
    for (let i = 0; i < 500; i++) {
      axisLeft += 0.002 + 0.001 * Math.sin(i / 20);
      axisRight += 0.003;
      // The link only gets through every fourth step.
      if (i % 4 === 0) {
        heardLeft = axisLeft;
        heardRight = axisRight;
      }
      feedback = simulation.step({
        leftWheelSetpointInRadPerS: left.velocityInRadPerS(heardLeft, feedback.leftWheelAngleInRad, 0.01),
        rightWheelSetpointInRadPerS: right.velocityInRadPerS(heardRight, feedback.rightWheelAngleInRad, 0.01),
        isDriveEnabled: true,
        isLidarPowered: false,
      });
    }
    const wheelLeft = feedback.leftWheelAngleInRad * geometry.wheelRadiusInM - startLeft;
    const wheelRight = feedback.rightWheelAngleInRad * geometry.wheelRadiusInM - startRight;
    expect(wheelLeft).toBeCloseTo(heardLeft - 3.0, 6);
    expect(wheelRight).toBeCloseTo(heardRight - 7.0, 6);
  });
});
