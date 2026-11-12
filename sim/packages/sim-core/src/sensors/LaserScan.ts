/** Same layout as the PLC's LaserScan. A range of 0 means no return. */
export interface LaserScan {
  sequence: number;
  startTimestampInNs: number;
  scanDurationInS: number;
  angleMinInRad: number;
  angleIncrementInRad: number;
  rangesInM: Float32Array;
}
