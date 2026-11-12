import type { Pose2D } from "../math/Pose2D";
import type { LaserScan } from "../sensors/LaserScan";
import type { RobotFeedback } from "../simulation/RobotIo";

export interface PoseEstimate {
  id: string;
  label: string;
  pose: Pose2D;
}

/** Everything the GUI draws, whatever the data comes from. */
export interface RobotView {
  /** Known only in the simulator. */
  truePose: Pose2D | null;
  estimates: PoseEstimate[];
  /** The last full scan, with where the robot really was and where it believed it was when the scan ended. */
  lastScan: { scan: LaserScan; truePose: Pose2D; estimatedPose: Pose2D } | null;
  feedback: RobotFeedback | null;
  timeInS: number;
}

/**
 * Where the GUI gets the robot from. SimulationSource today; LiveRobotSource
 * (ADS against the real PLC) later, with the same GUI on top.
 */
export interface RobotSource {
  readonly kind: "simulation" | "live";
  update(realDeltaTimeInS: number): void;
  readonly view: RobotView;
}
