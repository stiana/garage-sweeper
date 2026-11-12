import {
  DeadReckoning,
  type LaserScan,
  type Pose2D,
  type RobotController,
  type RobotFeedback,
  STEP_IN_S,
  STOPPED_COMMAND,
  Simulation,
} from "@garage/sim-core";
import { HitMap } from "./HitMap";
import type { RobotSource, RobotView } from "./RobotSource";

export interface ErrorSample {
  timeInS: number;
  wheelsErrorInM: number;
  gyroErrorInM: number;
}

const HISTORY_INTERVAL_IN_S = 0.25;
const HISTORY_LENGTH = 240;
const MAX_FRAME_IN_S = 0.1;

/** Runs the simulator in the browser and drives it with a controller. */
export class SimulationSource implements RobotSource {
  readonly kind = "simulation" as const;
  readonly hitMap = new HitMap();
  readonly history: ErrorSample[] = [];
  speedFactor = 1;
  isPaused = false;
  scanCount = 0;
  collisionCount = 0;
  private readonly wheelOdometry: DeadReckoning;
  private readonly gyroOdometry: DeadReckoning;
  private budgetInS = 0;
  private lastFeedback: RobotFeedback | null = null;
  private lastScan: { scan: LaserScan; pose: Pose2D } | null = null;
  private nextHistoryInS = 0;
  private wasColliding = false;

  constructor(readonly simulation: Simulation, private readonly controller: RobotController) {
    this.wheelOdometry = new DeadReckoning(simulation.geometry, simulation.truePose, "wheels");
    this.gyroOdometry = new DeadReckoning(simulation.geometry, simulation.truePose, "gyro");
    this.restart();
  }

  get view(): RobotView {
    return {
      truePose: this.simulation.truePose,
      estimates: [
        { id: "wheels", label: "Odometri, kun hjul", pose: this.wheelOdometry.pose },
        { id: "gyro", label: "Odometri, hjul + gyro", pose: this.gyroOdometry.pose },
      ],
      lastScan: this.lastScan,
      feedback: this.lastFeedback,
      timeInS: this.simulation.timeInS,
    };
  }

  /** Starts over from the world's start pose, keeping the world and settings. */
  restart(seed?: number): void {
    this.simulation.reset(seed);
    this.realign();
    this.hitMap.clear();
    this.history.length = 0;
    this.nextHistoryInS = 0;
    this.scanCount = 0;
    this.collisionCount = 0;
    this.lastScan = null;
    this.budgetInS = 0;
    this.feed(this.simulation.step(STOPPED_COMMAND));
  }

  /** Puts the odometry estimates back on the true pose, as if the robot had been told where it is. */
  realign(): void {
    this.wheelOdometry.reset(this.simulation.truePose);
    this.gyroOdometry.reset(this.simulation.truePose);
  }

  update(realDeltaTimeInS: number): void {
    if (this.isPaused) return;
    this.budgetInS += Math.min(realDeltaTimeInS, MAX_FRAME_IN_S) * this.speedFactor;
    while (this.budgetInS >= STEP_IN_S) {
      this.stepOnce();
      this.budgetInS -= STEP_IN_S;
    }
  }

  stepOnce(): void {
    const command = this.lastFeedback ? this.controller.exchange(this.lastFeedback) : STOPPED_COMMAND;
    this.feed(this.simulation.step(command));
  }

  private feed(feedback: RobotFeedback): void {
    this.lastFeedback = feedback;
    this.wheelOdometry.update(feedback);
    this.gyroOdometry.update(feedback);
    if (feedback.collided && !this.wasColliding) this.collisionCount++;
    this.wasColliding = feedback.collided;
    if (feedback.scan) {
      this.scanCount++;
      this.lastScan = { scan: feedback.scan, pose: this.gyroOdometry.pose };
      this.hitMap.integrate(feedback.scan, this.gyroOdometry.pose);
    }
    if (this.simulation.timeInS >= this.nextHistoryInS) {
      this.nextHistoryInS += HISTORY_INTERVAL_IN_S;
      this.history.push({
        timeInS: this.simulation.timeInS,
        wheelsErrorInM: this.wheelOdometry.pose.distanceTo(feedback.truePose),
        gyroErrorInM: this.gyroOdometry.pose.distanceTo(feedback.truePose),
      });
      if (this.history.length > HISTORY_LENGTH) this.history.shift();
    }
  }
}
