import { type BodyCondition, type Pose2D, Simulation, SimulationSource, World, type WorldDefinition } from "@garage/sim-core";
import { lidarProfiles, noiseProfiles, robotGeometry } from "../configs";
import type { KeyboardController } from "../input/KeyboardController";
import type { Backend, Telemetry } from "./Backend";

/** Runs the simulator in this browser tab, driven straight from the keyboard. No PLC. */
export class LocalBackend implements Backend {
  readonly mode = "local" as const;
  readonly world: World;
  readonly plc = null;
  readonly canPause = true;
  readonly canRunTestRoute = false;
  private readonly simulation: Simulation;
  private readonly source: SimulationSource;
  onWorldReplaced = () => {};
  onConnectionChanged = (_message: string) => {};
  onTestRoute = () => {};

  constructor(definition: WorldDefinition, controller: KeyboardController) {
    this.world = new World(definition);
    this.simulation = new Simulation({
      world: this.world,
      geometry: robotGeometry,
      noise: noiseProfiles.realistic!,
      lidarProfile: lidarProfiles["rplidar-s2e"]!,
      seed: 42,
    });
    this.source = new SimulationSource(this.simulation, controller);
  }

  get view() { return this.source.view; }
  get hitMap() { return this.source.hitMap; }
  get history() { return this.source.history; }
  get isPaused() { return this.source.isPaused; }
  set isPaused(value: boolean) { this.source.isPaused = value; }
  get speedFactor() { return this.source.speedFactor; }
  set speedFactor(value: number) { this.source.speedFactor = value; }

  get telemetry(): Telemetry {
    const feedback = this.source.view.feedback;
    return {
      yawRateInRadPerS: feedback?.angularRateInRadPerS.z ?? 0,
      accelerationInMPerS2: feedback
        ? [feedback.accelerationInMPerS2.x, feedback.accelerationInMPerS2.y, feedback.accelerationInMPerS2.z]
        : [0, 0, 0],
      collided: feedback?.collided ?? false,
      scanCount: this.source.scanCount,
      collisionCount: this.source.collisionCount,
      isLidarSignalLost: this.simulation.faults.isLidarSignalLost,
      isGyroFrozen: this.simulation.faults.isGyroFrozen,
      condition: this.simulation.condition,
    };
  }

  update(realDeltaTimeInS: number): void { this.source.update(realDeltaTimeInS); }
  stepOnce(): void { this.source.stepOnce(); }
  restart(seed?: number): void { this.source.restart(seed); }
  realign(): void { this.source.realign(); }

  loadWorld(definition: WorldDefinition): void {
    this.world.replace(definition);
    this.source.restart();
  }

  setNoise(id: string): void {
    const profile = noiseProfiles[id];
    if (profile) this.simulation.setNoise(profile);
  }

  setLidar(id: string): void {
    const profile = lidarProfiles[id];
    if (profile) this.simulation.setLidarProfile(profile);
  }

  setFaults(isLidarSignalLost: boolean, isGyroFrozen: boolean): void {
    this.simulation.faults.isLidarSignalLost = isLidarSignalLost;
    this.simulation.faults.isGyroFrozen = isGyroFrozen;
  }

  setCondition(condition: BodyCondition): void { this.simulation.setCondition(condition); }
  kidnap(pose: Pose2D): void { this.simulation.kidnap(pose); }
  sendHmi(): void {}
  toggleTestRoute(): void {}
}
