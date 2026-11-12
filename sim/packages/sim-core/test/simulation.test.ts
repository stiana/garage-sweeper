import { describe, expect, it } from "vitest";
import { DeadReckoning, DiffDriveKinematics, STOPPED_COMMAND, Simulation, World, type RobotCommand } from "@garage/sim-core";
import { emptyBoxWorld, geometry, idealNoise, lidarS2e, realisticNoise } from "./fixtures";

function drive(forward: number, yawRate: number): RobotCommand {
  const speeds = new DiffDriveKinematics(geometry).toWheelSpeeds(forward, yawRate);
  return { leftWheelSetpointInRadPerS: speeds.leftInRadPerS, rightWheelSetpointInRadPerS: speeds.rightInRadPerS, isDriveEnabled: true, isLidarPowered: true };
}

function makeSimulation(noise = idealNoise, seed = 1) {
  return new Simulation({ world: new World(emptyBoxWorld), geometry, noise, lidarProfile: lidarS2e, seed });
}

describe("Simulation", () => {
  it("drives straight with ideal noise and dead reckoning matches the truth", () => {
    const sim = makeSimulation();
    const odometry = new DeadReckoning(geometry, sim.truePose);
    odometry.update(sim.step(STOPPED_COMMAND));
    for (let i = 0; i < 300; i++) odometry.update(sim.step(drive(0.3, 0)));
    expect(sim.truePose.x).toBeGreaterThan(2.7);
    expect(odometry.pose.distanceTo(sim.truePose)).toBeLessThan(1e-6);
  });

  it("produces scans at the LIDAR rate with one range per point", () => {
    const sim = makeSimulation();
    let scans = 0;
    for (let i = 0; i < 100; i++) {
      const scan = sim.step(drive(0, 0)).scan;
      if (scan) {
        scans++;
        expect(scan.rangesInM.length).toBe(lidarS2e.points);
      }
    }
    expect(scans).toBe(10);
  });

  it("stops scanning when the LIDAR signal is lost", () => {
    const sim = makeSimulation();
    sim.faults.isLidarSignalLost = true;
    for (let i = 0; i < 100; i++) expect(sim.step(drive(0, 0)).scan).toBeNull();
  });

  it("stops at a wall instead of driving through it", () => {
    const sim = makeSimulation();
    let collided = false;
    for (let i = 0; i < 1500; i++) collided = sim.step(drive(0.5, 0)).collided || collided;
    expect(collided).toBe(true);
    expect(sim.truePose.x).toBeLessThan(4 - geometry.bodyRadiusInM + 0.01);
  });

  it("drifts with realistic noise, and the same seed gives the same run", () => {
    const run = (seed: number) => {
      const sim = makeSimulation(realisticNoise, seed);
      const odometry = new DeadReckoning(geometry, sim.truePose);
    odometry.update(sim.step(STOPPED_COMMAND));
      for (let i = 0; i < 1000; i++) odometry.update(sim.step(drive(0.15, 0.3)));
      return odometry.pose.distanceTo(sim.truePose);
    };
    expect(run(7)).toBeGreaterThan(0.005);
    expect(run(7)).toBe(run(7));
  });

  it("does not move while lifted, but the wheels keep turning", () => {
    const sim = makeSimulation();
    sim.setCondition("lifted");
    const start = sim.truePose;
    let feedback = sim.step(drive(0.3, 0));
    for (let i = 0; i < 100; i++) feedback = sim.step(drive(0.3, 0));
    expect(sim.truePose.distanceTo(start)).toBe(0);
    expect(feedback.leftWheelAngleInRad).toBeGreaterThan(1);
  });
});
