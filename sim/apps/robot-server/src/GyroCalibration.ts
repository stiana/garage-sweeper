import { normalizeAngle } from "@garage/sim-core";
import type { GyroCalibrationResult } from "@garage/gui-protocol";
import { SPIN_PHASES } from "./TestRoute";

export interface HeadingSample {
  id: string;
  label: string;
  thetaInRad: number;
}

/**
 * Measures how far each estimate believes the robot turned during the spin route,
 * against how far it really turned. The true turn divided by the estimated turn is
 * the factor to multiply the gyro scale by.
 *
 * Headings are kept as running totals ("unwrapped"), since ten turns pass +-180 deg
 * many times. Samples must come often enough that the robot turns less than half a
 * turn between two of them.
 */
export class GyroCalibration {
  private readonly tracks = new Map<string, Track>();
  private trueTrack: Track | null = null;

  /** Takes the headings elapsedInS into the spin route. */
  sample(elapsedInS: number, trueThetaInRad: number, estimates: HeadingSample[]): void {
    this.trueTrack = advance(this.trueTrack, elapsedInS, trueThetaInRad, "", "");
    for (const estimate of estimates) {
      this.tracks.set(estimate.id, advance(this.tracks.get(estimate.id) ?? null, elapsedInS, estimate.thetaInRad, estimate.id, estimate.label));
    }
  }

  results(): GyroCalibrationResult[] {
    const truth = this.trueTrack;
    if (!truth) return [];
    const trueCcw = turn(truth, "counterClockwise");
    const trueCw = turn(truth, "clockwise");
    return [...this.tracks.values()].map((track) => {
      const counterClockwiseFactor = trueCcw / turn(track, "counterClockwise");
      const clockwiseFactor = trueCw / turn(track, "clockwise");
      return {
        id: track.id,
        label: track.label,
        trueTurnInDeg: ((trueCcw + trueCw) / 2) * (180 / Math.PI),
        counterClockwiseFactor,
        clockwiseFactor,
        factor: (counterClockwiseFactor + clockwiseFactor) / 2,
      };
    });
  }
}

interface Track {
  id: string;
  label: string;
  totalInRad: number;
  lastThetaInRad: number;
  /** The running total when each part of the route began. */
  atCounterClockwiseStart: number | null;
  atClockwiseStart: number | null;
  atEnd: number | null;
}

function advance(track: Track | null, elapsedInS: number, thetaInRad: number, id: string, label: string): Track {
  const next: Track = track
    ? { ...track, totalInRad: track.totalInRad + normalizeAngle(thetaInRad - track.lastThetaInRad), lastThetaInRad: thetaInRad }
    : { id, label, totalInRad: 0, lastThetaInRad: thetaInRad, atCounterClockwiseStart: null, atClockwiseStart: null, atEnd: null };
  if (next.atCounterClockwiseStart === null && elapsedInS >= SPIN_PHASES.counterClockwiseStartInS) next.atCounterClockwiseStart = next.totalInRad;
  if (next.atClockwiseStart === null && elapsedInS >= SPIN_PHASES.clockwiseStartInS) next.atClockwiseStart = next.totalInRad;
  if (next.atEnd === null && elapsedInS >= SPIN_PHASES.endInS) next.atEnd = next.totalInRad;
  return next;
}

/** How far a track turned in one direction: counter-clockwise positive, clockwise as a positive number too. */
function turn(track: Track, direction: "counterClockwise" | "clockwise"): number {
  const end = track.atEnd ?? track.totalInRad;
  const ccwStart = track.atCounterClockwiseStart ?? 0;
  const cwStart = track.atClockwiseStart ?? end;
  return direction === "counterClockwise" ? cwStart - ccwStart : cwStart - end;
}
